'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function build({ data }) {
  const areaData = (data && data.areas && data.areas.metas) || {};
  const campos = areaData.campos || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  // score: % de metas manuais concluídas + progresso dos campos numéricos
  const todasMetas = Object.entries(metasManual);
  const concluidas = todasMetas.filter(([, v]) => !!v).length;
  const score = todasMetas.length > 0
    ? Math.max(0, Math.min(100, Math.round((concluidas / todasMetas.length) * 100))) || 0
    : 30; // sem metas definidas → score base baixo pra incentivar

  const resumo = [
    {
      label: 'Metas',
      valor: todasMetas.length > 0 ? `${concluidas}/${todasMetas.length}` : '—',
    },
    {
      label: 'Progresso',
      valor: todasMetas.length > 0 ? `${score}%` : '0%',
    },
    {
      label: 'Porsche',
      valor: campos.economiasPorsche != null ? `R$${Number(campos.economiasPorsche).toLocaleString('pt-BR')}` : '—',
      delta: campos.metaPorsche != null ? `meta: R$${Number(campos.metaPorsche).toLocaleString('pt-BR')}` : null,
    },
  ];

  const metas = [
    {
      id: 'comprar-porsche',
      texto: '🏎 Comprar o Porsche',
      feito: typeof campos.economiasPorsche === 'number' && typeof campos.metaPorsche === 'number'
        && campos.economiasPorsche >= campos.metaPorsche,
      auto: true,
      atual: campos.economiasPorsche,
      alvo: campos.metaPorsche,
    },
    {
      id: 'sofia',
      texto: '❤️ Ir até Sofia (EUA)',
      feito: !!metasManual['sofia'],
      auto: false,
    },
    {
      id: 'viajar-eua',
      texto: '✈️ Viajar para os EUA',
      feito: !!metasManual['viajar-eua'],
      auto: false,
    },
    {
      id: 'renda-5k-mes',
      texto: '💸 Renda recorrente de R$5.000/mês',
      feito: !!metasManual['renda-5k-mes'],
      auto: false,
    },
    {
      id: 'ingles-fluente',
      texto: '🗣 Inglês fluente',
      feito: !!metasManual['ingles-fluente'],
      auto: false,
    },
    ...Object.entries(metasManual)
      .filter(([id]) => !['sofia','viajar-eua','renda-5k-mes','ingles-fluente'].includes(id))
      .map(([id, feito]) => ({
        id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
      })),
  ];

  return {
    id: 'metas',
    nome: 'Metas & Sonhos',
    icone: '🎯',
    cor: '#a855f7',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico: areaData.historico || {},
      camposEditaveis: [
        { id: 'economiasPorsche', label: 'Economias Porsche', tipo: 'number', unidade: 'R$', historico: true },
        { id: 'metaPorsche',      label: 'Preço alvo Porsche', tipo: 'number', unidade: 'R$', historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.metas };
