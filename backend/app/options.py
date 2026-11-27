"""Setup → Additional settings — the short lists the shipment forms pick from.

Five of them are plain lists of words (terms of delivery, packaging types,
terms of payment, ports of loading, ports a buyer is shipped to) and one is a
list of records (the bank accounts export proceeds are routed through). All
of them live in the `settings` table, one key each, because they are a few
dozen short strings the client edits in the UI — not something worth a table
and a migration apiece.

A few more keys sit here for the same reason: the item master's column layout
(which columns Setup → Items shows, and therefore which item fields the
reports and downloads carry), the item sequence every list is sorted in, and
the item groups that split a range into blocks of its own. Those two follow
the suppliers: one added under Setup → Suppliers joins the sequence as a range
of its own, and one removed drops out of both.

A list nobody has saved yet is not empty: it is offered pre-filled from the
values the shipments already use, so the first dropdown anybody opens carries
the terms and ports already typed on the existing invoices.
"""
from __future__ import annotations

import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import calc, models

# key -> (label, the value offered when nothing has been saved and nothing is in use yet)
LISTS: dict[str, tuple[str, list[str]]] = {
    "terms_delivery": ("Terms of delivery", ["FOB MUMBAI"]),
    "packaging_types": ("Packaging types", ["Cartons"]),
    "terms_payment": ("Terms of payment", ["D.P.SIGHT DRAFT"]),
    "ports_loading": ("Port of loading", ["NHAVA SHEVA-MUMBAI (INDIA)"]),
    "ports_ship_to": ("Ship to port", []),
    # The Group an item belongs to (Setup → Items → Group): 15 MM (1/2"),
    # PP Moulded, GRN Range, HYDRO TUBES … (V-7.10.2). Offered as a dropdown
    # on the item form; a renamed group follows onto every item in it.
    "groups": ("Groups", []),
}

BANKS_KEY = "banks"
COLUMNS_KEY = "item_columns"
DOC_COLUMNS_KEY = "doc_columns"
SEQUENCE_KEY = "item_sequence"
GROUPS_KEY = "item_groups"
PACK_RULE_KEY = "packaging_rule"

MAX_ENTRIES = 200
MAX_TEXT = 200

# Indian Financial System Code: four letters (the bank), a zero, six letters or
# digits (the branch).
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def _rows(db: Session) -> dict:
    """Every settings row, read once per request (session) and kept: a page
    asks for half a dozen keys at once, and each separate read is a round trip
    to a database that can be a third of a second away."""
    if "settings_rows" not in db.info:
        db.info["settings_rows"] = {r.key: r for r in db.query(models.Setting).all()}
    return db.info["settings_rows"]


def _row(db: Session, key: str):
    return _rows(db).get(key)


def _save(db: Session, key: str, value) -> None:
    row = _row(db, key)
    if row:
        row.value = value
    else:
        row = models.Setting(key=key, value=value)
        db.add(row)
        _rows(db)[key] = row
    db.commit()


def _suppliers(db: Session) -> list:
    """The suppliers, read once per request: the sequence, the groups and the
    sort key all need them."""
    if "option_suppliers" not in db.info:
        db.info["option_suppliers"] = db.query(models.Supplier).all()
    return db.info["option_suppliers"]


def _ranges(db: Session) -> list[str]:
    """Every range there is: the known ones, then each supplier's own."""
    return list(calc.DEFAULT_SEQUENCE) + calc.supplier_ranges(_suppliers(db))


def _sources(db: Session) -> tuple:
    """The invoices and buyers the unsaved lists are pre-filled from — read
    once for all of them rather than once a list."""
    if "option_sources" not in db.info:
        db.info["option_sources"] = (
            db.query(models.Invoice).order_by(models.Invoice.date).all(),
            db.query(models.Buyer).all(),
        )
    return db.info["option_sources"]


def clean_list(values) -> list[str]:
    """Trimmed, de-duplicated (case-insensitively, first spelling wins), with
    blanks dropped — the same list however carelessly it was typed."""
    out, seen = [], set()
    for v in values or []:
        text = re.sub(r"\s+", " ", str(v or "")).strip()[:MAX_TEXT]
        if not text or text.lower() in seen:
            continue
        seen.add(text.lower())
        out.append(text)
    return out[:MAX_ENTRIES]


