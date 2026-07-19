/**
 * PitchIntel 波析 AI — frontend
 */

import {
  LOCALES,
  t,
  setLang,
  getLang,
  applyDom,
  leanWord,
} from "./i18n.js";

const state = {
  view: "board",
  tab: "ai",
  leagueId: "eng.1",
  match: null,
  analysis: null,
  ai: null,
  nick: localStorage.getItem("pi_nick") || "球迷",
  ws: null,
  providers: null,
};

const $ = (id) => document.getElementById(id);
const pct = (x) => `${((x || 0) * 100).toFixed(1)}%`;

function setView(name) {
  state.view = name;
  document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
  const v = $(`view-${name}`);
  if (v) v.classList.remove("hidden");
  document.querySelectorAll("#nav-tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#match-subtabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.panel !== tab);
  });
  if (tab === "chat") joinChat();
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json();
}

function initLangSwitch() {
  const box = $("lang-switch");
  box.innerHTML = LOCALES.map(
    (l) =>
      `<button type="button" class="lang-btn${l.id === getLang() ? " active" : ""}" data-lang="${l.id}">${l.label}</button>`
  ).join("");
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lang]");
    if (!b) return;
    setLang(b.dataset.lang);
    box.querySelectorAll("button").forEach((x) => {
      x.classList.toggle("active", x.dataset.lang === getLang());
    });
    // re-render dynamic bits
    if (state.view === "board") loadBoard();
    if (state.analysis) paintAnalysis({ analysis: state.analysis, ai: state.ai, match: state.match });
    updateWsPillText();
  });
}

function updateWsPillText() {
  const on = $("ws-pill").classList.contains("on");
  const txt = $("ws-pill").querySelector(".txt");
  if (txt) txt.textContent = on ? t("chat_on") : t("chat_off");
}

async function loadLeagues() {
  const data = await api("/api/leagues");
  state.providers = data.providers || null;
  paintProviderPill();
  const sel = $("league-select");
  sel.innerHTML = "";
  for (const l of data.leagues) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    sel.appendChild(o);
  }
  sel.value = state.leagueId;
}

function paintProviderPill() {
  const p = state.providers;
  const el = $("provider-pill");
  if (!el || !p) return;
  const af = p.apiFootball ? " + AF" : "";
  el.querySelector(".txt").textContent = `${(p.mode || "auto").toUpperCase()}${af}`;
  el.title = `mode=${p.mode} apiFootball=${p.apiFootball} espn=${p.espn}`;
}

