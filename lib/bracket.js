// lib/bracket.js
// All team data, model functions, and simulation engine

// ── Team Data ──
export const TEAMS = {
  East: {
    1: { name: "Duke", adjEM: 33.2, adjT: 69.5, oRk: 4, dRk: 2, pubChamp: 18.5 },
    2: { name: "UConn", adjEM: 23.8, adjT: 67.8, oRk: 30, dRk: 11, pubChamp: 6.2 },
    3: { name: "Michigan St", adjEM: 21.5, adjT: 67.2, oRk: 24, dRk: 13, pubChamp: 2.1 },
    4: { name: "Kansas", adjEM: 17.4, adjT: 68.5, oRk: 57, dRk: 10, pubChamp: 1.8 },
    5: { name: "St. John's", adjEM: 19.0, adjT: 66.0, oRk: 44, dRk: 12, pubChamp: 1.5 },
    6: { name: "Louisville", adjEM: 16.8, adjT: 71.5, oRk: 20, dRk: 25, pubChamp: 0.8 },
    7: { name: "UCLA", adjEM: 14.2, adjT: 67.0, oRk: 22, dRk: 54, pubChamp: 0.5 },
    8: { name: "Ohio St", adjEM: 13.5, adjT: 67.5, oRk: 17, dRk: 53, pubChamp: 0.2 },
    9: { name: "TCU", adjEM: 12.8, adjT: 66.5, oRk: 81, dRk: 22, pubChamp: 0.1 },
    10: { name: "UCF", adjEM: 9.2, adjT: 68.0, oRk: 38, dRk: 55, pubChamp: 0.05 },
    11: { name: "South Florida", adjEM: 10.5, adjT: 70.0, oRk: 35, dRk: 48, pubChamp: 0.05 },
    12: { name: "N. Iowa", adjEM: 7.8, adjT: 65.5, oRk: 60, dRk: 50, pubChamp: 0.02 },
    13: { name: "Cal Baptist", adjEM: 5.1, adjT: 68.0, oRk: 75, dRk: 70, pubChamp: 0.01 },
    14: { name: "N. Dakota St", adjEM: 4.5, adjT: 66.0, oRk: 85, dRk: 65, pubChamp: 0.01 },
    15: { name: "Furman", adjEM: 3.2, adjT: 66.5, oRk: 95, dRk: 60, pubChamp: 0.01 },
    16: { name: "Siena", adjEM: -1.5, adjT: 67.0, oRk: 180, dRk: 90, pubChamp: 0.005 },
  },
  South: {
    1: { name: "Florida", adjEM: 28.5, adjT: 69.0, oRk: 9, dRk: 6, pubChamp: 8.0 },
    2: { name: "Houston", adjEM: 26.8, adjT: 64.5, oRk: 14, dRk: 5, pubChamp: 7.5 },
    3: { name: "Illinois", adjEM: 24.0, adjT: 70.5, oRk: 1, dRk: 28, pubChamp: 3.5 },
    4: { name: "Nebraska", adjEM: 18.2, adjT: 64.0, oRk: 55, dRk: 7, pubChamp: 0.6 },
    5: { name: "Vanderbilt", adjEM: 22.5, adjT: 70.0, oRk: 7, dRk: 29, pubChamp: 2.5 },
    6: { name: "North Carolina", adjEM: 15.0, adjT: 69.5, oRk: 32, dRk: 37, pubChamp: 1.2 },
    7: { name: "Saint Mary's", adjEM: 16.5, adjT: 63.0, oRk: 43, dRk: 19, pubChamp: 0.3 },
    8: { name: "Clemson", adjEM: 11.0, adjT: 65.0, oRk: 71, dRk: 20, pubChamp: 0.1 },
    9: { name: "Iowa", adjEM: 14.8, adjT: 64.8, oRk: 31, dRk: 31, pubChamp: 0.3 },
    10: { name: "Texas A&M", adjEM: 11.5, adjT: 69.5, oRk: 49, dRk: 40, pubChamp: 0.1 },
    11: { name: "VCU", adjEM: 12.0, adjT: 68.5, oRk: 46, dRk: 63, pubChamp: 0.1 },
    12: { name: "McNeese", adjEM: 8.5, adjT: 71.0, oRk: 42, dRk: 58, pubChamp: 0.03 },
    13: { name: "Troy", adjEM: 5.8, adjT: 67.5, oRk: 70, dRk: 72, pubChamp: 0.01 },
    14: { name: "Penn", adjEM: 4.0, adjT: 66.0, oRk: 65, dRk: 80, pubChamp: 0.01 },
    15: { name: "Idaho", adjEM: 1.5, adjT: 67.0, oRk: 110, dRk: 95, pubChamp: 0.005 },
    16: { name: "Lehigh", adjEM: -4.0, adjT: 67.5, oRk: 160, dRk: 140, pubChamp: 0.001 },
  },
  West: {
    1: { name: "Arizona", adjEM: 31.5, adjT: 69.0, oRk: 5, dRk: 3, pubChamp: 15.0 },
    2: { name: "Purdue", adjEM: 24.5, adjT: 70.5, oRk: 2, dRk: 36, pubChamp: 5.0 },
    3: { name: "Gonzaga", adjEM: 22.0, adjT: 71.0, oRk: 29, dRk: 9, pubChamp: 2.8 },
    4: { name: "Arkansas", adjEM: 20.5, adjT: 72.5, oRk: 6, dRk: 52, pubChamp: 2.0 },
    5: { name: "Wisconsin", adjEM: 17.0, adjT: 66.0, oRk: 11, dRk: 51, pubChamp: 0.8 },
    6: { name: "BYU", adjEM: 16.0, adjT: 68.5, oRk: 10, dRk: 57, pubChamp: 1.0 },
    7: { name: "Miami (FL)", adjEM: 14.0, adjT: 67.5, oRk: 33, dRk: 38, pubChamp: 0.3 },
    8: { name: "Villanova", adjEM: 12.5, adjT: 66.5, oRk: 41, dRk: 35, pubChamp: 0.2 },
    9: { name: "Utah St", adjEM: 13.0, adjT: 67.0, oRk: 28, dRk: 44, pubChamp: 0.15 },
    10: { name: "Missouri", adjEM: 9.5, adjT: 69.0, oRk: 48, dRk: 56, pubChamp: 0.05 },
    11: { name: "Texas", adjEM: 10.0, adjT: 68.0, oRk: 13, dRk: 111, pubChamp: 0.05 },
    12: { name: "High Point", adjEM: 8.0, adjT: 71.5, oRk: 50, dRk: 62, pubChamp: 0.02 },
    13: { name: "Hawaii", adjEM: 4.8, adjT: 67.0, oRk: 78, dRk: 75, pubChamp: 0.01 },
    14: { name: "Kennesaw St", adjEM: 2.5, adjT: 70.5, oRk: 88, dRk: 85, pubChamp: 0.005 },
    15: { name: "Queens", adjEM: 0.5, adjT: 67.5, oRk: 120, dRk: 100, pubChamp: 0.003 },
    16: { name: "LIU", adjEM: -3.5, adjT: 68.0, oRk: 200, dRk: 150, pubChamp: 0.001 },
  },
  Midwest: {
    1: { name: "Michigan", adjEM: 32.0, adjT: 65.5, oRk: 8, dRk: 1, pubChamp: 12.0 },
    2: { name: "Iowa St", adjEM: 25.5, adjT: 66.5, oRk: 21, dRk: 4, pubChamp: 4.5 },
    3: { name: "Virginia", adjEM: 19.5, adjT: 62.0, oRk: 27, dRk: 16, pubChamp: 1.2 },
    4: { name: "Alabama", adjEM: 20.0, adjT: 73.5, oRk: 3, dRk: 67, pubChamp: 1.8 },
    5: { name: "Texas Tech", adjEM: 17.5, adjT: 67.5, oRk: 12, dRk: 33, pubChamp: 0.5 },
    6: { name: "Tennessee", adjEM: 16.2, adjT: 65.5, oRk: 37, dRk: 15, pubChamp: 0.6 },
    7: { name: "Kentucky", adjEM: 14.5, adjT: 68.0, oRk: 39, dRk: 27, pubChamp: 0.8 },
    8: { name: "Georgia", adjEM: 11.8, adjT: 70.0, oRk: 16, dRk: 80, pubChamp: 0.15 },
    9: { name: "Saint Louis", adjEM: 12.2, adjT: 66.0, oRk: 51, dRk: 41, pubChamp: 0.1 },
    10: { name: "Santa Clara", adjEM: 13.5, adjT: 67.0, oRk: 23, dRk: 82, pubChamp: 0.08 },
    11: { name: "SMU", adjEM: 10.8, adjT: 67.5, oRk: 26, dRk: 91, pubChamp: 0.05 },
    12: { name: "Akron", adjEM: 9.0, adjT: 72.0, oRk: 36, dRk: 68, pubChamp: 0.03 },
    13: { name: "Hofstra", adjEM: 5.5, adjT: 68.5, oRk: 58, dRk: 78, pubChamp: 0.01 },
    14: { name: "Wright St", adjEM: 3.0, adjT: 67.0, oRk: 90, dRk: 88, pubChamp: 0.005 },
    15: { name: "Tennessee St", adjEM: 0.8, adjT: 68.0, oRk: 105, dRk: 110, pubChamp: 0.003 },
    16: { name: "Howard", adjEM: 1.0, adjT: 69.0, oRk: 130, dRk: 120, pubChamp: 0.001 },
  }
};

