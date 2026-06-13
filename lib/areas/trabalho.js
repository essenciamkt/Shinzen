'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { clientesAtivos, metaClientes, tarefasSemana, tarefasConcluidas, satisfacao } = campos || {};

  // clientes vs meta (40%)
  let clientesPct = 50;
  if (typeof metaClientes === 'number' && metaClientes > 0 && typeof clientesAtivos === 'number') {
    clientesPct = Math.min(100, Math.round((clientesAtivos / metaClientes) * 100));
  }

  // tarefas concluídas (35%)
  let tarefasPct = 50;
  if (typeof tarefasSemana === 'number' && tarefasSemana > 0 && typeof tarefasConcluidas === 'number') {
    tarefasPct = Math.min(100, Math.round((tarefasConcluidas / tarefasSemana) * 100));
  }

  // satisfação subjetiva 1-10 (25%)
  let satPct = 50;
  if (typeof satisfacao === 'number' && satisfacao >= 1 && satisfacao <= 10) {
    satPct = Math.round(satisfacao * 10);
  }

  return Math.max(0, Math.min(100, Math.round(clientesPct * 0.4 + tarefasPct * 0.35 + satPct * 0.25))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.trabalho) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const resumo = [
    {
      label: 'Clientes ativos',
      valor: campos.clientesAtivos != null ? String(campos.clientesAtivos) : '—',
      delta: campos.metaClientes != null ? `meta: ${campos.metaClientes}` : null,
    },
    {
      label: 'Tarefas/sem',
      valor: (typeof campos.tarefasConcluidas === 'number' && typeof campos.tarefasSemana === 'number')
        ? `${campos.tarefasConcluidas}/${campos.tarefasSemana}`
        : '—',
    },
    {
      label: 'Satisfação',
      valor: campos.satisfacao != null ? `${campos.satisfacao}/10` : '—',
    },
  ];

  const metas = [
    {
      id: 'bater-meta-clientes',
      texto: `Atingir ${campos.metaClientes || 3} clientes ativos`,
      feito: typeof campos.clientesAtivos === 'number' && typeof campos.metaClientes === 'number'
        && campos.clientesAtivos >= campos.metaClientes,
      auto: true,
      atual: campos.clientesAtivos,
      alvo: campos.metaClientes,
    },
    {
      id: 'concluir-tarefas-semana',
      texto: `Concluir tarefas da semana`,
      feito: typeof campos.tarefasConcluidas === 'number' && typeof campos.tarefasSemana === 'number'
        && campos.tarefasConcluidas >= campos.tarefasSemana,
      auto: true,
      atual: campos.tarefasConcluidas,
      alvo: campos.tarefasSemana,
    },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'trabalho',
    nome: 'Trabalho',
    icone: '💼',
    cor: '#3b82f6',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      camposEditaveis: [
        { id: 'clientesAtivos',    label: 'Clientes ativos',     tipo: 'number', unidade: '',   historico: true },
        { id: 'metaClientes',      label: 'Meta clientes',       tipo: 'number', unidade: '',   historico: false },
        { id: 'tarefasSemana',     label: 'Tarefas esta sem.',   tipo: 'number', unidade: '',   historico: false },
        { id: 'tarefasConcluidas', label: 'Concluídas',          tipo: 'number', unidade: '',   historico: false },
        { id: 'satisfacao',        label: 'Satisfação (1-10)',   tipo: 'number', unidade: '/10', historico: true },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.trabalho };