def _in_use(db: Session, key: str) -> list[str]:
    """The values already typed on shipments (and buyers / items), for a list
    that has never been saved."""
    ship_field = SHIP_FIELDS.get(key)
    found: list[str] = []
    invoices, buyers = _sources(db) if ship_field else ([], [])
    for inv in invoices:
        v = (inv.ship or {}).get(ship_field)
        if v:
            found.append(v)
    if key == "ports_ship_to":
        found += [b.ship_to for b in buyers if b.ship_to]
        for b in buyers:
            found += list(b.ports or [])
    if key == "packaging_types":
        found += [i[0] for i in db.query(models.Item.packaging_type).distinct().all() if i[0]]
    if key == "groups":
        found += sorted({i[0] for i in db.query(models.Item.group).distinct().all() if i[0] and str(i[0]).strip()},
                        key=group_sort_key)
    return found


def group_sort_key(name: str):
    """Size bands by their millimetres (15 MM before 100 MM), then the rest
    alphabetically — how the client's own pivot lists them."""
    m = re.match(r"\s*(\d+(?:\.\d+)?)\s*MM\b", str(name or ""), re.I)
    return (0, float(m.group(1)), str(name).lower()) if m else (1, 0.0, str(name or "").lower())


def get_list(db: Session, key: str) -> list[str]:
    row = _row(db, key)
    if row is not None:
        return clean_list((row.value or {}).get("values", []))
    _, fallback = LISTS[key]
    return clean_list(fallback + _in_use(db, key))


# ---------- the mode of transport each entry serves ----------
# A port of loading, a ship-to port and a term of delivery each serve one or
# more modes — Sahar Air Cargo is an airport, Nhava Sheva a sea port — so a
# shipment offers only the entries ticked for its own mode. Stored beside the
# values as { entry: ["air", "water", …] }. An entry with nothing stored was
# added before modes existed; it reads as sea (what every shipment until now
# was) and Setup flags it so its modes can be confirmed.
MODE_LISTS = ("terms_delivery", "ports_loading", "ports_ship_to")


def clean_modes(modes, values: list[str]) -> dict[str, list[str]]:
    """{entry: [mode, …]} for the entries on the list only, in their own
    spelling, each a set of known modes in a fixed order. An empty set is
    dropped — the entry is then unconfirmed, not unusable."""
    canon = {v.lower(): v for v in values}
    out: dict[str, list[str]] = {}
    for k, ms in (modes or {}).items() if isinstance(modes, dict) else []:
        name = canon.get(re.sub(r"\s+", " ", str(k or "")).strip().lower())
        if not name or not isinstance(ms, (list, tuple)):
            continue
        picked = {str(m or "").strip().lower() for m in ms}
        kept = [m for m in calc.SHIP_MODES if m in picked]
        if kept:
            out[name] = kept
    return out


def get_modes(db: Session, key: str) -> dict[str, list[str]]:
    if key not in MODE_LISTS:
        return {}
    row = _row(db, key)
    return clean_modes((row.value or {}).get("modes") if row else None, get_list(db, key))


# The field of an invoice's `ship` block each list fills in.
SHIP_FIELDS = {"terms_delivery": "terms", "terms_payment": "payment",
               "ports_loading": "pol", "ports_ship_to": "pod"}


def _open_invoices(db: Session) -> list:
    """The invoices whose papers may still change. A shipped one is history:
    its customs and bank documents went out with what they say now."""
    return [i for i in db.query(models.Invoice).all() if calc.invoice_status(i) != "Shipped"]


