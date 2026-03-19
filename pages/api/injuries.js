// pages/api/injuries.js
// Polls ESPN injury data for tournament teams, matches against player impact database
import { ESPN_TEAM_IDS, PLAYER_DB } from "../../lib/players";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

// ESPN injury status values that mean a player is effectively OUT
const OUT_STATUSES = new Set([
  "Out", "OUT", "Doubtful", "DOUBTFUL",
  "Suspended", "SUSPENDED",
]);

// Questionable/GTD — flag but don't auto-apply
const GTD_STATUSES = new Set([
  "Questionable", "QUESTIONABLE",
  "Game-Time Decision", "Day-To-Day", "DAY_TO_DAY",
  "Probable", "PROBABLE",
]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  try {
    const detectedInjuries = [];
    const gtdAlerts = [];

    // Strategy 1: League-wide injuries endpoint
    try {
      const leagueRes = await fetch(`${BASE}/injuries`);
      if (leagueRes.ok) {
        const leagueData = await leagueRes.json();
        const items = leagueData?.injuries || leagueData?.items || [];
        for (const item of items) {
          processInjuryItem(item, detectedInjuries, gtdAlerts);
        }
      }
    } catch (e) { /* league endpoint might not exist for NCAAMB */ }

    // Strategy 2: Check individual team injury pages for key tournament teams
    // Only check teams that have entries in our player DB to limit API calls
    const teamsToCheck = Object.entries(ESPN_TEAM_IDS)
      .filter(([name]) => PLAYER_DB[name])
      .slice(0, 30); // Cap at 30 to avoid rate limiting

    const teamPromises = teamsToCheck.map(async ([teamName, espnId]) => {
      try {
        const teamRes = await fetch(`${BASE}/teams/${espnId}/injuries`);
        if (!teamRes.ok) return;
        const teamData = await teamRes.json();
        const items = teamData?.injuries || teamData?.items || [];
        for (const item of items) {
          processInjuryItem(item, detectedInjuries, gtdAlerts, teamName);
        }
      } catch (e) { /* skip failed team */ }
    });

    await Promise.all(teamPromises);

    // Strategy 3: Check roster status from team pages
    const rosterPromises = teamsToCheck.map(async ([teamName, espnId]) => {
      try {
        const rosterRes = await fetch(`${BASE}/teams/${espnId}/roster`);
        if (!rosterRes.ok) return;
        const rosterData = await rosterRes.json();
        const athletes = rosterData?.athletes || [];
        for (const athlete of athletes) {
          const name = athlete?.displayName || athlete?.fullName || "";
          const status = athlete?.injuries?.[0]?.status || athlete?.status || "";
          if (!name || !status) continue;
          matchAndAdd(name, teamName, status, athlete?.injuries?.[0]?.type || "", detectedInjuries, gtdAlerts);
        }
      } catch (e) { /* skip */ }
    });

    await Promise.all(rosterPromises);

    // Deduplicate by player name + team
    const seen = new Set();
    const deduped = [];
    for (const inj of detectedInjuries) {
      const key = `${inj.team}|${inj.player}`;
      if (!seen.has(key)) { seen.add(key); deduped.push(inj); }
    }
    const seenGTD = new Set();
    const dedupedGTD = [];
    for (const a of gtdAlerts) {
      const key = `${a.team}|${a.player}`;
      if (!seenGTD.has(key) && !seen.has(key)) { seenGTD.add(key); dedupedGTD.push(a); }
    }

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      out: deduped,
      questionable: dedupedGTD,
      totalDetected: deduped.length + dedupedGTD.length,
    });
  } catch (err) {
    console.error("Injury fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}

function processInjuryItem(item, outList, gtdList, fallbackTeam) {
  // ESPN injury items can have various structures
  const athletes = item?.injuries || item?.athletes || [item];
  for (const a of athletes) {
    const name = a?.athlete?.displayName || a?.displayName || a?.name || "";
    const status = a?.status || a?.type?.abbreviation || "";
    const type = a?.type?.description || a?.description || a?.details || "";
    const team = a?.team?.displayName || a?.athlete?.team?.displayName || fallbackTeam || "";

    if (!name) continue;
    matchAndAdd(name, team, status, type, outList, gtdList);
  }
}

function matchAndAdd(playerName, teamHint, status, injuryType, outList, gtdList) {
  // Try to match against our player database
  const nameLower = playerName.toLowerCase().trim();
  const parts = nameLower.split(" ");
  const lastName = parts[parts.length - 1];

  // Look through all teams in player DB
  for (const [team, players] of Object.entries(PLAYER_DB)) {
    for (const p of players) {
      const pLower = p.name.toLowerCase();
      const pParts = pLower.split(" ");
      const pLast = pParts[pParts.length - 1];

      // Match: full name, or last name + team hint
      const fullMatch = nameLower === pLower || nameLower.includes(pLower) || pLower.includes(nameLower);
      const lastMatch = lastName === pLast && (!teamHint || teamHint.toLowerCase().includes(team.toLowerCase().split(" ")[0]) || team.toLowerCase().includes(teamHint.toLowerCase().split(" ")[0]));

      if (fullMatch || lastMatch) {
        const entry = {
          player: p.name,
          team: team,
          status: status,
          type: injuryType || "",
          emImpact: p.emImpact,
          star: p.star,
          role: p.role,
          source: "ESPN",
        };

        if (OUT_STATUSES.has(status)) {
          outList.push(entry);
        } else if (GTD_STATUSES.has(status)) {
          gtdList.push(entry);
        }
        return; // matched, done
      }
    }
  }
}
