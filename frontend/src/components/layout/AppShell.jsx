import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Anchor, Sun, Moon, LogOut, Search, ChevronDown, CornerDownLeft, FileText, Menu, X,
  ShieldCheck, User as UserIcon,
} from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useBadges } from "../../api/hooks.js";
import { VIEWS, MENU, SETUP, ROUTE_TITLES } from "../../lib/nav.js";
import { DOC_GROUPS, DOC_META } from "../../lib/docs.js";
import { APP_VERSION, versionLabel } from "../../lib/releases.js";
import { WhatsNewModal, ReleaseNotesModal } from "./ReleaseNotes.jsx";

/* Top navigation + page chrome. Feature pages render into <Outlet />.

   The bar only ever shows what the signed-in user may actually open, so
   nobody meets a page they cannot use — a dropdown disappears entirely once
   all of its entries are out of reach. */

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/* The top bar greets people by their first name. Accounts made before first
   and last names were asked for still carry one `name`; its first word is it. */
export const firstNameOf = (u) => (u?.first_name || String(u?.name || "").trim().split(/\s+/)[0] || "");

/* Remembered per person, so the popup shows once each — and in a try, because
   a private window refuses storage and the app must still work there. */
const SEEN_KEY = (uid) => `jg-seen-release:${uid}`;
const seenVersion = (uid) => { try { return localStorage.getItem(SEEN_KEY(uid)); } catch (e) { return null; } };
const markSeen = (uid) => { try { localStorage.setItem(SEEN_KEY(uid), APP_VERSION); } catch (e) { /* ignore */ } };

/* The profile: first name in the bar; the rest — full name, address, role,
   the theme and the way out — one click away. */