def _carry(db: Session, key: str, before: list[str], kept: list[str], renames: dict) -> None:
    """A list entry is copied onto what picked it, so correcting or removing it
    has to reach those copies — or the buyer keeps offering a port that is gone
    and the open invoice shows its term as "not on the list".

    A renamed entry follows onto buyers, items and open invoices. A removed port
    comes off the buyers it was on. What an invoice already picked is left when
    an entry is merely removed — the form still shows it and saves it."""
    now = {v.lower() for v in kept}
    renamed = {str(a).lower(): str(b) for a, b in (renames or {}).items()
               if a and b and str(b).lower() in now and str(a) != str(b)}
    gone = {v.lower() for v in before} - now - set(renamed)
    if not renamed and not gone:
        return
    if key == "ports_ship_to":
        for b in db.query(models.Buyer).all():
            ports = clean_list(renamed.get(p.lower(), p) for p in (b.ports or []) if p.lower() not in gone)
            ship_to = str(b.ship_to or "")
            if ship_to.lower() in renamed:
                ship_to = renamed[ship_to.lower()]
            elif ship_to.lower() in gone and ports:
                ship_to = ports[0]
            if ports != list(b.ports or []) or ship_to != (b.ship_to or ""):
                b.ports, b.ship_to = ports, ship_to
    if key == "groups" and renamed:
        for it in db.query(models.Item).filter(models.Item.group.isnot(None)).all():
            new = renamed.get(str(it.group).strip().lower())
            if new:
                it.group = new
    if key == "packaging_types" and renamed:
        for it in db.query(models.Item).filter(models.Item.packaging_type.isnot(None)).all():
            new = renamed.get(str(it.packaging_type).lower())
            if new:
                it.packaging_type = new
        # The type picked on order lines and on the lines of open invoices
        # follows too, and so does its length under Packaging by length.
        for r in db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.packaging.isnot(None)).all():
            new = renamed.get(str(r.packaging).lower())
            if new:
                r.packaging = new
        for inv in _open_invoices(db):
            for l in inv.lines:
                new = renamed.get(str(l.packaging or "").lower())
                if new:
                    l.packaging = new
        row = _row(db, PACK_RULE_KEY)
        if row is not None:
            rules = [{**r, "type": renamed.get(str(r.get("type") or "").lower(), r.get("type"))}
                     for r in ((row.value or {}).get("rules") or []) if isinstance(r, dict)]
            row.value = {"rules": rules}
    field = SHIP_FIELDS.get(key)
    if field and renamed:
        for inv in _open_invoices(db):
            new = renamed.get(str((inv.ship or {}).get(field) or "").lower())
            if new:
                inv.ship = {**inv.ship, field: new}


def save_list(db: Session, key: str, values, renames: dict | None = None, modes: dict | None = None) -> list[str]:
    before = get_list(db, key)
    kept = clean_list(values)
    value = {"values": kept}
    if key in MODE_LISTS:
        if modes is None:
            # Nothing said about modes: each entry keeps its own, and a
            # corrected spelling takes the modes the old one had.
            had = get_modes(db, key)
            moved = {str(b): had[a] for a, b in (renames or {}).items() if a in had and b}
            modes = {**had, **moved}
        value["modes"] = clean_modes(modes, kept)
    _carry(db, key, before, kept, renames or {})
    _save(db, key, value)
    return kept


# ---------- banks ----------

def get_banks(db: Session) -> list[dict]:
    row = _row(db, BANKS_KEY)
    return list((row.value or {}).get("banks", [])) if row else []


def save_banks(db: Session, banks: list[dict]) -> list[dict]:
    _save(db, BANKS_KEY, {"banks": banks})
    return banks


def bank_lines(b: dict) -> dict:
    """What a bank account prints as on the papers. Mirrors `bankLines` in
    frontend/src/features/shipments/ShipTermsFields.jsx — keep the two in step."""
    branch = str(b.get("branch") or "").strip()
    name = str(b.get("bank_name") or "").strip()
    tail = "" if re.search(r"branch$", branch, re.I) else " BRANCH"
    bank = f"{name}, {branch}{tail}" if branch else name
    town = re.sub(r"\s*branch$", "", branch, flags=re.I)
    where = ", ".join(x for x in (town, str(b.get("city") or "").strip(), str(b.get("state") or "").strip()) if x)
    return {"bank": bank, "bankAddr": f"{where} (INDIA)" if where else "",
            "bankAccount": b.get("account_no") or "", "bankIfsc": b.get("ifsc") or ""}


def carry_bank(db: Session, bank: dict) -> None:
    """A corrected account reaches the open invoices routed through it — they
    hold a copy of its printed lines. Shipped invoices keep what they went out with."""
    for inv in _open_invoices(db):
        if (inv.ship or {}).get("bankId") == bank["id"]:
            inv.ship = {**inv.ship, **bank_lines(bank)}


# ---------- the item master's column layout ----------

def get_item_columns(db: Session) -> dict:
    row = _row(db, COLUMNS_KEY)
    return dict(row.value or {}) if row else {"cols": None}


def save_item_columns(db: Session, cols: list[dict] | None) -> dict:
    value = {"cols": cols}
    _save(db, COLUMNS_KEY, value)
    return value


# ---------- the documents' hidden and deleted columns ----------

