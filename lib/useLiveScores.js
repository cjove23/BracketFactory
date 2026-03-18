// lib/useLiveScores.js
// Polls /api/scores every 30s during active games, 5min otherwise
// Auto-locks completed tournament games into the bracket state
import { useState, useEffect, useCallback, useRef } from "react";
import { TEAMS, REGION_NAMES, SEED_ORDER } from "./bracket";

// Build reverse lookup: team name → { region, seed }
const TEAM_LOOKUP = {};
for (const r of REGION_NAMES) {
  for (let s = 1; s <= 16; s++) {
    TEAM_LOOKUP[TEAMS[r][s].name] = { region: r, seed: s };
  }
}

// Map bracket matchup pairs for each region (seed pairs in bracket order)
// R64 Game 0: seeds at SEED_ORDER[0] vs SEED_ORDER[1], Game 1: [2] vs [3], etc.
function findR64GameIndex(region, teamName) {
  const info = TEAM_LOOKUP[teamName];
  if (!info || info.region !== region) return -1;
  const seed = info.seed;
  for (let gi = 0; gi < 8; gi++) {
    if (SEED_ORDER[gi * 2] === seed || SEED_ORDER[gi * 2 + 1] === seed) return gi;
  }
  return -1;
}

export default function useLiveScores() {
  const [liveGames, setLiveGames] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [locked, setLocked] = useState({
    East: {}, South: {}, West: {}, Midwest: {},
  });
  const [lockedFF, setLockedFF] = useState({ f4: [null, null], ncg: null });
  const [completedGames, setCompletedGames] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const fetchScores = useCallback(async () => {
    try {
      // Fetch today + next 2 days to catch scheduled tournament games
      const today = new Date();
      const dates = [0, 1, 2].map(d => {
        const dt = new Date(today);
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().slice(0, 10).replace(/-/g, "");
      });

      const allGames = [];
      const seen = new Set();
      for (const date of dates) {
        try {
          const res = await fetch(`/api/scores?date=${date}`);
          if (!res.ok) continue;
          const data = await res.json();
          for (const g of (data.games || [])) {
            if (!seen.has(g.id)) { seen.add(g.id); allGames.push(g); }
          }
        } catch (e) { /* skip failed date */ }
      }

      setLiveGames(allGames);
      setLastUpdate(new Date().toISOString());
      setError(null);

      // Auto-lock completed games
      const newLocked = { ...lockedRef.current };
      let changed = false;
      const newCompleted = [];

      for (const game of allGames) {
        if (game.status !== "final" || !game.winner) continue;

        const winnerInfo = TEAM_LOOKUP[game.winner];
        if (!winnerInfo) continue;

        // Check if this is an R64 game we can lock
        const loserName = game.winner === game.home.name ? game.away.name : game.home.name;
        const loserInfo = TEAM_LOOKUP[loserName];
        if (!loserInfo || loserInfo.region !== winnerInfo.region) continue;

        const region = winnerInfo.region;
        const gi = findR64GameIndex(region, game.winner);
        if (gi < 0) continue;

        // Lock it if not already locked
        if (!newLocked[region][0]) newLocked[region][0] = {};
        if (newLocked[region][0][gi] == null) {
          newLocked[region][0][gi] = winnerInfo.seed;
          changed = true;
          newCompleted.push({
            round: "R64",
            teams: `${game.home.name} ${game.home.score}, ${game.away.name} ${game.away.score}`,
            winner: game.winner,
            region,
          });
        }
      }

      if (changed) {
        setLocked(newLocked);
        setCompletedGames(prev => {
          const existing = new Set(prev.map(g => g.winner));
          return [...prev, ...newCompleted.filter(g => !existing.has(g.winner))];
        });
      }

      // Adjust poll interval: 30s if live games, 5min otherwise
      const hasLive = allGames.some(g => g.status === "live");
      const interval = hasLive ? 30000 : 300000;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchScores, interval);

      return allGames;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  const startPolling = useCallback(() => {
    setIsPolling(true);
    fetchScores();
  }, [fetchScores]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Manual lock (for games the auto-lock can't handle, like later rounds)
  const manualLock = useCallback((region, roundIdx, gameIdx, winningSeed) => {
    setLocked(prev => {
      const next = { ...prev };
      if (!next[region][roundIdx]) next[region][roundIdx] = {};
      next[region][roundIdx][gameIdx] = winningSeed;
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-fetch on mount so data is available immediately
  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  return {
    liveGames,
    lastUpdate,
    locked,
    lockedFF,
    completedGames,
    isPolling,
    error,
    startPolling,
    stopPolling,
    fetchScores,
    manualLock,
  };
}
