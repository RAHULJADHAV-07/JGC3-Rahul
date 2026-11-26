"""Dated prices — what Other Reports → Price list keeps (V-7.9.0).

Two lists share one history (models.PriceVersion):

  supplier   the purchase price (₹) and FOB ($) of every item, with its basis.
             The newest one in force is what the item master carries, so
             Setup, the documents and every screen read it as before.
  buyer      what one buyer is sold at: the supplier's price marked up by a
             margin, or figures typed for that buyer. With no buyer price an
             order is placed at the supplier's FOB, exactly as before.

Every save names the date its prices hold from. An order is placed at the
prices in force on the order's own date, so a price agreed in April and typed
in in June still prices an order back-dated to May, and an order back-dated to
March keeps March's. Nothing already on the book moves: each order line and
invoice line keeps the price it was placed or invoiced at (`freeze_snapshots`
first makes that true of the oldest lines, which kept no copy of their own).
"""
import math
from datetime import datetime

from sqlalchemy import bindparam, text

from . import models
from .timeutil import local_date

FIELDS = ("unit_value", "value_mode", "unit_fob100", "fob_mode")
BASES = ("piece", "100", "custom")


def today_iso() -> str:
    return local_date(datetime.utcnow()).isoformat()


def round_to(x: float, places: int) -> float:
    """Half up, to `places` decimals — the same arithmetic the browser does
    (lib/prices.js · roundTo), so a margin worked out on screen is the figure
    that saves."""
    f = 10 ** places
    return math.floor(float(x or 0) * f + 0.5 + 1e-9) / f


def marked_up(base: dict, margin_pct: float) -> dict:
    """The supplier's price on a day, plus `margin_pct` percent — ₹ to the
    paisa, $ to four places, as the item form takes them."""
    k = 1 + float(margin_pct or 0) / 100
    return {
        "unit_value": round_to(base["unit_value"] * k, 2),
        "value_mode": base["value_mode"],
        "unit_fob100": round_to(base["unit_fob100"] * k, 4),
        "fob_mode": base["fob_mode"],
    }


def master_prices(item) -> dict:
    return {
        "unit_value": float(item.unit_value or 0),
        "value_mode": item.value_mode or "piece",
        "unit_fob100": float(item.unit_fob100 or 0),
        "fob_mode": item.fob_mode or "100",
    }


def _of(v, fallback: dict | None = None) -> dict:
    fb = fallback or {"unit_value": 0.0, "value_mode": "piece", "unit_fob100": 0.0, "fob_mode": "100"}
    return {
        "unit_value": fb["unit_value"] if v.unit_value is None else float(v.unit_value),
        "value_mode": v.value_mode or fb["value_mode"],
        "unit_fob100": fb["unit_fob100"] if v.unit_fob100 is None else float(v.unit_fob100),
        "fob_mode": v.fob_mode or fb["fob_mode"],
    }


def _key(v):
    return (v.effective or "", v.created_at or datetime.min, v.id or "")


def pick(versions, on: str | None = None):
    """The version in force on `on` (an ISO date): the latest active one dated
    on or before it. `None` asks for the newest of all."""
    best = None
    for v in versions:
        if not v.active or (on is not None and (v.effective or "") > on):
            continue
        if best is None or _key(v) > _key(best):
            best = v
    return best


def supplier_price(item, versions, on: str | None = None) -> dict:
    """The purchase price and FOB of `item` on `on`. An item never revised
    has no versions and reads its master, whatever the date."""
    v = pick(versions, on)
    return _of(v, master_prices(item)) if v is not None else master_prices(item)


def buyer_price(item, sup_versions, buyer_versions, on: str | None = None) -> dict | None:
    """What the buyer is sold `item` at on `on` — None when no buyer price is
    in force (the order then takes the supplier's FOB)."""
    v = pick(buyer_versions, on)
    if v is None or v.mode == "none":
        return None
    base = supplier_price(item, sup_versions, on)
    if v.mode == "manual":
        return _of(v, base)
    return marked_up(base, v.margin_pct)


def _load(db, scope: str, item_ids, buyer_id: str | None = None) -> dict:
    ids = list({i for i in item_ids if i})
    if not ids:
        return {}
    q = db.query(models.PriceVersion).filter(models.PriceVersion.scope == scope,
                                             models.PriceVersion.item_id.in_(ids))
    if scope == "buyer":
        q = q.filter(models.PriceVersion.buyer_id == buyer_id)
    out: dict = {}
    for v in q.all():
        out.setdefault(v.item_id, []).append(v)
    return out


def order_prices(db, items_by_id: dict, buyer_id: str | None, on: str) -> dict:
    """item id → the four prices an order line dated `on` for `buyer_id` is
    placed at: the supplier's purchase price, and the buyer's FOB where the
    buyer has one (else the supplier's). Two queries, whatever the count."""
    ids = list(items_by_id)
    sup = _load(db, "supplier", ids)
    buy = _load(db, "buyer", ids, buyer_id) if buyer_id else {}
    out = {}
    for iid, it in items_by_id.items():
        s = supplier_price(it, sup.get(iid, []), on)
        b = buyer_price(it, sup.get(iid, []), buy.get(iid, []), on) if buyer_id else None
        out[iid] = {
            "unit_value": s["unit_value"], "value_mode": s["value_mode"],
            "unit_fob100": b["unit_fob100"] if b else s["unit_fob100"],
            "fob_mode": b["fob_mode"] if b else s["fob_mode"],
        }
    return out


