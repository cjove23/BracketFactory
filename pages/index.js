// pages/index.js
import { useState, useCallback, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  TEAMS, REGION_NAMES, SEED_ORDER, ROUND_LABELS, winProb, simTournament,
  DEFAULT_INJURIES, buildInjuryMap, getAdjEM, ALL_TEAM_NAMES,
  oddsToProb, probToOdds, kellyCriterion, americanToDecimal, GEO, F4GEO,
  normalCDF, BASE_SD, gameSD, KNOWN_ODDS, adjustedSpread,
} from "../lib/bracket";
import useLiveScores from "../lib/useLiveScores";
import Head from "next/head";

const BATCH = 5000;
const MODE_MAP = { kenpom:0, contrarian:1, montecarlo:2 };
const C = {
  bg:"#0a0f1a",surface:"#111827",card:"#1a2235",border:"#2a3550",
  accent:"#f97316",accentDim:"#c2410c",green:"#22c55e",blue:"#3b82f6",
  purple:"#a855f7",red:"#ef4444",yellow:"#eab308",text:"#f1f5f9",textDim:"#94a3b8",textMuted:"#64748b",
};
const COLORS=["#f97316","#3b82f6","#a855f7","#22c55e","#ef4444","#eab308","#06b6d4","#ec4899","#8b5cf6","#14b8a6","#f59e0b","#6366f1","#10b981","#f43f5e","#0ea5e9","#84cc16"];
const ALL_ROUNDS = ["R64","R32","S16","E8","F4","NCG"];

// Background injury map — computed dynamically from DEFAULT + auto-detected
// (Moved inside component as useMemo)

// Team name lookup
const TEAM_LOOKUP = {};
for (const r of REGION_NAMES) for (let s = 1; s <= 16; s++) {
  const t = TEAMS[r][s];
  TEAM_LOOKUP[t.name] = { region: r, seed: s, team: t };
}

// Dynamically compute current matchups based on locked results + injuries
function getCurrentMatchups(locked, lockedFF, injuryMap) {
  const matchups = [];
  const regionWinners = [];

  for (let ri = 0; ri < 4; ri++) {
    const rName = REGION_NAMES[ri];
    const region = TEAMS[rName];
    const locks = locked[rName];
    let currentSeeds = SEED_ORDER.slice();

    for (let roundIdx = 0; roundIdx < 4; roundIdx++) {
      const nextSeeds = [];
      const gamesInRound = currentSeeds.length / 2;
      const roundLocks = locks[roundIdx];

      for (let gi = 0; gi < gamesInRound; gi++) {
        const sA = currentSeeds[gi * 2], sB = currentSeeds[gi * 2 + 1];
        if (sA == null || sB == null) { nextSeeds.push(null); continue; }
        if (roundLocks && roundLocks[gi] != null) {
          nextSeeds.push(roundLocks[gi]);
        } else {
          const hiSeed = Math.min(sA, sB), loSeed = Math.max(sA, sB);
          const hi = region[hiSeed], lo = region[loSeed];
          const hiEM = getAdjEM(hi, injuryMap), loEM = getAdjEM(lo, injuryMap);
          const loWinPct = winProb(loEM, lo.adjT, hiEM, hi.adjT, lo.oRk, lo.dRk, hi.oRk, hi.dRk) * 100;
          matchups.push({
            region: rName, round: ROUND_LABELS[roundIdx], hiSeed, loSeed, seedGap: loSeed - hiSeed,
            hiName: hi.name, loName: lo.name, hiEM, loEM,
            mismatch: loEM > hiEM, emGap: (loEM - hiEM).toFixed(1), loWinPct: loWinPct.toFixed(1),
          });
          nextSeeds.push(null);
        }
      }
      currentSeeds = nextSeeds;
    }
    if (currentSeeds.length === 1 && currentSeeds[0] != null) {
      regionWinners.push({ seed: currentSeeds[0], team: region[currentSeeds[0]], region: rName });
    } else { regionWinners.push(null); }
  }

  // F4
  for (let si = 0; si < 2; si++) {
    const a = regionWinners[si * 2], b = regionWinners[si * 2 + 1];
    if (a && b && lockedFF.f4[si] == null) {
      const hiSeed = Math.min(a.seed, b.seed), loSeed = Math.max(a.seed, b.seed);
      const hi = hiSeed === a.seed ? a : b, lo = hiSeed === a.seed ? b : a;
      const hiEM = getAdjEM(hi.team, injuryMap), loEM = getAdjEM(lo.team, injuryMap);
      const loWinPct = winProb(loEM, lo.team.adjT, hiEM, hi.team.adjT, lo.team.oRk, lo.team.dRk, hi.team.oRk, hi.team.dRk) * 100;
      matchups.push({ region: `${hi.region} / ${lo.region}`, round: "F4", hiSeed, loSeed, seedGap: loSeed - hiSeed, hiName: hi.team.name, loName: lo.team.name, hiEM, loEM, mismatch: loEM > hiEM, emGap: (loEM - hiEM).toFixed(1), loWinPct: loWinPct.toFixed(1) });
    }
  }
  // NCG
  const f4W = [];
  for (let si = 0; si < 2; si++) {
    if (lockedFF.f4[si] != null) { const a = regionWinners[si*2], b = regionWinners[si*2+1]; if (a&&b) f4W.push(a.seed===lockedFF.f4[si]?a:b); else f4W.push(null); } else f4W.push(null);
  }
  if (f4W[0]&&f4W[1]&&lockedFF.ncg==null) {
    const a=f4W[0],b=f4W[1]; const hiSeed=Math.min(a.seed,b.seed),loSeed=Math.max(a.seed,b.seed);
    const hi=hiSeed===a.seed?a:b,lo=hiSeed===a.seed?b:a;
    const hiEM=getAdjEM(hi.team,injuryMap),loEM=getAdjEM(lo.team,injuryMap);
    const loWinPct=winProb(loEM,lo.team.adjT,hiEM,hi.team.adjT,lo.team.oRk,lo.team.dRk,hi.team.oRk,hi.team.dRk)*100;
    matchups.push({region:"Championship",round:"NCG",hiSeed,loSeed,seedGap:loSeed-hiSeed,hiName:hi.team.name,loName:lo.team.name,hiEM,loEM,mismatch:loEM>hiEM,emGap:(loEM-hiEM).toFixed(1),loWinPct:loWinPct.toFixed(1)});
  }
  return matchups;
}

function Tip({active,payload}){if(!active||!payload?.length)return null;const d=payload[0]?.payload;return(
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 12px",fontSize:11,fontFamily:"monospace"}}>
    <div style={{color:C.text,fontWeight:700}}>{d?.name||d?.seed||""}</div>
    {payload.map((p,i)=><div key={i} style={{color:COLORS[i%COLORS.length]}}>{p.dataKey}: {p.value}%</div>)}
  </div>
);}