export const REGION_NAMES = ["East", "South", "West", "Midwest"];
export const SEED_ORDER = [1,16,8,9,5,12,4,13,6,11,3,14,7,10,2,15];
export const ROUND_LABELS = ["R64", "R32", "S16", "E8", "F4", "NCG"];
export const BASE_SD = 11.5;
export const IMBALANCE_FACTOR = 0.0025;

// ── Apply Injuries ──
const INJURIES = { "Michigan": -3.5, "North Carolina": -5.0, "Texas Tech": -4.0, "Duke": -1.0 };
for (const r of REGION_NAMES) for (let s = 1; s <= 16; s++) {
  const t = TEAMS[r][s]; const adj = INJURIES[t.name];
  if (adj) { t.adjEM_full = t.adjEM; t.adjEM += adj; }
}

// ── Geography ──
export const GEO = {
  "Florida": { 0: 1.0, 1: 1.0 }, "Houston": { 0: 0.5, 1: 0.5, 2: 2.0, 3: 2.0 },
  "Duke": { 2: 1.0, 3: 1.0 }, "Gonzaga": { 0: 0.5, 1: 0.5 }, "Arizona": { 2: 0.5, 3: 0.5 },
  "Michigan": { 2: 1.0, 3: 1.0 }, "Iowa St": { 0: 0.5, 1: 0.5 }, "Louisville": { 0: 0.3, 1: 0.3 },
};
export const F4GEO = { "Michigan": 0.5, "Purdue": 0.75, "Iowa St": 0.3, "Illinois": 0.5, "Ohio St": 0.3, "Louisville": 0.5, "Kentucky": 0.5 };

