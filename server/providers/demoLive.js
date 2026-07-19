/**
 * Progressive demo live state — events unlock over wall-clock so WS pushes feel live
 */

import { attackMeter } from "../engine/events.js";

const BASE_EVENTS = [
  {
    id: "12-goal-ure",
    type: "goal",
    clock: "12'",
    minute: 1200,
    side: "away",
    team: "IK Sirius",
    player: "Robbie Ure",
    assist: "Isak Bjerkebo",
    text: "⚽ Robbie Ure 入球（助攻 Isak Bjerkebo）",
  },
  {
    id: "19-corner-a1",
    type: "corner",
    clock: "19'",
    minute: 1900,
    side: "away",
    team: "IK Sirius",
    player: "",
    text: "🚩 IK Sirius 角球（右路）",
    detail: { zone: "right", count: 1 },
  },
  {
    id: "28-yellow",
    type: "yellow",
    clock: "28'",
    minute: 2800,
    side: "home",
    team: "IF Elfsborg",
    player: "Arber Zeneli",
    text: "🟨 Arber Zeneli 黃牌（拖延時間）",
    detail: { reason: "time_wasting" },
  },
  {
    id: "33-corner-a2",
    type: "corner",
    clock: "33'",
    minute: 3300,
    side: "away",
    team: "IK Sirius",
    player: "",
    text: "🚩 IK Sirius 角球（左路）",
    detail: { zone: "left", count: 2 },
  },
  {
    id: "41-corner-h1",
    type: "corner",
    clock: "41'",
    minute: 4100,
    side: "home",
    team: "IF Elfsborg",
    player: "",
    text: "🚩 IF Elfsborg 角球",
    detail: { zone: "right", count: 1 },
  },
  {
    id: "46-sub-h",
    type: "sub",
    clock: "46'",
    minute: 4600,
    side: "home",
    team: "IF Elfsborg",
    player: "Ari Sigurpalsson",
    playerOut: "Arber Zeneli",
    text: "🔄 換人 IF Elfsborg：Ari Sigurpalsson ↑  Arber Zeneli ↓",
    detail: { on: "Ari Sigurpalsson", off: "Arber Zeneli" },
  },
  {
    id: "55-goal-ostman",
    type: "goal",
    clock: "55'",
    minute: 5500,
    side: "home",
    team: "IF Elfsborg",
    player: "Leo Ostman",
    assist: "Ari Sigurpalsson",
    text: "⚽ Leo Ostman 入球（助攻 Ari Sigurpalsson）",
  },
  {
    id: "62-sub-a",
    type: "sub",
    clock: "62'",
    minute: 6200,
    side: "away",
    team: "IK Sirius",
    player: "Marcus Lindberg",
    playerOut: "Isak Bjerkebo",
    text: "🔄 換人 IK Sirius：Marcus Lindberg ↑  Isak Bjerkebo ↓",
    detail: { on: "Marcus Lindberg", off: "Isak Bjerkebo" },
  },
  {
    id: "67-yellow-away",
    type: "yellow",
    clock: "67'",
    minute: 6700,
    side: "away",
    team: "IK Sirius",
    player: "Marcus Lindberg",
    text: "🟨 Marcus Lindberg 黃牌（犯規）",
    detail: { reason: "foul" },
  },
  {
    id: "71-corner-a3",
    type: "corner",
    clock: "71'",
    minute: 7100,
    side: "away",
    team: "IK Sirius",
    player: "",
    text: "🚩 IK Sirius 角球（連續施壓）",
    detail: { zone: "right", count: 3 },
  },
  {
    id: "74-goal-ure2",
    type: "goal",
    clock: "74'",
    minute: 7400,
    side: "away",
    team: "IK Sirius",
    player: "Robbie Ure",
    text: "⚽ Robbie Ure 梅開二度",
  },
  {
    id: "80-sub-h2",
    type: "sub",
    clock: "80'",
    minute: 8000,
    side: "home",
    team: "IF Elfsborg",
    player: "Leo Ostman",
    playerOut: "—",
    text: "🔄 換人 IF Elfsborg：加強中場",
    detail: { on: "Midfielder", off: "Winger" },
  },
];

