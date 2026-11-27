import { useEffect, useState } from "react";
import {
  Truck, Container, Ship, Plane, Check, ChevronRight, ChevronLeft, SkipForward, Lock, Plus, Trash2, AlertTriangle,
} from "lucide-react";
import { Modal, Btn, Field, Input, Select, Pill, Note, Step } from "../../components/ui/index.jsx";
import { useIsMobile } from "../../lib/useIsMobile.js";
import { useSuppliers, useTransports, useInvoiceMutations, useBuyers, useOptions } from "../../api/hooks.js";
import ShipTermsFields, { ModePicker, PortFields, modeMismatches } from "./ShipTermsFields.jsx";
import ModeDocs from "./ModeDocs.jsx";
import { useToast } from "../../providers/ToastProvider.jsx";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import { transportsFor } from "../../lib/transports.js";
import { STEP_LABELS, containerDone, shipStepDone, shipMode, modeLabel } from "../../lib/modes.js";
import { useTransportLoader } from "../../lib/loaderMode.js";

/* Shipment wizard — three gated steps that move an invoice from
   "Ready to dispatch" → "Dispatched" → "Ready to Ship" → "Shipped".
   Each step unlocks only once the previous one is filled or skipped.
     1  Vehicle details (supplier-wise)
     2  The mode of transport (Water / Air / Land), the ports for that mode,
        then the container (sea, land) or the cargo and skids (air)
     3  BL / shipping details by sea, AWB / flight details by air
   The status shown here mirrors calc.invoice_status on the server, and the
   step rules lib/modes.js (containerDone, shipStepDone). Land runs on the sea
   form until a land document set is supplied. */

const EMPTY_VEHICLE = { vehicleNo: "", transportId: "", transportName: "", source: "", dest: "" };
const MAX_FLIGHTS = 6;

const rowDone = (v) => !!(v && v.vehicleNo && v.source && v.dest);

/* Where the trucks deliver by default: the CFS at Nhava Sheva by sea, the air
   forwarder at Saki Naka by air (Docs/JG_Air_Docs/Despatch Instruction.pdf). */
const defaultDest = (ship) => (shipMode(ship) === "air" ? "Saki Naka" : "Nhava Sheva");

