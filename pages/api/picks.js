// pages/api/picks.js
// Server-side pick computation, persistence, and grading
// Picks are saved when games are scheduled (before tipoff) and never change
// Grading happens when games go final

import {
  TEAMS, REGION_NAMES, KNOWN_ODDS,
  winProb, getAdjEM, buildInjuryMap, DEFAULT_INJURIES,
  normalCDF, gameSD, oddsToProb, adjustedSpread,
} from "../../lib/bracket";

let redis = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { Redis } = require("@upstash/redis");
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
} catch (e) { /* Redis not available */ }

const injuryMap = buildInjuryMap(DEFAULT_INJURIES);

// Build team lookup
const TEAM_LOOKUP = {};
for (var r of REGION_NAMES) {
  for (var s = 1; s <= 16; s++) {
    var t = TEAMS[r][s];
    TEAM_LOOKUP[t.name] = { region: r, seed: s, team: t };
  }
}

function makeKey(nameA, nameB) {
  return [nameA, nameB].sort().join("|");
}

// Compute the model's best pick for a matchup
function computePick(hiName, loName, marketSpread, hiML, loML) {
  var hiInfo = TEAM_LOOKUP[hiName], loInfo = TEAM_LOOKUP[loName];
  if (!hiInfo || !loInfo) return null;

  var hiTeam = hiInfo.team, loTeam = loInfo.team;
  var hiEM = getAdjEM(hiTeam, injuryMap), loEM = getAdjEM(loTeam, injuryMap);
  var mSpread = adjustedSpread(-((hiEM - loEM) * (hiTeam.adjT + loTeam.adjT) / 200));
  var hiWinP = winProb(hiEM, hiTeam.adjT, loEM, loTeam.adjT, hiTeam.oRk, hiTeam.dRk, loTeam.oRk, loTeam.dRk);
  var loWinP = 1 - hiWinP;

  // Spread cover edge
  var hiSpreadEdgePct = null, loSpreadEdgePct = null;
  if (marketSpread != null) {
    var sd = gameSD(hiTeam.oRk, hiTeam.dRk, loTeam.oRk, loTeam.dRk);
    var modelMargin = -mSpread;
    var marketLine = -marketSpread;
    var hiCoverProb = normalCDF((modelMargin - marketLine) / sd);
    var loCoverProb = 1 - hiCoverProb;
    var impliedCover = 110 / 210;
    hiSpreadEdgePct = (hiCoverProb - impliedCover) * 100;
    loSpreadEdgePct = (loCoverProb - impliedCover) * 100;
  }

  // ML edge
  var hiMLEdge = null, loMLEdge = null;
  if (hiML) { var ip = oddsToProb(hiML); hiMLEdge = ip != null ? ((hiWinP - ip) * 100) : null; }
  if (loML) { var ip2 = oddsToProb(loML); loMLEdge = ip2 != null ? ((loWinP - ip2) * 100) : null; }

  // Find best edge — cap spread at ±15
  var SPREAD_CAP = 15;
  var spreadCapped = marketSpread != null && Math.abs(marketSpread) > SPREAD_CAP;
  var bestEdge = 0, valueTeam = null, bestType = null, bestLine = null;

  var edges = [
    { team: hiName, edge: hiMLEdge, type: "ML", line: hiML },
    { team: loName, edge: loMLEdge, type: "ML", line: loML },
  ];
  if (!spreadCapped) {
    edges.push({ team: hiName, edge: hiSpreadEdgePct > 0 ? hiSpreadEdgePct : null, type: "spread", line: marketSpread });
    edges.push({ team: loName, edge: loSpreadEdgePct > 0 ? loSpreadEdgePct : null, type: "spread", line: marketSpread });
  }

  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (e.edge != null && e.edge > bestEdge) {
      bestEdge = e.edge; valueTeam = e.team; bestType = e.type; bestLine = e.line;
    }
  }

  if (!valueTeam || bestEdge <= 0) return null;

  // Rating
  var absSpread = marketSpread != null ? Math.abs(marketSpread) : 999;
  var vigAdj = 2.3;
  var hiMLEdgeAdj = hiMLEdge != null ? hiMLEdge - vigAdj : null;
  var loMLEdgeAdj = loMLEdge != null ? loMLEdge - vigAdj : null;
  var maxEdgeAdj = Math.max(hiMLEdgeAdj || 0, loMLEdgeAdj || 0, hiSpreadEdgePct || 0, loSpreadEdgePct || 0);
  var rating = "";
  if (absSpread <= 10 && maxEdgeAdj >= 3) rating = "SHARP";
  else if (maxEdgeAdj >= 8) rating = "STRONG VALUE";
  else if (maxEdgeAdj >= 4) rating = "VALUE";
  else if (maxEdgeAdj >= 1.5) rating = "+EV";
  else return null; // Below threshold, skip

  return {
    valueTeam: valueTeam,
    bestType: bestType,
    bestLine: bestLine,
    bestEdge: Math.round(bestEdge * 10) / 10,
    rating: rating,
    hiName: hiName,
    loName: loName,
    hiSeed: hiInfo.seed,
    loSeed: loInfo.seed,
    region: hiInfo.region,
    marketSpread: marketSpread,
    hiML: hiML,
    loML: loML,
    modelSpread: Math.round(mSpread * 10) / 10,
    hiSpreadEdgePct: hiSpreadEdgePct ? Math.round(hiSpreadEdgePct * 10) / 10 : null,
    loSpreadEdgePct: loSpreadEdgePct ? Math.round(loSpreadEdgePct * 10) / 10 : null,
  };
}

