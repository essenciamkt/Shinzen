'use strict';

/* Área "Saúde" — dados manuais.
   Serve de modelo paras outras áreas manuais.

   score:
   - 40%: atingiu meta de treinos na semana
   - 30%: peso dentro de 5% do alvo (ou null = neutro 50)
   - 30%: sono >= 7h (ou null = neutro 50)
*/

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { peso, pesoAlvo, sonoH, treinosSemana, treinosMeta } = campos || {};

  // treinos (40%)
  let treino = 50;
  if (typeof treinosMeta === 'number' && treinosMeta > 0 && typeof treinosSemana === 'number') {
    treino = Math.min(100, Math.round((treinosSemana / treinosMeta) * 100));
  }

  // peso (30%)
  let pesoPct = 50;
  if (typeof peso === 'number' && typeof pesoAlvo === 'number' && pesoAlvo > 0) {
    const diff = Math.abs(peso - pesoAlvo) / pesoAlvo;
    pesoPct = Math.max(0, Math.round((1 - diff / 0.1) * 100)); // 10% de margem = 0
    pesoPct = Math.min(100, pesoPct);
  }

  // sono (30%)
  let sonoPct = 50;
  if (typeof sonoH === 'number') {
    sonoPct = sonoH >= 8 ? 100 : sonoH >= 7 ? 80 : sonoH >= 6 ? 50 : sonoH >= 5 ? 20 : 0;
  }

  return Math.max(0, Math.min(100, Math.round(treino * 0.4 + pesoPct * 0.3 + sonoPct * 0.3))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.saude) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const resumo = [
    {
      label: 'Peso',
      valor: campos.peso != null ? `${campos.peso} kg` : '—',
      delta: campos.pesoAlvo != null && campos.peso != null
        ? `alvo: ${campos.pesoAlvo} kg`
        : null,
    },
    {
      label: 'Sono',
      valor: campos.sonoH != null ? `${campos.sonoH}h` : '—',
    },
    {
      label: 'Treinos/sem',
      valor: `${campos.treinosSemana || 0}/${campos.treinosMeta || 3}`,
    },
  ];

  const metas = [
    {
      id: 'treinar-meta-semana',
      texto: `Treinar ${campos.treinosMeta || 3}x por semana`,
      feito: (campos.treinosSemana || 0) >= (campos.treinosMeta || 3),
      auto: true,
      atual: campos.treinosSemana || 0,
      alvo: campos.treinosMeta || 3,
    },
    {
      id: 'dormir-bem',
      texto: 'Dormir 7h ou mais',
      feito: typeof campos.sonoH === 'number' && campos.sonoH >= 7,
      auto: true,
      atual: campos.sonoH,
      alvo: 7,
    },
    {
      id: 'atingir-peso-alvo',
      texto: campos.pesoAlvo != null ? `Atingir peso alvo (${campos.pesoAlvo} kg)` : 'Definir peso alvo',
      feito: campos.pesoAlvo != null && campos.peso != null
        && Math.abs(campos.peso - campos.pesoAlvo) / campos.pesoAlvo <= 0.02,
      auto: true,
      atual: campos.peso,
      alvo: campos.pesoAlvo,
    },
    // metas manuais extras vindas de metasManual
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id,
      texto: metasTexto[id] || id.replace(/-/g, ' '),
      feito: !!feito,
      auto: false,
    })),
  ];

  return {
    id: 'saude',
    nome: 'Saúde',
    icone: '💪',
    cor: '#22c55e',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      camposEditaveis: [
        { id: 'peso',          label: 'Peso atual',       tipo: 'number', unidade: 'kg',   historico: true },
        { id: 'pesoAlvo',      label: 'Peso alvo',        tipo: 'number', unidade: 'kg',   historico: false },
        { id: 'sonoH',         label: 'Sono (h)',         tipo: 'number', unidade: 'h',    historico: true },
        { id: 'aguaL',         label: 'Água',             tipo: 'number', unidade: 'L',    historico: true },
        { id: 'calorias',      label: 'Calorias',         tipo: 'number', unidade: 'kcal', historico: true },
        { id: 'treinosSemana', label: 'Treinos esta sem.', tipo: 'number', unidade: 'x',  historico: false },
        { id: 'treinosMeta',   label: 'Meta treinos/sem', tipo: 'number', unidade: 'x',   historico: false },
      ],
      treinos: areaData.treinos || [],
      // séries que ganham mini-gráfico no cockpit (ordem de exibição)
      registros: [
        { id: 'aguaL',    label: 'Água',     unidade: 'L',    cor: '#38bdf8' },
        { id: 'calorias', label: 'Calorias', unidade: 'kcal', cor: '#f59e0b' },
        { id: 'sonoH',    label: 'Sono',     unidade: 'h',    cor: '#a855f7' },
        { id: 'peso',     label: 'Peso',     unidade: 'kg',   cor: '#22c55e' },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.saude };
