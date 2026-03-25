// pages/api/scores.js
// Proxies ESPN scoreboard + auto-caches odds to Upstash Redis
// Every device gets the same odds data regardless of when they opened the page

import { KNOWN_ODDS } from "../../lib/bracket";

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require("@upstash/redis");
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (e) { /* Redis not available, fall back to KNOWN_ODDS only */ }

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
