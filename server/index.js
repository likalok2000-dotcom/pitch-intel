/**
 * PitchIntel 波析 AI — API + WebSocket chat + static web
 */

import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";

import {
  LEAGUES,
  listMatches,
  getMatchSnapshot,
  demoSnapshot,
  providerStatus,
} from "./providers/index.js";
import { analyzeMatch } from "./engine/analyze.js";
import { ANALYSTS } from "./engine/analysts.js";
import { PREDICTION_SITES } from "./engine/sites.js";
import { generateAiNarrative, aiEnabled } from "./ai/grok.js";
import { generateLiveAi } from "./engine/liveAi.js";
import {
  setBroadcaster,
  subscribe as liveSubscribe,
  unsubscribe as liveUnsubscribe,
  roomKey as liveRoomKey,
  listActiveRooms,
} from "./jobs/liveHub.js";
import {
  oddsApiEnabled,
  oddsApiStatus,
  fetchLeagueOdds,
  matchOddsForFixture,
} from "./providers/oddsapi.js";
import { getProgressiveDemo } from "./providers/demoLive.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");
const PORT = Number(process.env.PORT || 8866);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(WEB, { maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));

// In-memory chat rooms: matchKey -> messages[]
const chatRooms = new Map();
const MAX_CHAT = 200;
// Tips votes: matchKey -> { home, draw, away }
const tipVotes = new Map();

function roomKey(leagueId, matchId) {
  return `${leagueId || "x"}:${matchId || "demo"}`;
}

function getRoom(key) {
  if (!chatRooms.has(key)) chatRooms.set(key, []);
  return chatRooms.get(key);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "pitch-intel",
    brand: "波析 AI",
    version: "1.3.1",
    ai: aiEnabled(),
    providers: {
      ...providerStatus(),
      oddsApi: oddsApiEnabled(),
    },
    liveRooms: listActiveRooms().length,
    features: [
      "live-board",
      "live-timeline",
      "live-ws-push",
      "live-ai-brief",
      "pitch-2d",
      "pitch-3d",
      "corners-subs-detail",
      "odds-api",
      "ai-match-analysis",
      "top10-analysts",
      "top10-prediction-sites",
      "player-coach-strength",
      "real-lineups",
      "i18n",
      "match-chat",
      "tips-vote",
      "h2h",
    ],
  });
});

app.get("/api/leagues", (_req, res) => {
  res.json({ leagues: LEAGUES, providers: providerStatus() });
});

app.get("/api/meta/analysts", (_req, res) => {
  res.json({ analysts: ANALYSTS });
});

app.get("/api/meta/sites", (_req, res) => {
  res.json({
    sites: PREDICTION_SITES,
    disclaimer:
      "Reputation labels are community references; outputs are methodology simulations, not live scrapes.",
  });
});

