'use strict';

/* Calcula conquistas e nível/XP com base nos agregados.
   Replica as 8 conquistas e a fórmula XP/nível do preview. */

const ACHIEVEMENTS_DEF = [
  {
    id: 'primeiro-projeto',
    titulo: 'Primeiro Projeto',
    icone: '📁',
    descricao: 'Iniciou seu primeiro projeto com o Claude.',
    check: (agg) => agg.totals.projects >= 1,
  },
  {
    id: 'conectado',
    titulo: 'Conectado',
    icone: '🔌',
    descricao: 'Conectou ao menos uma integração (MCP).',
    check: (agg, skills) => skills.connectedMcp.length >= 1,
  },
  {
    id: 'colecionador-skills',
    titulo: 'Colecionador de Skills',
    icone: '🧩',
    descricao: 'Instalou 3 ou mais skills.',
    check: (agg, skills) => skills.counts.installed >= 3,
    meta: 3,
    metaField: (agg, skills) => skills.counts.installed,
  },
  {
    id: 'explorador',
    titulo: 'Explorador',
    icone: '🔍',
    descricao: 'Usou o agente Explore para investigar o código.',
    check: (agg) => (agg.agentTypes['Explore'] || 0) >= 1,
  },
  {
    id: 'arquiteto',
    titulo: 'Arquiteto',
    icone: '📐',
    descricao: 'Usou o agente Plan para desenhar um plano.',
    check: (agg) => (agg.agentTypes['Plan'] || 0) >= 1,
  },
  {
    id: 'produtivo',
    titulo: 'Produtivo',
    icone: '⚡',
    descricao: 'Acumulou 25 sessões com o Claude.',
    check: (agg) => agg.totals.sessions >= 25,
    meta: 25,
    metaField: (agg) => agg.totals.sessions,
  },
  {
    id: 'maratonista',
    titulo: 'Maratonista',
    icone: '🔥',
    descricao: 'Manteve uma sequência de 7 dias seguidos.',
    check: (agg) => agg.totals.longestStreak >= 7,
    meta: 7,
    metaField: (agg) => agg.totals.longestStreak,
  },
  {
    id: 'multiprojetos',
    titulo: 'Multiprojetos',
    icone: '🗂️',
    descricao: 'Trabalhou em 3 projetos diferentes.',
    check: (agg) => agg.totals.projects >= 3,
    meta: 3,
    metaField: (agg) => agg.totals.projects,
  },
  // ---- 12 novas conquistas ----
  {
    id: 'economizador',
    titulo: 'Economizador',
    icone: '💰',
    descricao: 'Mais da metade dos seus tokens vieram do cache.',
    check: (agg) => (agg.totals.cacheReadRatio || 0) > 0.5,
  },
  {
    id: 'estudioso',
    titulo: 'Estudioso',
    icone: '📖',
    descricao: 'Usou o agente Plan 10 ou mais vezes.',
    check: (agg) => (agg.agentTypes['Plan'] || 0) >= 10,
    meta: 10,
    metaField: (agg) => agg.agentTypes['Plan'] || 0,
  },
  {
    id: 'mare-criatividade',
    titulo: 'Maré de Criatividade',
    icone: '🌊',
    descricao: 'Teve 3 ou mais sessões em um único dia.',
    check: (agg) => (agg.totals.maxSessionsInDay || 0) >= 3,
    meta: 3,
    metaField: (agg) => agg.totals.maxSessionsInDay || 0,
  },
  {
    id: 'foco-total',
    titulo: 'Foco Total',
    icone: '🎯',
    descricao: 'Manteve uma sequência de 14 dias seguidos.',
    check: (agg) => agg.totals.longestStreak >= 14,
    meta: 14,
    metaField: (agg) => agg.totals.longestStreak,
  },
  {
    id: 'construtor-dedicado',
    titulo: 'Construtor Dedicado',
    icone: '🏗️',
    descricao: 'Um projeto com 10 ou mais sessões.',
    check: (agg) => (agg.projects || []).some(p => p.sessions >= 10),
    meta: 10,
    metaField: (agg) => Math.max(0, ...(agg.projects || []).map(p => p.sessions)),
  },
  {
    id: 'conectado-mundo',
    titulo: 'Conectado ao Mundo',
    icone: '🌐',
    descricao: 'Conectou 3 ou mais integrações (MCPs).',
    check: (agg, skills) => skills.counts.connectedMcp >= 3,
    meta: 3,
    metaField: (agg, skills) => skills.counts.connectedMcp,
  },
  {
    id: 'velocista',
    titulo: 'Velocista',
    icone: '⚡',
    descricao: 'Teve 5 ou mais sessões em uma única semana.',
    check: (agg) => (agg.activityWeeks || []).some(w => w.sessions >= 5),
    meta: 5,
    metaField: (agg) => Math.max(0, ...(agg.activityWeeks || []).map(w => w.sessions)),
  },
  {
    id: 'explorador-profundo',
    titulo: 'Explorador Profundo',
    icone: '🧪',
    descricao: 'Usou o agente Explore 20 ou mais vezes.',
    check: (agg) => (agg.agentTypes['Explore'] || 0) >= 20,
    meta: 20,
    metaField: (agg) => agg.agentTypes['Explore'] || 0,
  },
  {
    id: 'orquestrador',
    titulo: 'Orquestrador',
    icone: '🤝',
    descricao: 'Usou 5 tipos de agentes diferentes.',
    check: (agg) => Object.keys(agg.agentTypes || {}).length >= 5,
    meta: 5,
    metaField: (agg) => Object.keys(agg.agentTypes || {}).length,
  },
  {
    id: 'centuriao',
    titulo: 'Centurião',
    icone: '💎',
    descricao: 'Completou 100 sessões com o Claude.',
    check: (agg) => agg.totals.sessions >= 100,
    meta: 100,
    metaField: (agg) => agg.totals.sessions,
  },
  {
    id: 'visionario',
    titulo: 'Visionário',
    icone: '🔮',
    descricao: 'Usou o agente Plan 20 ou mais vezes.',
    check: (agg) => (agg.agentTypes['Plan'] || 0) >= 20,
    meta: 20,
    metaField: (agg) => agg.agentTypes['Plan'] || 0,
  },
  {
    id: 'full-stack',
    titulo: 'Full Stack',
    icone: '📦',
    descricao: 'Iniciou 5 ou mais projetos.',
    check: (agg) => agg.totals.projects >= 5,
    meta: 5,
    metaField: (agg) => agg.totals.projects,
  },
];

