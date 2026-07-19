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
  tab: "live",
  leagueId: "eng.1",
  match: null,
  analysis: null,
  ai: null,
  live: null,
  nick: localStorage.getItem("pi_nick") || "球迷",
  ws: null,
  providers: null,
  pollTimer: null,
  tipPick: null,
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
  if (tab === "live" && state.match) refreshLive();
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
  setTab("live");
  $("ai-text").textContent = t("loading");
  $("live-ai-text").textContent = t("loading");
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
    await Promise.all([refreshLive(), runAnalyze(), loadTips()]);
    startLivePoll();
    joinChat();
  } catch (e) {
    $("ai-text").textContent = `${t("load_fail")}: ${e.message}`;
    $("live-ai-text").textContent = `${t("load_fail")}: ${e.message}`;
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
  setTab("live");
  paintMatchHeader(snap);
  if (snap.odds) {
    $("in-home").value = snap.odds.home;
    $("in-draw").value = snap.odds.draw;
    $("in-away").value = snap.odds.away;
  }
  await Promise.all([refreshLive(), runAnalyze(), loadTips()]);
  startLivePoll();
  joinChat();
}

/* —— Live pack —— */
function stopLivePoll() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startLivePoll() {
  stopLivePoll();
  if (!state.match) return;
  // poll every 12s for live / post still refreshing; demo also ok
  state.pollTimer = setInterval(() => {
    if (state.view === "match") refreshLive().catch(() => {});
  }, 12000);
}

async function refreshLive() {
  if (!state.match) return;
  const leagueId = state.match.leagueId || state.leagueId;
  const matchId = state.match.matchId;
  const data = await api(
    `/api/live/${encodeURIComponent(leagueId)}/${encodeURIComponent(matchId)}`
  );
  state.live = data;
  // merge score into match for header
  if (state.match) {
    state.match.score = data.score;
    state.match.clock = data.clock;
    state.match.status = data.status;
    state.match.statusDetail = data.statusDetail;
    state.match.events = data.events;
    state.match.matchStats = data.matchStats;
    state.match.attack = data.attack;
  }
  paintMatchHeader(state.match);
  paintLivePack(data);
}

function paintLivePack(data) {
  const home = data.home?.name || "Home";
  const away = data.away?.name || "Away";
  const st = data.matchStats || {};
  const h = st.home || {};
  const a = st.away || {};

  $("stat-poss").textContent = `控球 ${h.possession ?? "—"}%–${a.possession ?? "—"}%`;
  $("stat-shots").textContent = `射門 ${h.shots ?? 0}(${h.shotsOnTarget ?? 0})–${a.shots ?? 0}(${a.shotsOnTarget ?? 0})`;
  $("stat-corners").textContent = `角球 ${h.corners ?? 0}-${a.corners ?? 0}`;
  $("stat-cards").textContent = `🟨 ${h.yellow ?? 0}-${a.yellow ?? 0}` +
    ((h.red || a.red) ? ` 🟥 ${h.red ?? 0}-${a.red ?? 0}` : "");

  const ai = data.liveAi || {};
  $("live-ai-text").textContent = ai.text || ai.headline || "—";
  $("live-ai-meta").textContent = ai.source
    ? `${ai.source} · ${ai.generatedAt || ""}`
    : "";

  paintTimeline(data.events || [], home, away);
  paintPitch(data.attack, h, a, home, away);
  paintH2H(data.h2h || []);

  const pill = $("live-poll-pill");
  if (data.status === "live") {
    pill.textContent = `LIVE ${data.clock || ""}`;
    pill.className = "badge rose";
  } else if (data.status === "post") {
    pill.textContent = t("finished");
    pill.className = "badge mint";
  } else {
    pill.textContent = t("scheduled");
    pill.className = "badge";
  }
}

function paintTimeline(events, home, away) {
  const ul = $("event-timeline");
  if (!events.length) {
    ul.innerHTML = `<li class="muted">${t("no_events")}</li>`;
    return;
  }
  // show newest first
  const rows = [...events].reverse();
  ul.innerHTML = rows
    .map((e) => {
      const sideCls =
        e.side === "home" ? "side-home" : e.side === "away" ? "side-away" : "";
      const team =
        e.side === "home" ? home : e.side === "away" ? away : e.team || "";
      return `<li class="${sideCls}"><span class="clk">${esc(e.clock)}</span><span>${esc(e.text)}${team ? ` · ${esc(team)}` : ""}</span></li>`;
    })
    .join("");
}