export default function ShipmentWizard({ inv, onClose }) {
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const options = useOptions().data || {};
  const buyer = (useBuyers().data || []).find((b) => b.id === inv.buyer_id);
  const { update } = useInvoiceMutations();
  const toast = useToast();

  const mobile = useIsMobile();

  const supById = (id) => suppliers.find((s) => s.id === id) || {};
  const sups = [...new Set((inv.lines || []).map((l) => l.supplier_id).filter(Boolean))];

  const [vehicles, setVehicles] = useState(() => {
    const v = { ...(inv.vehicles || {}) };
    sups.forEach((s) => {
      const ex = v[s] || {};
      const opts = transportsFor(transports, s);
      const tid = ex.transportId || (inv.packing_transports || {})[s] || opts[0]?.id || "";
      const t = transports.find((x) => x.id === tid);
      const sp = supById(s);
      v[s] = {
        ...EMPTY_VEHICLE, ...ex,
        transportId: tid,
        transportName: ex.transportName || t?.name || "",
        source: ex.source || sp?.place || "",
        dest: ex.dest || defaultDest(inv.ship),
      };
    });
    return v;
  });
  /* The form can open before Setup's lists have arrived, and those defaults are
     only worked out once — so fill in what is still blank when they land, and
     keep each transporter's name as Setup now spells it. */
  useEffect(() => {
    if (!transports.length && !suppliers.length) return;
    setVehicles((prev) => {
      const next = { ...prev };
      sups.forEach((s) => {
        const ex = next[s] || EMPTY_VEHICLE;
        const tid = ex.transportId || (inv.packing_transports || {})[s] || transportsFor(transports, s)[0]?.id || "";
        next[s] = {
          ...ex, transportId: tid,
          transportName: transports.find((x) => x.id === tid)?.name || ex.transportName || "",
          source: ex.source || supById(s)?.place || "",
        };
      });
      return next;
    });
  }, [transports, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ship, setShip] = useState({ ...(inv.ship || {}) });
  const [skip, setSkip] = useState({ ...(inv.step_skip || {}) });
  const [step, setStep] = useState(1);
  const mode = shipMode(ship);
  // Choosing Air or Land here turns the loading picture at once.
  useTransportLoader(mode);
  const air = mode === "air";
  const labels = STEP_LABELS[mode];

  const done1 = skip.vehicle || (sups.length > 0 && sups.every((s) => rowDone(vehicles[s])));
  const done2 = containerDone(ship, skip);
  const done3 = shipStepDone(ship, skip);
  const unlocked = { 1: true, 2: done1, 3: done1 && done2 };
  const status = done1 && done2 && done3 ? "Shipped"
    : done1 && done2 ? "Ready to Ship"
      : done1 ? "Dispatched" : "Ready to dispatch";
  const mismatched = modeMismatches(ship, options);

  const setVeh = (sid, k, val) => setVehicles((p) => ({ ...p, [sid]: { ...p[sid], [k]: val } }));
  const setSh = (k, val) => setShip((p) => ({ ...p, [k]: val }));
  const setShMany = (patch) => setShip((p) => ({ ...p, ...patch }));
  const setSkp = (k, val) => setSkip((p) => ({ ...p, [k]: val }));
  const pickTransport = (sid, tid) => {
    const t = transports.find((x) => x.id === tid);
    setVehicles((p) => ({ ...p, [sid]: { ...p[sid], transportId: tid, transportName: t?.name || "" } }));
  };

  /* Flight legs — "MH195 DT 11.11.2026, MH 127 DT 13.11.2026". There is always
     one row to type into; an empty row is not saved. */
  const legs = Array.isArray(ship.flights) && ship.flights.length ? ship.flights : [{ no: "", date: "" }];
  const setLeg = (i, k, v) => setSh("flights", legs.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLeg = () => legs.length < MAX_FLIGHTS && setSh("flights", [...legs, { no: "", date: "" }]);
  const dropLeg = (i) => setSh("flights", legs.filter((_, j) => j !== i));

  const save = () => {
    const body = { ...ship, mode };
    if (Array.isArray(body.flights)) body.flights = body.flights.filter((f) => String(f.no || "").trim());
    update.mutate(
      { id: inv.id, body: { vehicles, ship: body, step_skip: skip } },
      { onSuccess: () => { toast(`Shipment updated · ${inv.invoice_no} — ${status}`); onClose(); } },
    );
  };

  const STEPS = [
    { n: 1, label: "Vehicle details", icon: Truck, done: done1, key: "vehicle" },
    { n: 2, label: labels.s2, icon: air ? Plane : Container, done: done2, key: "container" },
    { n: 3, label: labels.s3, icon: air ? Plane : Ship, done: done3, key: "ship" },
  ];

  const mobileSave = mobile && (
    <div className="wiz-save">
      <Btn size="lg" icon={Check} disabled={update.isPending} onClick={save}>
        {update.isPending ? "Saving…" : "Save shipment details"}
      </Btn>
    </div>
  );
  const skipBox = (k) => (
    <label className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
      <input type="checkbox" checked={!!skip[k]} onChange={(e) => setSkp(k, e.target.checked)} />
      <SkipForward size={13} /> Skip this step for now
    </label>
  );
  const mismatchNote = mismatched.length > 0 && (
    <Note tone="amber" icon={AlertTriangle}>
      {mismatched.join(", ")} {mismatched.length === 1 ? "is" : "are"} not ticked for {modeLabel(mode)} in Setup → Additional settings — pick again, or tick {modeLabel(mode)} on {mismatched.length === 1 ? "it" : "them"} there.
    </Note>
  );
  // What the skids add, shown beside the weights as the papers will total it.
  const totalWt = (Number(ship.grossWt) || 0) + (Number(ship.skidWt) || 0);

  return (
    <Modal title={`Shipment · ${inv.invoice_no}`} icon={air ? Plane : Ship} onClose={onClose}
      footer={<>
        <span className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
          <Pill tone="teal">{modeLabel(mode)}</Pill>
          Status: <Pill tone={INV_STATUS_TONE[status] || ""}>{status}</Pill>
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {step > 1 && <Btn variant="ghost" icon={ChevronLeft} onClick={() => setStep(step - 1)}>Back</Btn>}
          {step < 3 && <Btn iconRight={ChevronRight} disabled={!unlocked[step + 1]} onClick={() => setStep(step + 1)}>Next step</Btn>}
          <Btn icon={Check} disabled={update.isPending} onClick={save}>{update.isPending ? "Saving…" : "Save"}</Btn>
        </div>
      </>}>
      <div className="wiz-steps">
        {STEPS.map((s) => (
          <button key={s.n} className={`wiz-step${step === s.n ? " on" : ""}${unlocked[s.n] ? "" : " locked"}`}
            onClick={() => unlocked[s.n] && setStep(s.n)}>
            <span className="wiz-ic">{unlocked[s.n] ? (s.done ? <Check size={14} /> : <s.icon size={14} />) : <Lock size={13} />}</span>
            <span className="grow" style={{ textAlign: "left" }}>
              <span className="wiz-t">Step {s.n}</span>
              <span className="wiz-s">{s.label}</span>
            </span>
            {s.done && !skip[s.key] && <Pill tone="green">done</Pill>}
            {skip[s.key] && <Pill tone="amber">skipped</Pill>}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="stack">
          <Step n="1" title="Vehicle details — supplier-wise" hint="One vehicle per supplier on this invoice. Pick the transporter you added under Setup → Transport." />
          {sups.map((sid) => {
            const sp = supById(sid);
            const opts = transportsFor(transports, sid);
            return (
              <div key={sid} className="wiz-card">
                <div className="row" style={{ marginBottom: 10, gap: 8 }}>
                  <Pill tone="teal">{sp.code}</Pill>
                  <span style={{ fontWeight: 650, color: "var(--ink)" }}>{sp.name}</span>
                </div>
                <div className="grid-2">
                  <Field label="Transporter" hint="Selected from the transports added for this supplier.">
                    <Select value={vehicles[sid]?.transportId || ""} onChange={(e) => pickTransport(sid, e.target.value)}>
                      <option value="">— select transport —</option>
                      {opts.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.transport_id}</option>)}
                      {!opts.length && <option value="" disabled>No transport added for {sp.code}</option>}
                    </Select>
                  </Field>
                  <Field label="Vehicle number"><Input value={vehicles[sid]?.vehicleNo || ""} onChange={(e) => setVeh(sid, "vehicleNo", e.target.value)} placeholder="e.g. MH-04-KL-2231" /></Field>
                  <Field label="Source"><Input value={vehicles[sid]?.source || ""} onChange={(e) => setVeh(sid, "source", e.target.value)} placeholder={sp.place || "Origin"} /></Field>
                  <Field label="Destination"><Input value={vehicles[sid]?.dest || ""} onChange={(e) => setVeh(sid, "dest", e.target.value)} placeholder={defaultDest(ship)} /></Field>
                </div>
              </div>
            );
          })}
          {!sups.length && <Note tone="amber">This invoice has no supplier on any line — add one under Packing before filling vehicle details.</Note>}
          {!done1 && !skip.vehicle && sups.length > 0 && (
            <Note tone="amber">
              Enter a vehicle number, source and destination for {sups.filter((s) => !rowDone(vehicles[s])).map((s) => supById(s).code).join(", ")} to unlock Step 2.
            </Note>
          )}
          {done1 && !skip.vehicle && <Note tone="teal">Vehicle details complete — Step 2 ({labels.s2.toLowerCase()}) is unlocked.</Note>}
          {skipBox("vehicle")}
          {mobileSave}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <Step n="2" title={air ? "Mode, airports & cargo" : "Mode, ports & container"}
            hint={air
              ? "Pick Air, then the airport of loading and the destination — that moves the invoice to “Ready to Ship”."
              : "Pick the mode first — the ports offered follow it. Filling the container & seal moves the invoice to “Ready to Ship”."} />
          <div className="grid-2">
            <ModePicker value={mode} onChange={(m) => setSh("mode", m)} />
          </div>
          <div className="grid-2">
            <PortFields ship={ship} onSet={setShMany} buyer={buyer} />
          </div>
          {mismatchNote}
          {air ? (
            <div className="grid-2">
              <Field label="Shipping mark" hint="Just the mark — the papers add NOS and the carton numbers. Left empty, no mark is printed."><Input value={ship.marks || ""} onChange={(e) => setSh("marks", e.target.value)} placeholder="e.g. GDW / PERTH" /></Field>
              <Field label="No & kinds of pkgs"><Input value={ship.pkgs || ""} onChange={(e) => setSh("pkgs", e.target.value)} placeholder="10 CARTONS" /></Field>
              <Field label="No. of skids" hint="The pallets the cartons travel strapped to — printed as “(02 SKIDS)”.">
                <Input type="number" min="0" step="1" value={ship.skids ?? ""} onChange={(e) => setSh("skids", e.target.value)} placeholder="0" />
              </Field>
              <Field label="Skid weight (kg)" hint="Added to the gross weight for the total weight on the papers.">
                <Input type="number" min="0" step="0.001" value={ship.skidWt ?? ""} onChange={(e) => setSh("skidWt", e.target.value)} placeholder="0.000" />
              </Field>
              <Field label="Nett wt (kg)"><Input type="number" step="0.001" value={ship.netWt || ""} onChange={(e) => setSh("netWt", e.target.value)} placeholder="from the packing list" /></Field>
              <Field label="Gross wt (kg)" hint={totalWt && ship.skidWt ? `Total with skids: ${totalWt.toFixed(3)} kg` : undefined}>
                <Input type="number" step="0.001" value={ship.grossWt || ""} onChange={(e) => setSh("grossWt", e.target.value)} placeholder="from the packing list" />
              </Field>
              <Field label="Carton dimensions" hint="For the AWB instructions.">
                <Input value={ship.dims || ""} onChange={(e) => setSh("dims", e.target.value)} placeholder="40 X 40 X 40 CMS" />
              </Field>
            </div>
          ) : (
            <div className="grid-2">
              <Field label="Container No."><Input value={ship.container || ""} onChange={(e) => setSh("container", e.target.value)} placeholder="e.g. OOCU0793142" /></Field>
              <Field label="Seal No."><Input value={ship.seal || ""} onChange={(e) => setSh("seal", e.target.value)} placeholder="e.g. IND-0054079" /></Field>
              <Field label="Shipping mark" hint="Just the mark — the papers add NOS and the carton numbers. Left empty, no mark is printed."><Input value={ship.marks || ""} onChange={(e) => setSh("marks", e.target.value)} placeholder="e.g. GDW" /></Field>
              <Field label="No & kinds of pkgs"><Input value={ship.pkgs || ""} onChange={(e) => setSh("pkgs", e.target.value)} placeholder="421 PACKAGES" /></Field>
              <Field label="Nett wt (kg)"><Input type="number" step="0.001" value={ship.netWt || ""} onChange={(e) => setSh("netWt", e.target.value)} placeholder="0.000" /></Field>
              <Field label="Gross wt (kg)"><Input type="number" step="0.001" value={ship.grossWt || ""} onChange={(e) => setSh("grossWt", e.target.value)} placeholder="0.000" /></Field>
            </div>
          )}
          {mode === "land" && <Note tone="teal">Land shipments use the sea form and papers for now — container, seal and BL / consignment note.</Note>}
          {skipBox("container")}
          {mobileSave}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          {air ? (
            <>
              <Step n="3" title="AWB & flight details" hint="The air waybill number, its date, the airline and a flight mark the invoice “Shipped”." />
              <div className="grid-2">
                <Field label="AWB No."><Input value={ship.awbNo || ""} onChange={(e) => setSh("awbNo", e.target.value)} placeholder="e.g. 232-19269504" /></Field>
                <Field label="AWB Date"><Input type="date" value={ship.awbDate || ""} onChange={(e) => setSh("awbDate", e.target.value)} /></Field>
                <Field label="Airline"><Input value={ship.airline || ""} onChange={(e) => setSh("airline", e.target.value)} placeholder="e.g. MALAYSIA AIRLINES" /></Field>
                <Field label="AWB type" hint="As the forwarder books it — e.g. MAWB, HAWB.">
                  <Input value={ship.awbType || ""} onChange={(e) => setSh("awbType", e.target.value)} placeholder="optional" />
                </Field>
              </div>
              {/* The two letters carry the client's own letter number and date at their head. */}
              <div className="grid-2">
                <Field label="Despatch letter No." hint="Printed at the head of the despatch instructions.">
                  <Input value={ship.diRef || ""} onChange={(e) => setSh("diRef", e.target.value)} placeholder="e.g. JG/2026/1151" />
                </Field>
                <Field label="Despatch letter date"><Input type="date" value={ship.diDate || ""} onChange={(e) => setSh("diDate", e.target.value)} /></Field>
                <Field label="Letter to buyer No." hint="Printed at the head of the letter sending the originals.">
                  <Input value={ship.ltbRef || ""} onChange={(e) => setSh("ltbRef", e.target.value)} placeholder="e.g. JG/2026/1155" />
                </Field>
                <Field label="Letter to buyer date"><Input type="date" value={ship.ltbDate || ""} onChange={(e) => setSh("ltbDate", e.target.value)} /></Field>
              </div>
              <div className="wiz-card">
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 650, color: "var(--ink)", fontSize: 13 }}>Flights</span>
                  <Btn size="sm" variant="ghost" icon={Plus} disabled={legs.length >= MAX_FLIGHTS} onClick={addLeg}>Add a leg</Btn>
                </div>
                <div className="stack-sm">
                  {legs.map((l, i) => (
                    <div key={i} className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                      <Field label={`Flight ${i + 1} number`} style={{ flex: "1 1 160px" }}>
                        <Input value={l.no || ""} onChange={(e) => setLeg(i, "no", e.target.value.toUpperCase())} placeholder="e.g. MH195" />
                      </Field>
                      <Field label="Date" style={{ flex: "1 1 160px" }}>
                        <Input type="date" value={l.date || ""} onChange={(e) => setLeg(i, "date", e.target.value)} />
                      </Field>
                      {legs.length > 1 && (
                        <button type="button" className="icon-btn bare" title={`Remove flight ${i + 1}`} onClick={() => dropLeg(i)} style={{ marginBottom: 6 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid-2">
                <Field label="S/B No."><Input value={ship.sbNo || ""} onChange={(e) => setSh("sbNo", e.target.value)} /></Field>
                <Field label="S/B Date"><Input type="date" value={ship.sbDate || ""} onChange={(e) => setSh("sbDate", e.target.value)} /></Field>
                <Field label="Place of delivery" hint="Printed as the port of destination — leave blank to use the ship-to port.">
                  <Input value={ship.deliveryPlace || ""} onChange={(e) => setSh("deliveryPlace", e.target.value)} placeholder={ship.pod || "e.g. PERTH"} />
                </Field>
                <Field label="Freight">
                  <Select value={ship.freightTerms || "PREPAID"} onChange={(e) => setSh("freightTerms", e.target.value)} aria-label="Freight">
                    <option value="PREPAID">Prepaid</option>
                    <option value="COLLECT">Collect</option>
                  </Select>
                </Field>
                <Field label="Approx freight (US$)" hint="Sold CFR / CIF, this comes off the invoice value to give the FOB printed on the invoices and the letter to the buyer.">
                  <Input type="number" min="0" step="0.01" value={ship.freight ?? ""} onChange={(e) => setSh("freight", e.target.value)} placeholder="e.g. 352.50" />
                </Field>
                <Field label="Notify party 2" hint="Only if the AWB names a second party.">
                  <Input value={ship.notify2 || ""} onChange={(e) => setSh("notify2", e.target.value)} placeholder="optional" />
                </Field>
                <ShipTermsFields ship={ship} onSet={setShMany} buyer={buyer} show={{ bankAddr: true, proforma: true, ports: false }} />
                <Field label="Exchange rate ₹/$" hint="The rate the customs invoice and the bank documents are converted at.">
                  <Input className="rate" type="number" step="0.01" value={ship.exRate || ""} onChange={(e) => setSh("exRate", e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Step n="3" title="BL & shipping details" hint="BL number, date and vessel mark the invoice “Shipped”." />
              <div className="grid-2">
                <Field label="BL No."><Input value={ship.blNo || ""} onChange={(e) => setSh("blNo", e.target.value)} placeholder="e.g. SFPM2605165498" /></Field>
                <Field label="BL Date"><Input type="date" value={ship.blDate || ""} onChange={(e) => setSh("blDate", e.target.value)} /></Field>
                <Field label="S/B No."><Input value={ship.sbNo || ""} onChange={(e) => setSh("sbNo", e.target.value)} /></Field>
                <Field label="S/B Date"><Input type="date" value={ship.sbDate || ""} onChange={(e) => setSh("sbDate", e.target.value)} /></Field>
                <Field label="Ship name (vessel / voyage)"><Input value={ship.vessel || ""} onChange={(e) => setSh("vessel", e.target.value)} placeholder="CAPE SYROS 092E" /></Field>
                {/* Terms and bank come off the lists in Setup → Additional
                    settings (the ports are picked in step 2); carting date,
                    booking and proforma are typed here. */}
                <ShipTermsFields ship={ship} onSet={setShMany} buyer={buyer} show={{ bankAddr: true, proforma: true, ports: false }} />
                <Field label="Exchange rate ₹/$" hint="The rate the customs invoice and the bank documents are converted at.">
                  <Input className="rate" type="number" step="0.01" value={ship.exRate || ""} onChange={(e) => setSh("exRate", e.target.value)} />
                </Field>
              </div>
            </>
          )}
          {mismatchNote}

          {/* What the e-invoice portal hands back, and the two carriage boxes
              the customs invoice (18) prints. Blank is normal — the form leaves
              them empty, as it does on a shipment that has not been registered
              yet. */}
          <Step n="3" title="e-Invoice & carriage" hint="Printed on the customs invoice. Leave blank until the portal returns them." />
          <div className="grid-2">
            <Field label="IRN No"><Input value={ship.irn || ""} onChange={(e) => setSh("irn", e.target.value)} /></Field>
            <Field label="Other reference(s)"><Input value={ship.otherRef || ""} onChange={(e) => setSh("otherRef", e.target.value)} /></Field>
            <Field label="Ack No"><Input value={ship.ackNo || ""} onChange={(e) => setSh("ackNo", e.target.value)} /></Field>
            <Field label="Ack date"><Input value={ship.ackDt || ""} onChange={(e) => setSh("ackDt", e.target.value)} placeholder="04-05-2026  3:51:00 PM" /></Field>
            <Field label="Pre-carriage by"><Input value={ship.preCarriage || ""} onChange={(e) => setSh("preCarriage", e.target.value)} /></Field>
            <Field label="Place of receipt"><Input value={ship.receiptPlace || ""} onChange={(e) => setSh("receiptPlace", e.target.value)} /></Field>
          </div>
          {skipBox("ship")}
          <ModeDocs mode={mode} invId={inv.id} onOpen={onClose} />
          <Note tone="teal">Once all three steps are filled or skipped, the invoice status becomes <b>Shipped</b> and every downstream document is populated.</Note>
          {mobileSave}
        </div>
      )}
    </Modal>
  );
}
