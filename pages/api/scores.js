// pages/api/scores.js
// Proxies ESPN's men's college basketball scoreboard API
// Returns structured game data with status, scores, and team info
// Automatically maps ESPN team names to our bracket team names

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

// Map ESPN display names → our bracket team names
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
  "Penn Quakers": "Penn", "Idaho Vandals": "Idaho",
  "Prairie View A&M Panthers": "Prairie View", "Lehigh Mountain Hawks": "Lehigh",
  "Arizona Wildcats": "Arizona", "Purdue Boilermakers": "Purdue", "Gonzaga Bulldogs": "Gonzaga",
  "Arkansas Razorbacks": "Arkansas", "Wisconsin Badgers": "Wisconsin", "BYU Cougars": "BYU",
  "Miami Hurricanes": "Miami (FL)", "Villanova Wildcats": "Villanova",
  "Utah State Aggies": "Utah St", "Missouri Tigers": "Missouri", "Texas Longhorns": "Texas",
  "High Point Panthers": "High Point", "Hawai'i Rainbow Warriors": "Hawaii",
  "Hawaii Rainbow Warriors": "Hawaii",
  "Kennesaw State Owls": "Kennesaw St", "Queens Royals": "Queens",
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

export default async function handler(req, res) {
  // Allow CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=10");

  try {
    // Fetch today's games + optionally a specific date
    const { date } = req.query; // format: YYYYMMDD
    const url = date ? `${ESPN_URL}?dates=${date}&groups=100&limit=100` : `${ESPN_URL}?groups=100&limit=100`;

    const espnRes = await fetch(url);
    if (!espnRes.ok) throw new Error(`ESPN returned ${espnRes.status}`);

    const data = await espnRes.json();
    const events = data?.events || [];

    const games = events.map(event => {
      const comp = event.competitions?.[0];
      if (!comp) return null;

      const teams = comp.competitors || [];
      const home = teams.find(t => t.homeAway === "home");
      const away = teams.find(t => t.homeAway === "away");

      if (!home || !away) return null;

      const status = comp.status?.type?.name; // "STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_FINAL"
      const clock = comp.status?.displayClock;
      const period = comp.status?.period;
      const detail = comp.status?.type?.shortDetail; // "Final", "Halftime", "8:32 - 2nd", etc.

      return {
        id: event.id,
        status: status === "STATUS_FINAL" ? "final" : status === "STATUS_IN_PROGRESS" ? "live" : "scheduled",
        detail: detail || "",
        clock,
        period,
        startTime: event.date,
        home: {
          name: mapName(home.team?.displayName),
          abbr: home.team?.abbreviation,
          seed: home.curatedRank?.current || null,
          score: parseInt(home.score) || 0,
          logo: home.team?.logo,
        },
        away: {
          name: mapName(away.team?.displayName),
          abbr: away.team?.abbreviation,
          seed: away.curatedRank?.current || null,
          score: parseInt(away.score) || 0,
          logo: away.team?.logo,
        },
        // For bracket locking: winner info (only when final)
        winner: status === "STATUS_FINAL"
          ? (parseInt(home.score) > parseInt(away.score) ? mapName(home.team?.displayName) : mapName(away.team?.displayName))
          : null,
      };
    }).filter(Boolean);

    // Filter to only NCAA tournament games (seeded teams)
    const tourneyGames = games.filter(g =>
      g.home.seed || g.away.seed ||
      // Also catch First Four games that might not have seeds
      Object.values(NAME_MAP).includes(g.home.name) ||
      Object.values(NAME_MAP).includes(g.away.name)
    );

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      gameCount: tourneyGames.length,
      games: tourneyGames,
      // Summary counts for quick status check
      live: tourneyGames.filter(g => g.status === "live").length,
      final: tourneyGames.filter(g => g.status === "final").length,
      scheduled: tourneyGames.filter(g => g.status === "scheduled").length,
    });
  } catch (err) {
    console.error("ESPN fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}
