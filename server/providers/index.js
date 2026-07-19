/**
 * Data provider facade
 *
 * DATA_PROVIDER=espn|apifootball|auto  (default: auto)
 * - auto: ESPN board + snapshot; enrich lineups with API-Football when key present
 * - apifootball: full fixtures from API-Football (needs API_FOOTBALL_KEY)
 * - espn: ESPN only
 */

import * as espn from "./espn.js";
import * as af from "./apifootball.js";
import { demoSnapshot } from "./demo.js";
import {
  parseEspnLineups,
  playersFromLineups,
} from "./lineups.js";

export const LEAGUES = espn.LEAGUES;

function mode() {
  return (process.env.DATA_PROVIDER || "auto").toLowerCase();
}

export function providerStatus() {
  return {
    mode: mode(),
    espn: true,
    apiFootball: af.apiFootballEnabled(),
    xai: Boolean(process.env.XAI_API_KEY),
  };
}

export async function listMatches(leagueId = "eng.1") {
  const m = mode();
  if (m === "apifootball" && af.apiFootballEnabled()) {
    try {
      return await af.listFixtures(leagueId);
    } catch (e) {
      const fallback = await espn.listMatches(leagueId);
      fallback.source = {
        ...fallback.source,
        warning: `API-Football failed: ${e.message}; fell back to ESPN`,
      };
      return fallback;
    }
  }
  return espn.listMatches(leagueId);
}

export async function getMatchSnapshot(leagueId, matchId) {
  if (String(matchId).startsWith("demo")) {
    return demoSnapshot();
  }

  // API-Football native ids
  if (String(matchId).startsWith("af-") || mode() === "apifootball") {
    if (af.apiFootballEnabled()) {
      try {
        return await af.getFixtureSnapshot(leagueId, matchId);
      } catch (e) {
        if (String(matchId).startsWith("af-")) {
          const demo = demoSnapshot();
          demo.source.error = e.message;
          return demo;
        }
        // fall through to ESPN
      }
    }
  }

  let snap = await espn.getMatchSnapshot(leagueId, matchId);
  snap = await attachEspnLineups(snap);

  if (mode() === "auto" && af.apiFootballEnabled() && !snap.lineupsConfirmed) {
    snap = await af.enrichLineupsByTeamNames(snap);
  }

  return snap;
}

/**
 * Attach real ESPN roster/lineup parsing onto snapshot
 */
async function attachEspnLineups(snap) {
  if (!snap || snap.offline) return snap;
  // Re-fetch summary is already inside espn; if lineups already present skip
  if (snap.lineups?.confirmed) {
    return applyLineupPlayers(snap, snap.lineups);
  }

  // espn provider may not have attached raw summary — try light re-parse via notes
  // getMatchSnapshot already can be enhanced in espn.js; here we use any lineups field
  if (snap._rawLineups) {
    return applyLineupPlayers(snap, snap._rawLineups);
  }
  return snap;
}

function applyLineupPlayers(snap, lu) {
  const homePlayers = playersFromLineups(lu.home, snap.home?.players);
  const awayPlayers = playersFromLineups(lu.away, snap.away?.players);
  return {
    ...snap,
    lineups: lu,
    lineupsConfirmed: lu.confirmed,
    home: {
      ...snap.home,
      players: homePlayers.length ? homePlayers : snap.home?.players,
      coach: lu.home?.coach || snap.home?.coach,
      formation: lu.home?.formation,
    },
    away: {
      ...snap.away,
      players: awayPlayers.length ? awayPlayers : snap.away?.players,
      coach: lu.away?.coach || snap.away?.coach,
      formation: lu.away?.formation,
    },
  };
}

export { parseEspnLineups, demoSnapshot };
