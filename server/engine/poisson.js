/**
 * Independent Poisson scoreline model
 */

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonP(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

export function scoreMatrix(lambdaHome, lambdaAway, maxGoals = 6) {
  const scores = [];
  let mass = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonP(lambdaHome, h) * poissonP(lambdaAway, a);
      scores.push({ h, a, p, label: `${h}-${a}` });
      mass += p;
    }
  }
  scores.sort((x, y) => y.p - x.p);

  let pHome = 0,
    pDraw = 0,
    pAway = 0,
    pOver25 = 0,
    pUnder25 = 0,
    pBtts = 0;
  for (const s of scores) {
    if (s.h > s.a) pHome += s.p;
    else if (s.h === s.a) pDraw += s.p;
    else pAway += s.p;
    const total = s.h + s.a;
    if (total >= 3) pOver25 += s.p;
    else pUnder25 += s.p;
    if (s.h >= 1 && s.a >= 1) pBtts += s.p;
  }

  const norm = mass > 0 ? 1 / mass : 1;
  return {
    lambdaHome,
    lambdaAway,
    totalXg: lambdaHome + lambdaAway,
    mass,
    scores: scores.map((s) => ({ ...s, p: s.p * norm })),
    top: scores.slice(0, 10).map((s) => ({ ...s, p: s.p * norm })),
    markets: {
      home: pHome * norm,
      draw: pDraw * norm,
      away: pAway * norm,
      over25: pOver25 * norm,
      under25: pUnder25 * norm,
      btts: pBtts * norm,
    },
  };
}

export function impliedFromOdds(odds) {
  const h = 1 / Math.max(1.01, +odds.home || 2.5);
  const d = 1 / Math.max(1.01, +odds.draw || 3.3);
  const a = 1 / Math.max(1.01, +odds.away || 2.8);
  const sum = h + d + a;
  return {
    raw: { home: h, draw: d, away: a },
    overround: sum,
    devig: { home: h / sum, draw: d / sum, away: a / sum },
  };
}
