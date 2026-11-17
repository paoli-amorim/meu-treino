'use strict';
/* Meu Treino — PWA offline. Dados ficam no próprio aparelho (localStorage). */

const KEY = 'meu-treino-v1';
const SKEY = 'meu-treino-sessao';
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const BACK = ['Sem dor', 'Leve', 'Moderada', 'Forte'];

const ICON = {
  home: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  dumbbell: '<svg class="ico" viewBox="0 0 24 24"><path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/></svg>',
  chart: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 4v16h16M8 15l4-5 3 3 5-6"/></svg>',
  more: '<svg class="ico" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  play: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>',
  back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- utilidades ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const pad2 = n => String(n).padStart(2, '0');
function iso(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
function mondayOf(s) { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
function fmtShort(s) { const d = parseISO(s); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`; }
function fmtLong(s) { return parseISO(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }); }
function mmss(sec) { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`; }
function num(v) { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
function fmtNum(n, d = 1) { return n == null ? '–' : Number(n.toFixed(d)).toLocaleString('pt-BR'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

/* ---------- estado ---------- */
function defaultData() {
  return {
    version: 1,
    // Dados pessoais começam vazios: são preenchidos no aparelho (aba Mais) e nunca ficam no código.
    profile: { name: '', height: null, startWeight: null, goal: null, startDate: mondayOf(iso()) },
    workouts: defaultWorkouts(),
    logs: [], weights: [], waist: []
  };
}
function migrate(d) {
  const def = defaultData();
  d.profile = Object.assign(def.profile, d.profile || {});
  if (!Array.isArray(d.workouts)) d.workouts = def.workouts;
  ['logs', 'weights', 'waist'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  return d;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* dados ilegíveis */ }
  return defaultData();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Não foi possível salvar no aparelho'); } }
function loadSession() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
function saveSession() { try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch (e) { /* ignora */ } }

let S = load();
let session = loadSession();
const ui = { tab: 'hoje', wk: null, editing: false, chartEx: null, histOpen: null };
let tickTimer = null, wakeLock = null, audioCtx = null, installEvt = null;

const getWorkout = id => S.workouts.find(w => w.id === id);
const profileReady = () => !!(S.profile.height && S.profile.startWeight && S.profile.goal);
const logsOn = date => S.logs.filter(l => l.date === date);

/* ---------- agenda ---------- */
function weekNumber(date) {
  return Math.floor((parseISO(mondayOf(date)) - parseISO(mondayOf(S.profile.startDate))) / (7 * 864e5)) + 1;
}
function planFor(date) {
  const wd = parseISO(date).getDay();
  const seq = weekNumber(date) % 2 === 0 ? ['B', 'A', 'B'] : ['A', 'B', 'A'];
  const map = { 1: 0, 3: 1, 5: 2 };
  if (wd in map) return { morning: 'cardio', evening: seq[map[wd]] };
  if (wd === 6) return { morning: 'walk', evening: null };
  return { morning: null, evening: null };
}
function weekStep(w) {
  if (w < 1) return 'O plano começa na próxima semana.';
  if (w > PROGRESSION.length) return 'As 8 semanas do plano foram concluídas. Hora de reavaliar com seu treinador.';
  return PROGRESSION[w - 1];
}
function workoutSummary(w) {
  if (w.type === 'cardio') return `${w.phases.reduce((a, p) => a + (+p.min || 0), 0)} min · leve a moderado`;
  const secs = w.exercises.reduce((a, e) => a + e.sets * (45 + (+e.rest || 0)), 0) + 300;
  return `${w.exercises.length} exercícios · ~${Math.round(secs / 60)} min`;
}
function targetText(e) { return `${e.sets} × ${e.reps}${e.perSide ? ' cada lado' : ''}`; }
function videoUrl(e) {
  return e.video && /^https?:\/\//i.test(e.video) ? e.video
    : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${e.name} como fazer execução correta`);
}
function lastWeight(name) {
  for (let i = S.logs.length - 1; i >= 0; i--) {
    const ex = (S.logs[i].exercises || []).find(x => x.name === name);
    if (ex) { const s = ex.sets.filter(x => x.w != null); if (s.length) return String(s[s.length - 1].w); }
  }
  return '';
}

/* ---------- render ---------- */
const $app = document.getElementById('app');
function render() {
  if (session) { $app.innerHTML = renderSession(); startTick(); return; }
  stopTick();
  let body;
  if (ui.tab === 'hoje') body = renderHoje();
  else if (ui.tab === 'treinos') body = ui.wk && getWorkout(ui.wk) ? renderWorkout() : renderTreinos();
  else if (ui.tab === 'evolucao') body = renderEvolucao();
  else body = renderMais();
  $app.innerHTML = `<main class="page">${body}</main>${renderNav()}`;
}
function renderNav() {
  const tabs = [['hoje', 'Hoje', ICON.home], ['treinos', 'Treinos', ICON.dumbbell], ['evolucao', 'Evolução', ICON.chart], ['mais', 'Mais', ICON.more]];
  return `<nav class="nav">${tabs.map(([id, l, ic]) => `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}">${ic}<span>${l}</span></button>`).join('')}</nav>`;
}

/* ----- Hoje ----- */
function renderHoje() {
  const t = iso(), d = parseISO(t), w = weekNumber(t), p = planFor(t);
  let h = `<header class="hero"><div class="eyebrow">${DAY_NAMES[d.getDay()]}, ${fmtLong(t)}</div>
    <h1>${S.profile.name ? `Olá, ${esc(S.profile.name)}!` : 'Olá!'}</h1>
    <span class="week-pill">Semana ${Math.max(w, 1)}</span>
    <p class="muted">${esc(weekStep(w))}</p></header>`;
  if (!profileReady()) {
    h += `<div class="card accent" style="margin-top:16px"><h3>Complete seu perfil</h3>
      <p class="muted small">Nome, altura, peso inicial e meta ficam salvos só neste celular.</p>
      <button class="btn primary block" style="margin-top:10px" data-act="tab" data-v="mais">Preencher agora</button></div>`;
  }

  // costas no dia seguinte
  const y = addDays(t, -1);
  const pend = S.logs.find(l => l.date === y && l.type === 'strength' && !l.backNext);
  if (pend) {
    h += `<div class="card accent" style="margin-top:16px"><h3>Como ficaram suas costas hoje?</h3>
      <p class="muted small">Depois do ${esc(pend.name)} de ontem.</p>
      <div class="choices">${BACK.map(b => `<button class="choice" data-act="backNext" data-id="${pend.id}" data-v="${b}">${b}</button>`).join('')}</div></div>`;
  }

  h += `<div class="section-title">Plano de hoje</div>`;
  if (p.morning === 'cardio') h += planCard('Manhã', 'cardio', t);
  if (p.morning === 'walk') {
    const done = logsOn(t).some(l => l.type === 'walk');
    h += `<div class="card ${done ? 'done' : ''}"><div class="row between"><span class="tag">Manhã</span>${done ? '<span class="ok">✓ Feito</span>' : ''}</div>
      <h2 style="margin-top:6px">Caminhada leve</h2><p class="muted">Opcional. O resto do dia está livre.</p>
      <button class="btn big ghost" data-act="logWalk">Registrar caminhada</button></div>`;
  }
  if (p.evening) h += planCard('Tarde ou noite', p.evening, t);
  if (!p.morning && !p.evening) {
    h += `<div class="card"><h2>Dia de descanso</h2><p class="muted">A recuperação faz parte do treino. Não compense treino perdido dobrando o seguinte.</p></div>`;
  }
  if (p.morning === 'cardio' && p.evening) h += `<p class="muted small" style="margin:10px 4px">Deixe várias horas entre o cardio e a musculação.</p>`;

  // pesagem
  const wkStart = mondayOf(t);
  const weighIns = S.weights.filter(x => x.date >= wkStart && x.date <= addDays(wkStart, 6)).length;
  const today = S.weights.find(x => x.date === t);
  h += `<div class="section-title">Pesagem da manhã</div><div class="card">
    ${today ? `<div class="row between"><div><div class="eyebrow">Hoje</div><div style="font-size:26px;font-weight:800">${fmtNum(today.kg)} kg</div></div><span class="ok">✓ Anotado</span></div>`
      : `<div class="row"><input id="qWeight" type="text" inputmode="decimal" placeholder="Peso em kg" class="grow" style="margin-top:0"><button class="btn primary" data-act="addWeight" data-src="qWeight">Salvar</button></div>`}
    <p class="muted small">${weighIns}/3 pesagens nesta semana · em jejum, depois de ir ao banheiro, mesma balança.</p></div>`;

  // semana
  h += `<div class="section-title">Esta semana</div><div class="week">`;
  for (let i = 0; i < 7; i++) {
    const ds = addDays(wkStart, i), pl = planFor(ds), logs = logsOn(ds);
    const trainDone = pl.evening && logs.some(l => l.workoutId === pl.evening);
    const cardioDone = logs.some(l => l.type === 'cardio');
    const label = pl.evening ? esc(pl.evening) : (pl.morning === 'walk' ? '🚶' : '·');
    h += `<div class="day ${pl.evening ? 'train' : ''} ${trainDone ? 'done' : ''} ${ds === t ? 'today' : ''}">
      <div class="dn">${DAY_SHORT[parseISO(ds).getDay()]}</div><div class="db">${label}</div>
      <div class="dots">${pl.morning === 'cardio' ? `<i class="${cardioDone ? 'on' : ''}" title="Cardio"></i>` : ''}</div></div>`;
  }
  h += `</div><p class="muted small" style="margin:8px 4px">Letra = treino de musculação · bolinha = cardio da manhã.</p>`;

  // outros
  h += `<div class="section-title">Fazer outro treino</div><div class="row wrap">${S.workouts.map(w => `<button class="btn sm ghost" data-act="start" data-id="${w.id}">${esc(w.name)}</button>`).join('')}</div>`;
  return h;
}
function planCard(label, wid, date) {
  const w = getWorkout(wid);
  if (!w) return '';
  const done = logsOn(date).some(l => l.workoutId === wid);
  return `<div class="card ${done ? 'done' : ''}"><div class="row between"><span class="tag">${label}</span>${done ? '<span class="ok">✓ Feito</span>' : ''}</div>
    <h2 style="margin-top:6px">${esc(w.name)}</h2><p class="muted">${workoutSummary(w)}</p>
    <div class="row" style="margin-top:14px"><button class="btn ${done ? 'ghost' : 'primary'} grow" style="min-height:54px;font-size:17px" data-act="start" data-id="${wid}">${done ? 'Fazer de novo' : 'Começar'}</button>
    <button class="btn ghost" style="min-height:54px" data-act="openWk" data-id="${wid}">Ver</button></div></div>`;
}

/* ----- Treinos ----- */
function renderTreinos() {
  let h = `<header class="hero"><h1>Treinos</h1><p class="muted">Toque em um treino para ver os exercícios, os vídeos e editar.</p></header><div style="margin-top:16px">`;
  h += S.workouts.map(w => `<div class="card"><div class="row between"><h2>${esc(w.name)}</h2><span class="chip">${w.type === 'cardio' ? 'Cardio' : 'Musculação'}</span></div>
    <p class="muted">${workoutSummary(w)}</p>
    <div class="row" style="margin-top:12px"><button class="btn primary grow" data-act="start" data-id="${w.id}">${ICON.play} Iniciar</button><button class="btn ghost grow" data-act="openWk" data-id="${w.id}">Exercícios</button></div></div>`).join('');
  h += `</div><div class="row" style="margin-top:14px"><button class="btn ghost grow" data-act="newWk" data-v="strength">+ Novo treino</button><button class="btn ghost grow" data-act="newWk" data-v="cardio">+ Novo cardio</button></div>`;
  return h;
}
function renderWorkout() {
  const w = getWorkout(ui.wk);
  let h = `<div class="row" style="margin-bottom:12px"><button class="icon-btn" data-act="closeWk" aria-label="Voltar">${ICON.back}</button><div class="grow"></div>
    <button class="btn sm ${ui.editing ? 'primary' : 'ghost'}" data-act="toggleEdit">${ui.editing ? 'Concluir edição' : 'Editar'}</button></div>`;
  if (ui.editing) return h + (w.type === 'cardio' ? editCardio(w) : editStrength(w));

  h += `<h1>${esc(w.name)}</h1><p class="muted">${workoutSummary(w)}</p>`;
  h += `<button class="btn big primary" data-act="start" data-id="${w.id}">${ICON.play} Iniciar treino</button>`;
  if (w.type === 'cardio') {
    h += `<div class="section-title">Etapas</div><div class="card phase-list">${w.phases.map((p, i) => `<div class="ph"><div class="ex-num">${i + 1}</div><div class="grow"><b>${esc(p.name)}</b> · ${p.min} min<div class="muted small">${esc(p.desc)}</div></div></div>`).join('')}</div>`;
    if (w.notes) h += `<div class="hint">${esc(w.notes)}</div>`;
    return h;
  }
  if (w.warmup) h += `<div class="hint"><b>Aquecimento:</b> ${esc(w.warmup)}</div>`;
  h += `<div class="section-title">Exercícios</div>`;
  h += w.exercises.map((e, i) => `<div class="ex-item"><div class="row"><div class="ex-num">${i + 1}</div><h3 class="grow">${esc(e.name)}</h3></div>
    <div class="chips"><span class="chip accent">${targetText(e)}</span><span class="chip">Descanso ${e.rest} s</span></div>
    ${e.notes ? `<p class="ex-notes">${esc(e.notes)}</p>` : ''}
    <div class="row" style="margin-top:12px"><a class="btn sm primary" href="${esc(videoUrl(e))}" target="_blank" rel="noopener">${ICON.play} ${e.video ? 'Ver vídeo' : 'Buscar vídeo'}</a>
    <button class="btn sm ghost" data-act="setVideo" data-wk="${w.id}" data-i="${i}">${e.video ? 'Trocar vídeo' : 'Definir vídeo'}</button></div></div>`).join('');
  if (w.tip) h += `<div class="hint" style="margin-top:14px">${esc(w.tip)}</div>`;
  return h;
}
function editStrength(w) {
  let h = `<div class="card"><label class="field">Nome do treino<input type="text" data-bind="wk" data-f="name" value="${esc(w.name)}"></label>
    <label class="field">Aquecimento<textarea data-bind="wk" data-f="warmup">${esc(w.warmup || '')}</textarea></label>
    <label class="field">Dica para as séries<textarea data-bind="wk" data-f="tip">${esc(w.tip || '')}</textarea></label></div>
    <div class="section-title">Exercícios</div>`;
  h += w.exercises.map((e, i) => `<div class="ex-item"><div class="row"><div class="ex-num">${i + 1}</div><div class="grow"></div>
      <button class="icon-btn" data-act="moveEx" data-i="${i}" data-v="-1" aria-label="Subir">↑</button>
      <button class="icon-btn" data-act="moveEx" data-i="${i}" data-v="1" aria-label="Descer">↓</button>
      <button class="icon-btn" data-act="delEx" data-i="${i}" aria-label="Remover" style="color:var(--bad)">${ICON.close}</button></div>
    <label class="field" style="margin-top:10px">Nome<input type="text" data-bind="ex" data-i="${i}" data-f="name" value="${esc(e.name)}"></label>
    <div class="grid3" style="margin-top:12px">
      <label class="field">Séries<input type="number" min="1" inputmode="numeric" data-bind="ex" data-i="${i}" data-f="sets" value="${e.sets}"></label>
      <label class="field">Repetições<input type="text" data-bind="ex" data-i="${i}" data-f="reps" value="${esc(e.reps)}"></label>
      <label class="field">Descanso (s)<input type="number" min="0" step="15" inputmode="numeric" data-bind="ex" data-i="${i}" data-f="rest" value="${e.rest}"></label></div>
    <label class="check-row"><input type="checkbox" data-bind="ex" data-i="${i}" data-f="perSide" ${e.perSide ? 'checked' : ''}> Repetições de cada lado</label>
    <label class="field" style="margin-top:12px">Como executar<textarea data-bind="ex" data-i="${i}" data-f="notes">${esc(e.notes)}</textarea></label>
    <label class="field">Link do vídeo (opcional)<input type="url" placeholder="https://youtube.com/..." data-bind="ex" data-i="${i}" data-f="video" value="${esc(e.video)}"></label>
  </div>`).join('');
  h += `<button class="btn big ghost" data-act="addEx">+ Adicionar exercício</button>
    <button class="btn big danger" data-act="delWk">Excluir este treino</button>`;
  return h;
}
function editCardio(w) {
  let h = `<div class="card"><label class="field">Nome<input type="text" data-bind="wk" data-f="name" value="${esc(w.name)}"></label>
    <label class="field">Aparelhos (separados por vírgula)<input type="text" data-bind="wk" data-f="options" value="${esc((w.options || []).join(', '))}"></label>
    <label class="field">Observações<textarea data-bind="wk" data-f="notes">${esc(w.notes || '')}</textarea></label></div>
    <div class="section-title">Etapas</div>`;
  h += w.phases.map((p, i) => `<div class="ex-item"><div class="row"><div class="ex-num">${i + 1}</div><div class="grow"></div>
      <button class="icon-btn" data-act="delPh" data-i="${i}" aria-label="Remover" style="color:var(--bad)">${ICON.close}</button></div>
    <div class="grid2" style="margin-top:10px"><label class="field">Nome<input type="text" data-bind="ph" data-i="${i}" data-f="name" value="${esc(p.name)}"></label>
    <label class="field">Minutos<input type="number" min="1" inputmode="numeric" data-bind="ph" data-i="${i}" data-f="min" value="${p.min}"></label></div>
    <label class="field" style="margin-top:12px">Como fazer<input type="text" data-bind="ph" data-i="${i}" data-f="desc" value="${esc(p.desc)}"></label></div>`).join('');
  h += `<button class="btn big ghost" data-act="addPh">+ Adicionar etapa</button>
    <button class="btn big danger" data-act="delWk">Excluir este treino</button>`;
  return h;
}

/* ----- Evolução ----- */
function weeklyAverages() {
  const g = {};
  S.weights.forEach(x => { const m = mondayOf(x.date); (g[m] = g[m] || []).push(x.kg); });
  return Object.keys(g).sort().map(m => ({ week: m, kg: avg(g[m]), n: g[m].length }));
}
function renderEvolucao() {
  const t = iso(), wk = mondayOf(t), wkEnd = addDays(wk, 6);
  const wa = weeklyAverages();
  const cur = wa.length ? wa[wa.length - 1] : null;
  const ref = cur ? cur.kg : S.profile.startWeight;
  const diff = ref - S.profile.startWeight;
  const thisWeek = S.logs.filter(l => l.date >= wk && l.date <= wkEnd);
  const strength = thisWeek.filter(l => l.type === 'strength').length;
  const cardio = thisWeek.filter(l => l.type === 'cardio').length;
  const imc = ref / (S.profile.height * S.profile.height);

  let h = `<header class="hero"><h1>Evolução</h1><p class="muted">Compare a média semanal, não uma pesagem isolada.</p></header>`;
  if (!profileReady()) {
    h += `<div class="card accent" style="margin-top:16px"><h3>Complete seu perfil</h3><p class="muted small">Com altura, peso inicial e meta, esta tela mostra seu progresso e o IMC.</p>
      <button class="btn primary block" style="margin-top:10px" data-act="tab" data-v="mais">Preencher agora</button></div>`;
  } else h += `
  <div class="stats" style="margin-top:16px">
    <div class="stat"><div class="eyebrow">Média semanal</div><div class="v">${cur ? fmtNum(cur.kg) : fmtNum(S.profile.startWeight)} <small>kg</small></div><div class="s">${cur ? `${diff <= 0 ? '' : '+'}${fmtNum(diff)} kg desde o início` : 'Peso inicial'}</div></div>
    <div class="stat"><div class="eyebrow">Meta</div><div class="v">${fmtNum(S.profile.goal)} <small>kg</small></div><div class="s">${ref > S.profile.goal ? `faltam ${fmtNum(ref - S.profile.goal)} kg` : 'meta atingida 🎉'}</div></div>
    <div class="stat"><div class="eyebrow">Musculação</div><div class="v">${strength}<small>/3</small></div><div class="s">nesta semana</div></div>
    <div class="stat"><div class="eyebrow">Cardio</div><div class="v">${cardio}<small>/3</small></div><div class="s">IMC atual ${fmtNum(imc)}</div></div>
  </div>`;

  // peso
  const recent = S.weights.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  h += `<div class="section-title">Peso</div><div class="card">
    <div class="row"><input id="wDate" type="date" value="${t}" max="${t}" style="margin-top:0;flex:0 1 140px;min-width:0"><input id="wKg" type="text" inputmode="decimal" placeholder="Peso (kg)" class="grow" style="margin-top:0;min-width:80px"><button class="btn primary" data-act="addWeight" data-src="wKg" data-date="wDate">Salvar</button></div>
    ${chart([{ cls: 'raw', pts: S.weights.map(x => ({ x: +parseISO(x.date), y: x.kg })) }, { cls: 'line', pts: wa.map(x => ({ x: +parseISO(x.week) + 3 * 864e5, y: x.kg })) }], { goal: S.profile.goal || null })}
    <div class="legend"><span style="--c:var(--accent)">Média semanal</span><span style="--c:var(--muted)">Pesagens</span><span style="--c:var(--ok)">Meta</span></div>
    ${recent.length ? `<ul class="list" style="margin-top:8px">${recent.map(x => `<li><span class="grow">${fmtShort(x.date)}</span><b>${fmtNum(x.kg)} kg</b><button class="x" data-act="delWeight" data-id="${x.id}" aria-label="Apagar">✕</button></li>`).join('')}</ul>` : ''}
  </div>`;

  // cintura
  const ws = S.waist.slice().sort((a, b) => a.date.localeCompare(b.date));
  const lastW = ws[ws.length - 1];
  const nextDue = lastW ? addDays(lastW.date, 14) : t;
  h += `<div class="section-title">Cintura</div><div class="card">
    <div class="row"><input id="cDate" type="date" value="${t}" max="${t}" style="margin-top:0;flex:0 1 140px;min-width:0"><input id="cCm" type="text" inputmode="decimal" placeholder="Cintura (cm)" class="grow" style="margin-top:0;min-width:80px"><button class="btn primary" data-act="addWaist">Salvar</button></div>
    <p class="muted small">${lastW ? `Última: ${fmtNum(lastW.cm)} cm em ${fmtShort(lastW.date)}${ws.length > 1 ? ` (${lastW.cm - ws[0].cm <= 0 ? '' : '+'}${fmtNum(lastW.cm - ws[0].cm)} cm desde a primeira)` : ''}. Próxima medida: ${nextDue <= t ? 'hoje' : fmtShort(nextDue)}.` : 'Meça a cintura a cada duas semanas, sempre no mesmo ponto.'}</p>
    ${ws.length > 1 ? chart([{ cls: 'line', pts: ws.map(x => ({ x: +parseISO(x.date), y: x.cm })) }]) : ''}
    ${ws.length ? `<ul class="list">${ws.slice().reverse().slice(0, 5).map(x => `<li><span class="grow">${fmtShort(x.date)}</span><b>${fmtNum(x.cm)} cm</b><button class="x" data-act="delWaist" data-id="${x.id}" aria-label="Apagar">✕</button></li>`).join('')}</ul>` : ''}
  </div>`;

  // cargas
  const names = [...new Set(S.workouts.filter(w => w.type === 'strength').flatMap(w => w.exercises.map(e => e.name)))];
  if (!ui.chartEx || !names.includes(ui.chartEx)) ui.chartEx = names[0];
  const pts = [];
  S.logs.forEach(l => (l.exercises || []).forEach(e => {
    if (e.name !== ui.chartEx) return;
    const ws2 = e.sets.map(s => s.w).filter(v => v != null);
    if (ws2.length) pts.push({ x: +parseISO(l.date), y: Math.max(...ws2), date: l.date, sets: e.sets });
  }));
  h += `<div class="section-title">Cargas</div><div class="card">
    <select data-bind="chartEx" style="margin-top:0">${names.map(n => `<option ${n === ui.chartEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    ${pts.length ? chart([{ cls: 'line', pts }], { unit: 'kg' }) + `<ul class="list" style="margin-top:8px">${pts.slice(-4).reverse().map(p => `<li><span class="grow">${fmtShort(p.date)}</span><span class="muted small">${p.sets.map(s => `${s.w ?? '–'}kg×${s.r ?? '–'}`).join(' · ')}</span></li>`).join('')}</ul>`
      : '<p class="muted small" style="margin-top:12px">Sem cargas registradas para este exercício ainda.</p>'}
  </div>`;

  // histórico
  const hist = S.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
  h += `<div class="section-title">Histórico (${hist.length})</div>`;
  if (!hist.length) h += `<div class="card"><p class="muted">Nenhum treino registrado ainda. O primeiro é o mais importante!</p></div>`;
  h += hist.slice(0, 40).map(l => {
    const open = ui.histOpen === l.id;
    const sub = [l.type === 'cardio' ? `${l.minutes ?? '–'} min${l.modality ? ' · ' + esc(l.modality) : ''}` : l.type === 'walk' ? `${l.minutes ?? '–'} min` : `${l.durationMin ?? '–'} min`,
      l.back ? `costas: ${esc(l.back)}` : '', l.backNext ? `dia seguinte: ${esc(l.backNext)}` : ''].filter(Boolean).join(' · ');
    let det = '';
    if (open) {
      det = (l.exercises || []).map(e => `<div class="row between small" style="padding:6px 0;border-top:1px solid var(--line)"><span>${esc(e.name)}</span><span class="muted">${e.sets.length ? e.sets.map(s => `${s.w ?? '–'}kg×${s.r ?? '–'}`).join(' · ') : 'não feito'}</span></div>`).join('')
        + (l.notes ? `<p class="small" style="margin-top:10px">📝 ${esc(l.notes)}</p>` : '')
        + `<button class="btn sm danger" style="margin-top:12px" data-act="delLog" data-id="${l.id}">Apagar registro</button>`;
    }
    return `<div class="card" data-act="toggleHist" data-id="${l.id}" style="cursor:pointer"><div class="row between"><b>${esc(l.name)}</b><span class="muted small">${DAY_SHORT[parseISO(l.date).getDay()]} ${fmtShort(l.date)}</span></div>
      <div class="muted small">${sub}</div>${det}</div>`;
  }).join('');
  return h;
}

function chart(series, opt = {}) {
  const all = series.flatMap(s => s.pts);
  if (!all.length) return '<p class="muted small" style="margin-top:12px">Sem dados ainda. Os gráficos aparecem depois dos primeiros registros.</p>';
  const W = 320, H = 160, L = 36, R = 10, T = 12, B = 22;
  let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
  if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  const ys = all.map(p => p.y); if (opt.goal != null) ys.push(opt.goal);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pd = (y1 - y0) * 0.15 || 1; y0 -= pd; y1 += pd;
  const sx = x => L + (x - x0) / (x1 - x0) * (W - L - R);
  const sy = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const v = y0 + (y1 - y0) * i / 3, yy = sy(v);
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 3}" text-anchor="end">${fmtNum(v, 1)}</text>`;
  }
  const d0 = new Date(x0), d1 = new Date(x1);
  g += `<text x="${L}" y="${H - 6}">${pad2(d0.getDate())}/${pad2(d0.getMonth() + 1)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${pad2(d1.getDate())}/${pad2(d1.getMonth() + 1)}</text>`;
  if (opt.goal != null) g += `<line class="goal" x1="${L}" x2="${W - R}" y1="${sy(opt.goal)}" y2="${sy(opt.goal)}"/>`;
  series.forEach(s => {
    const pts = s.pts.slice().sort((a, b) => a.x - b.x);
    if (s.cls === 'line') {
      if (pts.length > 1) g += `<path class="line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')}"/>`;
      g += pts.map(p => `<circle class="pt" cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5"/>`).join('');
    } else {
      g += pts.map(p => `<circle class="raw" cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.5"/>`).join('');
    }
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/* ----- Mais ----- */
function renderMais() {
  const P = S.profile, w = weekNumber(iso());
  let h = `<header class="hero"><h1>Mais</h1></header>
  <div class="section-title">Guia do plano</div>
  <div class="card"><h3>Como ler a ficha</h3><p class="muted">${esc(GUIDE.reading)}</p></div>
  <div class="card"><h3>Regras de ouro</h3><ul class="bul">${GUIDE.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
  <div class="card"><h3>Progressão das 8 semanas</h3><ol class="steps">${PROGRESSION.map((p, i) => `<li class="${i + 1 === w ? 'cur' : ''}">${esc(p)}</li>`).join('')}</ol></div>
  <div class="card"><h3>Como acompanhar</h3><ul class="bul">${GUIDE.tracking.map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="muted small">${esc(GUIDE.schedule)}</p></div>

  <div class="section-title">Perfil</div>
  <div class="card">
    <label class="field">Nome<input type="text" data-bind="profile" data-f="name" value="${esc(P.name)}"></label>
    <div class="grid3" style="margin-top:12px">
      <label class="field">Altura (m)<input type="text" inputmode="decimal" data-bind="profile" data-f="height" placeholder="1,75" value="${P.height ?? ''}"></label>
      <label class="field">Peso inicial<input type="text" inputmode="decimal" data-bind="profile" data-f="startWeight" placeholder="kg" value="${P.startWeight ?? ''}"></label>
      <label class="field">Meta (kg)<input type="text" inputmode="decimal" data-bind="profile" data-f="goal" placeholder="kg" value="${P.goal ?? ''}"></label></div>
    <label class="field" style="margin-top:12px">Início do plano (semana 1)<input type="date" data-bind="profile" data-f="startDate" value="${P.startDate}"></label>
    <p class="muted small">A semana 1 começa na segunda-feira dessa data. Semanas ímpares: A-B-A; pares: B-A-B.</p>
  </div>

  <div class="section-title">Seus dados</div>
  <div class="card"><p class="muted small" style="margin-top:0">Tudo fica salvo só neste celular. Faça um backup de vez em quando (por exemplo, envie o arquivo para o seu Google Drive).</p>
    <button class="btn block primary" data-act="export">Exportar backup</button>
    <label class="btn block ghost" style="margin-top:10px">Importar backup<input type="file" accept="application/json,.json" data-bind="import" hidden></label>
    <button class="btn block ghost" style="margin-top:10px" data-act="resetWk">Restaurar treinos originais</button>
    <button class="btn block danger" style="margin-top:10px" data-act="wipe">Apagar todos os dados</button>
  </div>`;
  if (installEvt) h += `<div class="section-title">Aplicativo</div><div class="card"><button class="btn block primary" data-act="install">Instalar na tela inicial</button></div>`;
  h += `<p class="muted small" style="text-align:center;margin-top:24px">Meu Treino</p>`;
  return h;
}

/* ---------- sessão de treino ---------- */
function startSession(wid) {
  const w = getWorkout(wid);
  if (!w) return;
  if (w.type === 'strength' && !w.exercises.length) { toast('Esse treino ainda não tem exercícios'); return; }
  const base = { workoutId: wid, name: w.name, date: iso(), startedAt: Date.now(), back: null, notes: '' };
  if (w.type === 'cardio') {
    session = Object.assign(base, { kind: 'cardio', stage: 'setup', modality: (w.options || [])[0] || '', phases: w.phases.map(p => ({ ...p })), running: false, acc: 0, runStart: null, lastPhase: -1 });
  } else {
    session = Object.assign(base, {
      kind: 'strength', stage: w.warmup ? 'warmup' : 'ex', idx: 0, rest: null,
      exercises: w.exercises.map(e => ({
        exId: e.id, name: e.name, target: targetText(e), rest: +e.rest || 0, notes: e.notes, video: e.video,
        sets: Array.from({ length: Math.max(1, +e.sets || 1) }, () => ({ w: lastWeight(e.name), r: String(parseInt(e.reps) || ''), done: false }))
      }))
    });
  }
  unlockAudio(); requestWake(); saveSession(); window.scrollTo(0, 0); render();
}
function renderSession() { return session.kind === 'cardio' ? renderCardio() : renderStrength(); }

function renderStrength() {
  const s = session, n = s.exercises.length;
  let h = `<div class="sbar"><button class="icon-btn" data-act="quit" aria-label="Sair">${ICON.close}</button><div class="sbar-title">${esc(s.name)}</div><div class="sbar-time" id="elapsed"></div></div>
    <main class="page session ${s.rest ? 'has-rest' : ''}">`;
  h += `<div class="progress">${s.exercises.map((e, i) => `<i class="${e.sets.every(x => x.done) ? 'done' : (i === s.idx && s.stage === 'ex' ? 'on' : '')}"></i>`).join('')}</div>`;

  if (s.stage === 'warmup') {
    const w = getWorkout(s.workoutId);
    h += `<div class="eyebrow">Antes de começar</div><h1 style="margin-top:6px">Aquecimento</h1>
      <div class="card" style="margin-top:16px"><p style="font-size:17px">${esc(w ? w.warmup : '')}</p></div>
      <div class="hint">${esc((w && w.tip) || '')}</div>
      <button class="btn big primary" data-act="goEx" data-i="0">Aquecimento feito, vamos lá</button>`;
  } else if (s.stage === 'ex') {
    const e = s.exercises[s.idx];
    h += `<div class="ex-head"><div class="eyebrow">Exercício ${s.idx + 1} de ${n}</div><h1>${esc(e.name)}</h1>
      <div class="chips"><span class="chip accent">${esc(e.target)}</span><span class="chip">Descanso ${e.rest} s</span></div></div>
      <div class="row" style="margin-top:14px"><a class="btn primary grow" href="${esc(videoUrl(e))}" target="_blank" rel="noopener">${ICON.play} ${e.video ? 'Ver vídeo' : 'Como fazer (vídeo)'}</a></div>
      ${e.notes ? `<details class="howto" ${lastWeight(e.name) === '' ? 'open' : ''}><summary>Execução</summary><p>${esc(e.notes)}</p></details>` : ''}
      ${s.idx < 2 && getWorkout(s.workoutId)?.warmup ? '<div class="hint">Antes das séries, faça 1 série preparatória de 10 repetições com carga bem leve.</div>' : ''}
      <div class="sets">${e.sets.map((st, i) => `<div class="set ${st.done ? 'done' : ''}"><div class="n">${i + 1}</div>
        <label>Carga kg<input type="text" inputmode="decimal" placeholder="–" data-bind="set" data-i="${i}" data-f="w" value="${esc(st.w)}"></label>
        <label>Reps<input type="text" inputmode="numeric" placeholder="–" data-bind="set" data-i="${i}" data-f="r" value="${esc(st.r)}"></label>
        <button class="tick" data-act="toggleSet" data-i="${i}" aria-label="Série feita">✓</button></div>`).join('')}</div>
      <div class="row between" style="margin-top:8px"><button class="link" data-act="addSet">+ série</button>${e.sets.length > 1 ? '<button class="link" style="color:var(--muted)" data-act="removeSet">− série</button>' : ''}</div>
      <div class="nav-row"><button class="btn ghost" data-act="goEx" data-i="${s.idx - 1}" ${s.idx === 0 ? 'disabled style="opacity:.4"' : ''}>Anterior</button>
      ${s.idx < n - 1 ? `<button class="btn primary" data-act="goEx" data-i="${s.idx + 1}">Próximo</button>` : `<button class="btn ok" data-act="toFinish">Finalizar treino</button>`}</div>`;
  } else {
    h += finishForm();
  }
  h += `</main>`;
  if (s.rest) {
    h += `<div class="rest"><div class="rest-inner"><div class="row between"><div><div class="eyebrow">Descanso</div><div class="rest-time" id="restTime">${mmss((s.rest.endAt - Date.now()) / 1000)}</div></div>
      <div class="row"><button class="btn sm ghost" data-act="restAdd">+15 s</button><button class="btn sm primary" data-act="restSkip">Pular</button></div></div>
      <div class="bar"><i id="restBar"></i></div><div class="muted small">Respire. Solte o ar durante o esforço na próxima série.</div></div></div>`;
  }
  return h;
}

function finishForm() {
  const s = session;
  let sum = '';
  if (s.kind === 'strength') {
    const done = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.done).length, 0);
    const total = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    sum = `<div class="stats" style="margin-top:16px"><div class="stat"><div class="eyebrow">Séries feitas</div><div class="v">${done}<small>/${total}</small></div></div>
      <div class="stat"><div class="eyebrow">Duração</div><div class="v">${Math.round((Date.now() - s.startedAt) / 60000)} <small>min</small></div></div></div>`;
  } else {
    sum = `<div class="stats" style="margin-top:16px"><div class="stat"><div class="eyebrow">Tempo</div><div class="v">${Math.round(cardioElapsed() / 60000)} <small>min</small></div></div>
      <div class="stat"><div class="eyebrow">Aparelho</div><div class="v" style="font-size:18px">${esc(s.modality || '–')}</div></div></div>`;
  }
  const bad = s.back === 'Moderada' || s.back === 'Forte';
  return `<div class="eyebrow">Quase lá</div><h1 style="margin-top:6px">Treino concluído 💪</h1>${sum}
    <div class="card" style="margin-top:14px"><h3>Como ficaram as costas durante o treino?</h3>
    <div class="choices">${BACK.map(b => `<button class="choice ${s.back === b ? 'on' : ''}" data-act="setBack" data-v="${b}">${b}</button>`).join('')}</div>
    ${bad ? '<div class="hint bad">Se algum exercício provocou ou aumentou a dor, avise seu treinador para ajustar. Anote abaixo qual foi.</div>' : ''}
    <label class="field" style="margin-top:14px">Observações (opcional)<textarea data-bind="sessNotes" placeholder="Como se sentiu, algum ajuste de carga, etc.">${esc(s.notes)}</textarea></label></div>
    <button class="btn big ok" data-act="saveSession">Salvar treino</button>
    ${s.kind === 'strength' ? '<button class="btn big ghost" data-act="goEx" data-i="0">Voltar aos exercícios</button>' : ''}`;
}

function cardioTotal() { return session.phases.reduce((a, p) => a + (+p.min || 0) * 60, 0); }
function cardioElapsed() { return session.acc + (session.running ? Date.now() - session.runStart : 0); }
function phaseAt(sec) {
  let t = 0;
  for (let i = 0; i < session.phases.length; i++) {
    const len = (+session.phases[i].min || 0) * 60;
    if (sec < t + len) return { i, rem: t + len - sec };
    t += len;
  }
  return { i: session.phases.length - 1, rem: 0 };
}
function renderCardio() {
  const s = session, w = getWorkout(s.workoutId);
  let h = `<div class="sbar"><button class="icon-btn" data-act="quit" aria-label="Sair">${ICON.close}</button><div class="sbar-title">${esc(s.name)}</div><div class="sbar-time"></div></div><main class="page session">`;
  if (s.stage === 'setup') {
    h += `<h1 style="margin-top:10px">${esc(s.name)}</h1><p class="muted">Escolha o aparelho mais confortável para as costas.</p>
      <div class="choices">${((w && w.options) || []).map(o => `<button class="choice ${s.modality === o ? 'on' : ''}" data-act="setMod" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <div class="card phase-list" style="margin-top:16px">${s.phases.map((p, i) => `<div class="ph"><div class="ex-num">${i + 1}</div><div class="grow"><b>${esc(p.name)}</b> · ${p.min} min<div class="muted small">${esc(p.desc)}</div></div></div>`).join('')}</div>
      ${w && w.notes ? `<div class="hint">${esc(w.notes)}</div>` : ''}
      <button class="btn big primary" data-act="cardioGo">${ICON.play} Iniciar cronômetro</button>`;
  } else if (s.stage === 'run') {
    const e = cardioElapsed() / 1000, ph = phaseAt(e), cur = s.phases[ph.i];
    h += `<div class="timer"><div class="eyebrow">Etapa ${ph.i + 1} de ${s.phases.length}</div><h2 style="margin-top:6px" id="phName">${esc(cur.name)}</h2>
      <div class="big" id="phRem">${mmss(ph.rem)}</div><p class="muted" id="phDesc">${esc(cur.desc)}</p>
      <div class="bar"><i id="cBar" style="width:${(e / cardioTotal() * 100).toFixed(1)}%"></i></div>
      <div class="muted small">Total restante: <b id="totRem">${mmss(cardioTotal() - e)}</b></div></div>
      <div class="row"><button class="btn grow ${s.running ? 'ghost' : 'primary'}" style="min-height:54px" data-act="cardioToggle">${s.running ? 'Pausar' : 'Continuar'}</button>
      <button class="btn grow ghost" style="min-height:54px" data-act="cardioEnd">Encerrar</button></div>
      <div class="card phase-list" style="margin-top:16px">${s.phases.map((p, i) => `<div class="ph ${i === ph.i ? 'cur' : i < ph.i ? 'past' : ''}"><div class="ex-num">${i + 1}</div><div class="grow"><b>${esc(p.name)}</b> · ${p.min} min</div></div>`).join('')}</div>`;
  } else {
    h += finishForm();
  }
  return h + `</main>`;
}

function startTick() { if (!tickTimer) { tickTimer = setInterval(tick, 250); } tick(); }
function stopTick() { clearInterval(tickTimer); tickTimer = null; }
function tick() {
  if (!session) return stopTick();
  const now = Date.now();
  if (session.kind === 'strength') {
    const el = document.getElementById('elapsed');
    if (el) el.textContent = mmss((now - session.startedAt) / 1000);
    if (session.rest) {
      const rem = (session.rest.endAt - now) / 1000;
      if (rem <= 0) { session.rest = null; saveSession(); alertUser(); render(); return; }
      const t = document.getElementById('restTime'), b = document.getElementById('restBar');
      if (t) t.textContent = mmss(Math.ceil(rem));
      if (b) b.style.width = (100 - rem / session.rest.total * 100).toFixed(1) + '%';
    }
  } else if (session.stage === 'run') {
    const e = cardioElapsed() / 1000, total = cardioTotal();
    if (e >= total) { session.running = false; session.acc = total * 1000; session.stage = 'finish'; saveSession(); alertUser(true); render(); return; }
    const ph = phaseAt(e);
    if (ph.i !== session.lastPhase) {
      if (session.lastPhase >= 0) { alertUser(); toast(session.phases[ph.i].name); }
      session.lastPhase = ph.i; saveSession(); render(); return;
    }
    const set = (id, v) => { const x = document.getElementById(id); if (x) x.textContent = v; };
    set('phRem', mmss(ph.rem)); set('totRem', mmss(total - e));
    const b = document.getElementById('cBar'); if (b) b.style.width = (e / total * 100).toFixed(1) + '%';
  }
}

function startRest(sec) { if (sec > 0) { session.rest = { endAt: Date.now() + sec * 1000, total: sec }; } }

function finishAndSave() {
  const s = session;
  const log = { id: uid(), ts: Date.now(), date: s.date, workoutId: s.workoutId, name: s.name, type: s.kind, back: s.back, notes: s.notes.trim() };
  if (s.kind === 'strength') {
    log.durationMin = Math.round((Date.now() - s.startedAt) / 60000);
    log.exercises = s.exercises.map(e => ({ exId: e.exId, name: e.name, sets: e.sets.filter(x => x.done).map(x => ({ w: num(x.w), r: num(x.r) })) }));
  } else {
    log.minutes = Math.round(cardioElapsed() / 60000);
    log.modality = s.modality;
  }
  S.logs.push(log); save();
  session = null; saveSession(); releaseWake();
  ui.tab = 'hoje'; window.scrollTo(0, 0); render();
  toast('Treino salvo! Bom trabalho 💪');
}

/* ---------- alertas, tela ligada ---------- */
function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { audioCtx = null; }
}
function beep(freq = 880, dur = 0.18, when = 0) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + when;
    o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* ignora */ }
}
function alertUser(long) {
  if (navigator.vibrate) navigator.vibrate(long ? [300, 120, 300, 120, 500] : [250, 100, 250]);
  beep(880, .18, 0); beep(1175, .22, .25); if (long) beep(1568, .35, .55);
}
async function requestWake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* ignora */ } }
function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignora */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session) { requestWake(); tick(); } });

let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- ações ---------- */
function curWk() { return getWorkout(ui.wk); }
function addWeightEntry(dateStr, kg) {
  S.weights = S.weights.filter(x => x.date !== dateStr);
  S.weights.push({ id: uid(), date: dateStr, kg });
  S.weights.sort((a, b) => a.date.localeCompare(b.date));
}

const ACT = {
  tab: d => { ui.tab = d.v; ui.wk = null; ui.editing = false; window.scrollTo(0, 0); render(); },
  start: d => startSession(d.id),
  openWk: d => { ui.tab = 'treinos'; ui.wk = d.id; ui.editing = false; window.scrollTo(0, 0); render(); },
  closeWk: () => { ui.wk = null; ui.editing = false; window.scrollTo(0, 0); render(); },
  toggleEdit: () => { ui.editing = !ui.editing; if (!ui.editing) toast('Alterações salvas'); render(); },
  newWk: d => {
    const id = uid();
    const w = d.v === 'cardio'
      ? { id, name: 'Novo cardio', type: 'cardio', options: ['Bicicleta', 'Elíptico', 'Esteira'], notes: '', phases: [{ name: 'Aquecimento', min: 5, desc: '' }, { name: 'Parte principal', min: 10, desc: '' }, { name: 'Desaceleração', min: 5, desc: '' }] }
      : { id, name: `Treino ${String.fromCharCode(65 + S.workouts.filter(x => x.type === 'strength').length)}`, type: 'strength', warmup: '', tip: '', exercises: [] };
    S.workouts.push(w); save(); ui.wk = id; ui.editing = true; window.scrollTo(0, 0); render();
  },
  delWk: () => {
    const w = curWk();
    if (!confirm(`Excluir "${w.name}"? O histórico de treinos já feitos continua salvo.`)) return;
    S.workouts = S.workouts.filter(x => x !== w); save(); ui.wk = null; ui.editing = false; render();
  },
  addEx: () => { curWk().exercises.push({ id: uid(), name: 'Novo exercício', sets: 2, reps: 10, perSide: false, rest: 60, notes: '', video: '' }); save(); render(); },
  delEx: d => { const w = curWk(); if (confirm(`Remover "${w.exercises[+d.i].name}"?`)) { w.exercises.splice(+d.i, 1); save(); render(); } },
  moveEx: d => {
    const a = curWk().exercises, i = +d.i, j = i + +d.v;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; save(); render();
  },
  addPh: () => { curWk().phases.push({ name: 'Nova etapa', min: 5, desc: '' }); save(); render(); },
  delPh: d => { const w = curWk(); if (w.phases.length > 1) { w.phases.splice(+d.i, 1); save(); render(); } },
  setVideo: d => {
    const e = getWorkout(d.wk).exercises[+d.i];
    const v = prompt(`Cole o link do vídeo para "${e.name}" (YouTube, Instagram etc.).\nDeixe em branco para voltar à busca automática.`, e.video || '');
    if (v === null) return;
    const t = v.trim();
    if (t && !/^https?:\/\//i.test(t)) { toast('O link precisa começar com http:// ou https://'); return; }
    e.video = t; save(); render(); toast(t ? 'Vídeo salvo' : 'Usando busca automática');
  },
  logWalk: () => {
    const v = prompt('Quantos minutos de caminhada?', '30');
    if (v === null) return;
    S.logs.push({ id: uid(), ts: Date.now(), date: iso(), workoutId: 'walk', name: 'Caminhada leve', type: 'walk', minutes: num(v) }); save(); render(); toast('Caminhada registrada');
  },
  backNext: d => { const l = S.logs.find(x => x.id === d.id); if (l) { l.backNext = d.v; save(); render(); toast((d.v === 'Moderada' || d.v === 'Forte') ? 'Anotado. Vale avisar seu treinador.' : 'Anotado, obrigado!'); } },
  addWeight: d => {
    const kg = num(document.getElementById(d.src).value);
    const date = d.date ? document.getElementById(d.date).value || iso() : iso();
    if (kg == null || kg < 30 || kg > 300) { toast('Digite um peso válido'); return; }
    addWeightEntry(date, kg); save(); render(); toast('Peso salvo');
  },
  delWeight: d => { S.weights = S.weights.filter(x => x.id !== d.id); save(); render(); },
  addWaist: () => {
    const cm = num(document.getElementById('cCm').value), date = document.getElementById('cDate').value || iso();
    if (cm == null || cm < 40 || cm > 200) { toast('Digite uma medida válida em cm'); return; }
    S.waist = S.waist.filter(x => x.date !== date); S.waist.push({ id: uid(), date, cm }); save(); render(); toast('Cintura salva');
  },
  delWaist: d => { S.waist = S.waist.filter(x => x.id !== d.id); save(); render(); },
  toggleHist: (d, el, ev) => { if (ev.target.closest('[data-act="delLog"]')) return; ui.histOpen = ui.histOpen === d.id ? null : d.id; render(); },
  delLog: d => { if (confirm('Apagar este registro de treino?')) { S.logs = S.logs.filter(x => x.id !== d.id); ui.histOpen = null; save(); render(); } },

  // sessão
  quit: () => {
    if (!confirm('Sair do treino? O que foi feito até agora não será salvo.')) return;
    session = null; saveSession(); releaseWake(); render();
  },
  goEx: d => { const i = +d.i; if (i < 0) return; session.stage = 'ex'; session.idx = Math.min(i, session.exercises.length - 1); saveSession(); window.scrollTo(0, 0); render(); },
  toggleSet: d => {
    const e = session.exercises[session.idx], st = e.sets[+d.i];
    st.done = !st.done;
    if (st.done) {
      const all = e.sets.every(x => x.done), last = session.idx === session.exercises.length - 1;
      if (!(all && last)) startRest(e.rest);
      if (all && !last) { session.idx++; window.scrollTo(0, 0); toast('Próximo: ' + session.exercises[session.idx].name); }
      if (all && last) toast('Último exercício concluído! Toque em Finalizar.');
    }
    saveSession(); render();
  },
  addSet: () => { const e = session.exercises[session.idx], p = e.sets[e.sets.length - 1]; e.sets.push({ w: p ? p.w : '', r: p ? p.r : '', done: false }); saveSession(); render(); },
  removeSet: () => { const e = session.exercises[session.idx]; if (e.sets.length > 1) { e.sets.pop(); saveSession(); render(); } },
  restAdd: () => { if (session.rest) { session.rest.endAt += 15000; session.rest.total += 15; saveSession(); tick(); } },
  restSkip: () => { session.rest = null; saveSession(); render(); },
  toFinish: () => { session.stage = 'finish'; session.rest = null; saveSession(); window.scrollTo(0, 0); render(); },
  setBack: d => { session.back = session.back === d.v ? null : d.v; saveSession(); render(); },
  saveSession: () => finishAndSave(),
  setMod: d => { session.modality = d.v; saveSession(); render(); },
  cardioGo: () => { unlockAudio(); session.stage = 'run'; session.running = true; session.runStart = Date.now(); session.acc = 0; session.lastPhase = 0; saveSession(); render(); },
  cardioToggle: () => {
    if (session.running) { session.acc += Date.now() - session.runStart; session.running = false; }
    else { session.runStart = Date.now(); session.running = true; }
    saveSession(); render();
  },
  cardioEnd: () => {
    if (session.running) { session.acc += Date.now() - session.runStart; session.running = false; }
    session.stage = 'finish'; saveSession(); render();
  },

  // dados
  export: () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `meu-treino-backup-${iso()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  resetWk: () => {
    if (!confirm('Voltar os treinos ao plano original do PDF? Suas edições nos treinos serão perdidas (o histórico continua).')) return;
    S.workouts = defaultWorkouts(); save(); render(); toast('Treinos restaurados');
  },
  wipe: () => {
    if (!confirm('Apagar TODOS os dados (histórico, pesos, medidas e edições)? Isso não pode ser desfeito.')) return;
    S = defaultData(); save(); session = null; saveSession(); render(); toast('Dados apagados');
  },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); }
};

const BIND = {
  wk: t => {
    const w = curWk(), f = t.dataset.f;
    w[f] = f === 'options' ? t.value.split(',').map(x => x.trim()).filter(Boolean) : t.value; save();
  },
  ex: t => {
    const e = curWk().exercises[+t.dataset.i], f = t.dataset.f;
    if (f === 'perSide') e[f] = t.checked;
    else if (f === 'sets' || f === 'rest') e[f] = Math.max(f === 'sets' ? 1 : 0, parseInt(t.value) || 0);
    else e[f] = t.value;
    save();
  },
  ph: t => { const p = curWk().phases[+t.dataset.i], f = t.dataset.f; p[f] = f === 'min' ? Math.max(1, parseInt(t.value) || 1) : t.value; save(); },
  set: t => { session.exercises[session.idx].sets[+t.dataset.i][t.dataset.f] = t.value; saveSession(); },
  sessNotes: t => { session.notes = t.value; saveSession(); },
  profile: t => {
    const f = t.dataset.f;
    if (f === 'name' || f === 'startDate') { if (t.value) S.profile[f] = t.value; }
    else { const v = num(t.value); if (v != null && v > 0) S.profile[f] = v; }
    save();
  },
  chartEx: t => { ui.chartEx = t.value; render(); },
  import: t => {
    const file = t.files && t.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.workouts)) throw new Error('formato');
        if (!confirm('Substituir os dados deste aparelho pelo backup?')) return;
        S = migrate(d); save(); render(); toast('Backup importado');
      } catch (e) { toast('Arquivo de backup inválido'); }
    };
    r.readAsText(file);
  }
};

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act];
  if (fn) fn(b.dataset, b, ev);
});
document.addEventListener('input', ev => {
  const t = ev.target, k = t.dataset && t.dataset.bind;
  if (k && t.type !== 'checkbox' && t.type !== 'file' && t.tagName !== 'SELECT' && t.type !== 'date') BIND[k] && BIND[k](t);
});
document.addEventListener('change', ev => {
  const t = ev.target, k = t.dataset && t.dataset.bind;
  if (k && (t.type === 'checkbox' || t.type === 'file' || t.tagName === 'SELECT' || t.type === 'date')) BIND[k] && BIND[k](t);
  if (k === 'profile' && ui.tab === 'mais') render();
});
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' || !ev.target.id) return;
  const map = { qWeight: 'addWeight', wKg: 'addWeight', cCm: 'addWaist' };
  const btn = map[ev.target.id] && document.querySelector(`[data-act="${map[ev.target.id]}"]`);
  if (btn) btn.click();
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (ui.tab === 'mais' && !session) render(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if (session) requestWake();
render();
