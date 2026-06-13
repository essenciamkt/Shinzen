'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');

const ESTAGIOS = ['lead', 'negociando', 'fechado', 'entregando', 'pago'];
const ATIVOS = ['negociando', 'fechado', 'entregando'];

function build({ data }) {
  const areaData = (data && data.areas && data.areas.trabalho) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};
  const clientes = Array.isArray(areaData.clientes) ? areaData.clientes : [];

  const metaClientes = (typeof campos.metaClientes === 'number') ? campos.metaClientes : 3;

  // ── Derivados do pipeline ──
  const porEstagio = {};
  for (const e of ESTAGIOS) porEstagio[e] = { count: 0, valor: 0 };
  for (const c of clientes) {
    const e = ESTAGIOS.includes(c.estagio) ? c.estagio : 'lead';
    porEstagio[e].count++;
    porEstagio[e].valor += Number(c.valor) || 0;
  }
  const funil = ESTAGIOS.map(e => ({ estagio: e, count: porEstagio[e].count, valor: porEstagio[e].valor }));

  const clientesAtivos = clientes.filter(c => ATIVOS.includes(c.estagio)).length;
  const fechados = porEstagio.fechado.count;
  const pagos = porEstagio.pago.count;
  const aReceber = porEstagio.fechado.valor + porEstagio.entregando.valor;
  const recebido = porEstagio.pago.valor;

  // Score: caixa-orientado. Clientes ativos vs meta (60%) + entrega/pago (40%).
  let score = 0;
  if (clientes.length) {
    const ativoPct = metaClientes > 0 ? Math.min(100, (clientesAtivos / metaClientes) * 100) : 0;
    const pagoPct = clientes.length > 0 ? (pagos / clientes.length) * 100 : 0;
    score = Math.round(ativoPct * 0.6 + pagoPct * 0.4);
  }
  score = Math.max(0, Math.min(100, score));

  const resumo = [
    {
      label: 'Clientes ativos',
      valor: String(clientesAtivos),
      delta: `meta: ${metaClientes}`,
    },
    {
      label: 'Fechados',
      valor: String(fechados + pagos),
      delta: pagos ? `${pagos} pagos` : null,
    },
    {
      label: 'A receber',
      valor: aReceber ? `R$${aReceber.toLocaleString('pt-BR')}` : '—',
    },
  ];

  const metas = [
    {
      id: 'bater-meta-clientes',
      texto: `Atingir ${metaClientes} clientes ativos`,
      feito: clientesAtivos >= metaClientes && metaClientes > 0,
      auto: true,
      atual: clientesAtivos,
      alvo: metaClientes,
    },
    {
      id: 'primeiro-pago',
      texto: 'Fechar o primeiro cliente pago',
      feito: pagos >= 1,
      auto: true,
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
      clientes,
      funil,
      pipeline: { clientesAtivos, fechados, pagos, aReceber, recebido, total: clientes.length },
      camposEditaveis: [
        { id: 'metaClientes', label: 'Meta de clientes', tipo: 'number', unidade: '', historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.trabalho, ESTAGIOS };
