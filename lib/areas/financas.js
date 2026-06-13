'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

function calcScore(campos) {
  const { receitaMes, metaReceita, despesasMes, reservaEmergencia, reservaMeta, dividas } = campos || {};

  // receita vs meta (40%)
  let receitaPct = 50;
  if (typeof metaReceita === 'number' && metaReceita > 0 && typeof receitaMes === 'number') {
    receitaPct = Math.min(100, Math.round((receitaMes / metaReceita) * 100));
  }

  // margem (receita - despesas) (35%)
  let margemPct = 50;
  if (typeof receitaMes === 'number' && receitaMes > 0 && typeof despesasMes === 'number') {
    const margem = (receitaMes - despesasMes) / receitaMes;
    margemPct = Math.max(0, Math.min(100, Math.round(margem * 200))); // 50% margem = 100
  }

  // reserva de emergência (25%)
  let reservaPct = 50;
  if (typeof reservaMeta === 'number' && reservaMeta > 0 && typeof reservaEmergencia === 'number') {
    reservaPct = Math.min(100, Math.round((reservaEmergencia / reservaMeta) * 100));
  } else if (dividas != null) {
    reservaPct = dividas > 0 ? 20 : 70;
  }

  return Math.max(0, Math.min(100, Math.round(receitaPct * 0.4 + margemPct * 0.35 + reservaPct * 0.25))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.financas) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};

  const score = calcScore(campos);

  const lucro = (typeof campos.receitaMes === 'number' && typeof campos.despesasMes === 'number')
    ? campos.receitaMes - campos.despesasMes
    : null;

  const resumo = [
    {
      label: 'Receita/mês',
      valor: campos.receitaMes != null ? `R$${campos.receitaMes.toLocaleString('pt-BR')}` : '—',
      delta: campos.metaReceita != null ? `meta: R$${campos.metaReceita.toLocaleString('pt-BR')}` : null,
    },
    {
      label: 'Lucro',
      valor: lucro != null ? `R$${lucro.toLocaleString('pt-BR')}` : '—',
    },
    {
      label: 'Reserva',
      valor: campos.reservaEmergencia != null ? `R$${campos.reservaEmergencia.toLocaleString('pt-BR')}` : '—',
    },
  ];

  const metas = [
    {
      id: 'bater-meta-receita',
      texto: `Bater meta de receita (R$${(campos.metaReceita||1000).toLocaleString('pt-BR')})`,
      feito: typeof campos.receitaMes === 'number' && typeof campos.metaReceita === 'number'
        && campos.receitaMes >= campos.metaReceita,
      auto: true,
      atual: campos.receitaMes,
      alvo: campos.metaReceita,
    },
    {
      id: 'reserva-emergencia',
      texto: `Reserva de emergência (R$${(campos.reservaMeta||5000).toLocaleString('pt-BR')})`,
      feito: typeof campos.reservaEmergencia === 'number' && typeof campos.reservaMeta === 'number'
        && campos.reservaEmergencia >= campos.reservaMeta,
      auto: true,
      atual: campos.reservaEmergencia,
      alvo: campos.reservaMeta,
    },
    {
      id: 'zerar-dividas',
      texto: 'Zerar dívidas',
      feito: typeof campos.dividas === 'number' && campos.dividas <= 0,
      auto: true,
      atual: campos.dividas,
      alvo: 0,
    },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'financas',
    nome: 'Finanças',
    icone: '💰',
    cor: '#f59e0b',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      camposEditaveis: [
        { id: 'receitaMes',        label: 'Receita este mês',   tipo: 'number', unidade: 'R$',  historico: true },
        { id: 'metaReceita',       label: 'Meta de receita',    tipo: 'number', unidade: 'R$',  historico: false },
        { id: 'despesasMes',       label: 'Despesas este mês',  tipo: 'number', unidade: 'R$',  historico: true },
        { id: 'reservaEmergencia', label: 'Reserva emerg.',     tipo: 'number', unidade: 'R$',  historico: true },
        { id: 'reservaMeta',       label: 'Meta reserva',       tipo: 'number', unidade: 'R$',  historico: false },
        { id: 'dividas',           label: 'Dívidas',            tipo: 'number', unidade: 'R$',  historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.financas };
