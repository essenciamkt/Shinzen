'use strict';

/* Área "Diário" — escrita livre organizada em Capítulo → Aventura → Entrada.
   Sucessora do "Despejo da mente" (journal simples, sem data, dentro de Mente).
   Sem julgamento de desempenho: o score só reflete SE você escreveu, não O QUE. */

const { PROGRESS_DEFS } = require('./_progressDefs');
const { ymdLocal } = require('../dateutil');

// dias consecutivos terminando hoje (ou ontem, carência do dia) com v>=1
function streakDe(pts, todayStr) {
  if (!Array.isArray(pts) || !pts.length) return 0;
  const ok = new Set(pts.filter(p => Number(p.v) >= 1).map(p => p.d));
  const DIA = 86400000;
  const hoje = new Date(todayStr + 'T00:00:00');
  let cursor = new Date(hoje);
  if (!ok.has(todayStr)) cursor = new Date(hoje.getTime() - DIA);
  let n = 0;
  while (ok.has(ymdLocal(cursor))) { n++; cursor = new Date(cursor.getTime() - DIA); }
  return n;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.diario) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const todayStr = ymdLocal();

  const capitulos = Array.isArray(areaData.capitulos) ? [...areaData.capitulos].sort((a, b) => a.ordem - b.ordem) : [];
  const aventuras = Array.isArray(areaData.aventuras) ? areaData.aventuras : [];
  const entradas = Array.isArray(areaData.entradas) ? areaData.entradas : [];

  const escreveuHoje = Number(campos.escritaHoje) >= 1;
  const streak = streakDe(historico.escritaHoje, todayStr);
  const score = Math.max(0, Math.min(100, (escreveuHoje ? 70 : 40) + Math.min(30, streak * 3)));

  const resumo = [
    { label: 'Capítulos', valor: String(capitulos.length) },
    { label: 'Entradas', valor: String(entradas.length) },
    { label: 'Sequência', valor: streak > 0 ? `${streak}d 🔥` : '—' },
  ];

  const metas = [
    { id: 'escrever-hoje', texto: 'Escrever no diário hoje', feito: escreveuHoje, auto: true },
  ];

  return {
    id: 'diario',
    nome: 'Diário',
    icone: '📔',
    cor: '#a855f7',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      capitulos,
      aventuras,
      entradas,
      streak,
      camposEditaveis: [],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.diario };
