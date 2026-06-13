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
  return area;
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
  ensureArea, longestStreak, doCheckin, logMissao, unlockBadge,
  DATA_PATH, DEFAULT_DATA,
};
