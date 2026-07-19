/**
 * Live match hub — server-side poll + WebSocket fan-out
 * Clients subscribe with { type: "live_subscribe", leagueId, matchId }
 * Server pushes { type: "live", ...pack } and { type: "live_events", events: [...] }
 */

import { getMatchSnapshot, demoSnapshot } from "../providers/index.js";
import { generateLiveAi } from "../engine/liveAi.js";
import { getProgressiveDemo } from "../providers/demoLive.js";

const POLL_MS = Number(process.env.LIVE_POLL_MS || 5000);

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();
/** @type {Map<string, { timer: NodeJS.Timeout, last: object|null, cornerSeen: object }>} */
const polls = new Map();

let broadcastFn = () => {};

export function setBroadcaster(fn) {
  broadcastFn = fn;
}

export function roomKey(leagueId, matchId) {
  return `${leagueId || "x"}:${matchId || "demo"}`;
}

export function subscribe(ws, leagueId, matchId) {
  const key = roomKey(leagueId, matchId);
  if (!rooms.has(key)) rooms.set(key, new Set());
  rooms.get(key).add(ws);
  ensurePoll(key, leagueId, matchId);
  // immediate snapshot
  fetchAndPush(key, leagueId, matchId, true).catch(() => {});
  return key;
}

export function unsubscribe(ws) {
  for (const [key, set] of rooms) {
    set.delete(ws);
    if (set.size === 0) {
      rooms.delete(key);
      stopPoll(key);
    }
  }
}

function ensurePoll(key, leagueId, matchId) {
  if (polls.has(key)) return;
  const timer = setInterval(() => {
    const set = rooms.get(key);
    if (!set || set.size === 0) {
      stopPoll(key);
      return;
    }
    fetchAndPush(key, leagueId, matchId, false).catch(() => {});
  }, POLL_MS);
  polls.set(key, { timer, last: null, cornerSeen: { home: 0, away: 0 } });
}

function stopPoll(key) {
  const p = polls.get(key);
  if (p?.timer) clearInterval(p.timer);
  polls.delete(key);
}

async function loadSnap(leagueId, matchId) {
  if (String(matchId).startsWith("demo")) {
    return getProgressiveDemo();
  }
  return getMatchSnapshot(leagueId, matchId);
}

function fingerprint(snap) {
  const ev = (snap.events || []).map((e) => e.id).join("|");
  const sc = `${snap.score?.home}-${snap.score?.away}`;
  const st = `${snap.clock}|${snap.status}`;
  const c = `${snap.matchStats?.home?.corners}-${snap.matchStats?.away?.corners}`;
  return `${sc}|${st}|${c}|${ev}`;
}

function diffEvents(prev, next) {
  if (!prev) return next.events || [];
  const seen = new Set((prev.events || []).map((e) => e.id));
  return (next.events || []).filter((e) => !seen.has(e.id));
}

function synthesizeCornerEvents(prevStats, nextStats, clock, homeName, awayName) {
  const out = [];
  if (!nextStats) return out;
  const ph = prevStats?.home?.corners ?? 0;
  const pa = prevStats?.away?.corners ?? 0;
  const nh = nextStats.home?.corners ?? 0;
  const na = nextStats.away?.corners ?? 0;
  for (let i = ph; i < nh; i++) {
    out.push({
      id: `syn-corner-h-${i + 1}-${clock}`,
      type: "corner",
      clock: clock || "—",
      minute: 99900 + i,
      side: "home",
      team: homeName,
      player: "",
      text: `🚩 ${homeName} 角球 (#${i + 1})`,
      synthetic: true,
    });
  }
  for (let i = pa; i < na; i++) {
    out.push({
      id: `syn-corner-a-${i + 1}-${clock}`,
      type: "corner",
      clock: clock || "—",
      minute: 99900 + i,
      side: "away",
      team: awayName,
      player: "",
      text: `🚩 ${awayName} 角球 (#${i + 1})`,
      synthetic: true,
    });
  }
  return out;
}

export async function fetchAndPush(key, leagueId, matchId, force) {
  const snap = await loadSnap(leagueId, matchId);
  const state = polls.get(key) || { last: null };
  const prev = state.last;

  // merge synthetic corners into event stream for finer grain
  const syn = synthesizeCornerEvents(
    prev?.matchStats,
    snap.matchStats,
    snap.clock,
    snap.home?.name,
    snap.away?.name
  );
  if (syn.length) {
    const existing = new Set((snap.events || []).map((e) => e.id));
    snap.events = [...(snap.events || []), ...syn.filter((e) => !existing.has(e.id))];
    snap.events.sort((a, b) => a.minute - b.minute);
  }

  const fp = fingerprint(snap);
  if (!force && prev && prev._fp === fp) {
    // still push soft tick (clock) occasionally for live
    if (snap.status === "live") {
      broadcastFn(key, {
        type: "live_tick",
        matchId: snap.matchId,
        clock: snap.clock,
        score: snap.score,
        status: snap.status,
        at: new Date().toISOString(),
      });
    }
    return;
  }

  const newEvents = diffEvents(prev, snap);
  const liveAi = await generateLiveAi(snap);

  const pack = {
    type: "live",
    matchId: snap.matchId,
    leagueId: snap.leagueId || leagueId,
    league: snap.league,
    status: snap.status,
    statusDetail: snap.statusDetail,
    clock: snap.clock,
    score: snap.score,
    home: { name: snap.home?.name, short: snap.home?.short, id: snap.home?.id },
    away: { name: snap.away?.name, short: snap.away?.short, id: snap.away?.id },
    events: snap.events || [],
    newEvents,
    matchStats: snap.matchStats || null,
    attack: snap.attack || null,
    h2h: snap.h2h || [],
    liveAi,
    source: snap.source,
    odds: snap.odds || null,
    fetchedAt: new Date().toISOString(),
    via: "websocket",
  };

  if (polls.has(key)) {
    polls.get(key).last = { ...snap, _fp: fp };
  } else {
    polls.set(key, {
      timer: null,
      last: { ...snap, _fp: fp },
      cornerSeen: {},
    });
  }

  broadcastFn(key, pack);
  if (newEvents.length) {
    broadcastFn(key, {
      type: "live_events",
      matchId: snap.matchId,
      events: newEvents,
      at: new Date().toISOString(),
    });
  }
}

export function getRoomSize(key) {
  return rooms.get(key)?.size || 0;
}

export function listActiveRooms() {
  return [...rooms.keys()];
}
