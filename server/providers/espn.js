/**
 * ESPN site API provider (public JSON, unofficial)
 */

import { demoSnapshot } from "./demo.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PitchIntel/1.0";

export const LEAGUES = [
  { id: "eng.1", name: "英超 Premier League" },
  { id: "esp.1", name: "西甲 LaLiga" },
  { id: "ita.1", name: "意甲 Serie A" },
  { id: "ger.1", name: "德甲 Bundesliga" },
  { id: "fra.1", name: "法甲 Ligue 1" },
  { id: "uefa.champions", name: "歐聯 Champions League" },
  { id: "swe.1", name: "瑞典超 Allsvenskan" },
];

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

async function httpGetJson(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function amToEuro(am) {
  if (am == null || Number.isNaN(Number(am))) return null;
  am = Number(am);
  if (am < 0) return +(1 + 100 / Math.abs(am)).toFixed(3);
  return +(1 + am / 100).toFixed(3);
}

function formAdj(form, isHome) {
  const f = (form || "").toUpperCase();
  if (!f) return 0;
  const recent = f.slice(0, 5);
  let score = 0;
  for (let i = 0; i < recent.length; i++) {
    const w = 1 + (4 - i) * 0.08;
    if (recent[i] === "W") score += 0.08 * w;
    else if (recent[i] === "L") score -= 0.08 * w;
  }
  if (isHome) return Math.max(-0.25, Math.min(0.15, score - 0.05));
  return Math.max(-0.15, Math.min(0.2, score));
}

function parseLeaders(summary, homeId, awayId) {
  const out = { home: [], away: [] };
  for (const block of summary.leaders || []) {
    const tid = String(block.team?.id || "");
    const bucket = tid === homeId ? "home" : tid === awayId ? "away" : null;
    if (!bucket) continue;
    for (const group of block.leaders || []) {
      if (group.name !== "goalsLeaders") continue;
      for (const row of group.leaders || []) {
        const ath = row.athlete || {};
        const name = ath.displayName || ath.fullName || "?";
        let goals = 0;
        let apps = 0;
        const dv = row.displayValue || "";
        try {
          if (dv.includes("Goals:")) goals = parseInt(dv.split("Goals:")[1].split(",")[0], 10) || 0;
          if (dv.includes("Matches:")) apps = parseInt(dv.split("Matches:")[1].split(",")[0], 10) || 0;
        } catch {
          /* ignore */
        }
        if (row.mainStat?.value != null) goals = parseInt(row.mainStat.value, 10) || goals;
        out[bucket].push({ name, goals, apps });
      }
    }
  }
  return out;
}

export async function listMatches(leagueId = "eng.1") {
  const key = `sb:${leagueId}`;
  const cached = cacheGet(key, 20_000);
  if (cached) return cached;

  const t0 = Date.now();
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard`;
  try {
    const data = await httpGetJson(url);
    const events = data.events || [];
    const leagueName =
      data.leagues?.[0]?.name ||
      LEAGUES.find((l) => l.id === leagueId)?.name ||
      leagueId;

    const matches = events.map((e) => {
      const comp = e.competitions?.[0] || {};
      const status = comp.status || {};
      const stype = status.type || {};
      let home = null;
      let away = null;
      for (const c of comp.competitors || []) {
        if (c.homeAway === "home") home = c;
        else away = c;
      }
      const state = stype.state || "pre";
      return {
        matchId: String(e.id),
        leagueId,
        league: leagueName,
        kickoff: e.date,
        status: state === "in" ? "live" : state,
        statusDetail: stype.detail || stype.description || state,
        clock: status.displayClock || "",
        home: {
          name: home?.team?.displayName || "Home",
          short: home?.team?.shortDisplayName || home?.team?.abbreviation || "HOME",
          score: parseInt(home?.score || "0", 10) || 0,
          form: home?.form || "",
        },
        away: {
          name: away?.team?.displayName || "Away",
          short: away?.team?.shortDisplayName || away?.team?.abbreviation || "AWAY",
          score: parseInt(away?.score || "0", 10) || 0,
          form: away?.form || "",
        },
        venue: e.venue?.displayName || comp.venue?.fullName || "",
      };
    });

    const payload = {
      leagueId,
      league: leagueName,
      matches,
      source: {
        name: "espn-scoreboard",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - t0,
        reliability: "med",
      },
    };
    cacheSet(key, payload);
    return payload;
  } catch (err) {
    // fallback demo single match for swe.1
    const demo = demoSnapshot();
    return {
      leagueId,
      league: LEAGUES.find((l) => l.id === leagueId)?.name || leagueId,
      matches: [
        {
          matchId: demo.matchId,
          leagueId,
          league: demo.league,
          kickoff: demo.kickoff,
          status: demo.status,
          statusDetail: demo.statusDetail,
          clock: demo.clock,
          home: { name: demo.home.name, short: demo.home.short, score: 0, form: demo.home.form },
          away: { name: demo.away.name, short: demo.away.short, score: 0, form: demo.away.form },
          venue: demo.venue,
          offline: true,
        },
      ],
      source: {
        name: "demo-fallback",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - t0,
        reliability: "low",
        error: String(err.message || err),
      },
    };
  }
}

export async function getMatchSnapshot(leagueId, matchId) {
  if (String(matchId).startsWith("demo")) {
    return demoSnapshot();
  }

  const key = `snap:${leagueId}:${matchId}`;
  const cached = cacheGet(key, 8_000);
  if (cached) return { ...cached, cached: true };

  const t0 = Date.now();
  const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/summary?event=${matchId}`;
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard`;
  const standingsUrl = `https://site.api.espn.com/apis/v2/sports/soccer/${leagueId}/standings`;

  try {
    const [summary, scoreboard] = await Promise.all([
      httpGetJson(summaryUrl),
      httpGetJson(scoreboardUrl),
    ]);

    let event = (scoreboard.events || []).find((e) => String(e.id) === String(matchId));
    if (!event) event = { competitions: summary.header?.competitions || [] };

    const comp = event.competitions?.[0] || summary.header?.competitions?.[0] || {};
    const status = comp.status || {};
    const stype = status.type || {};
    const state = stype.state || "pre";

    let homeC = null;
    let awayC = null;
    for (const c of comp.competitors || []) {
      if (c.homeAway === "home") homeC = c;
      else awayC = c;
    }

    const baseTeam = (c, isHome) => {
      const team = c?.team || {};
      let rec = "";
      let pts = null;
      for (const r of c?.records || c?.record || []) {
        if (r.type === "total" || r.name === "All Splits") rec = r.summary || rec;
        if (r.type === "points") pts = r.summary;
      }
      return {
        id: String(team.id || ""),
        name: team.displayName || (isHome ? "Home" : "Away"),
        short: team.shortDisplayName || team.abbreviation || (isHome ? "HOME" : "AWAY"),
        form: c?.form || "",
        record: rec,
        points: pts != null && !Number.isNaN(Number(pts)) ? Number(pts) : pts,
        rank: null,
        goalsFor: 0,
        goalsAgainst: 0,
        gp: 0,
        gpg: 1.2,
        gapg: 1.2,
        players: [],
        homeAdv: isHome ? 1.06 : 1.0,
        awayDamp: isHome ? 1.0 : 0.97,
        formAdj: 0,
      };
    };

    const home = baseTeam(homeC, true);
    const away = baseTeam(awayC, false);

    try {
      const stand = await httpGetJson(standingsUrl);
      const entries = stand.children?.[0]?.standings?.entries || [];
      for (const entry of entries) {
        const tid = String(entry.team?.id || "");
        const stats = Object.fromEntries((entry.stats || []).map((s) => [s.name, s]));
        const gv = (name, d = 0) => {
          const s = stats[name] || {};
          if (s.value != null) return Number(s.value);
          const n = Number(s.displayValue);
          return Number.isNaN(n) ? d : n;
        };
        const target = tid === home.id ? home : tid === away.id ? away : null;
        if (!target) continue;
        target.rank = gv("rank") || null;
        target.points = gv("points");
        target.gp = gv("gamesPlayed");
        target.goalsFor = gv("pointsFor");
        target.goalsAgainst = gv("pointsAgainst");
        const w = gv("wins");
        const d = gv("ties");
        const l = gv("losses");
        target.record = `${w}-${d}-${l}`;
        if (target.gp) {
          target.gpg = target.goalsFor / target.gp;
          target.gapg = target.goalsAgainst / target.gp;
        }
      }
    } catch {
      /* standings optional */
    }

    home.formAdj = formAdj(home.form, true);
    away.formAdj = formAdj(away.form, false);

    const leaders = parseLeaders(summary, home.id, away.id);
    home.players = leaders.home.length ? leaders.home : home.players;
    away.players = leaders.away.length ? leaders.away : away.players;

    // Real lineups / coaches from ESPN summary
    let lineups = null;
    try {
      const { parseEspnLineups, playersFromLineups } = await import("./lineups.js");
      lineups = parseEspnLineups(summary, home.id, away.id);
      if (lineups.confirmed) {
        const hp = playersFromLineups(lineups.home, home.players);
        const ap = playersFromLineups(lineups.away, away.players);
        if (hp.length) home.players = hp;
        if (ap.length) away.players = ap;
      }
      if (lineups.home?.coach) home.coach = lineups.home.coach;
      if (lineups.away?.coach) away.coach = lineups.away.coach;
      home.formation = lineups.home?.formation || null;
      away.formation = lineups.away?.formation || null;
    } catch {
      /* lineups optional */
    }

    let odds = { provider: "default", home: 2.5, draw: 3.3, away: 2.8 };
    try {
      const o = (comp.odds || [])[0] || {};
      const ml = o.moneyline || {};
      const h = amToEuro(ml.home?.close?.odds ?? ml.home?.odds);
      const d = amToEuro(ml.draw?.close?.odds ?? ml.draw?.odds);
      const a = amToEuro(ml.away?.close?.odds ?? ml.away?.odds);
      if (h && d && a) {
        odds = {
          provider: o.provider?.name || "ESPN",
          home: h,
          draw: d,
          away: a,
          dkHome: h,
          dkDraw: d,
          dkAway: a,
        };
      }
    } catch {
      /* odds optional */
    }

    const leagueName =
      scoreboard.leagues?.[0]?.name ||
      LEAGUES.find((l) => l.id === leagueId)?.name ||
      leagueId;

    const snap = {
      matchId: String(matchId),
      eventId: String(matchId),
      leagueId,
      league: leagueName,
      status: state === "in" ? "live" : state,
      statusDetail: stype.detail || stype.description || state,
      clock: status.displayClock || "0'",
      kickoff: event.date || summary.header?.competitions?.[0]?.date,
      venue: event.venue?.displayName || comp.venue?.fullName || "",
      home,
      away,
      score: {
        home: parseInt(homeC?.score || "0", 10) || 0,
        away: parseInt(awayC?.score || "0", 10) || 0,
      },
      odds,
      lineups,
      lineupsConfirmed: Boolean(lineups?.confirmed),
      source: {
        name: "espn-live",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - t0,
        reliability: lineups?.confirmed ? "high" : "med",
      },
      notes: [
        "ESPN site API",
        lineups?.confirmed ? "lineups from ESPN roster" : "lineups pending / leaders only",
      ],
      offline: false,
    };

    cacheSet(key, snap);
    return snap;
  } catch (err) {
    const demo = demoSnapshot();
    demo.source = {
      name: "demo-fallback",
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      reliability: "low",
      error: String(err.message || err),
    };
    demo.notes = [`ESPN 失敗：${err.message}`, "已回退 demo"];
    return demo;
  }
}
