/**
 * Full PitchIntel analysis pipeline
 */

import { scoreMatrix, impliedFromOdds } from "./poisson.js";
import { assessStrength } from "./strength.js";
import {
  generateAnalystBoard,
  consensusFromAnalysts,
} from "./analysts.js";
import { generateSiteBoard, consensusFromSites } from "./sites.js";

function blendMarkets(model, market, wModel = 0.55) {
  return {
    home: wModel * model.home + (1 - wModel) * market.home,
    draw: wModel * model.draw + (1 - wModel) * market.draw,
    away: wModel * model.away + (1 - wModel) * market.away,
  };
}

function finalScoreEstimate(poisson, analystC, siteC, strength) {
  // weighted vote among model top, analysts, sites
  const votes = {};
  const add = (label, w) => {
    if (!label) return;
    votes[label] = (votes[label] || 0) + w;
  };

  for (const s of poisson.top.slice(0, 5)) {
    add(s.label, s.p * 3);
  }
  add(analystC.mostCommonScore, 2.2 * analystC.agreement);
  add(siteC.mostCommonScore, 2.0 * siteC.agreement);

  // also from rounded lambdas
  const rh = Math.round(strength.lambdas.home);
  const ra = Math.round(strength.lambdas.away);
  add(`${rh}-${ra}`, 1.5);

  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const best = ranked[0] || ["1-1", 1];
  const [h, a] = best[0].split("-").map(Number);
  return {
    label: best[0],
    homeGoals: h,
    awayGoals: a,
    alternatives: ranked.slice(0, 5).map(([label, w]) => ({
      label,
      weight: +w.toFixed(3),
    })),
  };
}

export function analyzeMatch(match, options = {}) {
  const odds = {
    home: +(options.odds?.home ?? match.odds?.home ?? 2.45),
    draw: +(options.odds?.draw ?? match.odds?.draw ?? 3.3),
    away: +(options.odds?.away ?? match.odds?.away ?? 2.9),
  };
  const injuryNotes = options.injuryNotes || "";

  const strength = assessStrength(match, {
    injuryNotes,
    coachHome: options.coachHome,
    coachAway: options.coachAway,
  });

  const poisson = scoreMatrix(strength.lambdas.home, strength.lambdas.away, 6);
  const market = impliedFromOdds(odds);
  const blended = blendMarkets(poisson.markets, market.devig, 0.58);

  const analystBoard = generateAnalystBoard({
    homeName: match.home?.name || strength.home.team,
    awayName: match.away?.name || strength.away.team,
    homePower: strength.home.power,
    awayPower: strength.away.power,
    coachHome: strength.home.coach,
    coachAway: strength.away.coach,
    markets: poisson.markets,
    topScores: poisson.top,
    notes: injuryNotes,
  });
  const analystConsensus = consensusFromAnalysts(analystBoard);

  const siteBoard = generateSiteBoard({
    markets: poisson.markets,
    lamH: strength.lambdas.home,
    lamA: strength.lambdas.away,
    homeName: match.home?.name || strength.home.team,
    awayName: match.away?.name || strength.away.team,
  });
  const siteConsensus = consensusFromSites(siteBoard);

  const finalScore = finalScoreEstimate(
    poisson,
    analystConsensus,
    siteConsensus,
    strength
  );

  // overall lean
  const leanScore = {
    home:
      blended.home * 0.4 +
      analystConsensus.weights.home * 0.3 +
      siteConsensus.weights.home * 0.3,
    draw:
      blended.draw * 0.4 +
      analystConsensus.weights.draw * 0.3 +
      siteConsensus.weights.draw * 0.3,
    away:
      blended.away * 0.4 +
      analystConsensus.weights.away * 0.3 +
      siteConsensus.weights.away * 0.3,
  };
  let lean = "draw";
  if (leanScore.home >= leanScore.draw && leanScore.home >= leanScore.away) lean = "home";
  else if (leanScore.away >= leanScore.draw && leanScore.away >= leanScore.home)
    lean = "away";

  const edges = {
    home: poisson.markets.home - market.devig.home,
    draw: poisson.markets.draw - market.devig.draw,
    away: poisson.markets.away - market.devig.away,
  };

  const summary = buildSummary({
    match,
    strength,
    finalScore,
    lean,
    leanScore,
    poisson,
    analystConsensus,
    siteConsensus,
    injuryNotes,
  });

  return {
    matchId: match.matchId || match.eventId,
    generatedAt: new Date().toISOString(),
    odds,
    market,
    edges,
    strength,
    poisson,
    blended,
    lean,
    leanScore: {
      home: +leanScore.home.toFixed(3),
      draw: +leanScore.draw.toFixed(3),
      away: +leanScore.away.toFixed(3),
    },
    finalScore,
    analysts: {
      board: analystBoard,
      consensus: analystConsensus,
    },
    sites: {
      board: siteBoard,
      consensus: siteConsensus,
      disclaimer:
        "各站結果為「方法論模擬」輸出，並非即時抓取第三方網站；聲譽標籤僅供參考、非保證命中率。",
    },
    summary,
    disclaimer:
      "僅供娛樂與數據研究，不構成投注建議。請遵守當地法律。",
  };
}

function buildSummary({
  match,
  strength,
  finalScore,
  lean,
  leanScore,
  poisson,
  analystConsensus,
  siteConsensus,
  injuryNotes,
}) {
  const home = match.home?.name || strength.home.team;
  const away = match.away?.name || strength.away.team;
  const leanLabel =
    lean === "home" ? home : lean === "away" ? away : "和局 / 膠着";

  return {
    headline: `模型估分 ${finalScore.label} · 傾向 ${leanLabel}`,
    bullets: [
      `球員+教練實力：${home} λ=${strength.lambdas.home}（${strength.home.coach.style}） vs ${away} λ=${strength.lambdas.away}（${strength.away.coach.style}）`,
      `Poisson 主勝 ${(poisson.markets.home * 100).toFixed(1)}% · 和 ${(poisson.markets.draw * 100).toFixed(1)}% · 客 ${(poisson.markets.away * 100).toFixed(1)}%`,
      `十大分析師共識：${analystConsensus.lean} · 最常見比分 ${analystConsensus.mostCommonScore} · 一致度 ${(analystConsensus.agreement * 100).toFixed(0)}%`,
      `十大預測站共識：${siteConsensus.lean} · 最常見比分 ${siteConsensus.mostCommonScore} · 一致度 ${(siteConsensus.agreement * 100).toFixed(0)}%`,
      injuryNotes ? `情報調整：${injuryNotes}` : "未輸入傷停情報（可於分析頁補充）",
      `綜合傾向權重 主${(leanScore.home * 100).toFixed(0)}% / 和${(leanScore.draw * 100).toFixed(0)}% / 客${(leanScore.away * 100).toFixed(0)}%`,
    ],
  };
}
