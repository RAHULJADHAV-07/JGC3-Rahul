import math
from datetime import datetime
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db, lock_ledger
from ..deps import require, require_admin
from ..permissions import READ_INVOICES
from .. import models, schemas, calc, options

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

_read = require(*READ_INVOICES)
_write = require("shipment.packing", "shipment.details")


def _out(inv: models.Invoice, legs: dict | None = None) -> schemas.InvoiceOut:
    out = schemas.InvoiceOut.model_validate(inv)
    out.status = calc.invoice_status(inv)
    out.serial_next = calc.serial_next_of(inv)
    out.allocation = inv.allocation or "fifo"
    if legs is not None:
        out.po_legs = legs.get(inv.invoice_no, {})
    return out


def _po_legs(db: Session) -> dict:
    """Which orders every invoice's boxes cleared, from the same FIFO ledger
    the balance registers and the price freeze run on."""
    items = {i.id: i for i in db.query(models.Item).all()}
    return calc.invoice_po_legs(calc.compute_ledger(
        db.query(models.PurchaseOrderLine).all(), db.query(models.Invoice).all(), items))


@router.get("", response_model=list[schemas.InvoiceOut], dependencies=[Depends(_read)])
def list_invoices(db: Session = Depends(get_db)):
    rows = db.query(models.Invoice).order_by(models.Invoice.date.desc()).all()
    legs = _po_legs(db)
    return [_out(i, legs) for i in rows]


