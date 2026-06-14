'use strict';

const { PROGRESS_DEFS } = require('./_progressDefs');
const { seedMetasGoals } = require('../datastore');

const PORQUE_DEFAULT = 'Eu vou virar um homem de respeito, sair de casa, conquistar tudo e encontrar a Sofia. Não é sonho — é prazo.';
const TRACKS = ['jornada', 'renda', 'patrimonio', 'corpo', 'idioma'];

const clamp = (n) => Math.max(0, Math.min(100, n));

function diasAte(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const alvo = new Date(dataStr + 'T00:00:00');
  if (isNaN(alvo)) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

function build({ data, config }) {
  const areaData = (data && data.areas && data.areas.metas) || {};
  const campos = areaData.campos || {};
  const metasTexto = areaData.metasTexto || {};
  const progresso = areaData.progresso || {};
  const missoesLog = progresso.missoesLog || {};

  let goals = Array.isArray(areaData.goals) ? areaData.goals : [];
  if (!goals.length) { try { goals = seedMetasGoals(); } catch { goals = []; } }

  // ── Ponte de caixa (só leitura): MRR real de Finanças (estado de HOJE) ──
  const fin = (data && data.areas && data.areas.financas) || {};
  const mrr = Number((fin.campos || {}).receitaRecorrente) || 0;
  const despesas = Number((fin.campos || {}).despesasMes) || 0;
  const mrrAlvo = (config && config.meta && config.meta.mrrAlvo != null) ? Number(config.meta.mrrAlvo) : 5000;
  const mrrPct = mrrAlvo > 0 ? clamp((mrr / mrrAlvo) * 100) : 0;
  const economias = Number(campos.economiasPorsche) || 0;

  // ── Enriquecer cada meta: countdown da data fixa + pct de progresso real ──
  function enrich(g) {
    const dias = diasAte(g.prazo);
    const missoes = Array.isArray(g.missoes) ? g.missoes : [];
    const misTotal = missoes.length;
    const misFeitas = missoes.filter(m => m.feito).length;
    // barra: progresso das missões quando existem; senão progresso financeiro
    let pct = null;
    if (misTotal > 0) pct = Math.round((misFeitas / misTotal) * 100);
    else if (g.fonteRitmo === 'savings') pct = g.custo > 0 ? Math.round(clamp((economias / g.custo) * 100)) : null;
    else if (g.fonteRitmo === 'mrr') pct = g.custo > 0 ? Math.round(clamp((mrr / g.custo) * 100)) : null;
    let atingido = !!g.feito;
    if (!atingido && misTotal > 0 && misFeitas === misTotal) atingido = true;
    if (!atingido && g.track === 'renda' && g.custo > 0 && mrr >= g.custo) atingido = true;
    if (!atingido && g.fonteRitmo === 'savings' && g.custo > 0 && economias >= g.custo) atingido = true;
    return { ...g, missoes, misTotal, misFeitas, diasPrazo: dias, pct, atingido };
  }
  const ricos = goals.map(enrich);

  // ── Agrupa por track (mantém ordem por data dentro de cada um) ──
  const byTrack = {};
  for (const t of TRACKS) byTrack[t] = [];
  for (const g of ricos) (byTrack[g.track] || (byTrack[g.track] = [])).push(g);
  for (const t of Object.keys(byTrack)) {
    byTrack[t].sort((a, b) => ((a.prazo || '9999') < (b.prazo || '9999') ? -1 : 1));
  }

  const estrela = ricos.find(g => g.estrela) || byTrack.jornada[byTrack.jornada.length - 1] || ricos[0] || null;
  const feitos = ricos.filter(g => g.atingido).length;
  const total = ricos.length;
  const jornada = byTrack.jornada;
  const jornadaFeitos = jornada.filter(g => g.atingido).length;
  const heroPct = jornada.length ? Math.round((jornadaFeitos / jornada.length) * 100) : 0;

  // próximo marco (qualquer track) não atingido, com data mais próxima
  const proximoMarco = ricos.filter(g => !g.atingido && g.diasPrazo != null).sort((a, b) => a.diasPrazo - b.diasPrazo)[0] || null;

  // ── Score honesto: motor (mrr) + execução (marcos batidos) + jornada ──
  const feitosPct = total > 0 ? (feitos / total) * 100 : 0;
  const score = Math.round(clamp(mrrPct * 0.4 + feitosPct * 0.4 + heroPct * 0.2)) || 0;

  const resumo = [
    { label: 'Renda recorr.', valor: `R$${mrr.toLocaleString('pt-BR')}`, delta: `meta R$${mrrAlvo.toLocaleString('pt-BR')}` },
    { label: 'Marcos', valor: total > 0 ? `${feitos}/${total}` : '—' },
    { label: 'Sofia', valor: (estrela && estrela.diasPrazo != null) ? `${estrela.diasPrazo}d` : '—', delta: 'o sonho nº1' },
  ];

  // metas[] (compat genérico) — só a jornada, marcável
  const metas = jornada.map(g => ({ id: g.id, texto: `${g.emoji || '🎯'} ${g.titulo}`, feito: !!g.atingido, auto: false }));

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
      goals: ricos,
      tracks: byTrack,
      estrela, heroPct,
      proximoMarco,
      feitos, total,
      mrr, mrrAlvo, mrrPct: Math.round(mrrPct),
      cobreDespesa: despesas > 0 ? mrr >= despesas : null,
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
