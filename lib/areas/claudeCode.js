'use strict';

/* Área "Claude Code" — dados 100% automáticos (lidos dos .jsonl).
   Embrulha o payload atual no shape uniforme de AreaObject.

   score = média ponderada de:
     - progressPct do nível atual (0-100)
     - overallPercent dos goals (0-100)
*/

function build({ agg, skills, cost, goalsResult, achievements, level, peakHours, trends, avgSessionsPerWeek, projectsArr }) {
  const t = agg.totals;

  // score: 60% progresso de nível + 40% goals
  const goalsPct = (goalsResult && goalsResult.overallPercent) || 0;
  const levelPct = (level && level.progressPct) || 0;
  const score = Math.round(levelPct * 0.6 + goalsPct * 0.4);

  const resumo = [
    { label: 'Sessões', valor: t.sessions },
    { label: 'Streak', valor: `${t.currentStreak}d` },
    { label: 'Nível', valor: `${level ? level.level : 1} — ${level ? level.title : ''}` },
    { label: 'Custo equiv.', valor: cost && cost.totals ? `R$ ${cost.totals.brl.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—' },
  ];

  // Crew: agentes criados (.md) + uso real (subagent_type nos .jsonl) + dormente.
  const usos = agg.agentTypes || {};
  const agentes = ((skills && skills.installed) || [])
    .filter(s => s.type === 'agent')
    .map(a => {
      const uso = usos[a.name] || usos[a.id] || 0;
      const nTools = a.tools ? a.tools.split(',').filter(t => t.trim()).length : 0;
      return { id: a.id, name: a.name, description: a.description, model: a.model || 'inherit', nTools, uso, dormente: uso === 0 };
    })
    .sort((x, y) => y.uso - x.uso);

  const metas = [];
  if (goalsResult && goalsResult.goals) {
    for (const g of goalsResult.goals) {
      for (const m of g.marcos) {
        metas.push({
          id: m.id,
          texto: m.texto,
          feito: m.feito,
          auto: m.auto,
          grupo: g.titulo,
        });
      }
    }
  }

  return {
    id: 'claude-code',
    nome: 'Claude Code',
    icone: '🤖',
    cor: '#6366f1',
    fonte: 'auto',
    score,
    resumo,
    metas,
    detalhe: {
      totals: t,
      level,
      achievements,
      goals: goalsResult,
      cost,
      peakHours,
      trends,
      avgSessionsPerWeek,
      agentTypes: agg.agentTypes,
      agentes,
      activityWeeks: agg.activityWeeks,
      activityDays: agg.activityDays,
      projects: projectsArr,
      skills,
    },
  };
}

module.exports = { build };
