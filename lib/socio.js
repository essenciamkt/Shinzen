'use strict';

/* "Modo Sócio te cobra" — a voz do founder-advisor no hero.

   Heurística pura (sem LLM, no estilo de coach.js): lê os números do dia,
   detecta a PIOR condição (a que mais ameaça o caixa) e devolve uma frase de
   confronto. Variedade por rotação determinística pelo dia do ano (mesma
   condição → frase muda a cada dia, sem Math.random — igual à cápsula da Mente).

   Doutrina codificada estática: caixa primeiro, execução > dispersão,
   elogio só depois de bater a meta — e mesmo assim cobra o amanhã. */

const { parseYmd } = require('./dateutil');

const DIA_MS = 86400000;

function diaDoAno(today) {
  const d = parseYmd(today);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - jan1) / DIA_MS);
}

// Bancos por gatilho, em ordem de prioridade (o Sócio ataca o pior primeiro).
const BANCOS = {
  'caixa-vence': [
    'Tua meta de caixa vence em {dias}d e ela não se bate sozinha. Hoje fechou alguma venda?',
    'Faltam {dias}d pra meta de caixa. Não é hora de polir código — é hora de cobrar quem te deve e prospectar.',
    '{dias}d pro prazo do caixa. O relógio tá correndo contra ti. O que sai HOJE pra vender?',
  ],
  'sem-execucao': [
    'Zero hora de execução hoje. Caixa não cai do céu — bloqueia 1 bloco agora.',
    'Nenhum bloco de execução registrado. Dia sem deep-work é dia que te afasta da renda própria.',
    'Execução em branco hoje. Tá ocupado ou tá só ativo? Senta e faz o que vende.',
  ],
  'dispersao': [
    'Mais projeto de dispersão que de caixa marcado. Tá construindo o quê — patrimônio ou hobby?',
    'O foco tá puxando pra dispersão. Toda hora ali é hora que não virou venda. Corta.',
    'Tua atenção tá espalhada no que não paga. Escolhe o que dá caixa e mata o resto da semana.',
  ],
  'execucao-fraca': [
    'Começou a execução mas não fechou o bloco ({horas}/{meta}h). Meio-termo não bate meta.',
    '{horas}h de {meta}h. Tá no caminho — agora termina. O caixa premia quem fecha, não quem tenta.',
    'Ficou em {horas}h hoje. Falta pouco pro bloco cheio. Não para no 80%.',
  ],
  'dia-forte': [
    'Bateu a execução hoje. Bom. Agora repete amanhã — caixa não lembra de ontem.',
    'Bloco fechado e score em cima. É assim. Constância de 30 dias > pico de 1.',
    'Dia forte. Guarda a energia: o jogo é manter isso quando der preguiça.',
  ],
  'neutro': [
    'Pergunta de sócio: o que você fez hoje que te aproxima do primeiro R$10k de caixa?',
    'Sem drama hoje. Então capricha: 1 ação concreta de venda antes de dormir.',
    'Dia comum é onde a empresa se constrói. Escolhe 1 alavanca de caixa e puxa.',
  ],
};

function preencher(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

// areas: array de AreaObject já construído · meta: {caixaData,caixaValor,mrrAlvo} · config: {projectTags}
function build({ areas, meta, config, today, overall }) {
  const find = id => (areas || []).find(a => a.id === id) || null;
  const rotina = find('rotina');
  const exec = rotina && rotina.detalhe && rotina.detalhe.execucao;
  const horas = exec && typeof exec.horas === 'number' ? exec.horas : null;
  const metaExec = exec && exec.meta ? exec.meta : 3;

  const tags = (config && config.projectTags) || {};
  const vals = Object.values(tags);
  const nDisp = vals.filter(v => v === 'dispersao').length;
  const nCaixa = vals.filter(v => v === 'caixa').length;

  const diasCaixa = meta && meta.caixaData ? Math.round((parseYmd(meta.caixaData) - parseYmd(today)) / DIA_MS) : null;

  // Detecta o gatilho de maior prioridade (pior primeiro).
  let gatilho;
  const vars = { dias: diasCaixa, horas, meta: metaExec };
  if (diasCaixa != null && diasCaixa >= 0 && diasCaixa <= 7) gatilho = 'caixa-vence';
  else if (horas === 0 || horas == null) gatilho = 'sem-execucao';
  else if (nDisp > 0 && nDisp >= nCaixa) gatilho = 'dispersao';
  else if (horas < metaExec) gatilho = 'execucao-fraca';
  else if (exec && exec.bateuHoje && (overall == null || overall >= 65)) gatilho = 'dia-forte';
  else gatilho = 'neutro';

  const banco = BANCOS[gatilho];
  const frase = preencher(banco[diaDoAno(today) % banco.length], vars);
  return { frase, gatilho };
}

module.exports = { build };
