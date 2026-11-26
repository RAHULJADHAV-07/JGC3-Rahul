"""Other Reports → Price list: the supplier and buyer price lists, dated.

See app/prices.py for how a dated price is read. What these routes guarantee:

  * a save names the date its prices hold from — never a day still to come;
  * an order or invoice already on the book never moves (every line keeps the
    price it was placed or invoiced at; lines too old to have kept one are
    given today's figures before the master changes);
  * any revision can be withdrawn, and any earlier price gone back to, without
    losing the history — a withdrawal only clears `active`.
"""
from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, schemas, prices as P

router = APIRouter(prefix="/api/prices", tags=["prices"])

_read = require("reports.prices", "setup.items")
_write = require("reports.prices")


def _who(user: models.User) -> str:
    return (user.name or user.email or "").strip()


def _effective(day: str) -> str:
    if day > P.today_iso():
        raise HTTPException(422, "The prices cannot hold from a day still to come — pick today or an earlier date.")
    return day


def _same(a: dict, b: dict) -> bool:
    return (abs(a["unit_value"] - b["unit_value"]) < 1e-9 and abs(a["unit_fob100"] - b["unit_fob100"]) < 1e-9
            and a["value_mode"] == b["value_mode"] and a["fob_mode"] == b["fob_mode"])


def _version_out(v: models.PriceVersion, current_id: str | None, computed: dict | None = None) -> dict:
    out = {
        "id": v.id, "revision_id": v.revision_id, "effective": v.effective or None, "mode": v.mode,
        "unit_value": v.unit_value, "value_mode": v.value_mode,
        "unit_fob100": v.unit_fob100, "fob_mode": v.fob_mode, "margin_pct": v.margin_pct,
        "active": bool(v.active), "current": v.id == current_id,
        "created_at": v.created_at, "created_by": v.created_by or "",
        "withdrawn_at": v.withdrawn_at, "withdrawn_by": v.withdrawn_by,
    }
    if computed:
        out.update({k: computed[k] for k in P.FIELDS})
    return out


def _buyer(db: Session, bid: str) -> models.Buyer:
    b = db.get(models.Buyer, bid)
    if not b:
        raise HTTPException(404, "Buyer not found")
    return b


# ---------------------------------------------------------------------------
# Reading the lists
# ---------------------------------------------------------------------------
@router.get("/supplier", dependencies=[Depends(_read)])
def supplier_list(db: Session = Depends(get_db)):
    """Per item: when its present price was set and by whom, and how many
    prices it has had. The figures themselves are the item master's."""
    out = {}
    by_item: dict = {}
    for v in db.query(models.PriceVersion).filter(models.PriceVersion.scope == "supplier").all():
        by_item.setdefault(v.item_id, []).append(v)
    for iid, vs in by_item.items():
        cur = P.pick(vs)
        out[iid] = {
            "item_id": iid, "versions": sum(1 for v in vs if v.mode != "baseline"),
            "effective": (cur.effective or None) if cur else None,
            "set_at": cur.created_at if cur and cur.mode != "baseline" else None,
            "set_by": (cur.created_by or "") if cur and cur.mode != "baseline" else "",
        }
    return {"today": P.today_iso(), "rows": list(out.values())}


