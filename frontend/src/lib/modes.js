/* Mode of transport — sea (water), air or land.

   Setup → Additional settings ticks which modes each port of loading, ship-to
   port and term of delivery serves (`options.modes`), and a shipment offers
   only the entries ticked for its own mode. The mode lives on the invoice's
   `ship` block (`ship.mode`); an invoice without one is a sea shipment — every
   invoice before V-7.5.0 was. Land follows the sea rules and papers until a
   land document set is supplied.

   Mirrored in backend/app/calc.py (SHIP_MODES, ship_mode, container_done,
   ship_step_done) — keep the two in step. */

export const MODES = [
  { k: "water", label: "Water", long: "Sea freight" },
  { k: "air", label: "Air", long: "Air freight" },
  { k: "land", label: "Land", long: "Road / rail" },
];
export const MODE_KEYS = MODES.map((m) => m.k);
export const modeLabel = (k) => MODES.find((m) => m.k === k)?.label || "Water";

/* The lists whose entries carry modes. */
export const MODE_LISTS = ["terms_delivery", "ports_loading", "ports_ship_to"];

export const shipMode = (ship) => {
  const m = String(ship?.mode || "").trim().toLowerCase();
  return MODE_KEYS.includes(m) ? m : "water";
};

/* The modes one entry serves. Nothing saved means it was added before modes
   existed: it serves sea, as everything did then. */
export const entryModes = (options, key, value) => {
  const m = options?.modes?.[key]?.[value];
  return Array.isArray(m) && m.length ? m : ["water"];
};

/* Entries added before modes existed, whose modes have not been confirmed. */
export const unconfirmed = (options, key) => {
  if (!MODE_LISTS.includes(key)) return [];
  const saved = options?.modes?.[key] || {};
  return (options?.[key] || []).filter((v) => !(saved[v] && saved[v].length));
};

/* A list as one mode sees it. A list without modes is offered whole. */
export const listFor = (options, key, mode) => {
  const all = options?.[key] || [];
  if (!MODE_LISTS.includes(key)) return all;
  return all.filter((v) => entryModes(options, key, v).includes(mode));
};

/* What a shipment's step 2 and step 3 need before they count as done. */
export const flightLegs = (ship) => (Array.isArray(ship?.flights) ? ship.flights : [])
  .filter((f) => f && String(f.no || "").trim());

export function containerDone(ship, skip) {
  if (skip?.container) return true;
  const s = ship || {};
  if (shipMode(s) === "air") return !!(s.pol && s.pod);
  return !!(s.container && s.seal);
}

export function shipStepDone(ship, skip) {
  if (skip?.ship) return true;
  const s = ship || {};
  if (shipMode(s) === "air") return !!(s.awbNo && s.awbDate && s.airline && flightLegs(s).length);
  return !!(s.blNo && s.blDate && s.vessel);
}

/* "Shipment details complete" — what the documents screen and the invoice
   modal check before saying the post-shipment fields will print. */
export function shipComplete(ship) {
  const s = ship || {};
  if (shipMode(s) === "air") return !!(s.awbNo && s.airline && flightLegs(s).length && s.pod);
  return !!(s.blNo && s.vessel && s.container && s.pod);
}

/* What identifies the consignment once loaded: the container by sea, the air
   waybill by air. */
export const carriageRef = (ship) => (shipMode(ship) === "air"
  ? (ship?.awbNo ? `AWB ${ship.awbNo}` : "")
  : ship?.container || "");

/* What step 2 and step 3 are called for each mode. */
export const STEP_LABELS = {
  water: { s2: "Container details", s3: "BL / shipping" },
  land: { s2: "Container details", s3: "BL / shipping" },
  air: { s2: "Cargo & airports", s3: "AWB / flight" },
};

/* ---- the papers each mode is shipped on ---------------------------------

   Sea-only papers are the ones about a container or a bill of lading; the air
   set (Docs/JG_Air_Docs) replaces the shipping instructions with the AWB
   instructions and adds the declaration of origin. Everything else is common,
   and the shared papers print their air wording when the shipment goes by air. */
export const SEA_ONLY_DOCS = ["24", "26", "27", "34"];
export const AIR_ONLY_DOCS = ["16A", "26A"];

export const docInMode = (no, mode) => (mode === "air"
  ? !SEA_ONLY_DOCS.includes(String(no))
  : !AIR_ONLY_DOCS.includes(String(no)));

export const docsForMode = (nos, mode) => (nos || []).filter((no) => docInMode(no, mode));

/* The checklist the shipment screens show: what the app generates for this
   mode, in the order the work runs, and what arrives from outside. */
export const MODE_CHECKLIST = {
  air: {
    generated: ["11", "10", "12", "13", "14", "15", "16A", "17", "18", "19", "21", "23", "26A", "30", "31", "33"],
    external: [
      ["Air waybill (AWB)", "Issued by the airline / forwarder against the AWB instructions (26A)."],
      ["Shipping bill", "Filed by the CHA at the air cargo complex — its number and date go on step 3."],
      ["Freight certificate", "The forwarder's statement of the air freight — sent to the buyer with the originals (30)."],
      ["Certificate of origin", "From the chamber / DGFT portal — listed on the letter to the buyer (30)."],
    ],
  },
  water: {
    generated: ["11", "10", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "26", "27", "29", "30", "31", "33", "34"],
    external: [
      ["Bill of lading", "Issued by the shipping line against the shipping instructions (26)."],
      ["Shipping bill", "Filed by the CHA — its number and date go on step 3."],
    ],
  },
};
MODE_CHECKLIST.land = MODE_CHECKLIST.water;
