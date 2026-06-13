'use strict';

/* Dobra os FileSummary (de parse.js) em totais globais e por projeto.

   Saída:
   {
     totals: {
       projects: number,       // dirs com ≥1 sessão
       sessions: number,       // arquivos .jsonl únicos
       activeDays: number,
       currentStreak: number,
       longestStreak: number,
       subagentsUsed: number,  // total de eventos subagente únicos por tipo (soma)
       messagesAssistant: number,
     },
     activityDays:  [{ date:"YYYY-MM-DD", count:number, sessions:number }],  // 84 dias
     activityWeeks: [{ weekStart:"YYYY-MM-DD", count:number, sessions:number }], // 12 semanas
     agentTypes: { [type]: number },       // total por tipo
     models:     { [model]: { input, output, cacheWrite5m, cacheWrite1h, cacheRead } },
     projects: [
       {
         dir:        string,
         name:       string,   // derivado do cwd (último componente) ou dir
         cwd:        string|null,
         gitBranch:  string|null,
         sessions:   number,
         firstSeen:  string|null,  // ISO date
         lastSeen:   string|null,
         status:     "active"|"recente"|"inativo",
         agentTypes: { [type]: number },
         subagents:  number,
         models:     string[],
       }
     ],
   }
*/

// Retorna "YYYY-MM-DD" em horário local para um timestamp ms
function toLocalDate(tsMs) {
  if (!tsMs) return null;
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Adiciona N dias a uma string YYYY-MM-DD (sem TZ shift)
function addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d + n);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

// Diferença em dias entre duas strings YYYY-MM-DD
function daysDiff(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = new Date(ay, am - 1, ad);
  const db = new Date(by, bm - 1, bd);
  return Math.round((da - db) / 86400000);
}

