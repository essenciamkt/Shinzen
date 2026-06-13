'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');
const { seedMetasGoals } = require('../datastore');

const PORQUE_DEFAULT = 'Eu vou pra Utah ver a Sofia ainda em 2026. Vou tirar minha família do aperto. Não é sonho — é prazo.';

const clamp = (n) => Math.max(0, Math.min(100, n));

// dias até uma data 'YYYY-MM-DD' (null se inválida). Server-side, sem helper do client.
function diasAte(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const alvo = new Date(dataStr + 'T00:00:00');
  if (isNaN(alvo)) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

// Ritmo mensal a partir de um histórico [{d,v}] — delta do 1º ao último ponto por mês.
// null se < 2 pontos de data distinta (ritmo insuficiente → ETA honesto sem data).
function ritmoMensal(hist) {
  if (!Array.isArray(hist)) return null;
  const pts = hist.filter(p => p && typeof p.d === 'string' && typeof p.v === 'number');
  if (pts.length < 2) return null;
  const sorted = [...pts].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const a = sorted[0], b = sorted[sorted.length - 1];
  const days = (new Date(b.d + 'T00:00:00') - new Date(a.d + 'T00:00:00')) / 86400000;
  if (days <= 0) return null;
  return ((b.v - a.v) / days) * 30;
}

function build({ data, config }) {
  const areaData = (data && data.areas && data.areas.metas) || {};
  const campos = areaData.campos || {};
  const metasTexto = areaData.metasTexto || {};
  const progresso = areaData.progresso || {};
  const missoesLog = progresso.missoesLog || {};

  // Goals ricos (já seedados em disco pelo datastore; fallback em memória por segurança).
  let goals = Array.isArray(areaData.goals) ? areaData.goals : [];
  if (!goals.length) { try { goals = seedMetasGoals(areaData); } catch { goals = []; } }

  // ── Ponte de caixa (só leitura): MRR real vem de Finanças ──
  const fin = (data && data.areas && data.areas.financas) || {};
  const mrr = Number((fin.campos || {}).receitaRecorrente) || 0;
  const despesas = Number((fin.campos || {}).despesasMes) || 0;
  const mrrAlvo = (config && config.meta && config.meta.mrrAlvo != null) ? Number(config.meta.mrrAlvo) : 5000;
  const mrrPct = mrrAlvo > 0 ? clamp((mrr / mrrAlvo) * 100) : 0;
  const ritmoMrr = ritmoMensal((fin.historico || {}).receitaRecorrente);
  const mrrGrowthEta = (ritmoMrr && ritmoMrr > 0 && mrr < mrrAlvo) ? (mrrAlvo - mrr) / ritmoMrr : null;

  // ritmo de poupança (marco Porsche)
  const economias = Number(campos.economiasPorsche) || 0;
  const metaPorsche = Number(campos.metaPorsche) || 350000;
  const ritmoSav = ritmoMensal((areaData.historico || {}).economiasPorsche);

  // ── Enriquecer cada sonho com pct + ETA honesto ──
  function enrich(g) {
    let pct = null, eta = null, atual = null, alvo = null;
    if (g.fonteRitmo === 'savings') {
      alvo = Number(g.custo) || metaPorsche;
      atual = economias;
      pct = alvo > 0 ? clamp((atual / alvo) * 100) : 0;
      const falta = Math.max(0, alvo - atual);
      eta = (ritmoSav && ritmoSav > 0) ? falta / ritmoSav : null;
    } else if (g.fonteRitmo === 'mrr') {
      pct = mrrPct; // progresso do motor recorrente
      eta = (mrr > 0 && Number(g.custo) > 0) ? Number(g.custo) / mrr : null;
    } else {
      pct = g.feito ? 100 : 0;
    }
    if (g.feito) pct = 100;
    return {
      ...g,
      pct: pct == null ? null : Math.round(pct),
      atual, alvo,
      etaMeses: eta == null ? null : Math.max(1, Math.ceil(eta)),
      temRitmo: eta != null,
      diasPrazo: diasAte(g.prazo),
    };
  }

  const goalsRicos = goals.map(enrich);
  const estrela = goalsRicos.find(g => g.estrela) || goalsRicos[0] || null;
  const feitos = goalsRicos.filter(g => g.feito).length;
  const total = goalsRicos.length;

  // próximo marco não-feito com prazo mais próximo (pra strip da bússola)
  const comPrazo = goalsRicos.filter(g => !g.feito && g.diasPrazo != null).sort((a, b) => a.diasPrazo - b.diasPrazo);
  const proximoMarco = comPrazo[0] || goalsRicos.find(g => !g.feito) || null;

  // ── Reframe do Porsche: custo de oportunidade (não cofrinho) ──
  const porscheReframe = {
    metaPorsche, economias,
    mesesMrr: mrrAlvo > 0 ? Math.round(metaPorsche / mrrAlvo) : null, // R$350k = N meses do MRR-alvo
    ratioVsSofia: Math.round(metaPorsche / 12000), // o carro custa N× a viagem pra Sofia
    etaSavingsMeses: (ritmoSav && ritmoSav > 0) ? Math.ceil(Math.max(0, metaPorsche - economias) / ritmoSav) : null,
    pct: metaPorsche > 0 ? Math.round(clamp((economias / metaPorsche) * 100)) : 0,
  };

  // ── Score honesto (sem base 30, sem % de checkbox): motor + sonhos + constância ──
  const feitosPct = total > 0 ? (feitos / total) * 100 : 0;
  const streakPct = clamp(((progresso.recordeStreak || 0) / 30) * 100);
  const score = Math.round(clamp(mrrPct * 0.6 + feitosPct * 0.25 + streakPct * 0.15)) || 0;

  const resumo = [
    {
      label: 'Renda recorr.',
      valor: `R$${mrr.toLocaleString('pt-BR')}`,
      delta: `meta R$${mrrAlvo.toLocaleString('pt-BR')}`,
    },
    {
      label: 'Sonhos',
      valor: total > 0 ? `${feitos}/${total}` : '—',
    },
    {
      label: estrela ? estrela.titulo.split(',')[0].split(' ').slice(-1)[0] || 'Sofia' : 'Sofia',
      valor: (estrela && estrela.diasPrazo != null) ? `${estrela.diasPrazo}d` : '—',
      delta: 'pro sonho nº1',
    },
  ];

  // metas[] (compat com a lista genérica): cada sonho vira uma meta marcável
  const metas = goalsRicos.map(g => ({
    id: g.id,
    texto: `${g.emoji || '🎯'} ${g.titulo}`,
    feito: !!g.feito,
    auto: g.fonteRitmo != null, // sonhos ligados a dado são automáticos
    atual: g.atual,
    alvo: g.alvo,
  }));

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
      goals: goalsRicos,
      estrela,
      proximoMarco,
      mrr, mrrAlvo, mrrPct: Math.round(mrrPct),
      mrrGrowthEtaMeses: mrrGrowthEta == null ? null : Math.ceil(mrrGrowthEta),
      ritmoMrr,
      cobreDespesa: despesas > 0 ? mrr >= despesas : null,
      despesas,
      porscheReframe,
      passoSemana: metasTexto['passo-semana'] || '',
      passoFeito: !!missoesLog['passo-semana'],
      porqueRaiz: metasTexto['porqueRaiz'] || PORQUE_DEFAULT,
      camposEditaveis: [
        { id: 'economiasPorsche', label: 'Guardado p/ Porsche', tipo: 'number', unidade: 'R$', historico: true },
        { id: 'metaPorsche', label: 'Preço alvo Porsche', tipo: 'number', unidade: 'R$', historico: false },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.metas };
