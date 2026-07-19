/** Offline demo snapshot — rich live sample for timeline / 2D / live AI */

export function demoSnapshot() {
  const home = {
    id: "529",
    name: "IF Elfsborg",
    short: "ELFS",
    form: "LLDDD",
    record: "4-6-3",
    points: 18,
    rank: 9,
    goalsFor: 17,
    goalsAgainst: 14,
    gp: 13,
    gpg: 17 / 13,
    gapg: 14 / 13,
    homeAdv: 1.06,
    formAdj: -0.15,
    coach: { name: "Oscar Hiljemark", styleHint: "balanced" },
    players: [
      { name: "Leo Ostman", goals: 4, apps: 13, role: "中鋒", rating: 78 },
      { name: "Ari Sigurpalsson", goals: 3, apps: 11, role: "邊鋒", rating: 76 },
      { name: "Arber Zeneli", goals: 3, apps: 10, role: "前腰", rating: 77 },
    ],
  };
  const away = {
    id: "8547",
    name: "IK Sirius",
    short: "SIR",
    form: "WDWWW",
    record: "10-2-0",
    points: 32,
    rank: 1,
    goalsFor: 33,
    goalsAgainst: 15,
    gp: 12,
    gpg: 33 / 12,
    gapg: 15 / 12,
    awayDamp: 0.97,
    formAdj: 0.12,
    coach: { name: "Christer Mattiasson", styleHint: "direct" },
    players: [
      { name: "Robbie Ure", goals: 12, apps: 12, role: "中鋒", rating: 84 },
      { name: "Isak Bjerkebo", goals: 10, apps: 12, role: "邊鋒", rating: 82 },
      { name: "Marcus Lindberg", goals: 1, apps: 12, role: "後腰", rating: 74 },
    ],
  };

  const events = [
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
      id: "28-yellow",
      type: "yellow",
      clock: "28'",
      minute: 2800,
      side: "home",
      team: "IF Elfsborg",
      player: "Arber Zeneli",
      text: "🟨 Arber Zeneli 黃牌",
    },
    {
      id: "41-corner-note",
      type: "info",
      clock: "41'",
      minute: 4100,
      side: "away",
      team: "IK Sirius",
      player: "",
      text: "🚩 客隊連續角球施壓",
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
      id: "67-yellow-away",
      type: "yellow",
      clock: "67'",
      minute: 6700,
      side: "away",
      team: "IK Sirius",
      player: "Marcus Lindberg",
      text: "🟨 Marcus Lindberg 黃牌",
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
  ];

  const matchStats = {
    home: {
      possession: 44,
      shots: 9,
      shotsOnTarget: 3,
      corners: 3,
      fouls: 11,
      yellow: 1,
      red: 0,
      passes: 312,
      passPct: 81,
      saves: 4,
      offsides: 2,
    },
    away: {
      possession: 56,
      shots: 14,
      shotsOnTarget: 7,
      corners: 7,
      fouls: 8,
      yellow: 1,
      red: 0,
      passes: 401,
      passPct: 86,
      saves: 2,
      offsides: 1,
    },
  };

  const score = { home: 1, away: 2 };
  const homeForce =
    matchStats.home.possession * 0.35 +
    matchStats.home.shots * 3 +
    matchStats.home.shotsOnTarget * 6 +
    matchStats.home.corners * 2 +
    score.home * 4;
  const awayForce =
    matchStats.away.possession * 0.35 +
    matchStats.away.shots * 3 +
    matchStats.away.shotsOnTarget * 6 +
    matchStats.away.corners * 2 +
    score.away * 4;
  const total = homeForce + awayForce;
  const homeShare = (homeForce / total) * 100;

  return {
    matchId: "demo-pitch-intel",
    eventId: "401842755",
    leagueId: "swe.1",
    league: "Swedish Allsvenskan",
    status: "live",
    statusDetail: "Second Half",
    clock: "78'",
    kickoff: "2026-07-19T14:30:00Z",
    venue: "Borås Arena",
    home,
    away,
    score,
    odds: { provider: "demo", home: 3.45, draw: 3.7, away: 1.74 },
    lineupsConfirmed: false,
    events,
    matchStats,
    attack: {
      homeShare: +homeShare.toFixed(1),
      awayShare: +(100 - homeShare).toFixed(1),
      ballX: +(12 + (homeShare / 100) * 76).toFixed(1),
      ballY: 48,
      direction: homeShare >= 50 ? "home" : "away",
    },
    h2h: [
      {
        date: "2025-09-01T15:00:00Z",
        score: "1-2",
        result: "L",
        competition: "Allsvenskan",
      },
      {
        date: "2025-04-12T15:00:00Z",
        score: "0-0",
        result: "D",
        competition: "Allsvenskan",
      },
    ],
    live: {
      clock: "78'",
      status: "live",
      score,
      eventCount: events.length,
      updatedAt: new Date().toISOString(),
    },
    source: {
      name: "demo-live-snapshot",
      fetchedAt: new Date().toISOString(),
      latencyMs: 0,
      reliability: "low",
    },
    notes: ["Demo LIVE snapshot with timeline + stats"],
    offline: true,
  };
}
