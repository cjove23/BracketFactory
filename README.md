# Bracket Factory v8 — Live Tournament Tracking

KenPom-calibrated March Madness bracket simulation with live ESPN score integration.

## Model Features
- **normalCDF win probability** with tempo-adjusted point spreads (SD=11.5)
- **Offense/Defense balance** per-game SD adjustment
- **Geography boosts** (Houston +2.0 at Toyota Center, etc.)
- **Injury adjustments** (Michigan -3.5, UNC -5.0, Texas Tech -4.0, Duke -1.0)
- **Pool optimization** with expected value rankings
- **Live score polling** via ESPN API proxy

## Deploy to Vercel

```bash
# 1. Install dependencies
npm install

# 2. Run locally
npm run dev
# → Open http://localhost:3000

# 3. Deploy to Vercel
npx vercel
# Or connect your GitHub repo at vercel.com
```

## Project Structure

```
bracket-factory/
├── pages/
│   ├── index.js          # Main app (UI, simulation runner, bracket viz)
│   └── api/
│       └── scores.js     # Serverless function — proxies ESPN scoreboard API
├── lib/
│   ├── bracket.js        # Team data, model functions, simulation engine
│   └── useLiveScores.js  # React hook for live polling + auto-locking
├── package.json
└── README.md
```

## How Live Tracking Works

1. Click **GO LIVE** to start polling `/api/scores` (ESPN proxy)
2. Polls every 30s during live games, every 5min otherwise
3. When a tournament game status flips to "final", it auto-locks into the bracket state
4. Re-run simulation to see updated championship probabilities
5. The bracket tab fills in with real results as games complete

## How to Manually Lock Results

If auto-lock misses a game (e.g., later rounds where matchup detection is harder),
you can manually lock results in `lib/bracket.js` in the LOCKED object:

```javascript
// Example: Duke beats Siena in R64 (East region, game 0)
const LOCKED = {
  East: { 0: { 0: 1 } },  // roundIdx: { gameIdx: winningSeed }
  ...
};
```

## API Route

`GET /api/scores` — Returns structured tournament game data:
```json
{
  "timestamp": "2026-03-19T18:30:00Z",
  "gameCount": 16,
  "live": 4,
  "final": 8,
  "scheduled": 4,
  "games": [
    {
      "id": "...",
      "status": "live",
      "detail": "8:32 - 2nd",
      "home": { "name": "Duke", "seed": 1, "score": 45 },
      "away": { "name": "Siena", "seed": 16, "score": 22 },
      "winner": null
    }
  ]
}
```

Optional query param: `?date=20260319` for a specific date.