@router.get("/buyer/{bid}", dependencies=[Depends(_read)])
def buyer_list(bid: str, on: str | None = None, db: Session = Depends(get_db)):
    """Every item's price to this buyer today. An item with no buyer price is
    sold at the supplier's FOB (`mode` "none"). `base` is the supplier's price
    a margin is worked on — on `on` when a date is given (the day a save will
    hold from), else today."""
    _buyer(db, bid)
    if on:
        try:
            schemas._iso_date(on)
        except ValueError:
            raise HTTPException(422, "on: enter a date")
    items = {i.id: i for i in db.query(models.Item).all()}
    sup = P._load(db, "supplier", items)
    buy = P._load(db, "buyer", items, bid)
    rows = []
    for iid, it in items.items():
        vs = buy.get(iid, [])
        cur = P.pick(vs)
        base = P.supplier_price(it, sup.get(iid, []))
        price = P.buyer_price(it, sup.get(iid, []), vs)
        mode = cur.mode if cur is not None else "none"
        rows.append({
            "item_id": iid, "mode": mode,
            "base": P.supplier_price(it, sup.get(iid, []), on) if on else base,
            "margin_pct": cur.margin_pct if cur is not None and mode == "margin" else None,
            **(price or base),
            "effective": (cur.effective or None) if cur is not None else None,
            "set_at": cur.created_at if cur is not None else None,
            "set_by": (cur.created_by or "") if cur is not None else "",
            "versions": len(vs),
        })
    last = (db.query(models.PriceRevision)
            .filter(models.PriceRevision.scope == "buyer", models.PriceRevision.buyer_id == bid,
                    models.PriceRevision.margin_pct.isnot(None))
            .order_by(models.PriceRevision.created_at.desc()).first())
    return {"buyer_id": bid, "today": P.today_iso(), "margin_pct": last.margin_pct if last else None, "rows": rows}


@router.get("/history/{iid}", dependencies=[Depends(_read)])
def history(iid: str, scope: str = Query("supplier", pattern="^(supplier|buyer)$"),
            buyer_id: str | None = None, db: Session = Depends(get_db)):
    """Every price one item has had on one list, newest first, the one in
    force marked. A buyer's margin prices are shown at what they came to on
    their own date."""
    it = db.get(models.Item, iid)
    if not it:
        raise HTTPException(404, "Item not found")
    if scope == "buyer":
        if not buyer_id:
            raise HTTPException(422, "Say which buyer")
        _buyer(db, buyer_id)
    sup = P._load(db, "supplier", [iid]).get(iid, [])
    vs = sup if scope == "supplier" else P._load(db, "buyer", [iid], buyer_id).get(iid, [])
    cur = P.pick(vs)
    notes = {r.id: r.note for r in db.query(models.PriceRevision)
             .filter(models.PriceRevision.id.in_([v.revision_id for v in vs if v.revision_id])).all()} if vs else {}
    out = []
    for v in sorted(vs, key=P._key, reverse=True):
        computed = None
        if scope == "buyer" and v.mode == "margin":
            computed = P.marked_up(P.supplier_price(it, sup, v.effective), v.margin_pct)
        elif scope == "buyer" and v.mode == "none":
            computed = P.supplier_price(it, sup, v.effective)
        row = _version_out(v, cur.id if cur else None, computed)
        row["note"] = notes.get(v.revision_id, "")
        out.append(row)
    return {"item_id": iid, "scope": scope, "buyer_id": buyer_id, "versions": out}


