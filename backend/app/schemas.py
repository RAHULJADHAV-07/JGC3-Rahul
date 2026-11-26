"""Pydantic request/response schemas."""
from datetime import date as _date, datetime
from typing import Annotated, Literal, Optional, Any
from fastapi import HTTPException
from pydantic import AfterValidator, BeforeValidator, ConfigDict, EmailStr, Field, field_validator
from pydantic import BaseModel as _BaseModel


class BaseModel(_BaseModel):
    """Every schema. A figure written as text is read as a figure, and "nan"
    and "inf" read as ones too — past app/bodyguard.py, which sees only text.
    Stored, they close the list they are on to everybody, so none is taken."""
    model_config = ConfigDict(allow_inf_nan=False)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- What an order or an invoice may say ----------
# Counts are whole, never negative, and well inside what the database column
# holds; a date is a real one, written the way every register sorts it; a
# number something is filed under is never blank.

def _iso_date(v: str) -> str:
    v = str(v or "").strip()
    try:
        if len(v) != 10:
            raise ValueError
        _date.fromisoformat(v)
    except ValueError:
        raise ValueError("enter a date")
    return v


def _named(v: str) -> str:
    v = " ".join(str(v or "").split())
    if not v:
        raise ValueError("cannot be blank")
    return v


def _blank_is_none(v):
    return None if isinstance(v, str) and not v.strip() else v


IsoDate = Annotated[str, AfterValidator(_iso_date)]
DocNo = Annotated[str, Field(max_length=120), AfterValidator(_named)]
Boxes = Annotated[int, Field(ge=0, le=1_000_000)]
Pieces = Annotated[int, Field(ge=0, le=100_000_000)]
Serial = Annotated[int, Field(ge=0, le=1_000_000_000)]
Rate = Annotated[float, Field(ge=0, le=1_000_000)]
# The costing sheet's prices and charges, and the counts they are spread over:
# inside what the arithmetic and the column can hold.
Money = Annotated[float, Field(ge=-1e9, le=1e9)]
Count = Annotated[int, Field(ge=0, le=100_000_000)]
# What an edit sends back as it read it. A number or a date on file from before
# these rules must still save with the rest of the form, so only a *changed* one
# is held to them (`restated`).
OldDocNo = Annotated[str, Field(max_length=200_000)]
# A reference to another record: "" from a form's "—" means none is chosen.
Ref = Annotated[Optional[str], BeforeValidator(_blank_is_none)]


def restated(what: str, new: str, old: str, rule) -> str:
    """`new` as it may be stored: as it is if it is what is on file, held to
    `rule` if it was changed."""
    if new == old:
        return old
    try:
        out = rule(new)
    except ValueError as e:
        raise HTTPException(422, f"{what}: {e}")
    if len(out) > 120:
        raise HTTPException(422, f"{what}: should have at most 120 characters")
    return out


def changes(body: BaseModel, out: type[BaseModel]) -> dict:
    """What an edit really changes. A null sent for something that always has a
    value is left as it was: stored, it would be a record nothing can read."""
    def nullable(name: str) -> bool:
        field = out.model_fields.get(name)
        return field is not None and type(None) in getattr(field.annotation, "__args__", ())
    return {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None or nullable(k)}


# Every address that enters the system is validated and lower-cased here, at
# the edge, rather than by each route in turn. A malformed address is not a
# cosmetic problem: it reaches the mailer, where it is a header-injection
# surface and a way to have a passcode delivered somewhere unintended.
class _Email(BaseModel):
    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _normalise(cls, v):
        return str(v or "").strip().lower()


# ---------- Users & auth ----------
class UserOut(ORMModel):
    id: str
    email: str
    name: str
    first_name: str = ""
    last_name: str = ""
    role: str
    status: str
    access: list[str] = []
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    # True once the person has typed a mailed passcode at least once.
    email_verified: bool = False
    email_verified_at: Optional[datetime] = None
    # True while an admin-set password is still standing: the holder must
    # replace it before any other screen opens.
    must_change_password: bool = False
    # Shown in Setup -> Users so an admin can see an account under attack.
    hard_locked: bool = False
    locked_until: Optional[datetime] = None
    last_failed_at: Optional[datetime] = None

    @field_validator("email_verified", "must_change_password", "hard_locked", mode="before")
    @classmethod
    def _none_is_false(cls, v):
        return bool(v)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def _none_is_blank(cls, v):
        return v or ""


