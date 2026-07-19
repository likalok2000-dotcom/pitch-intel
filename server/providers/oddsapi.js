/**
 * The Odds API (https://the-odds-api.com) — real bookmaker odds
 * Env: ODDS_API_KEY
 *
 * GET https://api.the-odds-api.com/v4/sports/{sport}/odds
 *   ?regions=uk,eu&markets=h2h,spreads,totals&oddsFormat=decimal&apiKey=
 */

const BASE = "https://api.the-odds-api.com/v4";

export const ODDS_SPORT_KEYS = {
  "eng.1": "soccer_epl",
  "esp.1": "soccer_spain_la_liga",
  "ita.1": "soccer_italy_serie_a",
  "ger.1": "soccer_germany_bundesliga",
  "fra.1": "soccer_france_ligue_one",
  "uefa.champions": "soccer_uefa_champs_league",
  "swe.1": "soccer_sweden_allsvenskan",
};

const cache = new Map();

function cacheGet(key, ttl) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
}

export function oddsApiEnabled() {
  return Boolean(process.env.ODDS_API_KEY);
}

export function oddsApiStatus() {
  return {
    enabled: oddsApiEnabled(),
    sports: Object.keys(ODDS_SPORT_KEYS),
  };
}

async function oddsGet(path, params = {}) {
  if (!process.env.ODDS_API_KEY) throw new Error("ODDS_API_KEY not set");
  const url = new URL(BASE + path);
  url.searchParams.set("apiKey", process.env.ODDS_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Odds API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return { data, quota: { remaining, used } };
}

/**
 * List h2h (+ optional spreads/totals) for a league
 */
export async function fetchLeagueOdds(leagueId = "eng.1", opts = {}) {
  const sport = ODDS_SPORT_KEYS[leagueId];
  if (!sport) throw new Error(`No Odds API sport key for ${leagueId}`);

  const cacheKey = `odds:${sport}:${opts.regions || "uk,eu"}`;
  const cached = cacheGet(cacheKey, 60_000);
  if (cached) return { ...cached, cached: true };

  const markets = opts.markets || "h2h,spreads,totals";
  const regions = opts.regions || process.env.ODDS_REGIONS || "uk,eu";

  const { data, quota } = await oddsGet(`/sports/${sport}/odds`, {
    regions,
    markets,
    oddsFormat: "decimal",
  });

  const events = (Array.isArray(data) ? data : []).map((ev) => normalizeEvent(ev));
  const payload = {
    leagueId,
    sport,
    events,
    quota,
    source: "the-odds-api",
    fetchedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, payload);
  return payload;
}

function normalizeEvent(ev) {
  const books = [];
  let best = { home: null, draw: null, away: null };
  let spreads = [];
  let totals = [];

  for (const bk of ev.bookmakers || []) {
    const row = {
      bookmaker: bk.title || bk.key,
      key: bk.key,
      lastUpdate: bk.last_update,
      h2h: null,
      spreads: [],
      totals: [],
    };
    for (const m of bk.markets || []) {
      if (m.key === "h2h") {
        const h = m.outcomes?.find((o) => o.name === ev.home_team);
        const a = m.outcomes?.find((o) => o.name === ev.away_team);
        const d = m.outcomes?.find((o) => o.name === "Draw");
        row.h2h = {
          home: h?.price ?? null,
          draw: d?.price ?? null,
          away: a?.price ?? null,
        };
        if (row.h2h.home != null) {
          if (best.home == null || row.h2h.home > best.home) best.home = row.h2h.home;
          if (best.draw == null || (row.h2h.draw != null && row.h2h.draw > best.draw))
            best.draw = row.h2h.draw;
          if (best.away == null || row.h2h.away > best.away) best.away = row.h2h.away;
        }
      }
      if (m.key === "spreads") {
        row.spreads = (m.outcomes || []).map((o) => ({
          name: o.name,
          point: o.point,
          price: o.price,
        }));
        spreads = spreads.concat(row.spreads.map((s) => ({ ...s, book: row.bookmaker })));
      }
      if (m.key === "totals") {
        row.totals = (m.outcomes || []).map((o) => ({
          name: o.name,
          point: o.point,
          price: o.price,
        }));
        totals = totals.concat(row.totals.map((s) => ({ ...s, book: row.bookmaker })));
      }
    }
    if (row.h2h) books.push(row);
  }

  return {
    id: ev.id,
    sportKey: ev.sport_key,
    commenceTime: ev.commence_time,
    home: ev.home_team,
    away: ev.away_team,
    bestH2h: best,
    bookmakers: books,
    spreadsSample: spreads.slice(0, 8),
    totalsSample: totals.slice(0, 8),
  };
}

/**
 * Match odds to a fixture by team name fuzzy match
 */
export async function matchOddsForFixture(leagueId, homeName, awayName) {
  if (!oddsApiEnabled()) {
    return {
      enabled: false,
      odds: null,
      message: "Set ODDS_API_KEY to enable The Odds API",
    };
  }
  try {
    const pack = await fetchLeagueOdds(leagueId);
    const h = (homeName || "").toLowerCase();
    const a = (awayName || "").toLowerCase();
    const hit =
      pack.events.find((e) => {
        const eh = e.home.toLowerCase();
        const ea = e.away.toLowerCase();
        return (
          (eh.includes(h.slice(0, 5)) || h.includes(eh.slice(0, 5))) &&
          (ea.includes(a.slice(0, 5)) || a.includes(ea.slice(0, 5)))
        );
      }) || null;

    if (!hit) {
      return {
        enabled: true,
        odds: null,
        league: pack,
        message: "No matching fixture in Odds API list",
        quota: pack.quota,
      };
    }

    return {
      enabled: true,
      odds: {
        provider: "the-odds-api",
        home: hit.bestH2h.home,
        draw: hit.bestH2h.draw,
        away: hit.bestH2h.away,
        bookmakers: hit.bookmakers,
        spreads: hit.spreadsSample,
        totals: hit.totalsSample,
        commenceTime: hit.commenceTime,
        eventId: hit.id,
      },
      quota: pack.quota,
      fetchedAt: pack.fetchedAt,
    };
  } catch (e) {
    return { enabled: true, odds: null, error: String(e.message || e) };
  }
}