function ProfileMenu({ user, isAdmin, theme, setTheme, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc); };
  }, [open]);

  const first = firstNameOf(user);
  const full = user?.name || first;
  return (
    <div className="acct" ref={ref}>
      <button type="button" className={`acct-btn${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open} title="Your profile">
        <span className="acct-ava">{initials(full)}</span>
        <span className="acct-name">{first}</span>
        <ChevronDown size={14} className="acct-chev" />
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <span className="acct-ava lg">{initials(full)}</span>
            <span className="acct-who">
              <span className="acct-head-n">{full}</span>
              <span className="acct-head-e">{user?.email}</span>
              <span className="acct-head-r">
                {isAdmin ? <ShieldCheck size={12} /> : <UserIcon size={12} />}
                {isAdmin ? "Admin" : "User"}
              </span>
            </span>
          </div>
          <div className="acct-row">
            <span className="acct-row-l">{theme === "dark" ? <Moon size={15} /> : <Sun size={15} />} Theme</span>
            <span className="seg acct-seg" role="group" aria-label="Theme">
              <button type="button" className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>
                <Sun size={13} /> Light
              </button>
              <button type="button" className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>
                <Moon size={13} /> Dark
              </button>
            </span>
          </div>
          <button type="button" className="acct-item danger" role="menuitem" onClick={() => { setOpen(false); logout(); }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* Command palette — ⌘K / Ctrl+K. Jumps to any page or document. */
function Palette({ onClose, go, has }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const entries = useMemo(() => {
    const pages = VIEWS.filter((n) => has(n.perm))
      .map((n) => ({ kind: "page", id: n.to, label: n.label, sub: n.desc, icon: n.icon }));
    /* A paper filed under two menu heads (23 is both a pre-shipment report and
       one of the other reports) answers the search once, under the first. */
    const docs = has(VIEWS.find((v) => v.id === "documents").perm)
      ? DOC_GROUPS.flatMap((g) => g.docs.map((no) => ({
        kind: "doc", id: no, label: `${no} · ${DOC_META[no] || ""}`, sub: g.t, icon: FileText,
      }))).filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
      : [];
    const all = [...pages, ...docs];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((e) => `${e.label} ${e.sub}`.toLowerCase().includes(s)) : all).slice(0, 40);
  }, [q, has]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, entries.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const en = entries[sel];
        if (!en) return;
        go(en.kind === "page" ? en.id : `/documents?doc=${en.id}`);
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [entries, sel, go, onClose]);

  return (
    <div className="backdrop" style={{ alignItems: "flex-start" }} onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Go to a page, or find any of the 40 documents…" />
        <div className="palette-list">
          {entries.map((e, i) => (
            <div key={e.kind + e.id} className={`p-item${i === sel ? " on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => { go(e.kind === "page" ? e.id : `/documents?doc=${e.id}`); onClose(); }}>
              <e.icon size={15} />
              <span>{e.label}</span>
              <span className="p-sub">{e.sub}</span>
              {i === sel && <CornerDownLeft size={13} style={{ color: "var(--faint)" }} />}
            </div>
          ))}
          {!entries.length && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              Nothing matches “{q}”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, isAdmin, has, logout } = useAuth();
  const badges = useBadges().data || {};

  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("jg-theme")) || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jg-theme", theme); } catch (e) { /* ignore */ }
  }, [theme]);

  /* The one-time "what's new" popup: shown the first time each person signs in
     after an update, then not again until the next one. */
  const [whatsNew, setWhatsNew] = useState(false);
  const [notes, setNotes] = useState(false);
  useEffect(() => {
    if (user?.id && seenVersion(user.id) !== APP_VERSION) setWhatsNew(true);
  }, [user?.id]);

  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* On a phone the tab bar cannot hold nine sections, so it becomes a sheet
     that drops from the header. It closes on every navigation — leaving it
     open over the page it just opened is the classic way to lose people. */
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const h = (e) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [drawer]);

  /* One heading per screen. The bar used to carry a breadcrumb and the page
     name above a page that then printed its own name again — the same words
     twice, a line apart. The name lives here now, at full size, with the
     search beside it, and no page repeats it. */
  const title = (ROUTE_TITLES[pathname] || [])[1] || "Jaikvin Global";

  // A dropdown keeps only the entries this user can reach, and disappears
  // once none are left.
  const menuFor = (n) => {
    if (!n.children) return has(n.perm) ? n : null;
    const kids = n.children.filter((c) => has(c.perm));
    return kids.length ? { ...n, children: kids } : null;
  };
  const menu = MENU.map(menuFor).filter(Boolean);

  const isActive = (n) => (n.children ? n.children.some((c) => c.to === pathname) : pathname === n.to);

  /* The tab bar folds into the burger whenever it does not fit beside the
     brand and the profile — not only below a fixed width. How wide the bar
     needs to be depends on how many sections this person can open, how long
     their first name is and how the device scales text, so it is measured: a
     tablet, a phone held sideways or a small laptop used to get the last tabs
     drawn underneath the profile button. */
  const innerRef = useRef(null);
  const navRef = useRef(null);
  const brandRef = useRef(null);
  const rightRef = useRef(null);
  const [tight, setTight] = useState(false);
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const navEl = navRef.current;
    if (!inner || !navEl || typeof ResizeObserver === "undefined") return undefined;
    const check = () => {
      const cs = getComputedStyle(inner);
      const gap = parseFloat(cs.columnGap) || 0;
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const room = inner.clientWidth - pad - (brandRef.current?.offsetWidth || 0)
        - (rightRef.current?.offsetWidth || 0) - gap * 2;
      const need = navEl.scrollWidth;
      // A little slack before unfolding again, so the bar does not flicker
      // between the two at the one width where it only just fits.
      setTight((was) => (was ? need > room - 8 : need > room + 1));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(inner);
    ro.observe(navEl);
    if (rightRef.current) ro.observe(rightRef.current);
    return () => ro.disconnect();
  }, [menu.length, user?.first_name, user?.name]);

  /* Only Purchase Orders carries a counter. The Shipment badge counted boxes
     still to pack — four figures against a menu label, which reads as an
     error rather than as a total, so the bar now shows the one number that
     means "there is work waiting here": how many orders are still open. */
  const BADGED = new Set(["orders"]);
  const badgeFor = (id) => (BADGED.has(id) ? badges[id] || 0 : 0);
  const badgeOf = (n) => (n.children
    ? n.children.reduce((s, c) => s + badgeFor(c.id), 0)
    : badgeFor(n.id));

  const NavBtn = ({ n }) => {
    const btn = (
      <button className={`nav-item${isActive(n) ? " active" : ""}`}
        onClick={() => nav(n.children ? n.children[0].to : n.to)}>
        <n.icon size={17} strokeWidth={2.1} style={{ color: isActive(n) ? "var(--amber)" : undefined, flexShrink: 0 }} />
        <span className="lbl">{n.label}</span>
        {badgeOf(n) > 0 && <span className="nav-count">{badgeOf(n)}</span>}
        {n.children && <ChevronDown size={13} strokeWidth={2.4} style={{ opacity: 0.7, flexShrink: 0 }} />}
      </button>
    );
    if (!n.children) return btn;
    return (
      <div className="nav-drop">
        {btn}
        <div className="nav-menu">
          {n.children.map((c) => (
            <button key={c.id} className={`nav-menu-item${pathname === c.to ? " on" : ""}`} onClick={() => nav(c.to)}>
              <c.icon size={15} strokeWidth={2.1} />
              <span className="grow">
                <span className="nmi-t">{c.label}</span>
                <span className="nmi-s">{c.desc}</span>
              </span>
              {badgeFor(c.id) > 0 && <span className="nav-count">{badgeFor(c.id)}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header className={`topnav${tight ? " tight" : ""}`}>
        <div className="topnav-inner" ref={innerRef}>
          <button className="nav-burger" onClick={() => setDrawer((d) => !d)}
            aria-label={drawer ? "Close menu" : "Open menu"} aria-expanded={drawer}>
            {drawer ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="brand" ref={brandRef}>
            <div className="brand-mark"><Anchor size={19} color="#0b2c4d" strokeWidth={2.6} /></div>
            <div>
              <div className="brand-name">Jaikvin Global</div>
              <div className="brand-sub">EXPORT SYSTEM</div>
            </div>
          </div>

          <nav className="nav" ref={navRef} aria-hidden={tight || undefined}>
            {menu.map((n) => <NavBtn key={n.id} n={n} />)}
            {(has(SETUP.perm) || isAdmin) && <><span className="nav-sep" /><NavBtn n={SETUP} /></>}
          </nav>

          <div className="topnav-right" ref={rightRef}>
            <ProfileMenu user={user} isAdmin={isAdmin} theme={theme} setTheme={setTheme} logout={logout} />
          </div>
        </div>

        {/* The same menu, flattened: on a phone a hover dropdown has nothing to
            hover, so every sub-page is listed under its section heading. */}
        {drawer && (
          <>
            <div className="nav-sheet-veil" onClick={() => setDrawer(false)} />
            <nav className="nav-sheet">
              {[...menu, ...((has(SETUP.perm) || isAdmin) ? [SETUP] : [])].map((n) => (
                <div key={n.id} className="ns-group">
                  <button className={`ns-item${isActive(n) ? " on" : ""}`}
                    onClick={() => nav(n.children ? n.children[0].to : n.to)}>
                    <n.icon size={17} strokeWidth={2.1} />
                    <span className="grow">{n.label}</span>
                    {badgeOf(n) > 0 && <span className="nav-count">{badgeOf(n)}</span>}
                  </button>
                  {n.children && n.children.map((c) => (
                    <button key={c.id} className={`ns-item ns-sub${pathname === c.to ? " on" : ""}`}
                      onClick={() => nav(c.to)}>
                      <c.icon size={15} strokeWidth={2.1} />
                      <span className="grow">{c.label}</span>
                      {badgeFor(c.id) > 0 && <span className="nav-count">{badgeFor(c.id)}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </>
        )}
      </header>

      <div className="main">
        <div className="subbar">
          <div className="subbar-inner">
            <h1>{title}</h1>
            <div className="grow" />
            <button className="searchbtn" onClick={() => setPalette(true)}>
              <Search size={16} />
              <span>Search pages &amp; documents</span>
              <span className="kbd">⌘K</span>
            </button>
          </div>
        </div>

        <div className="page">
          <Outlet />
        </div>

        <footer className="footer">
          <span>Maintained and Developed By <b style={{ color: "var(--ink)" }}>Avita Technologies</b></span>
          {/* On Setup the version opens the release notes; everywhere else it
              is just the version. */}
          {pathname === "/setup"
            ? (
              <button type="button" className="mono ver-link" onClick={() => setNotes(true)}
                title="What changed in each version">
                {versionLabel()}
              </button>
            )
            : <span className="mono">{versionLabel()}</span>}
        </footer>
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={nav} has={has} />}
      {whatsNew && <WhatsNewModal onClose={() => { markSeen(user.id); setWhatsNew(false); }} />}
      {notes && <ReleaseNotesModal onClose={() => setNotes(false)} />}
    </div>
  );
}
