'use strict';

const fs = require('fs');
const path = require('path');
const { APP_DIR } = require('./paths');

const DATA_PATH = path.join(APP_DIR, 'data.json');
const MAX_HISTORY = 90;

const DEFAULT_DATA = {
  areas: {
    saude: {
      campos: {
        peso: null,
        pesoAlvo: null,
        sonoH: null,
        treinosSemana: 0,
        treinosMeta: 3,
      },
      historico: { peso: [], sonoH: [] },
      metasManual: {},
    },
  },
  areasOrder: ['claude-code', 'saude'],
  pesos: { 'claude-code': 1, saude: 1 },
};

function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const k of Object.keys(patch)) out[k] = deepMerge(out[k], patch[k]);
  return out;
}

function readData() {
  let data;
  try { data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); } catch { data = null; }
  if (!data || typeof data !== 'object') {
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    try { fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch {}
    return data;
  }
  if (!data.areas) data.areas = {};
  if (!data.areasOrder) data.areasOrder = DEFAULT_DATA.areasOrder.slice();
  if (!data.pesos) data.pesos = { ...DEFAULT_DATA.pesos };
  // seed/migração de Metas: cria (v1) ou re-seeda quando os goals não têm `track` (v2). Grava 1×.
  if (data.areas.metas) {
    const mg = data.areas.metas.goals;
    if (!Array.isArray(mg) || (mg.length && !mg.some(x => x && x.track))) {
      data.areas.metas.goals = seedMetasGoals();
      try { fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch {}
    }
  }
  return data;
}

function writeRaw(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function writeData(patch) {
  return writeRaw(deepMerge(readData(), patch));
}

function writeArea(areaId, areaPatch) {
  return writeData({ areas: { [areaId]: areaPatch } });
}

// Garante que a área existe com o shape completo (idempotente).
function ensureArea(data, areaId) {
  if (!data.areas[areaId]) data.areas[areaId] = {};
  const area = data.areas[areaId];
  if (!area.campos || typeof area.campos !== 'object') area.campos = {};
  if (!area.historico || typeof area.historico !== 'object') area.historico = {};
  if (!area.metasManual || typeof area.metasManual !== 'object') area.metasManual = {};
  if (!area.metasTexto || typeof area.metasTexto !== 'object') area.metasTexto = {};
  if (!area.progresso || typeof area.progresso !== 'object') area.progresso = {};
  const p = area.progresso;
  if (!Array.isArray(p.checkins)) p.checkins = [];
  if (typeof p.recordeStreak !== 'number') p.recordeStreak = 0;
  if (!Array.isArray(p.badgesUnlocked)) p.badgesUnlocked = [];
  if (!p.missoesLog || typeof p.missoesLog !== 'object') p.missoesLog = {};
  if (!Array.isArray(area.clientes)) area.clientes = [];
  if (!Array.isArray(area.goals)) area.goals = [];
  return area;
}

const ESTAGIOS = ['lead', 'negociando', 'fechado', 'entregando', 'pago'];

// ── GOALS / SONHOS (área Metas) ──
const FONTES_RITMO = ['mrr', 'savings'];
const TRACKS = ['jornada', 'renda', 'patrimonio', 'corpo', 'idioma'];

// Seed v2: a jornada de vida + escada de dinheiro (2 trilhos) + corpo/idioma,
// cada meta com TRACK e data fixa (previsão acordada, editável depois).
function seedMetasGoals() {
  const mil = v => v >= 1e6 ? (String(v / 1e6).replace('.', ',')) + ' mi' : (v / 1e3) + ' mil';
  const g = (id, titulo, emoji, track, fonteRitmo, custo, prazo, extra) => Object.assign(
    { id, titulo, emoji, porque: '', track, fonteRitmo, custo, prazo, estrela: false, feito: false },
    extra || {});
  const goals = [];

  // ── Jornada (sequência de vida, travada por idade/lei + grana) ──
  goals.push(g('goal-sair-casa', 'Sair de casa', '🚪', 'jornada', null, 0, '2027-07-01', { porque: 'Liberdade — minha vida nas minhas mãos.' }));
  goals.push(g('goal-airbnb', 'Morar de Airbnb em Airbnb', '🧳', 'jornada', null, 0, '2027-08-01', { porque: 'Sem âncora — o mundo como casa.' }));
  goals.push(g('goal-eua', 'Ir pros EUA', '🇺🇸', 'jornada', null, 0, '2028-07-01', { porque: 'O passo que aproxima a Sofia.' }));
  goals.push(g('goal-porsche', 'Comprar o Porsche', '🏎️', 'jornada', 'savings', 350000, '2028-12-01', { porque: 'Consequência do trabalho, conquistado lá.' }));
  goals.push(g('goal-sofia', 'Encontrar a Sofia', '❤️', 'jornada', null, 0, '2029-06-01', { estrela: true, porque: 'Construir uma vida boa pra nós dois.' }));

  // ── Renda/mês (MRR) ──
  const renda = [[10e3, '2026-11-01'], [20e3, '2027-02-01'], [30e3, '2027-04-01'], [50e3, '2027-07-01'], [80e3, '2027-10-01'], [100e3, '2027-12-01'], [150e3, '2028-03-01'], [200e3, '2028-06-01'], [300e3, '2028-11-01'], [500e3, '2029-06-01'], [700e3, '2029-12-01'], [1e6, '2030-07-01'], [1.5e6, '2031-02-01'], [2e6, '2031-08-01'], [3e6, '2032-05-01'], [5e6, '2033-06-01']];
  renda.forEach(([v, p], i) => goals.push(g('goal-renda-' + i, 'R$' + mil(v) + '/mês', '💸', 'renda', 'mrr', v, p)));

  // ── Patrimônio (total) ──
  const patr = [[10e3, '2026-10-01'], [50e3, '2027-02-01'], [100e3, '2027-05-01'], [200e3, '2027-08-01'], [500e3, '2028-01-01'], [1e6, '2028-07-01'], [2e6, '2029-02-01'], [3e6, '2029-07-01'], [4e6, '2029-11-01'], [5e6, '2030-03-01'], [10e6, '2030-12-01'], [15e6, '2031-08-01'], [20e6, '2032-03-01'], [30e6, '2033-01-01'], [50e6, '2034-01-01'], [70e6, '2034-11-01'], [100e6, '2035-12-01'], [300e6, '2037-06-01'], [500e6, '2039-01-01']];
  patr.forEach(([v, p], i) => goals.push(g('goal-patr-' + i, 'R$' + mil(v), '🏦', 'patrimonio', 'savings', v, p)));

  // ── Corpo ──
  goals.push(g('goal-abdomen', 'Abdômen definido', '🔥', 'corpo', null, 0, '2027-07-01', { porque: 'Disciplina que aparece no espelho.' }));
  goals.push(g('goal-musculoso', 'Corpo musculoso', '💪', 'corpo', null, 0, '2028-07-01', { porque: 'Forte por fora e por dentro.' }));

  // ── Idioma ──
  goals.push(g('goal-espanhol', 'Espanhol fluente', '🗣️', 'idioma', null, 0, '2028-01-01', { porque: 'Outra língua, outro mundo.' }));
  goals.push(g('goal-ingles', 'Inglês fluente', '🌎', 'idioma', null, 0, '2028-04-01', { porque: 'A língua dos EUA e dos negócios.' }));

  return goals;
}

function addGoal(areaId, obj) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const goal = {
    id: 'goal-' + Date.now(),
    titulo: String(obj.titulo || '').slice(0, 120),
    emoji: String(obj.emoji || '🎯').slice(0, 8),
    porque: String(obj.porque || '').slice(0, 160),
    fonteRitmo: FONTES_RITMO.includes(obj.fonteRitmo) ? obj.fonteRitmo : null,
    track: TRACKS.includes(obj.track) ? obj.track : 'jornada',
    custo: Number(obj.custo) || 0,
    prazo: typeof obj.prazo === 'string' ? obj.prazo.slice(0, 10) : null,
    estrela: !!obj.estrela,
    feito: !!obj.feito,
  };
  if (goal.estrela) area.goals.forEach(g => { g.estrela = false; });
  area.goals.push(goal);
  writeRaw(data);
  return goal;
}

function updateGoal(areaId, gid, patch) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const g = area.goals.find(x => x.id === gid);
  if (!g) return null;
  if (patch.titulo !== undefined) g.titulo = String(patch.titulo).slice(0, 120);
  if (patch.emoji !== undefined) g.emoji = String(patch.emoji).slice(0, 8);
  if (patch.porque !== undefined) g.porque = String(patch.porque).slice(0, 160);
  if (patch.fonteRitmo !== undefined) g.fonteRitmo = FONTES_RITMO.includes(patch.fonteRitmo) ? patch.fonteRitmo : null;
  if (patch.track !== undefined && TRACKS.includes(patch.track)) g.track = patch.track;
  if (patch.custo !== undefined) g.custo = Number(patch.custo) || 0;
  if (patch.prazo !== undefined) g.prazo = patch.prazo ? String(patch.prazo).slice(0, 10) : null;
  if (patch.feito !== undefined) g.feito = !!patch.feito;
  if (patch.estrela !== undefined) {
    g.estrela = !!patch.estrela;
    if (g.estrela) area.goals.forEach(x => { if (x.id !== gid) x.estrela = false; });
  }
  writeRaw(data);
  return g;
}

