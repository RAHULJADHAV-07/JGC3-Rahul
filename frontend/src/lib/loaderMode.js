/* Which way the goods on screen travel — what the loading picture shows
   (V-7.9.0): a ship by sea (the default), a cargo plane by air, a container
   truck by land.

   A screen that is dealing with one invoice or one purchase order says so with
   `useTransportLoader(mode)` for as long as it is open: the shipment wizard,
   the invoice windows, record packing, a purchase order, the documents of an
   invoice or an order. The innermost screen open wins — a window over a page
   speaks for itself — and closing it hands back to the page beneath. With
   nothing open that has a mode, every loader is the ship.

   An invoice carries its mode (`ship.mode`); a purchase order is the mode most
   of its delivered boxes went by (the API's `po.mode`, calc.po_mode). */
import { useEffect, useSyncExternalStore } from "react";
import { MODE_KEYS } from "./modes.js";

const open = [];                 // the screens that have said, innermost last
const listeners = new Set();
const tell = () => listeners.forEach((f) => f());

const clean = (m) => (MODE_KEYS.includes(m) ? m : "water");

/** The mode the loaders show now. */
export const currentLoaderMode = () => (open.length ? open[open.length - 1].mode : "water");

function subscribe(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** For a loader: the mode to draw, kept up to date. */
export function useLoaderMode() {
  return useSyncExternalStore(subscribe, currentLoaderMode, () => "water");
}

/** For a screen: "the goods here go by `mode`" while it is open. */
export function useTransportLoader(mode) {
  useEffect(() => {
    const entry = { mode: clean(mode) };
    open.push(entry);
    tell();
    return () => {
      const i = open.indexOf(entry);
      if (i >= 0) open.splice(i, 1);
      tell();
    };
  }, [mode]);
}

/* For the checks: start again with nothing open. */
export function resetLoaderModes() {
  open.length = 0;
  tell();
}
