/* The app's loading mark: the goods on their way (V-7.9.0).

   An export house waits on ships all day, so the wait in the app is one too —
   and when the screen is dealing with an invoice or an order that goes by air
   or by road, the wait goes that way instead (lib/loaderMode.js):

     water (default)  a container ship in the company's colours, laden with
                      boxes in the brand's palette, pitching on a sea that runs
                      past it in three layers; smoke from the funnel, a wake
                      astern, spray at the bow, gulls keeping pace.
     air              a freighter in the same livery — the globe on its tail —
                      climbing through cloud banks that stream past below it,
                      contrails from its engines, beacon and strobe blinking.
     land             a prime mover hauling a 20-foot box down the road, wheels
                      turning, lane marks, roadside trees and posts and the
                      hills behind going by at their own speeds, exhaust from
                      the stack.

   By day a low sun; in the dark theme a moon and stars, the bridge, cockpit
   and cab lit, the truck's headlights on the road and the lamps along it.

     <ShipLoader label="…" />   the full scene, where a list or a page is coming in.
     <ShipSpin size={14} />      the same vessel as a small mark — a ship rocking
                                 on a swell, a plane trailing contrails, a truck
                                 bouncing along — wherever a button or a line of
                                 text used to turn a circle. A drop-in for an
                                 icon: it takes `size` and draws in currentColor.
     Either takes `mode` to choose for itself; without it, the screen decides.

   Every motion stops for anyone who has asked their system for less of it;
   the picture then stands still, and the label still says what is happening.
   No picture files: inline SVG, coloured by the theme's tokens (index.css ·
   "Ship loader"). */
import { useLoaderMode } from "../../lib/loaderMode.js";

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

