/* Emergência Ginecológica — OSCE
 * Motor do jogo. Conteúdo clínico: cases/*.json (fonte única: Manual de Emergência Ginecológica).
 * Nenhum dado é enviado ou armazenado fora da memória da página.
 */
(function () {
  "use strict";

  const WEIGHTS = { essencial: 10, pertinente: 5, desnecessaria: -3, contraindicada: -10 };
  const MULT = { 1: 1, 2: 1.5, 3: 2 };
  const DX_POINTS = 20;
  const STAGES = ["triagem", "hipoteses", "anamnese", "exame", "lab", "imagem", "diagnostico", "conduta", "resultado"];
  const ITEM_STAGES = ["anamnese", "exame", "lab", "imagem", "conduta"];
  const GATED = ["anamnese", "exame", "lab", "imagem"];

  const app = document.getElementById("app");
  let lang = "pt";
  let level = 1;
  let index = null;
  let S = null; // estado do caso em andamento

  /* ---------- utilidades ---------- */
  const t = (k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), UI[lang]) ?? k;
  const tx = (o) => (o == null ? "" : typeof o === "string" ? o : o[lang] ?? o.pt ?? "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
  const vfmt = (v) => (lang === "en" ? String(v).replace(/(\d),(\d)/g, "$1.$2").replace("mrpm", "breaths/min") : v);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", lang === "pt" ? "," : ".");

  function deepMerge(base, over) {
    if (over == null) return base;
    if (Array.isArray(over) || typeof over !== "object") return over;
    const out = Array.isArray(base) ? base.slice() : { ...(base || {}) };
    for (const k of Object.keys(over)) out[k] = deepMerge(base ? base[k] : undefined, over[k]);
    return out;
  }

  /* Resolve um item para o nível atual (byLevel) e para as flags clínicas ativas (whenFlag). */
  function resolveItem(item) {
    let r = deepMerge(item, item.byLevel ? item.byLevel[String(level)] : null);
    if (r.whenFlag && S) for (const f of S.flags) if (r.whenFlag[f]) r = deepMerge(r, r.whenFlag[f]);
    return r;
  }
  const visible = (item) => !item.levels || item.levels.includes(level);
  const stageItems = (stage) => (S.data.stages[stage] || []).filter(visible).map(resolveItem);
  const levelCfg = () => deepMerge(S.data.base || {}, (S.data.levels || {})[String(level)] || {});

  /* ---------- idioma ---------- */
  function applyStatic() {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
    document.querySelectorAll(".lang-switch button").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
    document.title = t("appTitle");
  }
  document.querySelectorAll(".lang-switch button").forEach((b) =>
    b.addEventListener("click", () => { lang = b.dataset.lang; applyStatic(); S ? render() : renderHome(); })
  );

  /* ---------- tela inicial ---------- */
  async function loadIndex() {
    if (index) return index;
    const r = await fetch("cases/index.json", { cache: "no-store" });
    index = await r.json();
    return index;
  }

  async function renderHome() {
    S = null;
    stopTimer();
    app.innerHTML = `<p class="muted">${t("loading")}</p>`;
    let idx;
    try { idx = await loadIndex(); } catch (e) { app.innerHTML = `<p class="err">${t("loadError")}</p>`; return; }
    const lv = [1, 2, 3].map((n) => `
      <label class="level ${level === n ? "on" : ""}">
        <input type="radio" name="lvl" value="${n}" ${level === n ? "checked" : ""}>
        <span class="level-n">${n}</span>
        <span><strong>${t("lvl" + n)}</strong><small>${t("lvl" + n + "d")}</small></span>
      </label>`).join("");
    const cards = idx.cases.map((c) => `
      <button class="case-card ${c.available ? "" : "off"}" data-id="${c.id}" ${c.available ? "" : "disabled"}>
        <span class="case-num">${t("caseLabel")} ${String(c.number).padStart(2, "0")}</span>
        <span class="case-title">${esc(tx(c.title))}</span>
        <span class="case-meta">${t("block")} ${c.block}${c.available ? "" : " · " + t("soon")}</span>
      </button>`).join("");
    app.innerHTML = `
      <section class="panel">
        <h2>${t("chooseLevel")}</h2>
        <div class="levels">${lv}</div>
        <details class="rules"><summary>${t("rulesTitle")}</summary><p>${t("rules")}</p></details>
      </section>
      <section class="panel">
        <h2>${t("chooseCase")}</h2>
        <div class="cases">${cards}</div>
      </section>`;
    app.querySelectorAll("input[name=lvl]").forEach((i) => i.addEventListener("change", () => { level = +i.value; renderHome(); }));
    app.querySelectorAll(".case-card:not(.off)").forEach((b) => b.addEventListener("click", () => startCase(b.dataset.id)));
  }

  /* ---------- início do caso ---------- */
  async function startCase(id) {
    const meta = index.cases.find((c) => c.id === id);
    app.innerHTML = `<p class="muted">${t("loading")}</p>`;
    let data;
    try { data = await (await fetch("cases/" + meta.file, { cache: "no-store" })).json(); }
    catch (e) { app.innerHTML = `<p class="err">${t("loadError")}</p>`; return; }
    S = {
      data, meta,
      stage: "triagem",
      done: new Set(),
      selected: Object.fromEntries(ITEM_STAGES.map((s) => [s, []])),
      hyp: [], dx: null,
      chart: [],
      flags: new Set(),
      events: [],
      actions: 0,
      t0: Date.now(), tEnd: null,
      vitals: {}
    };
    S.vitals = { ...(levelCfg().vitals || {}) };
    startTimer();
    render();
  }

  /* ---------- cronômetro (Nível 3) ---------- */
  let timerId = null;
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (!S || S.stage === "resultado") return;
      checkDeterioration();
      const n = document.getElementById("clock");
      if (n) n.outerHTML = clockHtml();
    }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  const elapsed = () => Math.floor(((S.tEnd || Date.now()) - S.t0) / 1000);
  function clockHtml() {
    const cfg = levelCfg();
    if (!cfg.timerMinutes) return `<span id="clock"></span>`;
    const e = elapsed(), lim = cfg.timerMinutes * 60;
    const mm = String(Math.floor(e / 60)).padStart(2, "0"), ss = String(e % 60).padStart(2, "0");
    return `<span id="clock" class="clock ${e > lim ? "over" : e > lim * 0.75 ? "warn" : ""}" title="${e > lim ? t("timeUp") : ""}">⏱ ${mm}:${ss} / ${cfg.timerMinutes}:00</span>`;
  }

  /* ---------- evolução clínica ---------- */
  function checkDeterioration() {
    const list = levelCfg().deterioration || [];
    let changed = false;
    list.forEach((d, i) => {
      if (S.events.includes(i)) return;
      const byTime = d.afterSeconds != null && elapsed() >= d.afterSeconds;
      const byAct = d.afterActions != null && S.actions >= d.afterActions;
      if (!(byTime || byAct)) return;
      if (d.unlessSelected && d.unlessSelected.some((id) => Object.values(S.selected).flat().includes(id))) return;
      S.events.push(i);
      if (d.flag) S.flags.add(d.flag);
      if (d.vitals) Object.assign(S.vitals, d.vitals);
      S.chart.push({ kind: "alert", labelKey: "alert", text: d.message });
      changed = true;
    });
    if (changed && S.stage !== "resultado") render();
  }

  /* ---------- renderização ---------- */
  function render() {
    if (!S) return renderHome();
    if (S.stage === "resultado") return renderResult();
    const cfg = levelCfg();
    const idxStage = STAGES.indexOf(S.stage);
    const steps = STAGES.slice(0, -1).map((s, i) => {
      const unlocked = canEnter(s);
      const cls = s === S.stage ? "cur" : S.done.has(s) ? "ok" : unlocked ? "" : "lock";
      return `<button class="step ${cls}" data-s="${s}" ${unlocked && !dxLocked(s) ? "" : "disabled"} title="${unlocked ? "" : t("locked")}"><span>${i + 1}</span>${t("stages." + s)}</button>`;
    }).join("");
    const vit = Object.entries(S.vitals).map(([k, v]) => `<span><b>${t("vitalsNames." + k)}</b> ${esc(vfmt(v))}</span>`).join("");

    app.innerHTML = `
      <div class="case-head">
        <div>
          <div class="case-num">${t("caseLabel")} ${String(S.meta.number).padStart(2, "0")} · ${t("lvl" + level)}</div>
          <h2>${esc(tx(S.data.title))}</h2>
        </div>
        <div class="head-right">${clockHtml()}<button class="ghost" id="exit">${t("exit")}</button></div>
      </div>
      <div class="vitals-bar ${S.flags.size ? "alert" : ""}"><strong>${t("vitals")}</strong>${vit}</div>
      <nav class="stepper">${steps}</nav>
      <div class="layout">
        <section class="panel stage" id="stage"></section>
        <aside class="panel chart"><h3>${t("chart")}</h3><div id="chart"></div></aside>
      </div>`;
    document.getElementById("exit").onclick = () => { if (confirm(t("exitConfirm"))) renderHome(); };
    app.querySelectorAll(".step:not([disabled])").forEach((b) => (b.onclick = () => { S.stage = b.dataset.s; render(); }));
    renderChart();
    const st = document.getElementById("stage");
    if (S.stage === "triagem") renderTriage(st, cfg);
    else if (S.stage === "hipoteses") renderHyp(st);
    else if (S.stage === "diagnostico") renderDx(st);
    else renderItems(st, S.stage);
    void idxStage;
  }

  function canEnter(s) {
    const i = STAGES.indexOf(s);
    if (i === 0) return true;
    for (let j = 0; j < i; j++) if (!S.done.has(STAGES[j])) return false;
    return true;
  }
  // Após confirmar o diagnóstico, as etapas de coleta ficam bloqueadas.
  const dxLocked = (s) => S.done.has("diagnostico") && (GATED.includes(s) || s === "hipoteses" || s === "triagem" || s === "diagnostico");

  function renderChart() {
    const c = document.getElementById("chart");
    if (!S.chart.length) { c.innerHTML = `<p class="muted">${t("chartEmpty")}</p>`; return; }
    const dxl = (id) => tx((S.data.diagnoses.find((d) => d.id === id) || {}).label);
    c.innerHTML = S.chart.map((e) => `
      <div class="entry ${e.kind}">
        <div class="entry-q">${esc(e.labelKey ? t(e.labelKey) : tx(e.label))}</div>
        <div class="entry-a">${esc(e.dxIds ? e.dxIds.map(dxl).join(" · ") : tx(e.text))}</div>
      </div>`).join("");
    c.scrollTop = c.scrollHeight;
  }

  function nextStage() {
    S.done.add(S.stage);
    S.stage = STAGES[STAGES.indexOf(S.stage) + 1];
    render();
  }

  function renderTriage(st, cfg) {
    st.innerHTML = `
      <h3>${t("stages.triagem")}</h3>
      <div class="triage">${tx(cfg.triage).split("\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      <div class="actions"><button class="primary" id="go">${t("next")}</button></div>`;
    st.querySelector("#go").onclick = nextStage;
  }

  function dxOptions() { return S.data.diagnoses.filter(visible); }

  function renderHyp(st) {
    const opts = dxOptions().map((d) => `
      <label class="opt ${S.hyp.includes(d.id) ? "on" : ""}"><input type="checkbox" value="${d.id}" ${S.hyp.includes(d.id) ? "checked" : ""}> ${esc(tx(d.label))}</label>`).join("");
    st.innerHTML = `
      <h3>${t("stages.hipoteses")}</h3>
      <p class="muted">${t("hypIntro")}</p>
      <div class="opts">${opts}</div>
      <p class="hint" id="hint"></p>
      <div class="actions"><button class="primary" id="go">${t("conclude")}</button></div>`;
    st.querySelectorAll("input").forEach((i) => (i.onchange = () => {
      if (i.checked && S.hyp.length >= 3) { i.checked = false; return; }
      S.hyp = i.checked ? [...S.hyp, i.value] : S.hyp.filter((x) => x !== i.value);
      i.parentElement.classList.toggle("on", i.checked);
    }));
    st.querySelector("#go").onclick = () => {
      if (S.hyp.length !== 3) { st.querySelector("#hint").textContent = t("hypPick"); return; }
      S.chart.push({ kind: "hyp", labelKey: "initialHyp", dxIds: S.hyp.slice() });
      nextStage();
    };
  }

  function renderItems(st, stage) {
    const items = stageItems(stage);
    const sel = S.selected[stage];
    const grouped = stage === "conduta";
    const card = (it) => {
      const on = sel.includes(it.id);
      const res = on && stage !== "conduta" ? `<div class="res">${esc(tx(it.result))}</div>` : "";
      return `<button class="item ${on ? "on" : ""}" data-id="${it.id}" ${on && stage !== "conduta" ? "disabled" : ""}>
          <span class="item-l">${esc(tx(it.label))}</span>${on && stage !== "conduta" ? `<span class="tag">${t("requested")}</span>` : ""}${res}</button>`;
    };
    let body;
    if (grouped) {
      const groups = ["medicamento", "procedimento", "orientacao", "destino"];
      body = groups.map((g) => {
        const gi = items.filter((i) => (i.group || "medicamento") === g);
        return gi.length ? `<h4>${t("groups." + g)}</h4><div class="items">${gi.map(card).join("")}</div>` : "";
      }).join("");
    } else body = `<div class="items">${items.map(card).join("")}</div>`;
    st.innerHTML = `
      <h3>${t("stages." + stage)}</h3>
      <p class="muted">${t("stageIntro." + stage)}</p>
      ${body}
      <p class="hint" id="hint"></p>
      <div class="actions"><button class="primary" id="go">${stage === "conduta" ? t("finish") : t("conclude")}</button></div>`;

    st.querySelectorAll(".item:not([disabled])").forEach((b) => (b.onclick = () => {
      const id = b.dataset.id;
      const it = items.find((i) => i.id === id);
      if (stage === "conduta") {
        // prescrição: alternável até finalizar
        if (sel.includes(id)) S.selected[stage] = sel.filter((x) => x !== id);
        else S.selected[stage].push(id);
        b.classList.toggle("on");
        renderItemsKeepScroll(st, stage);
        return;
      }
      S.selected[stage].push(id);
      S.actions++;
      S.chart.push({ kind: stage, label: it.label, text: it.result });
      checkDeterioration();
      if (S.stage === stage) renderItemsKeepScroll(st, stage);
    }));
    st.querySelector("#go").onclick = () => {
      if (!S.selected[stage].length) { st.querySelector("#hint").textContent = t("needOne"); return; }
      if (stage === "conduta") return finishCase();
      nextStage();
    };
  }
  function renderItemsKeepScroll(st, stage) {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function renderDx(st) {
    const opts = dxOptions().map((d) => `
      <label class="opt ${S.dx === d.id ? "on" : ""}"><input type="radio" name="dx" value="${d.id}" ${S.dx === d.id ? "checked" : ""}> ${esc(tx(d.label))}</label>`).join("");
    st.innerHTML = `
      <h3>${t("stages.diagnostico")}</h3>
      <p class="muted">${t("stageIntro.diagnostico")}</p>
      <div class="opts">${opts}</div>
      <p class="hint" id="hint"></p>
      <div class="actions"><button class="primary" id="go">${t("confirmDx")}</button></div>`;
    st.querySelectorAll("input").forEach((i) => (i.onchange = () => {
      S.dx = i.value;
      st.querySelectorAll(".opt").forEach((o) => o.classList.toggle("on", o.querySelector("input").checked));
    }));
    st.querySelector("#go").onclick = () => {
      if (!S.dx) { st.querySelector("#hint").textContent = t("needOne"); return; }
      S.chart.push({ kind: "dx", labelKey: "yourDx", dxIds: [S.dx] });
      nextStage();
    };
  }

  /* ---------- pontuação ---------- */
  function score() {
    const m = MULT[level];
    const cfg = levelCfg();
    const rows = {};
    let max = 0, earned = 0, graveItems = [];
    for (const stage of ITEM_STAGES) {
      const items = stageItems(stage);
      const sel = S.selected[stage];
      let pos = 0, neg = 0, stMax = 0;
      const chosen = [], missed = [];
      for (const it of items) {
        const w = WEIGHTS[it.class];
        if (w > 0) stMax += w;
        if (sel.includes(it.id)) {
          const pts = w > 0 ? w : w * m;
          if (w > 0) pos += w; else neg += pts;
          if (it.grave) graveItems.push(it);
          chosen.push({ it, pts });
        } else if (it.class === "essencial") missed.push(it);
      }
      rows[stage] = { pos, neg, stMax, chosen, missed };
      max += stMax;
    }
    if (graveItems.length) rows.conduta.pos = 0;
    for (const s of ITEM_STAGES) earned += rows[s].pos + rows[s].neg;

    const correct = cfg.correctDiagnosis;
    const dxOk = S.dx === correct;
    max += DX_POINTS;
    if (dxOk) earned += DX_POINTS;

    let timePen = 0;
    if (cfg.timerMinutes) {
      const over = Math.max(0, Math.ceil((elapsed() - cfg.timerMinutes * 60) / 60));
      timePen = Math.min(20, over * 2);
      earned -= timePen;
    }
    const final = Math.max(0, Math.min(100, Math.round((100 * earned) / max)));
    return { rows, max, earned, final, dxOk, correct, graveItems, timePen, mult: m };
  }

  function finishCase() {
    S.done.add("conduta");
    S.tEnd = Date.now();
    S.stage = "resultado";
    render();
    window.scrollTo(0, 0);
  }

  function badge(c) { return `<span class="badge ${c}">${t("classes." + c)}</span>`; }

  function renderResult() {
    stopTimer();
    const R = score();
    const cfg = levelCfg();
    const dxLabel = (id) => tx((S.data.diagnoses.find((d) => d.id === id) || {}).label);
    const hypHit = S.hyp.includes(R.correct);
    const stageRows = ITEM_STAGES.map((s) => {
      const r = R.rows[s];
      return `<tr><td>${t("stages." + s)}</td><td>+${fmt(r.pos)}</td><td>${fmt(r.neg)}</td><td>${fmt(r.stMax)}</td></tr>`;
    }).join("") + `<tr><td>${t("stages.diagnostico")}</td><td>+${R.dxOk ? DX_POINTS : 0}</td><td>0</td><td>${DX_POINTS}</td></tr>` +
      (R.timePen ? `<tr><td>${t("timePenalty")}</td><td></td><td>−${R.timePen}</td><td></td></tr>` : "");

    const detail = ITEM_STAGES.map((s) => {
      const r = R.rows[s];
      const ch = r.chosen.map(({ it, pts }) => `
        <li class="fb ${it.class}">
          <div class="fb-h">${badge(it.class)} <strong>${esc(tx(it.label))}</strong> <span class="pts">${pts > 0 ? "+" : ""}${fmt(pts)} ${t("points")}</span>${it.grave ? ` <span class="badge grave">${t("grave")}</span>` : ""}</div>
          <div class="fb-w">${esc(tx(it.why))}${it.ref ? ` <span class="ref">[${esc(it.ref)}]</span>` : ""}</div>
        </li>`).join("");
      const ms = r.missed.map((it) => `
        <li class="fb missed">
          <div class="fb-h">${badge("essencial")} <strong>${esc(tx(it.label))}</strong></div>
          <div class="fb-w">${esc(tx(it.why))}${it.ref ? ` <span class="ref">[${esc(it.ref)}]</span>` : ""}</div>
        </li>`).join("");
      return `<h4>${t("stages." + s)}</h4>
        ${ch ? `<ul class="fbl">${ch}</ul>` : ""}
        ${ms ? `<p class="miss-t">${t("missed")}</p><ul class="fbl">${ms}</ul>` : ""}`;
    }).join("");

    const grave = R.graveItems.length ? `
      <div class="grave-box"><strong>${t("grave")}:</strong> ${t("graveText")}
        ${R.graveItems.map((it) => `<p>${esc(tx(it.label))} — ${esc(tx(it.outcome || it.why))}</p>`).join("")}</div>` : "";

    const dxBox = `
      <div class="dx-box ${R.dxOk ? "ok" : "bad"}">
        <strong>${R.dxOk ? t("dxCorrect") : t("dxWrong")}</strong>
        <p>${t("yourDx")}: ${esc(dxLabel(S.dx))}</p>
        <p>${t("correctDx")}: ${esc(dxLabel(R.correct))}</p>
        <p>${t("initialHyp")}: ${esc(S.hyp.map(dxLabel).join(" · "))} — ${hypHit ? t("hypHit") : t("hypMiss")}</p>
        <p class="dx-exp">${esc(tx(cfg.diagnosisExplanation))}</p>
      </div>`;

    app.innerHTML = `
      <div class="case-head">
        <div>
          <div class="case-num">${t("caseLabel")} ${String(S.meta.number).padStart(2, "0")} · ${t("lvl" + level)}</div>
          <h2>${esc(tx(S.data.title))}</h2>
          <div class="muted">${t("reference")}: ${esc(tx(S.data.chapter))}, ${esc(S.data.pages)}</div>
        </div>
      </div>
      <section class="panel result">
        <div class="score-big"><span>${R.final}</span><small>/100</small></div>
        <p class="muted">${t("multiplier")}: ${fmt(R.mult)}×</p>
        ${grave}
        ${dxBox}
        <h3>${t("breakdown")}</h3>
        <table class="tbl"><thead><tr><th></th><th>+</th><th>−</th><th>${t("maxCol")}</th></tr></thead><tbody>${stageRows}</tbody></table>
        <h3>${t("yourChoices")}</h3>
        ${detail}
        <h3>${t("learning")}</h3>
        <div class="learning">${tx(cfg.learning).split("\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        <div class="actions no-print">
          <button class="primary" id="retry">${t("retry")}</button>
          <button id="home">${t("other")}</button>
          <button id="print">${t("print")}</button>
        </div>
      </section>`;
    document.getElementById("retry").onclick = () => startCase(S.meta.id);
    document.getElementById("home").onclick = renderHome;
    document.getElementById("print").onclick = () => window.print();
  }

  applyStatic();
  renderHome();
})();
