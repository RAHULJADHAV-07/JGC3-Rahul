import {
  Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo,
  useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useIsMobile } from "../../lib/useIsMobile.js";

/* ============================================================
   The app's own dropdown, date picker and top scrollbar.

   The browser's <select> and <input type="date"> draw themselves however the
   operating system likes — a grey Windows list on one machine, a bare white
   pop-up on another, nothing like the rest of the screen. These are drawn by
   the app instead, and keep the API the native ones had: `value` in,
   `onChange(e)` out with `e.target.value`, `<option>` children for the list.
   Every existing <Select> works unchanged.

   Both open into a layer portalled to <body>, so a modal's scroll box or a
   table's overflow cannot clip them. The app is drawn at a `zoom` (#root in
   index.css); the layer carries the same zoom and divides its coordinates by
   it, so it lines up with the field it opened from at any zoom.

   On a phone the list opens as a sheet from the bottom of the screen — a
   thumb-sized list, not a floating box beside a field the keyboard may cover.
   ============================================================ */

const appZoom = () => {
  if (typeof document === "undefined") return 1;
  const root = document.getElementById("root");
  const z = root ? parseFloat(getComputedStyle(root).zoom) : 1;
  return Number.isFinite(z) && z > 0 ? z : 1;
};

/* Where a floating panel goes: under its field if it fits, over it if not,
   never off either edge of the window. Follows the field as the page scrolls,
   and closes once the field has scrolled out of sight altogether. */
function usePlacement(anchorRef, open, onLost, { minWidth = 0, maxHeight = 340 } = {}) {
  const [pos, setPos] = useState(null);
  const place = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh) { onLost?.(); return; }
    const z = appZoom();
    const width = Math.min(Math.max(r.width, minWidth * z), vw - 16);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
    const below = vh - r.bottom - 10;
    const above = r.top - 10;
    const want = maxHeight * z;
    const down = below >= Math.min(want, 260) || below >= above;
    const room = Math.max(140, Math.min(want, down ? below : above));
    setPos({
      left: left / z,
      width: width / z,
      top: down ? (r.bottom + 4) / z : undefined,
      bottom: down ? undefined : (vh - r.top + 4) / z,
      maxHeight: room / z,
    });
  }, [anchorRef, minWidth, maxHeight, onLost]);

  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const on = () => place();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, place]);
  return pos;
}

/* Close on a press anywhere outside the field and its panel. */
function useOutside(open, refs, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return;
      onClose();
    };
    document.addEventListener("pointerdown", h, true);
    return () => document.removeEventListener("pointerdown", h, true);
  }, [open, refs, onClose]);
}

/* The words a field is labelled with — what a phone's sheet is headed with
   when the dropdown itself was given no aria-label. */
