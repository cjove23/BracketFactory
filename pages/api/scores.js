// pages/api/scores.js
// Proxies ESPN scoreboard + auto-caches odds to Upstash Redis
// Every device gets the same odds data regardless of when they opened the page

import {
  KNOWN_ODDS, TEAMS, REGION_NAMES,
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
} catch (e) { /* Redis not available, fall back to KNOWN_ODDS only */ }

// Build team lookup for pick computation
var injuryMap = buildInjuryMap(DEFAULT_INJURIES);
var TEAM_LOOKUP = {};
for (var _r of REGION_NAMES) {
  for (var _s = 1; _s <= 16; _s++) {
    var _t = TEAMS[_r][_s];
    TEAM_LOOKUP[_t.name] = { region: _r, seed: _s, team: _t };
  }
}

function computePickForGame(homeName, awayName, odds) {
  var homeInfo = TEAM_LOOKUP[homeName], awayInfo = TEAM_LOOKUP[awayName];
  if (!homeInfo || !awayInfo) return null;

  var hiSeed = Math.min(homeInfo.seed, awayInfo.seed);
  var loSeed = Math.max(homeInfo.seed, awayInfo.seed);
  var hiName = homeInfo.seed <= awayInfo.seed ? homeName : awayName;
  var loName = homeInfo.seed <= awayInfo.seed ? awayName : homeName;
  var hiTeam = TEAM_LOOKUP[hiName].team, loTeam = TEAM_LOOKUP[loName].team;
  var hiInfo = TEAM_LOOKUP[hiName], loInfo = TEAM_LOOKUP[loName];

  var hiEM = getAdjEM(hiTeam, injuryMap), loEM = getAdjEM(loTeam, injuryMap);
  var mSpread = adjustedSpread(-((hiEM - loEM) * (hiTeam.adjT + loTeam.adjT) / 200));
  var hiWinP = winProb(hiEM, hiTeam.adjT, loEM, loTeam.adjT, hiTeam.oRk, hiTeam.dRk, loTeam.oRk, loTeam.dRk);
  var loWinP = 1 - hiWinP;

  // Get odds oriented to hi seed
  var marketSpread = odds.spread != null ? parseFloat(odds.spread) : null;
  var hiIsHome = homeName === hiName;
  var hiML = hiIsHome ? (odds.homeML != null ? Number(odds.homeML) : null) : (odds.awayML != null ? Number(odds.awayML) : null);
  var loML = hiIsHome ? (odds.awayML != null ? Number(odds.awayML) : null) : (odds.homeML != null ? Number(odds.homeML) : null);
  if (marketSpread != null && !hiIsHome) marketSpread = -marketSpread;

  // Cover probability edges
  var hiSpreadEdgePct = null, loSpreadEdgePct = null;
  if (marketSpread != null) {
    var sd = gameSD(hiTeam.oRk, hiTeam.dRk, loTeam.oRk, loTeam.dRk);
    var modelMargin = -mSpread;
    var marketLine = -marketSpread;
    var hiCoverProb = normalCDF((modelMargin - marketLine) / sd);
    var impliedCover = 110 / 210;
    hiSpreadEdgePct = (hiCoverProb - impliedCover) * 100;
    loSpreadEdgePct = ((1 - hiCoverProb) - impliedCover) * 100;
  }

  var hiMLEdge = null, loMLEdge = null;
  if (hiML) { var ip = oddsToProb(hiML); hiMLEdge = ip != null ? ((hiWinP - ip) * 100) : null; }
  if (loML) { var ip2 = oddsToProb(loML); loMLEdge = ip2 != null ? ((loWinP - ip2) * 100) : null; }

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
  for (var ei = 0; ei < edges.length; ei++) {
    if (edges[ei].edge != null && edges[ei].edge > bestEdge) {
      bestEdge = edges[ei].edge; valueTeam = edges[ei].team; bestType = edges[ei].type; bestLine = edges[ei].line;
    }
  }
  if (!valueTeam || bestEdge <= 0) return null;

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
  else return null;

  return {
    valueTeam: valueTeam, bestType: bestType, bestLine: bestLine,
    bestEdge: Math.round(bestEdge * 10) / 10, rating: rating,
    hiName: hiName, loName: loName, hiSeed: hiInfo.seed, loSeed: loInfo.seed,
    region: hiInfo.region, marketSpread: marketSpread, hiML: hiML, loML: loML,
    modelSpread: Math.round(mSpread * 10) / 10,
    hiSpreadEdgePct: hiSpreadEdgePct ? Math.round(hiSpreadEdgePct * 10) / 10 : null,
    loSpreadEdgePct: loSpreadEdgePct ? Math.round(loSpreadEdgePct * 10) / 10 : null,
    savedAt: Date.now(),
  };
}

