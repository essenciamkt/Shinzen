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

  metas: {
    badges: [
      { id: 'sofia',        nome: 'Encontrar a Sofia', icone: '❤️', desc: 'A meta mais importante.',
        check: c => !!c.metasManual['sofia'] },
      { id: 'porsche-25',   nome: 'Porsche 25%',       icone: '🏎️', desc: '25% do Porsche guardado.',
        check: c => typeof c.campos.economiasPorsche === 'number' && typeof c.campos.metaPorsche === 'number'
          && c.campos.metaPorsche > 0 && c.campos.economiasPorsche / c.campos.metaPorsche >= 0.25,
        meta: 25, atualFn: c => (typeof c.campos.economiasPorsche === 'number' && c.campos.metaPorsche)
          ? Math.round((c.campos.economiasPorsche / c.campos.metaPorsche) * 100) : 0 },
      { id: 'porsche-50',   nome: 'Porsche 50%',       icone: '🏁', desc: 'Metade do Porsche.',
        check: c => typeof c.campos.economiasPorsche === 'number' && typeof c.campos.metaPorsche === 'number'
          && c.campos.metaPorsche > 0 && c.campos.economiasPorsche / c.campos.metaPorsche >= 0.5,
        meta: 50, atualFn: c => (typeof c.campos.economiasPorsche === 'number' && c.campos.metaPorsche)
          ? Math.round((c.campos.economiasPorsche / c.campos.metaPorsche) * 100) : 0 },
      { id: 'porsche-100',  nome: 'Porsche na Garagem', icone: '🏆', desc: 'Comprou o Porsche.',
        check: c => typeof c.campos.economiasPorsche === 'number' && typeof c.campos.metaPorsche === 'number'
          && c.campos.metaPorsche > 0 && c.campos.economiasPorsche >= c.campos.metaPorsche },
      { id: 'tres-metas',   nome: 'Realizador',        icone: '⭐', desc: 'Bateu 3 metas.',
        check: c => Object.values(c.metasManual).filter(Boolean).length >= 3,
        meta: 3, atualFn: c => Object.values(c.metasManual).filter(Boolean).length },
    ],
    missoes: [
      { id: 'avancar-porsche', nome: 'Guardar pro Porsche', icone: '🏎️', periodo: 'semana', xp: 3 },
      { id: 'passo-sofia',     nome: 'Dar um passo rumo à Sofia', icone: '❤️', periodo: 'semana', xp: 3 },
      { id: 'revisar-metas',   nome: 'Revisar as metas',    icone: '📝', periodo: 'semana', xp: 1 },
    ],
  },

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
