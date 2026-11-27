from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require, active_user
from .. import models, schemas, calc, options, prices as P

router = APIRouter(prefix="/api/items", tags=["items"])

# Masters are reference data every page reads; only Setup may change them.
_read = active_user
_write = require("setup.items")


def _out(obj: models.Item) -> schemas.Item:
    """Attach the quantity-independent derived figure so the UI never has to
    re-implement the sticker rules."""
    row = schemas.Item.model_validate(obj)
    row.stickers_per_box = calc.stickers_per_box(obj)
    return row


@router.get("", response_model=list[schemas.Item], dependencies=[Depends(_read)])
def list_items(
    db: Session = Depends(get_db),
    supplier_id: str | None = Query(None, description="Only this supplier's range"),
    group: str | None = Query(None, description="Only this product group"),
    q: str | None = Query(None, description="Match code, GD, OSWIN, description or barcode"),
):
    """The full item master, 285 rows out of the client's workbook.

    Filters are applied in SQL so the Setup table and the order screen can
    stay responsive on the whole range; with no filter the entire master is
    returned, ordered the way the workbook groups it."""
    query = db.query(models.Item)
    if supplier_id:
        query = query.filter(models.Item.supplier_id == supplier_id)
    if group:
        query = query.filter(models.Item.group == group)
    if q:
        like = f"%{q.strip()}%"
        # Searching "hansa" should find that supplier's range, not nothing —
        # so a supplier's code or name matches its items too.
        sup_ids = [s.id for s in db.query(models.Supplier).filter(or_(
            models.Supplier.code.ilike(like), models.Supplier.name.ilike(like),
        )).all()]
        terms = [
            models.Item.code.ilike(like), models.Item.gd.ilike(like),
            models.Item.oswin.ilike(like), models.Item.gl.ilike(like),
            models.Item.description.ilike(like), models.Item.barcode.ilike(like),
            models.Item.group.ilike(like), models.Item.hsn.ilike(like),
        ]
        if sup_ids:
            terms.append(models.Item.supplier_id.in_(sup_ids))
        query = query.filter(or_(*terms))
    rows = query.order_by(models.Item.group, models.Item.gd, models.Item.code).all()
    # The item sequence every list is read in: Oswin by bore, then VP-PP,
    # Hansa-PP, Hansa-GRN, VP-GRN (Setup → Additional settings).
    rows.sort(key=options.item_rank(db))
    return [_out(r) for r in rows]


@router.get("/grouped", dependencies=[Depends(_read)])
def grouped_items(
    db: Session = Depends(get_db),
    supplier_id: str | None = None,
    group: str | None = None,
    q: str | None = None,
):
    """The master keyed the way an order is placed: one product, then the
    suppliers who make it.

    The workbook keeps a sheet per supplier, so the same GD code appears once
    per supplier that supplies it. Order entry asks "how many pieces, from
    which supplier?", so the rows are folded back together here — one entry
    per GD code carrying a variant per supplier.
    """
    rows = list_items(db=db, supplier_id=supplier_id, group=group, q=q)
    groups: dict = {}
    for it in rows:
        key = (it.gd or it.code).strip().upper()
        g = groups.setdefault(key, {
            "key": key, "gd": it.gd or it.code, "code": it.code,
            "description": it.description, "group": it.group,
            "uom": it.uom, "packing": it.packing, "variants": [],
        })
        g["variants"].append({
            "item_id": it.id, "supplier_id": it.supplier_id, "code": it.code,
            "packing": it.packing, "uom": it.uom, "volume": it.volume,
            "unit_value": it.unit_value, "unit_fob100": it.unit_fob100,
            "fob_mode": it.fob_mode, "source_sheet": it.source_sheet,
        })
        if not g["description"] and it.description:
            g["description"] = it.description
    out = list(groups.values())
    for g in out:
        # One packing figure is shown per product; flag it when the suppliers
        # box the same code differently so nobody assumes they match.
        packs = {v["packing"] for v in g["variants"]}
        g["mixed_packing"] = len(packs) > 1
    out.sort(key=lambda g: g["gd"])
    return out


@router.get("/groups", dependencies=[Depends(_read)])
def item_groups(db: Session = Depends(get_db)):
    """Distinct product groups with a count — the workbook's own families
    (PP Moulded, GRN Range, 15 MM (1/2"), HYDRO TUBES, …)."""
    rows = db.query(models.Item.group, models.Item.supplier_id).all()
    counts: dict[str, int] = {}
    for group, _ in rows:
        counts[group or ""] = counts.get(group or "", 0) + 1
    return [{"group": g, "count": c} for g, c in sorted(counts.items())]


@router.post("", response_model=schemas.Item, status_code=201, dependencies=[Depends(_write)])
def create_item(body: schemas.ItemCreate, db: Session = Depends(get_db)):
    obj = models.Item(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _out(obj)


@router.put("/{iid}", response_model=schemas.Item)
def update_item(iid: str, body: schemas.ItemUpdate, db: Session = Depends(get_db),
                user: models.User = Depends(_write)):
    obj = db.get(models.Item, iid)
    if not obj:
        raise HTTPException(404, "Item not found")
    before = P.master_prices(obj)
    edits = schemas.changes(body, schemas.Item)
    since = edits.pop("price_from", None) or P.today_iso()
    your_ref = edits.pop("price_ref", None) or ""
    edits.pop("price_set_at", None)
    after = {**before, **{k: edits[k] for k in P.FIELDS if k in edits}}
    after = {"unit_value": float(after["unit_value"] or 0), "value_mode": after["value_mode"] or "piece",
             "unit_fob100": float(after["unit_fob100"] or 0), "fob_mode": after["fob_mode"] or "100"}
    moved = any((abs(after[k] - before[k]) > 1e-9) if k in ("unit_value", "unit_fob100") else after[k] != before[k]
                for k in P.FIELDS)
    if moved:
        if since > P.today_iso():
            raise HTTPException(422, "The new price cannot hold from a day still to come — pick today or an earlier date.")
        if obj.price_from and since < obj.price_from:
            raise HTTPException(422, f"This item's price has held from {obj.price_from[8:10]}/{obj.price_from[5:7]}/{obj.price_from[:4]} — "
                                     "a change here holds from that day or later. An earlier price goes in on Other Reports → Price list.")
        # Lines too old to have kept a price of their own read the master:
        # they keep the figure they have printed until now.
        P.freeze_snapshots(db, [iid])
    for k, v in edits.items():
        if k not in P.FIELDS:
            setattr(obj, k, v)
    if moved:
        # A price changed here is a revision on the price list, from `since`.
        P.record_setup_change(db, obj, before, after, since, (user.name or user.email or "").strip(), your_ref)
    db.commit()
    db.refresh(obj)
    return _out(obj)


@router.delete("/{iid}", status_code=204, dependencies=[Depends(_write)])
def delete_item(iid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Item, iid)
    if not obj:
        return None
    # Deleting an item that an order or a packed invoice points at would break
    # that history — say so instead of letting the foreign key fail.
    orders = db.query(models.PurchaseOrderLine).filter_by(item_id=iid).count()
    packed = db.query(models.InvoiceLine).filter_by(item_id=iid).count()
    if orders or packed:
        raise HTTPException(409, f"{obj.code} is used on {orders} order line(s) and "
                                 f"{packed} packing line(s) — it cannot be deleted.")
    db.delete(obj)
    db.commit()
    return None
