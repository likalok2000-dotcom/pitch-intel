/**
 * Optional SpaceXAI (xAI) narrative layer
 * Env: XAI_API_KEY
 */

const BASE = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-4.5";

export function aiEnabled() {
  return Boolean(process.env.XAI_API_KEY);
}

export async function generateAiNarrative(analysis, match) {
  if (!process.env.XAI_API_KEY) {
    return {
      enabled: false,
      text: fallbackNarrative(analysis, match),
      source: "local-fallback",
    };
  }

  const home = match.home?.name || analysis.strength.home.team;
  const away = match.away?.name || analysis.strength.away.team;

  const prompt = `你是專業粵語／繁中足球分析主播。根據以下結構化數據，用 180-280 字寫一則賽前 AI 分析，要有教練風格對撞、球員實力、最可能比分與風險。不要鼓勵賭博。

對陣：${home} vs ${away}
估分：${analysis.finalScore.label}
傾向：${analysis.lean}
主隊教練：${analysis.strength.home.coach.name}（${analysis.strength.home.coach.style}）
客隊教練：${analysis.strength.away.coach.name}（${analysis.strength.away.coach.style}）
λ 進球期望：${analysis.strength.lambdas.home} - ${analysis.strength.lambdas.away}
分析師共識比分：${analysis.analysts.consensus.mostCommonScore}
預測站共識比分：${analysis.sites.consensus.mostCommonScore}
重點：${analysis.summary.bullets.join("；")}
`;

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "你是 PitchIntel 波析 AI 的首席分析引擎。輸出繁體中文，語氣專業冷靜，可夾少量粵語口吻。",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`xAI ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const text =
      data.choices?.[0]?.message?.content ||
      data.output_text ||
      fallbackNarrative(analysis, match);

    return { enabled: true, text, source: `xai:${MODEL}`, model: MODEL };
  } catch (e) {
    return {
      enabled: false,
      text: fallbackNarrative(analysis, match),
      source: "local-fallback",
      error: String(e.message || e),
    };
  }
}

function fallbackNarrative(analysis, match) {
  const home = match.home?.name || analysis.strength.home.team;
  const away = match.away?.name || analysis.strength.away.team;
  const ch = analysis.strength.home.coach;
  const ca = analysis.strength.away.coach;
  return [
    `【波析 AI 本地引擎】${home} vs ${away}：綜合球員實力與教練風格後，模型估分 ${analysis.finalScore.label}。`,
    `主隊走「${ch.style}」（${ch.name}），客隊「${ca.style}」（${ca.name}），進球期望 λ ${analysis.strength.lambdas.home}-${analysis.strength.lambdas.away}。`,
    `十大分析師傾向 ${analysis.analysts.consensus.mostCommonScore}（一致度 ${(analysis.analysts.consensus.agreement * 100).toFixed(0)}%），十大預測站共識 ${analysis.sites.consensus.mostCommonScore}。`,
    analysis.summary.headline,
    "（未設定 XAI_API_KEY 時使用本地敘事；設定後可升級為 Grok  gener 文案。）",
  ].join(" ");
}
