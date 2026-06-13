'use strict';

/* Heurística "próximo passo" — sem LLM.
   Coleta gaps (conquistas não-ganhas, marcos não-cumpridos),
   pontua por proximidade (menor delta restante = maior prioridade),
   emite primary + ≤3 secundárias, cada uma com estimatedXp.

   Shape de uma sugestão:
   {
     titulo:      string,
     acao:        string,
     porque:      string,
     alvo:        { tipo: "achievement"|"goal"|"level", id: string },
     progress:    { atual: number, meta: number, restante: number } | null,
     estimatedXp: number,
   }
*/

function xpFor(tipo) {
  if (tipo === 'achievement') return 2;
  if (tipo === 'goal') return 1;
  return 0;
}

function build(achievements, goals, agg) {
  const candidates = [];

  // ---- gaps de conquistas ----
  for (const a of achievements) {
    if (a.conquistada) continue;
    const prog = a._progress || null;
    const restante = prog ? prog.restante : null;

    let acao, porque;

    switch (a.id) {
      case 'colecionador-skills':
        acao = `Instale skills em ~/.claude/skills/ (faltam ${restante})`;
        porque = `A ${restante} skill(s) da conquista "${a.titulo}"`;
        break;
      case 'produtivo':
        acao = `Continue usando o Claude — faltam ${restante} sessões`;
        porque = `Já tem ${prog.atual} sessões, meta é 25`;
        break;
      case 'maratonista':
        acao = `Use o Claude hoje e amanhã (sequência atual: ${agg.totals.currentStreak} dias)`;
        porque = `Faltam ${restante} dias p/ "Maratonista"`;
        break;
      case 'foco-total':
        acao = `Mantenha a sequência — faltam ${restante} dias p/ 14 seguidos`;
        porque = `Recorde atual: ${prog.atual} dias`;
        break;
      case 'multiprojetos':
        acao = `Abra o Claude em um novo diretório (faltam ${restante})`;
        porque = `Você tem ${prog.atual} projeto(s), meta é 3`;
        break;
      case 'full-stack':
        acao = `Inicie mais projetos — faltam ${restante} para "Full Stack"`;
        porque = `${prog.atual} projetos até agora`;
        break;
      case 'conectado':
        acao = 'Conecte um MCP (Canva, Google Drive, Meta Ads)';
        porque = 'Nenhuma integração conectada ainda';
        break;
      case 'conectado-mundo':
        acao = `Conecte mais MCPs — faltam ${restante}`;
        porque = `${prog.atual} de 3 MCPs conectados`;
        break;
      case 'explorador':
        acao = 'Peça ao Claude: "explore este código"';
        porque = 'Agente Explore ainda não foi usado';
        break;
      case 'explorador-profundo':
        acao = `Use Explore mais ${restante} vezes`;
        porque = `${prog.atual} usos — meta é 20`;
        break;
      case 'arquiteto':
        acao = 'Peça um plano de implementação antes de codar';
        porque = 'Agente Plan ainda não foi usado';
        break;
      case 'estudioso':
        acao = `Use Plan ${restante} vezes mais`;
        porque = `${prog.atual} usos — meta é 10`;
        break;
      case 'visionario':
        acao = `Use Plan ${restante} vezes mais (meta: 20)`;
        porque = `${prog.atual} usos até agora`;
        break;
      case 'velocista':
        acao = `Faça ${restante} sessão(ões) esta semana`;
        porque = `Semana mais ativa: ${prog.atual} sessões — meta 5`;
        break;
      case 'centuriao':
        acao = `Faltam ${restante} sessões para o Centurião`;
        porque = `${prog.atual} sessões completadas`;
        break;
      case 'construtor-dedicado':
        acao = `Aprofunde em um projeto — faltam ${restante} sessões`;
        porque = `Projeto mais ativo: ${prog.atual} sessões, meta é 10`;
        break;
      case 'mare-criatividade':
        acao = `Faça ${restante} sessões em um único dia`;
        porque = `Recorde atual: ${prog.atual} sessões/dia`;
        break;
      case 'orquestrador':
        acao = `Use ${restante} tipo(s) de agente a mais`;
        porque = `${prog.atual} tipos usados — meta é 5`;
        break;
      case 'economizador':
        acao = 'Use o Claude em projetos longos para aproveitar o cache';
        porque = 'Ratio de cache ainda abaixo de 50%';
        break;
      default:
        acao = a.descricao;
        porque = `Conquista "${a.titulo}" ainda não conquistada`;
    }

    const score = restante !== null ? restante : 999;
    candidates.push({
      a: {
        titulo: a.titulo,
        acao,
        porque,
        alvo: { tipo: 'achievement', id: a.id },
        progress: prog,
        estimatedXp: 2,
      },
      score,
    });
  }

  // ---- gaps de marcos de objetivos (manual não-feitos) ----
  for (const goal of goals.goals) {
    for (const marco of goal.marcos) {
      if (marco.feito) continue;
      if (marco.auto) continue; // autos já cobertos pelas conquistas

      candidates.push({
        a: {
          titulo: goal.titulo,
          acao: marco.texto,
          porque: `Marco do objetivo "${goal.titulo}" pendente`,
          alvo: { tipo: 'goal', id: goal.id },
          progress: null,
          estimatedXp: 1,
        },
        score: 500,
      });
    }
  }

  // ---- fallback: próximo nível ----
  if (candidates.length === 0) {
    const xpLeft = agg.level ? agg.level.xpForNext - agg.level.xpIntoLevel : null;
    if (xpLeft !== null && xpLeft > 0) {
      candidates.push({
        a: {
          titulo: 'Próximo nível',
          acao: `Continue usando o Claude — faltam ${xpLeft} XP`,
          porque: `Nível ${agg.level.level} (${agg.level.title})`,
          alvo: { tipo: 'level', id: 'next' },
          progress: {
            atual: agg.level.xpIntoLevel,
            meta: agg.level.xpForNext,
            restante: xpLeft,
          },
          estimatedXp: 0,
        },
        score: xpLeft,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  const [primary, ...rest] = candidates.map(c => c.a);
  const secundarias = rest.slice(0, 3);

  return { primary: primary || null, secundarias };
}

module.exports = { build };