/** Unlock 1 event every ~8s of wall clock, loop after full set */
export function getProgressiveDemo() {
  const cycleSec = 8;
  const tick = Math.floor(Date.now() / 1000 / cycleSec) % (BASE_EVENTS.length + 3);
  const n = Math.min(BASE_EVENTS.length, Math.max(1, tick + 1));
  const events = BASE_EVENTS.slice(0, n);
  const last = events[events.length - 1];
  const clockMin = Math.min(90, Math.max(10, Math.floor((last?.minute || 1000) / 100)));

  let sh = 0;
  let sa = 0;
  let cornersH = 0;
  let cornersA = 0;
  let yellowH = 0;
  let yellowA = 0;
  for (const e of events) {
    if (e.type === "goal" || e.type === "penalty") {
      if (e.side === "home") sh++;
      else sa++;
    }
    if (e.type === "corner") {
      if (e.side === "home") cornersH++;
      else cornersA++;
    }
    if (e.type === "yellow") {
      if (e.side === "home") yellowH++;
      else yellowA++;
    }
  }

  const matchStats = {
    home: {
      possession: 42 + Math.min(8, sh * 2),
      shots: 4 + sh * 3 + cornersH,
      shotsOnTarget: 1 + sh * 2,
      corners: Math.max(cornersH, 1),
      fouls: 8 + yellowH,
      yellow: yellowH,
      red: 0,
      passes: 280 + n * 8,
      passPct: 80,
      saves: 2 + sa,
      offsides: 1,
    },
    away: {
      possession: 58 - Math.min(8, sh * 2),
      shots: 6 + sa * 4 + cornersA,
      shotsOnTarget: 2 + sa * 2,
      corners: Math.max(cornersA, 2),
      fouls: 6 + yellowA,
      yellow: yellowA,
      red: 0,
      passes: 340 + n * 10,
      passPct: 85,
      saves: 1 + sh,
      offsides: 1,
    },
  };

  const score = { home: sh, away: sa };
  const attack = attackMeter(matchStats, score);

  return {
    matchId: "demo-pitch-intel",
    eventId: "401842755",
    leagueId: "swe.1",
    league: "Swedish Allsvenskan",
    status: clockMin >= 90 ? "post" : "live",
    statusDetail: clockMin >= 90 ? "Full Time" : "Second Half",
    clock: `${clockMin}'`,
    kickoff: new Date().toISOString(),
    venue: "Borås Arena",
    home: {
      id: "529",
      name: "IF Elfsborg",
      short: "ELFS",
      form: "LLDDD",
      coach: { name: "Oscar Hiljemark" },
      players: [
        { name: "Leo Ostman", role: "中鋒", rating: 78, goals: 4 },
        { name: "Ari Sigurpalsson", role: "邊鋒", rating: 76, goals: 3 },
      ],
    },
    away: {
      id: "8547",
      name: "IK Sirius",
      short: "SIR",
      form: "WDWWW",
      coach: { name: "Christer Mattiasson" },
      players: [
        { name: "Robbie Ure", role: "中鋒", rating: 84, goals: 12 },
        { name: "Isak Bjerkebo", role: "邊鋒", rating: 82, goals: 10 },
      ],
    },
    score,
    odds: { provider: "demo", home: 3.45, draw: 3.7, away: 1.74 },
    events,
    matchStats,
    attack,
    h2h: [
      { date: "2025-09-01T15:00:00Z", score: "1-2", result: "L", competition: "Allsvenskan" },
      { date: "2025-04-12T15:00:00Z", score: "0-0", result: "D", competition: "Allsvenskan" },
    ],
    live: {
      clock: `${clockMin}'`,
      status: "live",
      score,
      eventCount: events.length,
      updatedAt: new Date().toISOString(),
    },
    source: {
      name: "demo-progressive",
      fetchedAt: new Date().toISOString(),
      latencyMs: 0,
      reliability: "low",
    },
    notes: ["Progressive demo for WebSocket live push"],
    offline: true,
  };
}