@router.get("/{iid}", response_model=schemas.InvoiceOut, dependencies=[Depends(_read)])
def get_invoice(iid: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return _out(inv, _po_legs(db))


@router.get("/{iid}/serials", dependencies=[Depends(_read)])
def get_serials(iid: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    items = {i.id: i for i in db.query(models.Item).all()}
    return calc.invoice_serials(inv, items)


def _freeze_prices(db: Session, lines, keep=None, exclude_invoice_id=None) -> list[models.InvoiceLine]:
    """Build the invoice's lines with their prices already frozen.

    The price is taken from the purchase orders the boxes clear — the figures
    that were agreed — so the invoice and every document raised from it stay
    fixed for good, whatever happens to the item master afterwards.

    `keep` maps item id → the prices an existing line already carries. Editing
    an invoice must not restate the lines it already had: an item that was
    already on the invoice keeps the price it was raised at, and only lines
    new to the invoice are priced now. `exclude_invoice_id` drops this invoice
    from the ledger, so its own boxes are not counted as already delivered
    when working out which orders the new lines clear.
    """
    items = {i.id: i for i in db.query(models.Item).all()}
    invoices = [i for i in db.query(models.Invoice).all() if i.id != exclude_invoice_id]
    open_demands = calc.open_demands_by_item(
        db.query(models.PurchaseOrderLine).all(), invoices, items,
    )
    keep = keep or {}
    out = []
    for pos, l in enumerate(lines):
        it = items.get(l.item_id)
        if not it:
            raise HTTPException(404, f"Item {l.item_id} not found")
        pins = getattr(l, "po_alloc", None)
        demands = open_demands.get(l.item_id, [])
        # Named boxes are priced at what the orders they were named on agreed.
        p = keep.get(l.item_id) or calc.invoiced_prices(it, l.boxes, calc.pinned_demands(demands, pins) if pins else demands)
        out.append(models.InvoiceLine(
            item_id=l.item_id, supplier_id=l.supplier_id, boxes=l.boxes, po_alloc=pins or None,
            packaging=getattr(l, "packaging", None),
            unit_value=p["unit_value"], value_mode=p["value_mode"],
            unit_fob100=p["unit_fob100"], fob_mode=p["fob_mode"],
            # Carton serials run down the lines in this order.
            position=pos,
        ))
    return out


def _in_sequence(db: Session, lines) -> list:
    """The lines of a new invoice in the item sequence (Oswin by bore, then
    VP-PP, Hansa-PP, Hansa-GRN, VP-GRN …), which is the order its cartons are
    numbered in — so the serial ranges climb down the paperwork in the same
    order every list in the app is read in. Items the master no longer has
    keep their place at the end; the price freeze reports them."""
    items = {i.id: i for i in db.query(models.Item).all()}
    rank = options.item_rank(db)
    last = (math.inf,)
    return sorted(lines, key=lambda l: rank(items[l.item_id]) if l.item_id in items else last)


def _line_label(db: Session, line) -> str:
    """"PE1548 (2001–2010)" — a line and its cartons, for an error message."""
    it = db.get(models.Item, line.item_id)
    name = (it.gd or it.code) if it else "a line"
    return f"{name} ({line.serial_from}–{line.serial_from + int(line.boxes or 0) - 1})"


def _merged(pins) -> list[dict]:
    """[{po, boxes}] with one entry per order and nothing empty, however it was
    sent — `pins` may be schema objects or plain dicts."""
    boxes: dict = {}
    for pin in pins or []:
        po, n = (pin["po"], pin.get("boxes")) if isinstance(pin, dict) else (pin.po, pin.boxes)
        if int(n or 0) > 0:
            boxes[po] = boxes.get(po, 0) + int(n)
    return [{"po": po, "boxes": n} for po, n in boxes.items()]


def _trimmed(pins, boxes: int) -> list[dict]:
    """A line's named boxes after its count was cut: taken off the last order."""
    kept, left = [], max(0, int(boxes or 0))
    for pin in _merged(pins):
        n = min(pin["boxes"], left)
        if n:
            kept.append({"po": pin["po"], "boxes": n})
            left -= n
    return kept


def _resolve_allocation(db: Session, mode: str, lines, exclude_invoice_id=None) -> list:
    """Each line's `po_alloc` as it will be stored, refused if it cannot be met.

    A FIFO invoice names nothing. A Custom PO invoice must place every box the
    order book has room for: each named order must hold the item and have the
    boxes free once every other invoice has taken its own. Boxes beyond what any
    order still holds are the one thing left unplaced — the ledger reports them
    as excess, the same as on a FIFO invoice."""
    out = [SimpleNamespace(item_id=l.item_id, supplier_id=l.supplier_id, boxes=l.boxes,
                           po_alloc=_merged(getattr(l, "po_alloc", None)) if mode == "custom" else None,
                           packaging=getattr(l, "packaging", None))
           for l in lines]
    if mode != "custom":
        return out
    items = {i.id: i for i in db.query(models.Item).all()}
    invoices = [i for i in db.query(models.Invoice).all() if i.id != exclude_invoice_id]
    ledger = calc.compute_ledger(db.query(models.PurchaseOrderLine).all(), invoices, items)
    held = calc.open_by_po(ledger, [l.item_id for l in out])
    for l in out:
        it = items.get(l.item_id)
        if not it:
            raise HTTPException(404, f"Item {l.item_id} not found")
        name = it.gd or it.code
        boxes = max(0, int(l.boxes or 0))
        # What an earlier line of this same invoice took is no longer there.
        room = {r["po"]: r["open"] for r in held.get(l.item_id, []) if r["open"] > 0}
        placed = sum(p["boxes"] for p in l.po_alloc)
        if placed > boxes:
            raise HTTPException(400, f"{name}: {placed} boxes are placed on purchase orders but only {boxes} were packed.")
        for pin in l.po_alloc:
            if pin["po"] not in room:
                raise HTTPException(409, f"PO {pin['po']} has no {name} left to deduct.")
            if pin["boxes"] > room[pin["po"]]:
                raise HTTPException(409, f"PO {pin['po']} has only {room[pin['po']]} boxes of {name} left — {pin['boxes']} were asked of it.")
        short = min(boxes, sum(room.values())) - placed
        if short > 0:
            raise HTTPException(400, f"{name}: {short} more box{'' if short == 1 else 'es'} need a purchase order.")
        for pin in l.po_alloc:
            next(r for r in held[l.item_id] if r["po"] == pin["po"])["open"] -= pin["boxes"]
    return out


# The key a preview's boxes are booked under in the ledger — never a real
# invoice number, so it cannot be confused with one.
_PREVIEW = "\x00preview"


@router.post("/allocation-preview", dependencies=[Depends(_write)])
def allocation_preview(body: schemas.AllocationPreviewIn, db: Session = Depends(get_db)):
    """Which purchase orders the typed boxes would clear, worked out by the
    same ledger the saved invoice will be — dated where it is dated.

    Record packing shows this under every box it is typed into. Working it out
    here rather than in the browser matters for an invoice dated before others
    already on the book: FIFO runs in packing-date order, so a back-dated
    invoice clears the oldest orders ahead of the later invoices, and only the
    ledger itself knows what that leaves."""
    items = {i.id: i for i in db.query(models.Item).all()}
    invoices = [i for i in db.query(models.Invoice).all() if i.id != body.exclude_invoice_id]
    draft = SimpleNamespace(
        id=_PREVIEW, invoice_no=_PREVIEW, date=body.date, created_at=datetime.utcnow(),
        lines=[SimpleNamespace(item_id=l.item_id, supplier_id=l.supplier_id, boxes=l.boxes,
                               po_alloc=_merged(l.po_alloc) or None)
               for l in body.lines if l.boxes and l.item_id in items],
    )
    ledger = calc.compute_ledger(db.query(models.PurchaseOrderLine).all(), invoices + [draft], items)
    out = {}
    for l in draft.lines:
        b = ledger.get(l.item_id)
        if not b:
            continue
        legs = [{"po": d["po"], "date": d["date"], "boxes": d["cleared"][_PREVIEW],
                 "closes": d["remaining"] == 0,
                 # The packaging chosen on that order line (V-7.10.2).
                 "packaging": getattr(d.get("line"), "packaging", None)}
                for d in b["demands"] if d["cleared"].get(_PREVIEW)]
        spare = sum(e["boxes"] for e in b["excess"] if e["invoice_no"] == _PREVIEW)
        out[l.item_id] = {"legs": legs, "spare": spare}
    return out


@router.post("/open-orders", dependencies=[Depends(_write)])
def open_orders(body: schemas.OpenOrdersIn, db: Session = Depends(get_db)):
    """The purchase orders still holding these items, oldest first — what
    Custom PO lists. Every item asked about comes back, with an empty list if
    no order holds it."""
    items = {i.id: i for i in db.query(models.Item).all()}
    invoices = [i for i in db.query(models.Invoice).all() if i.id != body.exclude_invoice_id]
    ledger = calc.compute_ledger(db.query(models.PurchaseOrderLine).all(), invoices, items)
    return calc.open_by_po(ledger, body.item_ids)


def _no_duplicate(db: Session, invoice_no: str, except_id=None) -> None:
    """The ledger files every box under the invoice's number, so two invoices
    sharing one would print each other's purchase orders."""
    q = db.query(models.Invoice.id).filter(models.Invoice.invoice_no == invoice_no)
    if except_id:
        q = q.filter(models.Invoice.id != except_id)
    if q.first():
        raise HTTPException(409, f"Invoice {invoice_no} already exists — use another number.")


@router.post("", response_model=schemas.InvoiceOut, status_code=201, dependencies=[Depends(_write)])
def create_invoice(body: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    lock_ledger(db)
    _no_duplicate(db, body.invoice_no)
    # A line's packaging must be a type on the list, in its spelling (V-7.10.2).
    for l in body.lines:
        l.packaging = options.pack_name(db, l.packaging)
    inv = models.Invoice(
        invoice_no=body.invoice_no, date=body.date, buyer_id=body.buyer_id,
        rbi=body.rbi, serial_start=body.serial_start,
        packing_transports=body.packing_transports or {},
        vehicles={}, ship=calc.clean_ship(body.ship or {}), step_skip={},
        allocation=body.allocation,
    )
    inv.lines = _freeze_prices(db, _resolve_allocation(db, body.allocation, _in_sequence(db, body.lines)))
    # Carton numbers are allotted now, down the lines in sequence, and kept.
    inv.serial_next = calc.allot_serials(inv.lines, calc.serial_base(inv))
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _out(inv, _po_legs(db))


@router.put("/{iid}", response_model=schemas.InvoiceOut, dependencies=[Depends(_write)])
def update_invoice(iid: str, body: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    lock_ledger(db)
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    data = body.model_dump(exclude_unset=True)
    lines = data.pop("lines", None)
    renumber = bool(data.pop("renumber", None))
    if data.get("invoice_no") is not None:
        data["invoice_no"] = schemas.restated("invoice no", data["invoice_no"], inv.invoice_no, schemas._named)
    if data.get("date") is not None:
        data["date"] = schemas.restated("date", data["date"], inv.date, schemas._iso_date)
    if data.get("invoice_no") and data["invoice_no"] != inv.invoice_no:
        _no_duplicate(db, data["invoice_no"], except_id=inv.id)
    # Sent as null, what an invoice always has is left as it was.
    for k in ("allocation", "invoice_no", "date", "rbi", "serial_start", "vehicles", "ship",
              "step_skip", "packing_transports"):
        if k in data and data[k] is None:
            data.pop(k)
    # A change of mode with no lines sent restates the lines already there.
    if lines is None and data.get("allocation", inv.allocation or "fifo") != (inv.allocation or "fifo"):
        lines = [{"item_id": l.item_id, "supplier_id": l.supplier_id, "boxes": l.boxes,
                  "packaging": l.packaging} for l in inv.lines]
    # The carton numbers every line holds now, and the start they hang off.
    old_base = calc.serial_base(inv)
    old_next = calc.serial_next_of(inv)
    held = {l.item_id: f for l, f in zip(inv.lines, calc.line_serial_froms(inv.lines, old_base))}
    if "ship" in data:
        data["ship"] = calc.clean_ship(data["ship"] or {})
    for k, v in data.items():
        setattr(inv, k, v)
    # A new serial start moves every allotted number by the same amount, so
    # the gaps left by removed lines stay where they were.
    shift = calc.serial_base(inv) - old_base
    if lines is None and (shift or renumber):
        if renumber:
            inv.serial_next = calc.allot_serials(inv.lines, calc.serial_base(inv))
        else:
            for l in inv.lines:
                l.serial_from = held[l.item_id] + shift
            inv.serial_next = old_next + shift
    if lines is not None:
        # Kept in the order the editor sent them: an existing invoice's lines
        # stay where its cartons were numbered, and the edit form slots any
        # line it adds into its place in the item sequence. A line that does
        # not say which orders it comes off keeps the ones it had.
        had = {l.item_id: l.po_alloc for l in inv.lines}
        # A line that does not say how it is packed keeps what it had.
        had_pack = {l.item_id: l.packaging for l in inv.lines}
        mode = inv.allocation or "fifo"
        incoming = _resolve_allocation(db, mode, [
            SimpleNamespace(item_id=l["item_id"], supplier_id=l.get("supplier_id"), boxes=l.get("boxes", 0),
                            po_alloc=l["po_alloc"] if l.get("po_alloc") is not None
                            else _trimmed(had.get(l["item_id"]), l.get("boxes", 0)),
                            packaging=options.pack_name(db, l["packaging"], keep=had_pack.get(l["item_id"]))
                            if "packaging" in l else had_pack.get(l["item_id"]))
            for l in lines
        ], exclude_invoice_id=inv.id)
        now = {l.item_id: l.po_alloc for l in incoming}

        def same_orders(a, b) -> bool:
            # The same single order is the same price however many boxes it
            # gives; a mix is only the same mix if the split has not moved.
            a, b = _merged(a), _merged(b)
            if {p["po"] for p in a} != {p["po"] for p in b}:
                return False
            return len(a) <= 1 or {p["po"]: p["boxes"] for p in a} == {p["po"]: p["boxes"] for p in b}

        # An item already on this invoice keeps the price it was raised at —
        # unless its boxes were moved to other orders, which agreed their own.
        keep = {
            l.item_id: {
                "unit_value": l.unit_value, "value_mode": l.value_mode,
                "unit_fob100": l.unit_fob100, "fob_mode": l.fob_mode,
            }
            for l in inv.lines if l.unit_value is not None and same_orders(had.get(l.item_id), now.get(l.item_id))
        }
        new_lines = _freeze_prices(db, incoming, keep=keep, exclude_invoice_id=inv.id)
        # Carton numbers already allotted stay with their line; a removed
        # line's numbers are left unused, and a line new to the invoice takes
        # the numbers after the highest ever allotted — unless asked to renumber.
        if renumber:
            inv.serial_next = calc.allot_serials(new_lines, calc.serial_base(inv))
        else:
            clashes, inv.serial_next = calc.lock_serials(
                new_lines, {k: f + shift for k, f in held.items()}, calc.serial_base(inv), old_next + shift)
            if clashes:
                a, b = clashes[0]
                db.rollback()
                raise HTTPException(409, (
                    f"Carton serials would overlap: {_line_label(db, a)} runs into {_line_label(db, b)}. "
                    "Allotted serials stay fixed — lower the boxes, or choose “Renumber all cartons”."))
        inv.lines = new_lines
    db.commit()
    db.refresh(inv)
    return _out(inv, _po_legs(db))


# A recorded shipment is the evidence the FIFO ledger is built on; only an
# admin may delete one. Packing staff can still correct it by editing.
@router.delete("/{iid}", status_code=204, dependencies=[Depends(require_admin)])
def delete_invoice(iid: str, db: Session = Depends(get_db)):
    lock_ledger(db)
    inv = db.get(models.Invoice, iid)
    if inv:
        db.delete(inv)
        db.commit()
    return None
