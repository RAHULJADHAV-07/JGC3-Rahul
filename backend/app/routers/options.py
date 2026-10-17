"""Setup → Additional settings, over HTTP.

Everyone signed in may read the lists — the shipment details, the packing
screen and the item form all offer them as dropdowns. Changing them is a
Setup job: either Setup right will do, since the lists serve the items master
(packaging types) and the trading partners (terms, ports, banks) alike.
"""
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import active_user, require
from .. import options

router = APIRouter(prefix="/api/options", tags=["options"])

_read = active_user
_write = require("setup.items", "setup.parties")
_write_items = require("setup.items")


@router.get("", dependencies=[Depends(_read)])
def all_options(db: Session = Depends(get_db)):
    """Every list in one call — what the forms load once and keep."""
    out = {key: options.get_list(db, key) for key in options.LISTS}
    out["banks"] = options.get_banks(db)
    out["item_sequence"] = options.get_sequence(db)
    out["labels"] = {key: label for key, (label, _) in options.LISTS.items()}
    return out


# ---------- the plain lists ----------

class ListBody(BaseModel):
    values: list[str] = []


@router.put("/list/{key}", dependencies=[Depends(_write)])
def save_list(key: str, body: ListBody, db: Session = Depends(get_db)):
    if key not in options.LISTS:
        raise HTTPException(404, "No such list")
    return {"key": key, "values": options.save_list(db, key, body.values)}


# ---------- banks ----------

class BankIn(BaseModel):
    bank_name: str
    account_no: str
    # Asked twice when an account is created — a mistyped digit here sends a
    # buyer's payment to somebody else's account.
    confirm_account_no: str | None = None
    ifsc: str = ""
    branch: str = ""
    state: str = ""
    city: str = ""

    @field_validator("bank_name", "branch", "state", "city", mode="before")
    @classmethod
    def _text(cls, v):
        return " ".join(str(v or "").split())[:options.MAX_TEXT]

    @field_validator("account_no", "confirm_account_no", mode="before")
    @classmethod
    def _acct(cls, v):
        return None if v is None else "".join(str(v).split())

    @field_validator("ifsc", mode="before")
    @classmethod
    def _ifsc(cls, v):
        return "".join(str(v or "").split()).upper()


def _check(body: BankIn, creating: bool) -> dict:
    if not body.bank_name:
        raise HTTPException(400, "Enter the bank's name")
    if not body.account_no:
        raise HTTPException(400, "Enter the account number")
    if not body.account_no.isalnum() or len(body.account_no) > 34:
        raise HTTPException(400, "An account number is letters and digits only, up to 34 of them")
    if creating or body.confirm_account_no is not None:
        if body.confirm_account_no != body.account_no:
            raise HTTPException(400, "The two account numbers do not match — retype them")
    if body.ifsc and not options.IFSC_RE.match(body.ifsc):
        raise HTTPException(400, "An IFSC code is 11 characters: 4 letters, a zero, then 6 letters or digits (e.g. HDFC0000123)")
    return {k: getattr(body, k) for k in ("bank_name", "account_no", "ifsc", "branch", "state", "city")}


@router.post("/banks", status_code=201, dependencies=[Depends(_write)])
def add_bank(body: BankIn, db: Session = Depends(get_db)):
    banks = options.get_banks(db)
    rec = {"id": uuid4().hex[:12], **_check(body, creating=True)}
    if any(b.get("account_no") == rec["account_no"] for b in banks):
        raise HTTPException(409, "That account number is already on the list")
    options.save_banks(db, banks + [rec])
    return rec


@router.put("/banks/{bid}", dependencies=[Depends(_write)])
def edit_bank(bid: str, body: BankIn, db: Session = Depends(get_db)):
    banks = options.get_banks(db)
    at = next((i for i, b in enumerate(banks) if b.get("id") == bid), None)
    if at is None:
        raise HTTPException(404, "Bank not found")
    old = banks[at]
    # A changed account number is a new account as far as a typo goes, so it
    # is asked twice again; leaving it as it was needs no second entry.
    if body.account_no != old.get("account_no") and body.confirm_account_no is None:
        raise HTTPException(400, "Retype the new account number to confirm it")
    rec = {"id": bid, **_check(body, creating=False)}
    if any(b.get("account_no") == rec["account_no"] and b.get("id") != bid for b in banks):
        raise HTTPException(409, "That account number is already on the list")
    banks[at] = rec
    options.save_banks(db, banks)
    return rec


@router.delete("/banks/{bid}", status_code=204, dependencies=[Depends(_write)])
def remove_bank(bid: str, db: Session = Depends(get_db)):
    banks = options.get_banks(db)
    options.save_banks(db, [b for b in banks if b.get("id") != bid])
    return None


# ---------- the item master's columns ----------

@router.get("/item-columns", dependencies=[Depends(_read)])
def item_columns(db: Session = Depends(get_db)):
    """Setup → Items' saved column layout. `cols` is null until somebody saves
    one — and while it is null, nothing is held back from any report."""
    return options.get_item_columns(db)


@router.put("/item-columns", dependencies=[Depends(_write_items)])
def save_item_columns(cols: list[dict] | None = Body(None, embed=True), db: Session = Depends(get_db)):
    clean = None
    if cols is not None:
        clean = []
        for c in cols[:200]:
            key = str(c.get("key") or "").strip()[:60]
            if not key:
                continue
            clean.append({
                "key": key,
                "label": str(c.get("label") or key).strip()[:options.MAX_TEXT],
                "visible": bool(c.get("visible", True)),
                "custom": bool(c.get("custom", False)),
            })
    return options.save_item_columns(db, clean)


# ---------- the documents' columns ----------

@router.get("/doc-columns", dependencies=[Depends(_read)])
def doc_columns(db: Session = Depends(get_db)):
    """Setup → Document columns: the columns each document hides or deletes.
    Every document built in the app reads this, so everyone signed in may."""
    return options.get_doc_columns(db)


@router.put("/doc-columns", dependencies=[Depends(_write)])
def save_doc_columns(rules: list[dict] = Body([], embed=True), db: Session = Depends(get_db)):
    return options.save_doc_columns(db, rules)


# ---------- the item sequence ----------

@router.put("/item-sequence", dependencies=[Depends(_write_items)])
def save_item_sequence(body: ListBody, db: Session = Depends(get_db)):
    return {"values": options.save_sequence(db, body.values)}
