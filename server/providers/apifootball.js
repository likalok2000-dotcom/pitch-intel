/**
 * API-Football (api-sports.io) optional provider for real lineups / fixtures
 * Env: API_FOOTBALL_KEY
 * Docs: https://www.api-football.com/documentation-v3
 */

const BASE = process.env.API_FOOTBALL_BASE || "https://v3.football.api-sports.io";

export const AF_LEAGUES = {
  "eng.1": { id: 39, name: "Premier League" },
  "esp.1": { id: 140, name: "La Liga" },
  "ita.1": { id: 135, name: "Serie A" },
  "ger.1": { id: 78, name: "Bundesliga" },
  "fra.1": { id: 61, name: "Ligue 1" },
  "uefa.champions": { id: 2, name: "Champions League" },
  "swe.1": { id: 113, name: "Allsvenskan" },
};

const cache = new Map();

function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
}

export function apiFootballEnabled() {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

async function afGet(path, params = {}) {
  if (!process.env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY not set");
  }
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": process.env.API_FOOTBALL_KEY,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  return res.json();
}

function currentSeason() {
  const y = new Date().getUTCFullYear();
  const m = new Date().getUTCMonth() + 1;
  // European seasons start ~Aug
  return m >= 7 ? y : y - 1;
}

/**
 * List today's fixtures for a mapped league
 */
export async function listFixtures(leagueId = "eng.1") {
  const meta = AF_LEAGUES[leagueId];
  if (!meta) throw new Error(`No API-Football mapping for ${leagueId}`);

  const key = `af:fx:${leagueId}`;
  const cached = cacheGet(key, 30_000);
  if (cached) return cached;

  const t0 = Date.now();
  const season = currentSeason();
  const today = new Date().toISOString().slice(0, 10);

  let data;
  try {
    data = await afGet("/fixtures", {
      league: meta.id,
      season,
      date: today,
    });
    // if empty, try next 7 days window via next=
    if (!(data.response || []).length) {
      data = await afGet("/fixtures", {
        league: meta.id,
        season,
        next: 15,
      });
    }
  } catch (e) {
    throw e;
  }

  const matches = (data.response || []).map((row) => {
    const f = row.fixture || {};
    const teams = row.teams || {};
    const goals = row.goals || {};
    const status = f.status?.short || "NS";
    let st = "pre";
    if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(status)) st = "live";
    else if (["FT", "AET", "PEN"].includes(status)) st = "post";

    return {
      matchId: `af-${f.id}`,
      fixtureId: f.id,
      leagueId,
      league: row.league?.name || meta.name,
      kickoff: f.date,
      status: st,
      statusDetail: f.status?.long || status,
      clock: f.status?.elapsed != null ? `${f.status.elapsed}'` : "",
      home: {
        name: teams.home?.name || "Home",
        short: teams.home?.name?.slice(0, 3)?.toUpperCase() || "HOM",
        score: goals.home ?? 0,
        form: "",
        id: String(teams.home?.id || ""),
      },
      away: {
        name: teams.away?.name || "Away",
        short: teams.away?.name?.slice(0, 3)?.toUpperCase() || "AWY",
        score: goals.away ?? 0,
        form: "",
        id: String(teams.away?.id || ""),
      },
      venue: f.venue?.name || "",
      provider: "api-football",
    };
  });

  const payload = {
    leagueId,
    league: meta.name,
    matches,
    source: {
      name: "api-football",
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      reliability: "high",
    },
  };
  cacheSet(key, payload);
  return payload;
}