class LoginRequest(_Email):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """The session itself travels in an httpOnly cookie, which is why there is
    no token field here — a value the page can read is a value an injected
    script can steal."""
    user: UserOut
    # Present so one response shape covers both halves of the sign-in.
    otp_required: bool = False
    # True when this sign-in used a password an admin set: the app must send
    # the person straight to the change-password screen.
    must_change_password: bool = False


class OtpChallenge(BaseModel):
    """Returned instead of a session when a passcode must be typed first."""
    otp_required: bool = True
    challenge: str            # short-lived ticket naming the waiting account
    email: str                # masked, e.g. pr•••a@jaikvinglobal.com
    reason: str               # user_first_login | admin_session_renewal
    expires_in: int           # seconds the code stays valid
    resend_in: int            # seconds before "send it again" is allowed
    delivered: bool = True    # False when no mail transport is set up


class OtpVerifyRequest(BaseModel):
    challenge: str
    code: str


class OtpResendRequest(BaseModel):
    challenge: str


class StepUpGrant(BaseModel):
    """Proof an admin just answered a code — sent back on `X-Step-Up`."""
    grant: str
    expires_in: int


# ---------- Unlocking an account that locked itself ----------

class UnlockStartRequest(_Email):
    """"Unlock my account" — mails a code to the address on file.

    Answers the same way whether or not the account exists or is locked:
    telling a caller "no such account" here would hand back the enumeration
    the sign-in path was just closed against.
    """
    email: EmailStr


class UnlockVerifyRequest(BaseModel):
    challenge: str
    code: str


# ---------- Passwords ----------
#
# Passwords are not length-checked here: `app.passwords.check_password` runs in
# every route that takes one and answers with a single readable 400 listing all
# the broken rules, which a pydantic `min_length` would pre-empt with a 422.
# The `confirm_password` fields are checked in `app.passwords.check_match`.

class PasswordSet(BaseModel):
    """An admin setting somebody else's password."""
    new_password: str
    confirm_password: str = ""


class PasswordChange(BaseModel):
    """Somebody replacing their own password."""
    current_password: str
    new_password: str
    confirm_password: str = ""


class ForcedPasswordChange(BaseModel):
    """The same, on the one screen an account with `must_change_password` can
    reach. Separate because it is the only password route that does not ask
    for a step-up code — the person is holding a password an admin just gave
    them, and demanding a mailed code as well would strand anyone whose
    mailbox is the thing being set up."""
    current_password: str
    new_password: str
    confirm_password: str = ""


def full_name(first: str | None, last: str | None, name: str | None = None) -> str:
    """The one-line name every older reader uses, built from its two halves
    when they were given, or the single name when only that was."""
    joined = " ".join(p for p in (str(first or "").strip(), str(last or "").strip()) if p)
    return joined or str(name or "").strip()


def split_name(name: str | None) -> tuple[str, str]:
    parts = str(name or "").strip().split()
    return (parts[0] if parts else "", " ".join(parts[1:]))


class _Named(BaseModel):
    """A person's name, taken either in two halves (first / last — how Setup
    → Users asks for it now) or as one string (how older callers send it).
    Whichever arrives, all three fields leave here filled in."""
    name: str = ""
    first_name: str = ""
    last_name: str = ""

    @field_validator("name", "first_name", "last_name", mode="before")
    @classmethod
    def _strip(cls, v):
        return str(v or "").strip()

    def model_post_init(self, __context) -> None:
        if self.first_name or self.last_name:
            self.name = full_name(self.first_name, self.last_name)
        elif self.name:
            self.first_name, self.last_name = split_name(self.name)


class BootstrapRequest(_Named, _Email):
    """Creates the very first admin — only works while no users exist."""
    email: EmailStr
    password: str
    confirm_password: str = ""


class UserCreate(_Named, _Email):
    email: EmailStr
    password: str
    confirm_password: str = ""
    role: str = "user"
    status: str = "active"
    access: list[str] = []
    # An admin-set password is a delivery mechanism, not a secret. Left on, the
    # holder replaces it at first sign-in and only they know the live one.
    must_change_password: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    access: Optional[list[str]] = None

    @field_validator("email", mode="before")
    @classmethod
    def _normalise(cls, v):
        return str(v).strip().lower() if v else v


