// pages/index.js
import { useState, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TEAMS, REGION_NAMES, SEED_ORDER, ROUND_LABELS, simTournament, calcPoolEV } from "../lib/bracket";
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
  const [poolSize,setPoolSize]=useState(50);
  const [results,setResults]=useState(null);
  const [elapsed,setElapsed]=useState(0);
  const [tab,setTab]=useState("live");
  const cancelRef=useRef(false);
  const startRef=useRef(0);

  const generate = useCallback(()=>{
    cancelRef.current=false; setRunning(true); setDone(0); setResults(null); setElapsed(0);
    startRef.current=performance.now();
    const stats={total:0,champCounts:{},champSeedCounts:{},regionWinnerCounts:[{},{},{},{}],f4SeedCounts:{},upsetTotal:0,upsetDist:{},teamDepthCounts:{}};
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
  const poolData=results?calcPoolEV(results,poolSize).slice(0,15):[];

  // Bracket advancement data
  const DEPTH_LABELS=["R64","R32","S16","E8","F4","NCG","Champ"];
  const bracketData=results?Object.fromEntries(REGION_NAMES.map(rName=>[rName,
    Array.from({length:16},(_,si)=>{
      const seed=SEED_ORDER[si];const team=TEAMS[rName][seed];
      const counts=results.teamDepthCounts[team.name]||new Array(7).fill(0);
      const advPcts=Array.from({length:7},(_,d)=>{let sum=0;for(let dd=d;dd<7;dd++)sum+=counts[dd];return(sum/results.total)*100;});
      return{name:team.name,seed,advPcts,adjEM:team.adjEM};
    })
  ])):null;

  // Count locked games
  let lockedCount=0;
  for(const r of REGION_NAMES){const l=live.locked[r];for(const rd in l)for(const g in l[rd])if(l[rd][g]!=null)lockedCount++;}

  const Btn=({active,onClick,children,color})=>(<button onClick={onClick} style={{
    background:active?(color||C.accent):"transparent",border:`2px solid ${color||C.accent}`,color:active?"#fff":(color||C.accent),
    borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11,letterSpacing:0.5,
  }}>{children}</button>);

  const liveCount = live.liveGames.filter(g=>g.status==="live").length;
  const finalCount = live.liveGames.filter(g=>g.status==="final").length;

  return (
    <>
      <Head>
        <title>Bracket Factory v8 — Live</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Outfit',sans-serif"}}>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 20px"}}>

          {/* Header */}
          <div style={{textAlign:"center",marginBottom:20}}>
            <h1 style={{fontSize:32,fontWeight:900,letterSpacing:-1,margin:0,background:`linear-gradient(135deg,${C.accent},${C.red})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              BRACKET FACTORY v8 — LIVE
            </h1>
            <p style={{color:C.textMuted,fontSize:12,margin:"6px 0 0"}}>
              KenPom-calibrated · Live scores via ESPN · {lockedCount} games locked
              {live.isPolling && <span style={{color:C.green,marginLeft:8}}>● POLLING</span>}
            </p>
          </div>

          {/* Live Score Ticker */}
          {live.liveGames.filter(g=>g.status==="live").length > 0 && (
            <div style={{background:"rgba(239,68,68,0.08)",border:`1px solid rgba(239,68,68,0.25)`,borderRadius:12,padding:14,marginBottom:16,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{background:C.red,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:4,fontFamily:"monospace",animation:"pulse 2s infinite"}}>LIVE</span>
                <span style={{fontSize:13,fontWeight:700}}>{liveCount} game{liveCount!==1?"s":""} in progress</span>
                {live.lastUpdate && <span style={{fontSize:10,color:C.textMuted,marginLeft:"auto"}}>Updated: {new Date(live.lastUpdate).toLocaleTimeString()}</span>}
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
              {/* Polling toggle */}
              <button onClick={live.isPolling ? live.stopPolling : live.startPolling} style={{
                background:live.isPolling?C.green:"transparent",border:`2px solid ${C.green}`,color:live.isPolling?"#fff":C.green,
                borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:11,
              }}>
                {live.isPolling ? "⏸ STOP LIVE" : "▶ GO LIVE"}
              </button>
              <button onClick={live.fetchScores} style={{
                background:"transparent",border:`2px solid ${C.blue}`,color:C.blue,
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

              <select value={poolSize} onChange={e=>setPoolSize(Number(e.target.value))} disabled={running}
                style={{background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"5px 8px",fontFamily:"monospace",fontSize:11}}>
                {[10,25,50,100,250,500].map(n=><option key={n} value={n}>{n}p pool</option>)}
              </select>

              <div style={{flex:1}}/>

              {!running?(<button onClick={generate} style={{background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1}}>
                SIMULATE {target.toLocaleString()}
              </button>):(<button onClick={()=>{cancelRef.current=true}} style={{background:C.red,border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1}}>CANCEL</button>)}
            </div>

            {running&&(<div style={{marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textDim,marginBottom:3,fontFamily:"monospace"}}>
                <span>{done.toLocaleString()} / {target.toLocaleString()}</span><span style={{color:C.accent}}>{pct}%</span>
              </div>
              <div style={{height:5,background:C.card,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.accent},${C.purple})`,borderRadius:3}}/></div>
            </div>)}

            {live.error && <div style={{marginTop:8,fontSize:11,color:C.red}}>⚠ {live.error}</div>}
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
                <div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>BEST POOL PICK ({poolSize}p)</div>
                <div style={{fontSize:18,fontWeight:800,color:C.purple,fontFamily:"monospace"}}>{poolData[0]?.name||"—"}</div>
              </div>
              <div>
                <div style={{fontSize:9,color:C.textMuted,fontWeight:700,letterSpacing:1}}>LOCKED</div>
                <div style={{fontSize:22,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{lockedCount}</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
              {[{key:"live",label:"SCOREBOARD"},{key:"bracket",label:"BRACKET"},{key:"champion",label:"CHAMPIONS"},{key:"pool",label:"POOL OPTIMIZER"}].map(t=>
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
                    <div style={{fontSize:14}}>No games loaded yet. Click <strong>GO LIVE</strong> or <strong>REFRESH</strong> to pull scores.</div>
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

            {/* POOL OPTIMIZER TAB */}
            {tab==="pool"&&(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
                <h3 style={{fontSize:12,fontWeight:800,letterSpacing:1,color:C.accent,margin:"0 0 14px"}}>POOL OPTIMIZER — {poolSize}-PERSON POOL</h3>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                    <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                      {["#","TEAM","MODEL %","PUBLIC %","LEVERAGE","EV"].map(h=><th key={h} style={{padding:"8px",textAlign:"left",color:C.textMuted,fontSize:9,fontWeight:700}}>{h}</th>)}
                    </tr></thead>
                    <tbody>{poolData.map((d,i)=>{const lev=parseFloat(d.leverage);return(
                      <tr key={d.name} style={{borderBottom:`1px solid rgba(42,53,80,0.5)`}}>
                        <td style={{padding:"6px 8px",color:C.textMuted}}>{i+1}</td>
                        <td style={{padding:"6px 8px",color:i<3?C.accent:C.text,fontWeight:i<3?700:400}}>{d.name}</td>
                        <td style={{padding:"6px 8px",color:C.green}}>{d.pWin}%</td>
                        <td style={{padding:"6px 8px",color:C.textDim}}>{d.pubPct}%</td>
                        <td style={{padding:"6px 8px",color:lev>0?C.green:C.red,fontWeight:700}}>{lev>0?"+":""}{d.leverage}%</td>
                        <td style={{padding:"6px 8px"}}><div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{height:10,borderRadius:2,background:C.purple,width:`${Math.min(100,parseFloat(d.ev)*2000)}%`,minWidth:3}}/>
                          <span style={{color:C.purple,fontWeight:700}}>{d.ev}</span>
                        </div></td>
                      </tr>);})}</tbody>
                  </table>
                </div>
              </div>
            )}
          </>)}

          {/* Empty state */}
          {!results&&!running&&(
            <div style={{textAlign:"center",padding:"50px 20px",color:C.textMuted}}>
              <div style={{fontSize:48,marginBottom:10}}>🏀</div>
              <div style={{fontSize:15,fontWeight:600}}>Bracket Factory v8 — Live Tournament Tracking</div>
              <div style={{fontSize:12,marginTop:8,maxWidth:500,margin:"8px auto 0",lineHeight:1.6}}>
                Click <strong>GO LIVE</strong> to start pulling ESPN scores in real time.
                Completed games auto-lock into the bracket. Then hit <strong>SIMULATE</strong> to see updated championship odds.
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </>
  );
}
