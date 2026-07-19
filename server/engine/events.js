/**
 * Parse live match events + team stats (ESPN-shaped or demo)
 * Finer grain: corners, subs (on/off), yellow reason, synthetic corners from stats
 */

function clockSortKey(display) {
  if (!display) return 0;
  const s = String(display);
  const m = s.match(/(\d+)/g);
  if (!m) return 0;
  const base = parseInt(m[0], 10) || 0;
  const add = m[1] != null ? parseInt(m[1], 10) || 0 : 0;
  return base * 100 + add;
}

function sideFromTeam(team, homeId, awayId, homeName, awayName) {
  const tid = String(team?.id || "");
  if (homeId && tid === String(homeId)) return "home";
  if (awayId && tid === String(awayId)) return "away";
  const name = (team?.displayName || team?.name || "").toLowerCase();
  if (homeName && name.includes(String(homeName).toLowerCase().slice(0, 4))) return "home";
  if (awayName && name.includes(String(awayName).toLowerCase().slice(0, 4))) return "away";
  return "unknown";
}

function detectTypes(d) {
  const types = [];
  const blob = JSON.stringify(d).toLowerCase();
  const typeText = String(d.type?.text || d.type?.id || d.text || "").toLowerCase();

  if (d.scoringPlay || typeText.includes("goal")) {
    if (d.ownGoal || typeText.includes("own")) types.push("own_goal");
    else if (d.penaltyKick || typeText.includes("penalt")) types.push("penalty");
    else types.push("goal");
  }
  if (d.redCard || typeText.includes("red card")) types.push("red");
  if (d.yellowCard || typeText.includes("yellow")) types.push("yellow");
  if (
    d.substitution ||
    typeText.includes("substitut") ||
    typeText.includes("sub ") ||
    blob.includes("\"substitution\":true")
  ) {
    types.push("sub");
  }
  if (typeText.includes("corner") || blob.includes("corner kick")) {
    types.push("corner");
  }
  if (typeText.includes("var")) types.push("var");
  if (!types.length && d.participants?.length) types.push("info");
  return types;
}

function extractSubPlayers(d) {
  const parts = d.participants || [];
  // ESPN often: [player on, player off] or athlete with rel
  let on = "";
  let off = "";
  for (const p of parts) {
    const name = p.athlete?.displayName || p.athlete?.shortName || p.displayName || "";
    const rel = String(p.athlete?.position?.name || p.type || p.rel || "").toLowerCase();
    if (rel.includes("out") || rel.includes("off")) off = name;
    else if (rel.includes("in") || rel.includes("on")) on = name;
  }
  if (!on && parts[0]) on = parts[0].athlete?.displayName || "";
  if (!off && parts[1]) off = parts[1].athlete?.displayName || "";
  return { on, off };
}

/**
 * ESPN header.competitions[0].details → normalized timeline
 */
export function parseEspnDetails(details, ctx = {}) {
  const { homeId, awayId, homeName, awayName } = ctx;
  const events = [];
  for (const d of details || []) {
    const types = detectTypes(d);
    if (!types.length) continue;
    const type = types[0];
    const player =
      d.participants?.[0]?.athlete?.displayName ||
      d.participants?.[0]?.athlete?.shortName ||
      "";
    const assist =
      d.participants?.[1]?.athlete?.displayName ||
      d.participants?.[1]?.athlete?.shortName ||
      "";
    const sub = type === "sub" ? extractSubPlayers(d) : null;
    const clock = d.clock?.displayValue || d.clock?.value || "";
    const side = sideFromTeam(d.team, homeId, awayId, homeName, awayName);
    const detail = {};
    if (sub) {
      detail.on = sub.on;
      detail.off = sub.off;
    }
    if (type === "corner") {
      detail.zone = side === "home" ? "home" : "away";
    }
    if (d.redCard) detail.card = "red";
    if (d.yellowCard) detail.card = "yellow";

    events.push({
      id: `${clock}-${type}-${player || sub?.on || ""}-${side}-${types.join(",")}`,
      type,
      types,
      clock: String(clock),
      minute: clockSortKey(clock),
      side,
      team: d.team?.displayName || d.team?.abbreviation || "",
      player: type === "sub" ? sub?.on || player : player,
      playerOut: sub?.off || "",
      assist: type === "goal" || type === "penalty" ? assist : "",
      penalty: Boolean(d.penaltyKick),
      ownGoal: Boolean(d.ownGoal),
      detail,
      text: buildEventText(type, player, assist, d, sub),
    });
  }
  events.sort((a, b) => a.minute - b.minute);
  return events;
}

function buildEventText(type, player, assist, d, sub) {
  const p = player || "—";
  switch (type) {
    case "goal":
      return assist ? `⚽ ${p} 入球（助攻 ${assist}）` : `⚽ ${p} 入球`;
    case "penalty":
      return `⚽ ${p} 十二碼入球`;
    case "own_goal":
      return `⚽ ${p} 烏龍球`;
    case "yellow":
      return `🟨 ${p} 黃牌`;
    case "red":
      return `🟥 ${p} 紅牌`;
    case "sub":
      if (sub?.on || sub?.off) {
        return `🔄 換人：${sub.on || "?"} ↑  ${sub.off || "?"} ↓`;
      }
      return `🔄 換人 ${p}`;
    case "corner":
      return `🚩 角球${p && p !== "—" ? `（${p}）` : ""}`;
    case "var":
      return `📺 VAR 檢查${p && p !== "—" ? ` · ${p}` : ""}`;
    default:
      return d?.text || `${p}`;
  }
}

