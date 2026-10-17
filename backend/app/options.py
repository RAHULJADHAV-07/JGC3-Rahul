"""Setup → Additional settings — the short lists the shipment forms pick from.

Five of them are plain lists of words (terms of delivery, packaging types,
terms of payment, ports of loading, ports a buyer is shipped to) and one is a
list of records (the bank accounts export proceeds are routed through). All
of them live in the `settings` table, one key each, because they are a few
dozen short strings the client edits in the UI — not something worth a table
and a migration apiece.

Two more keys sit here for the same reason: the item master's column layout
(which columns Setup → Items shows, and therefore which item fields the
reports and downloads carry) and the item sequence every list is sorted in.

A list nobody has saved yet is not empty: it is offered pre-filled from the
values the shipments already use, so the first dropdown anybody opens carries
the terms and ports already typed on the existing invoices.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from . import calc, models

# key -> (label, the value offered when nothing has been saved and nothing is in use yet)
LISTS: dict[str, tuple[str, list[str]]] = {
    "terms_delivery": ("Terms of delivery", ["FOB MUMBAI"]),
    "packaging_types": ("Packaging types", ["Cartons"]),
    "terms_payment": ("Terms of payment", ["D.P.SIGHT DRAFT"]),
    "ports_loading": ("Port of loading", ["NHAVA SHEVA-MUMBAI (INDIA)"]),
    "ports_ship_to": ("Ship to port", []),
}

BANKS_KEY = "banks"
COLUMNS_KEY = "item_columns"
DOC_COLUMNS_KEY = "doc_columns"
SEQUENCE_KEY = "item_sequence"

MAX_ENTRIES = 200
MAX_TEXT = 200

# Indian Financial System Code: four letters (the bank), a zero, six letters or
# digits (the branch).
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def _row(db: Session, key: str):
    return db.get(models.Setting, key)


def _save(db: Session, key: str, value) -> None:
    row = _row(db, key)
    if row:
        row.value = value
    else:
        db.add(models.Setting(key=key, value=value))
    db.commit()


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
    ship_field = {"terms_delivery": "terms", "terms_payment": "payment",
                  "ports_loading": "pol", "ports_ship_to": "pod"}.get(key)
    found: list[str] = []
    if ship_field:
        for inv in db.query(models.Invoice).order_by(models.Invoice.date).all():
            v = (inv.ship or {}).get(ship_field)
            if v:
                found.append(v)
    if key == "ports_ship_to":
        found += [b.ship_to for b in db.query(models.Buyer).all() if b.ship_to]
        for b in db.query(models.Buyer).all():
            found += list(b.ports or [])
    if key == "packaging_types":
        found += [i[0] for i in db.query(models.Item.packaging_type).distinct().all() if i[0]]
    return found


def get_list(db: Session, key: str) -> list[str]:
    row = _row(db, key)
    if row is not None:
        return clean_list((row.value or {}).get("values", []))
    _, fallback = LISTS[key]
    return clean_list(fallback + _in_use(db, key))


def save_list(db: Session, key: str, values) -> list[str]:
    kept = clean_list(values)
    _save(db, key, {"values": kept})
    return kept


# ---------- banks ----------

def get_banks(db: Session) -> list[dict]:
    row = _row(db, BANKS_KEY)
    return list((row.value or {}).get("banks", [])) if row else []


def save_banks(db: Session, banks: list[dict]) -> list[dict]:
    _save(db, BANKS_KEY, {"banks": banks})
    return banks


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

def get_sequence(db: Session) -> list[str]:
    row = _row(db, SEQUENCE_KEY)
    saved = clean_list((row.value or {}).get("values", [])) if row else []
    # Every known range keeps a place even if a saved order predates it.
    return saved + [k for k in calc.DEFAULT_SEQUENCE if k.lower() not in {s.lower() for s in saved}]


def save_sequence(db: Session, values) -> list[str]:
    known = {k.lower(): k for k in calc.DEFAULT_SEQUENCE}
    kept = [known[v.lower()] for v in clean_list(values) if v.lower() in known]
    _save(db, SEQUENCE_KEY, {"values": kept})
    return get_sequence(db)


def item_rank(db: Session):
    """The sort key every list of items is put in order with."""
    return calc.rank_by(db.query(models.Supplier).all(), get_sequence(db))
