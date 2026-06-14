'use strict';

/* Definições declarativas de badges e missões por área.
   Consumidas pelo motor lib/progress.js. Usam SÓ campos já existentes
   em cada área (ver data.json + builders).

   ctx = { campos, historico, metasManual, streak, checkins, todayStr }

   badge:  { id, nome, icone, desc, check:(ctx)=>bool, meta?, atualFn?:(ctx)=>n }
   missao: { id, nome, icone, periodo:'dia'|'semana', xp, check?:(ctx)=>bool, meta?, atualFn? }
           (sem check = missão manual, marcada via toggle)
*/

// nº de pontos no histórico de um campo cujo valor satisfaz fn
function histCount(historico, campo, fn) {
  const arr = (historico && historico[campo]) || [];
  return arr.filter(p => p && typeof p.v === 'number' && fn(p.v)).length;
}
// último valor registrado de um campo no histórico
function histLast(historico, campo) {
  const arr = (historico && historico[campo]) || [];
  return arr.length ? arr[arr.length - 1].v : null;
}

const PROGRESS_DEFS = {
  saude: {
    badges: [
      { id: 'streak-7',   nome: 'Semana de Ferro',  icone: '🔥', desc: '7 dias seguidos de check-in.',
        check: c => c.streak.atual >= 7, meta: 7, atualFn: c => c.streak.atual },
      { id: 'sono-5',     nome: 'Bem Dormido',      icone: '😴', desc: '5 registros de sono ≥ 7h.',
        check: c => histCount(c.historico, 'sonoH', v => v >= 7) >= 5, meta: 5,
        atualFn: c => histCount(c.historico, 'sonoH', v => v >= 7) },
      { id: 'treino-meta', nome: 'No Ritmo',         icone: '💪', desc: 'Bateu a meta de treinos da semana.',
        check: c => (c.campos.treinosSemana || 0) >= (c.campos.treinosMeta || 3) },
      { id: 'peso-alvo',  nome: 'Peso Ideal',       icone: '🎯', desc: 'Atingiu o peso alvo.',
        check: c => typeof c.campos.peso === 'number' && typeof c.campos.pesoAlvo === 'number'
          && c.campos.pesoAlvo > 0 && Math.abs(c.campos.peso - c.campos.pesoAlvo) / c.campos.pesoAlvo <= 0.02 },
      { id: 'streak-30',  nome: 'Disciplina Total', icone: '🏆', desc: '30 dias seguidos.',
        check: c => c.streak.atual >= 30, meta: 30, atualFn: c => c.streak.atual },
    ],
    missoes: [
      { id: 'treinar-hoje',  nome: 'Treinar hoje',          icone: '🏋️', periodo: 'dia',    xp: 2 },
      { id: 'dormir-7h',     nome: 'Dormir 7h+',            icone: '😴', periodo: 'dia',    xp: 1,
        check: c => typeof c.campos.sonoH === 'number' && c.campos.sonoH >= 7 },
      { id: 'meta-treinos',  nome: 'Bater meta de treinos', icone: '✅', periodo: 'semana', xp: 3,
        check: c => (c.campos.treinosSemana || 0) >= (c.campos.treinosMeta || 3),
        meta: 0, atualFn: c => c.campos.treinosSemana || 0 },
    ],
  },

  financas: {
    badges: [
      { id: 'primeira-reserva', nome: 'Primeira Reserva', icone: '🐖', desc: 'Tem reserva de emergência > 0.',
        check: c => typeof c.campos.reservaEmergencia === 'number' && c.campos.reservaEmergencia > 0 },
      { id: 'lucro-positivo',   nome: 'No Azul',          icone: '📈', desc: 'Receita maior que despesas.',
        check: c => typeof c.campos.receitaMes === 'number' && typeof c.campos.despesasMes === 'number'
          && c.campos.receitaMes > c.campos.despesasMes },
      { id: 'sem-dividas',      nome: 'Livre de Dívidas', icone: '🕊️', desc: 'Zerou as dívidas.',
        check: c => typeof c.campos.dividas === 'number' && c.campos.dividas <= 0 },
      { id: 'reserva-cheia',    nome: 'Cofre Cheio',      icone: '💎', desc: 'Reserva atingiu a meta.',
        check: c => typeof c.campos.reservaEmergencia === 'number' && typeof c.campos.reservaMeta === 'number'
          && c.campos.reservaMeta > 0 && c.campos.reservaEmergencia >= c.campos.reservaMeta,
        meta: 100, atualFn: c => (typeof c.campos.reservaEmergencia === 'number' && c.campos.reservaMeta)
          ? Math.round((c.campos.reservaEmergencia / c.campos.reservaMeta) * 100) : 0 },
    ],
    missoes: [
      { id: 'registrar-receita', nome: 'Registrar a receita do mês', icone: '🧾', periodo: 'semana', xp: 2,
        check: c => typeof c.campos.receitaMes === 'number' && c.campos.receitaMes > 0 },
      { id: 'gasto-controlado',  nome: 'Gastar menos que ganha',     icone: '⚖️', periodo: 'semana', xp: 3,
        check: c => typeof c.campos.receitaMes === 'number' && typeof c.campos.despesasMes === 'number'
          && c.campos.despesasMes < c.campos.receitaMes },
      { id: 'guardar-mes',       nome: 'Guardar dinheiro este mês',  icone: '💰', periodo: 'semana', xp: 2 },
    ],
  },

  trabalho: {
    badges: [
      { id: 'meta-clientes', nome: 'Carteira Cheia',   icone: '🤝', desc: 'Atingiu a meta de clientes.',
        check: c => typeof c.campos.clientesAtivos === 'number' && typeof c.campos.metaClientes === 'number'
          && c.campos.clientesAtivos >= c.campos.metaClientes,
        meta: 0, atualFn: c => c.campos.clientesAtivos || 0 },
      { id: 'tarefas-100',   nome: 'Tudo Entregue',    icone: '✅', desc: 'Concluiu todas as tarefas da semana.',
        check: c => typeof c.campos.tarefasConcluidas === 'number' && typeof c.campos.tarefasSemana === 'number'
          && c.campos.tarefasSemana > 0 && c.campos.tarefasConcluidas >= c.campos.tarefasSemana },
      { id: 'satisfeito',    nome: 'Realizado',        icone: '😎', desc: 'Satisfação no trabalho ≥ 8.',
        check: c => typeof c.campos.satisfacao === 'number' && c.campos.satisfacao >= 8 },
      { id: 'streak-7',      nome: 'Constância',       icone: '🔥', desc: '7 dias seguidos de check-in.',
        check: c => c.streak.atual >= 7, meta: 7, atualFn: c => c.streak.atual },
    ],
    missoes: [
      { id: 'avancar-tarefas', nome: 'Avançar nas tarefas', icone: '📋', periodo: 'dia',    xp: 2 },
      { id: 'prospectar',      nome: 'Prospectar 1 cliente', icone: '📞', periodo: 'semana', xp: 3 },
      { id: 'concluir-semana', nome: 'Fechar a semana no alvo', icone: '🎯', periodo: 'semana', xp: 3,
        check: c => typeof c.campos.tarefasConcluidas === 'number' && typeof c.campos.tarefasSemana === 'number'
          && c.campos.tarefasSemana > 0 && c.campos.tarefasConcluidas >= c.campos.tarefasSemana },
    ],
  },

  metas: (() => {
    const G = c => Array.isArray(c.goals) ? c.goals : [];
    const done = (c, id) => { const g = G(c).find(x => x.id === id); return !!(g && g.feito); };
    const nDone = c => G(c).filter(x => x.feito).length;
    const algumPlano = c => G(c).some(g => Array.isArray(g.missoes) && g.missoes.length && g.missoes.every(m => m.feito));
    return {
      badges: [
        { id: 'primeiro-marco', nome: 'Primeiro Passo', icone: '⭐', desc: 'Bateu a 1ª meta.',
          check: c => nDone(c) >= 1 },
        { id: 'cinco-marcos', nome: 'Em Chamas', icone: '🔥', desc: 'Bateu 5 metas.',
          check: c => nDone(c) >= 5, meta: 5, atualFn: c => nDone(c) },
        { id: 'dez-marcos', nome: 'Realizador', icone: '🏆', desc: 'Bateu 10 metas.',
          check: c => nDone(c) >= 10, meta: 10, atualFn: c => nDone(c) },
        { id: 'plano-cumprido', nome: 'Plano Cumprido', icone: '✅', desc: 'Concluiu todas as missões de uma meta.',
          check: c => algumPlano(c) },
        { id: 'dez-mil-mes', nome: 'R$10k/mês', icone: '💸', desc: 'Primeiro mês de 5 dígitos.',
          check: c => done(c, 'goal-renda-0') },
        { id: 'cem-mil-mes', nome: 'R$100k/mês', icone: '💰', desc: 'Seis dígitos por mês.',
          check: c => done(c, 'goal-renda-5') },
        { id: 'primeiro-milhao', nome: 'Primeiro Milhão', icone: '🏦', desc: 'R$1 milhão de patrimônio.',
          check: c => done(c, 'goal-patr-4') },
        { id: 'vendedor', nome: 'Vendedor', icone: '🤝', desc: 'Fechou uma venda de R$10 mil sozinho.',
          check: c => done(c, 'goal-venda-10k') },
        { id: 'closer', nome: 'Closer', icone: '💼', desc: 'Fechou uma venda de R$100 mil.',
          check: c => done(c, 'goal-venda-100k') },
        { id: 'lider', nome: 'Líder', icone: '👥', desc: 'Primeira pessoa no time.',
          check: c => done(c, 'goal-1a-pessoa') },
        { id: 'empresa-roda', nome: 'Dono de Verdade', icone: '🏢', desc: 'A empresa roda sem você.',
          check: c => done(c, 'goal-empresa-roda') },
        { id: 'tanquinho', nome: 'Tanquinho', icone: '🏋️', desc: 'Abdômen visível.',
          check: c => done(c, 'goal-abdomen') },
        { id: 'condicionado', nome: 'Atleta', icone: '🏃', desc: 'Excelente condicionamento.',
          check: c => done(c, 'goal-condicionamento') },
        { id: 'poliglota', nome: 'Poliglota', icone: '🗣️', desc: 'Inglês e espanhol fluentes.',
          check: c => done(c, 'goal-ingles') && done(c, 'goal-espanhol') },
        { id: 'nomade', nome: 'Independente', icone: '🏠', desc: 'Morou sozinho, vivendo da própria renda.',
          check: c => done(c, 'goal-morar-sozinho') },
        { id: 'viajante', nome: 'Passaporte Carimbado', icone: '✈️', desc: 'Primeira viagem internacional.',
          check: c => done(c, 'goal-viagem-intl') },
        { id: 'porsche', nome: 'Porsche na Garagem', icone: '🏎️', desc: 'Comprou a Porsche.',
          check: c => done(c, 'goal-porsche') },
        { id: 'cem-dias', nome: 'Inquebrável', icone: '🔁', desc: '100 dias sem abandonar a execução.',
          check: c => done(c, 'goal-100dias') },
        { id: 'achou-sofia', nome: 'Encontrou a Sofia', icone: '❤️', desc: 'O encontro que move tudo.',
          check: c => done(c, 'goal-sofia-encontro') },
        { id: 'disciplina', nome: 'Disciplina', icone: '📅', desc: '7 dias seguidos de check-in.',
          check: c => c.streak.atual >= 7, meta: 7, atualFn: c => c.streak.atual },
      ],
      missoes: [
        { id: 'avancar-porsche', nome: 'Guardar pro Porsche', icone: '🏎️', periodo: 'semana', xp: 3 },
        { id: 'passo-sofia',     nome: 'Dar um passo rumo à Sofia', icone: '❤️', periodo: 'semana', xp: 3 },
        { id: 'revisar-metas',   nome: 'Revisar as metas',    icone: '📝', periodo: 'semana', xp: 1 },
      ],
    };
  })(),

  igreja: {
    badges: [
      { id: 'missa-dia',   nome: 'Fiel',           icone: '⛪', desc: 'Foi à missa na semana.',
        check: c => typeof c.campos.missasSemanais === 'number' && typeof c.campos.missaMeta === 'number'
          && c.campos.missasSemanais >= c.campos.missaMeta },
      { id: 'oracao-7',    nome: 'Em Oração',      icone: '🙏', desc: '7 dias seguidos de check-in.',
        check: c => c.streak.atual >= 7, meta: 7, atualFn: c => c.streak.atual },
      { id: 'biblia',      nome: 'Na Palavra',     icone: '📖', desc: 'Leu a Bíblia.',
        check: c => !!c.campos.biblia },
      { id: 'voluntario',  nome: 'Servo',          icone: '🤲', desc: 'Fez voluntariado.',
        check: c => !!c.campos.voluntariado },
    ],
    missoes: [
      { id: 'orar-hoje',   nome: 'Orar hoje',       icone: '🙏', periodo: 'dia', xp: 1,
        check: c => !!c.campos.oracao },
      { id: 'ler-biblia',  nome: 'Ler a Bíblia',    icone: '📖', periodo: 'dia', xp: 1,
        check: c => !!c.campos.biblia },
      { id: 'ir-missa',    nome: 'Ir à missa',      icone: '⛪', periodo: 'semana', xp: 3,
        check: c => typeof c.campos.missasSemanais === 'number' && typeof c.campos.missaMeta === 'number'
          && c.campos.missasSemanais >= c.campos.missaMeta },
    ],
  },

  lazer: {
    badges: [
      { id: 'lazer-meta', nome: 'Equilíbrio',    icone: '🌴', desc: 'Bateu a meta de lazer da semana.',
        check: c => typeof c.campos.horasLazer === 'number' && typeof c.campos.metaLazer === 'number'
          && c.campos.horasLazer >= c.campos.metaLazer },
      { id: 'leitor-5',   nome: 'Leitor',        icone: '📚', desc: '5 dias com 20min+ de leitura.',
        check: c => histCount(c.historico, 'leituraMin', v => v >= 20) >= 5, meta: 5,
        atualFn: c => histCount(c.historico, 'leituraMin', v => v >= 20) },
      { id: 'curioso',    nome: 'Curioso',       icone: '💡', desc: 'Aprendeu algo novo hoje.',
        check: c => !!c.campos.aprendizadoHoje },
      { id: 'streak-7',   nome: 'Recarregado',   icone: '🔋', desc: '7 dias seguidos.',
        check: c => c.streak.atual >= 7, meta: 7, atualFn: c => c.streak.atual },
    ],
    missoes: [
      { id: 'ler-hoje',    nome: 'Ler 20min',          icone: '📖', periodo: 'dia', xp: 1,
        check: c => typeof c.campos.leituraMin === 'number' && c.campos.leituraMin >= 20 },
      { id: 'aprender',    nome: 'Aprender algo novo',  icone: '💡', periodo: 'dia', xp: 1,
        check: c => !!c.campos.aprendizadoHoje },
      { id: 'lazer-semana', nome: 'Tirar tempo de lazer', icone: '🌴', periodo: 'semana', xp: 2 },
    ],
  },

  rotina: {
    badges: [
      { id: 'madrugador',  nome: 'Madrugador',    icone: '🌅', desc: 'Acordou antes das 7h.',
        check: c => typeof c.campos.acordouCedo === 'number' ? c.campos.acordouCedo <= 7 : !!c.campos.acordouCedo },
      { id: 'hidratado-5', nome: 'Hidratado',     icone: '💧', desc: '5 dias batendo a meta de água.',
        check: c => histCount(c.historico, 'aguaL', v => v >= 2) >= 5, meta: 5,
        atualFn: c => histCount(c.historico, 'aguaL', v => v >= 2) },
      { id: 'detox',       nome: 'Desconectado',  icone: '📵', desc: 'Celular abaixo de 2h.',
        check: c => typeof c.campos.celularH === 'number' && c.campos.celularH < 2 },
      { id: 'streak-14',   nome: 'Rotina de Aço', icone: '🔥', desc: '14 dias seguidos.',
        check: c => c.streak.atual >= 14, meta: 14, atualFn: c => c.streak.atual },
    ],
    missoes: [
      { id: 'beber-agua',  nome: 'Bater meta de água', icone: '💧', periodo: 'dia', xp: 1,
        check: c => typeof c.campos.aguaL === 'number' && c.campos.aguaL >= (c.campos.metaAgua || 2) },
      { id: 'acordar-cedo', nome: 'Acordar cedo',      icone: '🌅', periodo: 'dia', xp: 2,
        check: c => typeof c.campos.acordouCedo === 'number' ? c.campos.acordouCedo <= 7 : !!c.campos.acordouCedo },
      { id: 'limitar-tela', nome: 'Limitar o celular',  icone: '📵', periodo: 'dia', xp: 1,
        check: c => typeof c.campos.celularH === 'number' && c.campos.celularH < 2 },
    ],
  },

  mente: {
    badges: [
      { id: 'meditou',    nome: 'Mente Calma',   icone: '🧘', desc: 'Meditou hoje.',
        check: c => !!c.campos.meditacao },
      { id: 'grato',      nome: 'Grato',         icone: '🙏', desc: 'Praticou gratidão.',
        check: c => !!c.campos.gratidao },
      { id: 'humor-bom',  nome: 'Bem-estar',     icone: '😊', desc: 'Humor ≥ 8.',
        check: c => typeof c.campos.humor === 'number' && c.campos.humor >= 8 },
      { id: 'sereno-5',   nome: 'Sereno',        icone: '🌿', desc: '5 dias com baixa ansiedade (≤3).',
        check: c => histCount(c.historico, 'ansiedade', v => v <= 3) >= 5, meta: 5,
        atualFn: c => histCount(c.historico, 'ansiedade', v => v <= 3) },
    ],
    missoes: [
      { id: 'meditar',  nome: 'Meditar hoje',         icone: '🧘', periodo: 'dia', xp: 2,
        check: c => !!c.campos.meditacao },
      { id: 'gratidao', nome: 'Escrever 3 gratidões',  icone: '🙏', periodo: 'dia', xp: 1,
        check: c => !!c.campos.gratidao },
      { id: 'journal',  nome: 'Escrever no journal',   icone: '📓', periodo: 'dia', xp: 1,
        check: c => !!c.campos.journalHoje },
    ],
  },
};

module.exports = { PROGRESS_DEFS, histCount, histLast };