function deleteGoal(areaId, gid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.goals.length;
  area.goals = area.goals.filter(g => g.id !== gid);
  writeRaw(data);
  return { removed: n !== area.goals.length };
}

function addCliente(areaId, obj) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const cli = {
    id: 'cli-' + Date.now(),
    nome: String(obj.nome || '').slice(0, 80),
    produto: String(obj.produto || '').slice(0, 80),
    valor: Number(obj.valor) || 0,
    estagio: ESTAGIOS.includes(obj.estagio) ? obj.estagio : 'lead',
    proximaAcao: String(obj.proximaAcao || '').slice(0, 120),
    prazo: typeof obj.prazo === 'string' ? obj.prazo.slice(0, 10) : null,
  };
  area.clientes.push(cli);
  writeRaw(data);
  return cli;
}

function updateCliente(areaId, cid, patch) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const cli = area.clientes.find(c => c.id === cid);
  if (!cli) return null;
  if (patch.nome !== undefined) cli.nome = String(patch.nome).slice(0, 80);
  if (patch.produto !== undefined) cli.produto = String(patch.produto).slice(0, 80);
  if (patch.valor !== undefined) cli.valor = Number(patch.valor) || 0;
  if (patch.estagio !== undefined && ESTAGIOS.includes(patch.estagio)) cli.estagio = patch.estagio;
  if (patch.proximaAcao !== undefined) cli.proximaAcao = String(patch.proximaAcao).slice(0, 120);
  if (patch.prazo !== undefined) cli.prazo = patch.prazo ? String(patch.prazo).slice(0, 10) : null;
  writeRaw(data);
  return cli;
}

