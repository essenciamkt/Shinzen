'use strict';

/* Score geral da vida + nível/XP global.

   score geral = média ponderada dos scores das áreas.
   XP global   = contribuições de cada área:
     - claude-code: xp do nível (já calculado em achievements)
     - demais: 1 XP por meta batida + 1 XP por registro no histórico (últimos 30d)
   Nível: mesma fórmula de achievements (200 XP/nível).
*/

const { levelInfo } = require('./achievements');

function build(areas, data, claudeXp) {
  const pesos = (data && data.pesos) || {};

  let totalPeso = 0;
  let scorePonderado = 0;
  const porArea = [];

  for (const area of areas) {
    const peso = typeof pesos[area.id] === 'number' ? pesos[area.id] : 1;
    const s = Number.isFinite(area.score) ? area.score : 0;
    scorePonderado += s * peso;
    totalPeso += peso;
    porArea.push({ id: area.id, score: s, peso });
  }

  const overall = totalPeso > 0 ? Math.round(scorePonderado / totalPeso) : 0;

  // XP global = claude + contribuição de progresso de cada área
  //   (badges sticky + dias de streak + missões concluídas).
  let xp = claudeXp || 0;
  for (const area of areas) {
    if (area.id === 'claude-code') continue;
    const r = area.progress && area.progress.resumoXp;
    if (r) {
      xp += (r.deBadges || 0) + (r.deStreak || 0) + (r.deMissoes || 0);
    } else {
      // fallback (área sem motor de progresso): 1 XP por meta batida
      xp += (area.metas || []).filter(m => m.feito).length;
    }
  }

  const nivel = levelInfo(xp);

  return { overall, porArea, ...nivel };
}

module.exports = { build };
