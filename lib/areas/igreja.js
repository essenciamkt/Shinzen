'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { missasSemanais, missaMeta, oracao, biblia, voluntariado } = campos || {};

  // missas (40%)
  let missaPct = 50;
  if (typeof missaMeta === 'number' && missaMeta > 0 && typeof missasSemanais === 'number') {
    missaPct = Math.min(100, Math.round((missasSemanais / missaMeta) * 100));
  }

  // oração diária (30%) — 1 = sim, 0 = não
  const oracaoPct = oracao ? 100 : (oracao === false ? 0 : 50);

  // bíblia ou voluntariado (30%)
  let extraPct = 50;
  const extras = [biblia, voluntariado].filter(v => v === true).length;
  const extrasDef = [biblia, voluntariado].filter(v => v != null).length;
  if (extrasDef > 0) extraPct = Math.round((extras / extrasDef) * 100);

  return Math.max(0, Math.min(100, Math.round(missaPct * 0.4 + oracaoPct * 0.3 + extraPct * 0.3))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.igreja) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const resumo = [
    {
      label: 'Missas/sem',
      valor: campos.missasSemanais != null ? `${campos.missasSemanais}/${campos.missaMeta || 1}` : '—',
    },
    {
      label: 'Oração hoje',
      valor: campos.oracao === true ? '✓' : campos.oracao === false ? '✗' : '—',
    },
    {
      label: 'Bíblia hoje',
      valor: campos.biblia === true ? '✓' : campos.biblia === false ? '✗' : '—',
    },
  ];

  const metas = [
    {
      id: 'ir-missa-meta',
      texto: `Ir à missa ${campos.missaMeta || 1}x na semana`,
      feito: typeof campos.missasSemanais === 'number' && typeof campos.missaMeta === 'number'
        && campos.missasSemanais >= campos.missaMeta,
      auto: true,
      atual: campos.missasSemanais,
      alvo: campos.missaMeta,
    },
    {
      id: 'oracao-diaria',
      texto: 'Oração diária',
      feito: !!campos.oracao,
      auto: true,
    },
    {
      id: 'ler-biblia',
      texto: 'Ler a Bíblia hoje',
      feito: !!campos.biblia,
      auto: true,
    },
    {
      id: 'voluntariado',
      texto: 'Voluntariado / serviço',
      feito: !!campos.voluntariado,
      auto: true,
    },
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
      camposEditaveis: [
        { id: 'missasSemanais', label: 'Missas esta sem.',    tipo: 'number',  unidade: 'x',  historico: false },
        { id: 'missaMeta',      label: 'Meta missas/sem',     tipo: 'number',  unidade: 'x',  historico: false },
        { id: 'oracao',         label: 'Oração hoje (1=sim)', tipo: 'number',  unidade: '',   historico: false },
        { id: 'biblia',         label: 'Bíblia hoje (1=sim)', tipo: 'number',  unidade: '',   historico: false },
        { id: 'voluntariado',   label: 'Voluntariado (1=sim)',tipo: 'number',  unidade: '',   historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.igreja };