// ── Model Functions ──
export function normalCDF(x) {
  if (x < -8) return 0; if (x > 8) return 1;
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1/(1+p*z);
  const y = 1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z);
  return 0.5*(1+sign*y);
}

export function gameSD(oA, dA, oB, dB) {
  const avg = (Math.abs(oA-dA) + Math.abs(oB-dB)) / 2;
  return BASE_SD * (1 + avg * IMBALANCE_FACTOR);
}

export function winProb(emA, tA, emB, tB, oA, dA, oB, dB) {
  const spread = (emA - emB) * (tA + tB) / 200;
  const sd = (oA !== undefined) ? gameSD(oA, dA, oB, dB) : BASE_SD;
  return normalCDF(spread / sd);
}

// ── Simulation Engine ──
export function simTournament(modeNum, upsetBias, locked, lockedFF) {
  const regionWinners = [];
  let totalUpsets = 0;
  const upsetTeamsList = [];
  const r64LoSeedWins = [];
  const teamDepths = {};

  for (let ri = 0; ri < 4; ri++) {
    const rName = REGION_NAMES[ri];
    const region = TEAMS[rName];
    const locks = locked[rName];

    let seeds = SEED_ORDER.slice();
    let ems = seeds.map(s => region[s].adjEM);
    let ts = seeds.map(s => region[s].adjT);
    let orks = seeds.map(s => region[s].oRk);
    let drks = seeds.map(s => region[s].dRk);
    let names = seeds.map(s => region[s].name);
    for (const n of names) teamDepths[n] = 0;
    let roundIdx = 0;

    while (seeds.length > 1) {
      const nS=[],nE=[],nT=[],nO=[],nD=[],nN=[];
      const roundLocks = locks[roundIdx];

      for (let i = 0; i < seeds.length; i += 2) {
        const gi = i / 2;
        const sA = seeds[i], sB = seeds[i+1];

        let wi, li;
        if (roundLocks && roundLocks[gi] != null) {
          const wSeed = roundLocks[gi];
          wi = (sA === wSeed) ? i : i+1;
          li = (wi === i) ? i+1 : i;
        } else {
          const geoA = GEO[names[i]]?.[roundIdx] || 0;
          const geoB = GEO[names[i+1]]?.[roundIdx] || 0;
          let pA = winProb(ems[i]+geoA, ts[i], ems[i+1]+geoB, ts[i+1], orks[i], drks[i], orks[i+1], drks[i+1]);
          if (modeNum === 1) pA = pA < 0.5 ? Math.min(pA+upsetBias,0.85) : Math.max(pA-upsetBias,0.15);
          else if (modeNum === 2) pA = Math.max(0.02, Math.min(0.98, pA+(Math.random()-0.5)*0.15));
          const aWins = Math.random() < pA;
          wi = aWins ? i : i+1;
          li = aWins ? i+1 : i;
        }

        if (seeds[wi] - seeds[li] >= 5) { totalUpsets++; upsetTeamsList.push({ name: names[wi], round: ROUND_LABELS[roundIdx] }); }
        if (roundIdx === 0) { const lo = Math.max(sA,sB); r64LoSeedWins.push(seeds[wi]===lo); }
        teamDepths[names[wi]] = roundIdx + 1;
        nS.push(seeds[wi]); nE.push(ems[wi]); nT.push(ts[wi]); nO.push(orks[wi]); nD.push(drks[wi]); nN.push(names[wi]);
      }
      seeds=nS; ems=nE; ts=nT; orks=nO; drks=nD; names=nN;
      roundIdx++;
    }
    regionWinners.push({ seed: seeds[0], em: ems[0], t: ts[0], oRk: orks[0], dRk: drks[0], name: names[0] });
  }

  // Final Four
  const finalists = [];
  for (let si = 0; si < 2; si++) {
    const a = regionWinners[si*2], b = regionWinners[si*2+1];
    let w;
    if (lockedFF.f4[si] != null) {
      w = (a.seed === lockedFF.f4[si]) ? a : b;
    } else {
      const gA = F4GEO[a.name]||0, gB = F4GEO[b.name]||0;
      let pA = winProb(a.em+gA, a.t, b.em+gB, b.t, a.oRk, a.dRk, b.oRk, b.dRk);
      if (modeNum===1) pA=pA<0.5?Math.min(pA+upsetBias,0.8):Math.max(pA-upsetBias,0.2);
      else if (modeNum===2) pA=Math.max(0.05,Math.min(0.95,pA+(Math.random()-0.5)*0.2));
      w = Math.random()<pA ? a : b;
    }
    const l = w===a ? b : a;
    if (w.seed-l.seed>=5) { totalUpsets++; upsetTeamsList.push({ name: w.name, round: "F4" }); }
    teamDepths[w.name] = 5;
    finalists.push(w);
  }

  // NCG
  let champ;
  if (lockedFF.ncg != null) {
    champ = finalists[0].seed === lockedFF.ncg ? finalists[0] : finalists[1];
  } else {
    const gA=F4GEO[finalists[0].name]||0, gB=F4GEO[finalists[1].name]||0;
    let pC = winProb(finalists[0].em+gA,finalists[0].t,finalists[1].em+gB,finalists[1].t,finalists[0].oRk,finalists[0].dRk,finalists[1].oRk,finalists[1].dRk);
    if (modeNum===1) pC=pC<0.5?Math.min(pC+upsetBias,0.75):Math.max(pC-upsetBias,0.25);
    else if (modeNum===2) pC=Math.max(0.1,Math.min(0.9,pC+(Math.random()-0.5)*0.2));
    champ = Math.random()<pC ? finalists[0] : finalists[1];
  }
  const champL = champ===finalists[0]?finalists[1]:finalists[0];
  if (champ.seed-champL.seed>=5) { totalUpsets++; upsetTeamsList.push({ name: champ.name, round: "NCG" }); }
  teamDepths[champ.name] = 6;

  return {
    champName: champ.name, champSeed: champ.seed, upsets: totalUpsets,
    upsetTeams: upsetTeamsList, r64LoSeedWins, teamDepths,
    regionWinners: regionWinners.map(r => ({ seed: r.seed, name: r.name })),
  };
}

// ── Pool EV ──
export function calcPoolEV(res, poolSize) {
  return Object.entries(res.champCounts).map(([name, count]) => {
    const pWin = count / res.total;
    let pubPct = 0.001;
    for (const r of REGION_NAMES) for (let s=1;s<=16;s++) if (TEAMS[r][s].name===name) { pubPct=TEAMS[r][s].pubChamp/100; break; }
    const ev = pWin / (1 + pubPct*(poolSize-1));
    return { name, pWin: (pWin*100).toFixed(2), pubPct: (pubPct*100).toFixed(1), ev: ev.toFixed(4), leverage: ((pWin-pubPct)*100).toFixed(1), count };
  }).sort((a,b) => parseFloat(b.ev)-parseFloat(a.ev));
}