export default function Home() {
  const live = useLiveScores();

  // Merge DEFAULT_INJURIES + auto-detected into a single injury map
  const allInjuries = useMemo(() => {
    const merged = [...DEFAULT_INJURIES];
    const existingKeys = new Set(DEFAULT_INJURIES.map(i => `${i.team}|${i.player}`));
    for (const det of (live.detectedInjuries || [])) {
      const key = `${det.team}|${det.player}`;
      if (!existingKeys.has(key)) {
        merged.push({ id: 1000 + merged.length, team: det.team, player: det.player, type: det.type, emAdj: det.emImpact, active: true, autoDetected: true });
        existingKeys.add(key);
      }
    }
    return merged;
  }, [live.detectedInjuries]);

  const injuryMap = useMemo(() => buildInjuryMap(allInjuries), [allInjuries]);

  const INJURY_DISPLAY = useMemo(() => {
    const map = {};
    for (const inj of allInjuries) {
      if (!inj.active) continue;
      if (!map[inj.team]) map[inj.team] = [];
      map[inj.team].push(inj);
    }
    return map;
  }, [allInjuries]);

  const [running,setRunning]=useState(false);
  const [target,setTarget]=useState(1000000);
  const [done,setDone]=useState(0);
  const [mode,setMode]=useState("mixed");
  const [upsetBias,setUpsetBias]=useState(0.05);
  const [results,setResults]=useState(null);
  const [elapsed,setElapsed]=useState(0);
  const [tab,setTab]=useState("live");
  const [bettingFilter,setBettingFilter]=useState("ALL");
  const [betTypeFilter,setBetTypeFilter]=useState("ALL"); // ALL, spread, ML
  const cancelRef=useRef(false);
  const startRef=useRef(0);

  const generate = useCallback(()=>{
    cancelRef.current=false; setRunning(true); setDone(0); setResults(null); setElapsed(0);
    startRef.current=performance.now();
    const stats={total:0,champCounts:{},champSeedCounts:{},regionWinnerCounts:[{},{},{},{}],f4SeedCounts:{},
      upsetTotal:0,upsetDist:{},teamDepthCounts:{},teamUpsetCounts:{},teamUpsetSims:{},teamUpsetByRound:{}};
    let completed=0;
    const modeNums=mode==="mixed"?[0,1,2]:[MODE_MAP[mode]??0];

    function batch(){
      if(cancelRef.current){setRunning(false);return;}
      const end=Math.min(completed+BATCH,target);
      for(let i=completed;i<end;i++){
        const m=modeNums.length===1?modeNums[0]:modeNums[i%3];
        const res=simTournament(m,upsetBias,live.locked,live.lockedFF,injuryMap);
        stats.total++;
        stats.champCounts[res.champName]=(stats.champCounts[res.champName]||0)+1;
        stats.champSeedCounts[res.champSeed]=(stats.champSeedCounts[res.champSeed]||0)+1;
        stats.upsetTotal+=res.upsets;
        stats.upsetDist[res.upsets]=(stats.upsetDist[res.upsets]||0)+1;
        for(let ri=0;ri<4;ri++){
          const key=`(${res.regionWinners[ri].seed}) ${res.regionWinners[ri].name}`;
          stats.regionWinnerCounts[ri][key]=(stats.regionWinnerCounts[ri][key]||0)+1;
          stats.f4SeedCounts[res.regionWinners[ri].seed]=(stats.f4SeedCounts[res.regionWinners[ri].seed]||0)+1;
        }
        for(const [tName,depth] of Object.entries(res.teamDepths)){
          if(!stats.teamDepthCounts[tName]) stats.teamDepthCounts[tName]=new Array(7).fill(0);
          stats.teamDepthCounts[tName][depth]++;
        }
        const seen={};
        for(const u of res.upsetTeams){
          stats.teamUpsetCounts[u.name]=(stats.teamUpsetCounts[u.name]||0)+1;
          if(!seen[u.name]){stats.teamUpsetSims[u.name]=(stats.teamUpsetSims[u.name]||0)+1;seen[u.name]=true;}
          if(!stats.teamUpsetByRound[u.name])stats.teamUpsetByRound[u.name]={};
          stats.teamUpsetByRound[u.name][u.round]=(stats.teamUpsetByRound[u.name][u.round]||0)+1;
        }
      }
      completed=end;setDone(completed);
      if(completed>=target){setRunning(false);setElapsed(Math.round(performance.now()-startRef.current));setResults({...stats});}
      else setTimeout(batch,0);
    }
    setTimeout(batch,10);
  },[target,mode,upsetBias,live.locked,live.lockedFF,injuryMap]);

  // Derived data
  const pct=target>0?Math.round((done/target)*100):0;
  const champData=results?Object.entries(results.champCounts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,count])=>({name,count,pct:((count/results.total)*100).toFixed(2)})):[];
  const avgUpsets=results?(results.upsetTotal/results.total).toFixed(2):0;

  const bracketData=results?Object.fromEntries(REGION_NAMES.map(rName=>[rName,
    Array.from({length:16},(_,si)=>{
      const seed=SEED_ORDER[si];const team=TEAMS[rName][seed];
      const counts=results.teamDepthCounts[team.name]||new Array(7).fill(0);
      const advPcts=Array.from({length:7},(_,d)=>{let sum=0;for(let dd=d;dd<7;dd++)sum+=counts[dd];return(sum/results.total)*100;});
      return{name:team.name,seed,advPcts,adjEM:getAdjEM(team,injuryMap)};
    })
  ])):null;

  const upsetTeamData=useMemo(()=>{
    if(!results) return [];
    return Object.entries(results.teamUpsetSims).map(([name,simCount])=>{
      const info=TEAM_LOOKUP[name]||{seed:"?",region:"?"};
      const byRound=results.teamUpsetByRound[name]||{};
      const roundPcts={};
      for(const r of ALL_ROUNDS) roundPcts[r]=byRound[r]?((byRound[r]/results.total)*100).toFixed(2):null;
      return{name,seed:info.seed,region:info.region,simCount,simPct:((simCount/results.total)*100).toFixed(2),roundPcts};
    }).sort((a,b)=>b.simCount-a.simCount);
  },[results]);

  const currentMatchups=useMemo(()=>getCurrentMatchups(live.locked,live.lockedFF,injuryMap),[live.locked,live.lockedFF,injuryMap]);
  const mismatchGames=currentMatchups.filter(g=>g.mismatch);
  const closeGames=currentMatchups.filter(g=>!g.mismatch&&parseFloat(g.loWinPct)>=35).sort((a,b)=>parseFloat(b.loWinPct)-parseFloat(a.loWinPct));

  // Betting data — built from bracket matchups, ESPN odds overlaid
  const bettingData=useMemo(()=>{
    // Build lookup of ALL ESPN games (not just scheduled) by team name
    const espnByTeam={};
    for(const g of live.liveGames){espnByTeam[g.home.name]=g;espnByTeam[g.away.name]=g;}
    return currentMatchups.map(m=>{
      const hiInfo=TEAM_LOOKUP[m.hiName],loInfo=TEAM_LOOKUP[m.loName];
      if(!hiInfo||!loInfo)return null;
      const hiTeam=hiInfo.team,loTeam=loInfo.team;
      const hiEM=getAdjEM(hiTeam,injuryMap),loEM=getAdjEM(loTeam,injuryMap);
      const mSpread=adjustedSpread(-((hiEM-loEM)*(hiTeam.adjT+loTeam.adjT)/200));
      const hiWinP=winProb(hiEM,hiTeam.adjT,loEM,loTeam.adjT,hiTeam.oRk,hiTeam.dRk,loTeam.oRk,loTeam.dRk);
      const loWinP=1-hiWinP;
      const espnGame=espnByTeam[m.hiName]||espnByTeam[m.loName];
      const espnOdds=espnGame?.odds;
      const oddsKey=[m.hiName,m.loName].sort().join("|");
      const knownOdds=KNOWN_ODDS[oddsKey];
      const cachedOddsEntry=(live.cachedOdds||{})[oddsKey]||(live.cachedOdds||{})[espnGame?.id];
      const hasAnyOdds=!!(espnOdds||cachedOddsEntry||knownOdds);
      let marketSpread=null,hiML=null,loML=null,overUnder=null;
      // Layer 1: KNOWN_ODDS (hardcoded baseline)
      if(knownOdds){
        marketSpread=knownOdds.spread;
        const kHiIsHome=knownOdds.home===m.hiName;
        hiML=kHiIsHome?knownOdds.homeML:knownOdds.awayML;
        loML=kHiIsHome?knownOdds.awayML:knownOdds.homeML;
        if(marketSpread!=null&&!kHiIsHome)marketSpread=-marketSpread;
      }
      // Layer 2: localStorage cache (auto-captured, persists across sessions)
      if(cachedOddsEntry){
        if(cachedOddsEntry.spread!=null)marketSpread=parseFloat(cachedOddsEntry.spread);
        const cHome=cachedOddsEntry._home||(espnGame?.home?.name);
        const cHiIsHome=cHome===m.hiName;
        if(cachedOddsEntry.homeML!=null){
          hiML=cHiIsHome?parseInt(cachedOddsEntry.homeML):parseInt(cachedOddsEntry.awayML);
          loML=cHiIsHome?parseInt(cachedOddsEntry.awayML):parseInt(cachedOddsEntry.homeML);
        }
        if(cachedOddsEntry.spread!=null&&!cHiIsHome)marketSpread=-marketSpread;
      }
      // Layer 3: ESPN live odds (freshest, overrides everything)
      if(espnGame&&espnOdds){
        if(espnOdds.spread!=null)marketSpread=parseFloat(espnOdds.spread);
        overUnder=espnOdds.overUnder!=null?parseFloat(espnOdds.overUnder):null;
        const hiIsHome=espnGame.home.name===m.hiName;
        if(espnOdds.homeML!=null){
          hiML=hiIsHome?parseInt(espnOdds.homeML):parseInt(espnOdds.awayML);
          loML=hiIsHome?parseInt(espnOdds.awayML):parseInt(espnOdds.homeML);
        }
        if(espnOdds.spread!=null&&!hiIsHome)marketSpread=-marketSpread;
      }
      // Spread edge: convert market spread to implied win probability, compare to model
      let spreadEdgePts=marketSpread!=null?marketSpread-mSpread:null;
      let spreadEdgePct=null;
      if(marketSpread!=null){
        const sd=gameSD(hiTeam.oRk,hiTeam.dRk,loTeam.oRk,loTeam.dRk);
        const marketHiWinP=normalCDF(-marketSpread/sd); // market implied prob for hi seed
        spreadEdgePct=(hiWinP-marketHiWinP)*100; // positive = model likes hi seed more
      }
      let hiMLEdge=null,loMLEdge=null,hiKelly=null,loKelly=null;
      if(hiML){const ip=oddsToProb(hiML);hiMLEdge=ip!=null?((hiWinP-ip)*100):null;const d=americanToDecimal(hiML);hiKelly=d?kellyCriterion(hiWinP,d):null;}
      if(loML){const ip=oddsToProb(loML);loMLEdge=ip!=null?((loWinP-ip)*100):null;const d=americanToDecimal(loML);loKelly=d?kellyCriterion(loWinP,d):null;}
      // All edges now in % — pick the best
      const hiSpreadEdgePct=spreadEdgePct!=null?spreadEdgePct:null;
      const loSpreadEdgePct=spreadEdgePct!=null?-spreadEdgePct:null;
      const maxEdge=Math.max(Math.abs(hiMLEdge||0),Math.abs(loMLEdge||0),Math.abs(spreadEdgePct||0));
      const absSpread=marketSpread!=null?Math.abs(marketSpread):999;
      // Vig-adjusted ML edge (subtract ~2.3% standard vig from each side)
      const vigAdj=2.3;
      const hiMLEdgeAdj=hiMLEdge!=null?hiMLEdge-vigAdj:null;
      const loMLEdgeAdj=loMLEdge!=null?loMLEdge-vigAdj:null;
      const maxEdgeAdj=Math.max(hiMLEdgeAdj||0,loMLEdgeAdj||0,Math.abs(spreadEdgePct||0));
      let rating="NO LINE";
      if(hasAnyOdds){
        if(absSpread<=10&&maxEdgeAdj>=3) rating="SHARP";
        else if(maxEdgeAdj>=8) rating="STRONG VALUE";
        else if(maxEdgeAdj>=4) rating="VALUE";
        else if(maxEdgeAdj>=1.5) rating="+EV";
        else rating="FAIR";
      }
      // Determine value team from best available edge (all in %)
      // SPREAD CAP: Don't pick spreads over ±15 — model unreliable at extremes
      const SPREAD_CAP=15;
      const spreadCapped=marketSpread!=null&&Math.abs(marketSpread)>SPREAD_CAP;
      let valueTeam=null,valueSide=null,bestEdge=0,bestKelly=null,bestType=null,bestLine=null;
      const edges=[
        {side:"hi",team:m.hiName,edge:hiMLEdge,kelly:hiKelly,type:"ML",line:hiML},
        {side:"lo",team:m.loName,edge:loMLEdge,kelly:loKelly,type:"ML",line:loML},
        ...(!spreadCapped?[
          {side:"hi",team:m.hiName,edge:hiSpreadEdgePct!=null&&hiSpreadEdgePct>0?hiSpreadEdgePct:null,kelly:null,type:"spread",line:marketSpread},
          {side:"lo",team:m.loName,edge:loSpreadEdgePct!=null&&loSpreadEdgePct>0?loSpreadEdgePct:null,kelly:null,type:"spread",line:marketSpread},
        ]:[]),
      ];
      for(const e of edges){if(e.edge!=null&&e.edge>bestEdge){bestEdge=e.edge;valueTeam=e.team;valueSide=e.side;bestKelly=e.kelly;bestType=e.type;bestLine=e.line;}}
      return{key:`${m.region}-${m.round}-${m.hiSeed}-${m.loSeed}`,round:m.round,region:m.region,hiSeed:m.hiSeed,loSeed:m.loSeed,hiName:m.hiName,loName:m.loName,modelSpread:mSpread,hiWinP,loWinP,marketSpread,hiML,loML,overUnder,spreadEdgePts,spreadEdgePct,hiMLEdge,loMLEdge,hiKelly,loKelly,rating,hasOdds:hasAnyOdds,valueTeam,bestEdge,bestKelly,bestType,bestLine,espnStatus:espnGame?.status||null};
    }).filter(Boolean);
  },[currentMatchups,live.liveGames,injuryMap,live.cachedOdds]);

  // Filter to only upcoming (scheduled) games for betting tab
  const upcomingBets=useMemo(()=>bettingData.filter(g=>g.espnStatus!=="live"&&g.espnStatus!=="final"),[bettingData]);

  // Picks archive — retroactively grade every completed game
  const picksRecord=useMemo(()=>{
    try {
    const espnByTeam={};
    for(const g of live.liveGames){
      if(g.status!=="final"||!g.winner)continue;
      espnByTeam[g.home.name]=g;
      espnByTeam[g.away.name]=g;
    }

    const picks=[];
    // Check all 64 teams to find completed matchups
    for(const r of REGION_NAMES){
      for(let s=1;s<=16;s++){
        const teamName=TEAMS[r][s].name;
        const espnGame=espnByTeam[teamName];
        if(!espnGame)continue;
        // Avoid processing the same game twice
        const gameKey=espnGame.id;
        if(picks.some(p=>p.gameId===gameKey))continue;

        const homeName=espnGame.home.name,awayName=espnGame.away.name;
        const homeInfo=TEAM_LOOKUP[homeName],awayInfo=TEAM_LOOKUP[awayName];
        if(!homeInfo||!awayInfo)continue;

        // Determine hi/lo seed
        const hiSeed=Math.min(homeInfo.seed,awayInfo.seed);
        const loSeed=Math.max(homeInfo.seed,awayInfo.seed);
        const hiName=homeInfo.seed<=awayInfo.seed?homeName:awayName;
        const loName=homeInfo.seed<=awayInfo.seed?awayName:homeName;
        const hiTeam=TEAM_LOOKUP[hiName].team,loTeam=TEAM_LOOKUP[loName].team;

        // Model calculations
        const hiEM=getAdjEM(hiTeam,injuryMap),loEM=getAdjEM(loTeam,injuryMap);
        const mSpread=adjustedSpread(-((hiEM-loEM)*(hiTeam.adjT+loTeam.adjT)/200));
        const hiWinP=winProb(hiEM,hiTeam.adjT,loEM,loTeam.adjT,hiTeam.oRk,hiTeam.dRk,loTeam.oRk,loTeam.dRk);
        const loWinP=1-hiWinP;

        // Market odds — KNOWN_ODDS (hardcoded, always available) → ESPN live → cached
        const oddsKey=[homeName,awayName].sort().join("|");
        const knownOdds=KNOWN_ODDS[oddsKey];
        const espnOdds=espnGame.odds;
        const cachedTeamKey=[homeName,awayName].sort().join("|");
        const cachedOddsEntry=(live.cachedOdds||{})[espnGame.id]||(live.cachedOdds||{})[cachedTeamKey];
        const anyOdds=espnOdds||cachedOddsEntry||knownOdds;
        if(!anyOdds)continue;

        // Determine spread and MLs — normalize to hi seed perspective
        // Priority: KNOWN_ODDS → localStorage cache → ESPN live (each layer overrides)
        let marketSpread=null,hiML=null,loML=null;
        if(knownOdds){
          marketSpread=knownOdds.spread;
          const knownHiIsHome=knownOdds.home===hiName;
          hiML=knownHiIsHome?knownOdds.homeML:knownOdds.awayML;
          loML=knownHiIsHome?knownOdds.awayML:knownOdds.homeML;
          if(marketSpread!=null&&!knownHiIsHome)marketSpread=-marketSpread;
        }
        // localStorage cached odds override
        if(cachedOddsEntry){
          if(cachedOddsEntry.spread!=null)marketSpread=parseFloat(cachedOddsEntry.spread);
          const cHome=cachedOddsEntry._home||espnGame.home.name;
          const cHiIsHome=cHome===hiName;
          if(cachedOddsEntry.homeML!=null){
            hiML=cHiIsHome?parseInt(cachedOddsEntry.homeML):parseInt(cachedOddsEntry.awayML);
            loML=cHiIsHome?parseInt(cachedOddsEntry.awayML):parseInt(cachedOddsEntry.homeML);
          }
          if(cachedOddsEntry.spread!=null&&!cHiIsHome)marketSpread=-marketSpread;
        }
        // ESPN live odds override (freshest)
        if(espnOdds){
          if(espnOdds.spread!=null)marketSpread=parseFloat(espnOdds.spread);
          const espnHiIsHome=espnGame.home.name===hiName;
          if(espnOdds.homeML!=null){
            hiML=espnHiIsHome?parseInt(espnOdds.homeML):parseInt(espnOdds.awayML);
            loML=espnHiIsHome?parseInt(espnOdds.awayML):parseInt(espnOdds.homeML);
          }
          if(marketSpread!=null&&espnOdds.spread!=null&&!espnHiIsHome)marketSpread=-marketSpread;
        }

        // Compute edges
        let spreadEdgePct=null;
        if(marketSpread!=null){
          const sd=gameSD(hiTeam.oRk,hiTeam.dRk,loTeam.oRk,loTeam.dRk);
          const marketHiWinP=normalCDF(-marketSpread/sd);
          spreadEdgePct=(hiWinP-marketHiWinP)*100;
        }
        let hiMLEdge=null,loMLEdge=null;
        if(hiML){const ip=oddsToProb(hiML);hiMLEdge=ip!=null?((hiWinP-ip)*100):null;}
        if(loML){const ip=oddsToProb(loML);loMLEdge=ip!=null?((loWinP-ip)*100):null;}

        // Find best edge — cap spread picks at ±15
        const SPREAD_CAP=15;
        const spreadCapped=marketSpread!=null&&Math.abs(marketSpread)>SPREAD_CAP;
        const hiSpreadEdgePct=spreadEdgePct!=null?spreadEdgePct:null;
        const loSpreadEdgePct=spreadEdgePct!=null?-spreadEdgePct:null;
        let bestEdge=0,valueTeam=null,bestType=null,bestLine=null;
        const edges=[
          {team:hiName,edge:hiMLEdge,type:"ML",line:hiML},
          {team:loName,edge:loMLEdge,type:"ML",line:loML},
          ...(!spreadCapped?[
            {team:hiName,edge:hiSpreadEdgePct>0?hiSpreadEdgePct:null,type:"spread",line:marketSpread},
            {team:loName,edge:loSpreadEdgePct>0?loSpreadEdgePct:null,type:"spread",line:marketSpread},
          ]:[]),
        ];
        for(const e of edges){if(e.edge!=null&&e.edge>bestEdge){bestEdge=e.edge;valueTeam=e.team;bestType=e.type;bestLine=e.line;}}

        if(!valueTeam||bestEdge<=0)continue;

        // Grade the pick
        const hiIsHome=espnGame.home.name===hiName;
        const hiScore=hiIsHome?espnGame.home.score:espnGame.away.score;
        const loScore=hiIsHome?espnGame.away.score:espnGame.home.score;
        const actualMargin=hiScore-loScore;

        let result=null;
        if(bestType==="ML"){
          const mlWon=(espnGame.winner===valueTeam);
          if(mlWon){
            result="W";
          } else {
            // ML lost — check spread fallback (only if under cap)
            if(!spreadCapped){
              const valueIsHi=valueTeam===hiName;
              const spreadEdgeForValue=valueIsHi?hiSpreadEdgePct:loSpreadEdgePct;
              const CLOSE_THRESHOLD=3.0;
              if(spreadEdgeForValue!=null&&spreadEdgeForValue>0&&(bestEdge-spreadEdgeForValue)<=CLOSE_THRESHOLD&&marketSpread!=null){
                const teamSpread=valueIsHi?marketSpread:-marketSpread;
                const teamMargin=valueIsHi?actualMargin:-actualMargin;
                if(teamMargin+teamSpread>0){
                  bestType="spread";bestLine=marketSpread;bestEdge=spreadEdgeForValue;
                  result="W";
                } else if(teamMargin+teamSpread===0){
                  bestType="spread";bestLine=marketSpread;bestEdge=spreadEdgeForValue;
                  result="P";
                } else { result="L"; }
              } else { result="L"; }
            } else { result="L"; }
          }
        } else {
          const valueIsHi=valueTeam===hiName;
          const teamSpread=valueIsHi?marketSpread:-marketSpread;
          const teamMargin=valueIsHi?actualMargin:-actualMargin;
          if(teamMargin+teamSpread>0) result="W";
          else if(teamMargin+teamSpread===0) result="P";
          else result="L";
        }

        const absSpread=marketSpread!=null?Math.abs(marketSpread):999;
        let rating="";
        const vigAdj=2.3;
        const hiMLEdgeAdj=hiMLEdge!=null?hiMLEdge-vigAdj:null;
        const loMLEdgeAdj=loMLEdge!=null?loMLEdge-vigAdj:null;
        const maxEdgeAdj=Math.max(hiMLEdgeAdj||0,loMLEdgeAdj||0,Math.abs(spreadEdgePct||0));
        if(absSpread<=10&&maxEdgeAdj>=3)rating="SHARP";
        else if(maxEdgeAdj>=8)rating="STRONG VALUE";
        else if(maxEdgeAdj>=4)rating="VALUE";
        else if(maxEdgeAdj>=1.5)rating="+EV";
        else continue; // Skip — no actionable edge (was THIN EDGE)

        picks.push({
          gameId:gameKey,region:homeInfo.region,hiSeed,loSeed,hiName,loName,
          hiScore,loScore,
          valueTeam,bestType,bestLine,bestEdge,rating,result,
          marketSpread,actualMargin,
        });
      }
    }
    return picks;
    } catch(e) { console.error("picksRecord error:", e); return []; }
  },[live.liveGames,injuryMap,live.cachedOdds]);

  const recordW=picksRecord.filter(p=>p.result==="W").length;
  const recordL=picksRecord.filter(p=>p.result==="L").length;
  const recordP=picksRecord.filter(p=>p.result==="P").length;

  // P/L calculation — $100 flat bets, spreads at -110, ML at listed odds
  const recordPL=picksRecord.reduce((total,p)=>{
    if(p.result==="P")return total;
    if(p.result==="L")return total-100;
    // Win
    if(p.bestType==="ML"){
      const ml=p.bestLine;
      if(ml>0)return total+(100*(ml/100));
      else return total+(100*(100/Math.abs(ml)));
    } else {
      // Spread at -110
      return total+(100*(100/110));
    }
  },0);

  let lockedCount=0;
  for(const r of REGION_NAMES){const l=live.locked[r];for(const rd in l)for(const g in l[rd])if(l[rd][g]!=null)lockedCount++;}

  const Btn=({active,onClick,children,color})=>(<button onClick={onClick} style={{
    background:active?(color||C.accent):"transparent",border:`2px solid ${color||C.accent}`,color:active?"#fff":(color||C.accent),
    borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11,letterSpacing:0.5,
  }}>{children}</button>);

  const liveCount=live.liveGames.filter(g=>g.status==="live").length;
  const needsSim=tab==="bracket"||tab==="upsets"||tab==="champion";

  return (
    <>
      <Head>
        <title>Bracket Factory</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Outfit',sans-serif"}}>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 20px"}}>

          {/* Header */}
          <div style={{textAlign:"center",marginBottom:20}}>
            <h1 style={{fontSize:32,fontWeight:900,letterSpacing:-1,margin:0,background:`linear-gradient(135deg,${C.accent},${C.red})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>BRACKET FACTORY</h1>
            <p style={{color:C.textMuted,fontSize:12,margin:"6px 0 0"}}>
              KenPom-calibrated · Live scores via ESPN · {lockedCount} locked · {allInjuries.filter(i=>i.active).length} injuries tracked
              {live.isPolling&&<span style={{color:C.green,marginLeft:8}}>● POLLING</span>}
            </p>
          </div>

          {/* Injury Alert Banner — shows when new injuries are detected */}
          {(live.injuryAlerts||[]).length>0&&(
            <div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:800,color:C.red}}>🚨 NEW INJURY DETECTED</span>
                <button onClick={live.dismissAlerts} style={{background:"transparent",border:`1px solid ${C.red}`,color:C.red,borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>DISMISS</button>
              </div>
              {(live.injuryAlerts||[]).map((a,i)=>(
                <div key={i} style={{fontSize:10,color:C.text,fontFamily:"monospace",padding:"2px 0"}}>
                  <span style={{color:C.red,fontWeight:700}}>{a.status}</span>{" "}
                  <span style={{color:C.accent,fontWeight:700}}>{a.player}</span>{" "}
                  <span style={{color:C.textDim}}>({a.team})</span>{" "}
                  <span style={{color:C.textMuted}}>— {a.role}</span>{" "}
                  <span style={{color:C.red}}>EM: {a.emImpact}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live Score Ticker */}
          {liveCount>0&&(
            <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:12,padding:14,marginBottom:16,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{background:C.red,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:4,fontFamily:"monospace",animation:"pulse 2s infinite"}}>LIVE</span>
                <span style={{fontSize:13,fontWeight:700}}>{liveCount} game{liveCount!==1?"s":""} in progress</span>
              </div>
              <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:4}}>
                {live.liveGames.filter(g=>g.status==="live").map(g=>(
                  <div key={g.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",minWidth:200,flexShrink:0}}>
                    <div style={{fontSize:10,color:C.accent,fontWeight:700,marginBottom:6}}>{g.detail}</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:g.away.score>g.home.score?700:400,color:g.away.score>g.home.score?C.text:C.textDim}}>{g.away.seed&&<span style={{color:C.textMuted,marginRight:4}}>{g.away.seed}</span>}{g.away.name}</div>
                        <div style={{fontSize:12,fontWeight:g.home.score>g.away.score?700:400,color:g.home.score>g.away.score?C.text:C.textDim}}>{g.home.seed&&<span style={{color:C.textMuted,marginRight:4}}>{g.home.seed}</span>}{g.home.name}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:16,fontWeight:800,fontFamily:"monospace",color:g.away.score>g.home.score?C.accent:C.textDim}}>{g.away.score}</div>
                        <div style={{fontSize:16,fontWeight:800,fontFamily:"monospace",color:g.home.score>g.away.score?C.accent:C.textDim}}>{g.home.score}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:16}}>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={live.isPolling?live.stopPolling:live.startPolling} style={{background:live.isPolling?C.green:"transparent",border:`2px solid ${C.green}`,color:live.isPolling?"#fff":C.green,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11}}>{live.isPolling?"⏸ STOP LIVE":"▶ GO LIVE"}</button>
              <button onClick={live.fetchScores} style={{background:"transparent",border:`2px solid ${C.blue}`,color:C.blue,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11}}>↻ REFRESH</button>
              <div style={{width:1,height:24,background:C.border,margin:"0 4px"}}/>
              {[
                {key:"kenpom",label:"KENPOM",color:C.green,tip:"Pure KenPom probabilities — normalCDF with tempo-adjusted spreads."},
                {key:"contrarian",label:"CONTRARIAN",color:C.red,tip:"Shifts win probability toward upsets by the upset bias amount."},
                {key:"montecarlo",label:"MONTE CARLO",color:C.purple,tip:"Adds random noise (±15%) to each game's win probability."},
                {key:"mixed",label:"MIX",color:C.accent,tip:"Rotates through all three modes across sims."},
              ].map(m=>(<button key={m.key} title={m.tip} onClick={()=>!running&&setMode(m.key)} style={{background:mode===m.key?m.color:"transparent",border:`2px solid ${m.color}`,color:mode===m.key?"#fff":m.color,borderRadius:6,padding:"6px 10px",cursor:running?"not-allowed":"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:10,opacity:running?0.5:1}}>{m.label}</button>))}
              <select value={target} onChange={e=>setTarget(Number(e.target.value))} disabled={running} style={{background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"5px 8px",fontFamily:"monospace",fontSize:11}}>
                {[10000,100000,500000,1000000].map(n=><option key={n} value={n}>{n.toLocaleString()}</option>)}
              </select>
              <div style={{display:"flex",alignItems:"center",gap:6}} title="How much to shift win probability toward the underdog in Contrarian and Mix modes">
                <span style={{fontSize:9,color:C.textMuted,fontWeight:700,whiteSpace:"nowrap"}}>UPSET BIAS</span>
                <input type="range" min="0.01" max="0.5" step="0.01" value={upsetBias} onChange={e=>setUpsetBias(parseFloat(e.target.value))} disabled={running} style={{width:80,accentColor:C.red,cursor:running?"not-allowed":"pointer"}}/>
                <span style={{fontSize:10,color:C.red,fontWeight:700,fontFamily:"monospace",minWidth:28}}>{Math.round(upsetBias*100)}%</span>
                <span style={{fontSize:8,color:C.textMuted,whiteSpace:"nowrap"}}>(default 5%)</span>
              </div>
              <div style={{flex:1}}/>
              {!running?(<button onClick={generate} style={{background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1}}>SIMULATE {target.toLocaleString()}</button>
              ):(<button onClick={()=>{cancelRef.current=true}} style={{background:C.red,border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1}}>CANCEL</button>)}
            </div>
            {running&&(<div style={{marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textDim,marginBottom:3,fontFamily:"monospace"}}><span>{done.toLocaleString()} / {target.toLocaleString()}</span><span style={{color:C.accent}}>{pct}%</span></div>
              <div style={{height:5,background:C.card,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.accent},${C.purple},${C.accent})`,backgroundSize:"200% 100%",borderRadius:3,transition:"width 0.15s linear",animation:"shimmer 1.5s ease-in-out infinite"}}/></div>
            </div>)}
            {live.error&&<div style={{marginTop:8,fontSize:11,color:C.red}}>⚠ {live.error}</div>}
          </div>

          {/* Summary (only if sim has run) */}
          {results&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",marginBottom:14,display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
              <div><div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>SIMULATED</div><div style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:"monospace"}}>{results.total.toLocaleString()}</div></div>
              <div><div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>AVG UPSETS</div><div style={{fontSize:22,fontWeight:800,color:C.red,fontFamily:"monospace"}}>{avgUpsets}</div><div style={{fontSize:9,color:C.textMuted}}>historical avg: ~8.5</div></div>
              <div><div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>BEST CHAMPION</div><div style={{fontSize:18,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{champData[0]?.name}</div><div style={{fontSize:9,color:C.textMuted}}>{champData[0]?.pct}%</div></div>
              <div><div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>LOCKED</div><div style={{fontSize:22,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{lockedCount}</div></div>
            </div>
          )}

          {/* Tabs — always visible */}
          <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
            {[{key:"live",label:"SCOREBOARD"},{key:"bracket",label:"BRACKET"},{key:"upsets",label:"UPSET MAKERS"},{key:"betting",label:"BETTING"},{key:"record",label:"RECORD"+(picksRecord.length>0?` (${recordW}-${recordL})`:"")},{key:"champion",label:"CHAMPIONS"}].map(t=>
              <Btn key={t.key} active={tab===t.key} onClick={()=>setTab(t.key)} color={t.key==="betting"?C.yellow:t.key==="record"?C.green:C.blue}>{t.label}</Btn>
            )}
          </div>

          {/* "Run sim first" message for sim-dependent tabs */}
          {needsSim&&!results&&!running&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:C.textMuted}}>
              <div style={{fontSize:14}}>Run a simulation first to see {tab==="bracket"?"bracket advancement data":tab==="upsets"?"upset analysis":"championship odds"}.</div>
              <div style={{fontSize:11,marginTop:6}}>Click <strong style={{color:C.accent}}>SIMULATE</strong> above.</div>
            </div>
          )}

          {/* SCOREBOARD TAB */}
          {tab==="live"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {["live","scheduled","final"].map(status=>{
                const games=live.liveGames.filter(g=>g.status===status);
                if(!games.length)return null;
                const label={final:"FINAL",live:"IN PROGRESS",scheduled:"UPCOMING"}[status];
                const color={final:C.green,live:C.red,scheduled:C.textMuted}[status];
                return(
                  <div key={status} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:14}}>
                    <div style={{fontSize:10,fontWeight:800,color,letterSpacing:1,marginBottom:10}}>{label} ({games.length})</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                      {games.map(g=>(
                        <div key={g.id} style={{background:C.card,border:`1px solid ${status==="live"?"rgba(239,68,68,0.3)":C.border}`,borderRadius:8,padding:"10px 12px"}}>
                          {status!=="scheduled"&&<div style={{fontSize:9,color:status==="live"?C.red:C.textMuted,fontWeight:700,marginBottom:4}}>{g.detail}</div>}
                          {status==="scheduled"&&<div style={{fontSize:9,color:C.textMuted,marginBottom:4}}>{new Date(g.startTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <div>
                              <div style={{fontSize:11,fontWeight:status!=="scheduled"&&g.away.score>g.home.score?700:400,color:status!=="scheduled"&&g.away.score>g.home.score?C.text:C.textDim}}>{g.away.seed&&<span style={{color:C.textMuted,marginRight:3}}>{g.away.seed}</span>}{g.away.name}</div>
                              <div style={{fontSize:11,fontWeight:status!=="scheduled"&&g.home.score>g.away.score?700:400,color:status!=="scheduled"&&g.home.score>g.away.score?C.text:C.textDim}}>{g.home.seed&&<span style={{color:C.textMuted,marginRight:3}}>{g.home.seed}</span>}{g.home.name}</div>
                            </div>
                            {status!=="scheduled"&&<div style={{textAlign:"right",fontFamily:"monospace",fontWeight:800}}>
                              <div style={{color:g.away.score>g.home.score?C.accent:C.textDim}}>{g.away.score}</div>
                              <div style={{color:g.home.score>g.away.score?C.accent:C.textDim}}>{g.home.score}</div>
                            </div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {live.liveGames.length===0&&(<div style={{textAlign:"center",padding:"40px 20px",color:C.textMuted}}><div style={{fontSize:14}}>No games loaded. Click <strong>GO LIVE</strong> or <strong>REFRESH</strong> to pull scores.</div></div>)}
            </div>
          )}

          {/* BRACKET TAB */}
          {tab==="bracket"&&bracketData&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {REGION_NAMES.map(rName=>{
                const teams=bracketData[rName];if(!teams)return null;
                const roundCols=[{label:"R64",idx:1},{label:"R32",idx:2},{label:"S16",idx:3},{label:"E8",idx:4},{label:"F4",idx:5},{label:"CHAMP",idx:6}];
                return(
                  <div key={rName} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
                    <h3 style={{fontSize:13,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 12px"}}>{rName.toUpperCase()} REGION</h3>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
                        <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                          <th style={{padding:"6px",textAlign:"left",color:C.textMuted,fontSize:9,width:160}}>TEAM</th>
                          {roundCols.map(rc=><th key={rc.label} style={{padding:"6px",textAlign:"left",color:C.accent,fontSize:9}}>{rc.label}</th>)}
                        </tr></thead>
                        <tbody>{Array.from({length:8}).map((_,pi)=>[teams[pi*2],teams[pi*2+1]].map((t,ti)=>{
                          const injs=INJURY_DISPLAY[t.name];
                          return(
                          <tr key={`${pi}-${ti}`} style={{borderBottom:ti===1?`2px solid rgba(42,53,80,0.6)`:`1px solid rgba(42,53,80,0.25)`}}>
                            <td style={{padding:"4px 6px"}}>
                              <span style={{color:C.textMuted,marginRight:4}}>{t.seed}</span>
                              <span style={{color:t.advPcts[1]>50?C.text:C.textDim,fontWeight:t.advPcts[5]>5?700:400}}>{t.name}</span>
                              {injs&&<span style={{color:C.red,fontSize:8,marginLeft:3,cursor:"help"}} title={injs.map(i=>`${i.player}: ${i.type} (${i.emAdj})`).join(", ")}>🩹</span>}
                            </td>
                            {roundCols.map(rc=>{const p=t.advPcts[rc.idx];const col=p>=70?C.green:p>=40?C.blue:p>=15?C.accent:p>=3?C.textDim:"rgba(100,116,139,0.3)";return(
                              <td key={rc.label} style={{padding:"4px"}}><div style={{display:"flex",alignItems:"center",gap:4}}>
                                <div style={{height:8,borderRadius:2,background:col,width:`${Math.min(p,100)*0.7}px`,minWidth:p>0.1?2:0,opacity:p<1?0.4:0.8,flexShrink:0}}/>
                                <span style={{color:p>=15?C.text:C.textDim,fontWeight:p>=50?700:400,fontSize:p<0.1?8:10}}>{p>=0.1?p.toFixed(1)+"%":p>0?"<0.1%":"—"}</span>
                              </div></td>
                            );})}
                          </tr>);
                        }))}</tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* UPSET MAKERS TAB */}
          {tab==="upsets"&&results&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
              <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 4px"}}>UPSET MAKERS — ROUND-BY-ROUND PROBABILITY</h3>
              <p style={{fontSize:10,color:C.textMuted,margin:"0 0 14px"}}>% of {results.total.toLocaleString()} sims where this team pulled a 5+ seed-line upset. "ANY" = at least one upset in any round.</p>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                  <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                    {["#","TEAM","SEED","REGION","R64","R32","S16","E8","F4","NCG","ANY"].map(h=>(
                      <th key={h} style={{padding:"7px 6px",textAlign:h==="#"?"center":"left",color:["R64","R32","S16","E8","F4","NCG"].includes(h)?C.accent:C.textMuted,fontWeight:700,fontSize:9,letterSpacing:1,borderRight:h==="REGION"||h==="NCG"?`1px solid ${C.border}`:"none"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{upsetTeamData.map((d,i)=>{
                    const maxRP=Math.max(...ALL_ROUNDS.map(r=>parseFloat(d.roundPcts[r]||0)));
                    return(<tr key={d.name} style={{borderBottom:`1px solid rgba(42,53,80,0.35)`,background:i%2===0?"transparent":"rgba(255,255,255,0.015)"}}>
                      <td style={{padding:"5px 6px",color:C.textMuted,textAlign:"center",fontSize:10}}>{i+1}</td>
                      <td style={{padding:"5px 6px",color:i<5?C.accent:C.text,fontWeight:i<5?700:400}}>{d.name}</td>
                      <td style={{padding:"5px 6px",color:C.textDim}}>#{d.seed}</td>
                      <td style={{padding:"5px 6px",color:C.textMuted,fontSize:9,borderRight:`1px solid ${C.border}`}}>{d.region}</td>
                      {ALL_ROUNDS.map(r=>{const val=d.roundPcts[r];const nv=parseFloat(val||0);const intensity=maxRP>0?nv/maxRP:0;const isLast=r==="NCG";
                        return(<td key={r} style={{padding:"5px 6px",borderRight:isLast?`1px solid ${C.border}`:"none"}}>
                          {val?(<div style={{display:"flex",alignItems:"center",gap:4}}>
                            <div style={{width:`${Math.max(4,intensity*40)}px`,height:8,borderRadius:2,flexShrink:0,background:nv>=20?C.red:nv>=10?C.accent:nv>=3?C.blue:C.textMuted,opacity:Math.max(0.4,intensity)}}/>
                            <span style={{color:nv>=20?C.red:nv>=10?C.accent:nv>=3?C.text:C.textMuted,fontWeight:nv>=10?700:400,fontSize:10}}>{val}%</span>
                          </div>):(<span style={{color:"rgba(100,116,139,0.3)",fontSize:9}}>—</span>)}
                        </td>);
                      })}
                      <td style={{padding:"5px 6px"}}><span style={{color:C.green,fontWeight:700,fontSize:11}}>{d.simPct}%</span></td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>

              {mismatchGames.length>0&&(<div style={{marginTop:24}}>
                <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.red,margin:"0 0 4px"}}>KENPOM MISMATCHES</h3>
                <p style={{fontSize:10,color:C.textMuted,margin:"0 0 12px"}}>Lower seed has HIGHER AdjEM. Auto-updates as rounds advance.</p>
                <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                  <thead><tr style={{borderBottom:`2px solid ${C.red}`}}>{["ROUND","REGION","MATCHUP","HI EM","LO EM","GAP","MODEL WIN%","VERDICT"].map(h=><th key={h} style={{padding:"8px",textAlign:"left",color:C.textMuted,fontWeight:700,fontSize:9}}>{h}</th>)}</tr></thead>
                  <tbody>{mismatchGames.sort((a,b)=>parseFloat(b.emGap)-parseFloat(a.emGap)).map(g=>{const sp=parseFloat(g.loWinPct);return(
                    <tr key={`${g.region}-${g.round}-${g.hiSeed}`} style={{borderBottom:`1px solid rgba(42,53,80,0.4)`,background:"rgba(239,68,68,0.04)"}}>
                      <td style={{padding:"6px 8px"}}><span style={{background:"rgba(239,68,68,0.15)",color:C.red,padding:"2px 6px",borderRadius:3,fontWeight:700,fontSize:9}}>{g.round}</span></td>
                      <td style={{padding:"6px 8px",color:C.textMuted,fontSize:10}}>{g.region}</td>
                      <td style={{padding:"6px 8px"}}><span style={{color:C.textDim}}>#{g.hiSeed} {g.hiName}</span><span style={{color:C.textMuted,margin:"0 4px"}}>vs</span><span style={{color:C.accent,fontWeight:700}}>#{g.loSeed} {g.loName}</span></td>
                      <td style={{padding:"6px 8px",color:C.textDim}}>+{g.hiEM.toFixed(1)}</td>
                      <td style={{padding:"6px 8px",color:C.green,fontWeight:700}}>+{g.loEM.toFixed(1)}</td>
                      <td style={{padding:"6px 8px",color:C.green,fontWeight:700}}>+{g.emGap}</td>
                      <td style={{padding:"6px 8px",color:sp>=50?C.green:C.accent,fontWeight:700}}>{g.loWinPct}%</td>
                      <td style={{padding:"6px 8px"}}><span style={{background:sp>=50?"rgba(34,197,94,0.15)":"rgba(249,115,22,0.15)",border:`1px solid ${sp>=50?"rgba(34,197,94,0.3)":"rgba(249,115,22,0.3)"}`,color:sp>=50?C.green:C.accent,padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700}}>{sp>=50?"PICK THE UPSET":"LEAN UPSET"}</span></td>
                    </tr>);})}</tbody>
                </table></div>
              </div>)}

              {closeGames.length>0&&(<div style={{marginTop:24}}>
                <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 4px"}}>VULNERABLE FAVORITES (35%+)</h3>
                <p style={{fontSize:10,color:C.textMuted,margin:"0 0 12px"}}>KenPom favors the higher seed, but the gap is slim. Updates as rounds advance.</p>
                <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                  <thead><tr style={{borderBottom:`2px solid ${C.accent}`}}>{["ROUND","REGION","MATCHUP","HI EM","LO EM","GAP","LO SEED WIN%"].map(h=><th key={h} style={{padding:"8px",textAlign:"left",color:C.textMuted,fontWeight:700,fontSize:9}}>{h}</th>)}</tr></thead>
                  <tbody>{closeGames.map(g=>{const sp=parseFloat(g.loWinPct);return(
                    <tr key={`${g.region}-${g.round}-${g.hiSeed}`} style={{borderBottom:`1px solid rgba(42,53,80,0.4)`}}>
                      <td style={{padding:"6px 8px"}}><span style={{background:"rgba(249,115,22,0.15)",color:C.accent,padding:"2px 6px",borderRadius:3,fontWeight:700,fontSize:9}}>{g.round}</span></td>
                      <td style={{padding:"6px 8px",color:C.textMuted,fontSize:10}}>{g.region}</td>
                      <td style={{padding:"6px 8px"}}><span style={{color:C.textDim}}>#{g.hiSeed} {g.hiName}</span><span style={{color:C.textMuted,margin:"0 4px"}}>vs</span><span style={{color:C.text,fontWeight:600}}>#{g.loSeed} {g.loName}</span></td>
                      <td style={{padding:"6px 8px",color:C.green}}>+{g.hiEM.toFixed(1)}</td>
                      <td style={{padding:"6px 8px",color:C.textDim}}>+{g.loEM.toFixed(1)}</td>
                      <td style={{padding:"6px 8px",color:C.textMuted}}>{g.emGap}</td>
                      <td style={{padding:"6px 8px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{height:10,borderRadius:2,background:sp>=45?C.accent:C.blue,opacity:0.7,width:`${sp}%`,maxWidth:80,minWidth:4}}/><span style={{color:sp>=45?C.accent:C.blue,fontWeight:sp>=45?700:400}}>{g.loWinPct}%</span></div></td>
                    </tr>);})}</tbody>
                </table></div>
              </div>)}
            </div>
          )}

          {/* BETTING TAB — works without sim */}
          {tab==="betting"&&(
            <div style={{background:C.surface,border:`1px solid rgba(234,179,8,0.25)`,borderRadius:12,padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.yellow,margin:0}}>BETTING VALUE FINDER</h3>
                <button onClick={live.fetchScores} style={{background:C.yellow,border:"none",color:"#000",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:10}}>↻ REFRESH LINES</button>
              </div>
              <p style={{fontSize:10,color:C.textMuted,margin:"4px 0 10px"}}>
                Model vs market edge, vig-adjusted (~2.3% standard juice removed). <span style={{color:C.yellow}}>SHARP</span> = sweet spot (spread {"<"}10, 3%+ real edge). <span style={{color:C.green}}>+EV</span> = clears vig. Spreads capped at ±15.
                {live.lastUpdate&&<span style={{color:C.textDim,marginLeft:6}}>Updated: {new Date(live.lastUpdate).toLocaleTimeString()}</span>}
              </p>

              {/* Rating filter */}
              <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:9,color:C.textMuted,fontWeight:700,marginRight:2}}>RATING:</span>
                {["ALL","SHARP","+EV","STRONG VALUE","VALUE","FAIR","NO LINE"].map(f=>{
                  const ct=f==="ALL"?upcomingBets.length:upcomingBets.filter(g=>g.rating===f).length;
                  if(f!=="ALL"&&ct===0)return null;
                  const col=f==="SHARP"?C.yellow:f==="+EV"?C.green:f==="STRONG VALUE"?C.green:f==="VALUE"?C.blue:f==="FAIR"?C.textDim:C.textMuted;
                  return(<button key={f} onClick={()=>setBettingFilter(f)} style={{
                    background:bettingFilter===f?(f==="ALL"?C.yellow:col):"transparent",
                    border:`1px solid ${f==="ALL"?C.yellow:col}`,
                    color:bettingFilter===f?"#000":(f==="ALL"?C.yellow:col),
                    borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:9,
                  }}>{f} ({ct})</button>);
                })}
              </div>

              {/* Bet type filter */}
              <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:9,color:C.textMuted,fontWeight:700,marginRight:2}}>BET TYPE:</span>
                {[{key:"ALL",label:"ALL"},{key:"spread",label:"SPREAD"},{key:"ML",label:"MONEYLINE"}].map(f=>{
                  const ct=f.key==="ALL"?upcomingBets.filter(g=>g.hasOdds||g.bestEdge>0).length:upcomingBets.filter(g=>g.bestType===f.key).length;
                  return(<button key={f.key} onClick={()=>setBetTypeFilter(f.key)} style={{
                    background:betTypeFilter===f.key?C.blue:"transparent",
                    border:`1px solid ${C.blue}`,
                    color:betTypeFilter===f.key?"#fff":C.blue,
                    borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:9,
                  }}>{f.label} ({ct})</button>);
                })}
              </div>

              {(()=>{
                let filtered=bettingFilter==="ALL"?upcomingBets:upcomingBets.filter(g=>g.rating===bettingFilter);
                if(betTypeFilter!=="ALL")filtered=filtered.filter(g=>g.bestType===betTypeFilter);
                const sorted=[...filtered].sort((a,b)=>(b.bestEdge||0)-(a.bestEdge||0));
                return sorted.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {sorted.map(g=>{
                      const rc=g.rating==="SHARP"?C.yellow:g.rating==="+EV"?C.green:g.rating==="STRONG VALUE"?C.green:g.rating==="VALUE"?C.blue:C.textMuted;
                      return(
                        <div key={g.key} style={{background:C.card,border:`1px solid ${g.rating==="SHARP"?"rgba(234,179,8,0.4)":g.rating==="STRONG VALUE"||g.rating==="+EV"?"rgba(34,197,94,0.3)":g.rating==="VALUE"?"rgba(59,130,246,0.3)":C.border}`,borderRadius:10,padding:14}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{background:"rgba(234,179,8,0.12)",color:C.yellow,padding:"2px 6px",borderRadius:3,fontWeight:700,fontSize:9}}>{g.round}</span>
                              <span style={{fontSize:11,fontWeight:700}}>
                                <span style={{color:C.textDim}}>#{g.hiSeed} </span><span style={{color:C.text}}>{g.hiName}</span>
                                {INJURY_DISPLAY[g.hiName]&&<span style={{color:C.red,fontSize:8,marginLeft:2}}>🩹</span>}
                                <span style={{color:C.textMuted,margin:"0 6px"}}>vs</span>
                                <span style={{color:C.textDim}}>#{g.loSeed} </span><span style={{color:C.text}}>{g.loName}</span>
                                {INJURY_DISPLAY[g.loName]&&<span style={{color:C.red,fontSize:8,marginLeft:2}}>🩹</span>}
                              </span>
                              <span style={{fontSize:9,color:C.textMuted}}>{g.region}</span>
                            </div>
                            <span style={{background:`${rc}22`,border:`1px solid ${rc}44`,color:rc,padding:"3px 10px",borderRadius:4,fontSize:9,fontWeight:800}}>
                              {g.rating}{g.valueTeam&&g.rating!=="FAIR"&&g.rating!=="NO LINE"?` — ${g.valueTeam} (${g.bestType==="ML"?"Moneyline":"Spread"})`:""}
                            </span>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,fontSize:10,fontFamily:"monospace"}}>
                            <div style={{background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                              <div style={{fontSize:8,color:C.textMuted,fontWeight:700,marginBottom:3}}>MODEL SPREAD</div>
                              <div style={{color:C.accent,fontWeight:700,fontSize:14}}>{g.modelSpread>0?"+":""}{g.modelSpread.toFixed(1)}</div>
                              <div style={{fontSize:8,color:C.textMuted}}>{g.modelSpread<0?g.hiName:g.loName} by {Math.abs(g.modelSpread).toFixed(1)}</div>
                            </div>
                            <div style={{background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                              <div style={{fontSize:8,color:C.textMuted,fontWeight:700,marginBottom:3}}>MARKET SPREAD</div>
                              {g.marketSpread!=null?(<><div style={{color:C.text,fontWeight:700,fontSize:14}}>{g.hiName} {g.marketSpread>0?"+":""}{g.marketSpread.toFixed(1)}</div>{g.spreadEdgePct!=null&&<div style={{fontSize:8,color:Math.abs(g.spreadEdgePct)>=5?C.yellow:Math.abs(g.spreadEdgePct)>=2?C.accent:C.textMuted}}>{g.spreadEdgePts>0?"+":""}{g.spreadEdgePts.toFixed(1)} pts ({g.spreadEdgePct>0?"+":""}{g.spreadEdgePct.toFixed(1)}%)</div>}</>):(<div style={{color:C.textMuted,fontSize:11}}>No line yet</div>)}
                            </div>
                            <div style={{background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                              <div style={{fontSize:8,color:C.textMuted,fontWeight:700,marginBottom:3}}>MODEL WIN %</div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <div><div style={{color:g.hiWinP>g.loWinP?C.green:C.textDim,fontWeight:700}}>{(g.hiWinP*100).toFixed(1)}%</div><div style={{fontSize:8,color:C.textMuted}}>#{g.hiSeed}</div></div>
                                <div style={{textAlign:"right"}}><div style={{color:g.loWinP>g.hiWinP?C.green:C.textDim,fontWeight:700}}>{(g.loWinP*100).toFixed(1)}%</div><div style={{fontSize:8,color:C.textMuted}}>#{g.loSeed}</div></div>
                              </div>
                            </div>
                            <div style={{background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                              <div style={{fontSize:8,color:C.textMuted,fontWeight:700,marginBottom:3}}>MONEYLINE</div>
                              {(g.hiML||g.loML)?(<div style={{display:"flex",justifyContent:"space-between"}}>
                                <div><div style={{color:g.hiMLEdge&&g.hiMLEdge>2?C.yellow:C.text,fontWeight:700}}>{g.hiML>0?"+":""}{g.hiML||"—"}</div>{g.hiMLEdge!=null&&<div style={{fontSize:8,color:g.hiMLEdge>5?C.green:g.hiMLEdge>0?C.yellow:C.textMuted}}>+{g.hiMLEdge.toFixed(1)}%</div>}</div>
                                <div style={{textAlign:"right"}}><div style={{color:g.loMLEdge&&g.loMLEdge>2?C.yellow:C.text,fontWeight:700}}>{g.loML>0?"+":""}{g.loML||"—"}</div>{g.loMLEdge!=null&&<div style={{fontSize:8,color:g.loMLEdge>5?C.green:g.loMLEdge>0?C.yellow:C.textMuted}}>+{g.loMLEdge.toFixed(1)}%</div>}</div>
                              </div>):(<div style={{color:C.textMuted,fontSize:11}}>No line yet</div>)}
                            </div>
                          </div>
                          {g.hasOdds&&g.bestEdge>2&&(()=>{
                            let lineStr="";
                            if(g.bestType==="ML"){lineStr=(g.bestLine>0?"+":"")+g.bestLine+" ML";}
                            else{
                              // Spread: marketSpread is from hi seed perspective. Flip for lo seed.
                              const teamSpread=g.valueTeam===g.hiName?g.marketSpread:-g.marketSpread;
                              lineStr=(teamSpread>0?"+":"")+teamSpread.toFixed(1)+" spread";
                            }
                            return(<div style={{marginTop:10,padding:"8px 12px",background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.2)",borderRadius:6}}>
                              <span style={{fontSize:10,color:C.yellow,fontWeight:700}}>💰 {g.valueTeam} {lineStr}</span>
                              <span style={{fontSize:10,color:C.textDim,marginLeft:8}}>+{g.bestEdge.toFixed(1)}% edge</span>
                            </div>);
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ):(<div style={{textAlign:"center",padding:"30px 20px",color:C.textMuted}}><div style={{fontSize:13}}>{bettingFilter!=="ALL"?`No ${bettingFilter} games.`:"No upcoming matchups."}</div></div>);
              })()}

              <div style={{marginTop:16,padding:12,background:"rgba(234,179,8,0.06)",borderRadius:8,border:"1px solid rgba(234,179,8,0.15)"}}>
                <div style={{fontSize:10,color:C.yellow,fontWeight:700,marginBottom:4}}>DISCLAIMER</div>
                <div style={{fontSize:9,color:C.textMuted,lineHeight:1.6}}>
                  Statistical model, not financial advice. Edge = model probability minus market implied probability. Spread edge = difference in projected points. Does not account for public action or game-day factors.
                </div>
              </div>
            </div>
          )}

          {/* RECORD TAB */}
          {tab==="record"&&(
            <div style={{background:C.surface,border:`1px solid rgba(34,197,94,0.25)`,borderRadius:12,padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.green,margin:0}}>📊 PICKS RECORD</h3>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontFamily:"monospace",fontSize:18,fontWeight:800}}>
                    <span style={{color:C.green}}>{recordW}W</span>
                    <span style={{color:C.textMuted}}> - </span>
                    <span style={{color:C.red}}>{recordL}L</span>
                    {recordP>0&&<><span style={{color:C.textMuted}}> - </span><span style={{color:C.textDim}}>{recordP}P</span></>}
                  </span>
                  {(recordW+recordL)>0&&(
                    <span style={{fontFamily:"monospace",fontSize:14,color:recordW>recordL?C.green:recordW<recordL?C.red:C.textMuted,fontWeight:800}}>
                      {((recordW/(recordW+recordL))*100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>

              <p style={{fontSize:10,color:C.textMuted,margin:"0 0 14px"}}>
                Every completed tournament game graded against the model's best value pick. Spread picks graded on cover. ML picks graded on outright win. Spreads capped at ±15. Only Sharp, Strong Value, Value, and +EV picks tracked.
              </p>

              {picksRecord.length>0?(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
                    <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                      {["RESULT","MATCHUP","PICK","TYPE","LINE","EDGE","RATING","SCORE"].map(h=>(
                        <th key={h} style={{padding:"6px 8px",textAlign:"left",color:C.textMuted,fontWeight:700,fontSize:9}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{picksRecord.map(p=>{
                      const resultColor=p.result==="W"?C.green:p.result==="L"?C.red:C.textDim;
                      const ratingColor=p.rating==="SHARP"?C.yellow:p.rating==="+EV"?C.green:p.rating==="STRONG VALUE"?C.green:p.rating==="VALUE"?C.blue:C.textMuted;
                      const teamSpread=p.valueTeam===p.hiName?p.marketSpread:-p.marketSpread;
                      return(
                        <tr key={p.gameId} style={{borderBottom:`1px solid rgba(42,53,80,0.3)`}}>
                          <td style={{padding:"5px 8px"}}>
                            <span style={{background:`${resultColor}22`,border:`1px solid ${resultColor}44`,color:resultColor,padding:"2px 8px",borderRadius:3,fontWeight:800,fontSize:10}}>{p.result}</span>
                          </td>
                          <td style={{padding:"5px 8px",fontSize:10}}>
                            <span style={{color:C.textDim}}>#{p.hiSeed}</span> <span style={{color:C.text}}>{p.hiName}</span>
                            <span style={{color:C.textMuted,margin:"0 3px"}}>vs</span>
                            <span style={{color:C.textDim}}>#{p.loSeed}</span> <span style={{color:C.text}}>{p.loName}</span>
                          </td>
                          <td style={{padding:"5px 8px",color:C.accent,fontWeight:700}}>{p.valueTeam}</td>
                          <td style={{padding:"5px 8px",color:C.textDim}}>{p.bestType==="ML"?"ML":"Spread"}</td>
                          <td style={{padding:"5px 8px",color:C.text,fontWeight:600}}>
                            {p.bestType==="ML"?((p.bestLine>0?"+":"")+p.bestLine):((teamSpread>0?"+":"")+teamSpread.toFixed(1))}
                          </td>
                          <td style={{padding:"5px 8px",color:C.yellow,fontWeight:700}}>+{p.bestEdge.toFixed(1)}%</td>
                          <td style={{padding:"5px 8px"}}><span style={{color:ratingColor,fontSize:9,fontWeight:700}}>{p.rating}</span></td>
                          <td style={{padding:"5px 8px",color:C.textDim}}>{p.hiScore}-{p.loScore}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              ):(
                <div style={{textAlign:"center",padding:"40px 20px",color:C.textMuted}}>
                  <div style={{fontSize:14}}>No completed games with betting data yet.</div>
                  <div style={{fontSize:11,marginTop:6}}>Picks will appear here as tournament games go final. The model retroactively grades every completed game against its best value pick.</div>
                </div>
              )}
            </div>
          )}

          {/* CHAMPIONS TAB */}
          {tab==="champion"&&results&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
              <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 14px"}}>CHAMPIONSHIP WIN RATE (TOP 20)</h3>
              <div style={{height:380}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={champData} layout="vertical" margin={{left:105,right:20}}>
                    <XAxis type="number" tick={{fill:C.textMuted,fontSize:10}} tickFormatter={v=>`${v}%`}/>
                    <YAxis type="category" dataKey="name" tick={{fill:C.text,fontSize:10,fontFamily:"monospace"}} width={100}/>
                    <Tooltip content={<Tip/>}/><Bar dataKey="pct" radius={[0,4,4,0]} maxBarSize={16}>
                      {champData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} fillOpacity={0.85}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Empty state — only when no tab content and no sim */}
          {!results&&!running&&tab!=="live"&&tab!=="betting"&&!needsSim&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"80px 20px",color:C.textMuted,minHeight:"40vh"}}>
              <div style={{fontSize:56,marginBottom:14}}>🏀</div>
              <div style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:6}}>Bracket Factory</div>
              <div style={{fontSize:13,fontWeight:500,color:C.textDim,marginBottom:16}}>Live Tournament Tracking · KenPom-Calibrated Simulations</div>
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
    </>
  );
}