/* Fórmula XP do preview:
   - 1 XP por sessão
   - 2 XP por conquista
   - 1 XP por dia ativo
   Nível: cada nível requer 200 XP. */
const XP_PER_LEVEL = 200;

function calcXP(agg, achievementList) {
  const fromSessions = agg.totals.sessions;
  const fromAchievements = achievementList.filter(a => a.conquistada).length * 2;
  const fromDays = agg.totals.activeDays;
  return { total: fromSessions + fromAchievements + fromDays, fromSessions, fromAchievements, fromDays };
}

const LEVEL_TITLES = ['', 'Iniciante', 'Explorador', 'Construtor', 'Arquiteto', 'Mestre', 'Lendário'];

function levelInfo(xp) {
  const level = Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const xpForNext = XP_PER_LEVEL;
  const progressPct = Math.round((xpIntoLevel / xpForNext) * 100);
  const title = LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)] || `Nível ${level}`;
  return { level, xp, xpIntoLevel, xpForNext, progressPct, title };
}

function build(agg, skills) {
  const achievements = ACHIEVEMENTS_DEF.map(def => {
    const conquistada = def.check(agg, skills);
    const entry = {
      id: def.id,
      titulo: def.titulo,
      icone: def.icone,
      descricao: def.descricao,
      conquistada,
    };
    // Para coach: progresso até a meta
    if (!conquistada && def.meta !== undefined) {
      const atual = def.metaField(agg, skills) || 0;
      entry._progress = { atual, meta: def.meta, restante: def.meta - atual };
    }
    return entry;
  });

  const xpBreakdown = calcXP(agg, achievements);
  const level = levelInfo(xpBreakdown.total);
  level.xpBreakdown = {
    fromSessions: xpBreakdown.fromSessions,
    fromAchievements: xpBreakdown.fromAchievements,
    fromDays: xpBreakdown.fromDays,
  };

  return { achievements, level };
}

module.exports = { build, ACHIEVEMENTS_DEF, levelInfo };
