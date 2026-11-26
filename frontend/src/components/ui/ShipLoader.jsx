/* The app's loading mark: a container ship under way (V-7.9.0).

   An export house waits on ships all day, so the wait in the app is one too.
   Two sizes, one ship:

     <ShipLoader label="…" />   the full scene, where a list or a page is coming
                                 in: the ship in the company's colours, laden
                                 with boxes in the brand's palette, pitching on a
                                 sea that runs past it in three layers, smoke
                                 from the funnel, a wake astern, spray at the bow,
                                 gulls keeping pace. By day a low sun astern; in the dark
                                 theme a moon, stars and the bridge lit.
     <ShipSpin size={14} />      the same ship as a small mark — rocking on a line
                                 of swell — wherever a button or a line of text
                                 used to turn a circle. It is a drop-in for an
                                 icon: it takes `size` and draws in currentColor.

   Every motion stops for anyone who has asked their system for less of it;
   the ship then lies at anchor on a calm sea, and the label still says what
   is happening. No picture files: inline SVG, coloured by the theme's tokens
   (index.css · "Ship loader"). */

const W = 200;
const H = 100;

/* A sea surface as a filled band: crests and troughs every half `period`,
   drawn one period wider than the scene so sliding it left by exactly one
   period loops without a seam. */
function sea(y, amp, period, bottom = H) {
  const half = period / 2;
  let d = `M0 ${y} Q${period / 4} ${y - amp} ${half} ${y}`;
  for (let x = half; x < W + period; x += half) d += ` T${x + half} ${y}`;
  return `${d} L${W + period} ${bottom} L0 ${bottom} Z`;
}
/* The same crest line alone, for the foam that rides on it. */
function crest(y, amp, period) {
  const half = period / 2;
  let d = `M0 ${y} Q${period / 4} ${y - amp} ${half} ${y}`;
  for (let x = half; x < W + period; x += half) d += ` T${x + half} ${y}`;
  return d;
}

const SEA_BACK = { d: sea(68.5, 1.4, 22), foam: crest(68.5, 1.4, 22), p: 22 };
const SEA_MID = { d: sea(73.2, 1.9, 30), foam: crest(73.2, 1.9, 30), p: 30 };
const SEA_FRONT = { d: sea(80, 2.4, 40), foam: crest(80, 2.4, 40), p: 40 };

/* The deck cargo: two tiers the length of the hold and a third amidships,
   each box ribbed like a real one. Colours from the brand: the globe's orange,
   the swoosh's maroon, the app's teal, amber, steel and green. */
const BOX_W = 8.8;
const BOX_H = 6.8;
const TONES = ["or", "te", "am", "ma", "st", "gr"];
const BOXES = [];
for (let col = 0; col < 6; col++) {
  const tiers = col >= 1 && col <= 3 ? 3 : 2;
  for (let row = 0; row < tiers; row++) {
    BOXES.push({
      x: 84 + col * 9.4,
      y: 51.7 - row * (BOX_H + 0.25),
      tone: TONES[(col * 4 + row * 3 + 1) % TONES.length],
    });
  }
}

const STARS = [[22, 14, 0], [48, 8, 0.7], [78, 20, 1.4], [104, 10, 0.3], [128, 24, 1.1], [176, 14, 1.8], [190, 30, 0.9], [12, 34, 2.1]];