DOC_COLUMN_MODES = ("hide", "delete")


def get_doc_columns(db: Session) -> dict:
    row = _row(db, DOC_COLUMNS_KEY)
    return {"rules": list((row.value or {}).get("rules", []))} if row else {"rules": []}


def save_doc_columns(db: Session, rules: list[dict]) -> dict:
    """One rule per document and column; the last one given wins."""
    kept: dict[tuple[str, str], dict] = {}
    for r in rules or []:
        doc = str(r.get("doc") or "").strip()[:8]
        key = re.sub(r"\s+", " ", str(r.get("key") or "")).strip()[:MAX_TEXT]
        mode = str(r.get("mode") or "")
        if not doc or not key or mode not in DOC_COLUMN_MODES:
            continue
        label = re.sub(r"\s+", " ", str(r.get("label") or key)).strip()[:MAX_TEXT]
        kept[(doc, key)] = {"doc": doc, "key": key, "label": label, "mode": mode}
    value = {"rules": list(kept.values())[:2000]}
    _save(db, DOC_COLUMNS_KEY, value)
    return value


# ---------- the item sequence ----------

def _kept_ranges(db: Session, values) -> list[str]:
    """`values` cut down to ranges that exist, in their own spelling — a
    removed supplier's range drops out."""
    known = {k.lower(): k for k in _ranges(db)}
    return [known[v.lower()] for v in clean_list(values) if v.lower() in known]


def get_sequence(db: Session) -> list[str]:
    row = _row(db, SEQUENCE_KEY)
    saved = _kept_ranges(db, (row.value or {}).get("values", [])) if row else []
    # Every range keeps a place even if a saved order predates it: a known
    # range, or a supplier added since, joins at the end.
    have = {s.lower() for s in saved}
    return saved + [k for k in _ranges(db) if k.lower() not in have]


def save_sequence(db: Session, values) -> list[str]:
    _save(db, SEQUENCE_KEY, {"values": _kept_ranges(db, values)})
    return get_sequence(db)


# ---------- the item groups inside each range ----------

MAX_GROUPS = 20
MAX_CATS = 60


def get_groups(db: Session) -> dict:
    """{range: [group …]} — what calc.item_block reads. Nothing saved yet means
    the default: Oswin's PMF pipes in a block of their own."""
    row = _row(db, GROUPS_KEY)
    if row is None:
        return {k: [dict(g) for g in v] for k, v in calc.DEFAULT_GROUPS.items()}
    live = {k.lower() for k in _ranges(db)}
    return {k: v for k, v in ((row.value or {}).get("ranges") or {}).items() if str(k).lower() in live}


def clean_groups(value, ranges=None) -> dict:
    """Ranges the sequence knows, categories as capital letters, a category in
    one group of its range only, and exactly one "rest" block per range."""
    known = {k.lower(): k for k in (ranges or calc.DEFAULT_SEQUENCE)}
    out: dict = {}
    for rng, groups in (value or {}).items():
        name = known.get(str(rng or "").strip().lower())
        if not name or not isinstance(groups, list):
            continue
        seen_cats, kept, has_rest = set(), [], False
        for g in groups[:MAX_GROUPS]:
            if not isinstance(g, dict):
                continue
            rest = bool(g.get("rest"))
            if rest and has_rest:
                continue
            cats = []
            if not rest:
                for c in g.get("cats") or []:
                    c = re.sub(r"[^A-Za-z]", "", str(c or "")).upper()[:12]
                    if c and c not in seen_cats:
                        seen_cats.add(c)
                        cats.append(c)
                if not cats:
                    continue                  # an empty group has nothing to print
            has_rest = has_rest or rest
            gid = re.sub(r"[^A-Za-z0-9_-]", "", str(g.get("id") or ""))[:24] or f"g{len(kept)}"
            kept.append({
                "id": "rest" if rest else gid,
                "name": re.sub(r"\s+", " ", str(g.get("name") or "")).strip()[:60],
                "rest": rest,
                "cats": cats[:MAX_CATS],
                "sort": "natural" if rest or g.get("sort") == "natural" else "listed",
            })
        if not has_rest:
            kept.insert(0, {"id": "rest", "name": "", "rest": True, "cats": [], "sort": "natural"})
        # A range with nothing but its rest block is the plain range again.
        if len(kept) > 1 or kept[0]["name"]:
            out[name] = kept
    return out


