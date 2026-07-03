'use strict';

const { ymdLocal } = require('./dateutil');

/* Tendências semana-a-semana (WoW) e métricas de concentração/streak.

   Inputs:
   - activityWeeks: array[12] de { weekStart, count, sessions }
   - costWeekly:    array[12] de { weekStart, usd, brl }
   - summaries:     array de FileSummary (com _dir, lastTs)
   - agg:           objeto agregado (totals.currentStreak, activityDays)
*/

function wowDelta(thisWeek, lastWeek) {
  const delta = thisWeek - lastWeek;
  const pct = lastWeek > 0 ? Math.round((delta / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return { thisWeek, lastWeek, delta, pct, dir };
}

function build(activityWeeks, costWeekly, summaries, agg) {
  // WoW sessions (activityWeeks.sessions)
  const wLen = activityWeeks.length;
  const thisSessions = wLen >= 1 ? (activityWeeks[wLen - 1].sessions || 0) : 0;
  const lastSessions = wLen >= 2 ? (activityWeeks[wLen - 2].sessions || 0) : 0;

  // WoW cost
  const cLen = costWeekly.length;
  const thisCostUsd = cLen >= 1 ? (costWeekly[cLen - 1].usd || 0) : 0;
  const lastCostUsd = cLen >= 2 ? (costWeekly[cLen - 2].usd || 0) : 0;

  // WoW subagents: conta subagentes das sessões na última semana vs semana anterior
  const nowMs = Date.now();
  const oneWeekMs = 7 * 24 * 3600 * 1000;
  let thisSubagents = 0, lastSubagents = 0;
  for (const s of summaries) {
    if (!s.lastTs) continue;
    const age = nowMs - s.lastTs;
    const count = (s.agentTypes || []).length; // agentTypes é array de strings únicas por sessão
    if (age < oneWeekMs) thisSubagents += count;
    else if (age < 2 * oneWeekMs) lastSubagents += count;
  }

  // Concentration: projetos únicos nos últimos 7 dias
  const sevenDaysAgo = nowMs - oneWeekMs;
  const recentDirs = new Set();
  const dirCounts = {};
  for (const s of summaries) {
    if (s.lastTs && s.lastTs >= sevenDaysAgo && s._dir) {
      recentDirs.add(s._dir);
      dirCounts[s._dir] = (dirCounts[s._dir] || 0) + 1;
    }
  }
  const projectsLast7d = recentDirs.size;
  let topProject = null;
  let topCount = 0;
  for (const [dir, cnt] of Object.entries(dirCounts)) {
    if (cnt > topCount) { topCount = cnt; topProject = dir; }
  }
  // Score: 100 se 1 projeto, cai proporcionalmente
  const concentrationScore = projectsLast7d === 0 ? 0
    : projectsLast7d === 1 ? 100
    : Math.max(0, Math.round(100 / projectsLast7d));

  // Streak prediction
  const todayStr = ymdLocal();
  const actDays = agg.activityDays || [];
  const todayEntry = actDays.find(d => d.date === todayStr);
  const codedToday = todayEntry ? todayEntry.count > 0 : false;
  const currentStreak = agg.totals.currentStreak || 0;
  const projectedIfCodesToday = codedToday ? currentStreak : currentStreak + 1;

  return {
    wow: {
      sessions: wowDelta(thisSessions, lastSessions),
      cost:     wowDelta(Math.round(thisCostUsd * 100) / 100, Math.round(lastCostUsd * 100) / 100),
      subagents: wowDelta(thisSubagents, lastSubagents),
    },
    concentration: {
      score: concentrationScore,
      projectsLast7d,
      topProject,
    },
    streakPrediction: {
      current: currentStreak,
      projectedIfCodesToday,
      codedToday,
    },
  };
}

module.exports = { build };