function gradePickResult(pick, winner, hiScore, loScore) {
  var actualMargin = hiScore - loScore;
  var result = null, usedType = pick.bestType, usedLine = pick.bestLine;

  if (pick.bestType === "ML") {
    if (winner === pick.valueTeam) { result = "W"; }
    else {
      var valueIsHi = pick.valueTeam === pick.hiName;
      var spreadEdgeForValue = valueIsHi ? pick.hiSpreadEdgePct : pick.loSpreadEdgePct;
      var spreadCapped = pick.marketSpread != null && Math.abs(pick.marketSpread) > 15;
      if (!spreadCapped && spreadEdgeForValue != null && spreadEdgeForValue > 0 && (pick.bestEdge - spreadEdgeForValue) <= 3.0 && pick.marketSpread != null) {
        var teamSpread = valueIsHi ? pick.marketSpread : -pick.marketSpread;
        var teamMargin = valueIsHi ? actualMargin : -actualMargin;
        if (teamMargin + teamSpread > 0) { usedType = "spread"; usedLine = pick.marketSpread; result = "W"; }
        else if (teamMargin + teamSpread === 0) { usedType = "spread"; usedLine = pick.marketSpread; result = "P"; }
        else { result = "L"; }
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

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

const NAME_MAP = {
  "Duke Blue Devils": "Duke", "UConn Huskies": "UConn", "Michigan State Spartans": "Michigan St",
  "Kansas Jayhawks": "Kansas", "St. John's Red Storm": "St. John's", "Louisville Cardinals": "Louisville",
  "UCLA Bruins": "UCLA", "Ohio State Buckeyes": "Ohio St", "TCU Horned Frogs": "TCU",
  "UCF Knights": "UCF", "South Florida Bulls": "South Florida", "Northern Iowa Panthers": "N. Iowa",
  "California Baptist Lancers": "Cal Baptist", "North Dakota State Bison": "N. Dakota St",
  "Furman Paladins": "Furman", "Siena Saints": "Siena",
  "Florida Gators": "Florida", "Houston Cougars": "Houston", "Illinois Fighting Illini": "Illinois",
  "Nebraska Cornhuskers": "Nebraska", "Vanderbilt Commodores": "Vanderbilt",
  "North Carolina Tar Heels": "North Carolina", "Saint Mary's Gaels": "Saint Mary's",
  "Clemson Tigers": "Clemson", "Iowa Hawkeyes": "Iowa", "Texas A&M Aggies": "Texas A&M",
  "VCU Rams": "VCU", "McNeese Cowboys": "McNeese", "Troy Trojans": "Troy",
  "Penn Quakers": "Penn", "Pennsylvania Quakers": "Penn", "Idaho Vandals": "Idaho",
  "Prairie View A&M Panthers": "Prairie View", "Lehigh Mountain Hawks": "Lehigh",
  "Arizona Wildcats": "Arizona", "Purdue Boilermakers": "Purdue", "Gonzaga Bulldogs": "Gonzaga",
  "Arkansas Razorbacks": "Arkansas", "Wisconsin Badgers": "Wisconsin", "BYU Cougars": "BYU",
  "Miami Hurricanes": "Miami (FL)", "Villanova Wildcats": "Villanova",
  "Utah State Aggies": "Utah St", "Missouri Tigers": "Missouri", "Texas Longhorns": "Texas",
  "High Point Panthers": "High Point", "Hawai'i Rainbow Warriors": "Hawaii",
  "Hawaii Rainbow Warriors": "Hawaii",
  "Kennesaw State Owls": "Kennesaw St", "Queens Royals": "Queens", "Queens University Royals": "Queens",
  "LIU Sharks": "LIU",
  "Michigan Wolverines": "Michigan", "Iowa State Cyclones": "Iowa St",
  "Virginia Cavaliers": "Virginia", "Alabama Crimson Tide": "Alabama",
  "Texas Tech Red Raiders": "Texas Tech", "Tennessee Volunteers": "Tennessee",
  "Kentucky Wildcats": "Kentucky", "Georgia Bulldogs": "Georgia",
  "Saint Louis Billikens": "Saint Louis", "Santa Clara Broncos": "Santa Clara",
  "SMU Mustangs": "SMU", "Akron Zips": "Akron", "Hofstra Pride": "Hofstra",
  "Wright State Raiders": "Wright St", "Tennessee State Tigers": "Tennessee St",
  "UMBC Retrievers": "UMBC", "Howard Bison": "Howard",
  "NC State Wolfpack": "NC State", "Miami (OH) RedHawks": "Miami (OH)",
};

function mapName(espnName) {
  return NAME_MAP[espnName] || espnName;
}

function makeOddsKey(homeName, awayName) {
  return [homeName, awayName].sort().join("|");
}

// Save odds to Redis (fire-and-forget)
async function cacheOdds(key, odds, homeName) {
  if (!redis) return;
  try {
    await redis.set("odds:" + key, JSON.stringify({ ...odds, _home: homeName }), { ex: 60 * 60 * 24 * 30 });
  } catch (e) { /* best effort */ }
}

// Load odds from Redis
async function loadCachedOdds(key) {
  if (!redis) return null;
  try {
    const data = await redis.get("odds:" + key);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=10");

  try {
    const { date } = req.query;
    const url = date ? ESPN_URL + "?dates=" + date + "&groups=100&limit=100" : ESPN_URL + "?groups=100&limit=100";

    const espnRes = await fetch(url);
    if (!espnRes.ok) throw new Error("ESPN returned " + espnRes.status);

    const data = await espnRes.json();
    const events = data?.events || [];

    const games = events.map(function(event) {
      const comp = event.competitions?.[0];
      if (!comp) return null;

      const teams = comp.competitors || [];
      const home = teams.find(function(t) { return t.homeAway === "home"; });
      const away = teams.find(function(t) { return t.homeAway === "away"; });
      if (!home || !away) return null;

      const status = comp.status?.type?.name;
      const clock = comp.status?.displayClock;
      const period = comp.status?.period;
      const detail = comp.status?.type?.shortDetail;

      const homeName = mapName(home.team?.displayName);
      const awayName = mapName(away.team?.displayName);

      const odds = (function() {
        const o = comp.odds?.[0];
        if (!o) return null;
        const ml = o.moneyline || {};
        const ps = o.pointSpread || {};
        const homeML = ml?.home?.close?.odds ?? ml?.home?.odds ?? null;
        const awayML = ml?.away?.close?.odds ?? ml?.away?.odds ?? null;
        return {
          spread: o.spread ?? null,
          overUnder: o.overUnder ?? null,
          homeSpread: ps?.home?.close?.line ?? null,
          awaySpread: ps?.away?.close?.line ?? null,
          homeML: homeML != null ? Number(homeML) : null,
          awayML: awayML != null ? Number(awayML) : null,
          provider: o.provider?.name ?? null,
        };
      })();

      return {
        id: event.id,
        status: status === "STATUS_FINAL" ? "final" : status === "STATUS_SCHEDULED" ? "scheduled" : "live",
        detail: detail || "", clock: clock, period: period,
        startTime: event.date,
        home: { name: homeName, abbr: home.team?.abbreviation, seed: home.curatedRank?.current || null, score: parseInt(home.score) || 0, logo: home.team?.logo },
        away: { name: awayName, abbr: away.team?.abbreviation, seed: away.curatedRank?.current || null, score: parseInt(away.score) || 0, logo: away.team?.logo },
        odds: odds,
        winner: status === "STATUS_FINAL"
          ? (parseInt(home.score) > parseInt(away.score) ? homeName : awayName)
          : null,
        _oddsKey: makeOddsKey(homeName, awayName),
      };
    }).filter(Boolean);

    // ── Server-side odds persistence ──
    var oddsPromises = [];

    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      var hasLiveOdds = g.odds && (g.odds.spread != null || g.odds.homeML != null);

      if (hasLiveOdds) {
        // Save odds to Redis while they exist
        oddsPromises.push(cacheOdds(g._oddsKey, g.odds, g.home.name));
      }

      if (g.status === "final" && !hasLiveOdds) {
        // Game is final and ESPN stripped odds — restore from cache
        (function(game) {
          oddsPromises.push(
            loadCachedOdds(game._oddsKey).then(function(cached) {
              if (cached) {
                game.odds = cached;
              } else if (KNOWN_ODDS[game._oddsKey]) {
                var ko = KNOWN_ODDS[game._oddsKey];
                game.odds = {
                  spread: ko.spread,
                  homeML: ko.home === game.home.name ? ko.homeML : ko.awayML,
                  awayML: ko.home === game.home.name ? ko.awayML : ko.homeML,
                  _home: ko.home,
                  _source: "known_odds",
                };
              }
            })
          );
        })(g);
      }
    }

    // Wait for Redis ops (with timeout)
    if (oddsPromises.length > 0) {
      await Promise.race([
        Promise.allSettled(oddsPromises),
        new Promise(function(resolve) { setTimeout(resolve, 2000); }),
      ]);
    }

    // Filter to tournament games
    var tourneyGames = games.filter(function(g) {
      return g.home.seed || g.away.seed ||
        Object.values(NAME_MAP).includes(g.home.name) ||
        Object.values(NAME_MAP).includes(g.away.name);
    });

    // ── Auto-save picks and grade completed games ──
    if (redis) {
      var pickPromises = [];

      for (var pi = 0; pi < tourneyGames.length; pi++) {
        var game = tourneyGames[pi];
        var oddsKey = makeOddsKey(game.home.name, game.away.name);
        var pickRedisKey = "pick:" + oddsKey;
        var gameOdds = game.odds;

        // Get odds from KNOWN_ODDS if ESPN doesn't have them
        if (!gameOdds || (gameOdds.homeML == null && gameOdds.spread == null)) {
          var ko = KNOWN_ODDS[oddsKey];
          if (ko) {
            gameOdds = {
              spread: ko.spread,
              homeML: ko.home === game.home.name ? ko.homeML : ko.awayML,
              awayML: ko.home === game.home.name ? ko.awayML : ko.homeML,
            };
          }
        }

        if (!gameOdds || (gameOdds.homeML == null && gameOdds.spread == null)) continue;

        // Save pick for scheduled/live games (before they go final)
        if (game.status === "scheduled" || game.status === "live") {
          (function(gm, gOdds, rKey) {
            pickPromises.push(
              redis.get(rKey).then(function(existing) {
                if (existing) return; // Already saved, don't overwrite
                var pick = computePickForGame(gm.home.name, gm.away.name, gOdds);
                if (pick) {
                  return redis.set(rKey, JSON.stringify(pick), { ex: 60 * 60 * 24 * 60 }); // 60 day TTL
                }
              }).catch(function(e) { /* best effort */ })
            );
          })(game, gameOdds, pickRedisKey);
        }

        // Grade final games
        if (game.status === "final" && game.winner) {
          (function(gm, rKey) {
            pickPromises.push(
              redis.get(rKey).then(function(savedData) {
                if (!savedData) {
                  // No saved pick — compute and save retroactively with grade
                  var gOdds = gm.odds;
                  if (!gOdds || (gOdds.homeML == null && gOdds.spread == null)) {
                    var koKey = makeOddsKey(gm.home.name, gm.away.name);
                    var ko2 = KNOWN_ODDS[koKey];
                    if (ko2) {
                      gOdds = { spread: ko2.spread, homeML: ko2.home === gm.home.name ? ko2.homeML : ko2.awayML, awayML: ko2.home === gm.home.name ? ko2.awayML : ko2.homeML };
                    }
                  }
                  if (!gOdds) return;
                  var pick = computePickForGame(gm.home.name, gm.away.name, gOdds);
                  if (!pick) return;
                  savedData = pick;
                }

                var parsed = typeof savedData === "string" ? JSON.parse(savedData) : savedData;
                if (parsed.result) return; // Already graded

                var hiIsHome = gm.home.name === parsed.hiName;
                var hiScore = hiIsHome ? gm.home.score : gm.away.score;
                var loScore = hiIsHome ? gm.away.score : gm.home.score;

                var grade = gradePickResult(parsed, gm.winner, hiScore, loScore);
                parsed.result = grade.result;
                parsed.usedType = grade.usedType;
                parsed.usedLine = grade.usedLine;
                parsed.hiScore = hiScore;
                parsed.loScore = loScore;
                parsed.winner = gm.winner;
                parsed.gradedAt = Date.now();

                return redis.set(rKey, JSON.stringify(parsed), { ex: 60 * 60 * 24 * 60 });
              }).catch(function(e) { /* best effort */ })
            );
          })(game, pickRedisKey);
        }
      }

      if (pickPromises.length > 0) {
        await Promise.race([
          Promise.allSettled(pickPromises),
          new Promise(function(resolve) { setTimeout(resolve, 3000); }),
        ]);
      }
    }

    // Clean internal fields
    for (var j = 0; j < tourneyGames.length; j++) {
      delete tourneyGames[j]._oddsKey;
    }

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      gameCount: tourneyGames.length,
      games: tourneyGames,
      redisConnected: !!redis,
      live: tourneyGames.filter(function(g) { return g.status === "live"; }).length,
      final: tourneyGames.filter(function(g) { return g.status === "final"; }).length,
      scheduled: tourneyGames.filter(function(g) { return g.status === "scheduled"; }).length,
    });
  } catch (err) {
    console.error("ESPN fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}
