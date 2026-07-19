/**
 * Player strength + coach style → expected goals / power profile
 */

const COACH_STYLES = [
  {
    id: "possession",
    name: "控球組織型",
    keywords: ["guardiola", "arteta", "xavi", "flick", "de zerbi", "alonso"],
    attack: 1.08,
    defense: 1.05,
    intensity: 0.95,
    structure: 1.15,
    goalsBoost: 0.08,
  },
  {
    id: "gegenpress",
    name: "高位逼搶型",
    keywords: ["klopp", "nagelsmann", "slot", "ten hag", "conte"],
    attack: 1.1,
    defense: 0.98,
    intensity: 1.2,
    structure: 1.05,
    goalsBoost: 0.15,
  },
  {
    id: "counter",
    name: "防守反擊型",
    keywords: ["mourinho", "simeone", "allegri", "dyche", "moyes"],
    attack: 0.95,
    defense: 1.15,
    intensity: 1.05,
    structure: 1.08,
    goalsBoost: -0.12,
  },
  {
    id: "direct",
    name: "直接推進型",
    keywords: ["ange", "postecoglou", "potter", "emery"],
    attack: 1.12,
    defense: 0.92,
    intensity: 1.08,
    structure: 0.98,
    goalsBoost: 0.18,
  },
  {
    id: "balanced",
    name: "均衡務實型",
    keywords: [],
    attack: 1.0,
    defense: 1.0,
    intensity: 1.0,
    structure: 1.0,
    goalsBoost: 0,
  },
];

function formScore(form) {
  const f = (form || "").toUpperCase().replace(/[^WDL]/g, "").slice(0, 5);
  if (!f) return 0.5;
  let s = 0;
  let w = 0;
  for (let i = 0; i < f.length; i++) {
    const weight = 1 + (4 - i) * 0.12;
    w += weight;
    if (f[i] === "W") s += weight;
    else if (f[i] === "D") s += weight * 0.45;
  }
  return s / w;
}

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function inferCoach(teamName, explicitCoach) {
  const name = explicitCoach?.name || explicitCoach || "";
  const blob = `${name} ${teamName}`.toLowerCase();
  for (const style of COACH_STYLES) {
    if (style.keywords.some((k) => blob.includes(k))) {
      return {
        name: name || `${teamName} 教練組`,
        styleId: style.id,
        style: style.name,
        profile: style,
      };
    }
  }
  // deterministic pseudo style from team name so UI is interesting
  const idx = Math.floor(hash01(teamName) * (COACH_STYLES.length - 1));
  const style = COACH_STYLES[idx];
  return {
    name: name || `${teamName} 教練組`,
    styleId: style.id,
    style: style.name,
    profile: style,
    inferred: !name,
  };
}

function playerPool(team, side) {
  const leaders = team.leaders || team.players || [];
  const base = [];
  // Prefer real lineup players (rating/role already set)
  for (const p of leaders.slice(0, 11)) {
    if (p.rating != null && p.role) {
      base.push({
        name: p.name,
        role: p.role,
        rating: +p.rating,
        goals: p.goals || 0,
        apps: p.apps || 0,
        importance: p.importance ?? (p.starter === false ? 0.45 : 0.85),
        source: p.source || "lineup",
      });
      continue;
    }
    const g = p.goals || 0;
    const apps = Math.max(1, p.apps || 10);
    const rating = Math.min(92, 68 + (g / apps) * 40 + hash01(p.name) * 8);
    base.push({
      name: p.name,
      role: g >= 5 ? "前鋒" : "主力",
      rating: +rating.toFixed(1),
      goals: g,
      apps,
      importance: Math.min(1, 0.45 + g * 0.06),
      source: "leaders",
    });
  }

  // fill synthetic squad skeleton so every match has a readable XI strength
  const roles = [
    { role: "門將", base: 74 },
    { role: "中堅", base: 76 },
    { role: "邊衛", base: 75 },
    { role: "後腰", base: 77 },
    { role: "前腰", base: 78 },
    { role: "邊鋒", base: 79 },
    { role: "中鋒", base: 80 },
  ];
  const form = formScore(team.form);
  while (base.length < 7) {
    const r = roles[base.length % roles.length];
    const jitter = hash01(`${team.name}|${side}|${base.length}`) * 10 - 3;
    const rating = Math.min(91, Math.max(68, r.base + form * 8 + jitter + (team.rankBoost || 0)));
    base.push({
      name: `${team.short || team.name.slice(0, 3)} · ${r.role}${base.length + 1}`,
      role: r.role,
      rating: +rating.toFixed(1),
      goals: 0,
      importance: r.role === "中鋒" || r.role === "前腰" ? 0.85 : 0.65,
      synthetic: true,
    });
  }
  return base;
}

