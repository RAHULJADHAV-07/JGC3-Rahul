from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db, lock_ledger
from ..deps import require, require_admin
from ..permissions import READ_ORDERS
from .. import models, schemas, calc, options, prices as P

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])

_read = require(*READ_ORDERS)
_write = require("orders.entry")
# Repricing open orders is decided where the price is edited — Setup → Items —
# so whoever may change the master may also carry that change onto the orders
# still outstanding. Delivered lines are never touched by it.
_price_read = require("orders.entry", "orders.reports", "home", "setup.items")
_price_write = require("orders.entry", "setup.items")


def _ctx(db: Session):
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    return items, po_lines, invoices


@router.get("", dependencies=[Depends(_read)])
def list_purchase_orders(db: Session = Depends(get_db)):
    """Grouped PO roll-up with delivery status and completed suppliers dropped."""
    items, po_lines, invoices = _ctx(db)
    return calc.build_po_list(po_lines, invoices, items, rank=options.item_rank(db))


@router.get("/lines", dependencies=[Depends(_read)])
def list_po_lines(db: Session = Depends(get_db)):
    """Raw buyer-order lines (the 2A order book), newest first."""
    rows = db.query(models.PurchaseOrderLine).all()
    rows.sort(key=lambda r: r.date, reverse=True)
    versions = P._load(db, "supplier", [r.item_id for r in rows])
    # Each buyer's own price list, for the date our FOB was set (Sales).
    buyer_v = {b: P._load(db, "buyer", [r.item_id for r in rows if r.buyer_id == b], b)
               for b in {r.buyer_id for r in rows if r.buyer_id}}
    return [
        {"id": r.id, "po": r.po, "date": r.date, "item_id": r.item_id,
         "qty": r.qty, "rbi": r.rbi, "buyer_id": r.buyer_id,
         # "bundle" | "carton" chosen on the order; None = as the item goes.
         "packaging": r.packaging,
         # The prices this order was agreed at — NULL means "read the item".
         "unit_value": r.unit_value, "value_mode": r.value_mode,
         "unit_fob100": r.unit_fob100, "fob_mode": r.fob_mode,
         # The supplier price list those prices came from (Purchase heads its
         # value columns with it).
         "price_from": P.price_list_date(versions.get(r.item_id, []), r.date, r.unit_value),
         "fob_from": P.fob_list_date(versions.get(r.item_id, []),
                                     buyer_v.get(r.buyer_id, {}).get(r.item_id, []), r.date, r.unit_fob100)}
        for r in rows
    ]


@router.get("/supplier-refs", dependencies=[Depends(_read)])
def supplier_refs(db: Session = Depends(get_db)):
    """The "Your Ref" each supplier rate change carries, and the day it holds
    from — what the supplier PO prints (V-7.10.1)."""
    return P.supplier_refs(db)


# ---------------------------------------------------------------------------
# Price sync — an order keeps the prices it was placed at (see models.py), so
# editing an item in Setup only moves the orders you say it should.
# ---------------------------------------------------------------------------
def _today_prices(db: Session, items: dict, lines):
    """line → what that line would be placed at today: the supplier's price,
    with its buyer's FOB where the buyer has a price list (app/prices.py)."""
    by_buyer = {}
    for b in {r.buyer_id for r in lines}:
        by_buyer[b] = P.order_prices(db, items, b, P.today_iso())
    return lambda r: by_buyer[r.buyer_id][r.item_id]


def _pending_line_ids(db: Session) -> set[str]:
    """Every order line that still has boxes outstanding, by the same FIFO
    ledger the packing screen allocates against."""
    items, po_lines, invoices = _ctx(db)
    ledger = calc.compute_ledger(po_lines, invoices, items)
    return {
        d["line_id"]
        for b in ledger.values() for d in b["demands"] if d["remaining"] > 0
    }


@router.get("/price-drift", dependencies=[Depends(_price_read)])
def price_drift(item_id: str | None = None, db: Session = Depends(get_db)):
    """How many still-open order lines were agreed at a price the item master
    no longer carries. Give it an `item_id` to ask about one product — which
    is what the item edit form does before offering to apply a new price.
    """
    items = {i.id: i for i in db.query(models.Item).all()}
    pending = _pending_line_ids(db)
    lines = db.query(models.PurchaseOrderLine).all()
    target = _today_prices(db, items, lines)

    drifted, pos, item_ids, boxes = 0, set(), set(), 0
    for r in lines:
        it = items.get(r.item_id)
        if not it or r.id not in pending:
            continue
        if item_id and r.item_id != item_id:
            continue
        if P.differs(target(r), r):
            drifted += 1
            pos.add(r.po)
            item_ids.add(it.id)
    return {
        "lines": drifted,
        "pos": sorted(pos),
        "items": len(item_ids),
        "pending_lines": len(pending),
    }