function paintPitch(attack, h, a, home, away) {
  const atk = attack || { homeShare: 50, awayShare: 50, ballX: 50, ballY: 31 };
  const ball = $("ball-dot");
  if (ball) {
    ball.setAttribute("cx", String(atk.ballX ?? 50));
    ball.setAttribute("cy", String(atk.ballY ?? 31));
  }
  const arrow = $("attack-arrow");
  if (arrow) {
    const x = Number(atk.ballX ?? 50);
    if (atk.direction === "away" || (atk.awayShare || 0) > (atk.homeShare || 0)) {
      // point left (away attacking toward home goal on left)
      arrow.setAttribute("points", `${x + 6},31 ${x - 6},26 ${x - 6},36`);
    } else {
      arrow.setAttribute("points", `${x - 6},31 ${x + 6},26 ${x + 6},36`);
    }
  }
  $("attack-fill").style.width = `${Math.max(5, Math.min(95, atk.homeShare ?? 50))}%`;
  $("attack-home-lbl").textContent = `${home.slice(0, 10)} ${atk.homeShare ?? "—"}%`;
  $("attack-away-lbl").textContent = `${away.slice(0, 10)} ${atk.awayShare ?? "—"}%`;
  $("pitch-home-label").textContent = (home || "H").slice(0, 6);
  $("pitch-away-label").textContent = (away || "A").slice(0, 6);

  // corner intensity
  const ch = h.corners || 0;
  const ca = a.corners || 0;
  $("corner-hl").classList.toggle("on", ch > 0);
  $("corner-hr").classList.toggle("on", ch > 2);
  $("corner-al").classList.toggle("on", ca > 0);
  $("corner-ar").classList.toggle("on", ca > 2);
}

function paintH2H(rows) {
  const ul = $("h2h-list");
  if (!rows?.length) {
    ul.innerHTML = `<li class="muted">—</li>`;
    return;
  }
  ul.innerHTML = rows
    .map((r) => {
      const d = r.date ? new Date(r.date).toLocaleDateString(getLang()) : "";
      return `<li><span class="clk">${esc(r.score || "—")}</span><span>${esc(d)} · ${esc(r.competition || "")} ${r.result ? "(" + esc(r.result) + ")" : ""}</span></li>`;
    })
    .join("");
}

async function loadTips() {
  if (!state.match) return;
  const leagueId = state.match.leagueId || state.leagueId;
  const matchId = state.match.matchId;
  try {
    const data = await api(
      `/api/tips/${encodeURIComponent(leagueId)}/${encodeURIComponent(matchId)}`
    );
    paintTips(data);
  } catch {
    /* ignore */
  }
}

function paintTips(data) {
  const v = data.votes || {};
  const p = data.pct || {};
  $("tips-strip").innerHTML = `
    <div class="cell"><div class="v">${p.home ?? 0}%</div><div class="k">${t("tip_home")} (${v.home || 0})</div></div>
    <div class="cell"><div class="v">${p.draw ?? 0}%</div><div class="k">${t("tip_draw")} (${v.draw || 0})</div></div>
    <div class="cell"><div class="v">${p.away ?? 0}%</div><div class="k">${t("tip_away")} (${v.away || 0})</div></div>
  `;
  document.querySelectorAll(".tip-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tip === state.tipPick);
    const label =
      b.dataset.tip === "home"
        ? t("tip_home")
        : b.dataset.tip === "draw"
          ? t("tip_draw")
          : t("tip_away");
    b.textContent = label;
  });
}

async function castTip(pick) {
  if (!state.match) return;
  state.tipPick = pick;
  const leagueId = state.match.leagueId || state.leagueId;
  const matchId = state.match.matchId;
  const data = await api(
    `/api/tips/${encodeURIComponent(leagueId)}/${encodeURIComponent(matchId)}`,
    { method: "POST", body: JSON.stringify({ pick }) }
  );
  paintTips(data);
}

function bind() {
  $("nav-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-view]");
    if (!b) return;
    setView(b.dataset.view);
    if (b.dataset.view === "board") {
      stopLivePoll();
      loadBoard();
    }
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
  $("tips-row")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tip]");
    if (b) castTip(b.dataset.tip).catch(alert);
  });
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
