'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { acordouCedo, aguaL, metaAgua, produtividadeH, metaProdutividade, celularH } = campos || {};

  // acordou cedo (30%) — antes das 7h = 100, antes 8h = 70, depois = 30
  let cedoPct = 50;
  if (typeof acordouCedo === 'number') {
    cedoPct = acordouCedo <= 6 ? 100 : acordouCedo <= 7 ? 85 : acordouCedo <= 8 ? 60 : 30;
  } else if (acordouCedo === true) cedoPct = 90;
  else if (acordouCedo === false) cedoPct = 20;

  // hidratação (35%)
  let aguaPct = 50;
  if (typeof metaAgua === 'number' && metaAgua > 0 && typeof aguaL === 'number') {
    aguaPct = Math.min(100, Math.round((aguaL / metaAgua) * 100));
  } else if (typeof aguaL === 'number') {
    aguaPct = aguaL >= 2.5 ? 100 : aguaL >= 2 ? 80 : aguaL >= 1.5 ? 60 : 30;
  }

  // tempo em tela (celular) — invertido (35%)
  let celularPct = 50;
  if (typeof celularH === 'number') {
    celularPct = celularH <= 1 ? 100 : celularH <= 2 ? 80 : celularH <= 3 ? 50 : celularH <= 5 ? 20 : 0;
  }

  return Math.max(0, Math.min(100, Math.round(cedoPct * 0.3 + aguaPct * 0.35 + celularPct * 0.35))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.rotina) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const resumo = [
    {
      label: 'Acordou',
      valor: typeof campos.acordouCedo === 'number' ? `${campos.acordouCedo}h` : (campos.acordouCedo ? 'cedo' : '—'),
    },
    {
      label: 'Água',
      valor: campos.aguaL != null ? `${campos.aguaL}L` : '—',
      delta: campos.metaAgua != null ? `meta: ${campos.metaAgua}L` : null,
    },
    {
      label: 'Celular',
      valor: campos.celularH != null ? `${campos.celularH}h` : '—',
    },
  ];

  const metas = [
    {
      id: 'acordar-cedo',
      texto: 'Acordar antes das 7h',
      feito: typeof campos.acordouCedo === 'number'
        ? campos.acordouCedo <= 7
        : !!campos.acordouCedo,
      auto: true,
    },
    {
      id: 'beber-agua-meta',
      texto: `Beber ${campos.metaAgua || 2}L de água`,
      feito: typeof campos.aguaL === 'number' && campos.aguaL >= (campos.metaAgua || 2),
      auto: true,
      atual: campos.aguaL,
      alvo: campos.metaAgua || 2,
    },
    {
      id: 'limitar-celular',
      texto: 'Celular < 2h',
      feito: typeof campos.celularH === 'number' && campos.celularH < 2,
      auto: true,
      atual: campos.celularH,
      alvo: 2,
    },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'rotina',
    nome: 'Rotina & Energia',
    icone: '⚡',
    cor: '#f97316',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      camposEditaveis: [
        { id: 'acordouCedo',      label: 'Hora que acordou',   tipo: 'number', unidade: 'h',  historico: false },
        { id: 'aguaL',            label: 'Água bebida',        tipo: 'number', unidade: 'L',  historico: true },
        { id: 'metaAgua',         label: 'Meta de água',       tipo: 'number', unidade: 'L',  historico: false },
        { id: 'celularH',         label: 'Celular (horas)',    tipo: 'number', unidade: 'h',  historico: true },
        { id: 'produtividadeH',   label: 'Horas produtivas',   tipo: 'number', unidade: 'h',  historico: true },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.rotina };