function powerFromPlayers(players, coach, team, isHome) {
  const attackRoles = new Set(["前鋒", "中鋒", "邊鋒", "前腰", "主力"]);
  const defRoles = new Set(["門將", "中堅", "邊衛", "後腰"]);

  let atk = 0,
    def = 0,
    wAtk = 0,
    wDef = 0,
    all = 0,
    wAll = 0;
  for (const p of players) {
    const w = p.importance || 0.7;
    all += p.rating * w;
    wAll += w;
    if (attackRoles.has(p.role) || (p.goals || 0) >= 3) {
      atk += p.rating * w;
      wAtk += w;
    }
    if (defRoles.has(p.role)) {
      def += p.rating * w;
      wDef += w;
    }
  }
  const overall = (all / (wAll || 1) - 70) / 20; // ~0-1 scale-ish
  let attack = (atk / (wAtk || 1) - 70) / 20;
  let defense = (def / (wDef || 1) - 70) / 20;
  const form = formScore(team.form);
  const gpg = team.gpg ?? 1.3;
  const gapg = team.gapg ?? 1.2;

  attack = Math.max(0.2, Math.min(1.2, attack * 0.55 + form * 0.25 + (gpg / 2.2) * 0.2));
  defense = Math.max(0.2, Math.min(1.2, defense * 0.55 + (1 - form) * 0.1 + (1.6 - gapg) / 2 * 0.35));
  let intensity = 0.55 + form * 0.3 + hash01(team.name + "int") * 0.15;
  let structure = 0.55 + form * 0.2 + hash01(team.name + "str") * 0.2;
  let mentality = 0.5 + form * 0.35 + (isHome ? 0.08 : 0);

  // coach multipliers
  const c = coach.profile;
  attack *= c.attack;
  defense *= c.defense;
  intensity *= c.intensity;
  structure *= c.structure;

  // injury notes handled outside via adj

  const xgBase =
    (0.85 + attack * 0.9) *
    (isHome ? 1.08 : 0.96) *
    (0.92 + (1.15 - Math.min(1.15, defense * 0.35))) *
    (1 + c.goalsBoost * 0.5);

  return {
    overall: +((overall * 0.5 + attack * 0.25 + defense * 0.25) * 100).toFixed(1),
    attack: +Math.min(1.25, attack).toFixed(3),
    defense: +Math.min(1.25, defense).toFixed(3),
    intensity: +Math.min(1.25, intensity).toFixed(3),
    structure: +Math.min(1.25, structure).toFixed(3),
    mentality: +Math.min(1.25, mentality).toFixed(3),
    xg: +Math.max(0.35, Math.min(3.8, xgBase)).toFixed(3),
    form: +form.toFixed(3),
    gpg,
    gapg,
  };
}

/**
 * Build full personnel pack for both sides
 */
export function assessStrength(match, options = {}) {
  const notes = (options.injuryNotes || "").toLowerCase();
  const homeTeam = match.home || {};
  const awayTeam = match.away || {};

  const coachHomeRaw = options.coachHome || homeTeam.coach?.name || homeTeam.coach;
  const coachAwayRaw = options.coachAway || awayTeam.coach?.name || awayTeam.coach;
  const coachHome = inferCoach(homeTeam.name, coachHomeRaw);
  const coachAway = inferCoach(awayTeam.name, coachAwayRaw);

  const homePlayers = playerPool(homeTeam, "home");
  const awayPlayers = playerPool(awayTeam, "away");

  let homePower = powerFromPlayers(homePlayers, coachHome, homeTeam, true);
  let awayPower = powerFromPlayers(awayPlayers, coachAway, awayTeam, false);

  // injury / notes heuristic
  if (notes.includes("主") && (notes.includes("傷") || notes.includes("停"))) {
    homePower = { ...homePower, xg: Math.max(0.35, homePower.xg - 0.22), attack: homePower.attack * 0.9 };
  }
  if (notes.includes("客") && (notes.includes("傷") || notes.includes("停"))) {
    awayPower = { ...awayPower, xg: Math.max(0.35, awayPower.xg - 0.22), attack: awayPower.attack * 0.9 };
  }
  // name-based: if notes mention a leader name, soft-nerf that side
  for (const p of homePlayers) {
    if (p.name && notes.includes(p.name.toLowerCase().slice(0, 4))) {
      homePower.xg = Math.max(0.35, homePower.xg - 0.18 * (p.importance || 0.7));
    }
  }
  for (const p of awayPlayers) {
    if (p.name && notes.includes(p.name.toLowerCase().slice(0, 4))) {
      awayPower.xg = Math.max(0.35, awayPower.xg - 0.18 * (p.importance || 0.7));
    }
  }

  const lamH = homePower.xg * (1.05 - awayPower.defense * 0.15);
  const lamA = awayPower.xg * (1.0 - homePower.defense * 0.12);

  return {
    home: {
      team: homeTeam.name,
      coach: coachHome,
      players: homePlayers,
      power: homePower,
    },
    away: {
      team: awayTeam.name,
      coach: coachAway,
      players: awayPlayers,
      power: awayPower,
    },
    lambdas: {
      home: +Math.max(0.3, Math.min(4.2, lamH)).toFixed(3),
      away: +Math.max(0.3, Math.min(4.2, lamA)).toFixed(3),
    },
  };
}
