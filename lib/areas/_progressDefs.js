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
    const misFeitasTotal = c => G(c).reduce((s, g) => s + (Array.isArray(g.missoes) ? g.missoes.filter(m => m.feito).length : 0), 0);
    const algumaMissao = c => misFeitasTotal(c) >= 1;
    const algumMeioCaminho = c => G(c).some(g => { const t = (g.missoes || []).length; return t >= 4 && (g.missoes.filter(m => m.feito).length / t) >= 0.5; });
    const nPlanos = c => G(c).filter(g => Array.isArray(g.missoes) && g.missoes.length && g.missoes.every(m => m.feito)).length;
    const gMis = (c, id) => { const g = G(c).find(x => x.id === id); return (g && Array.isArray(g.missoes)) ? g.missoes.filter(m => m.feito).length : 0; };
    const allDone = (c, ...ids) => ids.every(id => done(c, id));
    const RENDA = ['goal-renda-0', 'goal-renda-1', 'goal-renda-2', 'goal-renda-3', 'goal-renda-4', 'goal-renda-5'];
    const PATR = ['goal-patr-0', 'goal-patr-1', 'goal-patr-2', 'goal-patr-3', 'goal-patr-4'];
    const curated = [
        { id: 'primeiro-marco', nome: 'Primeiro Passo', icone: '⭐', desc: 'Bateu a 1ª meta.',
          check: c => nDone(c) >= 1 },
        { id: 'cinco-marcos', nome: 'Em Chamas', icone: '🔥', desc: 'Bateu 5 metas.',
          check: c => nDone(c) >= 5, meta: 5, atualFn: c => nDone(c) },
        { id: 'dez-marcos', nome: 'Realizador', icone: '🏆', desc: 'Bateu 10 metas.',
          check: c => nDone(c) >= 10, meta: 10, atualFn: c => nDone(c) },
        { id: 'plano-cumprido', nome: 'Plano Cumprido', icone: '✅', desc: 'Concluiu todas as missões de uma meta.',
          check: c => algumPlano(c) },
        { id: 'primeira-missao', nome: 'Primeira Missão', icone: '👟', desc: 'Concluiu a 1ª missão de qualquer meta.',
          check: c => algumaMissao(c) },
        { id: 'dez-missoes', nome: 'Pé na Estrada', icone: '🚶', desc: '10 missões concluídas no total.',
          check: c => misFeitasTotal(c) >= 10, meta: 10, atualFn: c => misFeitasTotal(c) },
        { id: 'cinquenta-missoes', nome: 'Maratonista', icone: '🏅', desc: '50 missões concluídas no total.',
          check: c => misFeitasTotal(c) >= 50, meta: 50, atualFn: c => misFeitasTotal(c) },
        { id: 'meio-caminho', nome: 'Meio Caminho', icone: '🌗', desc: 'Uma meta com metade das missões feitas.',
          check: c => algumMeioCaminho(c) },
        { id: 'tres-planos', nome: 'Executor', icone: '🎖️', desc: 'Concluiu todas as missões de 3 metas.',
          check: c => nPlanos(c) >= 3, meta: 3, atualFn: c => nPlanos(c) },
        { id: 'quinze-marcos', nome: 'Imparável', icone: '🚀', desc: 'Bateu 15 metas.',
          check: c => nDone(c) >= 15, meta: 15, atualFn: c => nDone(c) },
        { id: 'tudo', nome: 'Vida Conquistada', icone: '👑', desc: 'Bateu todas as 30 metas.',
          check: c => nDone(c) >= 30, meta: 30, atualFn: c => nDone(c) },
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
        { id: 'primeiro-contato', nome: 'Reaproximação', icone: '💬', desc: 'Primeiro contato significativo com a Sofia.',
          check: c => done(c, 'goal-sofia-contato') },
        { id: 'achou-sofia', nome: 'Encontrou a Sofia', icone: '❤️', desc: 'O encontro que move tudo.',
          check: c => done(c, 'goal-sofia-encontro') },
        { id: 'destemido', nome: 'Sem Medo', icone: '👁️', desc: 'Vende olhando nos olhos.',
          check: c => done(c, 'goal-vender-olhos') },
        { id: 'falante', nome: 'Conversa Fluente', icone: '🇺🇸', desc: 'Conversa natural em inglês.',
          check: c => done(c, 'goal-ingles') },
        { id: 'proprio-pe', nome: 'Próprio Pé', icone: '💵', desc: '1º mês vivendo 100% da própria renda.',
          check: c => done(c, 'goal-1o-mes-renda') },
        { id: 'disciplina', nome: 'Disciplina', icone: '📅', desc: '7 dias seguidos de check-in.',
          check: c => c.streak.atual >= 7, meta: 7, atualFn: c => c.streak.atual },

        // ── +50 conquistas (vida do Emanuel) ──
        // Renda
        { id: 'motor-ligado', nome: 'Motor Ligado', icone: '🔌', desc: 'Primeiro real recorrente caindo.', check: c => gMis(c, 'goal-renda-0') >= 1 },
        { id: 'renda-20k', nome: 'R$20k/mês', icone: '💸', desc: 'Vinte mil por mês.', check: c => done(c, 'goal-renda-1') },
        { id: 'renda-30k', nome: 'R$30k/mês', icone: '💸', desc: 'Trinta mil por mês.', check: c => done(c, 'goal-renda-2') },
        { id: 'renda-50k', nome: 'R$50k/mês', icone: '💸', desc: 'Cinquenta mil por mês.', check: c => done(c, 'goal-renda-3') },
        { id: 'renda-80k', nome: 'R$80k/mês', icone: '💸', desc: 'Oitenta mil por mês.', check: c => done(c, 'goal-renda-4') },
        { id: 'renda-mestre', nome: 'Dono da Renda', icone: '🏧', desc: 'Bateu todos os degraus de renda.', check: c => allDone(c, ...RENDA) },
        // Patrimônio
        { id: 'caixa-10k', nome: 'R$10k em Caixa', icone: '🏦', desc: 'Primeira reserva de 5 dígitos.', check: c => done(c, 'goal-patr-0') },
        { id: 'caixa-50k', nome: 'R$50k em Caixa', icone: '🏦', desc: 'Caixa de cinquenta mil.', check: c => done(c, 'goal-patr-1') },
        { id: 'patr-100k', nome: 'R$100k', icone: '🏦', desc: 'Cem mil de patrimônio.', check: c => done(c, 'goal-patr-2') },
        { id: 'patr-500k', nome: 'Meio Milhão', icone: '💎', desc: 'R$500 mil de patrimônio.', check: c => done(c, 'goal-patr-3') },
        { id: 'patr-mestre', nome: 'Patrimônio Blindado', icone: '🏰', desc: 'Bateu toda a escada de patrimônio.', check: c => allDone(c, ...PATR) },
        // Corpo
        { id: 'primeiro-treino', nome: 'Primeiro Treino', icone: '🏋️', desc: 'Começou a transformação do corpo.', check: c => gMis(c, 'goal-abdomen') >= 1 },
        { id: 'shape-feito', nome: 'Presença', icone: '💪', desc: 'Shape que chama atenção na sala.', check: c => done(c, 'goal-shape') },
        { id: 'corpo-mestre', nome: 'Corpo de Atleta', icone: '🥇', desc: 'Abdômen, shape e condicionamento.', check: c => allDone(c, 'goal-abdomen', 'goal-shape', 'goal-condicionamento') },
        // Idioma
        { id: 'espanhol-feito', nome: 'Hola', icone: '🇪🇸', desc: 'Fluente em espanhol.', check: c => done(c, 'goal-espanhol') },
        { id: 'primeira-conversa', nome: 'Destravou a Língua', icone: '🗨️', desc: 'Meio caminho do inglês fluente.', check: c => gMis(c, 'goal-ingles') >= 5 },
        // Mentalidade
        { id: 'cinquenta-dias', nome: '50 Dias', icone: '🔂', desc: 'Metade dos 100 dias sem abandonar.', check: c => gMis(c, 'goal-100dias') >= 5 },
        { id: 'venda-10k-meio', nome: 'Quase Closer', icone: '🤝', desc: 'Meio caminho da venda de R$10k.', check: c => gMis(c, 'goal-venda-10k') >= 5 },
        { id: 'mentalidade-mestre', nome: 'Mente de Aço', icone: '🧠', desc: 'Todas as metas de mentalidade.', check: c => allDone(c, 'goal-100dias', 'goal-vender-olhos', 'goal-venda-10k', 'goal-venda-100k') },
        // Liderança
        { id: 'primeira-contratacao', nome: 'Quase Chefe', icone: '🧑‍💼', desc: 'A caminho da 1ª pessoa no time.', check: c => gMis(c, 'goal-1a-pessoa') >= 9 },
        { id: 'time-feito', nome: 'Time Montado', icone: '👥', desc: 'Primeiro pequeno time.', check: c => done(c, 'goal-time') },
        { id: 'lideranca-mestre', nome: 'Líder de Verdade', icone: '🎖️', desc: 'Todas as metas de liderança.', check: c => allDone(c, 'goal-1a-pessoa', 'goal-time', 'goal-empresa-roda') },
        // Experiências
        { id: 'passaporte-pronto', nome: 'Passaporte na Mão', icone: '🛂', desc: 'Primeiro passo da viagem internacional.', check: c => gMis(c, 'goal-viagem-intl') >= 1 },
        { id: 'porsche-meio', nome: 'Sente o Cheiro', icone: '🏎️', desc: 'Meio caminho da Porsche.', check: c => gMis(c, 'goal-porsche') >= 5 },
        { id: 'experiencias-mestre', nome: 'Vida Vivida', icone: '🌅', desc: 'Todas as metas de experiências.', check: c => allDone(c, 'goal-1o-mes-renda', 'goal-morar-sozinho', 'goal-viagem-intl', 'goal-porsche') },
        // Sofia
        { id: 'rumo-a-ela', nome: 'Rumo a Ela', icone: '🧭', desc: 'Primeiro passo pra viajar até a Sofia.', check: c => gMis(c, 'goal-sofia-condicoes') >= 1 },
        { id: 'sofia-condicoes-feito', nome: 'Em Condições', icone: '🧳', desc: 'Pronto pra viajar até ela.', check: c => done(c, 'goal-sofia-condicoes') },
        { id: 'sofia-mestre', nome: 'A História Toda', icone: '💞', desc: 'Toda a trilha da Sofia.', check: c => allDone(c, 'goal-sofia-contato', 'goal-sofia-condicoes', 'goal-sofia-encontro') },
        // Total de missões
        { id: 'vinte-missoes', nome: 'Em Movimento', icone: '🏃', desc: '20 missões concluídas.', check: c => misFeitasTotal(c) >= 20, meta: 20, atualFn: c => misFeitasTotal(c) },
        { id: 'cem-missoes', nome: 'Centena', icone: '💯', desc: '100 missões concluídas.', check: c => misFeitasTotal(c) >= 100, meta: 100, atualFn: c => misFeitasTotal(c) },
        { id: 'cento-cinquenta-missoes', nome: 'Implacável', icone: '⚔️', desc: '150 missões concluídas.', check: c => misFeitasTotal(c) >= 150, meta: 150, atualFn: c => misFeitasTotal(c) },
        { id: 'duzentas-missoes', nome: 'Força Bruta', icone: '🦾', desc: '200 missões concluídas.', check: c => misFeitasTotal(c) >= 200, meta: 200, atualFn: c => misFeitasTotal(c) },
        { id: 'todas-missoes', nome: 'Cada Degrau', icone: '🪜', desc: 'Todas as 300 missões.', check: c => misFeitasTotal(c) >= 300, meta: 300, atualFn: c => misFeitasTotal(c) },
        // Marcos
        { id: 'vinte-marcos', nome: 'Vinte Sonhos', icone: '🌠', desc: 'Bateu 20 metas.', check: c => nDone(c) >= 20, meta: 20, atualFn: c => nDone(c) },
        { id: 'vinte-cinco-marcos', nome: 'Reta Final', icone: '🏁', desc: 'Bateu 25 metas.', check: c => nDone(c) >= 25, meta: 25, atualFn: c => nDone(c) },
        // Planos completos
        { id: 'cinco-planos', nome: 'Cinco Planos', icone: '📐', desc: 'Concluiu todas as missões de 5 metas.', check: c => nPlanos(c) >= 5, meta: 5, atualFn: c => nPlanos(c) },
        { id: 'dez-planos', nome: 'Arquiteto da Vida', icone: '🏗️', desc: 'Concluiu todas as missões de 10 metas.', check: c => nPlanos(c) >= 10, meta: 10, atualFn: c => nPlanos(c) },
        // Streak
        { id: 'streak-14', nome: 'Duas Semanas', icone: '🔥', desc: '14 dias seguidos de check-in.', check: c => c.streak.atual >= 14, meta: 14, atualFn: c => c.streak.atual },
        { id: 'streak-30', nome: 'Um Mês Inteiro', icone: '🔥', desc: '30 dias seguidos.', check: c => c.streak.atual >= 30, meta: 30, atualFn: c => c.streak.atual },
        { id: 'streak-60', nome: 'Dois Meses', icone: '🔥', desc: '60 dias seguidos.', check: c => c.streak.atual >= 60, meta: 60, atualFn: c => c.streak.atual },
        { id: 'streak-100', nome: 'Cem Dias de Fogo', icone: '🔥', desc: '100 dias seguidos.', check: c => c.streak.atual >= 100, meta: 100, atualFn: c => c.streak.atual },
        // Combos de vida
        { id: 'independente-total', nome: 'Saiu de Casa', icone: '🚪', desc: 'Morando sozinho, da própria renda.', check: c => allDone(c, 'goal-1o-mes-renda', 'goal-morar-sozinho') },
        { id: 'corpo-e-mente', nome: 'Corpo e Mente', icone: '☯️', desc: 'Abdômen visível + 100 dias de execução.', check: c => allDone(c, 'goal-abdomen', 'goal-100dias') },
        { id: 'maquina-de-vender', nome: 'Máquina de Vender', icone: '📈', desc: 'Vende no olho + fechou R$10k.', check: c => allDone(c, 'goal-vender-olhos', 'goal-venda-10k') },
        { id: 'fundador', nome: 'Fundador', icone: '🚩', desc: 'R$10k/mês + 1ª contratação.', check: c => allDone(c, 'goal-renda-0', 'goal-1a-pessoa') },
        { id: 'cidadao-do-mundo', nome: 'Cidadão do Mundo', icone: '🌍', desc: 'Viajou pra fora falando inglês.', check: c => allDone(c, 'goal-viagem-intl', 'goal-ingles') },
        { id: 'rico-e-livre', nome: 'Rico e Livre', icone: '🕊️', desc: 'R$100k/mês + empresa roda sem você.', check: c => allDone(c, 'goal-renda-5', 'goal-empresa-roda') },
        { id: 'sonho-de-garagem', nome: 'Sonho de Garagem', icone: '🔑', desc: 'Porsche + R$500k de patrimônio.', check: c => allDone(c, 'goal-porsche', 'goal-patr-3') },
        { id: 'a-vida-toda', nome: 'Tudo Que Eu Quis', icone: '🌟', desc: 'Sofia + Porsche + R$100k/mês.', check: c => allDone(c, 'goal-sofia-encontro', 'goal-porsche', 'goal-renda-5') },
        { id: 'lenda', nome: 'Lenda', icone: '👑', desc: 'Todas as metas e todas as missões.', check: c => nDone(c) >= 30 && misFeitasTotal(c) >= 300 },
    ];
    // ── Geradas: começo/metade/conquista por meta + tiers (até 200 no total) ──
    const GL = {
      'goal-renda-0': ['💸', 'R$10k/mês'], 'goal-renda-1': ['💸', 'R$20k/mês'], 'goal-renda-2': ['💸', 'R$30k/mês'],
      'goal-renda-3': ['💸', 'R$50k/mês'], 'goal-renda-4': ['💸', 'R$80k/mês'], 'goal-renda-5': ['💸', 'R$100k/mês'],
      'goal-patr-0': ['🏦', 'R$10k em caixa'], 'goal-patr-1': ['🏦', 'R$50k em caixa'], 'goal-patr-2': ['🏦', 'R$100k'],
      'goal-patr-3': ['💎', 'R$500k'], 'goal-patr-4': ['🏦', 'R$1 milhão'],
      'goal-abdomen': ['🔥', 'Abdômen'], 'goal-shape': ['💪', 'Shape'], 'goal-condicionamento': ['🏃', 'Condicionamento'],
      'goal-ingles': ['🇺🇸', 'Inglês'], 'goal-espanhol': ['🇪🇸', 'Espanhol'],
      'goal-100dias': ['🔁', '100 dias'], 'goal-vender-olhos': ['👁️', 'Vender no olho'],
      'goal-venda-10k': ['🤝', 'Venda de R$10k'], 'goal-venda-100k': ['💼', 'Venda de R$100k'],
      'goal-1a-pessoa': ['🧑‍🤝‍🧑', '1ª pessoa'], 'goal-time': ['👥', 'Time'], 'goal-empresa-roda': ['🏢', 'Empresa roda'],
      'goal-1o-mes-renda': ['💵', 'Viver da renda'], 'goal-morar-sozinho': ['🏠', 'Morar sozinho'],
      'goal-viagem-intl': ['✈️', 'Viagem internacional'], 'goal-porsche': ['🏎️', 'Porsche'],
      'goal-sofia-contato': ['💬', 'Contato com a Sofia'], 'goal-sofia-condicoes': ['🧭', 'Condições p/ Sofia'],
      'goal-sofia-encontro': ['❤️', 'Encontro com a Sofia'],
    };
    const gen = [];
    for (const id of Object.keys(GL)) {
      const emo = GL[id][0], nm = GL[id][1];
      gen.push({ id: id + '-ini', nome: 'Começo — ' + nm, icone: emo, desc: 'Primeira missão de "' + nm + '".', check: c => gMis(c, id) >= 1 });
      gen.push({ id: id + '-meio', nome: 'Metade — ' + nm, icone: emo, desc: 'Metade das missões de "' + nm + '".', check: c => gMis(c, id) >= 5 });
      gen.push({ id: id + '-ok', nome: 'Conquistado — ' + nm, icone: emo, desc: '"' + nm + '" conquistado.', check: c => done(c, id) });
    }
    const tiers = [];
    [30, 40, 60, 70, 80, 90, 110, 120, 130, 140, 160, 170, 180, 190, 220, 250, 280].forEach(n => tiers.push({ id: 'mis-' + n, nome: n + ' Missões', icone: '✓', desc: n + ' missões concluídas.', check: c => misFeitasTotal(c) >= n, meta: n, atualFn: c => misFeitasTotal(c) }));
    [3, 5, 10, 21, 45, 75, 90, 120, 150, 180, 200, 250, 300, 365].forEach(n => tiers.push({ id: 'st-' + n, nome: 'Streak de ' + n, icone: '🔥', desc: n + ' dias seguidos de check-in.', check: c => c.streak.atual >= n, meta: n, atualFn: c => c.streak.atual }));
    [5, 10, 25, 50, 75, 100, 150, 200, 300, 365].forEach(n => tiers.push({ id: 'ci-' + n, nome: n + ' Check-ins', icone: '📍', desc: n + ' check-ins no total.', check: c => (c.checkins || []).length >= n, meta: n, atualFn: c => (c.checkins || []).length }));
    const pool = gen.concat(tiers);
    const need = Math.max(0, 200 - curated.length);
    const badges = curated.concat(pool.slice(0, need));
    return {
      badges,
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
      { id: 'terco-7',     nome: 'Mariano',        icone: '📿', desc: '7 dias rezando o terço.',
        check: c => histCount(c.historico, 'terco', v => v >= 1) >= 7, meta: 7, atualFn: c => histCount(c.historico, 'terco', v => v >= 1) },
      { id: 'exame-7',     nome: 'Vigilante',      icone: '🕯️', desc: '7 exames de consciência.',
        check: c => histCount(c.historico, 'exame', v => v >= 1) >= 7, meta: 7, atualFn: c => histCount(c.historico, 'exame', v => v >= 1) },
      { id: 'oracao-mes',  nome: 'Constante',      icone: '🙌', desc: '30 dias de oração registrados.',
        check: c => histCount(c.historico, 'oracao', v => v >= 1) >= 30, meta: 30, atualFn: c => histCount(c.historico, 'oracao', v => v >= 1) },
      { id: 'confissao-em-dia', nome: 'Em Graça',  icone: '🤍', desc: 'Confissão nos últimos 30 dias.',
        check: c => { const d = c.campos.ultimaConfissao; if (!d) return false; const diff = (new Date(c.todayStr) - new Date(d + 'T00:00:00')) / 86400000; return diff >= 0 && diff <= 30; } },
      { id: 'retiro-fac',  nome: 'Coordenador',    icone: '⛺', desc: 'Viveu o retiro FAC.',
        check: c => { const d = c.campos.facData || '2026-07-02'; return new Date(c.todayStr) > new Date(d + 'T00:00:00'); } },
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
      { id: 'aplicou-7',   nome: 'Executor',      icone: '⚡', desc: '7 dias aplicando algo no Safra.',
        check: c => histCount(c.historico, 'apliquei', v => v >= 1) >= 7, meta: 7,
        atualFn: c => histCount(c.historico, 'apliquei', v => v >= 1) },
      { id: 'aplicou-30',  nome: 'Máquina',       icone: '🚀', desc: '30 dias aplicando no Safra.',
        check: c => histCount(c.historico, 'apliquei', v => v >= 1) >= 30, meta: 30,
        atualFn: c => histCount(c.historico, 'apliquei', v => v >= 1) },
      { id: 'leitor-tier', nome: 'Leitor',        icone: '📚', desc: '10 livros lidos.',
        check: c => c.livros.filter(l => l.feito).length >= 10, meta: 10,
        atualFn: c => c.livros.filter(l => l.feito).length },
      { id: 'bibliotecario', nome: 'Bibliotecário', icone: '🏛️', desc: '50 livros lidos.',
        check: c => c.livros.filter(l => l.feito).length >= 50, meta: 50,
        atualFn: c => c.livros.filter(l => l.feito).length },
      { id: 'skill-nivel5', nome: 'Especialista', icone: '🎯', desc: 'Uma skill no nível 5+.',
        check: c => c.skills.some(s => (1 + Math.floor((Number(s.xp) || 0) / 100)) >= 5) },
      { id: 'equilibrio',  nome: 'Equilíbrio',    icone: '☯️', desc: 'Descanso em dia E aplicou hoje.',
        check: c => Number(c.campos.apliquei) >= 1 && typeof c.campos.horasLazer === 'number'
          && c.campos.horasLazer >= (typeof c.campos.tetoLazerSemana === 'number' ? c.campos.tetoLazerSemana : 14) * 0.5 },
    ],
    missoes: [
      { id: 'aplicar-hoje', nome: 'Aplicar no Safra',  icone: '⚡', periodo: 'dia', xp: 2,
        check: c => Number(c.campos.apliquei) >= 1 },
      { id: 'ler-hoje',     nome: 'Ler hoje',          icone: '📖', periodo: 'dia', xp: 1,
        check: c => typeof c.campos.leituraMin === 'number' && c.campos.leituraMin >= 20 },
      { id: 'descansar',    nome: 'Descansar de verdade', icone: '🌿', periodo: 'dia', xp: 1,
        check: c => Number(c.campos.descansei) >= 1 },
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