function deleteCliente(areaId, cid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.clientes.length;
  area.clientes = area.clientes.filter(c => c.id !== cid);
  writeRaw(data);
  return { removed: n !== area.clientes.length };
}

// Maior sequência de dias consecutivos num array de "YYYY-MM-DD".
function longestStreak(dates) {
  if (!dates || !dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const today = new Date(sorted[i] + 'T00:00:00');
    const diff = Math.round((today - prev) / 86400000);
    if (diff === 1) { cur++; if (cur > best) best = cur; }
    else if (diff > 1) cur = 1;
  }
  return best;
}

function pushHistory(areaId, campo, valor, dateStr) {
  const data = readData();
  const area = ensureArea(data, areaId);
  if (!area.historico) area.historico = {};
  if (!Array.isArray(area.historico[campo])) area.historico[campo] = [];
  const arr = area.historico[campo];
  const num = Number(valor);
  const idx = arr.findIndex(p => p.d === dateStr);
  if (idx >= 0) arr[idx].v = num;
  else arr.push({ d: dateStr, v: num });
  arr.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (arr.length > MAX_HISTORY) area.historico[campo] = arr.slice(-MAX_HISTORY);
  if (!area.campos) area.campos = {};
  area.campos[campo] = num;
  return writeRaw(data);
}

function addMeta(areaId, metaId, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  area.metasManual[metaId] = false;
  area.metasTexto[metaId] = texto;
  return writeRaw(data);
}

function editMeta(areaId, metaId, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  area.metasTexto[metaId] = texto;
  return writeRaw(data);
}

function deleteMeta(areaId, metaId) {
  const data = readData();
  const area = ensureArea(data, areaId);
  delete area.metasManual[metaId];
  delete area.metasTexto[metaId];
  return writeRaw(data);
}

// Toggle do check-in diário. Retorna estado novo (feito após a operação).
function doCheckin(areaId, dateStr) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const arr = area.progresso.checkins;
  const idx = arr.indexOf(dateStr);
  let feito;
  if (idx >= 0) { arr.splice(idx, 1); feito = false; }
  else { arr.push(dateStr); feito = true; }
  arr.sort();
  area.progresso.recordeStreak = Math.max(area.progresso.recordeStreak || 0, longestStreak(arr));
  writeRaw(data);
  return { feito };
}

// Toggle de missão manual. Grava a data em que foi concluída (ou remove).
function logMissao(areaId, missaoId, dateStr) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const log = area.progresso.missoesLog;
  let feita;
  if (log[missaoId] === dateStr) { delete log[missaoId]; feita = false; }
  else { log[missaoId] = dateStr; feita = true; }
  writeRaw(data);
  return { feita };
}

// Sticky: desbloqueia badge permanentemente. No-op se já desbloqueada.
function unlockBadge(areaId, badgeId) {
  const data = readData();
  const area = ensureArea(data, areaId);
  if (!area.progresso.badgesUnlocked.includes(badgeId)) {
    area.progresso.badgesUnlocked.push(badgeId);
    writeRaw(data);
    return true;
  }
  return false;
}

module.exports = {
  readData, writeData, writeArea, pushHistory,
  addMeta, editMeta, deleteMeta,
  addCliente, updateCliente, deleteCliente, ESTAGIOS,
  addGoal, updateGoal, deleteGoal, seedMetasGoals,
  ensureArea, longestStreak, doCheckin, logMissao, unlockBadge,
  DATA_PATH, DEFAULT_DATA,
};
