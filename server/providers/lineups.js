/**
 * Parse / normalize lineup data from ESPN summary or API-Football payloads
 */

const POS_ROLE = {
  G: "門將",
  GK: "門將",
  D: "中堅",
  DEF: "中堅",
  CB: "中堅",
  LB: "邊衛",
  RB: "邊衛",
  LWB: "邊衛",
  RWB: "邊衛",
  M: "後腰",
  MID: "後腰",
  CDM: "後腰",
  DM: "後腰",
  CM: "後腰",
  CAM: "前腰",
  AM: "前腰",
  LM: "邊鋒",
  RM: "邊鋒",
  LW: "邊鋒",
  RW: "邊鋒",
  W: "邊鋒",
  F: "中鋒",
  FW: "中鋒",
  ST: "中鋒",
  CF: "中鋒",
  ATT: "中鋒",
};

export function roleFromPosition(pos) {
  if (!pos) return "主力";
  const p = String(pos).toUpperCase().replace(/[^A-Z]/g, "");
  return POS_ROLE[p] || "主力";
}

function ratingFromMeta({ starter, goals, apps, jersey }) {
  let r = starter ? 76 : 70;
  if (goals) r += Math.min(10, goals * 1.2);
  if (apps) r += Math.min(4, apps * 0.05);
  if (jersey != null && Number(jersey) <= 11) r += 1.5;
  return +Math.min(93, Math.max(65, r + (Math.random() * 0 - 0))).toFixed(1);
}

/** Deterministic tiny jitter without Math.random for SSR stability */
function stableJitter(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 100) / 50 - 1; // -1 .. +1
}

/**
 * ESPN summary.rosters or boxscore.players
 */
export function parseEspnLineups(summary, homeId, awayId) {
  const out = {
    home: { starters: [], bench: [], coach: null },
    away: { starters: [], bench: [], coach: null },
    confirmed: false,
  };

  // Coaches from header competitors
  try {
    const comps =
      summary.header?.competitions?.[0]?.competitors ||
      summary.boxscore?.teams ||
      [];
    for (const c of comps) {
      const tid = String(c.team?.id || c.id || "");
      const side = tid === String(homeId) ? "home" : tid === String(awayId) ? "away" : null;
      if (!side) continue;
      const coach =
        c.athletes?.find?.((a) => a.position?.abbreviation === "HC") ||
        c.coach ||
        c.coaches?.[0];
      if (coach) {
        const name =
          coach.displayName ||
          coach.fullName ||
          coach.athlete?.displayName ||
          coach.name ||
          null;
        if (name) out[side].coach = { name, source: "espn" };
      }
    }
  } catch {
    /* optional */
  }

  // Primary: rosters array
  const rosters = summary.rosters || summary.boxscore?.rosters || [];
  if (Array.isArray(rosters) && rosters.length) {
    for (const block of rosters) {
      const tid = String(block.team?.id || "");
      const side = tid === String(homeId) ? "home" : tid === String(awayId) ? "away" : null;
      if (!side) continue;
      const rows = block.roster || block.entries || block.athletes || [];
      for (const row of rows) {
        const ath = row.athlete || row;
        const name = ath.displayName || ath.fullName || ath.name || "?";
        const pos =
          row.position?.abbreviation ||
          ath.position?.abbreviation ||
          row.position?.name ||
          "";
        const starter = Boolean(
          row.starter ?? row.started ?? row.formationPlace ?? row.lineup === true
        );
        const jersey = row.jersey || ath.jersey || null;
        const player = {
          name,
          role: roleFromPosition(pos),
          position: pos || "?",
          starter,
          jersey,
          rating: +(
            74 +
            (starter ? 4 : 0) +
            stableJitter(name)
          ).toFixed(1),
          source: "espn-roster",
          importance: starter ? 0.85 : 0.45,
        };
        if (starter || row.formationPlace) out[side].starters.push(player);
        else out[side].bench.push(player);
      }
      if (block.coach?.displayName) {
        out[side].coach = { name: block.coach.displayName, source: "espn" };
      }
    }
  }

  // Fallback: boxscore.players
  if (!out.home.starters.length && !out.away.starters.length) {
    const teams = summary.boxscore?.players || [];
    for (const t of teams) {
      const tid = String(t.team?.id || "");
      const side = tid === String(homeId) ? "home" : tid === String(awayId) ? "away" : null;
      if (!side) continue;
      for (const statGroup of t.statistics || []) {
        for (const ath of statGroup.athletes || []) {
          const a = ath.athlete || {};
          const name = a.displayName || a.fullName || "?";
          const pos = a.position?.abbreviation || "";
          const starter = ath.starter !== false;
          const player = {
            name,
            role: roleFromPosition(pos),
            position: pos || "?",
            starter,
            rating: +(74 + (starter ? 4 : 0) + stableJitter(name)).toFixed(1),
            source: "espn-boxscore",
            importance: starter ? 0.8 : 0.4,
          };
          if (starter) out[side].starters.push(player);
          else out[side].bench.push(player);
        }
      }
    }
  }

  out.confirmed =
    out.home.starters.length >= 7 || out.away.starters.length >= 7;
  return out;
}

