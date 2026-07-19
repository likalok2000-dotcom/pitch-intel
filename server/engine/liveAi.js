/**
 * Live match AI commentary — tipsme-style short briefs from score/events/stats
 * Local template engine always works; optional Grok when XAI_API_KEY set.
 */

const BASE = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-4.5";

export function buildLiveBrief(snap) {
  const home = snap.home?.name || "主隊";
  const away = snap.away?.name || "客隊";
  const sh = snap.score?.home ?? 0;
  const sa = snap.score?.away ?? 0;
  const clock = snap.clock || "—";
  const status = snap.status || "pre";
  const st = snap.matchStats || {};
  const h = st.home || {};
  const a = st.away || {};
  const events = snap.events || [];
  const last = events.slice(-3);
  const attack = snap.attack || {};

  const phase =
    status === "live"
      ? `進行中 ${clock}`
      : status === "post"
        ? "完場"
        : "賽前";

  const scoreline = `${home} ${sh}-${sa} ${away}`;
  const poss = `控球 ${h.possession ?? "—"}%–${a.possession ?? "—"}%`;
  const shots = `射門 ${h.shots ?? 0}(${h.shotsOnTarget ?? 0}) – ${a.shots ?? 0}(${a.shotsOnTarget ?? 0})`;
  const corners = `角球 ${h.corners ?? 0}-${a.corners ?? 0}`;
  const cards = `黃牌 ${h.yellow ?? 0}-${a.yellow ?? 0}` +
    ((h.red || a.red) ? ` · 紅牌 ${h.red ?? 0}-${a.red ?? 0}` : "");

  let momentum = "局面膠着";
  if (attack.homeShare >= 58) momentum = `${home} 進攻佔優，壓制中`;
  else if (attack.awayShare >= 58) momentum = `${away} 反客為主，壓力在主隊半場`;
  else if (Math.abs(sh - sa) >= 2) momentum = sh > sa ? `${home} 領先並控制節奏` : `${away} 領先並控制節奏`;

  const recent =
    last.length === 0
      ? "暫無關鍵事件。"
      : "最近事件：" +
        last
          .map((e) => `${e.clock} ${e.side === "home" ? home : e.side === "away" ? away : ""} ${e.text}`)
          .join("；") +
        "。";

  const risk = liveRiskNote({ sh, sa, h, a, status, events });

  const paragraphs = [
    `【${phase}】${scoreline}。${momentum}。`,
    `${poss}；${shots}；${corners}；${cards}。`,
    recent,
    risk,
  ];

  return {
    headline: `${scoreline} · ${phase}`,
    momentum,
    text: paragraphs.join("\n"),
    bullets: [
      poss,
      shots,
      corners,
      cards,
      `攻勢指標 主 ${attack.homeShare ?? "—"}% / 客 ${attack.awayShare ?? "—"}%`,
      risk,
    ],
    source: "local-live-engine",
    generatedAt: new Date().toISOString(),
  };
}

function liveRiskNote({ sh, sa, h, a, status, events }) {
  if (status === "pre") return "賽前：關注首發與開局節奏，暫無臨場數據。";
  if (status === "post") {
    return sh === sa
      ? "完場和局：雙方效率與把握機會能力成關鍵回顧點。"
      : `完場：勝方 ${sh > sa ? "主隊" : "客隊"}，可回看入球前後控球與射正差異。`;
  }
  const diff = Math.abs(sh - sa);
  const late = (() => {
    const m = parseInt(String(events[events.length - 1]?.clock || "0"), 10);
    return m >= 75;
  })();
  if (diff === 0 && (h.shotsOnTarget || 0) + (a.shotsOnTarget || 0) >= 6) {
    return "即時提示：0–0／平手但射正偏多，下半場隨時爆冷入球。";
  }
  if (diff === 1 && late) {
    return "即時提示：一球差距 + 比賽進入尾段，定位球與反擊風險上升。";
  }
  if ((h.red || 0) + (a.red || 0) > 0) {
    return "即時提示：有紅牌，人數劣勢一方可能收縮，注意大球／小球結構變化。";
  }
  if ((h.corners || 0) + (a.corners || 0) >= 8) {
    return "即時提示：角球偏多，定位球入球概率抬升。";
  }
  return "即時提示：繼續追蹤控球與射正差，勿只睇比分。";
}

export async function generateLiveAi(snap, { forceGrok = false } = {}) {
  const local = buildLiveBrief(snap);
  if (!process.env.XAI_API_KEY || (!forceGrok && process.env.LIVE_AI_LOCAL === "1")) {
    return { ...local, enabled: false };
  }

  try {
    const prompt = `你是粵語足球即時評述 AI。用 80–140 字繁中（可夾粵語），根據數據寫一段臨場分析，風格像專業直播旁述，不要鼓勵賭博。

對陣與比分：${local.headline}
控球/射門等：${local.bullets.join("；")}
事件：${(snap.events || []).slice(-6).map((e) => `${e.clock} ${e.text}`).join("，") || "無"}
`;

    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content: "PitchIntel 即時分析引擎。輸出簡潔臨場評述，繁體中文。",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`xAI ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || local.text;
    return {
      ...local,
      text,
      enabled: true,
      source: `xai:${MODEL}`,
    };
  } catch (e) {
    return { ...local, enabled: false, error: String(e.message || e) };
  }
}