# ---------- Audit ----------
class AuditRow(ORMModel):
    id: str
    at: datetime
    action: str
    actor_email: Optional[str] = None
    target_label: Optional[str] = None
    ip: Optional[str] = None
    outcome: str = "ok"
    detail: Optional[dict] = None


# ---------- Supplier ----------
def _pct_or_none(v):
    """A percentage typed into a form: blank means "not set", anything else
    must be a number from 0 to 100."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise ValueError("GST % must be a number, e.g. 12")
    if n < 0 or n > 100:
        raise ValueError("GST % must be between 0 and 100")
    return n


class SupplierBase(BaseModel):
    code: str
    name: str
    place: str = ""
    gstin: str = ""
    addr: str = ""
    pin: str = ""
    state: str = ""
    weights: str = "auto"
    your_reference: str = ""
    # GST on this supplier's goods, in percent. None = not set (the documents
    # fall back to the HSN rate). Blank in the form arrives as "" — also None.
    gst_pct: Optional[float] = None

    @field_validator("your_reference", mode="before")
    @classmethod
    def _ref_none_is_blank(cls, v):
        return v or ""

    @field_validator("gst_pct", mode="before")
    @classmethod
    def _gst_blank_is_unset(cls, v):
        return _pct_or_none(v)


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    gst_pct: Optional[float] = None
    code: Optional[str] = None
    name: Optional[str] = None
    place: Optional[str] = None
    gstin: Optional[str] = None
    addr: Optional[str] = None
    pin: Optional[str] = None
    state: Optional[str] = None
    weights: Optional[str] = None
    your_reference: Optional[str] = None

    @field_validator("gst_pct", mode="before")
    @classmethod
    def _gst_blank_is_unset(cls, v):
        return _pct_or_none(v)


class Supplier(SupplierBase, ORMModel):
    id: str


# ---------- Buyer ----------
# The buyer's own letterhead — what their purchase order (document 17) prints
# around the goods. Blank is normal: only a buyer whose form we reproduce needs
# to have them filled in.
BUYER_LETTERHEAD = ("tagline", "ac_code", "abn", "acn", "tel", "fax", "web", "email", "po_box", "logo")


class BuyerBase(BaseModel):
    name: str
    brand: str = ""
    country: str = ""
    curr: str = "USD"
    ship_to: str = ""
    addr: str = ""
    order_no: str = ""
    our_reference: str = ""
    tagline: str = ""
    ac_code: str = ""
    abn: str = ""
    acn: str = ""
    tel: str = ""
    fax: str = ""
    web: str = ""
    email: str = ""
    po_box: str = ""
    logo: str = ""
    ports: list[str] = Field(default_factory=list)

    @field_validator("our_reference", *BUYER_LETTERHEAD, mode="before")
    @classmethod
    def _ref_none_is_blank(cls, v):
        return v or ""

    # Rows written before the column existed read back as NULL.
    @field_validator("ports", mode="before")
    @classmethod
    def _ports_none_is_empty(cls, v):
        if v and not isinstance(v, (list, tuple)):
            raise ValueError("send the ports as a list")
        return [str(p).strip() for p in (v or []) if p is not None and str(p).strip()]


class BuyerCreate(BuyerBase):
    pass


class BuyerUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    brand: Optional[str] = None
    country: Optional[str] = None
    curr: Optional[str] = None
    ship_to: Optional[str] = None
    addr: Optional[str] = None
    order_no: Optional[str] = None
    our_reference: Optional[str] = None
    tagline: Optional[str] = None
    ac_code: Optional[str] = None
    abn: Optional[str] = None
    acn: Optional[str] = None
    tel: Optional[str] = None
    fax: Optional[str] = None
    web: Optional[str] = None
    email: Optional[str] = None
    po_box: Optional[str] = None
    logo: Optional[str] = None
    ports: Optional[list[str]] = None


class Buyer(BuyerBase, ORMModel):
    id: str


# ---------- Item ----------
class ItemBase(BaseModel):
    code: str
    gd: str = ""
    oswin: str = ""
    gl: str = ""
    size: str = ""
    length: str = ""
    pack_unit: int = 0
    packing: int = 1
    description: str = ""
    barcode: str = ""
    hsn: str = ""
    volume: float = 0.0
    net_per_box: float = 0.0
    gross_per_box: float = 0.0
    bg_per_box: float = 0.0
    p_per_box: float = 0.0
    type_up: int = 0
    sticker_mult: float = 1.1
    sticker_round: bool = False
    stickers_fixed: float = 0.0
    label_spoilage: float = 1.0
    sticker_rule: str = "pp"
    uom: str = "PCS"
    value_mode: str = "piece"
    unit_value: float = 0.0
    fob_mode: str = "100"
    unit_fob100: float = 0.0
    group: str = ""
    source_sheet: str = ""
    supplier_id: Optional[str] = None
    packaging_type: str = "Cartons"

    @field_validator("packaging_type", mode="before")
    @classmethod
    def _packaging_default(cls, v):
        return str(v or "").strip() or "Cartons"


class _ItemFigures(BaseModel):
    """Packings, weights and prices are never below nothing. Asked only of what
    is being saved — a row already on file is still read as it stands."""
    @field_validator("pack_unit", "packing", "volume", "net_per_box", "gross_per_box", "bg_per_box",
                     "p_per_box", "type_up", "sticker_mult", "stickers_fixed", "label_spoilage",
                     "unit_value", "unit_fob100", check_fields=False)
    @classmethod
    def _not_below_nothing(cls, v):
        if v is not None and v < 0:
            raise ValueError("cannot be less than 0")
        if v is not None and v > 1_000_000_000:
            raise ValueError("is too large")
        return v


class ItemCreate(_ItemFigures, ItemBase):
    pass


class ItemUpdate(_ItemFigures):
    model_config = ConfigDict(extra="ignore")
    code: Optional[str] = None
    gd: Optional[str] = None
    oswin: Optional[str] = None
    gl: Optional[str] = None
    size: Optional[str] = None
    length: Optional[str] = None
    pack_unit: Optional[int] = None
    packing: Optional[int] = None
    description: Optional[str] = None
    barcode: Optional[str] = None
    hsn: Optional[str] = None
    volume: Optional[float] = None
    net_per_box: Optional[float] = None
    gross_per_box: Optional[float] = None
    bg_per_box: Optional[float] = None
    p_per_box: Optional[float] = None
    type_up: Optional[int] = None
    sticker_mult: Optional[float] = None
    sticker_round: Optional[bool] = None
    stickers_fixed: Optional[float] = None
    label_spoilage: Optional[float] = None
    sticker_rule: Optional[str] = None
    uom: Optional[str] = None
    value_mode: Optional[str] = None
    unit_value: Optional[float] = None
    fob_mode: Optional[str] = None
    unit_fob100: Optional[float] = None
    group: Optional[str] = None
    source_sheet: Optional[str] = None
    supplier_id: Optional[str] = None
    packaging_type: Optional[str] = None
    # The day a price changed here holds from — today if not given. Orders
    # dated before it keep the price before it (app/prices.py).
    price_from: Optional[IsoDate] = None


class Item(ItemBase, ORMModel):
    id: str
    # Figures that do not depend on an order quantity, so every screen shows
    # the same stickers-per-box without recomputing it locally.
    stickers_per_box: float = 0.0
    # The date the prices hold from and when they were saved (Price list).
    price_from: Optional[str] = None
    price_set_at: Optional[datetime] = None


class ItemDeriveIn(BaseModel):
    """Ask the API what one ordered quantity works out to. With a buyer and an
    order date the prices are the ones that order will be placed at (the
    supplier's price in force that day, the buyer's FOB where it has one)."""
    item_id: str
    qty: float = 0
    rbi: float = 0.0
    buyer_id: Ref = None
    date: Optional[str] = None


# ---------- Price list (Other Reports) ----------
Basis = Literal["piece", "100", "custom"]
Margin = Annotated[float, Field(ge=-100, le=10_000)]


class SupplierPriceIn(BaseModel):
    item_id: str = Field(max_length=64)
    unit_value: Optional[Rate] = None
    value_mode: Optional[Basis] = None
    unit_fob100: Optional[Rate] = None
    fob_mode: Optional[Basis] = None


class SupplierPricesIn(BaseModel):
    """One save of the supplier price list: the date the figures hold from,
    and each item changed."""
    effective: IsoDate
    note: str = Field("", max_length=300)
    rows: list[SupplierPriceIn] = Field(..., min_length=1, max_length=5000)


class BuyerPriceIn(BaseModel):
    item_id: str = Field(max_length=64)
    # margin — the supplier's price plus margin_pct; manual — the figures
    # given; none — back to the supplier's price.
    mode: Literal["margin", "manual", "none"]
    margin_pct: Optional[Margin] = None
    unit_value: Optional[Rate] = None
    value_mode: Optional[Basis] = None
    unit_fob100: Optional[Rate] = None
    fob_mode: Optional[Basis] = None


class BuyerPricesIn(BaseModel):
    effective: IsoDate
    note: str = Field("", max_length=300)
    margin_pct: Optional[Margin] = None
    rows: list[BuyerPriceIn] = Field(..., min_length=1, max_length=5000)


# ---------- Transport ----------
class TransportBase(BaseModel):
    name: str
    transport_id: str = ""
    supplier_id: Optional[str] = None
    supplier_ids: list[str] = Field(default_factory=list)

    # Rows written before the column existed read back as NULL.
    @field_validator("supplier_ids", mode="before")
    @classmethod
    def _none_is_empty(cls, v):
        return v or []


class TransportCreate(TransportBase):
    pass


class TransportUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    transport_id: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_ids: Optional[list[str]] = None


class Transport(TransportBase, ORMModel):
    id: str


# ---------- Purchase orders ----------
class POLineIn(BaseModel):
    item_id: str
    qty: Pieces


class POLineEdit(BaseModel):
    """A line of an order as it should now read. With its `id` it keeps that row."""
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = None
    item_id: Optional[str] = None
    qty: Pieces = 0

    @field_validator("qty", mode="before")
    @classmethod
    def _none_is_nothing(cls, v):
        return 0 if v is None else v


class PurchaseOrderCreate(BaseModel):
    po: DocNo
    date: IsoDate
    buyer_id: Ref = None
    rbi: Rate = 0.0
    lines: list[POLineIn] = Field(max_length=5000)


class PurchaseOrderUpdate(BaseModel):
    po: Optional[OldDocNo] = None
    date: Optional[OldDocNo] = None
    lines: Optional[list[POLineEdit]] = Field(None, max_length=5000)


# ---------- Invoices ----------
class PoPin(BaseModel):
    """Custom PO: this many of a line's boxes come off this purchase order."""
    po: str
    boxes: Boxes