const fieldLabel = (el) => {
  const label = el?.closest(".field")?.querySelector(".label");
  // Its own words only — not the text of the "?" tip inside it.
  return label ? [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim() : "";
};

/* The portalled layer, zoomed like the app so its type matches. */
function Layer({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="jg-layer">{children}</div>, document.body);
}

/* ---------------------------------------------------------------- Select */

const textOf = (node) => {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
};

/* `<option>` children → [{ value, label, disabled }], through fragments and
   arrays the way React renders them. */
function readOptions(children) {
  const out = [];
  const walk = (nodes) => Children.forEach(nodes, (n) => {
    if (!isValidElement(n)) return;
    if (n.type === Fragment) { walk(n.props.children); return; }
    if (n.type === "option") {
      const label = textOf(n.props.children);
      out.push({
        value: n.props.value === undefined ? label : String(n.props.value),
        label,
        disabled: !!n.props.disabled,
      });
    }
  });
  walk(children);
  return out;
}

const SEARCH_FROM = 8;   // a list this long gets a search box

export function Select({
  value, onChange, children, className = "", style, disabled, placeholder,
  "aria-label": ariaLabel, title, id,
}) {
  const mobile = useIsMobile();
  const opts = useMemo(() => readOptions(children), [children]);
  const current = String(value ?? "");
  const selected = opts.find((o) => o.value === current);
  // A value the list does not hold reads as the list's first entry, which is
  // what a native <select> shows in the same situation.
  const shown = selected || (placeholder ? null : opts[0]);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const close = useCallback(() => { setOpen(false); setQ(""); }, []);
  const pos = usePlacement(btnRef, open && !mobile, close, { minWidth: 220 });
  useOutside(open, [btnRef, panelRef], close);

  const searchable = opts.length >= SEARCH_FROM;
  const shownOpts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? opts.filter((o) => o.label.toLowerCase().includes(s)) : opts;
  }, [opts, q]);

  // Opening puts the highlight on the chosen entry and scrolls it into view.
  useEffect(() => {
    if (!open) return;
    const at = shownOpts.findIndex((o) => o.value === current);
    setActive(at >= 0 ? at : shownOpts.findIndex((o) => !o.disabled));
    if (searchable && !mobile) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open && q) setActive(shownOpts.findIndex((o) => !o.disabled)); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.querySelector(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /* Focus goes back to the field only when the choice was made from the
     keyboard — after a click it would leave a focus ring round the field that
     a native dropdown does not leave. */
  const choose = (o, fromKeyboard = false) => {
    if (!o || o.disabled) return;
    if (o.value !== current) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } });
    close();
    if (fromKeyboard) btnRef.current?.focus();
  };

  const move = (dir) => {
    if (!shownOpts.length) return;
    let i = active;
    for (let n = 0; n < shownOpts.length; n++) {
      i = (i + dir + shownOpts.length) % shownOpts.length;
      if (!shownOpts[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); btnRef.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(shownOpts.findIndex((o) => !o.disabled)); }
    else if (e.key === "End") { e.preventDefault(); setActive(shownOpts.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(shownOpts[active], true); }
    else if (e.key === "Tab") close();
    else if (!searchable && e.key.length === 1) {
      // Type-ahead on a short list: the first entry starting with what was typed.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = shownOpts.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  const list = (
    <div className="sel-list" role="listbox" id={listId} ref={listRef} aria-label={ariaLabel}>
      {shownOpts.map((o, i) => (
        <div key={`${o.value}:${i}`} data-i={i} role="option" aria-selected={o.value === current}
          aria-disabled={o.disabled || undefined}
          className={`sel-opt${o.value === current ? " on" : ""}${i === active ? " act" : ""}${o.disabled ? " off" : ""}`}
          onPointerEnter={() => !o.disabled && setActive(i)}
          onClick={() => choose(o)}>
          <span className="sel-opt-t">{o.label || " "}</span>
          {o.value === current && <Check size={14} strokeWidth={2.6} />}
        </div>
      ))}
      {!shownOpts.length && <div className="sel-none">Nothing matches “{q}”.</div>}
    </div>
  );

  const search = searchable && (
    <div className="sel-search">
      <Search size={14} />
      <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
        placeholder="Type to search…" aria-label="Search the list" />
      {q && <button type="button" className="sel-clear" onClick={() => setQ("")} aria-label="Clear search"><X size={13} /></button>}
    </div>
  );

  return (
    <>
      <button type="button" ref={btnRef} id={id}
        className={`select sel${open ? " open" : ""} ${className}`} style={style}
        disabled={disabled} title={title || shown?.label || placeholder}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)} onKeyDown={onKey}>
        {/* The field is as wide as its widest choice, the way a native
            dropdown is: the hidden list under the label sets the width, so
            the field does not change size as the choice does, and a row of
            filters lays out exactly as it did with the browser's own. */}
        <span className="sel-box">
          <span className={`sel-val${shown ? "" : " ph"}`}>{shown ? (shown.label || "\u00a0") : placeholder}</span>
          <span className="sel-sizer" aria-hidden="true">
            {opts.map((o, i) => <span key={i}>{o.label || "\u00a0"}</span>)}
            {placeholder && <span>{placeholder}</span>}
          </span>
        </span>
        <ChevronDown size={14} className="sel-chev" />
      </button>
      {open && (mobile ? (
        <Layer>
          <div className="sel-veil" onClick={close} />
          <div className="sel-sheet" ref={panelRef} onKeyDown={onKey}>
            <div className="sel-sheet-head">
              <span>{ariaLabel || fieldLabel(btnRef.current) || placeholder || "Choose one"}</span>
              <button type="button" className="icon-btn bare" onClick={close} aria-label="Close"><X size={17} /></button>
            </div>
            {search}
            {list}
          </div>
        </Layer>
      ) : pos && (
        <Layer>
          <div className="sel-pop" ref={panelRef} onKeyDown={onKey}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}>
            {search}
            {list}
          </div>
        </Layer>
      ))}
    </>
  );
}

/* ------------------------------------------------------------- DateInput */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };

/* yyyy-mm-dd → [y, m (0-based), d], or null. Read off the string so no
   timezone can move the day. */
const parts = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
};
const valid = (y, m, d) => {
  const t = new Date(y, m, d);
  return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
};

/* What somebody typed — 05/10/2026, 5-10-26, 05.10.2026 or 2026-10-05. */
function parseTyped(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m && valid(+m[1], +m[2] - 1, +m[3])) return iso(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (valid(y, +m[2] - 1, +m[1])) return iso(y, +m[2] - 1, +m[1]);
  }
  return null;
}

const show = (s) => { const p = parts(s); return p ? `${pad(p[2])}/${pad(p[1] + 1)}/${p[0]}` : ""; };

export function DateInput({
  value, onChange, className = "", style, placeholder = "dd/mm/yyyy", disabled, min, max,
  "aria-label": ariaLabel, clearable = true,
}) {
  const mobile = useIsMobile();
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(show(value));
  const [bad, setBad] = useState(false);
  const [view, setView] = useState("days");      // days | months
  const init = parts(value) || parts(todayIso());
  const [cursor, setCursor] = useState([init[0], init[1]]);  // the month on show
  const [focusDay, setFocusDay] = useState(init[2]);

  useEffect(() => { setText(show(value)); setBad(false); }, [value]);

  const close = useCallback(() => { setOpen(false); setView("days"); }, []);
  const pos = usePlacement(wrapRef, open && !mobile, close, { minWidth: 288, maxHeight: 380 });
  useOutside(open, [wrapRef, panelRef], close);

  const emit = (v) => onChange?.({ target: { value: v }, currentTarget: { value: v } });
  const outOfRange = (s) => (min && s < min) || (max && s > max);

  const openAt = () => {
    const p = parts(value) || parts(todayIso());
    setCursor([p[0], p[1]]);
    setFocusDay(p[2]);
    setView("days");
    setOpen(true);
  };

  const commitText = () => {
    const v = parseTyped(text);
    if (v === null || (v && outOfRange(v))) { setBad(true); return; }
    setBad(false);
    if (v !== (value || "")) emit(v);
    setText(show(v));
  };

  const pick = (y, m, d) => {
    const v = iso(y, m, d);
    if (outOfRange(v)) return;
    emit(v);
    setText(show(v));
    setBad(false);
    close();
    inputRef.current?.focus();
  };

  const [cy, cm] = cursor;
  const shift = (n) => {
    const t = new Date(cy, cm + n, 1);
    setCursor([t.getFullYear(), t.getMonth()]);
    setFocusDay((d) => Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  };

  const first = new Date(cy, cm, 1).getDay();
  const days = new Date(cy, cm + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const sel = parts(value);
  const now = parts(todayIso());

  const onGridKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      const t = new Date(cy, cm, focusDay + step);
      setCursor([t.getFullYear(), t.getMonth()]);
      setFocusDay(t.getDate());
    } else if (e.key === "PageUp") { e.preventDefault(); shift(-1); }
    else if (e.key === "PageDown") { e.preventDefault(); shift(1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(cy, cm, focusDay); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); inputRef.current?.focus(); }
  };

  const calendar = (
    <div className="cal" onKeyDown={onGridKey}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => (view === "days" ? shift(-1) : setCursor([cy - 1, cm]))}
          aria-label={view === "days" ? "Previous month" : "Previous year"}><ChevronLeft size={16} /></button>
        <button type="button" className="cal-title" onClick={() => setView(view === "days" ? "months" : "days")}>
          {view === "days" ? `${MONTHS[cm]} ${cy}` : cy}
          <ChevronDown size={13} style={{ transform: view === "months" ? "rotate(180deg)" : "none" }} />
        </button>
        <button type="button" className="cal-nav" onClick={() => (view === "days" ? shift(1) : setCursor([cy + 1, cm]))}
          aria-label={view === "days" ? "Next month" : "Next year"}><ChevronRight size={16} /></button>
      </div>
      {view === "days" ? (
        <div className="cal-grid" role="grid" aria-label={`${MONTHS[cm]} ${cy}`}>
          {DAYS.map((d) => <span key={d} className="cal-dow">{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={`x${i}`} />;
            const s = iso(cy, cm, d);
            const isSel = sel && sel[0] === cy && sel[1] === cm && sel[2] === d;
            const isNow = now[0] === cy && now[1] === cm && now[2] === d;
            const off = outOfRange(s);
            return (
              <button key={s} type="button" disabled={off} tabIndex={d === focusDay ? 0 : -1}
                className={`cal-day${isSel ? " on" : ""}${isNow ? " now" : ""}${d === focusDay ? " foc" : ""}`}
                onClick={() => pick(cy, cm, d)} aria-pressed={isSel} aria-label={`${d} ${MONTHS[cm]} ${cy}`}>
                {d}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="cal-months">
          {MONTHS.map((m, i) => (
            <button key={m} type="button" className={`cal-month${i === cm ? " on" : ""}`}
              onClick={() => { setCursor([cy, i]); setView("days"); }}>{m.slice(0, 3)}</button>
          ))}
        </div>
      )}
      <div className="cal-foot">
        <button type="button" className="linkish" onClick={() => { const t = parts(todayIso()); pick(t[0], t[1], t[2]); }}>Today</button>
        {clearable && value && (
          <button type="button" className="linkish" onClick={() => { emit(""); setText(""); close(); }}>Clear</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <span ref={wrapRef} className={`date-in${bad ? " bad" : ""}${disabled ? " dis" : ""}${/\binput-sm\b/.test(className) ? " sm" : ""}`} style={style}>
        {/* On a phone the box is read-only: a tap opens the calendar sheet
            rather than the keyboard, which would cover it. */}
        <input ref={inputRef} className={`input ${className}`} value={text} placeholder={placeholder} disabled={disabled}
          readOnly={mobile} inputMode="numeric" autoComplete="off" aria-label={ariaLabel} aria-invalid={bad || undefined}
          onChange={(e) => { setText(e.target.value); setBad(false); }}
          onBlur={() => { if (!mobile) commitText(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitText(); }
            else if (e.key === "ArrowDown" && (e.altKey || !open)) { e.preventDefault(); openAt(); }
            else if (e.key === "ArrowDown" && open) {
              e.preventDefault();
              panelRef.current?.querySelector(".cal-day.foc")?.focus();
            } else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); close(); }
          }}
          onClick={() => !disabled && !open && openAt()} />
        <button type="button" className="date-btn" disabled={disabled} tabIndex={-1}
          onClick={() => (open ? close() : openAt())} aria-label="Open the calendar">
          <Calendar size={15} />
        </button>
      </span>
      {open && (mobile ? (
        <Layer>
          <div className="sel-veil" onClick={close} />
          <div className="sel-sheet cal-sheet" ref={panelRef}>
            <div className="sel-sheet-head">
              <span>{ariaLabel || fieldLabel(wrapRef.current) || "Pick a date"}</span>
              <button type="button" className="icon-btn bare" onClick={close} aria-label="Close"><X size={17} /></button>
            </div>
            {calendar}
          </div>
        </Layer>
      ) : pos && (
        <Layer>
          <div className="sel-pop cal-pop" ref={panelRef}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: Math.max(288, Math.min(pos.width, 320)), maxHeight: pos.maxHeight }}>
            {calendar}
          </div>
        </Layer>
      ))}
    </>
  );
}

/* ------------------------------------------------------------- XScroll */

/* A table wider than its card scrolls sideways — and with a long table the
   scrollbar that does it is a page-length away at the bottom. This puts a
   second one along the top, kept in step with the first, so the table can be
   moved sideways from whichever end is in view. It only appears while there
   is something to scroll. */
export function XScroll({ className = "tbl-wrap", style, children, deps = [] }) {
  const topRef = useRef(null);
  const bodyRef = useRef(null);
  const syncing = useRef(false);
  const [width, setWidth] = useState(0);
  const [needed, setNeeded] = useState(false);

  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setWidth(el.scrollWidth);
    setNeeded(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (needed && topRef.current && bodyRef.current) topRef.current.scrollLeft = bodyRef.current.scrollLeft;
  }, [needed]);

  const follow = (from, to) => {
    if (syncing.current) { syncing.current = false; return; }
    if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft) {
      syncing.current = true;
      to.current.scrollLeft = from.current.scrollLeft;
    }
  };

  return (
    <>
      {needed && (
        <div className="xscroll-top" ref={topRef} onScroll={() => follow(topRef, bodyRef)} aria-hidden="true">
          <div style={{ width, height: 1 }} />
        </div>
      )}
      <div className={className} style={style} ref={bodyRef} onScroll={() => follow(bodyRef, topRef)}>
        {children}
      </div>
    </>
  );
}