export async function getFixtureSnapshot(leagueId, matchId) {
  const rawId = String(matchId).replace(/^af-/, "");
  const fixtureId = Number(rawId);
  if (!fixtureId) throw new Error("Invalid API-Football fixture id");

  const key = `af:snap:${fixtureId}`;
  const cached = cacheGet(key, 12_000);
  if (cached) return { ...cached, cached: true };

  const t0 = Date.now();
  const [fx, lineups] = await Promise.all([
    afGet("/fixtures", { id: fixtureId }),
    afGet("/fixtures/lineups", { fixture: fixtureId }).catch(() => ({ response: [] })),
  ]);

  const row = (fx.response || [])[0];
  if (!row) throw new Error("Fixture not found");

  const f = row.fixture || {};
  const teams = row.teams || {};
  const goals = row.goals || {};
  const status = f.status?.short || "NS";
  let st = "pre";
  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(status)) st = "live";
  else if (["FT", "AET", "PEN"].includes(status)) st = "post";

  const homeName = teams.home?.name || "Home";
  const awayName = teams.away?.name || "Away";

  const { parseApiFootballLineups, playersFromLineups } = await import("./lineups.js");
  const lu = parseApiFootballLineups(lineups, homeName, awayName);

  const homePlayers = playersFromLineups(lu.home);
  const awayPlayers = playersFromLineups(lu.away);

  const snap = {
    matchId: `af-${fixtureId}`,
    eventId: String(fixtureId),
    fixtureId,
    leagueId,
    league: row.league?.name || AF_LEAGUES[leagueId]?.name || leagueId,
    status: st,
    statusDetail: f.status?.long || status,
    clock: f.status?.elapsed != null ? `${f.status.elapsed}'` : "0'",
    kickoff: f.date,
    venue: f.venue?.name || "",
    home: {
      id: String(teams.home?.id || ""),
      name: homeName,
      short: homeName.slice(0, 3).toUpperCase(),
      form: "",
      gpg: 1.3,
      gapg: 1.15,
      players: homePlayers,
      coach: lu.home.coach,
      formation: lu.home.formation,
    },
    away: {
      id: String(teams.away?.id || ""),
      name: awayName,
      short: awayName.slice(0, 3).toUpperCase(),
      form: "",
      gpg: 1.2,
      gapg: 1.2,
      players: awayPlayers,
      coach: lu.away.coach,
      formation: lu.away.formation,
    },
    score: { home: goals.home ?? 0, away: goals.away ?? 0 },
    odds: { provider: "default", home: 2.4, draw: 3.3, away: 2.9 },
    lineups: lu,
    lineupsConfirmed: lu.confirmed,
    source: {
      name: "api-football",
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      reliability: lu.confirmed ? "high" : "med",
    },
    notes: ["API-Football", lu.confirmed ? "lineups confirmed" : "lineups pending"],
    offline: false,
  };

  cacheSet(key, snap);
  return snap;
}

/**
 * Enrich an ESPN (or other) snapshot with AF lineups by team name search — best effort
 */
export async function enrichLineupsByTeamNames(snap) {
  if (!apiFootballEnabled()) return snap;
  const meta = AF_LEAGUES[snap.leagueId];
  if (!meta) return snap;

  try {
    const season = currentSeason();
    const data = await afGet("/fixtures", {
      league: meta.id,
      season,
      next: 20,
    });
    const homeKey = (snap.home?.name || "").toLowerCase();
    const awayKey = (snap.away?.name || "").toLowerCase();
    const hit = (data.response || []).find((row) => {
      const h = (row.teams?.home?.name || "").toLowerCase();
      const a = (row.teams?.away?.name || "").toLowerCase();
      return (
        (h.includes(homeKey.slice(0, 5)) || homeKey.includes(h.slice(0, 5))) &&
        (a.includes(awayKey.slice(0, 5)) || awayKey.includes(a.slice(0, 5)))
      );
    });
    if (!hit?.fixture?.id) return snap;

    const lineups = await afGet("/fixtures/lineups", { fixture: hit.fixture.id });
    const { parseApiFootballLineups, playersFromLineups } = await import("./lineups.js");
    const lu = parseApiFootballLineups(lineups, snap.home?.name, snap.away?.name);
    if (!lu.confirmed) return snap;

    return {
      ...snap,
      lineups: lu,
      lineupsConfirmed: true,
      home: {
        ...snap.home,
        players: playersFromLineups(lu.home, snap.home?.players),
        coach: lu.home.coach || snap.home?.coach,
        formation: lu.home.formation,
      },
      away: {
        ...snap.away,
        players: playersFromLineups(lu.away, snap.away?.players),
        coach: lu.away.coach || snap.away?.coach,
        formation: lu.away.formation,
      },
      source: {
        ...snap.source,
        enrichedBy: "api-football-lineups",
        reliability: "high",
      },
      notes: [...(snap.notes || []), "Lineups enriched via API-Football"],
    };
  } catch {
    return snap;
  }
}