class InvoiceLineIn(BaseModel):
    item_id: str
    supplier_id: Ref = None
    boxes: Boxes = 0
    # Custom PO only — ignored on a FIFO invoice.
    po_alloc: Optional[list[PoPin]] = Field(None, max_length=1000)


class InvoiceLineOut(ORMModel):
    id: str
    item_id: str
    supplier_id: Optional[str] = None
    boxes: int
    # The prices this line was invoiced at. NULL on invoices raised before the
    # columns existed — the reader falls back to the item master.
    unit_value: Optional[float] = None
    value_mode: Optional[str] = None
    unit_fob100: Optional[float] = None
    fob_mode: Optional[str] = None
    position: Optional[int] = None
    # The first carton number, allotted once and kept (calc.lock_serials).
    serial_from: Optional[int] = None
    # Custom PO only: [{po, boxes}] — NULL on a FIFO line.
    po_alloc: Optional[list[dict[str, Any]]] = None


class InvoiceCreate(BaseModel):
    invoice_no: DocNo
    date: IsoDate
    buyer_id: Ref = None
    rbi: Rate = 0.0
    serial_start: Serial = 0
    packing_transports: dict[str, Any] = Field(default_factory=dict)
    # Shipment terms picked while recording the packing — delivery and payment
    # terms, ports, the bank, the carting date and the booking number. The
    # same `ship` block the shipment details screen edits later.
    ship: dict[str, Any] = Field(default_factory=dict)
    allocation: Literal["fifo", "custom"] = "fifo"
    lines: list[InvoiceLineIn] = Field(max_length=5000)


