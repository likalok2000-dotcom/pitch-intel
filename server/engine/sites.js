/**
 * Top 10 prediction sites — methodology personas
 * We do NOT scrape third-party tips; we simulate each site's known methodology
 * against our own strength model (transparent, legal, reproducible).
 *
 * Track-record labels are community reputation references, not audited guarantees.
 */

export const PREDICTION_SITES = [
  {
    id: "forebet",
    name: "Forebet",
    method: "數學模型 · 泊松 / 概率",
    reputation: "高量統計預測 · 廣覆蓋",
    bias: { home: 0, draw: 0.02, away: 0, goals: 0 },
    trust: 0.82,
  },
  {
    id: "predictz",
    name: "PredictZ",
    method: "歷史對賽 + 近況",
    reputation: "長期穩定、比分導向",
    bias: { home: 0.01, draw: 0.03, away: -0.01, goals: -0.05 },
    trust: 0.8,
  },
  {
    id: "statarea",
    name: "Statarea",
    method: "統計算法 + 信心百分比",
    reputation: "算法 + 信心標籤",
    bias: { home: 0.02, draw: 0, away: 0, goals: 0.05 },
    trust: 0.78,
  },
  {
    id: "betstudy",
    name: "BetStudy",
    method: "深度數據表 · H2H",
    reputation: "數據密度高",
    bias: { home: 0.03, draw: 0.01, away: -0.02, goals: 0 },
    trust: 0.77,
  },
  {
    id: "windrawwin",
    name: "WinDrawWin",
    method: "1X2 統計 + 積分走勢",
    reputation: "經典 1X2 站",
    bias: { home: 0.04, draw: 0.02, away: -0.03, goals: -0.08 },
    trust: 0.75,
  },
  {
    id: "footballwhispers",
    name: "Football Whispers",
    method: "數據驅動敘事預測",
    reputation: "統計 + 敘事結合",
    bias: { home: 0, draw: 0, away: 0.02, goals: 0.08 },
    trust: 0.79,
  },
  {
    id: "sportsmole",
    name: "Sports Mole",
    method: "編輯分析 + 數據",
    reputation: "主流媒體級賽前稿",
    bias: { home: 0.02, draw: 0.04, away: 0, goals: 0 },
    trust: 0.76,
  },
  {
    id: "whoscored",
    name: "WhoScored",
    method: "評分 / 預期表現指標",
    reputation: "球員評分權威感",
    bias: { home: 0.01, draw: 0.01, away: 0.01, goals: 0.1 },
    trust: 0.84,
  },
  {
    id: "footystats",
    name: "FootyStats",
    method: "xG / Over-Under 統計",
    reputation: "進球市場敏感",
    bias: { home: 0, draw: 0, away: 0, goals: 0.15 },
    trust: 0.81,
  },
  {
    id: "soccervista",
    name: "SoccerVista",
    method: "多聯賽算法提示",
    reputation: "覆蓋廣、實務向",
    bias: { home: 0.03, draw: 0, away: -0.01, goals: 0.02 },
    trust: 0.74,
  },
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalize3(h, d, a) {
  const s = h + d + a || 1;
  return { home: h / s, draw: d / s, away: a / s };
}

function scoreFromLambda(lamH, lamA, rng, goalBias = 0) {
  const h = Math.max(0, Math.round(lamH + goalBias * 0.3 + (rng() - 0.45) * 0.8));
  const a = Math.max(0, Math.round(lamA + goalBias * 0.25 + (rng() - 0.5) * 0.8));
  return {
    h: clamp(h, 0, 5),
    a: clamp(a, 0, 5),
    label: `${clamp(h, 0, 5)}-${clamp(a, 0, 5)}`,
  };
}

/**
 * Simulate each top site's tip from shared model probabilities
 */
export function generateSiteBoard(ctx) {
  const { markets, lamH, lamA, homeName, awayName } = ctx;
  const rng = mulberry32(hashSeed(`${homeName}|${awayName}|sites|${lamH}|${lamA}`));

  return PREDICTION_SITES.map((site) => {
    let h = markets.home + site.bias.home + (rng() - 0.5) * 0.04;
    let d = markets.draw + site.bias.draw + (rng() - 0.5) * 0.03;
    let a = markets.away + site.bias.away + (rng() - 0.5) * 0.04;
    const p = normalize3(Math.max(0.05, h), Math.max(0.05, d), Math.max(0.05, a));

    let pick = "draw";
    if (p.home >= p.draw && p.home >= p.away) pick = "home";
    else if (p.away >= p.draw && p.away >= p.home) pick = "away";

    const score = scoreFromLambda(lamH, lamA, rng, site.bias.goals);
    // align score slightly with pick
    if (pick === "home" && score.h <= score.a) score.h = score.a + 1;
    if (pick === "away" && score.a <= score.h) score.a = score.h + 1;
    if (pick === "draw") {
      const m = Math.round((score.h + score.a) / 2);
      score.h = m;
      score.a = m;
    }
    score.h = clamp(score.h, 0, 5);
    score.a = clamp(score.a, 0, 5);
    score.label = `${score.h}-${score.a}`;

    const conf = clamp(
      site.trust * (0.55 + Math.max(p.home, p.draw, p.away) * 0.4),
      0.45,
      0.9
    );

    const pickLabel =
      pick === "home" ? homeName : pick === "away" ? awayName : "和局";

    return {
      id: site.id,
      name: site.name,
      method: site.method,
      reputation: site.reputation,
      trust: site.trust,
      pick,
      pickLabel,
      predictedScore: score.label,
      confidence: +conf.toFixed(3),
      probs: {
        home: +p.home.toFixed(3),
        draw: +p.draw.toFixed(3),
        away: +p.away.toFixed(3),
      },
      over25Lean: lamH + lamA + site.bias.goals > 2.45,
      note: `以「${site.method}」模擬輸出 · 非即時抓取 ${site.name} 官網`,
    };
  }).sort((x, y) => y.confidence - x.confidence);
}

export function consensusFromSites(board) {
  const tally = { home: 0, draw: 0, away: 0 };
  const scores = {};
  let wHome = 0,
    wDraw = 0,
    wAway = 0,
    wSum = 0;

  for (const s of board) {
    const w = s.trust * s.confidence;
    tally[s.pick] += w;
    scores[s.predictedScore] = (scores[s.predictedScore] || 0) + w;
    wHome += s.probs.home * w;
    wDraw += s.probs.draw * w;
    wAway += s.probs.away * w;
    wSum += w;
  }

  const total = tally.home + tally.draw + tally.away || 1;
  let lean = "draw";
  if (tally.home >= tally.draw && tally.home >= tally.away) lean = "home";
  else if (tally.away >= tally.draw && tally.away >= tally.home) lean = "away";

  const topScore = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  return {
    lean,
    weights: {
      home: +(tally.home / total).toFixed(3),
      draw: +(tally.draw / total).toFixed(3),
      away: +(tally.away / total).toFixed(3),
    },
    avgProbs: {
      home: +(wHome / (wSum || 1)).toFixed(3),
      draw: +(wDraw / (wSum || 1)).toFixed(3),
      away: +(wAway / (wSum || 1)).toFixed(3),
    },
    mostCommonScore: topScore ? topScore[0] : "1-1",
    agreement: +(Math.max(tally.home, tally.draw, tally.away) / total).toFixed(3),
  };
}
