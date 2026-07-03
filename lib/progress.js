'use strict';

/* Motor de progresso por área — compartilhado por todas as áreas.

   Lê uma definição declarativa (def = { badges, missoes }) + os dados
   persistidos da área (areaData.progresso) e produz o objeto `progress`
   uniforme injetado em cada AreaObject.

   NÃO escreve no disco. Quando uma badge é batida pela primeira vez,
   reporta em `newlyUnlocked` para o payload persistir via unlockBadge.

   Mecânicas:
   - Streak: dias consecutivos com check-in (não quebra no mesmo dia).
   - Badges: marcos desbloqueáveis (sticky — uma vez batidos não somem).
   - Missões: tarefas dia/semana, derivadas do estado ou marcadas manual.
*/

const { ymdLocal: ymd } = require('./dateutil');

const DIA_MS = 86400000;

// Streak terminando em hoje. Não quebra se ainda não fez check-in hoje
// (conta a partir de ontem). Quebra se passou mais de 1 dia sem check-in.
function calcStreak(checkins, todayStr) {
  if (!checkins || !checkins.length) return { atual: 0, ativoHoje: false };
  const set = new Set(checkins);
  const ativoHoje = set.has(todayStr);

  // Ponto de partida: hoje (se fez) ou ontem (carência do dia corrente).
  const today = new Date(todayStr + 'T00:00:00');
  let cursor = new Date(today);
  if (!ativoHoje) cursor = new Date(today.getTime() - DIA_MS);

  let atual = 0;
  while (set.has(ymd(cursor))) {
    atual++;
    cursor = new Date(cursor.getTime() - DIA_MS);
  }
  return { atual, ativoHoje };
}

// Conta dias únicos com registro em qualquer série do histórico.
function diasComHistorico(historico) {
  const dias = new Set();
  for (const arr of Object.values(historico || {})) {
    if (Array.isArray(arr)) arr.forEach(p => { if (p && p.d) dias.add(p.d); });
  }
  return dias;
}

// Período corrente de uma data: 'dia' = "YYYY-MM-DD"; 'semana' = "YYYY-Www".
function periodoChave(periodo, dateStr) {
  if (periodo === 'semana') {
    const d = new Date(dateStr + 'T00:00:00');
    // ISO week (segunda = início).
    const tmp = new Date(d);
    const day = (tmp.getDay() + 6) % 7;
    tmp.setDate(tmp.getDate() - day + 3);
    const firstThursday = new Date(tmp.getFullYear(), 0, 4);
    const week = 1 + Math.round(
      ((tmp - firstThursday) / DIA_MS - 3 + ((firstThursday.getDay() + 6) % 7)) / 7
    );
    return `${tmp.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return dateStr; // dia
}

function buildProgress(areaId, def, areaData, todayStr) {
  def = def || {};
  const prog = (areaData && areaData.progresso) || {};
  const campos = (areaData && areaData.campos) || {};
  const historico = (areaData && areaData.historico) || {};
  const metasManual = (areaData && areaData.metasManual) || {};
  const checkins = Array.isArray(prog.checkins) ? prog.checkins : [];
  const badgesUnlocked = Array.isArray(prog.badgesUnlocked) ? prog.badgesUnlocked : [];
  const missoesLog = prog.missoesLog || {};
  const goals = Array.isArray(areaData && areaData.goals) ? areaData.goals : [];
  const livros = Array.isArray(areaData && areaData.livros) ? areaData.livros : [];
  const skills = Array.isArray(areaData && areaData.skills) ? areaData.skills : [];

  const { atual: streakAtual, ativoHoje } = calcStreak(checkins, todayStr);
  const recorde = Math.max(prog.recordeStreak || 0, streakAtual);
  const streak = { atual: streakAtual, recorde, ativoHoje };

  const ctx = { campos, historico, metasManual, streak, checkins, todayStr, goals, livros, skills };

  // ── Badges (sticky) ──
  const newlyUnlocked = [];
  const badges = (def.badges || []).map(b => {
    let conquistadaAgora = false;
    try { conquistadaAgora = !!(b.check && b.check(ctx)); } catch { conquistadaAgora = false; }
    const jaDesbloqueada = badgesUnlocked.includes(b.id);
    const conquistada = jaDesbloqueada || conquistadaAgora;
    if (conquistadaAgora && !jaDesbloqueada) newlyUnlocked.push(b.id);

    let progresso = null;
    if (!conquistada && typeof b.meta === 'number' && b.atualFn) {
      let atual = 0;
      try { atual = Number(b.atualFn(ctx)) || 0; } catch { atual = 0; }
      progresso = { atual, meta: b.meta };
    }
    return { id: b.id, nome: b.nome, icone: b.icone, desc: b.desc || '', conquistada, progresso };
  });

  // ── Missões (dia/semana) ──
  const missoes = (def.missoes || []).map(m => {
    const periodo = m.periodo === 'semana' ? 'semana' : 'dia';
    const chaveAtual = periodoChave(periodo, todayStr);

    // Concluída automaticamente pelo estado?
    let feitaAuto = false;
    if (m.check) { try { feitaAuto = !!m.check(ctx); } catch { feitaAuto = false; } }

    // Marcada manual neste período?
    const logged = missoesLog[m.id];
    const feitaManual = logged != null && periodoChave(periodo, logged) === chaveAtual;

    let progresso = null;
    if (typeof m.meta === 'number' && m.atualFn) {
      let atual = 0;
      try { atual = Number(m.atualFn(ctx)) || 0; } catch { atual = 0; }
      progresso = { atual, meta: m.meta };
    }

    return {
      id: m.id, nome: m.nome, icone: m.icone || '◆',
      periodo, xp: m.xp || 1,
      manual: !m.check,                 // sem check = só toggle manual
      feita: feitaAuto || feitaManual,
      progresso,
    };
  });

  // ── Contribuição pro XP global ──
  const deBadges = badges.filter(b => b.conquistada).length * 2;
  const deStreak = Math.min(30, streakAtual);
  const deMissoes = missoes.filter(m => m.feita).length;

  return {
    progress: {
      streak,
      checkin: { feitoHoje: ativoHoje, totalDias: checkins.length },
      badges,
      missoes,
      resumoXp: { deStreak, deBadges, deMissoes },
    },
    newlyUnlocked,
  };
}

module.exports = { buildProgress, calcStreak, diasComHistorico, periodoChave };
