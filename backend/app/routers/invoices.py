from datetime import datetime
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, schemas, calc, options

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

_read = require("shipment.packing", "shipment.details", "shipment.reports", "pre-shipment", "post-shipment", "home")
_write = require("shipment.packing", "shipment.details")


def _out(inv: models.Invoice, legs: dict | None = None) -> schemas.InvoiceOut:
    out = schemas.InvoiceOut.model_validate(inv)
    out.status = calc.invoice_status(inv)
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
        p = keep.get(l.item_id) or calc.invoiced_prices(it, l.boxes, open_demands.get(l.item_id, []))
        out.append(models.InvoiceLine(
            item_id=l.item_id, supplier_id=l.supplier_id, boxes=l.boxes,
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
    last = (len(calc.DEFAULT_SEQUENCE) + 99,)
    return sorted(lines, key=lambda l: rank(items[l.item_id]) if l.item_id in items else last)


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
        lines=[SimpleNamespace(item_id=l.item_id, supplier_id=l.supplier_id, boxes=l.boxes)
               for l in body.lines if l.boxes and l.item_id in items],
    )
    ledger = calc.compute_ledger(db.query(models.PurchaseOrderLine).all(), invoices + [draft], items)
    out = {}
    for l in draft.lines:
        b = ledger.get(l.item_id)
        if not b:
            continue
        legs = [{"po": d["po"], "date": d["date"], "boxes": d["cleared"][_PREVIEW],
                 "closes": d["remaining"] == 0}
                for d in b["demands"] if d["cleared"].get(_PREVIEW)]
        spare = sum(e["boxes"] for e in b["excess"] if e["invoice_no"] == _PREVIEW)
        out[l.item_id] = {"legs": legs, "spare": spare}
    return out


@router.post("", response_model=schemas.InvoiceOut, status_code=201, dependencies=[Depends(_write)])
def create_invoice(body: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    inv = models.Invoice(
        invoice_no=body.invoice_no, date=body.date, buyer_id=body.buyer_id,
        rbi=body.rbi, serial_start=body.serial_start,
        packing_transports=body.packing_transports or {},
        vehicles={}, ship=dict(body.ship or {}), step_skip={},
    )
    inv.lines = _freeze_prices(db, _in_sequence(db, body.lines))
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _out(inv, _po_legs(db))


@router.put("/{iid}", response_model=schemas.InvoiceOut, dependencies=[Depends(_write)])
def update_invoice(iid: str, body: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    data = body.model_dump(exclude_unset=True)
    lines = data.pop("lines", None)
    for k, v in data.items():
        setattr(inv, k, v)
    if lines is not None:
        # An item already on this invoice keeps the price it was raised at.
        keep = {
            l.item_id: {
                "unit_value": l.unit_value, "value_mode": l.value_mode,
                "unit_fob100": l.unit_fob100, "fob_mode": l.fob_mode,
            }
            for l in inv.lines if l.unit_value is not None
        }
        # Kept in the order the editor sent them: an existing invoice's lines
        # stay where its cartons were numbered, and the edit form slots any
        # line it adds into its place in the item sequence.
        incoming = [SimpleNamespace(item_id=l["item_id"], supplier_id=l.get("supplier_id"),
                                    boxes=l.get("boxes", 0)) for l in lines]
        inv.lines = _freeze_prices(db, incoming, keep=keep, exclude_invoice_id=inv.id)
    db.commit()
    db.refresh(inv)
    return _out(inv, _po_legs(db))


@router.delete("/{iid}", status_code=204, dependencies=[Depends(_write)])
def delete_invoice(iid: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if inv:
        db.delete(inv)
        db.commit()
    return None
