'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { horasLazer, metaLazer, leituraMin, aprendizadoHoje } = campos || {};

  // horas de lazer por semana (40%)
  let lazerPct = 50;
  if (typeof metaLazer === 'number' && metaLazer > 0 && typeof horasLazer === 'number') {
    lazerPct = Math.min(100, Math.round((horasLazer / metaLazer) * 100));
  }

  // leitura (30%) — minutos por dia, meta 20min
  let leituraPct = 50;
  if (typeof leituraMin === 'number') {
    leituraPct = leituraMin >= 30 ? 100 : leituraMin >= 20 ? 80 : leituraMin >= 10 ? 50 : 20;
  }

  // aprendizado de algo novo hoje (30%)
  let aprPct = 50;
  if (aprendizadoHoje === true) aprPct = 100;
  else if (aprendizadoHoje === false) aprPct = 0;

  return Math.max(0, Math.min(100, Math.round(lazerPct * 0.4 + leituraPct * 0.3 + aprPct * 0.3))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.lazer) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const resumo = [
    {
      label: 'Lazer/sem',
      valor: campos.horasLazer != null ? `${campos.horasLazer}h` : '—',
      delta: campos.metaLazer != null ? `meta: ${campos.metaLazer}h` : null,
    },
    {
      label: 'Leitura',
      valor: campos.leituraMin != null ? `${campos.leituraMin}min` : '—',
    },
    {
      label: 'Aprendeu hoje',
      valor: campos.aprendizadoHoje === true ? '✓' : campos.aprendizadoHoje === false ? '✗' : '—',
    },
  ];

  const metas = [
    {
      id: 'lazer-meta-semanal',
      texto: `${campos.metaLazer || 5}h de lazer na semana`,
      feito: typeof campos.horasLazer === 'number' && typeof campos.metaLazer === 'number'
        && campos.horasLazer >= campos.metaLazer,
      auto: true,
      atual: campos.horasLazer,
      alvo: campos.metaLazer,
    },
    {
      id: 'ler-hoje',
      texto: 'Ler 20min hoje',
      feito: typeof campos.leituraMin === 'number' && campos.leituraMin >= 20,
      auto: true,
      atual: campos.leituraMin,
      alvo: 20,
    },
    {
      id: 'aprender-algo-novo',
      texto: 'Aprender algo novo hoje',
      feito: !!campos.aprendizadoHoje,
      auto: true,
    },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'lazer',
    nome: 'Lazer & Crescimento',
    icone: '🌱',
    cor: '#06b6d4',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      camposEditaveis: [
        { id: 'horasLazer',       label: 'Horas lazer/sem',    tipo: 'number', unidade: 'h',   historico: true },
        { id: 'metaLazer',        label: 'Meta lazer/sem',     tipo: 'number', unidade: 'h',   historico: false },
        { id: 'leituraMin',       label: 'Leitura hoje (min)', tipo: 'number', unidade: 'min', historico: true },
        { id: 'aprendizadoHoje',  label: 'Aprendizado (1=sim)',tipo: 'number', unidade: '',    historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.lazer };