// Grade a pick against actual score
function gradePick(pick, winner, hiScore, loScore) {
  var result = null;
  var usedType = pick.bestType;
  var usedLine = pick.bestLine;
  var actualMargin = hiScore - loScore;

  if (pick.bestType === "ML") {
    var mlWon = (winner === pick.valueTeam);
    if (mlWon) {
      result = "W";
    } else {
      // ML-to-spread fallback (3% threshold)
      var valueIsHi = pick.valueTeam === pick.hiName;
      var spreadEdgeForValue = valueIsHi ? pick.hiSpreadEdgePct : pick.loSpreadEdgePct;
      var spreadCapped = pick.marketSpread != null && Math.abs(pick.marketSpread) > 15;
      if (!spreadCapped && spreadEdgeForValue != null && spreadEdgeForValue > 0 && (pick.bestEdge - spreadEdgeForValue) <= 3.0 && pick.marketSpread != null) {
        var teamSpread = valueIsHi ? pick.marketSpread : -pick.marketSpread;
        var teamMargin = valueIsHi ? actualMargin : -actualMargin;
        if (teamMargin + teamSpread > 0) {
          usedType = "spread"; usedLine = pick.marketSpread; result = "W";
        } else if (teamMargin + teamSpread === 0) {
          usedType = "spread"; usedLine = pick.marketSpread; result = "P";
        } else { result = "L"; }
      } else { result = "L"; }
    }
  } else {
    var valueIsHi2 = pick.valueTeam === pick.hiName;
    var teamSpread2 = valueIsHi2 ? pick.marketSpread : -pick.marketSpread;
    var teamMargin2 = valueIsHi2 ? actualMargin : -actualMargin;
    if (teamMargin2 + teamSpread2 > 0) result = "W";
    else if (teamMargin2 + teamSpread2 === 0) result = "P";
    else result = "L";
  }

  return { result: result, usedType: usedType, usedLine: usedLine };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=10");

  if (!redis) {
    return res.status(200).json({ picks: [], error: "Redis not connected" });
  }

  try {
    // Get all saved picks from Redis
    var pickKeys = [];
    try {
      var scanResult = await redis.scan(0, { match: "pick:*", count: 200 });
      pickKeys = scanResult[1] || [];
    } catch (e) {
      // Fallback: try keys command
      try { pickKeys = await redis.keys("pick:*"); } catch (e2) { pickKeys = []; }
    }

    var savedPicks = {};
    if (pickKeys.length > 0) {
      for (var i = 0; i < pickKeys.length; i++) {
        try {
          var data = await redis.get(pickKeys[i]);
          if (data) {
            var parsed = typeof data === "string" ? JSON.parse(data) : data;
            var matchupKey = pickKeys[i].replace("pick:", "");
            savedPicks[matchupKey] = parsed;
          }
        } catch (e) { /* skip bad data */ }
      }
    }

    // Return saved picks
    var allPicks = Object.values(savedPicks);
    // Sort: graded first (by most recent), then ungraded
    allPicks.sort(function(a, b) {
      if (a.result && !b.result) return -1;
      if (!a.result && b.result) return 1;
      return (b.savedAt || 0) - (a.savedAt || 0);
    });

    return res.status(200).json({
      picks: allPicks,
      totalPicks: allPicks.length,
      graded: allPicks.filter(function(p) { return p.result; }).length,
      wins: allPicks.filter(function(p) { return p.result === "W"; }).length,
      losses: allPicks.filter(function(p) { return p.result === "L"; }).length,
    });
  } catch (err) {
    console.error("Picks API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
