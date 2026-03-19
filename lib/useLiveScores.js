// lib/useLiveScores.js
// Polls /api/scores, auto-locks completed tournament games across ALL rounds
import { useState, useEffect, useCallback, useRef } from "react";
import { TEAMS, REGION_NAMES, SEED_ORDER } from "./bracket";

// Build reverse lookup: team name → { region, seed }
const TEAM_LOOKUP = {};
for (const r of REGION_NAMES) {
  for (let s = 1; s <= 16; s++) {
    TEAM_LOOKUP[TEAMS[r][s].name] = { region: r, seed: s };
  }
}

const ROUND_NAMES = ["R64", "R32", "S16", "E8"];

// Walk a region's bracket tree and return the known participants for each game slot.
// Returns array of rounds, each round is array of { seedA, seedB, nameA, nameB } or null if unknown.
function walkRegionBracket(region, locks) {
  const rData = TEAMS[region];
  let currentSeeds = SEED_ORDER.slice(); // 16 seeds in bracket order

  const rounds = [];
  for (let roundIdx = 0; roundIdx < 4; roundIdx++) {
    const roundGames = [];
    const nextSeeds = [];
    const roundLocks = locks[roundIdx];

    for (let gi = 0; gi < currentSeeds.length / 2; gi++) {
      const sA = currentSeeds[gi * 2];
      const sB = currentSeeds[gi * 2 + 1];

      if (sA == null || sB == null) {
        roundGames.push(null);
        nextSeeds.push(null);
        continue;
      }

      roundGames.push({
        seedA: sA, seedB: sB,
        nameA: rData[sA].name, nameB: rData[sB].name,
      });

      if (roundLocks && roundLocks[gi] != null) {
        nextSeeds.push(roundLocks[gi]);
      } else {
        nextSeeds.push(null);
      }
    }

    rounds.push(roundGames);
    currentSeeds = nextSeeds;
  }

  // Return the region winner seed if fully resolved
  const regionWinnerSeed = currentSeeds.length === 1 ? currentSeeds[0] : null;
  return { rounds, regionWinnerSeed };
}