def _since(since: str | None) -> str | None:
    if not since:
        return None
    try:
        return schemas._iso_date(since)
    except ValueError:
        raise HTTPException(422, "since: enter a date")


@router.get("/pending-for-item/{iid}", dependencies=[Depends(_price_read)])
def pending_for_item(iid: str, since: str | None = None, db: Session = Depends(get_db)):
    """Which orders still have this item outstanding, and how many boxes —
    what the edit form shows beside the "apply to pending orders" tick, so the
    consequence of ticking it is visible before saving. With `since` (the day
    the new price holds from) only orders dated that day or later are listed;
    `older` names the open ones before it, which keep their price (V-7.10.2)."""
    since = _since(since)
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    ledger = calc.compute_ledger(po_lines, invoices, items)

    every = [d for d in ledger.get(iid, {}).get("demands", []) if d["remaining"] > 0]
    open_demands = [d for d in every if since is None or d["date"] >= since]
    older = sorted({d["po"] for d in every if since is not None and d["date"] < since})
    by_po: dict = {}
    for d in open_demands:
        e = by_po.setdefault(d["po"], {"po": d["po"], "date": d["date"], "boxes": 0})
        e["boxes"] += d["remaining"]
        e["date"] = min(e["date"], d["date"])
    rows = sorted(by_po.values(), key=lambda r: (r["date"], r["po"]))
    return {
        "item_id": iid,
        "pos": rows,
        "lines": len(open_demands),
        "boxes": sum(r["boxes"] for r in rows),
        "older": older,
    }


@router.post("/apply-prices", dependencies=[Depends(_price_write)])
def apply_prices(item_id: str | None = None, since: str | None = None, db: Session = Depends(get_db)):
    """Restate still-open order lines at the item master's current price.

    Scoped to one product with `item_id`, which is how the item edit form
    applies a price change it has just saved. Lines already delivered are left
    exactly as they were — the invoice, the customs papers and the bank
    documents raised against them must not move.

    With `since` — the day the new price holds from — only orders dated that
    day or later move, each to the price in force on its own date; an order
    dated before it keeps the price before it (V-7.10.2), exactly as the
    price list's "apply to orders" does.
    """
    since = _since(since)
    if since:
        ids = [item_id] if item_id else [i.id for i in db.query(models.Item.id).all()]
        out = P.reprice_orders(db, ids, since)
        db.commit()
        return out
    items = {i.id: i for i in db.query(models.Item).all()}
    pending = _pending_line_ids(db)
    lines = [r for r in db.query(models.PurchaseOrderLine).all()
             if r.item_id in items and (not item_id or r.item_id == item_id)]
    target = _today_prices(db, items, lines)

    updated, pos = 0, set()
    for r in lines:
        if r.id not in pending:
            continue
        t = target(r)
        if not P.differs(t, r):
            continue
        r.unit_value, r.value_mode = t["unit_value"], t["value_mode"]
        r.unit_fob100, r.fob_mode = t["unit_fob100"], t["fob_mode"]
        updated += 1
        pos.add(r.po)
    db.commit()
    return {"updated": updated, "pos": sorted(pos)}


@router.get("/{po}", dependencies=[Depends(_read)])
def get_purchase_order(po: str, db: Session = Depends(get_db)):
    items, po_lines, invoices = _ctx(db)
    match = next((p for p in calc.build_po_list(po_lines, invoices, items, rank=options.item_rank(db))
                  if p["po"] == po), None)
    if not match:
        raise HTTPException(404, "Purchase order not found")
    return match


@router.post("", status_code=201, dependencies=[Depends(_write)])
def create_purchase_order(body: schemas.PurchaseOrderCreate, db: Session = Depends(get_db)):
    if not body.lines:
        raise HTTPException(400, "A purchase order needs at least one line")
    lock_ledger(db)
    ids = [l.item_id for l in body.lines]
    items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(ids)).all()}
    missing = [i for i in ids if i not in items]
    if missing:
        raise HTTPException(404, f"Item {missing[0]} not found")

    # Freeze the price the order is being placed at: the one in force on the
    # order's own date (Other Reports → Price list), the buyer's where it has one.
    priced = P.order_prices(db, items, body.buyer_id, body.date)
    created = []
    for l in body.lines:
        row = models.PurchaseOrderLine(
            po=body.po, date=body.date, item_id=l.item_id, qty=l.qty,
            rbi=body.rbi, buyer_id=body.buyer_id, packaging=options.pack_name(db, l.packaging), **priced[l.item_id],
        )
        db.add(row)
        created.append(row)
    db.commit()
    return {"po": body.po, "lines": len(created)}