/**
 * Flatten lineups into team.players preferred by strength engine
 */
export function playersFromLineups(sidePack, leaders = []) {
  const starters = sidePack?.starters || [];
  if (starters.length) {
    return starters.slice(0, 11).map((p) => ({
      name: p.name,
      role: p.role,
      rating: p.rating,
      goals: p.goals || 0,
      apps: p.apps || 0,
      importance: p.importance ?? 0.85,
      starter: true,
      source: p.source,
    }));
  }
  // leaders as goals leaders
  return (leaders || []).map((p) => ({
    name: p.name,
    role: (p.goals || 0) >= 5 ? "前鋒" : "主力",
    rating: p.rating || ratingFromMeta({ starter: true, goals: p.goals, apps: p.apps }),
    goals: p.goals || 0,
    apps: p.apps || 0,
    importance: Math.min(1, 0.45 + (p.goals || 0) * 0.06),
    source: "leaders",
  }));
}

/**
 * API-Football lineups response item
 */
export function parseApiFootballLineups(response, homeName, awayName) {
  const out = {
    home: { starters: [], bench: [], coach: null, formation: null },
    away: { starters: [], bench: [], coach: null, formation: null },
    confirmed: false,
  };
  const list = response?.response || response || [];
  if (!Array.isArray(list)) return out;

  for (const block of list) {
    const teamName = block.team?.name || "";
    const isHome =
      teamName.toLowerCase() === String(homeName || "").toLowerCase() ||
      block.team?.id; // assign by order if names mismatch
    // Prefer order: first = home in AF docs often matches fixture home
  }

  // Assign by index when names are messy: 0 home, 1 away is common
  list.forEach((block, idx) => {
    const teamName = (block.team?.name || "").toLowerCase();
    let side =
      teamName && homeName && teamName.includes(String(homeName).toLowerCase().slice(0, 5))
        ? "home"
        : teamName && awayName && teamName.includes(String(awayName).toLowerCase().slice(0, 5))
          ? "away"
          : idx === 0
            ? "home"
            : "away";

    if (block.coach?.name) {
      out[side].coach = { name: block.coach.name, source: "api-football" };
    }
    out[side].formation = block.formation || null;

    for (const p of block.startXI || []) {
      const pl = p.player || p;
      const pos = pl.pos || pl.position || "";
      out[side].starters.push({
        name: pl.name || "?",
        role: roleFromPosition(pos),
        position: pos,
        starter: true,
        jersey: pl.number,
        rating: +(76 + stableJitter(pl.name || "")).toFixed(1),
        source: "api-football",
        importance: 0.9,
      });
    }
    for (const p of block.substitutes || []) {
      const pl = p.player || p;
      const pos = pl.pos || pl.position || "";
      out[side].bench.push({
        name: pl.name || "?",
        role: roleFromPosition(pos),
        position: pos,
        starter: false,
        jersey: pl.number,
        rating: +(70 + stableJitter(pl.name || "")).toFixed(1),
        source: "api-football",
        importance: 0.4,
      });
    }
  });

  out.confirmed =
    out.home.starters.length >= 7 || out.away.starters.length >= 7;
  return out;
}
