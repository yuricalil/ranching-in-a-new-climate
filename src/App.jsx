import React, { useState, useMemo, useEffect } from "react";

/* Texas A&M maroon-anchored palette.
   Primary maroon #500000; accents chosen to coordinate with it.
   Key names are kept so the rest of the code is unchanged; only the
   values move to the maroon family. */
const C = {
  orange: "#500000",   // Aggie maroon (primary accent)
  orangeDeep: "#3A0000",
  teal: "#7C2929",     // brick / warm secondary
  tealDeep: "#5C1A1A",
  coral: "#A52A2A",    // lighter brick-red for warnings/emphasis
  indigo: "#8C6A56",   // muted taupe-brown (cool accent stand-in)
  ink: "#2E2422",      // near-black warm brown for text
  paper: "#F7F3F1",    // warm off-white
  paperWarm: "#F3E9E6",// soft maroon-tinted panel
  line: "#E3D7D2",     // warm hairline
  green: "#6B7A4F",    // muted olive (positive figures)
  red: "#9E1B1B",
  slate: "#6E5A55",    // warm slate-brown
};
const fmt = (n, dp = 0) => (n < 0 ? "−$" : "$") + Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtNum = (n, dp = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ============================================================
   RANCHING IN A NEW CLIMATE  —  v6
   The 2011 FARM Assistance stocking decision (destock/restock),
   updated to 2026 assumptions. Hybrid model: headline NCFI / cash
   / net-worth anchor to the nine validated 2026 FARM Assistance
   runs; a transparent year-by-year engine drives the trajectory
   and the sensitivity to an editable, year-by-year price path.
   ============================================================ */

const CAL = {
  herd0: 50, bulls: 2, acres: 400, calvingRate: 86, cullRate: 8,
  steerWt: 525, heiferWt: 500, steerShare: 0.50,
  steerPrice: 4.50, heiferPrice: 4.30, cullCowPrice: 1.70, cullCowWt: 1100,
  bredCowPrice: 3800, herdSire: 10000,
  hayPrice: 250, cubePrice: 450, hayTonCow: 3.376, cubeTonCow: 1.46,
  maintFeedCow: 317, prodCostCow: 172,
  hunting: 8000, offFarm: 100000, familyLiving: 57000, cashStart: 10000,
  realEstate0: 2060000, machinery0: 127000, inflation: 0.027, costInflation: 0,
  baselineTrend: -3.0,
};

/* Real base-run consolidated balance sheet (Fast-Base Table 5-D, 2026-2035).
   Real estate, machinery, intermediate debt and deferred taxes are structural
   and not driven by the stocking decision; cash and livestock are scaled by the
   engine for the chosen strategy. */
const BS_BASE = {
  realEstate: [2060000, 2116650, 2185653, 2257779, 2324610, 2402484, 2490896, 2593271, 2705819, 2823252],
  machinery: [127000, 123190, 119494, 115909, 139702, 135511, 131446, 127502, 123677, 119967],
  intDebt: [21406, 14549, 7417, 0, 27270, 22175, 16906, 11458, 5825, 0],
  defTax: [198597, 204887, 213989, 222577, 235416, 245490, 258105, 271979, 288305, 305075],
  livestock: [177880, 172749, 160487, 151736, 144600, 138861, 133851, 129156, 125145, 125145],
  cash: [36185, 66125, 102989, 171559, 258365, 323021, 397624, 468119, 546668, 621384],
};

/* The nine published 2026 FARM Assistance runs (validation anchors) */
const RUNS = [
  { id: 1, d: 0,   r: 100, ncfi: 26565.5, endCash: 621984, nw: 33, receipts: 96573.9, costs: 70008.5 },
  { id: 2, d: 25,  r: 100, ncfi: 28564.9, endCash: 639979, nw: 34, receipts: 95359.3, costs: 66794.5 },
  { id: 3, d: 50,  r: 100, ncfi: 29416.0, endCash: 646787, nw: 34, receipts: 94381.5, costs: 64965.6 },
  { id: 4, d: 75,  r: 100, ncfi: 28743.6, endCash: 631534, nw: 34, receipts: 94184.8, costs: 65441.3 },
  { id: 5, d: 100, r: 100, ncfi: 25780.9, endCash: 610792, nw: 33, receipts: 90721.2, costs: 64940.4 },
  { id: 6, d: 25,  r: 75,  ncfi: 33209.7, endCash: 670809, nw: 34, receipts: 80610.0, costs: 47400.3 },
  { id: 7, d: 50,  r: 75,  ncfi: 32044.0, endCash: 666098, nw: 34, receipts: 79652.0, costs: 47608.4 },
  { id: 8, d: 75,  r: 75,  ncfi: 29234.2, endCash: 647010, nw: 33, receipts: 78423.6, costs: 49189.0 },
  { id: 9, d: 100, r: 75,  ncfi: 27200.8, endCash: 622721, nw: 32, receipts: 77004.0, costs: 49803.0 },
];

function idw(d, r, key) {
  let w = 0, v = 0, ex = null;
  RUNS.forEach((run) => {
    const dist = Math.hypot((d - run.d) / 100, (r - run.r) / 100);
    if (dist < 0.001) ex = run[key];
    const ww = 1 / Math.pow(dist + 0.05, 2.2);
    w += ww; v += ww * run[key];
  });
  return ex !== null ? ex : v / w;
}

/* default editable price path: Year-1 = DBG 2026, evolving at a trend */
function buildPrices(horizon, trendPct, prev, cal = CAL, feedTrendPct = 0) {
  const arr = [];
  for (let y = 0; y < horizon; y++) {
    if (prev && prev[y] && prev[y].override) { arr.push(prev[y]); continue; }
    const f = Math.pow(1 + trendPct / 100, y);
    const g = Math.pow(1 + feedTrendPct / 100, y);
    arr.push({
      steer: +(cal.steerPrice * f).toFixed(2),
      heifer: +(cal.heiferPrice * f).toFixed(2),
      cull: +(cal.cullCowPrice * f).toFixed(2),
      hay: Math.round(cal.hayPrice * g),
      cube: Math.round(cal.cubePrice * g),
      override: false,
    });
  }
  return arr;
}

/* year-by-year assumption path: base values evolve (costs by cost inflation),
   any year can be overridden on the Assumptions tab */
function buildAssump(horizon, cal, prev) {
  const arr = [];
  for (let y = 0; y < horizon; y++) {
    if (prev && prev[y] && prev[y].override) { arr.push(prev[y]); continue; }
    const cInf = Math.pow(1 + (cal.costInflation || 0) / 100, y);
    arr.push({
      calvingRate: cal.calvingRate,
      cullRate: cal.cullRate,
      maintFeed: Math.round(cal.maintFeedCow * cInf),
      prodCost: Math.round(cal.prodCostCow * cInf),
      offFarm: cal.offFarm,
      familyLiving: cal.familyLiving,
      override: false,
    });
  }
  return arr;
}

const DEFAULTS = {
  horizon: 10,
  destockYear: 1, destockPct: 25,
  restockYear: 3, restockPct: 75,
  feedRecoverYear: 4,
  priceTrend: 0.0,
  herd0: 50, calvingRate: 86,
};

/* Published stocking paths from the 2026 scenario runs (years 1-10, annualized;
   quarterly sell-down patterns like 25/12/0/0 are averaged within the year).
   Used when the strategy matches a published run at the default timing. */
const PUB_PATHS = {
  "0/100":   [50,50,50,50,50,50,50,50,50,50],
  "25/100":  [37,43,50,50,50,50,50,50,50,50],
  "50/100":  [25,31,50,50,50,50,50,50,50,50],
  "75/100":  [15,22,50,50,50,50,50,50,50,50],
  "100/100": [9,9,50,50,50,50,50,50,50,50],
  "25/75":   [37,37,37,37,37,37,37,37,37,37],
  "50/75":   [25,31,37,37,37,37,37,37,37,37],
  "75/75":   [12,25,37,37,37,37,37,37,37,37],
  "100/75":  [9,9,37,37,37,37,37,37,37,37],
};

/* herd path: destock in any year, restock by any later year */
function herdPath(s) {
  const n = s.horizon, base = s.herd0;
  // snap to the published stocking pattern when the strategy matches a run at default timing
  if (s.destockYear === 1 && s.restockYear === 3) {
    const pub = PUB_PATHS[s.destockPct + "/" + s.restockPct];
    if (pub) {
      const scale = base / 50;
      const path = [];
      for (let y = 0; y < n; y++) path.push(Math.round(pub[Math.min(y, pub.length - 1)] * scale));
      return path;
    }
  }
  const dY = Math.min(Math.max(s.destockYear, 1), n);
  const rY = Math.min(Math.max(s.restockYear, dY), n);
  const remain = base * (1 - s.destockPct / 100);
  const target = base * (s.restockPct / 100);
  const path = [];
  for (let y = 1; y <= n; y++) {
    let head;
    if (y < dY) head = base;
    else if (y === dY) head = remain;
    else if (y < rY) { const span = Math.max(rY - dY, 1); head = remain + (target - remain) * ((y - dY) / span); }
    else head = target;
    path.push(Math.round(head));
  }
  return path;
}

/* transparent year-by-year engine — returns annual NCFI & components */
function engineYears(s, prices, cal = CAL, aPath = null) {
  const n = s.horizon, path = herdPath(s);
  const out = [];
  let prevHead = s.herd0;
  for (let y = 0; y < n; y++) {
    const p = prices[y], head = path[y];
    const recovering = y < (s.feedRecoverYear - 1);
    const A = aPath ? aPath[y] : null;
    const calves = head * (A ? A.calvingRate : s.calvingRate) / 100;
    const steers = calves * cal.steerShare, heifers = calves * (1 - cal.steerShare);
    const calfRev = steers * cal.steerWt * p.steer + heifers * cal.heiferWt * p.heifer;
    const annualCull = head * (A ? A.cullRate : cal.cullRate) / 100;
    const sellDown = Math.max(prevHead - head, 0);
    const cullRev = (annualCull + sellDown) * cal.cullCowWt * p.cull;
    const cInf = Math.pow(1 + (cal.costInflation || 0) / 100, y);
    const feedPerCow = recovering ? (cal.hayTonCow * p.hay + cal.cubeTonCow * p.cube) : (A ? A.maintFeed : cal.maintFeedCow * cInf);
    const feedCost = head * feedPerCow;
    const prodCost = head * (A ? A.prodCost : cal.prodCostCow * cInf);
    const bought = Math.max(head - prevHead, 0) + annualCull;
    const replCost = bought * cal.bredCowPrice;
    const hunt = cal.hunting;
    const ncfi = calfRev + cullRev + hunt - feedCost - prodCost - replCost;
    out.push({ head, calfRev, cullRev, hunt, feedCost, prodCost, replCost, ncfi });
    prevHead = head;
  }
  return out;
}
const avgNcfiOf = (yrs) => yrs.reduce((a, b) => a + b.ncfi, 0) / yrs.length;

/* hybrid model: anchor to published runs, scale by engine price-sensitivity */
function model(s, prices, cal = CAL, aPath = null) {
  const yrs = engineYears(s, prices, cal, aPath);
  const calBase = { ...cal, costInflation: 0 };  // published runs assumed no extra cost drift
  const baseYrs = engineYears(s, buildPrices(s.horizon, cal.baselineTrend, null, calBase), calBase);
  const engNow = avgNcfiOf(yrs), engBase = avgNcfiOf(baseYrs);
  const sens = engBase !== 0 ? engNow / engBase : 1;

  // Published runs report NCFI excluding hunting (hunting was a separate cash-flow line).
  // The engine now includes hunting inside NCFI, so the anchor is lifted by the same
  // amount. This keeps every published strategy reproducing exactly on the new basis.
  const anchorNcfi = idw(s.destockPct, s.restockPct, "ncfi") + cal.hunting;
  const anchorCash = idw(s.destockPct, s.restockPct, "endCash");
  const anchorNw = idw(s.destockPct, s.restockPct, "nw");

  // timing adjustment: later destock / slower restock erodes the benefit
  const timingPenalty = (Math.max(s.destockYear - 1, 0) * 0.04) + (Math.max(s.restockYear - 3, 0) * 0.02);
  const timingFactor = Math.max(0.5, 1 - timingPenalty);

  const avgNcfi = anchorNcfi * sens * timingFactor;
  const endCash = anchorCash * (0.55 + 0.45 * sens) * timingFactor;
  const nwGrowth = anchorNw * (0.7 + 0.3 * sens);

  // annual NCFI trajectory: scale engine path so its mean = avgNcfi
  const scale = engNow !== 0 ? avgNcfi / engNow : 1;
  const ncfiTraj = yrs.map((yr) => yr.ncfi * scale);
  // simplified NFI: NCFI minus depreciation on purchased cows (declining), plus held-cull basis advantage
  let depBook = 0; const nfiTraj = [];
  yrs.forEach((yr, i) => {
    depBook = depBook * (5 / 6) + (yr.replCost * scale) / 6;
    const sellDown = i > 0 ? Math.max(yrs[i - 1].head - yr.head, 0) : 0;
    const heldAdv = sellDown * cal.cullCowWt * prices[i].cull * 0.15;
    nfiTraj.push(yr.ncfi * scale - depBook + heldAdv);
  });
  const avgNfi = nfiTraj.reduce((a, b) => a + b, 0) / nfiTraj.length;

  // ending cash trajectory
  let cash = cal.cashStart; const cashTraj = [];
  ncfiTraj.forEach((v, i) => {
    const off = aPath && aPath[i] ? aPath[i].offFarm : cal.offFarm;
    const fam = aPath && aPath[i] ? aPath[i].familyLiving : cal.familyLiving;
    const taxable = Math.max(v + off - fam, 0);
    cash += v + off - fam - taxable * 0.18;
    cashTraj.push(cash);
  });
  // rescale cash trajectory endpoint to the anchored endCash
  const cEnd = cashTraj[cashTraj.length - 1];
  const cAdj = cEnd !== 0 ? endCash / cEnd : 1;
  const cashTrajAdj = cashTraj.map((v) => v * cAdj);
  // scaled component series for the financial tables
  const scaledYrs = yrs.map((yr, i) => ({
    ...yr,
    calfRev: yr.calfRev * scale, cullRev: yr.cullRev * scale,
    feedCost: yr.feedCost * scale, prodCost: yr.prodCost * scale,
    replCost: yr.replCost * scale, ncfi: ncfiTraj[i], nfi: nfiTraj[i],
    cash: cashTrajAdj[i],
  }));

  return { path: herdPath(s), yrs: scaledYrs, avgNcfi, avgNfi, endCash, nwGrowth, ncfiTraj, nfiTraj, cashTraj: cashTrajAdj, sens };
}

function bestRun() { return RUNS.reduce((b, r) => (r.ncfi > b.ncfi ? r : b)); }

/* ============================================================
   OPTIMIZER — multi-objective constrained search
   Decision vars: destock% (0..100 step 5), restock% (50..100 step 5)
   Objective: tunable weighted sum of normalized NCFI, cash, net worth
   Constraint: optional stocking-rate cap (range-safe variant)
   Method: exhaustive grid -> provably global optimum, fully transparent
   ============================================================ */
function optimize(s, prices, cal, weights, rMaxSafe, aPath = null, stress = false, band = 15) {
  const dGrid = [], rGrid = [];
  for (let d = 0; d <= 100; d += 5) dGrid.push(d);
  for (let r = 50; r <= 100; r += 5) rGrid.push(r);
  const lowPrices = prices.map((p) => ({ ...p, steer: p.steer * (1 - band / 100), heifer: p.heifer * (1 - band / 100), cull: p.cull * (1 - band / 100) }));

  // 1) evaluate the engine across the whole grid, under base and adverse prices
  const cells = [];
  for (const d of dGrid) for (const r of rGrid) {
    const m = model({ ...s, destockPct: d, restockPct: r }, prices, cal, aPath);
    const mL = model({ ...s, destockPct: d, restockPct: r }, lowPrices, cal, aPath);
    cells.push({ d, r, ncfi: m.avgNcfi, cash: m.endCash, nw: m.nwGrowth, ncfiLow: mL.avgNcfi, cashLow: mL.endCash, nwLow: mL.nwGrowth });
  }
  // 2) min-max normalize each objective across the feasible set
  //    (under the adverse scenario when stress ranking is on)
  const kN = stress ? "ncfiLow" : "ncfi", kC = stress ? "cashLow" : "cash", kW = stress ? "nwLow" : "nw";
  const range = (key) => {
    const vals = cells.map((c) => c[key]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return { lo, hi, span: hi - lo || 1 };
  };
  const rN = range(kN), rC = range(kC), rW = range(kW);
  const norm = (c) => ({
    ...c,
    nN: (c[kN] - rN.lo) / rN.span,
    nC: (c[kC] - rC.lo) / rC.span,
    nW: (c[kW] - rW.lo) / rW.span,
  });
  const W = weights.ncfi + weights.cash + weights.nw || 1;
  const scored = cells.map(norm).map((c) => ({
    ...c,
    U: (weights.ncfi * c.nN + weights.cash * c.nC + weights.nw * c.nW) / W,
  }));

  // 3) unconstrained optimum + top 3
  const ranked = [...scored].sort((a, b) => b.U - a.U);
  const best = ranked[0];
  const top3 = ranked.slice(0, 3);

  // 4) range-safe optimum (restock <= cap)
  const safe = scored.filter((c) => c.r <= rMaxSafe).sort((a, b) => b.U - a.U);
  const bestSafe = safe.length ? safe[0] : null;

  return { scored, best, top3, bestSafe, dGrid, rGrid, ranges: { rN, rC, rW } };
}


/* ============================================================
   UI PRIMITIVES
   ============================================================ */
function Slider({ label, value, min, max, step, onChange, suffix = "", help, accent = C.orange, fmtVal }) {
  const pct = ((value - min) / (max - min)) * 100;
  const shown = fmtVal ? fmtVal(value) : `${value}${suffix}`;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{label}</label>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: accent, background: accent + "18", padding: "2px 9px", borderRadius: 6 }}>{shown}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 6, borderRadius: 6, appearance: "none", outline: "none", color: accent, background: `linear-gradient(90deg, ${accent} ${pct}%, ${C.line} ${pct}%)`, cursor: "pointer" }} />
      {help && <div style={{ fontSize: 11, color: "#8A8276", marginTop: 4, lineHeight: 1.4 }}>{help}</div>}
    </div>
  );
}
function Stat({ label, value, sub, accent, big }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 13, padding: "13px 15px", borderTop: `4px solid ${accent}`, boxShadow: "0 1px 3px rgba(63,63,63,0.06)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A8276" }}>{label}</div>
      <div style={{ fontSize: big ? 25 : 19, fontWeight: 800, color: accent, fontFamily: "'IBM Plex Mono', monospace", marginTop: 3, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#8A8276", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Panel({ title, subtitle, accent, children, right }) {
  return (
    <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16, boxShadow: "0 2px 8px rgba(63,63,63,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Bitter', serif", fontSize: 17, color: C.ink, display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 8, height: 18, borderRadius: 3, background: accent }} />{title}
          </h3>
          {subtitle && <p style={{ margin: "4px 0 0 17px", color: "#8A8276", fontSize: 12.5, lineHeight: 1.45 }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* dual-line chart: NCFI and NFI over the years, with a zero line */
function DualChart({ years, ncfi, nfi, band, pinned, height = 250 }) {
  const W = 640, H = height, padL = 54, padR = 16, padT = 18, padB = 30;
  const all = [...ncfi, ...nfi, ...(band ? [...band.lo, ...band.hi] : []), ...(pinned || [])];
  const min = Math.min(...all, 0), max = Math.max(...all, 0), range = max - min || 1;
  const x = (i) => padL + (i / Math.max(years.length - 1, 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / range) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[0,1,2,3,4,5].map((i) => { const v = min + (range*i)/5; return (<g key={i}><line x1={padL} x2={W-padR} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1}/><text x={padL-7} y={y(v)+3} textAnchor="end" fontSize={9.5} fill="#9A9285" fontFamily="'IBM Plex Mono', monospace">{Math.round(v/1000)}k</text></g>); })}
      {y(0)>padT && y(0)<H-padB && <line x1={padL} x2={W-padR} y1={y(0)} y2={y(0)} stroke="#B9AE9C" strokeWidth={1.5} strokeDasharray="4 3"/>}
      {years.map((l,i)=><text key={i} x={x(i)} y={H-9} textAnchor="middle" fontSize={9} fill="#9A9285" fontFamily="'IBM Plex Mono', monospace">{l}</text>)}
      {band && <polygon fill={C.orange} fillOpacity="0.12" stroke="none" points={[...band.hi.map((v,i)=>`${x(i)},${y(v)}`), ...band.lo.map((v,i)=>`${x(band.lo.length-1-i)},${y(band.lo[band.lo.length-1-i])}`)].join(" ")}/>}
      {pinned && <polyline fill="none" stroke="#9A9285" strokeWidth={2} strokeDasharray="3 4" strokeLinejoin="round" points={pinned.map((v,i)=>`${x(i)},${y(v)}`).join(" ")}/>}
      <polyline fill="none" stroke={C.orange} strokeWidth={2.8} strokeLinejoin="round" strokeLinecap="round" points={ncfi.map((v,i)=>`${x(i)},${y(v)}`).join(" ")}/>
      <polyline fill="none" stroke={C.indigo} strokeWidth={2.2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" points={nfi.map((v,i)=>`${x(i)},${y(v)}`).join(" ")}/>
      {ncfi.map((v,i)=><circle key={"a"+i} cx={x(i)} cy={y(v)} r={2.6} fill={C.orange}/>)}
      {nfi.map((v,i)=><circle key={"b"+i} cx={x(i)} cy={y(v)} r={2.3} fill={C.indigo}/>)}
    </svg>
  );
}

/* herd path bar strip */
function HerdStrip({ years, path, herd0 }) {
  const max = Math.max(herd0, ...path);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 90, marginTop: 4 }}>
      {path.map((h, i) => {
        const pctH = (h / max) * 100;
        const col = h >= herd0 ? C.teal : h <= herd0 * 0.4 ? C.coral : C.orange;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, fontWeight: 700 }}>{h}</span>
            <div style={{ width: "100%", height: pctH + "%", minHeight: 4, background: col, borderRadius: "4px 4px 0 0" }} />
            <span style={{ fontSize: 8.5, color: "#9A9285", fontFamily: "'IBM Plex Mono', monospace" }}>{years[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

/* editable year-by-year price table */
function PriceTable({ prices, setPrices, years, trend, setTrend, feedTrend, setFeedTrend, cal = CAL }) {
  const upd = (yi, field, val) => {
    const next = prices.map((p, i) => i === yi ? { ...p, [field]: val, override: true } : p);
    setPrices(next);
  };
  const resetYear = (yi) => {
    const f = Math.pow(1 + trend / 100, yi);
    const g = Math.pow(1 + (feedTrend || 0) / 100, yi);
    const np = { steer: +(cal.steerPrice*f).toFixed(2), heifer: +(cal.heiferPrice*f).toFixed(2), cull: +(cal.cullCowPrice*f).toFixed(2), hay: Math.round(cal.hayPrice*g), cube: Math.round(cal.cubePrice*g), override: false };
    setPrices(prices.map((p, i) => i === yi ? np : p));
  };
  const th = { padding: "7px 7px", fontSize: 10, fontWeight: 700, color: "#fff", textAlign: "center", fontFamily: "'Source Sans 3',sans-serif" };
  const cell = (yi, field, step, prefix = "$") => (
    <td style={{ padding: "3px 4px", textAlign: "center" }}>
      <input type="number" value={prices[yi][field]} step={step}
        onChange={(e) => upd(yi, field, parseFloat(e.target.value) || 0)}
        style={{ width: 60, border: `1px solid ${prices[yi].override ? C.orange : C.line}`, borderRadius: 6, padding: "5px 4px", fontSize: 11.5, fontFamily: "'IBM Plex Mono',monospace", textAlign: "center", color: C.ink, background: prices[yi].override ? C.orange + "0E" : "#fff" }} />
    </td>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Slider label="Cattle price trend (from Year 1)" value={trend} min={-8} max={8} step={0.5} accent={C.coral} onChange={setTrend} fmtVal={(v) => (v > 0 ? "+" : "") + v.toFixed(1) + "%/yr"} help="Applies to steer, heifer, and cull prices. Year 1 holds the 2026 values; later years evolve at this rate. Edit any cell to override a single year." />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Slider label="Feed price trend (from Year 1)" value={feedTrend} min={-8} max={8} step={0.5} accent={C.green} onChange={setFeedTrend} fmtVal={(v) => (v > 0 ? "+" : "") + v.toFixed(1) + "%/yr"} help="Applies to hay and supplement. Cattle and feed prices move separately because they rarely move together, especially in drought." />
        </div>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 11 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
          <thead><tr style={{ background: C.slate }}>
            <th style={{ ...th, textAlign: "left", paddingLeft: 12 }}>Year</th>
            <th style={th}>Steer $/lb</th><th style={th}>Heifer $/lb</th><th style={th}>Cull $/lb</th><th style={th}>Hay $/ton</th><th style={th}>Cube $/ton</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {prices.map((p, yi) => (
              <tr key={yi} style={{ background: yi % 2 ? C.paperWarm : "#fff" }}>
                <td style={{ padding: "3px 12px", fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: C.ink }}>{years[yi]}{p.override && <span style={{ color: C.orange, fontSize: 9, marginLeft: 4 }}>{"✎"}</span>}</td>
                {cell(yi, "steer", 0.05)}{cell(yi, "heifer", 0.05)}{cell(yi, "cull", 0.05)}{cell(yi, "hay", 5)}{cell(yi, "cube", 5)}
                <td style={{ padding: "3px 6px", textAlign: "center" }}>{p.override && <button onClick={() => resetYear(yi)} title="reset this year to trend" style={{ background: "none", border: "none", color: C.coral, cursor: "pointer", fontSize: 12 }}>{"↺"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* validation panel: 9 published runs vs the live model at baseline */
function ValidationTable({ s, onPick }) {
  const best = bestRun();
  const th = { padding: "7px 8px", fontSize: 10, fontWeight: 700, color: "#fff", textAlign: "right" };
  const td = { padding: "7px 8px", fontSize: 11.5, fontFamily: "'IBM Plex Mono',monospace", textAlign: "right", color: C.ink };
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 11 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 540 }}>
        <thead><tr style={{ background: C.green }}>
          <th style={{ ...th, textAlign: "left" }}>#</th><th style={{ ...th, textAlign: "left" }}>Strategy</th><th style={th}>NCFI/yr</th><th style={th}>End cash</th><th style={th}>Net worth</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {RUNS.map((run) => {
            const cur = run.d === s.destockPct && run.r === s.restockPct;
            const isB = run.id === best.id;
            return (
              <tr key={run.id} style={{ background: cur ? C.indigo + "14" : (isB ? "#EAF4E6" : (run.id % 2 ? C.paperWarm : "#fff")), outline: cur ? `2px solid ${C.indigo}` : "none", outlineOffset: -2 }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{run.id}</td>
                <td style={{ ...td, textAlign: "left", fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600, fontSize: 12 }}>Destock {run.d}% / Restock {run.r}%{isB ? " ★" : ""}</td>
                <td style={{ ...td, fontWeight: 800, color: isB ? C.green : C.ink }}>{fmt(run.ncfi)}</td>
                <td style={td}>{fmt(run.endCash)}</td><td style={td}>{run.nw}%</td>
                <td style={{ ...td }}><button onClick={() => onPick(run.d, run.r)} style={{ background: cur ? C.indigo : "#fff", color: cur ? "#fff" : C.indigo, border: `1.3px solid ${C.indigo}`, borderRadius: 7, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{cur ? "Set" : "Use"}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Fonts() {
  return (<style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bitter:wght@600;700;800&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
    * { box-sizing: border-box; } body { margin: 0; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid currentColor; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
    input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 3px solid currentColor; cursor: pointer; }
    input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    @media (max-width: 820px) { .two-col { grid-template-columns: 1fr !important; } }
  `}</style>);
}

/* ============================================================
   MAIN DASHBOARD
   ============================================================ */

/* ============================================================
   TAB 2 — ASSUMPTIONS (editable)
   Surfaces the model constants not shown on the dashboard.
   ============================================================ */
function NumField({ label, value, onChange, step = 1, prefix = "", suffix = "", help }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B6459", marginBottom: 4 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${C.line}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {prefix && <span style={{ padding: "0 8px", color: "#9A9285", fontSize: 12.5 }}>{prefix}</span>}
        <input type="number" value={value} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{ flex: 1, border: "none", outline: "none", padding: "8px 6px", fontSize: 13.5, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, width: "100%" }} />
        {suffix && <span style={{ padding: "0 9px", color: "#9A9285", fontSize: 12.5 }}>{suffix}</span>}
      </div>
      {help && <div style={{ fontSize: 11, color: "#9A9285", marginTop: 3 }}>{help}</div>}
    </div>
  );
}
function AssumeCard({ title, accent, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 13, padding: "16px 18px", borderTop: `4px solid ${accent}` }}>
      <h4 style={{ margin: "0 0 13px", fontSize: 14, fontWeight: 800, color: C.ink, fontFamily: "'Bitter', serif" }}>{title}</h4>
      {children}
    </div>
  );
}
function YearOverrides({ assump, setAssump, years, cal }) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 2px 8px rgba(63,63,63,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: open ? 14 : 0 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Bitter', serif", fontSize: 17, color: C.ink, display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 8, height: 18, borderRadius: 3, background: C.indigo }} />Year-by-year overrides
          </h3>
          <p style={{ margin: "4px 0 0 17px", color: "#8A8276", fontSize: 12.5, lineHeight: 1.45 }}>Set any of these six assumptions for a specific year: calving and cull rates, maintenance feed, production cost, off-farm income, and family living. Costs start from the base values and grow at the cost-inflation rate; edited cells are flagged and can be reset.</p>
        </div>
        <button onClick={() => setOpen(!open)} style={{ background: open ? C.indigo : "#fff", color: open ? "#fff" : C.indigo, border: `1.4px solid ${C.indigo}`, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{open ? "Hide" : "Edit by year"}</button>
      </div>
      {open && <AssumpTable assump={assump} setAssump={setAssump} years={years} cal={cal} />}
    </section>
  );
}
/* year-by-year assumption override table (mirrors the price-path table) */
function AssumpTable({ assump, setAssump, years, cal }) {
  const upd = (yi, field, val) => setAssump(assump.map((a, i) => i === yi ? { ...a, [field]: val, override: true } : a));
  const resetYear = (yi) => {
    const cInf = Math.pow(1 + (cal.costInflation || 0) / 100, yi);
    setAssump(assump.map((a, i) => i === yi ? { calvingRate: cal.calvingRate, cullRate: cal.cullRate, maintFeed: Math.round(cal.maintFeedCow * cInf), prodCost: Math.round(cal.prodCostCow * cInf), offFarm: cal.offFarm, familyLiving: cal.familyLiving, override: false } : a));
  };
  const th = { padding: "7px 7px", fontSize: 10, fontWeight: 700, color: "#fff", textAlign: "center", fontFamily: "'Source Sans 3',sans-serif" };
  const cell = (yi, field, step, wpx) => (
    <td style={{ padding: "3px 4px", textAlign: "center" }}>
      <input type="number" value={assump[yi][field]} step={step}
        onChange={(e) => upd(yi, field, parseFloat(e.target.value) || 0)}
        style={{ width: wpx, border: `1px solid ${assump[yi].override ? C.orange : C.line}`, borderRadius: 6, padding: "5px 4px", fontSize: 11.5, fontFamily: "'IBM Plex Mono',monospace", textAlign: "center", color: C.ink, background: assump[yi].override ? C.orange + "0E" : "#fff" }} />
    </td>
  );
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 11 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
        <thead><tr style={{ background: C.slate }}>
          <th style={{ ...th, textAlign: "left", paddingLeft: 12 }}>Year</th>
          <th style={th}>Calving %</th><th style={th}>Cull %</th><th style={th}>Maint feed $/cow</th><th style={th}>Prod cost $/cow</th><th style={th}>Off-farm $</th><th style={th}>Family living $</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {assump.map((a, yi) => (
            <tr key={yi} style={{ background: yi % 2 ? C.paperWarm : "#fff" }}>
              <td style={{ padding: "3px 12px", fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: C.ink }}>{years[yi]}{a.override && <span style={{ color: C.orange, fontSize: 9, marginLeft: 4 }}>{"\u270e"}</span>}</td>
              {cell(yi, "calvingRate", 1, 52)}{cell(yi, "cullRate", 0.5, 52)}{cell(yi, "maintFeed", 5, 62)}{cell(yi, "prodCost", 5, 62)}{cell(yi, "offFarm", 1000, 78)}{cell(yi, "familyLiving", 1000, 78)}
              <td style={{ padding: "3px 6px", textAlign: "center" }}>{a.override && <button onClick={() => resetYear(yi)} title="reset this year" style={{ background: "none", border: "none", color: C.coral, cursor: "pointer", fontSize: 12 }}>{"\u21ba"}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AssumptionsTab({ cal, setCal, resetCal, assump, setAssump, years }) {
  const f = (k) => (v) => setCal((c) => ({ ...c, [k]: v }));
  return (
    <div style={{ paddingTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Bitter', serif", fontSize: 21, color: C.ink }}>Model assumptions</h2>
          <p style={{ margin: "4px 0 0", color: "#8A8276", fontSize: 13, maxWidth: 680, lineHeight: 1.5 }}>
            These are the per-cow and whole-ranch values behind the dashboard, taken from the FARM Assistance input and base-run files. They feed the year-by-year engine. Edit any of them and the dashboard recomputes; the destock/restock timing and prices live on the main tab.
          </p>
        </div>
        <button onClick={resetCal} style={{ background: "#fff", border: `1.5px solid ${C.coral}`, color: C.coral, fontWeight: 700, padding: "9px 16px", borderRadius: 9, cursor: "pointer", fontSize: 13 }}>{"↺"} Reset assumptions</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))", gap: 16 }}>
        <AssumeCard title="Herd & land" accent={C.teal}>
          <NumField label="Starting cow herd" value={cal.herd0} onChange={f("herd0")} suffix="cows" />
          <NumField label="Bulls" value={cal.bulls} onChange={f("bulls")} suffix="head" />
          <NumField label="Ranch size" value={cal.acres} onChange={f("acres")} suffix="acres" />
          <NumField label="Calving rate" value={cal.calvingRate} onChange={f("calvingRate")} suffix="%" />
          <NumField label="Annual cull rate" value={cal.cullRate} onChange={f("cullRate")} suffix="%" />
        </AssumeCard>

        <AssumeCard title="Cattle weights & mix" accent={C.indigo}>
          <NumField label="Steer weaning weight" value={cal.steerWt} onChange={f("steerWt")} suffix="lb" />
          <NumField label="Heifer weaning weight" value={cal.heiferWt} onChange={f("heiferWt")} suffix="lb" />
          <NumField label="Steer share of calf crop" value={Math.round(cal.steerShare * 100)} onChange={(v) => f("steerShare")(v / 100)} suffix="%" help="Baseline 51% (22 of 43 calves)." />
          <NumField label="Cull cow weight" value={cal.cullCowWt} onChange={f("cullCowWt")} suffix="lb" />
        </AssumeCard>

        <AssumeCard title="Year-1 cattle prices" accent={C.orange}>
          <NumField label="Steer price" value={cal.steerPrice} onChange={f("steerPrice")} step={0.05} prefix="$" suffix="/lb" />
          <NumField label="Heifer price" value={cal.heiferPrice} onChange={f("heiferPrice")} step={0.05} prefix="$" suffix="/lb" />
          <NumField label="Cull cow price" value={cal.cullCowPrice} onChange={f("cullCowPrice")} step={0.05} prefix="$" suffix="/lb" />
          <div style={{ fontSize: 11, color: "#9A9285", marginTop: -4 }}>These seed Year 1 on the price-path; the trend on the main tab evolves later years.</div>
        </AssumeCard>

        <AssumeCard title="Replacement & breeding stock" accent={C.coral}>
          <NumField label="Bred (replacement) cow" value={cal.bredCowPrice} onChange={f("bredCowPrice")} step={50} prefix="$" suffix="/head" />
          <NumField label="Herd sire (bull)" value={cal.herdSire} onChange={f("herdSire")} step={100} prefix="$" suffix="/head" />
        </AssumeCard>

        <AssumeCard title="Feed & production cost" accent={C.green}>
          <NumField label="Hay price" value={cal.hayPrice} onChange={f("hayPrice")} step={5} prefix="$" suffix="/ton" />
          <NumField label="Supplement (cube) price" value={cal.cubePrice} onChange={f("cubePrice")} step={5} prefix="$" suffix="/ton" />
          <NumField label="Hay at full feed" value={cal.hayTonCow} onChange={f("hayTonCow")} step={0.1} suffix="ton/cow/yr" />
          <NumField label="Supplement at full feed" value={cal.cubeTonCow} onChange={f("cubeTonCow")} step={0.05} suffix="ton/cow/yr" />
          <NumField label="Maintenance feed (recovered)" value={cal.maintFeedCow} onChange={f("maintFeedCow")} step={10} prefix="$" suffix="/cow/yr" />
          <NumField label="Other production cost" value={cal.prodCostCow} onChange={f("prodCostCow")} step={5} prefix="$" suffix="/cow/yr" help="Vet, salt/mineral, marketing." />
          <NumField label="Cost inflation" value={cal.costInflation} onChange={f("costInflation")} step={0.5} suffix="%/yr" help="Escalates maintenance feed and production cost year by year. 0% matches the published runs." />
        </AssumeCard>

        <AssumeCard title="Whole-ranch & financial" accent={C.slate}>
          <NumField label="Hunting income" value={cal.hunting} onChange={f("hunting")} step={500} prefix="$" suffix="/yr" />
          <NumField label="Off-farm income (combined)" value={cal.offFarm} onChange={f("offFarm")} step={5000} prefix="$" suffix="/yr" />
          <NumField label="Family living expense" value={cal.familyLiving} onChange={f("familyLiving")} step={1000} prefix="$" suffix="/yr" />
          <NumField label="Starting cash" value={cal.cashStart} onChange={f("cashStart")} step={1000} prefix="$" />
          <NumField label="Real estate value" value={cal.realEstate0} onChange={f("realEstate0")} step={10000} prefix="$" />
          <NumField label="Machinery value" value={cal.machinery0} onChange={f("machinery0")} step={5000} prefix="$" />
        </AssumeCard>
      </div>

      <div style={{ marginTop: 18 }}>
        <YearOverrides assump={assump} setAssump={setAssump} years={years} cal={cal} />
      </div>
      <div style={{ marginTop: 18, padding: "14px 18px", background: C.paperWarm, borderRadius: 13, border: `1px dashed ${C.line}`, fontSize: 12.5, color: "#7A7264", lineHeight: 1.6 }}>
        <strong style={{ color: C.ink }}>Note:</strong> the headline NCFI, ending cash, and net-worth figures on the dashboard are anchored to the nine published 2026 FARM Assistance runs and scaled by these assumptions. Large departures from the baseline values move the results away from the validated runs. That is useful for exploring "what if," but the closer you stay to the defaults, the closer the figures track the official model output.
      </div>
    </div>
  );
}

/* ============================================================
   TAB 3 — FINANCIAL RESULTS TABLES
   ============================================================ */
function FinRow({ label, vals, bold, pct, plain, suffix, section, accent, editable, editableLiab, onEdit, onLabel, onEditLiab }) {
  const td = { padding: "7px 9px", fontSize: 11.5, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap" };
  if (section) {
    return (
      <tr style={{ background: accent + "1E" }}>
        <td colSpan={99} style={{ padding: "6px 9px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: accent, textTransform: "uppercase", fontFamily: "'Source Sans 3', sans-serif" }}>{label}</td>
      </tr>
    );
  }
  const render = (v) => pct ? v.toFixed(1) + "%" : plain ? fmtNum(v) + (suffix || "") : fmt(v);
  const isEdit = !!editable, isEditL = !!editableLiab;
  if (isEdit || isEditL) {
    const key = editable || editableLiab;
    return (
      <tr style={{ background: C.paperWarm }}>
        <td style={{ ...td, textAlign: "left", padding: "4px 6px" }}>
          {isEdit
            ? <input value={label} onChange={(e) => onLabel && onLabel(key, e.target.value)} placeholder="Name this line"
                style={{ width: "97%", border: `1px dashed ${C.indigo}`, background: "#fff", borderRadius: 6, padding: "4px 6px", fontSize: 11, fontFamily: "'Source Sans 3', sans-serif", fontWeight: 700, color: C.indigo }} />
            : <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontWeight: 600, fontSize: 11.5, color: "#5A5349" }}>{label} <span style={{ fontSize: 9, color: C.indigo }}>{"\u270e editable"}</span></span>}
        </td>
        {vals.map((v, j) => (
          <td key={j} style={{ padding: "3px 4px", textAlign: "right" }}>
            <input type="number" value={Math.round(v) || 0} step={1000}
              onChange={(e) => { const nv = parseFloat(e.target.value) || 0; isEdit ? onEdit && onEdit(key, j, nv) : onEditLiab && onEditLiab(key, j, nv); }}
              style={{ width: 74, border: `1px solid ${C.line}`, borderRadius: 5, padding: "4px 3px", fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right", color: C.ink, background: "#fff" }} />
          </td>
        ))}
      </tr>
    );
  }
  return (
    <tr style={{ background: bold ? accent + "12" : "transparent" }}>
      <td style={{ ...td, textAlign: "left", fontFamily: "'Source Sans 3', sans-serif", fontWeight: bold ? 800 : 600, fontSize: 11.5, color: bold ? C.ink : "#5A5349" }}>{label}</td>
      {vals.map((v, j) => <td key={j} style={{ ...td, fontWeight: bold ? 800 : 500, color: (!plain && v < 0) ? C.coral : (bold ? C.ink : "#4A443B") }}>{render(v)}</td>)}
    </tr>
  );
}
function FinTable({ title, accent, years, rows, onEdit, onLabel, onEditLiab }) {
  const th = { padding: "8px 9px", fontSize: 10, fontWeight: 700, color: "#fff", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" };
  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={{ fontFamily: "'Bitter', serif", fontSize: 16, color: C.ink, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 18, borderRadius: 3, background: accent }} />{title}
      </h3>
      <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead><tr style={{ background: accent }}>
            <th style={{ ...th, textAlign: "left", minWidth: 200 }}>$ / year</th>
            {years.map((y) => <th key={y} style={th}>{y}</th>)}
          </tr></thead>
          <tbody>{rows.map((r, i) => <FinRow key={i} {...r} accent={accent} onEdit={onEdit} onLabel={onLabel} onEditLiab={onEditLiab} />)}</tbody>
        </table>
      </div>
    </div>
  );
}
function FinancialsTab({ m, s, years, cal, assump, custom, setCustom, liab, setLiab }) {
  const Y = m.yrs;
  const n0 = years.length;
  const cRow = (key) => (custom[key] || Array(12).fill(0)).slice(0, n0);
  const setCRow = (key, yi, val) => setCustom({ ...custom, [key]: Object.assign([...(custom[key] || Array(12).fill(0))], { [yi]: val }) });
  const setCLabel = (key, val) => setCustom({ ...custom, [key + "Label"]: val });
  const cLabel = (key, dflt) => (custom[key + "Label"] !== undefined ? custom[key + "Label"] : dflt);
  const incCustom = cRow("income");     // extra receipt line
  const costCustom = cRow("cost");      // extra cost line (entered positive, subtracted)
  const income = [
    { label: "Calf receipts", vals: Y.map((y) => y.calfRev) },
    { label: "Cull-cow / livestock sales", vals: Y.map((y) => y.cullRev) },
    { label: "Hunting income", vals: Y.map((y) => y.hunt) },
    { label: cLabel("income", "Your own income line"), vals: incCustom, editable: "income" },
    { label: "Total cash receipts", vals: Y.map((y, i) => y.calfRev + y.cullRev + y.hunt + (incCustom[i] || 0)), bold: true },
    { label: "Purchased feed", vals: Y.map((y) => y.feedCost) },
    { label: "Replacement cattle", vals: Y.map((y) => y.replCost) },
    { label: "Other production cost", vals: Y.map((y) => y.prodCost) },
    { label: cLabel("cost", "Your own cost line"), vals: costCustom, editable: "cost" },
    { label: "Total cash costs", vals: Y.map((y, i) => y.feedCost + y.replCost + y.prodCost + (costCustom[i] || 0)), bold: true },
    { label: "Net Cash Farm Income", vals: Y.map((y, i) => y.ncfi + (incCustom[i] || 0) - (costCustom[i] || 0)), bold: true },
    { label: "Net Farm Income (after deprec.)", vals: Y.map((y, i) => y.nfi + (incCustom[i] || 0) - (costCustom[i] || 0)), bold: true },
  ];
  const cashCustom = cRow("cash");
  const cash = [
    { label: "Net cash farm income (incl. hunting)", vals: Y.map((y, i) => y.ncfi + (incCustom[i] || 0) - (costCustom[i] || 0)) },
    { label: "Off-farm income", vals: Y.map((_, i) => (assump && assump[i] ? assump[i].offFarm : cal.offFarm)) },
    { label: "Family withdrawals", vals: Y.map((_, i) => -(assump && assump[i] ? assump[i].familyLiving : cal.familyLiving)) },
    { label: cLabel("cash", "Your own line (+ inflow / \u2212 outflow)"), vals: cashCustom, editable: "cash" },
    { label: "Ending cash reserve", vals: Y.map((y, i) => y.cash + cashCustom.slice(0, i + 1).reduce((a, b) => a + (b || 0), 0) + incCustom.slice(0, i + 1).reduce((a, b) => a + (b || 0), 0) - costCustom.slice(0, i + 1).reduce((a, b) => a + (b || 0), 0)), bold: true },
  ];
  const head = m.path;
  // Balance sheet — proper Assets / Liabilities / Net Worth structure (Fast-Base Table 5-D).
  // Cash and livestock scale with the chosen strategy; real estate, machinery, debt and
  // deferred taxes are structural (not driven by the stocking decision) and shown as published.
  const n = years.length;
  const at = (arr, i) => arr[Math.min(i, arr.length - 1)];
  const cashBS = Y.map((y) => y.cash);
  const liveBS = head.map((h, i) => Math.round(h / cal.herd0 * at(BS_BASE.livestock, i)));
  const reBS = years.map((_, i) => at(BS_BASE.realEstate, i));
  const machBS = years.map((_, i) => at(BS_BASE.machinery, i));
  const totAssets = years.map((_, i) => cashBS[i] + liveBS[i] + reBS[i] + machBS[i]);
  // Structural liability rows are editable: they are not driven by the stocking decision,
  // so a producer can replace the representative-ranch figures with their own.
  const lRow = (key, base) => years.map((_, i) => (liab[key] && liab[key][i] !== undefined && liab[key][i] !== null) ? liab[key][i] : at(base, i));
  const setLRow = (key, yi, val) => setLiab({ ...liab, [key]: Object.assign([...(liab[key] || Array(12).fill(null))], { [yi]: val }) });
  const assetCustom = cRow("asset");
  const liabCustom = cRow("liab");
  const intDebtBS = lRow("intDebt", BS_BASE.intDebt);
  const defTaxBS = lRow("defTax", BS_BASE.defTax);
  const totAssets2 = years.map((_, i) => cashBS[i] + liveBS[i] + reBS[i] + machBS[i] + (assetCustom[i] || 0));
  const totLiab = years.map((_, i) => intDebtBS[i] + defTaxBS[i] + (liabCustom[i] || 0));
  const netWorth = years.map((_, i) => totAssets2[i] - totLiab[i]);
  const nw0 = netWorth[0] || 1;
  const balance = [
    { label: "ASSETS", section: true },
    { label: "Cash reserve", vals: cashBS },
    { label: "Livestock", vals: liveBS },
    { label: "Real estate", vals: reBS },
    { label: "Machinery & equipment", vals: machBS },
    { label: cLabel("asset", "Your own asset line"), vals: assetCustom, editable: "asset" },
    { label: "Total assets", vals: totAssets2, bold: true },
    { label: "LIABILITIES", section: true },
    { label: "Intermediate-term debt", vals: intDebtBS, editableLiab: "intDebt" },
    { label: "Deferred taxes", vals: defTaxBS, editableLiab: "defTax" },
    { label: cLabel("liab", "Your own liability line"), vals: liabCustom, editable: "liab" },
    { label: "Total liabilities", vals: totLiab, bold: true },
    { label: "NET WORTH", section: true },
    { label: "Net worth (assets − liabilities)", vals: netWorth, bold: true },
    { label: "Cumulative net-worth growth", vals: years.map((_, i) => (netWorth[i] / nw0 - 1) * 100), pct: true, bold: true },
  ];
  return (
    <div style={{ paddingTop: 22 }}>
      <div style={{ background: C.paperWarm, border: `1px dashed ${C.line}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 12.5, color: "#7A7264", lineHeight: 1.5 }}>
        Year-by-year statements for your current strategy: <strong style={{ color: C.ink }}>Destock {s.destockPct}% in Yr {s.destockYear}, restock to {s.restockPct}% by Yr {s.restockYear}</strong>. These flow from the engine and update with every change on the dashboard and Assumptions tabs. The early years carry the heavy feeding bill; watch the ending-cash row for the survival picture, not just the averages.
      </div>
      <FinTable title="Income Statement" accent={C.orange} years={years} rows={income} onEdit={setCRow} onLabel={setCLabel} onEditLiab={setLRow} />
      <FinTable title="Cash Flow" accent={C.teal} years={years} rows={cash} onEdit={setCRow} onLabel={setCLabel} onEditLiab={setLRow} />
      <FinTable title="Balance Sheet" accent={C.indigo} years={years} rows={balance} onEdit={setCRow} onLabel={setCLabel} onEditLiab={setLRow} />
      <FinTable title="Herd inventory (head carried)" accent={C.green} years={years} rows={[{ label: "Cows carried", vals: head, bold: true, plain: true, suffix: " head" }]} />
    </div>
  );
}


/* ============================================================
   TAB 4 — DOCUMENTATION
   Explains the numbers, the model, and the data lineage.
   ============================================================ */
function DocSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontFamily: "'Bitter', serif", fontSize: 17, color: C.orange, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 8, height: 18, borderRadius: 3, background: C.orange }} />{title}
      </h3>
      <div style={{ fontSize: 13.5, color: "#4A403C", lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}
function Formula({ children }) {
  return (
    <div style={{ background: C.paperWarm, border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px 15px", margin: "8px 0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: C.ink, lineHeight: 1.6, overflowX: "auto" }}>
      {children}
    </div>
  );
}
function DefRow({ term, def }) {
  return (
    <tr>
      <td style={{ padding: "8px 12px", fontWeight: 700, color: C.ink, fontSize: 12.5, verticalAlign: "top", whiteSpace: "nowrap", fontFamily: "'Source Sans 3', sans-serif" }}>{term}</td>
      <td style={{ padding: "8px 12px", fontSize: 12.5, color: "#5A4F4A", lineHeight: 1.55 }}>{def}</td>
    </tr>
  );
}
function DocTab() {
  return (
    <div style={{ paddingTop: 22, maxWidth: 820 }}>
      <h2 style={{ margin: "0 0 6px", fontFamily: "'Bitter', serif", fontSize: 22, color: C.ink }}>How this tool works</h2>
      <p style={{ margin: "0 0 22px", color: "#8A7D77", fontSize: 13.5, lineHeight: 1.55 }}>
        A reference for the specialist/agent presenting the tool: where the numbers come from, how the model is built, and what each figure means. The aim is a transparent, defensible illustration of the destocking/restocking decision.
      </p>

      <DocSection title="What decision this illustrates">
        This tool addresses a single question from the FARM Assistance stocking-strategy work: in a prolonged drought, how should a cow-calf producer adjust the herd? Holding the full herd means buying expensive hay and supplement to feed through; destocking saves that feed cost and books cull-cow sales, but gives up calf production and later requires buying replacements. The tool lets a producer set how much to <strong>destock</strong>, in which <strong>year</strong>, and how far to <strong>restock</strong>, then shows the 10-year economic consequences.
      </DocSection>

      <DocSection title="Where the numbers come from">
        Three FARM Assistance sources, all from the Texas A&amp;M AgriLife strategic planning model:
        <table style={{ borderCollapse: "collapse", width: "100%", margin: "10px 0", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <tbody>
            <DefRow term="Assumptions" def="The 2026 FARM Assistance input file: herd size, calving rate, weights, cattle prices, feed rations and prices, replacement and sire costs, production costs, and whole-ranch items (off-farm income, hunting, family living). These populate the Assumptions tab, where six of them (calving rate, cull rate, maintenance feed, production cost, off-farm income, and family living) can also be overridden year by year." />
            <DefRow term="Herd inventory" def="The year-by-year cow-herd inventory, confirming the feeding pattern: full feed in the early drought years, dropping to maintenance as forage recovers." />
            <DefRow term="Base-run statements" def="The 10-year income statement, cash flow, and balance sheet for the base scenario, used to calibrate the engine's per-cow economics." />
            <DefRow term="Scenario results" def="The nine published destock/restock runs (10-year averages of net cash farm income, ending cash, and net-worth growth). These are the validation anchors." />
          </tbody>
        </table>
      </DocSection>

      <DocSection title="How the model is built (the honest part)">
        The tool is a <strong>hybrid</strong>, by design. The headline figures (average NCFI, ending cash, and net-worth growth) are <strong>anchored to the nine published runs</strong>. When your destock/restock setting matches one of the nine, you see that exact published value. Between the nine, the tool interpolates (inverse-distance weighting). A transparent year-by-year cash engine then drives two things the published averages can't: the <strong>annual trajectory</strong> (the shape of the line) and the <strong>sensitivity to your price and assumption edits</strong>.
        <Formula>
          result = published_anchor(destock%, restock%)<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&times; engine(your prices) / engine(baseline prices)<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&times; timing_factor(destock year, restock year)
        </Formula>
        This keeps the presented numbers tied to real model output while still letting the audience explore "what if calf prices fall 5%/year?" The further you move from the baseline assumptions, the more the result is engine-driven rather than a published value; that is useful for exploration, but worth stating when you present.
      </DocSection>

      <DocSection title="The year-by-year engine">
        For each year, the engine builds the herd from your timing choices, then computes:
        <Formula>
          calf receipts = calves &times; weight &times; price&nbsp;&nbsp;(steers &amp; heifers split)<br />
          cull sales&nbsp;&nbsp;= (annual culls + sell-down) &times; cull wt &times; cull $/lb<br />
          feed cost&nbsp;&nbsp;&nbsp;= head &times; (full ration while recovering,<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; else maintenance feed)<br />
          replacements = (herd growth + culls) &times; bred-cow price<br /><br />
          NCFI = calf receipts + cull sales + hunting − feed − production − replacements
        </Formula>
        Calibration constants (per-cow feed at full ration ≈ $1,500, maintenance ≈ $317, production cost ≈ $172) come straight from the base-run statements.
      </DocSection>

      <DocSection title="What each headline number means">
        <table style={{ borderCollapse: "collapse", width: "100%", margin: "4px 0", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <tbody>
            <DefRow term="Net Cash Farm Income (NCFI)" def="Cash receipts (calf sales, cull sales, and hunting lease income) minus cash costs (feed, replacements, production), excluding non-cash items like depreciation. Hunting is farm-related income from the land, so it belongs here rather than in the cash-flow statement, where it would be counted twice. Off-farm wages are not farm income and enter only in the cash flow." />
            <DefRow term="Net Farm Income (NFI)" def="NCFI minus depreciation on purchased breeding stock. It runs below NCFI in the recovery years because newly bought cows carry depreciation, the pattern the 2011 study highlights, where the held-herd strategies look better on NFI mid-period." />
            <DefRow term="Ending cash reserve" def="Cumulative cash at the end of the horizon, after off-farm income, hunting, family living, and a rough income-tax estimate. This is the liquidity / survival measure." />
            <DefRow term="Real net worth growth" def="Cumulative change in inflation-adjusted net worth (cattle + land + machinery + cash) over the horizon. The long-term wealth measure." />
          </tbody>
        </table>
        <p style={{ margin: "10px 0 0" }}>Each statement carries an <strong>editable blank row</strong> so a producer can add an item specific to their operation (a lease payment, custom grazing income, an equipment note), and the structural balance-sheet liabilities (intermediate-term debt and deferred taxes) can be typed over year by year, since neither is driven by the stocking decision. Edited liabilities break the exact tie to the published net worth by design: the balance sheet then reflects that producer's position rather than the representative ranch. The <strong>Financial results</strong> tab presents these year by year across three statements: an <strong>Income Statement</strong> (receipts, costs, NCFI, NFI), a <strong>Cash Flow</strong> (NCFI plus off-farm and hunting income, less family withdrawals, to an ending cash reserve), and a <strong>Balance Sheet</strong> in the standard form: total assets (cash, livestock, real estate, machinery) less total liabilities (intermediate-term debt and deferred taxes) equals net worth. The balance-sheet structure, real estate, machinery, debt, and deferred taxes follow the published base run; cash and livestock value adjust to the chosen stocking strategy. A herd-inventory row shows the head carried each year. All three statements update live with the dashboard and assumptions.</p>
      </DocSection>

      <DocSection title="The timing &amp; price controls">
        <strong>Destock year / amount</strong> and <strong>restock year / amount</strong> place the herd changes anywhere in the horizon; the herd ramps linearly between the destock and restock years. <strong>Forage recovers by</strong> sets when full feeding gives way to maintenance feed. The <strong>price path</strong> holds Year 1 at the 2026 values and evolves later years at two separate trends: one for cattle prices (steer, heifer, cull) and one for feed (hay and supplement), since the two rarely move together, especially in drought. Both default to 0%. The published runs assumed a cattle-price decline of roughly 3%/year with flat feed, so a flat cattle path reads somewhat higher. Any single year can be overridden by typing into the price table. When the strategy matches one of the nine published runs at the default timing, the herd path follows the published stocking pattern, including the within-year sell-down, instead of a smooth ramp. The dashboard also offers a <strong>price-risk band</strong> (the shaded area on the income chart shows NCFI if cattle prices run 10, 15, or 20% above or below your path) and a <strong>pin-to-compare</strong> button that holds one strategy fixed while you explore another; both strategies are evaluated under identical prices and assumptions.
      </DocSection>

      <DocSection title="What the tool does not capture">
        It is an illustration for a representative ranch, not a whole-farm tax model. Cash flows are not discounted: the ten-year figures are simple averages and nominal accumulations, matching how the published FARM Assistance runs report them, and no interest rate is assumed on cash balances or debt. Net-worth growth is the only inflation-adjusted measure (a 2.7% deflator). It does not re-run the full FARM Assistance machinery for off-anchor strategies, model individual-ranch debt structures, or price the agronomic cost of overgrazing the retained herd's pasture. Off-farm income and hunting support cash flow in every strategy, so the destock/restock choice is what moves the result on the margin. Actual outcomes vary by producer, management, and markets. This is decision-support, not financial advice.
      </DocSection>

      <DocSection title="The optimizer (how it finds the &quot;best&quot; strategy)">
        The Optimizer tab solves a <strong>multi-objective optimization by exhaustive grid search</strong>. The decision variables are destock % and restock %; every combination on the grid (231 strategies) is run through the same engine the dashboard uses. Because all feasible strategies are evaluated, the reported optimum is the global best for your settings; there is no solver, sampling, or approximation to second-guess.
        <Formula>
          maximize&nbsp;&nbsp;U(d, r) = w₁·Ñ(d,r) + w₂·C̃(d,r) + w₃·W̃(d,r)<br />
          subject to&nbsp;restock r ≤ guardrail cap<br /><br />
          where Ñ, C̃, W̃ are NCFI, ending cash, and net-worth growth,<br />
          each min-max normalized to 0–1 across all strategies,<br />
          and w₁, w₂, w₃ are the weights you set (Σw = 1).
        </Formula>
        The three goals disagree (cash profit favors a lighter restock, equity favors a heavier herd), so there is no single &quot;best&quot; without a value judgment. Sliding the weights traces the <strong>trade-off (Pareto) frontier</strong> between cash today and equity tomorrow. The <strong>range-safe optimum</strong> repeats the search after removing every strategy that restocks above your guardrail, pricing the drought-resilience cost the dollar figures alone ignore. A <strong>stress test</strong> toggle re-scores every strategy with cattle prices 15% below your path, favoring plans that hold up when the market turns; each top strategy also reports its adverse-market NCFI. The optimizer re-runs automatically whenever you change a price, an assumption, the weights, the guardrail, or the stress toggle.
      </DocSection>

      <DocSection title="Limitations of the optimizer">
        Three honest caveats for anyone presenting it. <strong>First</strong>, the optimum is only as good as the model beneath it: away from the nine published runs the figures are engine interpolation, so the optimizer finds the best strategy <em>within the hybrid model's representation</em>, not a fresh FARM Assistance result. <strong>Second</strong>, it responds strongly and correctly to the price and cost assumptions a producer is most likely to explore (cattle prices, feed, replacement cost), but to a few structural assumptions (herd size, calving rate) it responds only weakly, because those scale both the engine and its baseline reference and partly cancel in the sensitivity ratio; a genuinely different ranch (say 200 cows) really wants a new FARM Assistance run to re-anchor. <strong>Third</strong>, it optimizes the herd-size levers only at fixed timing. The adverse-market stress test is simple scenario analysis (a uniform 15% cattle-price haircut), not the full stochastic simulation FARM Assistance runs; weather risk and price volatility beyond that band are not modeled. Treat the result as a well-structured starting point for discussion with an Extension specialist, not a prescription.
      </DocSection>

      <div style={{ background: C.paperWarm, border: `1px dashed ${C.line}`, borderRadius: 12, padding: "14px 18px", fontSize: 12.5, color: "#7A6E68", lineHeight: 1.6 }}>
        <strong style={{ color: C.ink }}>Citation:</strong> Updated from <em>Economic Impact of Beef Cattle Best Management Practices in South Texas: Stocking Strategies During Drought</em> (FARM Assistance Focus 2011-6; Young, Dominguez, Paschal &amp; Klose), with 2026 assumptions and scenario runs from the Texas A&amp;M AgriLife FARM Assistance program.
      </div>
    </div>
  );
}


/* ============================================================
   TAB — TEAM
   ============================================================ */
const TEAM = [
  { name: "Megan Clayton", email: "Megan.Clayton@ag.tamu.edu", role: "Professor and Extension Specialist", unit: "Rangeland, Wildlife and Fisheries Management" },
  { name: "Samuel Womble", email: "Sam.Womble@ag.tamu.edu", role: "County Extension Agent, Agriculture and Natural Resources", unit: "Kerr County Office" },
  { name: "Gregory Kaase", email: "Gregory.Kaase@ag.tamu.edu", role: "Senior Extension Program Specialist", unit: "Agricultural Economics" },
  { name: "Karl Harborth", email: "karl.harborth@ag.tamu.edu", role: "Assistant Professor and Extension Livestock Specialist", unit: "Animal Science" },
  { name: "Yuri Calil", email: "yuri.calil@ag.tamu.edu", role: "Assistant Professor and Extension Specialist", unit: "Agricultural Economics" },
];
function AboutPoint({ n, title, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: `4px solid ${C.orange}`, borderRadius: 13, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: C.orange, color: "#fff", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>{n}</span>
        <h4 style={{ margin: 0, fontFamily: "'Bitter', serif", fontSize: 15, fontWeight: 800, color: C.ink }}>{title}</h4>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#5A4F4A", lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
function TeamTab() {
  return (
    <div style={{ paddingTop: 22, maxWidth: 880 }}>
      <h2 style={{ margin: "0 0 6px", fontFamily: "'Bitter', serif", fontSize: 22, color: C.ink }}>Ranching in a New Climate</h2>
      <p style={{ margin: "0 0 18px", color: "#8A7D77", fontSize: 13.5, lineHeight: 1.6 }}>
        A Texas A&amp;M AgriLife Extension effort helping South Texas cow-calf producers think through the economics of stocking decisions when drought tightens forage and feed budgets.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 14, marginBottom: 30 }}>
        <AboutPoint n={1} title="Why it matters">
          Recurring, intensifying drought is among the costliest threats to South Texas cow-calf operations. When forage runs short, producers must choose between feeding through at rising cost or selling down the herd, a decision that shapes profitability, cash flow, and rangeland health for a decade. Many of these choices are made under pressure, with limited time to weigh the long-run economics.
        </AboutPoint>
        <AboutPoint n={2} title="Who it serves">
          South Texas cow-calf producers and the Extension agents and specialists who advise them. The tool is built for use in workshops and one-on-one consultations, where a specialist can walk a producer through the trade-offs using a representative ranch and the producer's own price and herd assumptions.
        </AboutPoint>
        <AboutPoint n={3} title="The Extension response">
          Grounded in the FARM Assistance strategic planning model, this tool turns a peer-reviewed drought-stocking analysis into an interactive, classroom-ready dashboard. Producers can adjust destocking and restocking timing, prices, and herd assumptions and immediately see the projected income, cash flow, and net-worth consequences over a ten-year horizon. A built-in optimizer goes a step further: it searches every stocking strategy and surfaces the one that best fits what the producer values (cash today, liquidity, or long-term equity), making the trade-offs explicit rather than abstract.
        </AboutPoint>
        <AboutPoint n={4} title="Expected outcome">
          Producers leave better equipped to plan stocking strategies that protect both profitability and the range. The intended behavioral change is a shift toward proactive, economically informed destocking and restocking decisions, and lighter, more drought-resilient stocking rates, rather than reactive, feed-through-it responses. By letting producers weigh competing financial goals and a rangeland guardrail side by side, the tool helps them recognize that the right answer depends on their own priorities, and to plan accordingly.
        </AboutPoint>
      </div>

      <h3 style={{ margin: "0 0 4px", fontFamily: "'Bitter', serif", fontSize: 18, color: C.ink }}>Project team</h3>
      <p style={{ margin: "0 0 16px", color: "#8A7D77", fontSize: 13, lineHeight: 1.55 }}>
        An interdisciplinary Texas A&amp;M AgriLife Extension team spanning rangeland management, animal science, and agricultural economics. Reach out to any member for help applying the tool to a specific operation.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {TEAM.map((p, i) => (
          <div key={i} style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.orange}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'Bitter', serif", fontSize: 16.5, fontWeight: 800, color: C.ink }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: "#5A4F4A", marginTop: 3, lineHeight: 1.45 }}>{p.role}</div>
            <div style={{ fontSize: 12, color: "#8A7D77", marginTop: 2, lineHeight: 1.45 }}>{p.unit}</div>
            <a href={`mailto:${p.email}`} style={{ display: "inline-block", marginTop: 9, fontSize: 12.5, color: C.orange, fontWeight: 700, textDecoration: "none", fontFamily: "'IBM Plex Mono', monospace", wordBreak: "break-all" }}>{p.email}</a>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ============================================================
   TAB — OPTIMIZER (multi-objective constrained search)
   ============================================================ */
function HeatCell({ c, best, safe, onPick }) {
  // color by utility: maroon-to-gold scale
  const u = c.U;
  const bg = `rgba(80,0,0,${0.12 + 0.78 * u})`;
  const isBest = c.d === best.d && c.r === best.r;
  const isSafe = safe && c.d === safe.d && c.r === safe.r;
  return (
    <div onClick={() => onPick(c.d, c.r)} title={`Destock ${c.d}% / Restock ${c.r}%\nUtility ${u.toFixed(2)}\nNCFI $${Math.round(c.ncfi).toLocaleString()}`}
      style={{ background: bg, aspectRatio: "1", borderRadius: 3, cursor: "pointer", position: "relative", border: isBest ? "2.5px solid #E8C9A0" : isSafe ? "2px solid #6B7A4F" : "1px solid #ffffff44", display: "grid", placeItems: "center" }}>
      {isBest && <span style={{ fontSize: 11, color: "#fff" }}>★</span>}
      {isSafe && !isBest && <span style={{ fontSize: 9, color: "#fff" }}>✓</span>}
    </div>
  );
}
function ResultCard({ title, accent, c, sub, onUse, current }) {
  if (!c) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: `4px solid ${accent}`, borderRadius: 13, padding: "16px 18px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7D77" }}>{title}</div>
      <div style={{ fontFamily: "'Bitter', serif", fontSize: 22, fontWeight: 800, color: accent, marginTop: 4 }}>Destock {c.d}% / Restock {c.r}%</div>
      {sub && <div style={{ fontSize: 11.5, color: "#8A7D77", marginTop: 2 }}>{sub}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
        <div><div style={{ fontSize: 9.5, color: "#9A9285", textTransform: "uppercase" }}>NCFI/yr</div><div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: C.ink }}>{fmt(c.ncfi)}</div></div>
        <div><div style={{ fontSize: 9.5, color: "#9A9285", textTransform: "uppercase" }}>End cash</div><div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: C.ink }}>{fmt(c.cash)}</div></div>
        <div><div style={{ fontSize: 9.5, color: "#9A9285", textTransform: "uppercase" }}>Net worth</div><div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: C.ink }}>{Math.round(c.nw)}%</div></div>
      </div>
      <button onClick={() => onUse(c.d, c.r)} style={{ marginTop: 13, width: "100%", background: current ? accent : "#fff", color: current ? "#fff" : accent, border: `1.5px solid ${accent}`, borderRadius: 9, padding: "8px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{current ? "Loaded on dashboard" : "Load this on the dashboard →"}</button>
    </div>
  );
}
function OptimizerTab({ s, prices, cal, assump, onApply }) {
  const [w, setW] = useState({ ncfi: 50, cash: 25, nw: 25 });
  const [rCap, setRCap] = useState(85);
  const [stress, setStress] = useState(false);
  const setWeight = (k) => (v) => setW((p) => ({ ...p, [k]: v }));
  const result = useMemo(() => optimize(s, prices, cal, { ncfi: w.ncfi, cash: w.cash, nw: w.nw }, rCap, assump, stress, 15), [s, prices, cal, assump, w, rCap, stress]);
  const { best, top3, bestSafe, scored, dGrid, rGrid } = result;
  const medal = ["1st", "2nd", "3rd"];

  return (
    <div style={{ paddingTop: 22 }}>
      <h2 style={{ margin: "0 0 6px", fontFamily: "'Bitter', serif", fontSize: 22, color: C.ink }}>Optimal stocking strategy</h2>
      <p style={{ margin: "0 0 18px", color: "#8A7D77", fontSize: 13.5, lineHeight: 1.6, maxWidth: 760 }}>
        This searches every destock/restock combination on a grid and finds the one that best matches what you value. Because the "best" strategy depends on whether you weight cash profit, liquidity, or long-term equity, you set the weights, and the optimizer walks that trade-off for you. It uses your current prices and assumptions from the other tabs.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.paperWarm, border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.green}`, borderRadius: 10, padding: "10px 15px", marginBottom: 18, maxWidth: 760 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: "#5A4F4A", lineHeight: 1.5 }}>
          <strong style={{ color: C.ink }}>Re-optimized live</strong> for your current inputs: steer <strong>${prices[0].steer.toFixed(2)}</strong>/lb, cull <strong>${prices[0].cull.toFixed(2)}</strong>/lb, bred cow <strong>${fmtNum(cal.bredCowPrice)}</strong>, feed <strong>${fmtNum(cal.hayPrice)}</strong>/${fmtNum(cal.cubePrice)} hay/supp, herd <strong>{cal.herd0}</strong> cows. Change anything on the Assumptions or Dashboard tabs and this re-runs automatically.
        </span>
      </div>

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        {/* CONTROLS */}
        <div style={{ position: "sticky", top: 20 }}>
          <Panel title="What do you value?" subtitle="Set the weight on each goal. They're normalized, so only the balance matters." accent={C.orange}>
            <Slider label="Cash profit (avg NCFI)" value={w.ncfi} min={0} max={100} step={5} suffix="%" accent={C.orange} onChange={setWeight("ncfi")} />
            <Slider label="Liquidity (ending cash)" value={w.cash} min={0} max={100} step={5} suffix="%" accent={C.teal} onChange={setWeight("cash")} />
            <Slider label="Long-term equity (net worth)" value={w.nw} min={0} max={100} step={5} suffix="%" accent={C.green} onChange={setWeight("nw")} />
            <button onClick={() => setStress(!stress)} style={{ marginTop: 4, marginBottom: 8, width: "100%", background: stress ? C.coral : "#fff", color: stress ? "#fff" : C.coral, border: `1.5px solid ${C.coral}`, borderRadius: 9, padding: "8px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{stress ? "Stress test on: ranking by adverse market" : "Stress test: rank by adverse market"}</button>
            <div style={{ fontSize: 11, color: "#8A7D77", marginBottom: 6 }}>{stress ? "Strategies are scored with cattle prices 15% below your path, favoring plans that hold up when the market turns." : "Turn on to score every strategy with cattle prices 15% below your path."}</div>
            <div style={{ fontSize: 11, color: "#8A7D77", marginTop: 2, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
              Weights are relative; {w.ncfi}:{w.cash}:{w.nw} normalizes to {(w.ncfi / (w.ncfi + w.cash + w.nw + 0.0001) * 100).toFixed(0)}% / {(w.cash / (w.ncfi + w.cash + w.nw + 0.0001) * 100).toFixed(0)}% / {(w.nw / (w.ncfi + w.cash + w.nw + 0.0001) * 100).toFixed(0)}%.
            </div>
          </Panel>
          <Panel title="Rangeland guardrail" subtitle="Cap the permanent (restock) herd to protect the range against the next drought." accent={C.green}>
            <Slider label="Max restock allowed" value={rCap} min={50} max={100} step={5} suffix="%" accent={C.green} onChange={setRCap} help="The range-safe optimum won't restock above this. The 2011 study notes a lighter herd withstands future drought better, a cost the dollar figures don't price." />
          </Panel>
        </div>

        {/* RESULTS */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <ResultCard title="Optimal (unconstrained)" accent={C.orange} c={best} sub="Best blend of your weighted goals" onUse={onApply} current={s.destockPct === best.d && s.restockPct === best.r} />
            <ResultCard title={`Range-safe (restock ≤ ${rCap}%)`} accent={C.green} c={bestSafe} sub="Best strategy within the guardrail" onUse={onApply} current={bestSafe && s.destockPct === bestSafe.d && s.restockPct === bestSafe.r} />
          </div>

          <Panel title="Top three strategies" subtitle="Ranked by your weighted objective. Ties are common; nearby strategies often score within a hair." accent={C.coral}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {top3.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 13px", background: i === 0 ? C.orange + "10" : C.paperWarm, borderRadius: 10, border: `1px solid ${i === 0 ? C.orange + "44" : C.line}` }}>
                  <span style={{ fontFamily: "'Bitter', serif", fontWeight: 800, fontSize: 13, color: i === 0 ? C.orange : "#8A7D77", minWidth: 26 }}>{medal[i]}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: C.ink, minWidth: 165 }}>Destock {c.d}% / Restock {c.r}%</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6A5F58", flex: 1 }}>NCFI {fmt(c.ncfi)} · cash {fmt(c.cash)} · NW {Math.round(c.nw)}% · adverse {fmt(c.ncfiLow)}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 700, color: C.orange, background: "#fff", padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.line}` }}>U {c.U.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Objective surface" subtitle="Every strategy scored by your weighted goal; darker is better. ★ is the optimum, ✓ the range-safe pick. Click any cell to load it." accent={C.slate}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
                <div style={{ fontSize: 9, color: "#8A7D77", writingMode: "vertical-rl", transform: "rotate(180deg)", textAlign: "center", fontWeight: 700 }}>RESTOCK %</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${dGrid.length}, 1fr)`, gap: 2, alignItems: "center" }}>
                  {/* rows: each restock value (high to low) */}
                  {[...rGrid].reverse().map((rv) => (
                    <React.Fragment key={rv}>
                      <div style={{ fontSize: 9, color: "#8A7D77", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", paddingRight: 2 }}>{rv}</div>
                      {dGrid.map((dv) => {
                        const c = scored.find((x) => x.d === dv && x.r === rv);
                        return <HeatCell key={dv + "-" + rv} c={c} best={best} safe={bestSafe} onPick={onApply} />;
                      })}
                    </React.Fragment>
                  ))}
                  {/* x-axis labels */}
                  <div></div>
                  {dGrid.map((dv) => <div key={dv} style={{ fontSize: 8, color: "#8A7D77", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", transform: dGrid.length > 12 ? "rotate(-60deg)" : "none" }}>{dv}</div>)}
                </div>
                <div style={{ textAlign: "center", fontSize: 9, color: "#8A7D77", fontWeight: 700, marginTop: 6 }}>DESTOCK %</div>
              </div>
            </div>
          </Panel>

          {/* METHOD NOTE */}
          <div style={{ background: `linear-gradient(120deg, #500000, #6B1A1A)`, color: "#fff", borderRadius: 14, padding: "18px 22px" }}>
            <h3 style={{ margin: "0 0 8px", fontFamily: "'Bitter', serif", fontSize: 16, color: "#E8C9A0" }}>How the optimization works</h3>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: "#E6E1D8" }}>
              This is a multi-objective optimization solved by exhaustive grid search over the decision variables: destock % and restock %. Each candidate is run through the same engine the dashboard uses. The three objectives (NCFI, ending cash, net-worth growth) are normalized to a common 0–1 scale, then combined with your weights into a single utility. Because every feasible strategy is evaluated, the reported optimum is the global best for your weights, with no solver and no approximation. Tightening the rangeland guardrail removes strategies that restock above the cap, giving the best <em>range-safe</em> choice. Slide the weights to trace the trade-off frontier between cash today and equity tomorrow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [s, setS] = useState({ ...DEFAULTS });
  const set = (k) => (v) => setS((st) => ({ ...st, [k]: v }));
  const [cal, setCal] = useState({ ...CAL });
  const [tab, setTab] = useState(0);
  const [trend, setTrendRaw] = useState(DEFAULTS.priceTrend);
  const [feedTrend, setFeedTrendRaw] = useState(0);
  const [prices, setPrices] = useState(() => buildPrices(DEFAULTS.horizon, DEFAULTS.priceTrend, null, CAL, 0));
  const [assump, setAssump] = useState(() => buildAssump(DEFAULTS.horizon, CAL, null));
  const [showPrices, setShowPrices] = useState(false);
  const [showValid, setShowValid] = useState(false);

  // keep price path length in sync with horizon, preserving overrides
  useEffect(() => {
    setPrices((prev) => buildPrices(s.horizon, trend, prev, cal, feedTrend));
  }, [s.horizon, trend, feedTrend, cal.steerPrice, cal.heiferPrice, cal.cullCowPrice, cal.hayPrice, cal.cubePrice]);
  const setTrend = (v) => { setTrendRaw(v); setPrices((prev) => buildPrices(s.horizon, v, prev.map(p => ({ ...p, override: p.override })), cal, feedTrend)); };
  const setFeedTrend = (v) => { setFeedTrendRaw(v); setPrices((prev) => buildPrices(s.horizon, trend, prev.map(p => ({ ...p, override: p.override })), cal, v)); };
  useEffect(() => {
    setAssump((prev) => buildAssump(s.horizon, cal, prev));
  }, [s.horizon, cal.calvingRate, cal.cullRate, cal.maintFeedCow, cal.prodCostCow, cal.offFarm, cal.familyLiving, cal.costInflation]);

  const [riskBand, setRiskBand] = useState(15);
  const [pinned, setPinned] = useState(null);
  const [custom, setCustom] = useState({});   // user-added statement rows
  const [liab, setLiab] = useState({});       // user overrides of structural liabilities
  const mPin = useMemo(() => pinned ? model({ ...s, ...pinned, herd0: cal.herd0, calvingRate: cal.calvingRate }, prices, cal, assump) : null, [pinned, s.horizon, prices, cal, assump]);
  const scalePrices = (arr, k) => arr.map((p) => ({ ...p, steer: p.steer * k, heifer: p.heifer * k, cull: p.cull * k }));
  const m = useMemo(() => model({ ...s, herd0: cal.herd0, calvingRate: cal.calvingRate }, prices, cal, assump), [s, prices, cal, assump]);
  const mLow = useMemo(() => riskBand ? model({ ...s, herd0: cal.herd0, calvingRate: cal.calvingRate }, scalePrices(prices, 1 - riskBand / 100), cal, assump) : null, [s, prices, cal, assump, riskBand]);
  const mHigh = useMemo(() => riskBand ? model({ ...s, herd0: cal.herd0, calvingRate: cal.calvingRate }, scalePrices(prices, 1 + riskBand / 100), cal, assump) : null, [s, prices, cal, assump, riskBand]);
  const mBase = useMemo(() => model({ ...s, herd0: cal.herd0, calvingRate: cal.calvingRate, destockPct: 0, restockPct: 100, destockYear: 1, restockYear: 3 }, prices, cal, assump), [s, prices, cal, assump]);
  const years = Array.from({ length: s.horizon }, (_, i) => "Yr " + (i + 1));
  const best = bestRun();
  const ncfiDelta = m.avgNcfi - mBase.avgNcfi;
  const sEff = { ...s, herd0: cal.herd0, calvingRate: cal.calvingRate };

  return (
    <div style={{ fontFamily: "'Source Sans 3', system-ui, sans-serif", color: C.ink, background: `radial-gradient(circle at 18% -8%, ${C.paperWarm} 0%, ${C.paper} 42%)`, minHeight: "100vh" }}>
      <Fonts />
      <header style={{ background: `linear-gradient(120deg, #500000 0%, #6B1A1A 100%)`, color: "#fff", padding: "20px 24px 0", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -40, top: -30, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, #ffffff22, transparent 70%)` }} />
        <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Bitter', serif", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Ranching in a <span style={{ color: "#E8C9A0" }}>New Climate</span></h1>
            <div style={{ fontSize: 12, color: "#E3CFCF", marginTop: 2 }}>Stocking strategy during drought · destock &amp; restock economics · 50-cow / 400-acre South Texas ranch (2026 assumptions)</div>
            <div style={{ fontSize: 11.5, color: "#F0DADA", marginTop: 7, padding: "7px 11px", background: "#ffffff18", borderRadius: 8, borderLeft: "3px solid #E8C9A0", maxWidth: 760, lineHeight: 1.5 }}>
              <strong>Educational use only.</strong> This is a teaching and decision-support tool that illustrates the economics of drought stocking strategies for a representative ranch. It is not investment, financial, tax, or animal science advice, and its figures should not be applied to an actual operation without guidance from a Texas A&amp;M AgriLife Extension agent or specialist.
            </div>
          </div>
          <nav style={{ display: "flex", gap: 4, marginTop: 18, flexWrap: "wrap" }}>
            {["Dashboard", "Assumptions", "Financial results", "Optimizer", "Documentation", "About"].map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{ border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, padding: "11px 18px", borderRadius: "10px 10px 0 0", background: tab === i ? C.paper : "transparent", color: tab === i ? C.ink : "#E3CFCF", fontFamily: "'Source Sans 3', sans-serif" }}>{t}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 70px" }}>
        {tab === 1 && <AssumptionsTab cal={cal} setCal={setCal} resetCal={() => { setCal({ ...CAL }); setAssump(buildAssump(s.horizon, { ...CAL }, null)); }} assump={assump} setAssump={setAssump} years={years} />}
        {tab === 2 && <FinancialsTab m={m} s={sEff} years={years} cal={cal} assump={assump} custom={custom} setCustom={setCustom} liab={liab} setLiab={setLiab} />}
        {tab === 3 && <OptimizerTab s={sEff} prices={prices} cal={cal} assump={assump} onApply={(d, r) => { setS((st) => ({ ...st, destockPct: d, restockPct: r })); setTab(0); }} />}
        {tab === 4 && <DocTab />}
        {tab === 5 && <TeamTab />}
        {tab === 0 && (<>
        {/* STICKY RESULTS */}
        <div style={{ position: "sticky", top: 0, zIndex: 30, background: `linear-gradient(${C.paper}, ${C.paper}E6)`, backdropFilter: "blur(6px)", paddingTop: 16, paddingBottom: 13, marginBottom: 8, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <h2 style={{ margin: 0, fontFamily: "'Bitter', serif", fontSize: 16, color: C.ink }}>
              Destock {s.destockPct}% in Yr {s.destockYear} <span style={{ color: "#B9AE9C" }}>{"→"}</span> restock to {s.restockPct}% by Yr {s.restockYear}
            </h2>
            <span style={{ fontSize: 11, color: "#8A8276" }}>{s.horizon}-yr horizon · prices {trend > 0 ? "+" : ""}{trend}%/yr</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 11 }}>
            <Stat label="Avg Net Cash Farm Income" value={fmt(m.avgNcfi)} sub={`/yr · ${ncfiDelta >= 0 ? "+" : "−"}${fmt(Math.abs(ncfiDelta))} vs no-destock`} accent={C.orange} big />
            <Stat label="Avg Net Farm Income" value={fmt(m.avgNfi)} sub="after depreciation" accent={C.indigo} />
            <Stat label={`Ending Cash · Yr ${s.horizon}`} value={fmt(m.endCash)} sub="cumulative reserve" accent={C.teal} />
            <Stat label="Real Net Worth Growth" value={Math.round(m.nwGrowth) + "%"} sub={`over ${s.horizon} yrs`} accent={C.green} />
          </div>
        </div>

        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>
          {/* LEFT: controls */}
          <div style={{ position: "sticky", top: 132 }}>
            <Panel title="The decision" subtitle="Destock and restock can fall in any year of the 10-year horizon." accent={C.coral}>
              <Slider label="Destock in" value={s.destockYear} min={1} max={s.horizon} step={1} fmtVal={(v) => "Year " + v} accent={C.coral} onChange={(v) => setS((st) => ({ ...st, destockYear: v, restockYear: Math.max(st.restockYear, v) }))} help="The year you sell the herd down." />
              <Slider label="Destock amount" value={s.destockPct} min={0} max={100} step={5} suffix="%" accent={C.coral} onChange={set("destockPct")} help={s.destockPct === 0 ? "Keep the full herd (feed through)." : "Share of the herd sold down."} />
              <div style={{ height: 1, background: C.line, margin: "4px 0 16px" }} />
              <Slider label="Restock by" value={s.restockYear} min={s.destockYear} max={s.horizon} step={1} fmtVal={(v) => "Year " + v} accent={C.teal} onChange={set("restockYear")} help="The year the herd reaches its restock level." />
              <Slider label="Restock amount" value={s.restockPct} min={50} max={100} step={5} suffix="%" accent={C.teal} onChange={set("restockPct")} help={s.restockPct >= 100 ? "Rebuild to the original herd size." : "Rebuild only partway to keep a lighter permanent herd."} />
              <div style={{ height: 1, background: C.line, margin: "4px 0 16px" }} />
              <Slider label="Forage recovers by" value={s.feedRecoverYear} min={1} max={s.horizon} step={1} fmtVal={(v) => "Year " + v} accent={C.green} onChange={set("feedRecoverYear")} help="Full feeding until this year, then maintenance feed as the range recovers." />
              <button onClick={() => setPinned(pinned ? null : { destockPct: s.destockPct, restockPct: s.restockPct, destockYear: s.destockYear, restockYear: s.restockYear, feedRecoverYear: s.feedRecoverYear })}
                style={{ marginTop: 6, width: "100%", background: pinned ? C.indigo : "#fff", border: `1.5px solid ${C.indigo}`, color: pinned ? "#fff" : C.indigo, fontWeight: 700, padding: "9px", borderRadius: 9, cursor: "pointer", fontSize: 13 }}>{pinned ? "Unpin comparison" : "Pin this strategy to compare"}</button>
              <button onClick={() => { setS({ ...DEFAULTS }); setTrendRaw(DEFAULTS.priceTrend); setFeedTrendRaw(0); setPrices(buildPrices(DEFAULTS.horizon, DEFAULTS.priceTrend, null, cal, 0)); }}
                style={{ marginTop: 6, width: "100%", background: "#fff", border: `1.5px solid ${C.coral}`, color: C.coral, fontWeight: 700, padding: "9px", borderRadius: 9, cursor: "pointer", fontSize: 13 }}>{"↺"} Reset to baseline</button>
            </Panel>
          </div>

          {/* RIGHT: visuals */}
          <div>
            {pinned && mPin && (() => {
              const lastA = mPin.path[mPin.path.length - 1], lastB = m.path[m.path.length - 1];
              const rows = [
                ["Avg Net Cash Farm Income", fmt(mPin.avgNcfi), fmt(m.avgNcfi), fmt(m.avgNcfi - mPin.avgNcfi)],
                ["Avg Net Farm Income", fmt(mPin.avgNfi), fmt(m.avgNfi), fmt(m.avgNfi - mPin.avgNfi)],
                ["Ending cash reserve", fmt(mPin.endCash), fmt(m.endCash), fmt(m.endCash - mPin.endCash)],
                ["Real net-worth growth", Math.round(mPin.nwGrowth) + "%", Math.round(m.nwGrowth) + "%", (m.nwGrowth - mPin.nwGrowth >= 0 ? "+" : "") + (m.nwGrowth - mPin.nwGrowth).toFixed(1) + " pts"],
                ["Herd after restock", lastA + " head", lastB + " head", (lastB - lastA >= 0 ? "+" : "") + (lastB - lastA) + " head"],
              ];
              const tdp = { padding: "7px 10px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right", borderBottom: `1px solid ${C.line}` };
              return (
                <Panel title="Comparison: pinned vs. current" accent={C.indigo}
                  subtitle={`Pinned: destock ${pinned.destockPct}% in Yr ${pinned.destockYear}, restock ${pinned.restockPct}% by Yr ${pinned.restockYear}. Current: destock ${s.destockPct}% in Yr ${s.destockYear}, restock ${s.restockPct}% by Yr ${s.restockYear}. Both evaluated under your current prices and assumptions.`}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                      <thead><tr>
                        <th style={{ padding: "7px 10px", fontSize: 11, color: "#fff", background: C.indigo, textAlign: "left", borderRadius: "8px 0 0 0" }}>Measure</th>
                        <th style={{ padding: "7px 10px", fontSize: 11, color: "#fff", background: C.indigo, textAlign: "right" }}>Pinned</th>
                        <th style={{ padding: "7px 10px", fontSize: 11, color: "#fff", background: C.indigo, textAlign: "right" }}>Current</th>
                        <th style={{ padding: "7px 10px", fontSize: 11, color: "#fff", background: C.indigo, textAlign: "right", borderRadius: "0 8px 0 0" }}>Difference</th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} style={{ background: i % 2 ? C.paperWarm : "#fff" }}>
                            <td style={{ ...tdp, textAlign: "left", fontFamily: "'Source Sans 3', sans-serif", fontWeight: 600, color: C.ink }}>{r[0]}</td>
                            <td style={{ ...tdp, color: "#6A5F58" }}>{r[1]}</td>
                            <td style={{ ...tdp, fontWeight: 700, color: C.ink }}>{r[2]}</td>
                            <td style={{ ...tdp, fontWeight: 700, color: String(r[3]).startsWith("\u2212") || String(r[3]).startsWith("-") ? C.coral : C.green }}>{r[3]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              );
            })()}
            <Panel title="Net income over the planning horizon" subtitle="Net Cash Farm Income (solid) vs. Net Farm Income after depreciation (dashed). NFI lags in recovery years as purchased cows depreciate, the pattern the 2011 study describes." accent={C.orange}
              right={<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10.5, color: "#8A8276", marginRight: 4 }}>Price risk</span>
                {[0, 10, 15, 20].map((b) => (
                  <button key={b} onClick={() => setRiskBand(b)} style={{ background: riskBand === b ? C.orange : "#fff", color: riskBand === b ? "#fff" : C.orange, border: `1.3px solid ${C.orange}`, borderRadius: 7, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{b === 0 ? "Off" : "\u00b1" + b + "%"}</button>
                ))}
              </div>}>
              <DualChart years={years} ncfi={m.ncfiTraj} nfi={m.nfiTraj} band={riskBand && mLow && mHigh ? { lo: mLow.ncfiTraj, hi: mHigh.ncfiTraj } : null} pinned={pinned && mPin ? mPin.ncfiTraj : null} />
              <div style={{ display: "flex", gap: 18, fontSize: 12, color: "#7A7264", marginTop: 8, flexWrap: "wrap" }}>
                <span><span style={{ display: "inline-block", width: 16, height: 4, background: C.orange, borderRadius: 3, marginRight: 6, verticalAlign: "middle" }} />Net Cash Farm Income</span>
                <span><span style={{ display: "inline-block", width: 16, height: 0, borderTop: `3px dashed ${C.indigo}`, marginRight: 6, verticalAlign: "middle" }} />Net Farm Income</span>
                {riskBand > 0 && <span><span style={{ display: "inline-block", width: 16, height: 10, background: C.orange + "22", marginRight: 6, verticalAlign: "middle", borderRadius: 2 }} />NCFI if cattle prices run {"\u00b1"}{riskBand}%</span>}
                {pinned && mPin && <span><span style={{ display: "inline-block", width: 16, height: 0, borderTop: "2px dashed #9A9285", marginRight: 6, verticalAlign: "middle" }} />Pinned strategy NCFI</span>}
              </div>
            </Panel>

            <Panel title="Herd path" subtitle="Head carried each year, from the destock/restock timing you set." accent={C.teal}>
              <HerdStrip years={years} path={m.path} herd0={cal.herd0} />
              {(() => {
                const maxH = Math.max(...m.path), lastH = m.path[m.path.length - 1];
                const acMax = maxH > 0 ? (cal.acres / maxH).toFixed(1) : "n/a";
                const acLast = lastH > 0 ? (cal.acres / lastH).toFixed(1) : "n/a";
                return (
                  <div style={{ fontSize: 12, color: "#7A7264", marginTop: 10, padding: "9px 13px", background: C.paperWarm, borderRadius: 9, lineHeight: 1.5 }}>
                    <strong style={{ color: C.ink }}>Stocking rate:</strong> 1 cow per {acMax} acres at the heaviest year ({maxH} head); 1 cow per {acLast} acres after restock ({lastH} head). A mature cow is roughly one animal unit, so these read as acres per animal unit. Lighter stocking eases grazing pressure and improves drought resilience.
                  </div>
                );
              })()}
            </Panel>

            <Panel title="Year-by-year price path" accent={C.coral}
              subtitle="Year 1 holds the 2026 prices; future years evolve at the trend (default flat). Override any single cell to model a specific year. The published runs assumed roughly −3%/year, so a flat path reads somewhat higher."
              right={<button onClick={() => setShowPrices(!showPrices)} style={{ background: showPrices ? C.coral : "#fff", color: showPrices ? "#fff" : C.coral, border: `1.4px solid ${C.coral}`, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{showPrices ? "Hide" : "Edit prices"}</button>}>
              {showPrices
                ? <PriceTable prices={prices} setPrices={setPrices} years={years} trend={trend} setTrend={setTrend} feedTrend={feedTrend} setFeedTrend={setFeedTrend} cal={cal} />
                : <div style={{ fontSize: 12.5, color: "#8A8276", lineHeight: 1.5 }}>Cattle prices trend <strong style={{ color: C.ink }}>{trend > 0 ? "+" : ""}{trend}%/yr</strong> and feed <strong style={{ color: C.ink }}>{feedTrend > 0 ? "+" : ""}{feedTrend}%/yr</strong> from Year 1's 2026 values (steer ${prices[0].steer.toFixed(2)}, heifer ${prices[0].heifer.toFixed(2)}, cull ${prices[0].cull.toFixed(2)}/lb; hay ${prices[0].hay}, cubes ${prices[0].cube}/ton). Click <em>Edit prices</em> to set each year by hand.</div>}
            </Panel>

            <Panel title="Validation · the nine FARM Assistance runs" accent={C.green}
              subtitle="The headline figures are anchored to these published 2026 model runs; your price edits scale them. Best strategy is starred."
              right={<button onClick={() => setShowValid(!showValid)} style={{ background: showValid ? C.green : "#fff", color: showValid ? "#fff" : C.green, border: `1.4px solid ${C.green}`, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{showValid ? "Hide" : "Show runs"}</button>}>
              {showValid
                ? <ValidationTable s={s} onPick={(d, r) => setS((st) => ({ ...st, destockPct: d, restockPct: r, destockYear: 1, restockYear: 3 }))} />
                : <div style={{ fontSize: 12.5, color: "#8A8276", lineHeight: 1.5 }}>Best published strategy: <strong style={{ color: C.green }}>Destock {best.d}% / Restock {best.r}%</strong> at {fmt(best.ncfi)}/yr and {fmt(best.endCash)} ending cash. Click <em>Show runs</em> to compare all nine and load any as a starting point.</div>}
            </Panel>
          </div>
        </div>

        {/* EXPERT NOTE */}
        <div style={{ marginTop: 4, background: `linear-gradient(120deg, #500000, #6B1A1A)`, color: "#fff", borderRadius: 15, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 9px", fontFamily: "'Bitter', serif", fontSize: 17, color: "#E8C9A0" }}>Reading the result</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#E6E1D8" }}>
            Across the 2026 runs, destocking modestly and restocking to a <strong>lighter permanent herd (75%)</strong> tops the field: the feed-cost and replacement-purchase savings outweigh the lost calf production, and the lighter stocking rate leaves the range better able to withstand the next drought. NCFI shows the cash story; NFI runs below it through the recovery years because newly purchased cows carry depreciation. Off-farm income and hunting support cash flow in every strategy, so the destock/restock choice is what moves the needle on the margin.
          </p>
        </div>
        </>)}
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: "18px 24px", textAlign: "center", color: "#9A9285", fontSize: 11.5, lineHeight: 1.6 }}>
        Headline figures anchor to the 2026 FARM Assistance scenario runs; the year-by-year engine, calibrated to the base-run statements, drives the trajectory and price sensitivity. Updated from the 2011 FARM Assistance Focus stocking-strategy study (Young, Dominguez, Paschal, Klose). Texas A&amp;M AgriLife Extension Service.
      </footer>
    </div>
  );
}
