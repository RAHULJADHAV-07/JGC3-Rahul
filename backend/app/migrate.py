"""Additive schema migrations run at startup.

`Base.metadata.create_all` creates missing *tables* but never missing
*columns*, so a deployed database would keep the old shape after a model
gains a field. This walks the models, compares them against the live
columns and issues `ALTER TABLE … ADD COLUMN` for whatever is absent.

Additive only — nothing is dropped, renamed or retyped, so it is safe to run
on every boot and safe to run twice. Anything beyond adding a column (a real
type change, a backfill with logic) belongs in Alembic.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateColumn

from .database import Base, engine

log = logging.getLogger(__name__)

# Columns the ORM defaults for, but which existing rows must be given a value
# for too — otherwise old rows read back as NULL and the calculations see None.
BACKFILL = {
    "items": {
        "pack_unit": "0",
        "sticker_mult": "1.1",
        "sticker_round": "false",
        "stickers_fixed": "0",
        "label_spoilage": "1.0",
        "sticker_rule": "'pp'",
        "uom": "'PCS'",
        "source_sheet": "''",
        # Every item in the master travelled in cartons before packaging types
        # existed, so that is what the existing rows are given.
        "packaging_type": "'Cartons'",
    },
    # Accounts that pre-date email verification start out unverified — their
    # owner proves the address on the next sign-in, exactly like a new user.
    #
    # token_version starts at 1 rather than NULL so the claim comparison has
    # something to match; every session issued before the column existed is
    # rejected once, which is the intended effect of turning revocation on.
    # The lockout counters start clean — nobody is locked out by an upgrade.
    "users": {
        "email_verified": "false",
        "otp_attempts": "0",
        "token_version": "1",
        "failed_attempts": "0",
        "hard_locked": "false",
        "must_change_password": "false",
    },
    "suppliers": {"addr": "''", "pin": "''", "state": "''", "your_reference": "''"},
    "buyers": {
        "our_reference": "''", "tagline": "''", "ac_code": "''", "abn": "''", "acn": "''",
        "tel": "''", "fax": "''", "web": "''", "email": "''", "po_box": "''", "logo": "''",
    },
    "transports": {"supplier_ids": None},   # JSON — leave NULL, read as []
    # buyers.ports is JSON too — NULL reads back as [] (schemas.BuyerBase).
    # suppliers.gst_pct is deliberately absent: NULL means "not set", and the
    # documents then use the rate the HSN code implies, exactly as before.
    # users.first_name / last_name are split out of `name` in Python below.
    # invoice_lines.position is filled in Python below, in the order the lines
    # have always been read back in.
    # po_lines price columns are deliberately absent: NULL is meaningful there
    # ("no snapshot — read the item master"), so they must not be backfilled.
    # users.password_history is JSON — leave NULL, which reads back as [].
}

# The one thing this module removes rather than adds.
#
# `users.password_enc` held a reversible copy of every password, so an admin
# could read one back. It is gone: the column is dropped here, and the reveal
# endpoint with it. Until the column goes, a database dump stays a plaintext
# credential dump for anyone who also has the key — so this runs on every
# boot, not once, and stays in place long after the last deployment has done
# it. Dropping a column that no longer exists is not an error.
DROPPED_COLUMNS = {"users": ["password_enc"]}


def _drop_retired_columns(conn, insp, live_tables: set[str]) -> list[str]:
    dropped: list[str] = []
    for table, columns in DROPPED_COLUMNS.items():
        if table not in live_tables:
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        for name in columns:
            if name not in have:
                continue
            # SQLite gained DROP COLUMN in 3.35; on anything older this raises
            # and the boot should not fail over it, so the error is logged and
            # the column stays until the database is upgraded.
            try:
                conn.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{name}"'))
                dropped.append(f"{table}.{name}")
            except Exception:  # noqa: BLE001 — an un-droppable column must not stop the app
                log.exception("could not drop retired column %s.%s", table, name)
    return dropped


def _backfill_user_names(conn) -> int:
    """Split the one-box `name` of accounts made before first/last name existed.

    The first word becomes the first name and the rest the last name — the
    same split the top bar would otherwise have to guess at on every page.
    """
    rows = conn.execute(text(
        'SELECT id, name FROM users WHERE first_name IS NULL OR last_name IS NULL'
    )).all()
    for uid, name in rows:
        parts = str(name or "").strip().split()
        conn.execute(
            text('UPDATE users SET first_name = :f, last_name = :l WHERE id = :id'),
            {"f": parts[0] if parts else "", "l": " ".join(parts[1:]), "id": uid},
        )
    return len(rows)


# The column each database keeps rows in physical order by — what an
# un-ordered SELECT hands back, and so the order invoice lines were displayed,
# numbered and printed in before `position` existed.
_PHYSICAL_ORDER = {"postgresql": "ctid", "sqlite": "rowid"}


def _backfill_line_positions(conn, dialect_name: str) -> int:
    """Give every invoice line without a `position` the place it already had.

    Carton serial numbers run down an invoice's lines in order, and until now
    that order was whatever the database returned. Shipped paperwork was
    printed in that order, so it is frozen exactly as it stood — nothing about
    an existing invoice's serial ranges moves. Only new invoices are written in
    the item sequence.
    """
    phys = _PHYSICAL_ORDER.get(dialect_name)
    tail = f", {phys}" if phys else ""
    invoices = [r[0] for r in conn.execute(text(
        'SELECT DISTINCT invoice_id FROM invoice_lines WHERE "position" IS NULL'
    ))]
    done = 0
    for inv_id in invoices:
        ids = [r[0] for r in conn.execute(text(
            'SELECT id FROM invoice_lines WHERE invoice_id = :i '
            f'ORDER BY CASE WHEN "position" IS NULL THEN 1 ELSE 0 END, "position"{tail}'
        ), {"i": inv_id})]
        for pos, lid in enumerate(ids):
            conn.execute(text('UPDATE invoice_lines SET "position" = :p WHERE id = :id'),
                         {"p": pos, "id": lid})
        done += len(ids)
    return done


def run_migrations() -> list[str]:
    """Add every model column the database is missing. Returns what it did."""
    applied: list[str] = []
    insp = inspect(engine)
    live_tables = set(insp.get_table_names())
    dialect = engine.dialect

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in live_tables:
                continue                      # create_all will make it whole
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                # Added nullable, always: a NOT NULL column cannot be bolted
                # onto a table that already has rows without a server default,
                # and the ORM fills the value on every write anyway.
                ddl = str(CreateColumn(col).compile(dialect=dialect)).replace(" NOT NULL", "")
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}'))
                applied.append(f"{table.name}.{col.name}")

                default = BACKFILL.get(table.name, {}).get(col.name)
                if default is not None:
                    conn.execute(text(
                        f'UPDATE "{table.name}" SET "{col.name}" = {default} '
                        f'WHERE "{col.name}" IS NULL'
                    ))

        dropped = _drop_retired_columns(conn, insp, live_tables)

        # Value backfills that need more than a constant. Each one only touches
        # rows still missing the value, so a second boot does nothing.
        if "users" in live_tables:
            named = _backfill_user_names(conn)
            if named:
                applied.append(f"users.first_name/last_name×{named}")
        if "invoice_lines" in live_tables:
            placed = _backfill_line_positions(conn, dialect.name)
            if placed:
                applied.append(f"invoice_lines.position×{placed}")

    if applied:
        log.info("schema migration added: %s", ", ".join(applied))
    if dropped:
        log.warning("schema migration dropped: %s", ", ".join(dropped))
    return applied + [f"-{d}" for d in dropped]
