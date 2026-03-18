// pages/index.js
import { useState, useCallback, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TEAMS, REGION_NAMES, SEED_ORDER, ROUND_LABELS, winProb, simTournament } from "../lib/bracket";
import useLiveScores from "../lib/useLiveScores";
import Head from "next/head";

const BATCH = 20000;
const MODE_MAP = { kenpom:0, contrarian:1, montecarlo:2 };
const C = {
  bg:"#0a0f1a",surface:"#111827",card:"#1a2235",border:"#2a3550",
  accent:"#f97316",accentDim:"#c2410c",green:"#22c55e",blue:"#3b82f6",
  purple:"#a855f7",red:"#ef4444",text:"#f1f5f9",textDim:"#94a3b8",textMuted:"#64748b",
};
const COLORS=["#f97316","#3b82f6","#a855f7","#22c55e","#ef4444","#eab308","#06b6d4","#ec4899","#8b5cf6","#14b8a6","#f59e0b","#6366f1","#10b981","#f43f5e","#0ea5e9","#84cc16"];
const ALL_ROUNDS = ["R64","R32","S16","E8","F4","NCG"];

// Dynamically compute current matchups based on locked results
// Walks the bracket tree: locked games → known winner advances, unlocked games with known participants → current matchup
function getCurrentMatchups(locked, lockedFF) {
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
        const sA = currentSeeds[gi * 2];
        const sB = currentSeeds[gi * 2 + 1];

        if (sA == null || sB == null) {
          nextSeeds.push(null);
          continue;
        }

        if (roundLocks && roundLocks[gi] != null) {
          nextSeeds.push(roundLocks[gi]);
        } else {
          const hiSeed = Math.min(sA, sB), loSeed = Math.max(sA, sB);
          const hi = region[hiSeed], lo = region[loSeed];
          const loWinPct = winProb(lo.adjEM, lo.adjT, hi.adjEM, hi.adjT, lo.oRk, lo.dRk, hi.oRk, hi.dRk) * 100;
          const seedGap = loSeed - hiSeed;
          matchups.push({
            region: rName, round: ROUND_LABELS[roundIdx], hiSeed, loSeed, seedGap,
            hiName: hi.name, loName: lo.name, hiEM: hi.adjEM, loEM: lo.adjEM,
            mismatch: lo.adjEM > hi.adjEM,
            emGap: (lo.adjEM - hi.adjEM).toFixed(1),
            loWinPct: loWinPct.toFixed(1),
          });
          nextSeeds.push(null);
        }
      }
      currentSeeds = nextSeeds;
    }

    if (currentSeeds.length === 1 && currentSeeds[0] != null) {
      const s = currentSeeds[0];
      regionWinners.push({ seed: s, team: region[s], region: rName });
    } else {
      regionWinners.push(null);
    }
  }

  // F4: East vs South (idx 0), West vs Midwest (idx 1)
  for (let si = 0; si < 2; si++) {
    const a = regionWinners[si * 2], b = regionWinners[si * 2 + 1];
    if (a && b && lockedFF.f4[si] == null) {
      const hiSeed = Math.min(a.seed, b.seed), loSeed = Math.max(a.seed, b.seed);
      const hi = hiSeed === a.seed ? a : b, lo = hiSeed === a.seed ? b : a;
      const loWinPct = winProb(lo.team.adjEM, lo.team.adjT, hi.team.adjEM, hi.team.adjT, lo.team.oRk, lo.team.dRk, hi.team.oRk, hi.team.dRk) * 100;
      matchups.push({
        region: `${hi.region} / ${lo.region}`, round: "F4", hiSeed, loSeed, seedGap: loSeed - hiSeed,
        hiName: hi.team.name, loName: lo.team.name, hiEM: hi.team.adjEM, loEM: lo.team.adjEM,
        mismatch: lo.team.adjEM > hi.team.adjEM,
        emGap: (lo.team.adjEM - hi.team.adjEM).toFixed(1),
        loWinPct: loWinPct.toFixed(1),
      });
    }
  }

  // NCG
  const f4Winners = [];
  for (let si = 0; si < 2; si++) {
    if (lockedFF.f4[si] != null) {
      const a = regionWinners[si * 2], b = regionWinners[si * 2 + 1];
      if (a && b) {
        const winner = a.seed === lockedFF.f4[si] ? a : b;
        f4Winners.push(winner);
      } else { f4Winners.push(null); }
    } else { f4Winners.push(null); }
  }
  if (f4Winners[0] && f4Winners[1] && lockedFF.ncg == null) {
    const a = f4Winners[0], b = f4Winners[1];
    const hiSeed = Math.min(a.seed, b.seed), loSeed = Math.max(a.seed, b.seed);
    const hi = hiSeed === a.seed ? a : b, lo = hiSeed === a.seed ? b : a;
    const loWinPct = winProb(lo.team.adjEM, lo.team.adjT, hi.team.adjEM, hi.team.adjT, lo.team.oRk, lo.team.dRk, hi.team.oRk, hi.team.dRk) * 100;
    matchups.push({
      region: "Championship", round: "NCG", hiSeed, loSeed, seedGap: loSeed - hiSeed,
      hiName: hi.team.name, loName: lo.team.name, hiEM: hi.team.adjEM, loEM: lo.team.adjEM,
      mismatch: lo.team.adjEM > hi.team.adjEM,
      emGap: (lo.team.adjEM - hi.team.adjEM).toFixed(1),
      loWinPct: loWinPct.toFixed(1),
    });
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
  const [running,setRunning]=useState(false);
  const [target,setTarget]=useState(1000000);
  const [done,setDone]=useState(0);
  const [mode,setMode]=useState("kenpom");
  const [upsetBias,setUpsetBias]=useState(0.2);
  const [results,setResults]=useState(null);
  const [elapsed,setElapsed]=useState(0);
  const [tab,setTab]=useState("live");
  const cancelRef=useRef(false);
  const startRef=useRef(0);

  const generate = useCallback(()=>{
    cancelRef.current=false; setRunning(true); setDone(0); setResults(null); setElapsed(0);
    startRef.current=performance.now();
    const stats={total:0,champCounts:{},champSeedCounts:{},regionWinnerCounts:[{},{},{},{}],f4SeedCounts:{},
      upsetTotal:0,upsetDist:{},teamDepthCounts:{},
      teamUpsetCounts:{},teamUpsetSims:{},teamUpsetByRound:{}};
    let completed=0;
    const modeNums=mode==="mixed"?[0,1,2]:[MODE_MAP[mode]??0];

    function batch(){
      if(cancelRef.current){setRunning(false);return;}
      const end=Math.min(completed+BATCH,target);
      for(let i=completed;i<end;i++){
        const m=modeNums.length===1?modeNums[0]:modeNums[i%3];
        const res=simTournament(m,upsetBias,live.locked,live.lockedFF);
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
        // Upset tracking
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
  },[target,mode,upsetBias,live.locked,live.lockedFF]);

  const pct=target>0?Math.round((done/target)*100):0;
  const champData=results?Object.entries(results.champCounts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,count])=>({name,count,pct:((count/results.total)*100).toFixed(2)})):[];
  const avgUpsets=results?(results.upsetTotal/results.total).toFixed(2):0;

  // Bracket advancement data
  const bracketData=results?Object.fromEntries(REGION_NAMES.map(rName=>[rName,
    Array.from({length:16},(_,si)=>{
      const seed=SEED_ORDER[si];const team=TEAMS[rName][seed];
      const counts=results.teamDepthCounts[team.name]||new Array(7).fill(0);
      const advPcts=Array.from({length:7},(_,d)=>{let sum=0;for(let dd=d;dd<7;dd++)sum+=counts[dd];return(sum/results.total)*100;});
      return{name:team.name,seed,advPcts,adjEM:team.adjEM};
    })
  ])):null;

  // Upset team data with round breakdown
  const upsetTeamData = useMemo(()=>{
    if(!results) return [];
    const seedLookup={};
    for(const r of REGION_NAMES) for(let s=1;s<=16;s++){const t=TEAMS[r][s];if(!seedLookup[t.name])seedLookup[t.name]={seed:s,region:r};}
    return Object.entries(results.teamUpsetSims)
      .map(([name,simCount])=>{
        const info=seedLookup[name]||{seed:"?",region:"?"};
        const byRound=results.teamUpsetByRound[name]||{};
        const roundPcts={};
        for(const r of ALL_ROUNDS) roundPcts[r]=byRound[r]?((byRound[r]/results.total)*100).toFixed(2):null;
        return{name,seed:info.seed,region:info.region,simCount,simPct:((simCount/results.total)*100).toFixed(2),roundPcts,byRound};
      }).sort((a,b)=>b.simCount-a.simCount);
  },[results]);

  // Dynamic matchup analysis — walks the bracket based on locked results
  const currentMatchups = useMemo(() => getCurrentMatchups(live.locked, live.lockedFF), [live.locked, live.lockedFF]);
  const mismatchGames = currentMatchups.filter(g => g.mismatch);
  const closeGames = currentMatchups.filter(g => !g.mismatch && parseFloat(g.loWinPct) >= 35).sort((a, b) => parseFloat(b.loWinPct) - parseFloat(a.loWinPct));

  let lockedCount=0;
  for(const r of REGION_NAMES){const l=live.locked[r];for(const rd in l)for(const g in l[rd])if(l[rd][g]!=null)lockedCount++;}

  const Btn=({active,onClick,children,color})=>(<button onClick={onClick} style={{
    background:active?(color||C.accent):"transparent",border:`2px solid ${color||C.accent}`,color:active?"#fff":(color||C.accent),
    borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11,letterSpacing:0.5,
  }}>{children}</button>);

  const liveCount=live.liveGames.filter(g=>g.status==="live").length;

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
            <h1 style={{fontSize:32,fontWeight:900,letterSpacing:-1,margin:0,background:`linear-gradient(135deg,${C.accent},${C.red})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              BRACKET FACTORY
            </h1>
            <p style={{color:C.textMuted,fontSize:12,margin:"6px 0 0"}}>
              KenPom-calibrated · Live scores via ESPN · {lockedCount} games locked
              {live.isPolling && <span style={{color:C.green,marginLeft:8}}>● POLLING</span>}
            </p>
          </div>

          {/* Live Score Ticker */}
          {liveCount > 0 && (
            <div style={{background:"rgba(239,68,68,0.08)",border:`1px solid rgba(239,68,68,0.25)`,borderRadius:12,padding:14,marginBottom:16,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{background:C.red,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:4,fontFamily:"monospace",animation:"pulse 2s infinite"}}>LIVE</span>
                <span style={{fontSize:13,fontWeight:700}}>{liveCount} game{liveCount!==1?"s":""} in progress</span>
                {live.lastUpdate&&<span style={{fontSize:10,color:C.textMuted,marginLeft:"auto"}}>Updated: {new Date(live.lastUpdate).toLocaleTimeString()}</span>}
              </div>
              <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:4}}>
                {live.liveGames.filter(g=>g.status==="live").map(g=>(
                  <div key={g.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",minWidth:200,flexShrink:0}}>
                    <div style={{fontSize:10,color:C.accent,fontWeight:700,marginBottom:6}}>{g.detail}</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:g.away.score>g.home.score?700:400,color:g.away.score>g.home.score?C.text:C.textDim}}>
                          {g.away.seed&&<span style={{color:C.textMuted,marginRight:4}}>{g.away.seed}</span>}{g.away.name}
                        </div>
                        <div style={{fontSize:12,fontWeight:g.home.score>g.away.score?700:400,color:g.home.score>g.away.score?C.text:C.textDim}}>
                          {g.home.seed&&<span style={{color:C.textMuted,marginRight:4}}>{g.home.seed}</span>}{g.home.name}
                        </div>
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
              <button onClick={live.isPolling?live.stopPolling:live.startPolling} style={{
                background:live.isPolling?C.green:"transparent",border:`2px solid ${C.green}`,color:live.isPolling?"#fff":C.green,
                borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11,
              }}>{live.isPolling?"⏸ STOP LIVE":"▶ GO LIVE"}</button>
              <button onClick={live.fetchScores} style={{background:"transparent",border:`2px solid ${C.blue}`,color:C.blue,
                borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11,
              }}>↻ REFRESH</button>
              <div style={{width:1,height:24,background:C.border,margin:"0 4px"}}/>
              {[
                {key:"kenpom",label:"KENPOM",color:C.green},
                {key:"contrarian",label:"CONTRARIAN",color:C.red},
                {key:"montecarlo",label:"MONTE CARLO",color:C.purple},
                {key:"mixed",label:"MIX",color:C.accent},
              ].map(m=>(<button key={m.key} onClick={()=>!running&&setMode(m.key)} style={{
                background:mode===m.key?m.color:"transparent",border:`2px solid ${m.color}`,color:mode===m.key?"#fff":m.color,
                borderRadius:6,padding:"6px 10px",cursor:running?"not-allowed":"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:10,opacity:running?0.5:1,
              }}>{m.label}</button>))}
              <select value={target} onChange={e=>setTarget(Number(e.target.value))} disabled={running}
                style={{background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"5px 8px",fontFamily:"monospace",fontSize:11}}>
                {[10000,100000,500000,1000000].map(n=><option key={n} value={n}>{n.toLocaleString()}</option>)}
              </select>
              {(mode==="contrarian"||mode==="mixed")&&(
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:9,color:C.textMuted,fontWeight:700,whiteSpace:"nowrap"}}>UPSET BIAS</span>
                  <input type="range" min="0.05" max="0.5" step="0.05" value={upsetBias} onChange={e=>setUpsetBias(parseFloat(e.target.value))} disabled={running}
                    style={{width:80,accentColor:C.red,cursor:running?"not-allowed":"pointer"}}/>
                  <span style={{fontSize:10,color:C.red,fontWeight:700,fontFamily:"monospace",minWidth:28}}>{upsetBias.toFixed(2)}</span>
                </div>
              )}
              <div style={{flex:1}}/>
              {!running?(<button onClick={generate} style={{background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1}}>
                SIMULATE {target.toLocaleString()}</button>
              ):(<button onClick={()=>{cancelRef.current=true}} style={{background:C.red,border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1}}>CANCEL</button>)}
            </div>
            {running&&(<div style={{marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textDim,marginBottom:3,fontFamily:"monospace"}}>
                <span>{done.toLocaleString()} / {target.toLocaleString()}</span><span style={{color:C.accent}}>{pct}%</span>
              </div>
              <div style={{height:5,background:C.card,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.accent},${C.purple},${C.accent})`,backgroundSize:"200% 100%",borderRadius:3,transition:"width 0.3s ease-out",animation:"shimmer 1.5s ease-in-out infinite"}}/></div>
            </div>)}
            {live.error&&<div style={{marginTop:8,fontSize:11,color:C.red}}>⚠ {live.error}</div>}
          </div>

          {/* Results */}
          {results&&(<>
            {/* Summary */}
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",marginBottom:14,display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
              <div>
                <div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>SIMULATED</div>
                <div style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:"monospace"}}>{results.total.toLocaleString()}</div>
              </div>
              <div>
                <div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>AVG UPSETS</div>
                <div style={{fontSize:22,fontWeight:800,color:C.red,fontFamily:"monospace"}}>{avgUpsets}</div>
              </div>
              <div>
                <div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>BEST CHAMPION</div>
                <div style={{fontSize:18,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{champData[0]?.name}</div>
                <div style={{fontSize:9,color:C.textMuted}}>{champData[0]?.pct}%</div>
              </div>
              <div>
                <div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>LOCKED</div>
                <div style={{fontSize:22,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{lockedCount}</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
              {[{key:"live",label:"SCOREBOARD"},{key:"bracket",label:"BRACKET"},{key:"upsets",label:"UPSET MAKERS"},{key:"champion",label:"CHAMPIONS"}].map(t=>
                <Btn key={t.key} active={tab===t.key} onClick={()=>setTab(t.key)} color={C.blue}>{t.label}</Btn>
              )}
            </div>

            {/* SCOREBOARD TAB */}
            {tab==="live"&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {["final","live","scheduled"].map(status=>{
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
                                <div style={{fontSize:11,fontWeight:status!=="scheduled"&&g.away.score>g.home.score?700:400,color:status!=="scheduled"&&g.away.score>g.home.score?C.text:C.textDim}}>
                                  {g.away.seed&&<span style={{color:C.textMuted,marginRight:3}}>{g.away.seed}</span>}{g.away.name}
                                </div>
                                <div style={{fontSize:11,fontWeight:status!=="scheduled"&&g.home.score>g.away.score?700:400,color:status!=="scheduled"&&g.home.score>g.away.score?C.text:C.textDim}}>
                                  {g.home.seed&&<span style={{color:C.textMuted,marginRight:3}}>{g.home.seed}</span>}{g.home.name}
                                </div>
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
                {live.liveGames.length===0&&(
                  <div style={{textAlign:"center",padding:"40px 20px",color:C.textMuted}}>
                    <div style={{fontSize:14}}>No games loaded. Click <strong>GO LIVE</strong> or <strong>REFRESH</strong> to pull scores.</div>
                  </div>
                )}
              </div>
            )}

            {/* BRACKET TAB */}
            {tab==="bracket"&&bracketData&&(
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {REGION_NAMES.map(rName=>{
                  const teams=bracketData[rName];if(!teams)return null;
                  const roundCols=[{label:"WIN R64",idx:1},{label:"S16",idx:2},{label:"E8",idx:3},{label:"F4",idx:4},{label:"CHAMP",idx:6}];
                  return(
                    <div key={rName} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
                      <h3 style={{fontSize:13,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 12px"}}>{rName.toUpperCase()} REGION</h3>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
                          <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                            <th style={{padding:"6px",textAlign:"left",color:C.textMuted,fontSize:9,width:140}}>TEAM</th>
                            {roundCols.map(rc=><th key={rc.label} style={{padding:"6px",textAlign:"left",color:C.accent,fontSize:9}}>{rc.label}</th>)}
                          </tr></thead>
                          <tbody>{Array.from({length:8}).map((_,pi)=>[teams[pi*2],teams[pi*2+1]].map((t,ti)=>(
                            <tr key={`${pi}-${ti}`} style={{borderBottom:ti===1?`2px solid rgba(42,53,80,0.6)`:`1px solid rgba(42,53,80,0.25)`}}>
                              <td style={{padding:"4px 6px"}}><span style={{color:C.textMuted,marginRight:4}}>{t.seed}</span><span style={{color:t.advPcts[1]>50?C.text:C.textDim,fontWeight:t.advPcts[4]>5?700:400}}>{t.name}</span></td>
                              {roundCols.map(rc=>{const p=t.advPcts[rc.idx];const col=p>=70?C.green:p>=40?C.blue:p>=15?C.accent:p>=3?C.textDim:"rgba(100,116,139,0.3)";return(
                                <td key={rc.label} style={{padding:"4px"}}><div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <div style={{height:8,borderRadius:2,background:col,width:`${Math.min(p,100)*0.7}px`,minWidth:p>0.1?2:0,opacity:p<1?0.4:0.8,flexShrink:0}}/>
                                  <span style={{color:p>=15?C.text:C.textDim,fontWeight:p>=50?700:400,fontSize:p<0.1?8:10}}>{p>=0.1?p.toFixed(1)+"%":p>0?"<0.1%":"—"}</span>
                                </div></td>
                              );})}
                            </tr>
                          )))}</tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* UPSET MAKERS TAB */}
            {tab==="upsets"&&(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
                {/* Section 1: Round-by-round table */}
                <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 4px"}}>UPSET MAKERS — ROUND-BY-ROUND PROBABILITY</h3>
                <p style={{fontSize:10,color:C.textMuted,margin:"0 0 14px"}}>
                  Each column = % of {results.total.toLocaleString()} sims where this team pulled a 5+ seed-line upset in that round. "ANY" = at least one upset in any round.
                </p>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                    <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                      {["#","TEAM","SEED","REGION","R64","R32","S16","E8","F4","NCG","ANY"].map(h=>(
                        <th key={h} style={{padding:"7px 6px",textAlign:h==="#"?"center":"left",color:["R64","R32","S16","E8","F4","NCG"].includes(h)?C.accent:C.textMuted,fontWeight:700,fontSize:9,letterSpacing:1,borderRight:h==="REGION"||h==="NCG"?`1px solid ${C.border}`:"none"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {upsetTeamData.map((d,i)=>{
                        const maxRP=Math.max(...ALL_ROUNDS.map(r=>parseFloat(d.roundPcts[r]||0)));
                        return(
                          <tr key={d.name} style={{borderBottom:`1px solid rgba(42,53,80,0.35)`,background:i%2===0?"transparent":"rgba(255,255,255,0.015)"}}>
                            <td style={{padding:"5px 6px",color:C.textMuted,textAlign:"center",fontSize:10}}>{i+1}</td>
                            <td style={{padding:"5px 6px",color:i<5?C.accent:C.text,fontWeight:i<5?700:400}}>{d.name}</td>
                            <td style={{padding:"5px 6px",color:C.textDim}}>#{d.seed}</td>
                            <td style={{padding:"5px 6px",color:C.textMuted,fontSize:9,borderRight:`1px solid ${C.border}`}}>{d.region}</td>
                            {ALL_ROUNDS.map(r=>{
                              const val=d.roundPcts[r];const nv=parseFloat(val||0);const intensity=maxRP>0?nv/maxRP:0;const isLast=r==="NCG";
                              return(<td key={r} style={{padding:"5px 6px",borderRight:isLast?`1px solid ${C.border}`:"none"}}>
                                {val?(<div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <div style={{width:`${Math.max(4,intensity*40)}px`,height:8,borderRadius:2,flexShrink:0,background:nv>=20?C.red:nv>=10?C.accent:nv>=3?C.blue:C.textMuted,opacity:Math.max(0.4,intensity)}}/>
                                  <span style={{color:nv>=20?C.red:nv>=10?C.accent:nv>=3?C.text:C.textMuted,fontWeight:nv>=10?700:400,fontSize:10}}>{val}%</span>
                                </div>):(<span style={{color:"rgba(100,116,139,0.3)",fontSize:9}}>—</span>)}
                              </td>);
                            })}
                            <td style={{padding:"5px 6px"}}><span style={{color:C.green,fontWeight:700,fontSize:11}}>{d.simPct}%</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {upsetTeamData.length>0&&(
                  <div style={{marginTop:14,padding:12,background:"rgba(239,68,68,0.08)",borderRadius:8,border:`1px solid rgba(239,68,68,0.2)`}}>
                    <div style={{fontSize:11,color:C.red,fontWeight:700,marginBottom:4}}>HOW TO READ THIS</div>
                    <div style={{fontSize:10,color:C.textDim,lineHeight:1.6}}>
                      <strong style={{color:C.text}}>R64</strong> = "How often does this team beat their first-round opponent by 5+ seed lines?"
                      {" "}<strong style={{color:C.text}}>R32, S16, E8</strong> = later-round upset rates (must survive earlier rounds first).
                      {" "}<strong style={{color:C.text}}>ANY</strong> = at least one upset across all rounds.
                      {" "}Only 5+ seed-line gaps qualify. "—" means no upset possible in that round.
                    </div>
                  </div>
                )}

                {/* Section 2: KenPom Mismatches */}
                {mismatchGames.length>0&&(
                  <div style={{marginTop:24}}>
                    <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.red,margin:"0 0 4px"}}>KENPOM MISMATCHES — SEED SAYS FAVORITE, KENPOM SAYS UNDERDOG</h3>
                    <p style={{fontSize:10,color:C.textMuted,margin:"0 0 12px"}}>Lower seed has HIGHER AdjEM in upcoming/current matchups. Auto-updates as rounds advance.</p>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                        <thead><tr style={{borderBottom:`2px solid ${C.red}`}}>
                          {["ROUND","REGION","MATCHUP","HI SEED EM","LO SEED EM","GAP","MODEL WIN%","VERDICT"].map(h=>(
                            <th key={h} style={{padding:"8px 8px",textAlign:"left",color:C.textMuted,fontWeight:700,fontSize:9,letterSpacing:1}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{mismatchGames.sort((a,b)=>parseFloat(b.emGap)-parseFloat(a.emGap)).map(g=>{const sp=parseFloat(g.loWinPct);return(
                          <tr key={`${g.region}-${g.round}-${g.hiSeed}-${g.loSeed}`} style={{borderBottom:`1px solid rgba(42,53,80,0.4)`,background:"rgba(239,68,68,0.04)"}}>
                            <td style={{padding:"6px 8px",fontSize:10}}><span style={{background:"rgba(239,68,68,0.15)",color:C.red,padding:"2px 6px",borderRadius:3,fontWeight:700,fontSize:9}}>{g.round}</span></td>
                            <td style={{padding:"6px 8px",color:C.textMuted,fontSize:10}}>{g.region}</td>
                            <td style={{padding:"6px 8px"}}><span style={{color:C.textDim}}>#{g.hiSeed} {g.hiName}</span><span style={{color:C.textMuted,margin:"0 4px"}}>vs</span><span style={{color:C.accent,fontWeight:700}}>#{g.loSeed} {g.loName}</span></td>
                            <td style={{padding:"6px 8px",color:C.textDim}}>+{g.hiEM}</td>
                            <td style={{padding:"6px 8px",color:C.green,fontWeight:700}}>+{g.loEM}</td>
                            <td style={{padding:"6px 8px",color:C.green,fontWeight:700}}>+{g.emGap}</td>
                            <td style={{padding:"6px 8px",color:sp>=50?C.green:C.accent,fontWeight:700}}>{g.loWinPct}%</td>
                            <td style={{padding:"6px 8px"}}><span style={{background:sp>=50?"rgba(34,197,94,0.15)":"rgba(249,115,22,0.15)",border:`1px solid ${sp>=50?"rgba(34,197,94,0.3)":"rgba(249,115,22,0.3)"}`,color:sp>=50?C.green:C.accent,padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700}}>{sp>=50?"PICK THE UPSET":"LEAN UPSET"}</span></td>
                          </tr>);})}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Section 3: Vulnerable Favorites */}
                {closeGames.length>0&&(
                  <div style={{marginTop:24}}>
                    <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 4px"}}>VULNERABLE FAVORITES — CLOSE GAMES (LOWER SEED WINS 35%+)</h3>
                    <p style={{fontSize:10,color:C.textMuted,margin:"0 0 12px"}}>KenPom favors the higher seed, but the gap is slim. Good contrarian picks. Updates as rounds advance.</p>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                        <thead><tr style={{borderBottom:`2px solid ${C.accent}`}}>
                          {["ROUND","REGION","MATCHUP","HI SEED EM","LO SEED EM","GAP","LO SEED MODEL WIN%"].map(h=>(
                            <th key={h} style={{padding:"8px 8px",textAlign:"left",color:C.textMuted,fontWeight:700,fontSize:9,letterSpacing:1}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{closeGames.map(g=>{const sp=parseFloat(g.loWinPct);return(
                          <tr key={`${g.region}-${g.round}-${g.hiSeed}-${g.loSeed}`} style={{borderBottom:`1px solid rgba(42,53,80,0.4)`}}>
                            <td style={{padding:"6px 8px",fontSize:10}}><span style={{background:"rgba(249,115,22,0.15)",color:C.accent,padding:"2px 6px",borderRadius:3,fontWeight:700,fontSize:9}}>{g.round}</span></td>
                            <td style={{padding:"6px 8px",color:C.textMuted,fontSize:10}}>{g.region}</td>
                            <td style={{padding:"6px 8px"}}><span style={{color:C.textDim}}>#{g.hiSeed} {g.hiName}</span><span style={{color:C.textMuted,margin:"0 4px"}}>vs</span><span style={{color:C.text,fontWeight:600}}>#{g.loSeed} {g.loName}</span></td>
                            <td style={{padding:"6px 8px",color:C.green}}>+{g.hiEM}</td>
                            <td style={{padding:"6px 8px",color:C.textDim}}>+{g.loEM}</td>
                            <td style={{padding:"6px 8px",color:C.textMuted}}>{g.emGap}</td>
                            <td style={{padding:"6px 8px"}}><div style={{display:"flex",alignItems:"center",gap:6}}>
                              <div style={{height:10,borderRadius:2,background:sp>=45?C.accent:C.blue,opacity:0.7,width:`${sp}%`,maxWidth:80,minWidth:4}}/>
                              <span style={{color:sp>=45?C.accent:C.blue,fontWeight:sp>=45?700:400}}>{g.loWinPct}%</span>
                            </div></td>
                          </tr>);})}</tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CHAMPIONS TAB */}
            {tab==="champion"&&(
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
          </>)}

          {/* Empty state */}
          {!results&&!running&&(
            <div style={{textAlign:"center",padding:"50px 20px",color:C.textMuted}}>
              <div style={{fontSize:48,marginBottom:10}}>🏀</div>
              <div style={{fontSize:15,fontWeight:600}}>Bracket Factory — Live Tournament Tracking</div>
              <div style={{fontSize:12,marginTop:8,maxWidth:500,margin:"8px auto 0",lineHeight:1.6}}>
                Click <strong>GO LIVE</strong> to start pulling ESPN scores. Then hit <strong>SIMULATE</strong> to see championship odds. Completed games auto-lock into the bracket.
              </div>
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
