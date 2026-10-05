import { Field, Input, Select } from "../../components/ui/index.jsx";
import { useOptions } from "../../api/hooks.js";

/* The shipment's terms, picked from the lists kept under Setup → Additional
   settings rather than typed fresh on every invoice — so "FOB MUMBAI" is
   spelled one way on every paper.

   Used by record packing (the terms are known when the goods are packed) and
   by the shipment details, which write the same `ship` block of the invoice:

     terms     terms of delivery          payment   terms of payment
     pol       port of loading            pod       ship to port (discharge)
     bank…     the bank account the proceeds come in through
     cartingDate, bookingNo                proformaNo, proformaDate

   An invoice saved before the lists existed may hold a value that is not on
   a list; it is still offered, marked as such, so opening and saving the
   form never silently clears it. */

const LEGACY = "__current__";

function ListSelect({ label, value, options, onChange, hint, empty = "— select —" }) {
  const cur = value || "";
  const known = options.some((o) => o === cur);
  return (
    <Field label={label} hint={hint}>
      <Select value={cur} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={empty}>
        <option value="">{empty}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {cur && !known && <option value={cur}>{cur} (not on the list)</option>}
      </Select>
    </Field>
  );
}

/* What a bank account prints as on the papers — the name and branch on the
   "Through" line, the branch's town under it. */
export const bankLines = (b) => {
  const branch = String(b.branch || "").trim();
  const name = String(b.bank_name || "").trim();
  const bank = branch ? `${name}, ${branch}${/branch$/i.test(branch) ? "" : " BRANCH"}` : name;
  const where = [branch.replace(/\s*branch$/i, ""), b.city, b.state]
    .map((x) => String(x || "").trim()).filter(Boolean).join(", ");
  return { bank, bankAddr: where ? `${where} (INDIA)` : "" };
};

const last4 = (n) => String(n || "").slice(-4);

export default function ShipTermsFields({ ship, onSet, buyer, show = {} }) {
  const o = useOptions().data || {};
  const banks = o.banks || [];
  const set = (k) => (v) => onSet({ [k]: v });

  /* A buyer given ports under Setup → Buyers is offered those; otherwise
     every ship-to port on the list is. */
  const ports = (buyer?.ports?.length ? buyer.ports : null) || o.ports_ship_to || [];

  const bankId = ship.bankId && banks.some((b) => b.id === ship.bankId) ? ship.bankId : (ship.bank ? LEGACY : "");
  const pickBank = (id) => {
    if (id === LEGACY) return;
    if (!id) { onSet({ bankId: "", bank: "", bankAddr: "", bankAccount: "", bankIfsc: "" }); return; }
    const b = banks.find((x) => x.id === id);
    if (!b) return;
    onSet({ bankId: b.id, ...bankLines(b), bankAccount: b.account_no || "", bankIfsc: b.ifsc || "" });
  };

  const bookingClean = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  return (
    <>
      <ListSelect label="Terms of delivery" value={ship.terms} options={o.terms_delivery || []} onChange={set("terms")} />
      <ListSelect label="Terms of payment" value={ship.payment} options={o.terms_payment || []} onChange={set("payment")} />
      <ListSelect label="Port of loading" value={ship.pol} options={o.ports_loading || []} onChange={set("pol")} />
      <ListSelect label="Ship to port (discharge)" value={ship.pod} options={ports} onChange={set("pod")}
        hint={buyer?.ports?.length ? "This buyer's ports, from Setup → Buyers." : "From Setup → Additional settings → Ship to port."} />
      <Field label="Bank" hint="The account the proceeds come in through — Setup → Additional settings → Banks.">
        <Select value={bankId} onChange={(e) => pickBank(e.target.value)} aria-label="Bank" placeholder="— select —">
          <option value="">— select —</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name}{b.branch ? ` — ${b.branch}` : ""}{b.account_no ? ` · A/c …${last4(b.account_no)}` : ""}
            </option>
          ))}
          {bankId === LEGACY && <option value={LEGACY}>{ship.bank} (not on the list)</option>}
        </Select>
      </Field>
      {show.bankAddr && (
        <Field label="Bank address"><Input value={ship.bankAddr || ""} onChange={(e) => onSet({ bankAddr: e.target.value })} placeholder="GHATKOPAR (E), MUMBAI 400 077 (INDIA)" /></Field>
      )}
      <Field label="Carting date"><Input type="date" value={ship.cartingDate || ""} onChange={(e) => onSet({ cartingDate: e.target.value })} aria-label="Carting date" /></Field>
      <Field label="Booking number" hint="Letters and digits only.">
        <Input value={ship.bookingNo || ""} onChange={(e) => onSet({ bookingNo: bookingClean(e.target.value) })} placeholder="e.g. MUM0123456" autoComplete="off" />
      </Field>
      {show.proforma && (
        <>
          <Field label="Proforma number"><Input value={ship.proformaNo || ""} onChange={(e) => onSet({ proformaNo: e.target.value })} placeholder="e.g. JG/PI/26-27/014" /></Field>
          <Field label="Proforma date"><Input type="date" value={ship.proformaDate || ""} onChange={(e) => onSet({ proformaDate: e.target.value })} aria-label="Proforma date" /></Field>
        </>
      )}
    </>
  );
}
