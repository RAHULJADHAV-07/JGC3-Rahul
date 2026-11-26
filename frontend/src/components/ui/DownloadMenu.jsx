import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileDown, FileSpreadsheet, FileText, MoreVertical, X } from "lucide-react";
import { ShipSpin } from "./ShipLoader.jsx";
import { Layer, useOutside, usePlacement } from "./pickers.jsx";
import { useIsMobile } from "../../lib/useIsMobile.js";
import { useToast } from "../../providers/ToastProvider.jsx";

/* The three dots — every report and every document downloads the same three
   ways, and this is the one place they are offered, so no screen can give one
   format and forget another.

     onExcel / onPDF / onWord   what each does. A Word copy and a PDF are laid out
                                before they are written, so a handler may return
                                a promise; the dots turn until it is done. One
                                that fails says so instead of doing nothing. A
                                PDF handler that resolves to the file's name gets
                                a "PDF downloaded" toast.
     name                       what is being downloaded, for the menu's heading
                                and for anyone using a screen reader.

   Opens in the app's own layer like the dropdowns (pickers.jsx), so a scrolling
   list or a modal cannot clip it; on a phone it is a sheet from the bottom. */
const FORMATS = [
  { k: "onExcel", label: "Excel", hint: ".xlsx · formulas stay live", icon: FileSpreadsheet, tone: "xls" },
  { k: "onPDF", label: "PDF", hint: "saves straight to Downloads", icon: FileDown, tone: "pdf" },
  { k: "onWord", label: "Word", hint: ".docx · editable", icon: FileText, tone: "doc" },
];

export default function DownloadMenu({ name = "", disabled, size = "md", ...handlers }) {
  const mobile = useIsMobile();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState("");
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const live = useRef(true);
  const menuId = useId();
  const items = FORMATS.filter((f) => handlers[f.k]);

  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const close = useCallback((refocus) => {
    setOpen(false);
    if (refocus === true) btnRef.current?.focus();
  }, []);
  const pos = usePlacement(btnRef, open && !mobile, close, { minWidth: 224, maxHeight: 240, align: "end" });
  useOutside(open, [btnRef, panelRef], close);

  // Opened, the menu takes the keyboard.
  useEffect(() => {
    if (open && (mobile || pos)) panelRef.current?.querySelector(`[data-i="${active}"]`)?.focus({ preventScroll: true });
  }, [open, active, mobile, !!pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (f) => {
    close(true);
    setBusy(f.k);
    try {
      const done = await handlers[f.k]();
      /* A PDF is drawn and saved without a dialog (lib/pdfDirect.js), so say
         it has landed, and under what name. */
      if (f.k === "onPDF" && typeof done === "string") {
        toast(done === "print"
          ? "This browser could not make the PDF itself — choose “Save as PDF” in the print dialog"
          : `PDF downloaded — ${done}`);
      }
    } catch (e) {
      console.error(e);
      toast(`Could not build the ${f.label} file — try another format, or reload the page.`, { tone: "error" });
    } finally {
      if (live.current) setBusy("");
    }
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === "Tab") close();
  };

  const toggle = (e) => {
    e.stopPropagation();
    if (disabled || busy) return;
    setActive(0);
    setOpen((o) => !o);
  };

  const label = name ? `Download ${name}` : "Download";
  const list = (
    <div className="dl-menu" role="menu" id={menuId} aria-label={label}>
      {items.map((f, i) => (
        <button key={f.k} type="button" role="menuitem" data-i={i} tabIndex={i === active ? 0 : -1}
          className="dl-opt" onPointerEnter={() => setActive(i)} onClick={(e) => { e.stopPropagation(); choose(f); }}>
          <span className={`dl-ic dl-${f.tone}`}><f.icon size={15} strokeWidth={2.2} /></span>
          <span className="dl-t">{f.label}</span>
          <span className="dl-h">{f.hint}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button type="button" ref={btnRef} className={`icon-btn dl-btn dl-${size}${open ? " open" : ""}`}
        disabled={disabled} title={disabled ? "Nothing to download yet" : label} aria-label={label}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-busy={!!busy || undefined}
        onClick={toggle} onKeyDown={(e) => { if (!open && e.key === "ArrowDown") { e.preventDefault(); toggle(e); } }}>
        {busy ? <ShipSpin size={19} /> : <MoreVertical size={size === "sm" ? 16 : 18} strokeWidth={2.3} />}
      </button>
      {open && (mobile ? (
        <Layer>
          <div className="sel-veil" onClick={close} />
          <div className="sel-sheet" ref={panelRef} onKeyDown={onKey}>
            <div className="sel-sheet-head">
              <span>{label}</span>
              <button type="button" className="icon-btn bare" onClick={() => close(true)} aria-label="Close"><X size={17} /></button>
            </div>
            {list}
          </div>
        </Layer>
      ) : pos && (
        <Layer>
          <div className="sel-pop dl-pop" ref={panelRef} onKeyDown={onKey}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}>
            {list}
          </div>
        </Layer>
      ))}
    </>
  );
}
