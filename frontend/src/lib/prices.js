/* Dated prices — what Other Reports → Price list works with (V-7.9.0).

   The arithmetic here is the API's (backend/app/prices.py) line for line, so a
   margin worked out on screen is the figure that saves: half up, ₹ to the
   paisa, $ to four places, as the item form takes them. */

export const roundTo = (x, places) => {
  const f = 10 ** places;
  return Math.floor((Number(x) || 0) * f + 0.5 + 1e-9) / f;
};

/** The supplier's price plus `margin` percent. */
export const markedUp = (base, margin) => {
  const k = 1 + (Number(margin) || 0) / 100;
  return {
    unit_value: roundTo((Number(base.unit_value) || 0) * k, 2),
    value_mode: base.value_mode || "piece",
    unit_fob100: roundTo((Number(base.unit_fob100) || 0) * k, 4),
    fob_mode: base.fob_mode || "100",
  };
};

/** The margin a sell price comes to over a cost, in percent (one place). */
export const marginOf = (sell, cost) => {
  const c = Number(cost) || 0;
  return c ? roundTo(((Number(sell) || 0) / c - 1) * 100, 1) : null;
};

export const BASIS = { piece: "per pc", 100: "per 100", custom: "custom" };
export const basisLabel = (m) => BASIS[m || "piece"] || m;

/* Today on the office's calendar — the browser's own day, not UTC's (which
   in India is still yesterday until half past five in the morning). The
   latest day a price may hold from. */
export const localToday = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* A typed figure: "" is not one, "1." is 1. */
export const figure = (s) => {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const sameFig = (a, b, places = 6) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.5 * 10 ** -places;