function SeaScene() {
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

/* ---- the sky every scene shares ------------------------------------------ */
function Sky({ sun = [36, 65] }) {
  return (
    <>
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
        <circle className="jgl-sun-glow" cx={sun[0]} cy={sun[1]} r="15" />
        <circle className="jgl-sun" cx={sun[0]} cy={sun[1]} r="9" />
      </g>
    </>
  );
}

const CLOUD = "M150 25a5 5 0 0 1 9.4-2.4A6.4 6.4 0 0 1 171 24a4.4 4.4 0 0 1 1.6 8.5H151.6A3.9 3.9 0 0 1 150 25z";
const CLOUD_SM = "M156 14a3.8 3.8 0 0 1 7-1.8A4.8 4.8 0 0 1 171.6 14a3.2 3.2 0 0 1 1 6.2H157.4A2.9 2.9 0 0 1 156 14z";

/* A bank of cloud tops: round billows, one pattern every `period`, drawn one
   period wider than the scene so it loops like the sea. */
function bank(y, period) {
  const r = [period * 0.2, period * 0.15, period * 0.15];
  let d = `M0 ${y}`;
  for (let x = 0; x < W + period; x += period) {
    d += ` a${r[0]} ${r[0] * 0.8} 0 0 1 ${2 * r[0]} 0 a${r[1]} ${r[1] * 0.9} 0 0 1 ${2 * r[1]} 0 a${r[2]} ${r[2] * 0.7} 0 0 1 ${2 * r[2]} 0`;
  }
  return `${d} L${W + period} ${H} L0 ${H} Z`;
}
const BANK_BACK = { d: bank(84, 48), p: 48 };
const BANK_FRONT = { d: bank(92, 36), p: 36 };

/* ---- by air: a freighter climbing over the cloud ------------------------- */
function AirScene() {
  return (
    <svg className="jgl-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <Sky sun={[166, 26]} />
      <g className="jgl-cloud jga-far" style={{ animationDuration: "16s", animationDelay: "-4s" }}>
        <path className="jgl-cloud-fill" d={CLOUD} />
      </g>
      <g className="jgl-cloud jga-far" style={{ animationDuration: "22s", animationDelay: "-15s" }}>
        <path className="jgl-cloud-fill" d={CLOUD_SM} transform="translate(0 16)" />
      </g>
      <g className="jgl-sea" style={{ "--p": `${BANK_BACK.p}px`, animationDuration: "7s" }}>
        <path className="jga-bank-back" d={BANK_BACK.d} />
      </g>

      <g className="jga-plane">
        {/* contrails from the two engines, thinning astern */}
        <path className="jga-trail" d="M100.5 57.9H38" />
        <path className="jga-trail jga-trail-far" d="M38 57.9H-10" />
        <path className="jga-trail" d="M87.4 62.4H34" />
        <path className="jga-trail jga-trail-far" d="M34 62.4H-10" />
        {/* tailplane and fin: the fin carries the globe */}
        <path className="jga-stab" d="M51 47.4 40.6 51.6h5.2l14.6-3z" />
        <path className="jgl-hull" d="M53.4 46.2 45.2 24.2h6.6l13.4 19.6z" />
        <circle className="jga-globe" cx="52.4" cy="34.4" r="3.1" />
        <path className="jga-swoosh" d="M48.4 36.6c2.2 2 6.2 1.6 8.6-1.8" />
        {/* the fuselage: white over a navy belly, the orange cheatline between */}
        <path className="jga-body" d="M50 47c2-2.5 6-3.5 12-3.5h86c9 0 15.5 3.5 18 7.7-2.5 3.4-8 5.4-16 5.4H70c-8 0-15-3.6-20-9.6z" />
        <path className="jgl-hull" d="M55 51.6h109.6c-2.6 3.1-7.7 5-14.6 5H70c-6.4 0-11.4-1.8-15-5z" />
        <path className="jga-cheat" d="M60 50.3H158" />
        <rect className="jga-door" x="127.6" y="45.3" width="12.4" height="5.6" rx="0.8" />
        <text className="jga-name" x="99" y="49" textAnchor="middle">JAIKVIN CARGO</text>
        <path className="jgl-win" d="M155.4 46.6h3.1l1.8 1.7h-4.9zM151.2 46.6h3.2v1.7h-3.2z" />
        {/* the near wing, swept back, with its two engines */}
        <path className="jga-wing" d="M125 52.6 86.2 66.4h6.6l35.8-12.6z" />
        <rect className="jga-pylon" x="108.5" y="54.2" width="3" height="2.2" />
        <rect className="jga-engine" x="101" y="55.7" width="13.6" height="4.5" rx="2.25" />
        <ellipse className="jga-intake" cx="114" cy="57.95" rx="0.9" ry="2" />
        <rect className="jga-pylon" x="95" y="59.3" width="2.6" height="2" />
        <rect className="jga-engine" x="87.8" y="60.2" width="12.4" height="4.3" rx="2.15" />
        <ellipse className="jga-intake" cx="99.6" cy="62.35" rx="0.85" ry="1.9" />
        {/* beacons above and below, the strobe on the wingtip */}
        <circle className="jga-beacon" cx="104" cy="43.3" r="0.95" />
        <circle className="jga-beacon jga-beacon-2" cx="96" cy="56.9" r="0.85" />
        <circle className="jga-strobe" cx="87" cy="66.2" r="1" />
      </g>

      <g className="jgl-sea" style={{ "--p": `${BANK_FRONT.p}px`, animationDuration: "3.6s" }}>
        <path className="jga-bank-front" d={BANK_FRONT.d} />
      </g>
      {/* a wisp that streams past the plane now and then */}
      <g className="jga-wisp">
        <path className="jgl-cloud-fill" d={CLOUD_SM} transform="translate(20 38) scale(1.15)" />
      </g>
    </svg>
  );
}

/* ---- by land: a container truck on the road ------------------------------ */
const HILLS_BACK = { d: sea(63, 4.2, 70), p: 70 };
const HILLS_FRONT = { d: sea(68.5, 2.8, 46), p: 46 };
/* The roadside, one stretch of 100 units drawn three times so it loops. */
const ROADSIDE = [
  { k: "tree", x: 10, s: 1 }, { k: "post", x: 30 }, { k: "tree", x: 50, s: 1.3 },
  { k: "bush", x: 66 }, { k: "post", x: 80 }, { k: "tree", x: 92, s: 0.85 },
];
function Roadside() {
  return [0, 100, 200].flatMap((o) => ROADSIDE.map((r) => {
    const x = r.x + o;
    if (r.k === "tree") {
      return (
        <g key={`${o}-${r.x}`} transform={`translate(${x} 79) scale(${r.s})`}>
          <rect className="jgv-trunk" x="-0.6" y="-6" width="1.2" height="6" />
          <circle className="jgv-leaf" cx="0" cy="-9" r="4.4" />
          <circle className="jgv-leaf jgv-leaf-2" cx="1.8" cy="-7.6" r="2.8" />
        </g>
      );
    }
    if (r.k === "bush") {
      return <path key={`${o}-${r.x}`} className="jgv-leaf jgv-leaf-2" d={`M${x - 4} 79a2.6 2.6 0 0 1 4-2.2 2.8 2.8 0 0 1 4.6 2.2z`} />;
    }
    return (
      <g key={`${o}-${r.x}`}>
        <path className="jgv-post" d={`M${x} 80V55.6M${x} 56h4.6`} />
        <circle className="jgv-lamp" cx={x + 4.6} cy="57" r="1" />
        <circle className="jgv-lamp-glow" cx={x + 4.6} cy="58.5" r="5.5" />
      </g>
    );
  }));
}

function Wheel({ x }) {
  return (
    <g className="jgv-wheel">
      <circle className="jgv-tyre" cx={x} cy="85" r="4.6" />
      <circle className="jgv-rim" cx={x} cy="85" r="2.5" />
      <path className="jgv-spoke" d={`M${x - 2.3} 85h4.6M${x - 1.15} ${85 - 2}l2.3 4M${x + 1.15} ${85 - 2}l-2.3 4`} />
      <circle className="jgv-hub" cx={x} cy="85" r="0.85" />
    </g>
  );
}

function LandScene() {
  return (
    <svg className="jgl-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <Sky sun={[164, 30]} />
      <g className="jgl-cloud" style={{ animationDuration: "34s", animationDelay: "-12s" }}>
        <path className="jgl-cloud-fill" d={CLOUD} transform="translate(0 -4)" />
      </g>
      <g className="jgl-cloud" style={{ animationDuration: "46s", animationDelay: "-34s" }}>
        <path className="jgl-cloud-fill" d={CLOUD_SM} />
      </g>
      <g className="jgl-sea" style={{ "--p": `${HILLS_BACK.p}px`, animationDuration: "18s" }}>
        <path className="jgv-hill-2" d={HILLS_BACK.d} />
      </g>
      <g className="jgl-sea" style={{ "--p": `${HILLS_FRONT.p}px`, animationDuration: "10s" }}>
        <path className="jgv-hill-1" d={HILLS_FRONT.d} />
      </g>
      <rect className="jgv-field" x="0" y="74" width={W} height="9" />
      <g className="jgv-roadside"><Roadside /></g>

      {/* the road: a shoulder line, the lane marks running under the truck */}
      <rect className="jgv-road" x="0" y="82" width={W} height="15" />
      <path className="jgv-edge" d={`M0 82.7H${W}`} />
      <g className="jgv-lane"><path className="jgv-dash" d={`M0 93.2H${W + 16}`} /></g>
      <rect className="jgv-verge" x="0" y="97" width={W} height="3" />

      {/* headlights on the road after dark */}
      <path className="jgv-beam" d="M154.6 74.4 200 67.5v22z" />
      {/* exhaust from the stack */}
      {[0, 0.8, 1.6].map((d) => (
        <circle key={d} className="jgl-smoke" cx="128.1" cy="48.6" r="1.9" style={{ animationDelay: `${-d}s` }} />
      ))}
      <g className="jgv-body">
        {/* the trailer and its 20-foot box, in the company's orange */}
        <rect className="jgv-chassis" x="47.5" y="77" width="79" height="3" />
        <rect className="jgv-leg" x="108.6" y="79.6" width="1.3" height="4.2" />
        <rect className="jgv-box" x="50" y="55" width="74" height="22" rx="0.6" />
        <path className="jgv-ribs" d={Array.from({ length: 20 }, (_, i) => `M${57 + i * 3.4} 56.4v19.2`).join("")} />
        <path className="jgv-rods" d="M51.8 56.2v19.6M53.6 56.2v19.6" />
        <path className="jgv-rail" d="M50.4 55.6h73.2M50.4 76.4h73.2" />
        <circle className="jgv-mark" cx="66" cy="66" r="3" />
        <path className="jgv-mark" d="M63 66h6M66 63c-1.6 1.6-1.6 4.4 0 6M66 63c1.6 1.6 1.6 4.4 0 6" />
        <text className="jgv-name" x="94" y="67.9" textAnchor="middle">JAIKVIN GLOBAL</text>
        <rect className="jgv-tail" x="47.4" y="76.2" width="1.5" height="2.2" rx="0.3" />
        {/* one flat fender over the trailer's tandem axle */}
        <path className="jgv-guard" d="M54.4 80.4q0-1.6 1.6-1.6h18.6q1.6 0 1.6 1.6" />
        {/* the prime mover: navy cab, orange stripe, chrome bumper */}
        <rect className="jgv-stack" x="127.2" y="49.4" width="1.8" height="9.4" rx="0.4" />
        <path className="jgl-hull" d="M129.5 58l2.9-5.4h8.2l2 5.4z" />
        <path className="jgl-hull" d="M129 58h14c3.4 0 5.6 1.8 6.8 4.4l3.6 7.6V81H126V60.6c0-1.4 1.4-2.6 3-2.6z" />
        <path className="jgv-glass" d="M143.6 60.6h2.2c1.2 0 2.2.8 2.8 2l2.6 6.4h-7.6zM133.4 61h8v6.6h-8z" />
        <path className="jgv-seam" d="M132 60.4V79" />
        <rect className="jgv-stripe" x="126" y="72.4" width="27.4" height="1.4" />
        <path className="jgv-mirror" d="M149 61.4l2.6-1.6v3" />
        <rect className="jgv-bumper" x="149.8" y="78" width="5.6" height="3.2" rx="0.6" />
        <rect className="jgv-head" x="152.6" y="73.6" width="1.9" height="1.9" rx="0.4" />
        <path className="jgv-guard" d="M128.8 81a5.2 5.2 0 0 1 10.4 0M140.8 81a5.2 5.2 0 0 1 10.4 0" />
        <rect className="jgv-step" x="132.6" y="79" width="5" height="1.1" rx="0.4" />
      </g>
      <Wheel x={60} /><Wheel x={70.6} /><Wheel x={134} /><Wheel x={146} />
    </svg>
  );
}

const SCENES = { water: SeaScene, air: AirScene, land: LandScene };
const SAYS = { water: "by sea", air: "by air", land: "by road" };

/** The full loading scene with what is being waited for under it. `mode`
 *  chooses the vessel; without it, the screen open now decides (water by
 *  default). */
export function ShipLoader({ label = "Loading…", size, mode }) {
  const screen = useLoaderMode();
  const m = SCENES[mode] ? mode : screen;
  const Scene = SCENES[m] || SeaScene;
  return (
    <div className={`jgl jgl-${m}${size === "lg" ? " jgl-lg" : size === "sm" ? " jgl-sm" : ""}`} role="status" aria-live="polite"
      data-mode={m} aria-label={label ? `${label} (${SAYS[m]})` : SAYS[m]}>
      <Scene />
      {label && <p className="jgl-label">{label}</p>}
    </div>
  );
}

/* The small marks — one per way of travel, each drawn in currentColor. */
function SmallShip() {
  return (
    <>
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
    </>
  );
}
function SmallPlane() {
  return (
    <>
      <path className="jgs-trail" d="M-6 14.6H6.5M-6 17.6H5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="3 2.2" opacity="0.55" />
      <g className="jgs-plane">
        <path d="M4.2 11.4 2.6 6.2h2.6l3.4 5z" fill="currentColor" />
        <path d="M3.4 12.6c0-1 .8-1.6 1.8-1.6h12.4c2.1 0 4 .6 5.2 1.6-1.2 1-3.1 1.6-5.2 1.6H5.2c-1 0-1.8-.6-1.8-1.6z" fill="currentColor" />
        <path d="M13.6 13.4 9.4 18.6h2.8l5.2-5.2z" fill="currentColor" />
        <path d="M5 13.2 3.2 15.6h1.9l2.7-2.4z" fill="currentColor" opacity="0.7" />
      </g>
    </>
  );
}
function SmallTruck() {
  return (
    <>
      <path className="jgs-road" d="M0 22.2h30" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="3 3" opacity="0.6" />
      <g className="jgs-truck">
        <rect x="1.6" y="6.4" width="12.6" height="8" rx="0.6" fill="currentColor" opacity="0.65" />
        <path d="M15 8.8h3.6c.7 0 1.2.3 1.5.9l2 3.2v3.2H15z" fill="currentColor" />
        <rect x="1.6" y="14.8" width="20.5" height="1.5" fill="currentColor" />
      </g>
      {[5.4, 9.4, 18.6].map((x) => (
        <g key={x} className="jgs-wheel">
          <circle cx={x} cy="18.2" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d={`M${x - 0.9} 18.2h1.8`} stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      ))}
    </>
  );
}
const SMALL = { water: SmallShip, air: SmallPlane, land: SmallTruck };

/** The vessel as a small mark — a drop-in for a turning icon. */
export function ShipSpin({ size = 16, className = "", style, mode }) {
  const screen = useLoaderMode();
  const m = SMALL[mode] ? mode : screen;
  const Mark = SMALL[m] || SmallShip;
  return (
    <svg className={`jgs jgs-${m} ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}>
      <Mark />
    </svg>
  );
}

export default ShipLoader;
