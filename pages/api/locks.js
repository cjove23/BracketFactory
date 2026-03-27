// pages/api/locks.js
// Persists bracket lock state to Redis
// GET: returns saved locks
// POST: saves current lock state

let redis = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    var { Redis } = require("@upstash/redis");
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
} catch (e) { /* Redis not available */ }

var REDIS_KEY = "bracket_locks";
var REDIS_KEY_FF = "bracket_locks_ff";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=5");

  if (!redis) {
    return res.status(200).json({ locked: null, lockedFF: null, error: "Redis not connected" });
  }

  try {
    if (req.method === "POST") {
      // Save locks
      var body = req.body;
      if (body.locked) {
        await redis.set(REDIS_KEY, JSON.stringify(body.locked), { ex: 60 * 60 * 24 * 60 });
      }
      if (body.lockedFF) {
        await redis.set(REDIS_KEY_FF, JSON.stringify(body.lockedFF), { ex: 60 * 60 * 24 * 60 });
      }
      return res.status(200).json({ saved: true });
    }

    // GET: load locks
    var lockedData = await redis.get(REDIS_KEY);
    var lockedFFData = await redis.get(REDIS_KEY_FF);

    var locked = null;
    var lockedFF = null;

    if (lockedData) {
      locked = typeof lockedData === "string" ? JSON.parse(lockedData) : lockedData;
    }
    if (lockedFFData) {
      lockedFF = typeof lockedFFData === "string" ? JSON.parse(lockedFFData) : lockedFFData;
    }

    return res.status(200).json({ locked: locked, lockedFF: lockedFF });
  } catch (err) {
    console.error("Locks API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