def differs(target: dict, snapshot) -> bool:
    """True when a line's agreed prices are not `target` (calc.prices_of reads
    the snapshot the way the documents do)."""
    get = (lambda f: snapshot.get(f)) if isinstance(snapshot, dict) else (lambda f: getattr(snapshot, f, None))
    uv, uf = get("unit_value"), get("unit_fob100")
    return (
        uv is None or abs(float(uv) - target["unit_value"]) > 1e-9
        or uf is None or abs(float(uf) - target["unit_fob100"]) > 1e-9
        or (get("value_mode") or "piece") != target["value_mode"]
        or (get("fob_mode") or "100") != target["fob_mode"]
    )


# ---------------------------------------------------------------------------
# Keeping what is already on the book where it is
# ---------------------------------------------------------------------------
def freeze_snapshots(db, item_ids) -> None:
    """Before an item master price moves: give every order line and invoice
    line of these items that kept no price of its own (rows from before the
    snapshot columns, which read the master) the figures it reads today.

    Without this an invoice raised in 2025 would quietly reprint at the new
    price. One statement per table, whatever the number of items."""
    ids = list({i for i in item_ids if i})
    if not ids:
        return
    for table in ("po_lines", "invoice_lines"):
        sub = lambda col: f"(SELECT i.{col} FROM items i WHERE i.id = {table}.item_id)"  # noqa: E731
        stmt = text(f"""
            UPDATE {table} SET
              unit_value = CASE WHEN unit_value IS NULL THEN COALESCE({sub('unit_value')}, 0) ELSE unit_value END,
              value_mode = CASE WHEN value_mode IS NULL OR value_mode = ''
                                THEN COALESCE(NULLIF({sub('value_mode')}, ''), 'piece') ELSE value_mode END,
              unit_fob100 = CASE WHEN unit_fob100 IS NULL THEN COALESCE({sub('unit_fob100')}, 0) ELSE unit_fob100 END,
              fob_mode = CASE WHEN fob_mode IS NULL OR fob_mode = ''
                              THEN COALESCE(NULLIF({sub('fob_mode')}, ''), '100') ELSE fob_mode END
            WHERE item_id IN :ids
              AND (unit_value IS NULL OR value_mode IS NULL OR value_mode = ''
                   OR unit_fob100 IS NULL OR fob_mode IS NULL OR fob_mode = '')
        """).bindparams(bindparam("ids", expanding=True))
        db.execute(stmt, {"ids": ids})


def ensure_baselines(db, items: list, versions_by_item: dict, who: str = "") -> None:
    """An item's first revision is preceded by what the master said until then,
    so "go back" can always reach the original figures."""
    now = datetime.utcnow()
    for it in items:
        if versions_by_item.get(it.id):
            continue
        p = master_prices(it)
        v = models.PriceVersion(
            scope="supplier", item_id=it.id, effective="", mode="baseline", active=True,
            created_at=it.price_set_at or now, created_by=who or "Item master",
            **p,
        )
        db.add(v)
        versions_by_item[it.id] = [v]


def refresh_masters(db, item_ids) -> None:
    """Write the supplier price now in force back onto the item master — one
    statement, whatever the number of items (each query is a round trip to
    the hosted database)."""
    ids = list({i for i in item_ids if i})
    if not ids:
        return
    db.flush()
    pick_sql = ("(SELECT v.{col} FROM price_versions v WHERE v.item_id = items.id AND v.scope = 'supplier' "
                "AND v.active = :yes ORDER BY v.effective DESC, v.created_at DESC, v.id DESC LIMIT 1)")
    cols = {c: pick_sql.format(col=c) for c in FIELDS}
    cols["price_from"] = pick_sql.format(col="effective")
    cols["price_set_at"] = pick_sql.format(col="created_at")
    sets = ",\n".join(f"{c} = {s}" for c, s in cols.items() if c not in ("price_from", "price_set_at"))
    # The baseline holds no date of its own: back to it, the item reads as
    # never revised.
    sets += (f",\nprice_from = NULLIF({cols['price_from']}, '')"
             f",\nprice_set_at = CASE WHEN {pick_sql.format(col='mode')} = 'baseline' THEN NULL ELSE {cols['price_set_at']} END")
    stmt = text(f"""
        UPDATE items SET {sets}
        WHERE id IN :ids AND EXISTS (SELECT 1 FROM price_versions v WHERE v.item_id = items.id
                                     AND v.scope = 'supplier' AND v.active = :yes)
    """).bindparams(bindparam("ids", expanding=True))
    db.execute(stmt, {"ids": ids, "yes": True})
    db.expire_all()


def record_setup_change(db, item, before: dict, after: dict, since: str, who: str) -> None:
    """A price changed in Setup → Items is a revision too, holding from
    `since`, so the price list and its history never disagree with the
    master — which then reads whatever is in force (refresh_masters)."""
    versions = _load(db, "supplier", [item.id]).get(item.id, [])
    if not versions:
        db.add(models.PriceVersion(
            scope="supplier", item_id=item.id, effective="", mode="baseline", active=True,
            created_at=item.price_set_at or datetime.utcnow(), created_by="Item master", **before,
        ))
    now = datetime.utcnow()
    rev = models.PriceRevision(scope="supplier", effective=since, note="Setup → Items",
                               created_at=now, created_by=who)
    db.add(rev)
    db.flush()
    db.add(models.PriceVersion(
        revision_id=rev.id, scope="supplier", item_id=item.id, effective=since, mode="set", active=True,
        created_at=now, created_by=who, **after,
    ))
    refresh_masters(db, [item.id])