function Scene() {
  return (
    <svg className="jgl-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {/* ---- sky ---- */}
      <rect className="jgl-sky" x="0" y="0" width={W} height={H} />
      <g className="jgl-night">
        {STARS.map(([x, y, d]) => (
          <circle key={`${x}-${y}`} className="jgl-star" cx={x} cy={y} r="0.75" style={{ animationDelay: `${-d}s` }} />
        ))}
        <circle className="jgl-moon-glow" cx="158" cy="30" r="13" />
        <circle className="jgl-moon" cx="158" cy="30" r="7.2" />
        <circle className="jgl-crater" cx="155.6" cy="28.4" r="1.5" />
        <circle className="jgl-crater" cx="160.4" cy="32.6" r="1" />
      </g>
      <g className="jgl-day">
        {/* low astern: she sails away from the sunset */}
        <circle className="jgl-sun-glow" cx="36" cy="65" r="16" />
        <circle className="jgl-sun" cx="36" cy="65" r="9.5" />
      </g>
      <g className="jgl-cloud" style={{ animationDuration: "30s", animationDelay: "-9s" }}>
        <path className="jgl-cloud-fill" d="M150 25a5 5 0 0 1 9.4-2.4A6.4 6.4 0 0 1 171 24a4.4 4.4 0 0 1 1.6 8.5H151.6A3.9 3.9 0 0 1 150 25z" />
      </g>
      <g className="jgl-cloud" style={{ animationDuration: "42s", animationDelay: "-30s" }}>
        <path className="jgl-cloud-fill" d="M156 14a3.8 3.8 0 0 1 7-1.8A4.8 4.8 0 0 1 171.6 14a3.2 3.2 0 0 1 1 6.2H157.4A2.9 2.9 0 0 1 156 14z" />
      </g>

      {/* ---- gulls keeping pace with the ship ---- */}
      <g className="jgl-gulls">
        <path className="jgl-gull" d="M38 30q2.2-2.4 4.4 0q2.2-2.4 4.4 0" />
        <path className="jgl-gull jgl-gull-2" d="M50 23q1.7-1.9 3.4 0q1.7-1.9 3.4 0" />
      </g>

      {/* ---- the sea behind ---- */}
      <g className="jgl-sea jgl-sea-back" style={{ "--p": `${SEA_BACK.p}px` }}>
        <path className="jgl-water-3" d={SEA_BACK.d} />
        <path className="jgl-foam jgl-foam-faint" d={SEA_BACK.foam} />
      </g>

      {/* ---- the ship ---- */}
      <g className="jgl-ship">
        {/* smoke from the funnel, three puffs in turn */}
        {[0, 0.8, 1.6].map((d) => (
          <circle key={d} className="jgl-smoke" cx="69.5" cy="29" r="2.1" style={{ animationDelay: `${-d}s` }} />
        ))}
        {/* funnel: the brand band round it, a dark cap */}
        <rect className="jgl-hull" x="66" y="30.6" width="7" height="10" rx="0.8" />
        <rect className="jgl-band" x="66" y="33.2" width="7" height="2.1" />
        <rect className="jgl-cap" x="65.6" y="30.2" width="7.8" height="1.3" rx="0.5" />
        {/* the bridge aft: wheelhouse with its wings, decks below */}
        <line className="jgl-rig" x1="61.5" y1="40.3" x2="61.5" y2="34.5" />
        <rect className="jgl-deck" x="58.6" y="40.2" width="23" height="4.4" rx="0.7" />
        <rect className="jgl-deck" x="60.8" y="44.2" width="18.6" height="14.8" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={`w${i}`} className="jgl-win" x={60.6 + i * 3.9} y="41.4" width="2.6" height="1.8" rx="0.3" />
        ))}
        {[0, 1, 2, 3].map((i) => [47, 51.2, 55.2].map((y) => (
          <rect key={`p${i}${y}`} className="jgl-port" x={62.6 + i * 4} y={y} width="2" height="1.6" rx="0.3" />
        )))}
        {/* the boxes */}
        {BOXES.map((b) => (
          <g key={`${b.x}-${b.y}`}>
            <rect className={`jgl-box jgl-box-${b.tone}`} x={b.x} y={b.y} width={BOX_W} height={BOX_H} rx="0.5" />
            <path className="jgl-rib" d={`M${b.x + 2.2} ${b.y + 1}v${BOX_H - 2}M${b.x + 4.4} ${b.y + 1}v${BOX_H - 2}M${b.x + 6.6} ${b.y + 1}v${BOX_H - 2}`} />
            <path className="jgl-lip" d={`M${b.x + 0.4} ${b.y + 0.5}h${BOX_W - 0.8}`} />
          </g>
        ))}
        {/* foremast and a flag that flies */}
        <line className="jgl-rig" x1="144.2" y1="58.6" x2="144.2" y2="45.6" />
        <path className="jgl-flag" d="M144.2 45.8l6.4 1.7-6.4 1.7z" />
        {/* hull: navy, a white sheer line, her name, the maroon boot-top at the waterline */}
        <path className="jgl-hull" d="M52 58.5H151l-9.5 19H63c-5 0-8.5-11.5-11-19z" />
        <path className="jgl-sheer" d="M53.2 61.3H149.6" />
        <text className="jgl-name" x="118" y="67.8" textAnchor="middle">JAIKVIN GLOBAL</text>
        <circle className="jgl-hawse" cx="146.2" cy="63.6" r="0.9" />
        <path className="jgl-boot" d="M55.9 71.5H144.5l-3 6H63c-3.5 0-6-3-7.1-6z" />
        <path className="jgl-shine" d="M56 60.2h50" />
      </g>

      {/* ---- the water she sits in, and what she throws up ---- */}
      <g className="jgl-sea jgl-sea-mid" style={{ "--p": `${SEA_MID.p}px` }}>
        <path className="jgl-water-2" d={SEA_MID.d} />
        <path className="jgl-foam" d={SEA_MID.foam} />
      </g>
      <g className="jgl-bob">
        <path className="jgl-spray" d="M140.5 73.4q3.2-3.6 7.4-1.4" />
        <path className="jgl-spray jgl-spray-2" d="M142.6 72q2.6-2.8 6-1.2" />
      </g>
      {[[46, 75, 9, 0], [37, 77, 7, 0.55], [29, 75.8, 5.5, 1.1]].map(([x, y, w, d]) => (
        <path key={x} className="jgl-wake" d={`M${x} ${y}h${w}`} style={{ animationDelay: `${-d}s` }} />
      ))}
      <g className="jgl-sea jgl-sea-front" style={{ "--p": `${SEA_FRONT.p}px` }}>
        <path className="jgl-water-1" d={SEA_FRONT.d} />
        <path className="jgl-foam jgl-foam-faint" d={SEA_FRONT.foam} />
      </g>
    </svg>
  );
}

