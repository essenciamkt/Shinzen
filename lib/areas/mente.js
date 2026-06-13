'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { humor, meditacao, gratidao, journalHoje, ansiedade } = campos || {};

  // humor subjetivo 1-10 (40%)
  let humorPct = 50;
  if (typeof humor === 'number' && humor >= 1 && humor <= 10) {
    humorPct = Math.round(humor * 10);
  }

  // práticas de mente (30%) — meditação + gratidão + journal
  const praticas = [meditacao, gratidao, journalHoje].filter(v => v === true).length;
  const praticasDef = [meditacao, gratidao, journalHoje].filter(v => v != null).length;
  const praticasPct = praticasDef > 0 ? Math.round((praticas / praticasDef) * 100) : 50;

  // ansiedade invertida 1-10 (30%) — 10 = muito ansioso = ruim
  let ansiedadePct = 50;
  if (typeof ansiedade === 'number' && ansiedade >= 1 && ansiedade <= 10) {
    ansiedadePct = Math.round((1 - (ansiedade - 1) / 9) * 100);
  }

  return Math.max(0, Math.min(100, Math.round(humorPct * 0.4 + praticasPct * 0.3 + ansiedadePct * 0.3))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.mente) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const resumo = [
    {
      label: 'Humor',
      valor: campos.humor != null ? `${campos.humor}/10` : '—',
    },
    {
      label: 'Meditação',
      valor: campos.meditacao === true ? '✓' : campos.meditacao === false ? '✗' : '—',
    },
    {
      label: 'Ansiedade',
      valor: campos.ansiedade != null ? `${campos.ansiedade}/10` : '—',
    },
  ];

  const metas = [
    {
      id: 'meditar-hoje',
      texto: 'Meditar hoje',
      feito: !!campos.meditacao,
      auto: true,
    },
    {
      id: 'gratidao-hoje',
      texto: 'Escrever 3 gratidões',
      feito: !!campos.gratidao,
      auto: true,
    },
    {
      id: 'journal-hoje',
      texto: 'Escrever no journal',
      feito: !!campos.journalHoje,
      auto: true,
    },
    {
      id: 'humor-bom',
      texto: 'Humor ≥ 7',
      feito: typeof campos.humor === 'number' && campos.humor >= 7,
      auto: true,
      atual: campos.humor,
      alvo: 7,
    },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'mente',
    nome: 'Mente & Hábitos',
    icone: '🧠',
    cor: '#ec4899',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      camposEditaveis: [
        { id: 'humor',       label: 'Humor hoje (1-10)', tipo: 'number', unidade: '/10', historico: true },
        { id: 'ansiedade',   label: 'Ansiedade (1-10)',  tipo: 'number', unidade: '/10', historico: true },
        { id: 'meditacao',   label: 'Meditação (1=sim)', tipo: 'number', unidade: '',    historico: false },
        { id: 'gratidao',    label: 'Gratidão (1=sim)',  tipo: 'number', unidade: '',    historico: false },
        { id: 'journalHoje', label: 'Journal (1=sim)',   tipo: 'number', unidade: '',    historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.mente };
