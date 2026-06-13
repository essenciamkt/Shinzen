'use strict';

/* Avalia os objetivos (goals) contra os agregados + skills.
   Marcos `auto:true` têm predicado avaliado aqui.
   Marcos `auto:false` vêm do config (estado manual, boolean).

   Saída:
   {
     goals: [
       {
         id, titulo, icone,
         marcos: [{ texto, feito, auto }],
         total, done, percent,
       }
     ],
     overallPercent,
   }
*/

// Predicados para marcos automáticos (id do marco → função)
const AUTO_CHECKS = {
  'instalar-3-skills':       (agg, skills) => skills.counts.installed >= 3,
  'conectar-mcp':            (_, skills) => skills.connectedMcp.length >= 1,
  'usar-subagente':          (agg) => agg.totals.subagentsUsed >= 1,
  'criar-hook':              (_, skills) => skills.hooks.length >= 1,
  'sequencia-7-dias':        (agg) => agg.totals.longestStreak >= 7,
  'conectar-gdrive':         (_, skills) => skills.connectedMcp.some(m => m.server === 'Google_Drive'),
  'conectar-meta':           (_, skills) => skills.connectedMcp.some(m => m.server === 'Faceboook'),
  'conectar-canva':          (_, skills) => skills.connectedMcp.some(m => m.server === 'Canva'),
  'iniciar-projeto':         (agg) => agg.totals.projects >= 1,
};

/* Avalia um único marco. configDone = boolean do config (para `auto:false`). */
function checkMarco(marco, configDone, agg, skills) {
  if (!marco.auto) return configDone === true;
  const fn = AUTO_CHECKS[marco.id];
  if (!fn) return configDone === true; // id desconhecido → manual
  return fn(agg, skills);
}

/* goals = array de definições do config (seeds default ou customizados).
   configDoneMap = { marcoId: boolean } (estado manual salvo no config). */
function build(goals, configDoneMap, agg, skills) {
  const evaluated = goals.map(goal => {
    const marcos = (goal.marcos || []).map(marco => {
      const feito = checkMarco(marco, configDoneMap[marco.id], agg, skills);
      return { ...marco, feito };
    });
    const total = marcos.length;
    const done = marcos.filter(m => m.feito).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { ...goal, marcos, total, done, percent };
  });

  const totalMarcos = evaluated.reduce((s, g) => s + g.total, 0);
  const totalDone = evaluated.reduce((s, g) => s + g.done, 0);
  const overallPercent = totalMarcos > 0 ? Math.round((totalDone / totalMarcos) * 100) : 0;

  return { goals: evaluated, overallPercent };
}

module.exports = { build, AUTO_CHECKS };
