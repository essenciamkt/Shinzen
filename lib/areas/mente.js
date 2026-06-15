'use strict';

/* Área "Mente & Hábitos" — UM trabalho: regulação emocional sob pressão
   (veredito Sócio). NÃO é habit-builder genérico. O valor não é logar
   ansiedade 1-10 (diário-vaidade) — é VIRAR ação: ansiedade≥7 dispara o
   reset de 2min. "& Hábitos" = hábitos mentais (gratidão/journal/respirei).
   Distinta das irmãs: Mente = o regulador que te mantém funcional quando aperta.
   Enquadre = ferramenta de ALÍVIO, não prova de desempenho.

   score:
   - 50% ansiedade invertida (1=calmo=100, 10=0)
   - 30% humor (humor*10)
   - 20% hábitos mentais (gratidão + journal de hoje)
*/

const { PROGRESS_DEFS } = require('./_progressDefs');

// dias consecutivos terminando hoje (ou ontem) com a condição fn(v) — igual irmãs
function streakDe(pts, todayStr, fn) {
  if (!Array.isArray(pts) || !pts.length) return 0;
  const ok = new Set(pts.filter(p => fn(Number(p.v))).map(p => p.d));
  const DIA = 86400000;
  const hoje = new Date(todayStr + 'T00:00:00');
  let cursor = new Date(hoje);
  if (!ok.has(todayStr)) cursor = new Date(hoje.getTime() - DIA);
  let n = 0;
  while (ok.has(cursor.toISOString().slice(0, 10))) { n++; cursor = new Date(cursor.getTime() - DIA); }
  return n;
}

function calcScore(campos) {
  const { humor, ansiedade } = campos || {};

  let ansiedadePct = 50;
  if (typeof ansiedade === 'number' && ansiedade >= 1 && ansiedade <= 10) {
    ansiedadePct = Math.round((1 - (ansiedade - 1) / 9) * 100);
  }
  let humorPct = 50;
  if (typeof humor === 'number' && humor >= 1 && humor <= 10) {
    humorPct = Math.round(humor * 10);
  }
  // hábitos mentais (gratidão + journal de hoje)
  const habs = ['gratidaoHoje', 'journalHoje'];
  const def = habs.filter(h => campos[h] != null);
  let habPct = 50;
  if (def.length) habPct = Math.round((habs.filter(h => Number(campos[h]) >= 1).length / habs.length) * 100);

  return Math.max(0, Math.min(100, Math.round(ansiedadePct * 0.5 + humorPct * 0.3 + habPct * 0.2))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.mente) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};
  const todayStr = new Date().toISOString().slice(0, 10);

  const score = calcScore(campos);

  // ── Regulação ──
  const ansiedade = typeof campos.ansiedade === 'number' ? campos.ansiedade : null;
  const humor = typeof campos.humor === 'number' ? campos.humor : null;
  const regulacao = {
    ansiedade, humor,
    calmaScore: score,
    precisaReset: ansiedade != null && ansiedade >= 7,
    fezResetHoje: Number(campos.fezReset) >= 1,
    diasCalmosStreak: streakDe(historico.ansiedade, todayStr, v => v >= 1 && v <= 4),
  };

  // ── Hábitos mentais (chips) ──
  const HAB = [
    { id: 'gratidaoHoje', label: 'Gratidão', icone: '🙏' },
    { id: 'journalHoje',  label: 'Journal',  icone: '📓' },
    { id: 'fezReset',     label: 'Pausei e respirei', icone: '🌬️' },
  ];
  const habitos = HAB.map(h => ({
    ...h,
    hoje: Number(campos[h.id]) >= 1,
    streak: streakDe(historico[h.id], todayStr, v => v >= 1),
  }));

  // ── Listas ──
  const gratidoes = Array.isArray(areaData.gratidoes) ? areaData.gratidoes : [];
  const journal = Array.isArray(areaData.journal) ? areaData.journal : [];
  const capsula = Array.isArray(areaData.capsula) ? areaData.capsula : [];

  // Cápsula ressurge só em ansiedade alta. Índice estável (dia do mês % len) — sem Math.random.
  let capsulaAtiva = null;
  if (ansiedade != null && ansiedade >= 8 && capsula.length) {
    const dia = new Date(todayStr + 'T00:00:00').getDate();
    capsulaAtiva = capsula[dia % capsula.length];
  }

  // ── Placa de gratidão (volume acumulado) ──
  const gratTotal = gratidoes.length;
  const TIERS = [10, 50, 100, 365];
  const NOMES = { 10: 'Grato', 50: 'Coração Cheio', 100: 'Abundância', 365: 'Um Ano de Graças' };
  const placas = TIERS.map(t => ({ alvo: t, nome: NOMES[t], destravada: gratTotal >= t }));
  const proximaPlaca = placas.find(p => !p.destravada) || null;

  const resumo = [
    { label: 'Calma', valor: ansiedade != null ? `${10 - ansiedade}/10` : '—', delta: regulacao.precisaReset ? 'respire' : null },
    { label: 'Humor', valor: humor != null ? `${humor}/10` : '—' },
    { label: 'Gratidões', valor: String(gratTotal) },
  ];

  const metas = [
    { id: 'calma-hoje', texto: 'Manter ansiedade sob controle (≤4)', feito: ansiedade != null && ansiedade <= 4, auto: true, atual: ansiedade, alvo: 4 },
    { id: 'gratidao-hoje', texto: 'Praticar gratidão hoje', feito: Number(campos.gratidaoHoje) >= 1, auto: true },
    { id: 'journal-hoje', texto: 'Escrever no journal hoje', feito: Number(campos.journalHoje) >= 1, auto: true },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'mente',
    nome: 'Mente & Hábitos',
    icone: '🧠',
    cor: '#ec4899',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      regulacao,
      habitos,
      gratidoes: { itens: gratidoes, total: gratTotal, placas, proximaPlaca },
      journal,
      capsula,
      capsulaAtiva,
      camposEditaveis: [
        { id: 'ansiedade', label: 'Ansiedade hoje (1-10)', tipo: 'number', unidade: '/10', historico: true },
        { id: 'humor',     label: 'Humor hoje (1-10)',     tipo: 'number', unidade: '/10', historico: true },
      ],
      registros: [
        { id: 'ansiedade', label: 'Ansiedade', unidade: '/10', cor: '#ef4444' },
        { id: 'humor',     label: 'Humor',     unidade: '/10', cor: '#22c55e' },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.mente };