class InvoiceUpdate(BaseModel):
    invoice_no: Optional[OldDocNo] = None
    date: Optional[OldDocNo] = None
    buyer_id: Ref = None
    rbi: Optional[Rate] = None
    serial_start: Optional[Serial] = None
    vehicles: Optional[dict[str, Any]] = None
    ship: Optional[dict[str, Any]] = None
    step_skip: Optional[dict[str, Any]] = None
    packing_transports: Optional[dict[str, Any]] = None
    allocation: Optional[Literal["fifo", "custom"]] = None
    lines: Optional[list[InvoiceLineIn]] = Field(None, max_length=5000)
    # True numbers every line afresh from the serial start, closing the gaps
    # removed lines left. Otherwise allotted carton numbers are kept.
    renumber: Optional[bool] = None


class AllocationPreviewIn(BaseModel):
    """Boxes about to be packed, asked "which orders would these clear?"
    before the invoice exists. `exclude_invoice_id` is the invoice being
    edited, whose own boxes must not count as already delivered."""
    date: str
    lines: list[InvoiceLineIn] = Field(default=[], max_length=5000)
    exclude_invoice_id: Optional[str] = None


class OpenOrdersIn(BaseModel):
    """Which purchase orders still hold these items — what Custom PO offers.
    `exclude_invoice_id` hands the invoice being edited its own boxes back."""
    item_ids: list[str] = Field(default=[], max_length=5000)
    exclude_invoice_id: Optional[str] = None


