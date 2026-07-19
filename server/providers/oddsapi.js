/**
 * The Odds API (https://the-odds-api.com) + demo fallback
 * Env: ODDS_API_KEY  (optional — without key, returns demo board)
 *
 * GET https://api.the-odds-api.com/v4/sports/{sport}/odds
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
    mode: oddsApiEnabled() ? "live" : "demo",
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

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function demoPrices(homeName, awayName, i = 0) {
  const r = hash01(`${homeName}|${awayName}|${i}`);
  // favorite skew
  const homeFav = r > 0.45;
  const home = +(1.55 + r * 2.2 + (homeFav ? 0 : 0.9)).toFixed(2);
  const away = +(1.55 + (1 - r) * 2.2 + (homeFav ? 0.9 : 0)).toFixed(2);
  const draw = +(2.9 + r * 0.9).toFixed(2);
  return { home, draw, away };
}

/** Realistic demo league board so UI always works offline */
export function demoLeagueOdds(leagueId = "eng.1") {
  const samples = {
    "eng.1": [
      ["Arsenal", "Chelsea"],
      ["Liverpool", "Manchester City"],
      ["Manchester United", "Tottenham Hotspur"],
      ["Newcastle United", "Aston Villa"],
      ["Brighton", "West Ham United"],
    ],
    "esp.1": [
      ["Real Madrid", "Barcelona"],
      ["Atletico Madrid", "Sevilla"],
      ["Real Sociedad", "Villarreal"],
    ],
    "ita.1": [
      ["Inter", "AC Milan"],
      ["Juventus", "Napoli"],
      ["Roma", "Lazio"],
    ],
    "ger.1": [
      ["Bayern Munich", "Borussia Dortmund"],
      ["RB Leipzig", "Bayer Leverkusen"],
    ],
    "fra.1": [
      ["Paris Saint Germain", "Marseille"],
      ["Lyon", "Monaco"],
    ],
    "uefa.champions": [
      ["Real Madrid", "Manchester City"],
      ["Bayern Munich", "Arsenal"],
    ],
    "swe.1": [
      ["IF Elfsborg", "IK Sirius"],
      ["Malmo FF", "AIK"],
    ],
  };

  const pairs = samples[leagueId] || samples["eng.1"];
  const books = ["Bet365", "Pinnacle", "William Hill", "Unibet"];

  const events = pairs.map(([home, away], i) => {
    const best = demoPrices(home, away, i);
    const bookmakers = books.map((name, bi) => {
      const jitter = (hash01(name + home + away) - 0.5) * 0.12;
      return {
        bookmaker: name,
        key: name.toLowerCase().replace(/\s/g, ""),
        lastUpdate: new Date().toISOString(),
        h2h: {
          home: +(best.home + jitter).toFixed(2),
          draw: +(best.draw + jitter * 0.5).toFixed(2),
          away: +(best.away - jitter).toFixed(2),
        },
        spreads: [
          { name: home, point: -0.5, price: 1.95 },
          { name: away, point: 0.5, price: 1.9 },
        ],
        totals: [
          { name: "Over", point: 2.5, price: 1.88 },
          { name: "Under", point: 2.5, price: 1.98 },
        ],
      };
    });
    return {
      id: `demo-odds-${leagueId}-${i}`,
      sportKey: ODDS_SPORT_KEYS[leagueId] || "soccer_epl",
      commenceTime: new Date(Date.now() + (i + 1) * 3600_000 * 6).toISOString(),
      home,
      away,
      bestH2h: best,
      bookmakers,
      spreadsSample: bookmakers[0].spreads.map((s) => ({ ...s, book: books[0] })),
      totalsSample: bookmakers[0].totals.map((s) => ({ ...s, book: books[0] })),
    };
  });

  return {
    leagueId,
    sport: ODDS_SPORT_KEYS[leagueId] || "soccer_epl",
    events,
    quota: null,
    source: "demo-odds",
    demo: true,
    message: "Demo 盤口（未設定 ODDS_API_KEY）。去 the-odds-api.com 攞免費 key 可換真盤。",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * List h2h (+ optional spreads/totals) for a league
 */
export async function fetchLeagueOdds(leagueId = "eng.1", opts = {}) {
  const sport = ODDS_SPORT_KEYS[leagueId];
  if (!sport && !oddsApiEnabled()) {
    return demoLeagueOdds(leagueId);
  }
  if (!oddsApiEnabled()) {
    return demoLeagueOdds(leagueId);
  }

  const cacheKey = `odds:${sport}:${opts.regions || "uk,eu"}`;
  const cached = cacheGet(cacheKey, 60_000);
  if (cached) return { ...cached, cached: true };

  try {
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
      demo: false,
      fetchedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, payload);
    return payload;
  } catch (e) {
    const demo = demoLeagueOdds(leagueId);
    demo.message = `Odds API 失敗，已回退 demo：${e.message}`;
    demo.error = String(e.message || e);
    return demo;
  }
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

function fuzzyHit(events, homeName, awayName) {
  const h = (homeName || "").toLowerCase();
  const a = (awayName || "").toLowerCase();
  if (!h && !a) return null;
  return (
    events.find((e) => {
      const eh = e.home.toLowerCase();
      const ea = e.away.toLowerCase();
      const hOk =
        !h ||
        eh.includes(h.slice(0, Math.min(5, h.length))) ||
        h.includes(eh.slice(0, Math.min(5, eh.length)));
      const aOk =
        !a ||
        ea.includes(a.slice(0, Math.min(5, a.length))) ||
        a.includes(ea.slice(0, Math.min(5, ea.length)));
      return hOk && aOk;
    }) || null
  );
}

/**
 * Match odds to a fixture by team name fuzzy match
 */
export async function matchOddsForFixture(leagueId, homeName, awayName) {
  try {
    const pack = await fetchLeagueOdds(leagueId);
    let hit = fuzzyHit(pack.events, homeName, awayName);

    // demo match names
    if (!hit && String(homeName).includes("Elfsborg")) {
      hit = pack.events.find((e) => e.home.includes("Elfsborg")) || pack.events[0];
    }
    if (!hit && pack.demo && pack.events[0]) {
      // synthesize for any unknown pair
      const best = demoPrices(homeName || "Home", awayName || "Away", 7);
      const books = ["Bet365", "Pinnacle", "William Hill"].map((name) => ({
        bookmaker: name,
        key: name,
        h2h: {
          home: +(best.home + 0.02).toFixed(2),
          draw: best.draw,
          away: +(best.away - 0.02).toFixed(2),
        },
      }));
      return {
        enabled: true,
        demo: true,
        odds: {
          provider: "demo-odds",
          home: best.home,
          draw: best.draw,
          away: best.away,
          bookmakers: books,
          spreads: [
            { name: homeName || "Home", point: -0.25, price: 1.95, book: "Bet365" },
            { name: awayName || "Away", point: 0.25, price: 1.9, book: "Bet365" },
          ],
          totals: [
            { name: "Over", point: 2.5, price: 1.88, book: "Bet365" },
            { name: "Under", point: 2.5, price: 1.95, book: "Bet365" },
          ],
          commenceTime: new Date().toISOString(),
          eventId: "demo-synth",
        },
        message: pack.message,
        fetchedAt: pack.fetchedAt,
      };
    }

    if (!hit) {
      return {
        enabled: true,
        demo: Boolean(pack.demo),
        odds: null,
        message: "No matching fixture in odds list",
        quota: pack.quota,
      };
    }

    return {
      enabled: true,
      demo: Boolean(pack.demo),
      odds: {
        provider: pack.source || "the-odds-api",
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
      message: pack.message,
      fetchedAt: pack.fetchedAt,
    };
  } catch (e) {
    return { enabled: true, odds: null, error: String(e.message || e) };
  }
}