async function loadBoard() {
  state.leagueId = $("league-select").value || "eng.1";
  $("matches-body").innerHTML = `<tr><td colspan="5" class="loading">${t("loading")}</td></tr>`;
  try {
    const data = await api(`/api/matches?league=${encodeURIComponent(state.leagueId)}`);
    if (data.source) paintProviderFromSource(data.source);
    const rows = data.matches || [];
    if (!rows.length) {
      $("matches-body").innerHTML = `<tr><td colspan="5" class="loading">${t("no_matches")}</td></tr>`;
    } else {
      $("matches-body").innerHTML = rows
        .map((m) => {
          const st =
            m.status === "live"
              ? `<span class="status-live">${t("live")} ${m.clock || ""}</span>`
              : m.status === "post"
                ? `<span class="status-pre">${t("finished")}</span>`
                : `<span class="status-pre">${t("scheduled")}</span>`;
          const ko = m.kickoff
            ? new Date(m.kickoff).toLocaleString(getLang(), {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—";
          return `<tr data-id="${m.matchId}" data-league="${m.leagueId || state.leagueId}">
            <td>${st}</td>
            <td><strong>${esc(m.home?.name)}</strong> vs <strong>${esc(m.away?.name)}</strong></td>
            <td class="score">${m.home?.score ?? 0} - ${m.away?.score ?? 0}</td>
            <td>${ko}</td>
            <td>${esc(m.venue || "—")}</td>
          </tr>`;
        })
        .join("");
      $("matches-body").querySelectorAll("tr[data-id]").forEach((tr) => {
        tr.addEventListener("click", () => openMatch(tr.dataset.league, tr.dataset.id));
      });
    }
    const src = data.source || {};
    $("board-source").textContent = `${t("data_provider")}: ${src.name || "—"} · ${src.latencyMs ?? "—"}ms · ${src.fetchedAt || ""}`;
  } catch (e) {
    $("matches-body").innerHTML = `<tr><td colspan="5" class="loading">${t("load_fail")}: ${esc(e.message)}</td></tr>`;
  }
}

function paintProviderFromSource(source) {
  const el = $("provider-pill");
  if (!el || !source?.name) return;
  el.querySelector(".txt").textContent = String(source.name).toUpperCase().slice(0, 18);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function openMatch(leagueId, matchId) {
  setView("match");
  setTab("ai");
  $("ai-text").textContent = t("loading");
  try {
    const snap = await api(
      `/api/matches/${encodeURIComponent(leagueId)}/${encodeURIComponent(matchId)}`
    );
    state.match = snap;
    state.leagueId = snap.leagueId || leagueId;
    paintMatchHeader(snap);
    if (snap.odds) {
      $("in-home").value = snap.odds.home ?? 2.5;
      $("in-draw").value = snap.odds.draw ?? 3.3;
      $("in-away").value = snap.odds.away ?? 2.8;
    }
    if (snap.home?.coach?.name) $("in-coach-h").value = snap.home.coach.name;
    if (snap.away?.coach?.name) $("in-coach-a").value = snap.away.coach.name;
    await runAnalyze();
    joinChat();
  } catch (e) {
    $("ai-text").textContent = `${t("load_fail")}: ${e.message}`;
  }
}

function paintMatchHeader(snap) {
  $("league-line").textContent = snap.league || "—";
  $("venue-line").textContent = snap.venue || "—";
  $("ko-line").textContent = snap.kickoff
    ? new Date(snap.kickoff).toLocaleString(getLang())
    : "—";
  $("home-name").textContent = snap.home?.name || "Home";
  $("away-name").textContent = snap.away?.name || "Away";
  $("home-sub").textContent =
    [snap.home?.form, snap.home?.record, snap.home?.formation, snap.home?.rank != null ? `#${snap.home.rank}` : ""]
      .filter(Boolean)
      .join(" · ") || "—";
  $("away-sub").textContent =
    [snap.away?.form, snap.away?.record, snap.away?.formation, snap.away?.rank != null ? `#${snap.away.rank}` : ""]
      .filter(Boolean)
      .join(" · ") || "—";
  const sh = snap.score?.home ?? 0;
  const sa = snap.score?.away ?? 0;
  $("score-line").textContent = `${sh} - ${sa}`;
  const live =
    snap.status === "live"
      ? `${t("live")} ${snap.clock || ""}`
      : snap.statusDetail || snap.status || "—";
  $("score-status").textContent = live;
  const lu = $("lineup-pill");
  if (snap.lineupsConfirmed) {
    lu.textContent = t("lineups_yes");
    lu.className = "badge mint";
  } else {
    lu.textContent = t("lineups_no");
    lu.className = "badge";
  }
  $("source-line").textContent = snap.source
    ? `${t("data_provider")}: ${snap.source.name}${snap.source.enrichedBy ? " + " + snap.source.enrichedBy : ""} · ${snap.source.reliability || ""}`
    : "";
}

async function runAnalyze() {
  if (!state.match) return;
  $("btn-analyze").disabled = true;
  $("ai-text").textContent = t("analyzing");
  try {
    const body = {
      leagueId: state.match.leagueId || state.leagueId,
      matchId: state.match.matchId,
      snapshot: state.match,
      odds: {
        home: +$("in-home").value,
        draw: +$("in-draw").value,
        away: +$("in-away").value,
      },
      injuryNotes: $("in-notes").value || "",
      coachHome: $("in-coach-h").value || undefined,
      coachAway: $("in-coach-a").value || undefined,
      withAi: true,
    };
    const data = await api("/api/analyze", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.analysis = data.analysis;
    state.ai = data.ai;
    paintAnalysis(data);
  } catch (e) {
    $("ai-text").textContent = `${t("load_fail")}: ${e.message}`;
  } finally {
    $("btn-analyze").disabled = false;
  }
}

function paintAnalysis(data) {
  const a = data.analysis;
  if (!a) return;
  const match = data.match || state.match || {};
  const home = match.home?.name || match.home || a.strength?.home?.team || "Home";
  const away = match.away?.name || match.away || a.strength?.away?.team || "Away";

  $("est-score").textContent = a.finalScore.label;
  $("est-lean").textContent = `${t("tendency")} ${leanWord(a.lean, home, away)} · ${pct(a.leanScore.home)} / ${pct(a.leanScore.draw)} / ${pct(a.leanScore.away)}`;

  $("ai-text").textContent = data.ai?.text || a.summary.headline;
  $("ai-meta").textContent = data.ai
    ? `${data.ai.source}${data.ai.error ? " · " + data.ai.error : ""}`
    : "";

  $("summary-bullets").innerHTML = (a.summary.bullets || [])
    .map((b) => `<li>${esc(b)}</li>`)
    .join("");

  $("score-matrix").innerHTML = (a.poisson.top || [])
    .slice(0, 8)
    .map(
      (s, i) =>
        `<span class="score-chip${i === 0 ? " top" : ""}">${s.label} · ${pct(s.p)}</span>`
    )
    .join("");

  const m = a.poisson.markets;
  const i = a.market.devig;
  setBar("m-home", "bar-m-home", m.home);
  setBar("m-draw", "bar-m-draw", m.draw);
  setBar("m-away", "bar-m-away", m.away);
  setBar("i-home", "bar-i-home", i.home);
  setBar("i-draw", "bar-i-draw", i.draw);
  setBar("i-away", "bar-i-away", i.away);
  $("overround").textContent = a.market.overround?.toFixed(3) ?? "—";
  $("edge-h").textContent = ((a.edges.home || 0) * 100).toFixed(1) + "pp";
  $("edge-d").textContent = ((a.edges.draw || 0) * 100).toFixed(1) + "pp";
  $("edge-a").textContent = ((a.edges.away || 0) * 100).toFixed(1) + "pp";

  $("final-card").innerHTML = `${esc(home)} <strong style="color:var(--gold)">${a.finalScore.label}</strong> ${esc(away)}`;
  $("alt-scores").innerHTML = (a.finalScore.alternatives || [])
    .map((s, idx) => `<span class="score-chip${idx === 0 ? " top" : ""}">${s.label}</span>`)
    .join("");

  paintAnalysts(a, home, away);
  paintSites(a, home, away);
  paintSquad(a);
}

function setBar(labelId, barId, p) {
  $(labelId).textContent = pct(p);
  $(barId).style.width = `${Math.max(0, Math.min(100, (p || 0) * 100))}%`;
}

function paintAnalysts(a, home, away) {
  const c = a.analysts.consensus;
  $("analyst-consensus").innerHTML = `
    <div class="cell"><div class="v">${esc(leanWord(c.lean, home, away))}</div><div class="k">${t("consensus_lean")}</div></div>
    <div class="cell"><div class="v">${c.mostCommonScore}</div><div class="k">${t("common_score")}</div></div>
    <div class="cell"><div class="v">${(c.agreement * 100).toFixed(0)}%</div><div class="k">${t("agreement")}</div></div>
  `;
  $("analyst-grid").innerHTML = a.analysts.board
    .map(
      (x) => `
    <article class="person-card">
      <h3>${esc(x.name)} <span class="tag pick">${esc(x.predictedScore)}</span></h3>
      <div class="role">${esc(x.role)} · ${t("conf")} ${pct(x.confidence)}</div>
      <div class="brief">${esc(x.brief)}</div>
      <div class="tags">${(x.focus || []).map((tg) => `<span class="tag">${esc(tg)}</span>`).join("")}</div>
    </article>`
    )
    .join("");
}

function paintSites(a, home, away) {
  const c = a.sites.consensus;
  $("sites-disclaimer").textContent = a.sites.disclaimer || "";
  $("site-consensus").innerHTML = `
    <div class="cell"><div class="v">${esc(leanWord(c.lean, home, away))}</div><div class="k">${t("consensus_lean")}</div></div>
    <div class="cell"><div class="v">${c.mostCommonScore}</div><div class="k">${t("common_score")}</div></div>
    <div class="cell"><div class="v">${(c.agreement * 100).toFixed(0)}%</div><div class="k">${t("agreement")}</div></div>
  `;
  $("site-grid").innerHTML = a.sites.board
    .map(
      (x) => `
    <article class="person-card">
      <h3>${esc(x.name)} <span class="tag pick">${esc(x.pickLabel)} · ${esc(x.predictedScore)}</span></h3>
      <div class="role">${esc(x.method)} · trust ${x.trust} · ${pct(x.confidence)}</div>
      <div class="brief">${esc(x.reputation)} · ${pct(x.probs.home)} / ${pct(x.probs.draw)} / ${pct(x.probs.away)}</div>
    </article>`
    )
    .join("");
}

function paintSquad(a) {
  const sides = [
    ["home", a.strength.home],
    ["away", a.strength.away],
  ];
  $("power-row").innerHTML = sides
    .map(([, s]) => {
      const p = s.power;
      return `
      <div class="power-box">
        <h3>${esc(s.team)}</h3>
        <div class="coach-line">${t("coach")} ${esc(s.coach.name)} · ${esc(s.coach.style)}${s.coach.inferred ? t("inferred") : ""}</div>
        <div class="bar-row"><div class="bar-label"><span>${t("overall")}</span><span>${p.overall}</span></div><div class="bar"><i style="width:${Math.min(100, p.overall)}%"></i></div></div>
        <div class="bar-row"><div class="bar-label"><span>${t("attack")}</span><span>${pct(p.attack / 1.25)}</span></div><div class="bar"><i style="width:${(p.attack / 1.25) * 100}%"></i></div></div>
        <div class="bar-row"><div class="bar-label"><span>${t("defense")}</span><span>${pct(p.defense / 1.25)}</span></div><div class="bar"><i style="width:${(p.defense / 1.25) * 100}%"></i></div></div>
        <div class="bar-row"><div class="bar-label"><span>λ xG</span><span>${p.xg}</span></div><div class="bar"><i style="width:${Math.min(100, (p.xg / 3) * 100)}%"></i></div></div>
        <ul class="player-list" style="margin-top:10px">
          ${s.players
            .slice(0, 11)
            .map(
              (pl) =>
                `<li><span>${esc(pl.name)} <span class="tag">${esc(pl.role)}</span>${pl.synthetic ? "" : ""}</span><span class="rating">${pl.rating}</span></li>`
            )
            .join("")}
        </ul>
      </div>`;
    })
    .join("");
}

/* —— Chat WS —— */
function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function setWsPill(on) {
  const pill = $("ws-pill");
  pill.classList.toggle("on", on);
  updateWsPillText();
}

function ensureWs() {
  if (state.ws && state.ws.readyState <= 1) return state.ws;
  const ws = new WebSocket(wsUrl());
  state.ws = ws;
  ws.onopen = () => {
    setWsPill(true);
    if (state.match) {
      ws.send(
        JSON.stringify({
          type: "join",
          leagueId: state.match.leagueId || state.leagueId,
          matchId: state.match.matchId,
        })
      );
    }
  };
  ws.onclose = () => {
    setWsPill(false);
    state.ws = null;
  };
  ws.onerror = () => setWsPill(false);
  ws.onmessage = (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (data.type === "joined" && Array.isArray(data.messages)) {
      $("chat-log").innerHTML = "";
      data.messages.forEach(appendChat);
      appendSystem(`${t("joined")} ${data.room}`);
    }
    if (data.type === "chat" && data.message) appendChat(data.message);
  };
  return ws;
}

function joinChat() {
  if (!state.match) return;
  const ws = ensureWs();
  if (ws.readyState === 1) {
    ws.send(
      JSON.stringify({
        type: "join",
        leagueId: state.match.leagueId || state.leagueId,
        matchId: state.match.matchId,
      })
    );
  }
}

function appendChat(msg) {
  const log = $("chat-log");
  const div = document.createElement("div");
  div.className = "chat-msg";
  const time = msg.at
    ? new Date(msg.at).toLocaleTimeString(getLang(), { hour: "2-digit", minute: "2-digit" })
    : "";
  div.innerHTML = `<span class="nick">${esc(msg.nick)}</span>${esc(msg.text)}<span class="time">${time}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function appendSystem(text) {
  const log = $("chat-log");
  const div = document.createElement("div");
  div.className = "chat-msg system";
  div.innerHTML = `<span class="nick">${t("system")}</span>${esc(text)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function sendChat() {
  const text = $("chat-text").value.trim();
  if (!text || !state.match) return;
  const nick = ($("chat-nick").value || "Fan").slice(0, 24);
  state.nick = nick;
  localStorage.setItem("pi_nick", nick);
  const ws = ensureWs();
  const payload = {
    type: "chat",
    leagueId: state.match.leagueId || state.leagueId,
    matchId: state.match.matchId,
    nick,
    text,
  };
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  } else {
    api(
      `/api/chat/${encodeURIComponent(payload.leagueId)}/${encodeURIComponent(payload.matchId)}`,
      { method: "POST", body: JSON.stringify({ nick, text }) }
    ).then((r) => {
      if (r.message) appendChat(r.message);
    });
  }
  $("chat-text").value = "";
}

async function loadDemo() {
  const snap = await api("/api/demo");
  state.match = snap;
  state.leagueId = snap.leagueId;
  setView("match");
  setTab("ai");
  paintMatchHeader(snap);
  if (snap.odds) {
    $("in-home").value = snap.odds.home;
    $("in-draw").value = snap.odds.draw;
    $("in-away").value = snap.odds.away;
  }
  await runAnalyze();
  joinChat();
}

function bind() {
  $("nav-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-view]");
    if (!b) return;
    setView(b.dataset.view);
    if (b.dataset.view === "board") loadBoard();
  });
  $("match-subtabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) setTab(b.dataset.tab);
  });
  $("btn-refresh-board").addEventListener("click", loadBoard);
  $("league-select").addEventListener("change", loadBoard);
  $("btn-demo").addEventListener("click", () => loadDemo().catch(alert));
  $("btn-analyze").addEventListener("click", () => runAnalyze().catch(alert));
  $("btn-chat-send").addEventListener("click", sendChat);
  $("chat-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
  $("chat-nick").value = state.nick;
}

async function main() {
  initLangSwitch();
  applyDom();
  bind();
  setView("board");
  try {
    await loadLeagues();
    await loadBoard();
  } catch (e) {
    console.error(e);
  }
}

main();