@router.get("/revisions", dependencies=[Depends(_read)])
def revisions(scope: str = Query("supplier", pattern="^(supplier|buyer)$"),
              buyer_id: str | None = None, db: Session = Depends(get_db)):
    """Each save of a list, newest first, with how many of its prices are
    still in the history as live (`active`) — a withdrawn revision has none."""
    q = db.query(models.PriceRevision).filter(models.PriceRevision.scope == scope)
    if scope == "buyer":
        q = q.filter(models.PriceRevision.buyer_id == buyer_id)
    revs = q.order_by(models.PriceRevision.created_at.desc()).limit(200).all()
    ids = [r.id for r in revs]
    total, live = Counter(), Counter()
    if ids:
        for rid, active in (db.query(models.PriceVersion.revision_id, models.PriceVersion.active)
                            .filter(models.PriceVersion.revision_id.in_(ids)).all()):
            total[rid] += 1
            live[rid] += 1 if active else 0
    return [{
        "id": r.id, "scope": r.scope, "buyer_id": r.buyer_id, "effective": r.effective,
        "margin_pct": r.margin_pct, "note": r.note or "", "created_at": r.created_at,
        "created_by": r.created_by or "", "items": total[r.id], "active": live[r.id],
        "status": "withdrawn" if not live[r.id] else ("partly" if live[r.id] < total[r.id] else "live"),
    } for r in revs]


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------
@router.post("/supplier")
def save_supplier(body: schemas.SupplierPricesIn, db: Session = Depends(get_db),
                  user: models.User = Depends(_write)):
    """New supplier prices, holding from `effective`. A row that says what is
    already in force on that day is not a change and is left out."""
    day = _effective(body.effective)
    wanted = {r.item_id: r for r in body.rows}
    items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(list(wanted))).all()}
    missing = [i for i in wanted if i not in items]
    if missing:
        raise HTTPException(404, f"Item {missing[0]} not found")
    versions = P._load(db, "supplier", items)

    changes = []
    for iid, r in wanted.items():
        it = items[iid]
        was = P.supplier_price(it, versions.get(iid, []), day)
        new = {
            "unit_value": was["unit_value"] if r.unit_value is None else float(r.unit_value),
            "value_mode": r.value_mode or was["value_mode"],
            "unit_fob100": was["unit_fob100"] if r.unit_fob100 is None else float(r.unit_fob100),
            "fob_mode": r.fob_mode or was["fob_mode"],
        }
        if not _same(was, new):
            changes.append((it, new))
    if not changes:
        return {"revision": None, "changed": 0, "items": []}

    ids = [it.id for it, _ in changes]
    P.freeze_snapshots(db, ids)
    P.ensure_baselines(db, [it for it, _ in changes], versions)
    now, who = datetime.utcnow(), _who(user)
    rev = models.PriceRevision(scope="supplier", effective=day, note=body.note.strip(), created_at=now, created_by=who)
    db.add(rev)
    db.flush()
    for it, new in changes:
        db.add(models.PriceVersion(revision_id=rev.id, scope="supplier", item_id=it.id, effective=day,
                                   mode="set", active=True, created_at=now, created_by=who, **new))
    P.refresh_masters(db, ids)
    db.commit()
    return {"revision": rev.id, "changed": len(changes), "items": ids, "effective": day}


@router.post("/buyer/{bid}")
def save_buyer(bid: str, body: schemas.BuyerPricesIn, db: Session = Depends(get_db),
               user: models.User = Depends(_write)):
    """New prices for one buyer, holding from `effective`. A margin price
    follows the supplier's price from then on; a manual one stays as typed."""
    _buyer(db, bid)
    day = _effective(body.effective)
    wanted = {r.item_id: r for r in body.rows}
    items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(list(wanted))).all()}
    missing = [i for i in wanted if i not in items]
    if missing:
        raise HTTPException(404, f"Item {missing[0]} not found")
    sup = P._load(db, "supplier", items)
    buy = P._load(db, "buyer", items, bid)

    changes = []
    for iid, r in wanted.items():
        it = items[iid]
        cur = P.pick(buy.get(iid, []), day)
        cur_mode = cur.mode if cur is not None else "none"
        base = P.supplier_price(it, sup.get(iid, []), day)
        if r.mode == "margin":
            if r.margin_pct is None:
                raise HTTPException(422, f"{it.gd or it.code}: give the margin")
            if cur_mode == "margin" and abs((cur.margin_pct or 0) - r.margin_pct) < 1e-9:
                continue
            changes.append((it, {"mode": "margin", "margin_pct": float(r.margin_pct),
                                 **P.marked_up(base, r.margin_pct)}))
        elif r.mode == "manual":
            now_price = P.buyer_price(it, sup.get(iid, []), buy.get(iid, []), day) or base
            new = {
                "unit_value": now_price["unit_value"] if r.unit_value is None else float(r.unit_value),
                "value_mode": r.value_mode or now_price["value_mode"],
                "unit_fob100": now_price["unit_fob100"] if r.unit_fob100 is None else float(r.unit_fob100),
                "fob_mode": r.fob_mode or now_price["fob_mode"],
            }
            if cur_mode == "manual" and _same(P._of(cur, base), new):
                continue
            changes.append((it, {"mode": "manual", "margin_pct": None, **new}))
        else:
            if cur_mode == "none":
                continue
            changes.append((it, {"mode": "none", "margin_pct": None, **base}))
    if not changes:
        return {"revision": None, "changed": 0, "items": []}

    now, who = datetime.utcnow(), _who(user)
    rev = models.PriceRevision(scope="buyer", buyer_id=bid, effective=day, margin_pct=body.margin_pct,
                               note=body.note.strip(), created_at=now, created_by=who)
    db.add(rev)
    db.flush()
    for it, new in changes:
        db.add(models.PriceVersion(revision_id=rev.id, scope="buyer", buyer_id=bid, item_id=it.id,
                                   effective=day, active=True, created_at=now, created_by=who, **new))
    db.commit()
    return {"revision": rev.id, "changed": len(changes), "items": [it.id for it, _ in changes], "effective": day}