def save_groups(db: Session, value) -> dict:
    _save(db, GROUPS_KEY, {"ranges": clean_groups(value, _ranges(db))})
    return get_groups(db)


def item_rank(db: Session):
    """The sort key every list of items is put in order with."""
    return calc.rank_by(_suppliers(db), get_sequence(db), get_groups(db))


# ---------- packaging by length (V-7.10.2) ----------
#
# Each packaging type on the list may carry a length: goods longer than it
# travel in that type. Several types may carry one at once (Bundle above 1000
# mm, a crate above 3000 mm); an item past more than one goes in the type of
# the longest it passes. Everything else goes as its item says (Setup → Items
# → Packaging), Cartons unless set. A line on an order or an invoice can still
# name another type for itself. The rules are read by the browser
# (frontend/src/lib/packaging.js), which prints the documents.

MAX_LENGTH_MM = 100000
MAX_PACK_TEXT = 60


def _num_mm(v):
    try:
        mm = float(v)
    except (TypeError, ValueError):
        return None
    if mm != mm or mm <= 0 or mm > MAX_LENGTH_MM:
        return None
    return int(mm) if mm.is_integer() else mm


def clean_pack_rules(value, types: list[str]) -> list[dict]:
    """[{"type": <a packaging type, in the list's spelling>, "above_mm": n}],
    one per type, shortest length first. Accepts the list itself, {"rules":
    [...]}, or a single {"type", "above_mm"}. A type no longer on the list, or
    a length that is not a number above nil, is dropped."""
    if isinstance(value, dict) and isinstance(value.get("rules"), list):
        raw = value["rules"]
    elif isinstance(value, list):
        raw = value
    elif isinstance(value, dict) and value.get("type"):
        raw = [value]
    else:
        raw = []
    canon = {re.sub(r"\s+", " ", t).strip().lower(): t for t in types}
    kept: dict[str, dict] = {}
    for r in raw[:MAX_ENTRIES]:
        if not isinstance(r, dict):
            continue
        name = canon.get(re.sub(r"\s+", " ", str(r.get("type") or "")).strip().lower())
        mm = _num_mm(r.get("above_mm"))
        if name and mm is not None:
            kept[name.lower()] = {"type": name, "above_mm": mm}
    return sorted(kept.values(), key=lambda x: (x["above_mm"], x["type"].lower()))


def get_pack_rules(db: Session) -> list[dict]:
    row = _row(db, PACK_RULE_KEY)
    return clean_pack_rules(row.value if row else None, get_list(db, "packaging_types"))


def save_pack_rules(db: Session, rules) -> list[dict]:
    _save(db, PACK_RULE_KEY, {"rules": clean_pack_rules(rules, get_list(db, "packaging_types"))})
    return get_pack_rules(db)


def pack_name(db: Session, value, keep: str | None = None) -> str | None:
    """A line's packaging as stored: a type on the list, in the list's own
    spelling — or None for "as set". A type since taken off the list is still
    accepted where the line already had it (`keep`), so an edit that sends it
    back is not refused. Anything else is refused."""
    v = re.sub(r"\s+", " ", str(value or "")).strip()
    if not v:
        return None
    for t in get_list(db, "packaging_types"):
        if t.lower() == v.lower():
            return t
    if keep and str(keep).strip().lower() == v.lower():
        return keep
    raise HTTPException(422, f"Packaging “{v[:MAX_PACK_TEXT]}” is not on Setup → Additional settings → Packaging types")


def canon(db: Session, key: str, value):
    """`value` in the list's own spelling when the list has it (any case,
    any spacing) — so "pp" saved on an item reads PP, the same band on every
    paper as the other PP items. Anything else comes back trimmed."""
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    for v in get_list(db, key):
        if v.lower() == text.lower():
            return v
    return text


def remember(db: Session, key: str, value) -> None:
    """A group or packaging type an item was saved with, joined onto its list
    when the list has been saved and does not have it yet — so an item added
    from the master workbook, or through the API, still shows up under Setup
    → Additional settings, and in every dropdown that reads the list. A list
    never saved is worked out from the items anyway. Does not commit."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    row = _row(db, key)
    if not text or row is None:
        return
    values = clean_list((row.value or {}).get("values", []))
    if any(v.lower() == text.lower() for v in values):
        return
    row.value = {**(row.value or {}), "values": clean_list(values + [text])}