app.get("/api/matches", async (req, res) => {
  const leagueId = String(req.query.league || "eng.1");
  try {
    const data = await listMatches(leagueId);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.get("/api/matches/:leagueId/:matchId", async (req, res) => {
  try {
    const snap = await getMatchSnapshot(req.params.leagueId, req.params.matchId);
    res.json(snap);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

/** Explicit lineups endpoint */
app.get("/api/lineups/:leagueId/:matchId", async (req, res) => {
  try {
    const snap = await getMatchSnapshot(req.params.leagueId, req.params.matchId);
    res.json({
      matchId: snap.matchId,
      leagueId: snap.leagueId,
      home: snap.home?.name,
      away: snap.away?.name,
      lineupsConfirmed: Boolean(snap.lineupsConfirmed),
      lineups: snap.lineups || null,
      homePlayers: snap.home?.players || [],
      awayPlayers: snap.away?.players || [],
      homeCoach: snap.home?.coach || null,
      awayCoach: snap.away?.coach || null,
      homeFormation: snap.home?.formation || null,
      awayFormation: snap.away?.formation || null,
      source: snap.source,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.get("/api/demo", (_req, res) => {
  res.json(getProgressiveDemo());
});

/** Live pack: score + events + stats + 2D attack + live AI brief */
app.get("/api/live/:leagueId/:matchId", async (req, res) => {
  try {
    let snap;
    if (String(req.params.matchId).startsWith("demo")) {
      snap = getProgressiveDemo();
    } else {
      snap = await getMatchSnapshot(req.params.leagueId, req.params.matchId);
    }
    const liveAi = await generateLiveAi(snap);
    res.json({
      matchId: snap.matchId,
      leagueId: snap.leagueId,
      league: snap.league,
      status: snap.status,
      statusDetail: snap.statusDetail,
      clock: snap.clock,
      score: snap.score,
      home: { name: snap.home?.name, short: snap.home?.short, id: snap.home?.id },
      away: { name: snap.away?.name, short: snap.away?.short, id: snap.away?.id },
      events: snap.events || [],
      matchStats: snap.matchStats || null,
      attack: snap.attack || null,
      h2h: snap.h2h || [],
      liveAi,
      source: snap.source,
      odds: snap.odds || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

/** Odds board — live The Odds API or demo fallback */
app.get("/api/odds", async (req, res) => {
  try {
    const leagueId = String(req.query.league || "eng.1");
    const pack = await fetchLeagueOdds(leagueId);
    res.json({
      enabled: true,
      live: oddsApiEnabled() && !pack.demo,
      status: oddsApiStatus(),
      ...pack,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

/** The Odds API — match a fixture */
app.get("/api/odds/match", async (req, res) => {
  try {
    const leagueId = String(req.query.league || "eng.1");
    const home = String(req.query.home || "");
    const away = String(req.query.away || "");
    const result = await matchOddsForFixture(leagueId, home, away);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.get("/api/tips/:leagueId/:matchId", (req, res) => {
  const key = roomKey(req.params.leagueId, req.params.matchId);
  const v = tipVotes.get(key) || { home: 0, draw: 0, away: 0 };
  const total = v.home + v.draw + v.away || 1;
  res.json({
    votes: v,
    total: v.home + v.draw + v.away,
    pct: {
      home: +((v.home / total) * 100).toFixed(1),
      draw: +((v.draw / total) * 100).toFixed(1),
      away: +((v.away / total) * 100).toFixed(1),
    },
  });
});

app.post("/api/tips/:leagueId/:matchId", (req, res) => {
  const key = roomKey(req.params.leagueId, req.params.matchId);
  const pick = String(req.body?.pick || "").toLowerCase();
  if (!["home", "draw", "away"].includes(pick)) {
    return res.status(400).json({ error: "pick must be home|draw|away" });
  }
  const v = tipVotes.get(key) || { home: 0, draw: 0, away: 0 };
  v[pick] += 1;
  tipVotes.set(key, v);
  const total = v.home + v.draw + v.away || 1;
  res.json({
    ok: true,
    votes: v,
    total,
    pct: {
      home: +((v.home / total) * 100).toFixed(1),
      draw: +((v.draw / total) * 100).toFixed(1),
      away: +((v.away / total) * 100).toFixed(1),
    },
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const {
      leagueId = "eng.1",
      matchId,
      odds,
      injuryNotes = "",
      coachHome,
      coachAway,
      snapshot,
      withAi = true,
    } = req.body || {};

    let snap = snapshot;
    if (!snap) {
      if (!matchId || String(matchId).startsWith("demo")) {
        snap = demoSnapshot();
      } else {
        snap = await getMatchSnapshot(leagueId, matchId);
      }
    }

    const analysis = analyzeMatch(snap, {
      odds,
      injuryNotes,
      coachHome,
      coachAway,
    });

    let ai = null;
    if (withAi) {
      ai = await generateAiNarrative(analysis, snap);
    }

    res.json({
      match: {
        matchId: snap.matchId,
        leagueId: snap.leagueId,
        league: snap.league,
        home: snap.home?.name,
        away: snap.away?.name,
        score: snap.score,
        status: snap.status,
        clock: snap.clock,
        venue: snap.venue,
        kickoff: snap.kickoff,
        lineupsConfirmed: snap.lineupsConfirmed,
        source: snap.source,
      },
      analysis,
      ai,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/chat/:leagueId/:matchId", (req, res) => {
  const key = roomKey(req.params.leagueId, req.params.matchId);
  res.json({ room: key, messages: getRoom(key) });
});

app.post("/api/chat/:leagueId/:matchId", (req, res) => {
  const key = roomKey(req.params.leagueId, req.params.matchId);
  const room = getRoom(key);
  const nick = String(req.body?.nick || "球迷").slice(0, 24);
  const text = String(req.body?.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "empty" });

  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nick,
    text,
    at: new Date().toISOString(),
  };
  room.push(msg);
  if (room.length > MAX_CHAT) room.splice(0, room.length - MAX_CHAT);

  broadcastChat(key, msg);
  res.json({ ok: true, message: msg });
});

// SPA fallback for non-API routes (deploy-friendly)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
  res.sendFile(path.join(WEB, "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

/** @type {Map<import('ws').WebSocket, { chat: string|null, live: string|null }>} */
const wsMeta = new Map();

function broadcastToRoom(room, obj) {
  const payload = typeof obj === "string" ? obj : JSON.stringify(obj);
  for (const [ws, meta] of wsMeta) {
    if (ws.readyState !== 1) continue;
    if (meta.chat === room || meta.live === room) {
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}

function broadcastChat(room, msg) {
  broadcastToRoom(room, { type: "chat", room, message: msg });
}

setBroadcaster((room, pack) => {
  broadcastToRoom(room, pack);
});

wss.on("connection", (ws) => {
  wsMeta.set(ws, { chat: null, live: null });
  ws.send(
    JSON.stringify({
      type: "hello",
      service: "pitch-intel",
      version: "1.3.1",
      features: ["chat", "live_subscribe"],
    })
  );

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(String(raw));
    } catch {
      return;
    }
    const meta = wsMeta.get(ws) || { chat: null, live: null };

    if (data.type === "join") {
      const key = roomKey(data.leagueId, data.matchId);
      meta.chat = key;
      wsMeta.set(ws, meta);
      ws.send(
        JSON.stringify({
          type: "joined",
          room: key,
          messages: getRoom(key).slice(-80),
        })
      );
    }

    if (data.type === "live_subscribe") {
      const key = liveSubscribe(ws, data.leagueId, data.matchId);
      meta.live = key;
      // also attach chat room so chat works
      meta.chat = key;
      wsMeta.set(ws, meta);
      ws.send(
        JSON.stringify({
          type: "live_subscribed",
          room: key,
          pollMs: Number(process.env.LIVE_POLL_MS || 5000),
        })
      );
    }

    if (data.type === "live_unsubscribe") {
      liveUnsubscribe(ws);
      meta.live = null;
      wsMeta.set(ws, meta);
    }

    if (data.type === "chat") {
      const key = meta.chat || roomKey(data.leagueId, data.matchId);
      const room = getRoom(key);
      const nick = String(data.nick || "球迷").slice(0, 24);
      const text = String(data.text || "").trim().slice(0, 500);
      if (!text) return;
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nick,
        text,
        at: new Date().toISOString(),
      };
      room.push(msg);
      if (room.length > MAX_CHAT) room.splice(0, room.length - MAX_CHAT);
      broadcastChat(key, msg);
    }
  });

  ws.on("close", () => {
    liveUnsubscribe(ws);
    wsMeta.delete(ws);
  });
});

server.listen(PORT, HOST, () => {
  const p = providerStatus();
  console.log(`PitchIntel 波析 AI  →  http://127.0.0.1:${PORT}/`);
  console.log(
    `AI: ${aiEnabled() ? "ON" : "local"} | provider: ${p.mode} | AF: ${p.apiFootball} | OddsAPI: ${oddsApiEnabled()}`
  );
});