// Nome amigável a partir do cwd (último segmento não-vazio)
function cwdToName(cwd) {
  if (!cwd) return null;
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

// Status por recência: active (<7d), recente (<30d), inativo
function projectStatus(lastSeenDate, todayDate) {
  if (!lastSeenDate) return 'inativo';
  const diff = daysDiff(todayDate, lastSeenDate);
  if (diff <= 7) return 'active';
  if (diff <= 30) return 'recente';
  return 'inativo';
}

function aggregate(summaries, { today } = {}) {
  const todayDate = today || toLocalDate(Date.now());

  // ---- por projeto ----
  const projectMap = new Map(); // dir → acumulador

  // ---- globais ----
  const activityMap = new Map(); // "YYYY-MM-DD" → { count:events, sessions:files }
  const globalAgentTypes = {};
  const globalModels = {};
  let totalAssistant = 0;
  let totalSubagentEvents = 0;

  for (const s of summaries) {
    if (!s) continue;

    // datas de eventos desta sessão (para heatmap)
    const firstDate = toLocalDate(s.firstTs);
    const lastDate = toLocalDate(s.lastTs);

    // Para o heatmap contamos events (assistantCount) no dia do último evento
    // (proxy razoável: a sessão "acontece" no dia que foi ativa)
    // Usamos lastTs como âncora de data
    const evDate = lastDate || firstDate;
    if (evDate) {
      const slot = activityMap.get(evDate) || { count: 0, sessions: 0 };
      slot.count += s.assistantCount;
      slot.sessions += 1;
      activityMap.set(evDate, slot);
    }

    totalAssistant += s.assistantCount;

    // agentTypes globais
    for (const t of s.agentTypes) {
      globalAgentTypes[t] = (globalAgentTypes[t] || 0) + 1;
      totalSubagentEvents++;
    }

    // tokens por modelo (globais)
    for (const [model, tok] of Object.entries(s.tokensByModel)) {
      if (!globalModels[model]) {
        globalModels[model] = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
      }
      const g = globalModels[model];
      g.input += tok.input;
      g.output += tok.output;
      g.cacheWrite5m += tok.cacheWrite5m;
      g.cacheWrite1h += tok.cacheWrite1h;
      g.cacheRead += tok.cacheRead;
    }

    // acumular por projeto (dir)
    const dir = s._dir || 'unknown'; // injetado por quem chama aggregate
    if (!projectMap.has(dir)) {
      projectMap.set(dir, {
        dir,
        cwd: s.cwd || null,
        gitBranch: s.gitBranch || null,
        sessions: 0,
        firstTs: Infinity,
        lastTs: -Infinity,
        agentTypes: {},
        subagents: 0,
        modelSet: new Set(),
      });
    }
    const proj = projectMap.get(dir);
    proj.sessions++;
    if (s.firstTs && s.firstTs < proj.firstTs) proj.firstTs = s.firstTs;
    if (s.lastTs && s.lastTs > proj.lastTs) proj.lastTs = s.lastTs;
    for (const t of s.agentTypes) {
      proj.agentTypes[t] = (proj.agentTypes[t] || 0) + 1;
      proj.subagents++;
    }
    for (const m of s.models) proj.modelSet.add(m);
    // cwd mais recente vence (sessões mais novas têm cwd correto)
    if (s.lastTs && s.lastTs >= proj.lastTs && s.cwd) proj.cwd = s.cwd;
  }

  // ---- activityDays: 84 dias até hoje ----
  const activityDays = [];
  for (let i = 83; i >= 0; i--) {
    const date = addDays(todayDate, -i);
    const slot = activityMap.get(date) || { count: 0, sessions: 0 };
    activityDays.push({ date, count: slot.count, sessions: slot.sessions });
  }

  // ---- activityWeeks: 12 semanas (cada semana = 7 dias, último bloco = hoje) ----
  // Alinha ao mesmo boundary do preview: semanas terminam hoje
  const activityWeeks = [];
  for (let w = 11; w >= 0; w--) {
    const weekEnd = addDays(todayDate, -w * 7);
    const weekStart = addDays(weekEnd, -6);
    let count = 0;
    let sessions = 0;
    for (let d = 0; d <= 6; d++) {
      const date = addDays(weekStart, d);
      const slot = activityMap.get(date);
      if (slot) { count += slot.count; sessions += slot.sessions; }
    }
    activityWeeks.push({ weekStart, count, sessions });
  }

  // ---- streak: usar activityDays (dias locais) ----
  const activeDaySet = new Set(activityDays.filter(d => d.count > 0).map(d => d.date));
  const activeDays = activeDaySet.size;

  // currentStreak: contando regressivamente a partir de hoje
  let currentStreak = 0;
  {
    let d = todayDate;
    while (activeDaySet.has(d)) {
      currentStreak++;
      d = addDays(d, -1);
    }
    // se hoje não tem atividade, testa ontem (streak ainda pode estar vivo)
    if (currentStreak === 0) {
      let d2 = addDays(todayDate, -1);
      while (activeDaySet.has(d2)) {
        currentStreak++;
        d2 = addDays(d2, -1);
      }
    }
  }

  // longestStreak: varrer activityDays em ordem
  let longestStreak = 0;
  {
    let run = 0;
    let prev = null;
    for (const { date, count } of activityDays) {
      if (count > 0) {
        if (prev && daysDiff(date, prev) === 1) {
          run++;
        } else {
          run = 1;
        }
        if (run > longestStreak) longestStreak = run;
        prev = date;
      } else {
        prev = null;
      }
    }
  }

  // sessionsByDay por projeto: últimos 14 dias
  const fourteenDaysAgo = addDays(todayDate, -13);
  const last14 = [];
  for (let i = 0; i < 14; i++) last14.push(addDays(fourteenDaysAgo, i));

  // Mapa dir → date → sessions count
  const projSessionsByDay = new Map();
  for (const s of summaries) {
    if (!s || !s._dir) continue;
    const d = toLocalDate(s.lastTs || s.firstTs);
    if (!d || d < fourteenDaysAgo) continue;
    if (!projSessionsByDay.has(s._dir)) projSessionsByDay.set(s._dir, {});
    const m = projSessionsByDay.get(s._dir);
    m[d] = (m[d] || 0) + 1;
  }

  // ---- projetos finais ----
  const projects = [];
  for (const proj of projectMap.values()) {
    const firstSeen = toLocalDate(proj.firstTs === Infinity ? null : proj.firstTs);
    const lastSeen = toLocalDate(proj.lastTs === -Infinity ? null : proj.lastTs);
    const sbd = projSessionsByDay.get(proj.dir) || {};
    const sessionsByDay = {};
    for (const d of last14) sessionsByDay[d] = sbd[d] || 0;
    projects.push({
      dir: proj.dir,
      name: cwdToName(proj.cwd) || proj.dir,
      cwd: proj.cwd,
      gitBranch: proj.gitBranch,
      sessions: proj.sessions,
      firstSeen,
      lastSeen,
      status: projectStatus(lastSeen, todayDate),
      agentTypes: proj.agentTypes,
      subagents: proj.subagents,
      models: [...proj.modelSet],
      sessionsByDay,
    });
  }
  // ordenar por lastSeen desc
  projects.sort((a, b) => {
    if (!a.lastSeen) return 1;
    if (!b.lastSeen) return -1;
    return a.lastSeen < b.lastSeen ? 1 : -1;
  });

  // ---- métricas derivadas para achievements ----
  const maxSessionsInDay = activityDays.reduce((m, d) => Math.max(m, d.sessions), 0);

  // cacheReadRatio: leituras / (leituras + inputs) globalmente
  let totalInput = 0, totalCacheRead = 0;
  for (const tok of Object.values(globalModels)) {
    totalInput += tok.input;
    totalCacheRead += tok.cacheRead;
  }
  const cacheReadRatio = (totalInput + totalCacheRead) > 0
    ? totalCacheRead / (totalInput + totalCacheRead)
    : 0;

  return {
    totals: {
      projects: projectMap.size,
      sessions: summaries.length,
      activeDays,
      currentStreak,
      longestStreak,
      subagentsUsed: totalSubagentEvents,
      messagesAssistant: totalAssistant,
      maxSessionsInDay,
      cacheReadRatio: Math.round(cacheReadRatio * 1000) / 1000,
    },
    activityDays,
    activityWeeks,
    agentTypes: globalAgentTypes,
    models: globalModels,
    projects,
  };
}

module.exports = { aggregate, toLocalDate, addDays };