def _repoint_pins(db: Session, po: str, new_po: str | None) -> None:
    """Custom PO lines name their order by number, so a renamed order carries
    them with it and a deleted one lets them go (those boxes fall back to FIFO)."""
    for line in db.query(models.InvoiceLine).filter(models.InvoiceLine.po_alloc.isnot(None)).all():
        pins = line.po_alloc or []
        if not any(p.get("po") == po for p in pins):
            continue
        merged: dict = {}
        for p in pins:
            name = new_po if p.get("po") == po else p.get("po")
            if name is not None:
                merged[name] = merged.get(name, 0) + int(p.get("boxes") or 0)
        line.po_alloc = [{"po": k, "boxes": v} for k, v in merged.items()] or None


@router.put("/{po}", dependencies=[Depends(_write)])
def update_purchase_order(po: str, body: schemas.PurchaseOrderUpdate, db: Session = Depends(get_db)):
    """Restate a purchase order: its number, its date, and the lines on it.

    `lines` is the order as it should now read, in full. A line that arrives
    with its `id` keeps that row (and the price it was agreed at); a line with
    no `id` is added and priced as a new order dated that day would be; a row whose id does not come back is dropped. Sending no
    `lines` at all leaves the lines alone, which is what renaming a PO does.
    """
    lock_ledger(db)
    rows = db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).all()
    if not rows:
        raise HTTPException(404, "Purchase order not found")
    new_po = po if body.po is None else schemas.restated("po", body.po, po, schemas._named)
    if body.date is not None and body.date not in {r.date for r in rows}:
        body.date = schemas.restated("date", body.date, "", schemas._iso_date)
    # Renamed onto a number already in use, the two orders would become one, and
    # nothing afterwards could tell whose lines were whose.
    if new_po != po and db.query(models.PurchaseOrderLine.id).filter(models.PurchaseOrderLine.po == new_po).first():
        raise HTTPException(409, f"PO {new_po} already exists — use another number.")
    by_id = {r.id: r for r in rows}
    date = body.date or min(r.date for r in rows)
    buyer_id = rows[0].buyer_id
    rbi = rows[0].rbi

    if body.lines is None:
        kept = rows
    else:
        if not body.lines:
            raise HTTPException(400, "A purchase order needs at least one line")
        # A line is "new" when it names no row of this order — either it
        # carries no id at all, or one that is no longer on the order because
        # somebody else edited it in between.
        new_ids = [l.item_id for l in body.lines if l.id not in by_id and l.item_id]
        items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(new_ids)).all()} if new_ids else {}
        missing = [i for i in new_ids if i not in items]
        if missing:
            raise HTTPException(404, f"Item {missing[0]} not found")

        # A line added now is agreed at the price in force on the order's date.
        priced = P.order_prices(db, items, buyer_id, date) if items else {}
        kept, seen = [], set()
        for l in body.lines:
            qty, lid = l.qty, l.id
            if lid and lid in by_id:
                row = by_id[lid]
                row.qty = qty
                if "packaging" in l.model_fields_set:
                    row.packaging = options.pack_name(db, l.packaging, keep=row.packaging)
                seen.add(lid)
            else:
                it = items.get(l.item_id)
                if not it:
                    raise HTTPException(404, f"Item {l.item_id} not found")
                row = models.PurchaseOrderLine(
                    po=new_po, date=date, item_id=it.id, qty=qty,
                    rbi=rbi, buyer_id=buyer_id, packaging=options.pack_name(db, l.packaging), **priced[it.id],
                )
                db.add(row)
            kept.append(row)

        for r in rows:
            if r.id not in seen:
                db.delete(r)

    for r in kept:
        r.po = new_po
        if body.date:
            r.date = body.date
    if new_po != po:
        _repoint_pins(db, po, new_po)
    db.commit()
    return {"po": new_po, "lines": len(kept)}


# Deleting an order takes its demand off every register at once, so it is
# an admin's call; whoever enters orders can still edit them.
@router.delete("/{po}", status_code=204, dependencies=[Depends(require_admin)])
def delete_purchase_order(po: str, db: Session = Depends(get_db)):
    lock_ledger(db)
    db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).delete()
    _repoint_pins(db, po, None)
    db.commit()
    return None