class InvoiceOut(ORMModel):
    id: str
    invoice_no: str
    date: str
    buyer_id: Optional[str] = None
    rbi: float
    serial_start: int
    # One past the highest carton number ever allotted (calc.serial_next_of).
    serial_next: Optional[int] = None
    vehicles: dict[str, Any] = {}
    ship: dict[str, Any] = {}
    step_skip: dict[str, Any] = {}
    packing_transports: dict[str, Any] = {}
    allocation: Optional[str] = "fifo"
    lines: list[InvoiceLineOut] = []
    # Computed
    status: Optional[str] = None
    # item id → [{po, date, boxes}]: the orders this invoice's boxes cleared.
    po_legs: dict[str, Any] = {}


# ---------- Costing ----------
class CostingLineBase(BaseModel):
    gd: str = ""
    code: str = ""
    dia: str = ""
    length: str = ""
    unit: int = 0
    box: int = 0
    price_old: float = 0.0
    price_new: float = 0.0
    boxes_fcl: int = 0
    fob_now: float = 0.0
    fob_old: float = 0.0
    item_id: Optional[str] = None


class CostingLineCreate(CostingLineBase):
    unit: Count = 0
    box: Count = 0
    price_old: Money = 0.0
    price_new: Money = 0.0
    boxes_fcl: Count = 0
    fob_now: Money = 0.0
    fob_old: Money = 0.0
    item_id: Ref = None


class CostingLineUpdate(BaseModel):
    gd: Optional[str] = None
    code: Optional[str] = None
    dia: Optional[str] = None
    length: Optional[str] = None
    unit: Optional[Count] = None
    box: Optional[Count] = None
    price_old: Optional[Money] = None
    price_new: Optional[Money] = None
    boxes_fcl: Optional[Count] = None
    fob_now: Optional[Money] = None
    fob_old: Optional[Money] = None
    item_id: Ref = None


class CostingLineOut(CostingLineBase, ORMModel):
    id: str
    computed: dict[str, Any] = {}

    # A row left without a figure reads as nil rather than closing the sheet.
    @field_validator("gd", "code", "dia", "length", mode="before")
    @classmethod
    def _none_is_blank(cls, v):
        return "" if v is None else v

    @field_validator("unit", "box", "price_old", "price_new", "boxes_fcl", "fob_now", "fob_old", mode="before")
    @classmethod
    def _none_is_nil(cls, v):
        return v if v is not None and v == v else 0


class CostParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    barcode_sheet: Money = 20.0    # ₹ per sheet of 125 stickers
    carton_price: Money = 0.0      # ₹ for the carton one box is packed in
    transport_fcl: Money = 15000.0  # ₹ inland transport per container
    other_fcl: Money = 50000.0      # ₹ clearing & other charges per container
    ex_rate: Money = 90.0           # ₹/$ used to express our cost in USD
    real_rate: Money = 94.5         # ₹/$ actually realised on the FOB price


class CostingPreviewIn(BaseModel):
    """Cost one item at a typed price without saving anything — the live
    working behind the costing screen's summary."""
    item_id: str
    price_new: Money = 0.0
    price_old: Optional[Money] = None
    boxes_fcl: Optional[Count] = None
    fob_now: Optional[Money] = None
    fob_old: Optional[Money] = None
