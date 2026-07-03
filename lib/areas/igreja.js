'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');
const { ymdLocal } = require('../dateutil');

const FAC_DATA_PADRAO = '2026-07-02';

// dias consecutivos terminando hoje (ou ontem, carência do dia) com v>=1
function streakDe(pts, todayStr) {
  if (!Array.isArray(pts) || !pts.length) return 0;
  const ok = new Set(pts.filter(p => Number(p.v) >= 1).map(p => p.d));
  const DIA = 86400000;
  const hoje = new Date(todayStr + 'T00:00:00');
  let cursor = new Date(hoje);
  if (!ok.has(todayStr)) cursor = new Date(hoje.getTime() - DIA); // carência do dia corrente
  let n = 0;
  while (ok.has(ymdLocal(cursor))) { n++; cursor = new Date(cursor.getTime() - DIA); }
  return n;
}

// dias decorridos desde uma data 'YYYY-MM-DD' (null se inválida)
function diasDesde(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const d = new Date(dataStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje - d) / 86400000));
}
function diasAteData(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const d = new Date(dataStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((d - hoje) / 86400000);
}

function seedDevocoes() {
  return ['Terço / Rosário', 'Ângelus', 'Novena', 'Liturgia das Horas', 'Adoração ao Santíssimo']
    .map((nome, i) => ({ id: 'dev-seed-' + i, texto: nome, feito: false }));
}

function calcScore(campos, habitosStreak, confissaoDias) {
  const { missasSemanais, missaMeta } = campos || {};
  let missaPct = 50;
  if (typeof missaMeta === 'number' && missaMeta > 0 && typeof missasSemanais === 'number') {
    missaPct = Math.min(100, Math.round((missasSemanais / missaMeta) * 100));
  }
  // hábitos: média de "fez hoje" entre os 4
  const habs = ['oracao', 'biblia', 'terco', 'exame'];
  const def = habs.filter(h => campos[h] != null);
  let habPct = 50;
  if (def.length) habPct = Math.round((habs.filter(h => Number(campos[h]) >= 1).length / habs.length) * 100);
  // confissão: 100 se ≤30d, cai até 0 em 90d
  let confPct = 60;
  if (confissaoDias != null) confPct = confissaoDias <= 30 ? 100 : confissaoDias >= 90 ? 0 : Math.round(100 * (90 - confissaoDias) / 60);
  return Math.max(0, Math.min(100, Math.round(missaPct * 0.4 + habPct * 0.4 + confPct * 0.2))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.igreja) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto = areaData.metasTexto || {};
  const todayStr = ymdLocal();

  // ── Hábitos diários (1=fez) com streak ──
  const HAB = [
    { id: 'oracao', label: 'Oração', icone: '🙏' },
    { id: 'biblia', label: 'Bíblia', icone: '📖' },
    { id: 'terco', label: 'Terço', icone: '📿' },
    { id: 'exame', label: 'Exame', icone: '🕯️' },
  ];
  const habitos = HAB.map(h => ({
    ...h,
    hoje: Number(campos[h.id]) >= 1,
    streak: streakDe(historico[h.id], todayStr),
  }));

  // ── Vida sacramental ──
  const confissaoDias = diasDesde(campos.ultimaConfissao);
  const comunhaoDias = diasDesde(campos.ultimaComunhao);
  const sacramental = {
    confissaoData: campos.ultimaConfissao || null,
    comunhaoData: campos.ultimaComunhao || null,
    confissaoDias, comunhaoDias,
    confissaoAtrasada: confissaoDias != null && confissaoDias > 40,
  };

  // ── Retiro FAC ──
  const facData = campos.facData || FAC_DATA_PADRAO;
  const fac = { data: facData, dias: diasAteData(facData) };

  // ── Listas ──
  const intencoes = Array.isArray(areaData.intencoes) ? areaData.intencoes : [];
  let devocoes = Array.isArray(areaData.devocoes) ? areaData.devocoes : [];
  if (!devocoes.length) devocoes = seedDevocoes();
  const facPrep = Array.isArray(areaData.facPrep) ? areaData.facPrep : [];

  const score = calcScore(campos, habitos, confissaoDias);

  const resumo = [
    { label: 'Missas/sem', valor: campos.missasSemanais != null ? `${campos.missasSemanais}/${campos.missaMeta || 1}` : '—' },
    { label: 'Confissão', valor: confissaoDias != null ? `há ${confissaoDias}d` : '—', delta: sacramental.confissaoAtrasada ? 'confessar' : null },
    { label: 'Retiro FAC', valor: fac.dias != null ? (fac.dias < 0 ? 'passou' : `${fac.dias}d`) : '—', delta: 'coordenação' },
  ];

  const metas = [
    {
      id: 'ir-missa-meta',
      texto: `Ir à missa ${campos.missaMeta || 1}x na semana`,
      feito: typeof campos.missasSemanais === 'number' && typeof campos.missaMeta === 'number' && campos.missasSemanais >= campos.missaMeta,
      auto: true, atual: campos.missasSemanais, alvo: campos.missaMeta,
    },
    { id: 'oracao-diaria', texto: 'Oração diária', feito: Number(campos.oracao) >= 1, auto: true },
    { id: 'confissao-mes', texto: 'Confessar-se no mês', feito: confissaoDias != null && confissaoDias <= 30, auto: true },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'igreja',
    nome: 'Igreja & Fé',
    icone: '✝️',
    cor: '#eab308',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      habitos,
      sacramental,
      fac,
      facPrep,
      intencoes,
      devocoes,
      versiculo: metasTexto['versiculo'] || '',
      camposEditaveis: [
        { id: 'missasSemanais', label: 'Missas esta sem.', tipo: 'number', unidade: 'x', historico: false },
        { id: 'missaMeta',      label: 'Meta missas/sem',  tipo: 'number', unidade: 'x', historico: false },
        { id: 'oracao',         label: 'Oração hoje',      tipo: 'number', unidade: '',  historico: true },
        { id: 'biblia',         label: 'Bíblia hoje',      tipo: 'number', unidade: '',  historico: true },
        { id: 'terco',          label: 'Terço hoje',       tipo: 'number', unidade: '',  historico: true },
        { id: 'exame',          label: 'Exame hoje',       tipo: 'number', unidade: '',  historico: true },
        { id: 'voluntariado',   label: 'Voluntariado',     tipo: 'number', unidade: '',  historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.igreja };