// Build a lookup of ESPN final games by both team names for fast matching
function buildFinalGamesLookup(allGames) {
  const byMatchup = {};
  for (const game of allGames) {
    if (game.status !== "final" || !game.winner) continue;
    const home = game.home.name;
    const away = game.away.name;
    // Key by sorted pair so order doesn't matter
    const key = [home, away].sort().join("|");
    byMatchup[key] = game;
  }
  return byMatchup;
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
  const [detectedInjuries, setDetectedInjuries] = useState([]);
  const [injuryAlerts, setInjuryAlerts] = useState([]);
  const intervalRef = useRef(null);
  const lockedRef = useRef(locked);
  const lockedFFRef = useRef(lockedFF);
  const initialFetchDone = useRef(false);
  const allGamesCache = useRef({});
  const knownInjuryKeys = useRef(new Set());
  lockedRef.current = locked;
  lockedFFRef.current = lockedFF;

  const fetchScores = useCallback(async () => {
    try {
      // First load: wide window (7 days back + 2 forward) to catch all tournament games
      // Subsequent polls: narrow window (today + tomorrow) for speed
      const today = new Date();
      const dates = [];
      if (!initialFetchDone.current) {
        for (let d = -7; d <= 2; d++) {
          const dt = new Date(today);
          dt.setDate(dt.getDate() + d);
          dates.push(dt.toISOString().slice(0, 10).replace(/-/g, ""));
        }
        initialFetchDone.current = true;
      } else {
        for (let d = 0; d <= 1; d++) {
          const dt = new Date(today);
          dt.setDate(dt.getDate() + d);
          dates.push(dt.toISOString().slice(0, 10).replace(/-/g, ""));
        }
      }

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

      // Merge into persistent cache — update existing games (status changes), add new ones
      for (const g of allGames) {
        allGamesCache.current[g.id] = g;
      }
      const mergedGames = Object.values(allGamesCache.current);

      setLiveGames(mergedGames);
      setLastUpdate(new Date().toISOString());
      setError(null);

      // ── Auto-detect injuries from ESPN ──
      try {
        const injRes = await fetch("/api/injuries");
        if (injRes.ok) {
          const injData = await injRes.json();
          const outPlayers = injData.out || [];
          const gtdPlayers = injData.questionable || [];
          const allDetected = [...outPlayers.map(p => ({ ...p, status: "OUT" })), ...gtdPlayers.map(p => ({ ...p, status: "GTD" }))];

          // Find new injuries we haven't seen before
          const newAlerts = [];
          for (const inj of allDetected) {
            const key = `${inj.team}|${inj.player}`;
            if (!knownInjuryKeys.current.has(key)) {
              knownInjuryKeys.current.add(key);
              newAlerts.push(inj);
            }
          }

          setDetectedInjuries(outPlayers);
          if (newAlerts.length > 0) {
            setInjuryAlerts(prev => [...prev, ...newAlerts]);
          }
        }
      } catch (e) { /* injury fetch is best-effort */ }

      // ── Full bracket auto-lock ──
      const finalGames = buildFinalGamesLookup(mergedGames);
      const newLocked = JSON.parse(JSON.stringify(lockedRef.current)); // deep copy
      const newLockedFF = { ...lockedFFRef.current, f4: [...lockedFFRef.current.f4] };
      let changed = false;
      const newCompleted = [];

      // Lock region rounds (R64, R32, S16, E8)
      for (const region of REGION_NAMES) {
        // Re-walk the bracket each pass since new locks from earlier rounds enable later rounds
        let madeProgress = true;
        while (madeProgress) {
          madeProgress = false;
          const { rounds } = walkRegionBracket(region, newLocked[region]);

          for (let roundIdx = 0; roundIdx < 4; roundIdx++) {
            const roundGames = rounds[roundIdx];
            if (!newLocked[region][roundIdx]) newLocked[region][roundIdx] = {};

            for (let gi = 0; gi < roundGames.length; gi++) {
              // Skip if already locked or matchup unknown
              if (newLocked[region][roundIdx][gi] != null) continue;
              const matchup = roundGames[gi];
              if (!matchup) continue;

              // Look for a final ESPN game matching these two teams
              const key = [matchup.nameA, matchup.nameB].sort().join("|");
              const espnGame = finalGames[key];
              if (!espnGame) continue;

              // Found it — lock the winner
              const winnerInfo = TEAM_LOOKUP[espnGame.winner];
              if (!winnerInfo || winnerInfo.region !== region) continue;

              newLocked[region][roundIdx][gi] = winnerInfo.seed;
              changed = true;
              madeProgress = true;
              newCompleted.push({
                round: ROUND_NAMES[roundIdx],
                teams: `${espnGame.home.name} ${espnGame.home.score}, ${espnGame.away.name} ${espnGame.away.score}`,
                winner: espnGame.winner,
                region,
              });
            }
          }
        }
      }

      // Lock Final Four (East vs South = semifinal 0, West vs Midwest = semifinal 1)
      const regionWinners = REGION_NAMES.map(r => {
        const { regionWinnerSeed } = walkRegionBracket(r, newLocked[r]);
        if (regionWinnerSeed == null) return null;
        return { seed: regionWinnerSeed, name: TEAMS[r][regionWinnerSeed].name, region: r };
      });

      for (let si = 0; si < 2; si++) {
        if (newLockedFF.f4[si] != null) continue;
        const a = regionWinners[si * 2], b = regionWinners[si * 2 + 1];
        if (!a || !b) continue;

        const key = [a.name, b.name].sort().join("|");
        const espnGame = finalGames[key];
        if (!espnGame) continue;

        const winnerInfo = TEAM_LOOKUP[espnGame.winner];
        if (!winnerInfo) continue;

        newLockedFF.f4[si] = winnerInfo.seed;
        changed = true;
        newCompleted.push({
          round: "F4",
          teams: `${espnGame.home.name} ${espnGame.home.score}, ${espnGame.away.name} ${espnGame.away.score}`,
          winner: espnGame.winner,
          region: `${a.region} / ${b.region}`,
        });
      }

      // Lock NCG
      if (newLockedFF.ncg == null) {
        const f4Winners = [];
        for (let si = 0; si < 2; si++) {
          if (newLockedFF.f4[si] != null) {
            const a = regionWinners[si * 2], b = regionWinners[si * 2 + 1];
            if (a && b) {
              f4Winners.push(a.seed === newLockedFF.f4[si] ? a : b);
            } else { f4Winners.push(null); }
          } else { f4Winners.push(null); }
        }

        if (f4Winners[0] && f4Winners[1]) {
          const key = [f4Winners[0].name, f4Winners[1].name].sort().join("|");
          const espnGame = finalGames[key];
          if (espnGame) {
            const winnerInfo = TEAM_LOOKUP[espnGame.winner];
            if (winnerInfo) {
              newLockedFF.ncg = winnerInfo.seed;
              changed = true;
              newCompleted.push({
                round: "NCG",
                teams: `${espnGame.home.name} ${espnGame.home.score}, ${espnGame.away.name} ${espnGame.away.score}`,
                winner: espnGame.winner,
                region: "Championship",
              });
            }
          }
        }
      }

      if (changed) {
        setLocked(newLocked);
        setLockedFF(newLockedFF);
        setCompletedGames(prev => {
          const existing = new Set(prev.map(g => g.winner));
          return [...prev, ...newCompleted.filter(g => !existing.has(g.winner))];
        });
      }

      // Adjust poll interval: 30s if live games, 5min otherwise
      const hasLive = mergedGames.some(g => g.status === "live");
      const interval = hasLive ? 30000 : 300000;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchScores, interval);

      return mergedGames;
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

  // Manual lock (fallback)
  const manualLock = useCallback((region, roundIdx, gameIdx, winningSeed) => {
    setLocked(prev => {
      const next = JSON.parse(JSON.stringify(prev));
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

  // Auto-fetch on mount
  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const dismissAlerts = useCallback(() => setInjuryAlerts([]), []);

  return {
    liveGames,
    lastUpdate,
    locked,
    lockedFF,
    completedGames,
    isPolling,
    error,
    detectedInjuries,
    injuryAlerts,
    startPolling,
    stopPolling,
    fetchScores,
    manualLock,
    dismissAlerts,
  };
}