# ---------------------------------------------------------------------------
# Going back
# ---------------------------------------------------------------------------
def _settle(db: Session, scope: str, item_ids) -> None:
    """After versions were switched on or off: the item master follows the
    supplier list, with the oldest lines frozen first. Buyer prices are read
    when an order is placed, so they need nothing more."""
    if scope == "supplier":
        P.refresh_masters(db, item_ids)
    db.commit()


def _toggle(db: Session, versions, on: bool, user: models.User) -> None:
    now, who = datetime.utcnow(), _who(user)
    for v in versions:
        v.active = on
        v.withdrawn_at = None if on else now
        v.withdrawn_by = None if on else who


@router.post("/revisions/{rid}/withdraw")
def withdraw_revision(rid: str, db: Session = Depends(get_db), user: models.User = Depends(_write)):
    """Undo one whole save: each of its prices stops being in force, and the
    one before it (or a later one) is in force again."""
    rev = db.get(models.PriceRevision, rid)
    if not rev:
        raise HTTPException(404, "Price revision not found")
    vs = db.query(models.PriceVersion).filter(models.PriceVersion.revision_id == rid).all()
    ids = [v.item_id for v in vs]
    if rev.scope == "supplier":
        P.freeze_snapshots(db, ids)
    _toggle(db, [v for v in vs if v.active], False, user)
    _settle(db, rev.scope, ids)
    return {"revision": rid, "items": len(ids)}


@router.post("/revisions/{rid}/reinstate")
def reinstate_revision(rid: str, db: Session = Depends(get_db), user: models.User = Depends(_write)):
    rev = db.get(models.PriceRevision, rid)
    if not rev:
        raise HTTPException(404, "Price revision not found")
    vs = db.query(models.PriceVersion).filter(models.PriceVersion.revision_id == rid).all()
    ids = [v.item_id for v in vs]
    if rev.scope == "supplier":
        P.freeze_snapshots(db, ids)
    _toggle(db, [v for v in vs if not v.active], True, user)
    _settle(db, rev.scope, ids)
    return {"revision": rid, "items": len(ids)}


@router.post("/versions/{vid}/restore")
def restore_version(vid: str, db: Session = Depends(get_db), user: models.User = Depends(_write)):
    """Go back to this price: every later price of the same item on the same
    list is withdrawn, and this one is in force again."""
    v = db.get(models.PriceVersion, vid)
    if not v:
        raise HTTPException(404, "Price not found")
    q = db.query(models.PriceVersion).filter(models.PriceVersion.scope == v.scope,
                                             models.PriceVersion.item_id == v.item_id)
    if v.scope == "buyer":
        q = q.filter(models.PriceVersion.buyer_id == v.buyer_id)
    same = q.all()
    later = [x for x in same if x.active and P._key(x) > P._key(v)]
    if v.scope == "supplier":
        P.freeze_snapshots(db, [v.item_id])
    _toggle(db, later, False, user)
    if not v.active:
        _toggle(db, [v], True, user)
    _settle(db, v.scope, [v.item_id])
    return {"version": vid, "withdrawn": len(later)}