/** The full loading scene with what is being waited for under it. */
export function ShipLoader({ label = "Loading…", size }) {
  return (
    <div className={`jgl${size === "lg" ? " jgl-lg" : size === "sm" ? " jgl-sm" : ""}`} role="status" aria-live="polite">
      <Scene />
      {label && <p className="jgl-label">{label}</p>}
    </div>
  );
}

/** The ship as a small mark — a drop-in for a turning icon. */
export function ShipSpin({ size = 16, className = "", style }) {
  return (
    <svg className={`jgs ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}>
      <g className="jgs-ship">
        <rect x="5.7" y="4.4" width="1.9" height="2.8" rx="0.4" fill="currentColor" />
        <rect x="4.4" y="7" width="4.4" height="6.8" rx="0.6" fill="currentColor" />
        <rect x="9.6" y="9.6" width="3.5" height="4.2" rx="0.3" fill="currentColor" opacity="0.7" />
        <rect x="13.5" y="9.6" width="3.5" height="4.2" rx="0.3" fill="currentColor" opacity="0.55" />
        <rect x="17.4" y="10.6" width="2.8" height="3.2" rx="0.3" fill="currentColor" opacity="0.7" />
        <rect x="11.5" y="6" width="3.5" height="3.4" rx="0.3" fill="currentColor" opacity="0.45" />
        <path d="M2.4 13.9h19.4l-2.7 4.5H5.6c-.9 0-1.6-.4-2-1.2z" fill="currentColor" />
      </g>
      <path className="jgs-wave" d="M0 21.3c1.5 0 1.5-1.3 3-1.3s1.5 1.3 3 1.3 1.5-1.3 3-1.3 1.5 1.3 3 1.3 1.5-1.3 3-1.3 1.5 1.3 3 1.3 1.5-1.3 3-1.3 1.5 1.3 3 1.3 1.5-1.3 3-1.3 1.5 1.3 3 1.3"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default ShipLoader;
