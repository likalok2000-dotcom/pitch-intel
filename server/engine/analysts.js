/**
 * Top 10 professional football analyst personas
 * Each has a distinct lens; used to weight AI-style briefs from the same data.
 */

export const ANALYSTS = [
  {
    id: "neville",
    name: "Gary Neville",
    role: "Sky Sports · 戰術解構",
    focus: ["組織結構", "邊路", "比賽節奏", "心理"],
    weight: { structure: 1.2, intensity: 1.1, attack: 0.9, defense: 1.0, mentality: 1.3 },
    voice: "直白、重視球員責任與節奏控制",
  },
  {
    id: "carragher",
    name: "Jamie Carragher",
    role: "Monday Night Football · 防守體系",
    focus: ["防線線", "高位壓迫", "對抗", "定位球"],
    weight: { structure: 1.1, intensity: 1.3, attack: 0.85, defense: 1.35, mentality: 1.1 },
    voice: "強調防守紀律同身體對抗",
  },
  {
    id: "cox",
    name: "Michael Cox",
    role: "The Athletic · Zonal Marking",
    focus: ["陣型", "空間", "過渡", "對位"],
    weight: { structure: 1.4, intensity: 0.9, attack: 1.1, defense: 1.1, mentality: 0.85 },
    voice: "系統化、空間與陣型為先",
  },
  {
    id: "wilson",
    name: "Jonathan Wilson",
    role: "Guardian · 戰術史論",
    focus: ["教練哲學", "體系演變", "中場控制"],
    weight: { structure: 1.35, intensity: 0.85, attack: 1.0, defense: 1.05, mentality: 1.0 },
    voice: "把教練風格放進更大體系框架",
  },
  {
    id: "henry",
    name: "Thierry Henry",
    role: "CBS / Sky · 進攻解讀",
    focus: ["終端把握", "前場組合", "一對一"],
    weight: { structure: 0.95, intensity: 1.0, attack: 1.4, defense: 0.8, mentality: 1.15 },
    voice: "看前場創造力與終結質量",
  },
  {
    id: "shearer",
    name: "Alan Shearer",
    role: "Match of the Day · 鋒線",
    focus: ["禁區威脅", "門將", "定位球"],
    weight: { structure: 0.9, intensity: 1.05, attack: 1.35, defense: 0.9, mentality: 1.1 },
    voice: "務實、重點看入球機會質素",
  },
  {
    id: "ferdinand",
    name: "Rio Ferdinand",
    role: "FIVE / TNT · 領導力",
    focus: ["領導", "後防溝通", "心態"],
    weight: { structure: 1.05, intensity: 1.0, attack: 0.9, defense: 1.25, mentality: 1.4 },
    voice: "重視更衣室與場上領袖",
  },
  {
    id: "marcotti",
    name: "Gabriele Marcotti",
    role: "ESPN · 背景脈絡",
    focus: ["賽程", "傷停", "轉會氛圍", "動機"],
    weight: { structure: 1.0, intensity: 0.95, attack: 1.0, defense: 1.0, mentality: 1.25 },
    voice: "把比賽放進賽季與新聞背景",
  },
  {
    id: "keane",
    name: "Roy Keane",
    role: "Sky · 中場與標準",
    focus: ["中場控制", "侵略性", "標準要求"],
    weight: { structure: 1.05, intensity: 1.4, attack: 0.95, defense: 1.1, mentality: 1.35 },
    voice: "高標準、不容許鬆懈",
  },
  {
    id: "richards",
    name: "Micah Richards",
    role: "CBS · 能量與邊路",
    focus: ["能量", "翼位", "對位速度"],
    weight: { structure: 0.95, intensity: 1.25, attack: 1.15, defense: 0.95, mentality: 1.05 },
    voice: "看比賽能量同邊路衝擊",
  },
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pickScore(rng, baseH, baseA, bias) {
  let h = Math.round(baseH + bias.home + (rng() - 0.5) * 0.9);
  let a = Math.round(baseA + bias.away + (rng() - 0.5) * 0.9);
  h = clamp(h, 0, 5);
  a = clamp(a, 0, 5);
  return { h, a, label: `${h}-${a}` };
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

/**
 * Generate top-10 analyst briefs from match strength pack
 */
export function generateAnalystBoard(ctx) {
  const {
    homeName,
    awayName,
    homePower,
    awayPower,
    coachHome,
    coachAway,
    markets,
    topScores,
    notes = "",
  } = ctx;

  const seed = hashSeed(
    `${homeName}|${awayName}|${homePower.overall}|${awayPower.overall}|${notes}`
  );
  const rng = mulberry32(seed);
  const baseH = homePower.xg || 1.3;
  const baseA = awayPower.xg || 1.1;
  const fav = markets.home >= markets.away ? "home" : "away";

  return ANALYSTS.map((a, idx) => {
    const w = a.weight;
    const homeScore =
      homePower.structure * w.structure +
      homePower.intensity * w.intensity +
      homePower.attack * w.attack +
      homePower.defense * w.defense +
      homePower.mentality * w.mentality;
    const awayScore =
      awayPower.structure * w.structure +
      awayPower.intensity * w.intensity +
      awayPower.attack * w.attack +
      awayPower.defense * w.defense +
      awayPower.mentality * w.mentality;

    const edge = (homeScore - awayScore) / 5;
    let lean = "draw";
    if (edge > 0.12) lean = "home";
    else if (edge < -0.12) lean = "away";

    // slight persona noise so not all identical
    const bias = {
      home: lean === "home" ? 0.25 : lean === "away" ? -0.15 : 0,
      away: lean === "away" ? 0.25 : lean === "home" ? -0.15 : 0,
    };
    // Carragher/Keane slightly lower scoring games
    if (a.id === "carragher" || a.id === "keane") {
      bias.home -= 0.15;
      bias.away -= 0.15;
    }
    // Henry/Shearer slightly more open
    if (a.id === "henry" || a.id === "shearer") {
      bias.home += 0.1;
      bias.away += 0.1;
    }

    const score = pickScore(rng, baseH, baseA, bias);
    const conf = clamp(0.52 + Math.abs(edge) * 0.35 + (idx % 3) * 0.02, 0.48, 0.88);

    const winner =
      score.h > score.a ? homeName : score.h < score.a ? awayName : "和局";

    const coachNote =
      lean === "home"
        ? `${coachHome.name}（${coachHome.style}）應主導節奏`
        : lean === "away"
          ? `${coachAway.name}（${coachAway.style}）反擊/客場計劃值得關注`
          : "雙方教練風格可能互相抵消，場面膠着";

    const keyFocus = a.focus[Math.floor(rng() * a.focus.length)];
    const brief = [
      `從「${keyFocus}」角度看，${homeName} 綜合評 ${homeScore.toFixed(1)} vs ${awayName} ${awayScore.toFixed(1)}。`,
      coachNote + "。",
      notes ? `情報：${notes}。` : "",
      `預計比分 ${score.label}（${winner}），信心 ${(conf * 100).toFixed(0)}%。`,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      id: a.id,
      name: a.name,
      role: a.role,
      focus: a.focus,
      voice: a.voice,
      lean,
      predictedScore: score.label,
      confidence: +conf.toFixed(3),
      homeWeighted: +homeScore.toFixed(2),
      awayWeighted: +awayScore.toFixed(2),
      brief,
      marketsHint: {
        home: +(markets.home + edge * 0.05).toFixed(3),
        draw: +markets.draw.toFixed(3),
        away: +(markets.away - edge * 0.05).toFixed(3),
      },
    };
  }).sort((x, y) => y.confidence - x.confidence);
}

export function consensusFromAnalysts(board) {
  const tally = { home: 0, draw: 0, away: 0 };
  const scores = {};
  for (const a of board) {
    tally[a.lean] = (tally[a.lean] || 0) + a.confidence;
    scores[a.predictedScore] = (scores[a.predictedScore] || 0) + a.confidence;
  }
  const total = tally.home + tally.draw + tally.away || 1;
  const topScore = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  let lean = "draw";
  if (tally.home >= tally.draw && tally.home >= tally.away) lean = "home";
  else if (tally.away >= tally.draw && tally.away >= tally.home) lean = "away";

  return {
    lean,
    weights: {
      home: +(tally.home / total).toFixed(3),
      draw: +(tally.draw / total).toFixed(3),
      away: +(tally.away / total).toFixed(3),
    },
    mostCommonScore: topScore ? topScore[0] : "1-1",
    agreement: +Math.max(tally.home, tally.draw, tally.away) / total,
  };
}