/**
 * boxscore.teams[].statistics → { home: {}, away: {} }
 */
export function parseEspnStats(boxTeams, homeId, awayId) {
  const out = {
    home: emptyStats(),
    away: emptyStats(),
  };
  for (const block of boxTeams || []) {
    const tid = String(block.team?.id || "");
    const side =
      tid === String(homeId) ? "home" : tid === String(awayId) ? "away" : null;
    if (!side) continue;
    const map = {};
    for (const s of block.statistics || []) {
      const key = s.name || s.abbreviation || s.displayName;
      const val =
        s.value != null
          ? Number(s.value)
          : parseFloat(String(s.displayValue || "").replace("%", ""));
      map[key] = Number.isFinite(val) ? val : s.displayValue;
    }
    out[side] = {
      possession: num(map.possessionPct, 50),
      shots: num(map.totalShots, 0),
      shotsOnTarget: num(map.shotsOnTarget, 0),
      corners: num(map.wonCorners, 0),
      fouls: num(map.foulsCommitted, 0),
      yellow: num(map.yellowCards, 0),
      red: num(map.redCards, 0),
      passes: num(map.totalPasses, 0),
      passPct: num(map.passPct, 0) <= 1 ? num(map.passPct, 0) * 100 : num(map.passPct, 0),
      saves: num(map.saves, 0),
      offsides: num(map.offsides, 0),
    };
  }
  return out;
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function emptyStats() {
  return {
    possession: 50,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    fouls: 0,
    yellow: 0,
    red: 0,
    passes: 0,
    passPct: 0,
    saves: 0,
    offsides: 0,
  };
}

export function attackMeter(stats, score) {
  const h = stats?.home || emptyStats();
  const a = stats?.away || emptyStats();
  const homeForce =
    h.possession * 0.35 +
    h.shots * 3 +
    h.shotsOnTarget * 6 +
    h.corners * 2 +
    (score?.home || 0) * 4;
  const awayForce =
    a.possession * 0.35 +
    a.shots * 3 +
    a.shotsOnTarget * 6 +
    a.corners * 2 +
    (score?.away || 0) * 4;
  const total = homeForce + awayForce || 1;
  const homeShare = (homeForce / total) * 100;
  return {
    homeShare: +homeShare.toFixed(1),
    awayShare: +(100 - homeShare).toFixed(1),
    ballX: +(12 + (homeShare / 100) * 76).toFixed(1),
    ballY: 42 + ((homeForce + awayForce) % 17),
    direction: homeShare >= 50 ? "home" : "away",
    /** for 3D */
    ballZ: 0.2,
  };
}

export function enrichSnapshotWithLive(snap, summary) {
  if (!summary && !snap._rawDetails) {
    return snap;
  }
  const homeId = snap.home?.id;
  const awayId = snap.away?.id;
  const details =
    summary?.header?.competitions?.[0]?.details ||
    snap._rawDetails ||
    [];
  let events = parseEspnDetails(details, {
    homeId,
    awayId,
    homeName: snap.home?.name,
    awayName: snap.away?.name,
  });
  const stats = parseEspnStats(
    summary?.boxscore?.teams || snap._rawBoxTeams || [],
    homeId,
    awayId
  );

  // If stats show corners but no corner events, add summary markers
  const cornerEvents = events.filter((e) => e.type === "corner");
  if (!cornerEvents.length && (stats.home.corners || stats.away.corners)) {
    if (stats.home.corners) {
      events.push({
        id: `sum-corners-h-${stats.home.corners}`,
        type: "corner",
        clock: snap.clock || "—",
        minute: 99800,
        side: "home",
        team: snap.home?.name,
        player: "",
        text: `🚩 ${snap.home?.name} 累計角球 ${stats.home.corners}`,
        detail: { count: stats.home.corners, aggregate: true },
      });
    }
    if (stats.away.corners) {
      events.push({
        id: `sum-corners-a-${stats.away.corners}`,
        type: "corner",
        clock: snap.clock || "—",
        minute: 99801,
        side: "away",
        team: snap.away?.name,
        player: "",
        text: `🚩 ${snap.away?.name} 累計角球 ${stats.away.corners}`,
        detail: { count: stats.away.corners, aggregate: true },
      });
    }
  }

  events.sort((a, b) => a.minute - b.minute);
  const attack = attackMeter(stats, snap.score);
  const h2h = parseH2H(summary?.headToHeadGames, homeId);

  return {
    ...snap,
    events,
    matchStats: stats,
    attack,
    h2h,
    live: {
      clock: snap.clock,
      status: snap.status,
      score: snap.score,
      eventCount: events.length,
      updatedAt: new Date().toISOString(),
    },
  };
}

function parseH2H(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const rows = [];
  for (const b of blocks) {
    for (const e of (b.events || []).slice(0, 5)) {
      rows.push({
        date: e.gameDate,
        score: e.score,
        result: e.gameResult,
        competition: e.leagueName || e.competitionName,
        homeScore: e.homeTeamScore,
        awayScore: e.awayTeamScore,
        homeTeamId: e.homeTeamId,
        awayTeamId: e.awayTeamId,
      });
    }
  }
  const seen = new Set();
  return rows
    .filter((r) => {
      const k = `${r.date}|${r.score}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);
}
