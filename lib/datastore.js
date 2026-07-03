'use strict';

const fs = require('fs');
const path = require('path');
const { APP_DIR } = require('./paths');
const { ymdLocal } = require('./dateutil');
const { periodoChave } = require('./progress');

const DATA_PATH = path.join(APP_DIR, 'data.json');
const BAK_PATH = DATA_PATH + '.bak';
const MAX_HISTORY = 90;
const MAX_SNAPSHOTS = 180;

const DEFAULT_DATA = {
  areas: {
    saude: {
      campos: {
        peso: null,
        pesoAlvo: null,
        sonoH: null,
        treinosSemana: 0,
        treinosMeta: 3,
      },
      historico: { peso: [], sonoH: [] },
      metasManual: {},
    },
  },
  areasOrder: ['claude-code', 'saude'],
  pesos: { 'claude-code': 1, saude: 1 },
};

function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const k of Object.keys(patch)) out[k] = deepMerge(out[k], patch[k]);
  return out;
}

/* ── Reinício diário ───────────────────────────────────────────────────────
   Campos de preenchimento DIÁRIO por área. No virar do dia eles voltam a
   "vazio" (null) pra não mostrar o dado de ontem como se fosse de hoje — o app
   é diário, não uma foto de um dia só. NADA se perde: o valor já está gravado,
   datado, em historico[campo] (todo daily field passa por pushHistory). O reset
   só tira do "vivo" o que não pertence a hoje.

   Fora daqui de propósito: peso (medida lenta, carrega), metas/alvos/settings
   (pesoAlvo, metaExecucao…) e contadores SEMANAIS — esses não são diários.
   Os semanais têm reset próprio em rolloverWeekly: treinosSemana e missasSemanais
   zeram; horasLazer arquiva no histórico e zera. voluntariado NÃO reseta: acumula. */
const DAILY_FIELDS = {
  saude:  ['sonoH', 'aguaL', 'calorias'],
  igreja: ['oracao', 'biblia', 'terco', 'exame'],
  rotina: ['produtividadeH', 'celularH', 'acordouCedo',
           'sysAcordar', 'sysOrar', 'sysPlano', 'sysBloco', 'sysDormir'],
  lazer:  ['leituraMin', 'apliquei', 'descansei'],
  mente:  ['ansiedade', 'humor', 'gratidaoHoje', 'fezReset'],
  diario: ['escritaHoje'],
};

// Campo foi preenchido HOJE? historico[campo] é ordenado por data asc, então o
// último ponto carrega a data mais recente. acordouCedo não tem histórico
// (efêmero por dia) → nunca "é de hoje" → sempre reinicia no virar do dia.
function _preenchidoHoje(area, campo, today) {
  const arr = area.historico && area.historico[campo];
  return Array.isArray(arr) && arr.length > 0 && arr[arr.length - 1].d === today;
}

// Zera os campos diários que não foram preenchidos hoje. Protegido por
// data.lastDay → roda 1× no 1º acesso de cada dia (demais leituras são no-op).
// Per-campo de propósito: no 1º deploy alguns campos podem já ser de hoje e
// outros de dias atrás; só os velhos somem. Retorna true se precisa persistir.
function rolloverDaily(data) {
  const today = ymdLocal();
  if (data.lastDay === today) return false; // já reiniciou hoje
  for (const [areaId, fields] of Object.entries(DAILY_FIELDS)) {
    const area = data.areas && data.areas[areaId];
    if (!area || !area.campos) continue;
    for (const f of fields) {
      if (area.campos[f] == null) continue;           // já vazio
      if (_preenchidoHoje(area, f, today)) continue;  // é de hoje → mantém
      area.campos[f] = null;                          // de ontem → sai do vivo
    }
  }
  data.lastDay = today;
  return true;
}

/* ── Reinício semanal ──────────────────────────────────────────────────────
   Contadores que medem "esta semana" voltam a 0 no virar da semana ISO (seg).
   Protegido por data.lastWeek → roda 1× no 1º acesso de cada semana nova.
   - zera: treinosSemana, missasSemanais (são placar da semana corrente).
   - arquiva-e-zera: horasLazer (historico:true) → o total da semana que fechou
     vira um ponto no histórico (carimbado no domingo que fechou) antes de zerar,
     pra não perder o dado da semana.
   - voluntariado fica DE FORA: é contador acumulado, não placar semanal. */
const WEEKLY_RESET = {
  saude:  [{ campo: 'treinosSemana' }],
  igreja: [{ campo: 'missasSemanais' }],
  lazer:  [{ campo: 'horasLazer', arquiva: true }],
};

// Domingo que fechou a semana ISO anterior a `todayStr` (carimbo do arquivo).
function _fimSemanaAnterior(todayStr) {
  const d = new Date(todayStr + 'T00:00:00');
  const isoDow = (d.getDay() + 6) % 7;   // seg=0 … dom=6
  d.setDate(d.getDate() - isoDow - 1);   // recua pro domingo anterior
  return ymdLocal(d);
}

function rolloverWeekly(data) {
  const wk = periodoChave('semana', ymdLocal()); // "YYYY-Www"
  if (data.lastWeek === wk) return false;         // já reiniciou esta semana
  // 1º run (lastWeek ausente): só carimba a semana atual como baseline. NÃO zera,
  // senão a semana corrente (em andamento) é apagada no primeiro acesso.
  if (data.lastWeek == null) { data.lastWeek = wk; return true; }
  const stamp = _fimSemanaAnterior(ymdLocal());
  for (const [areaId, fields] of Object.entries(WEEKLY_RESET)) {
    const area = data.areas && data.areas[areaId];
    if (!area || !area.campos) continue;
    for (const { campo, arquiva } of fields) {
      const val = area.campos[campo];
      if (typeof val !== 'number') continue; // nada a zerar
      if (arquiva && val !== 0) {
        if (!area.historico) area.historico = {};
        if (!Array.isArray(area.historico[campo])) area.historico[campo] = [];
        const arr = area.historico[campo];
        const idx = arr.findIndex(p => p.d === stamp);
        if (idx >= 0) arr[idx].v = val; else arr.push({ d: stamp, v: val });
        arr.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
        if (arr.length > MAX_HISTORY) area.historico[campo] = arr.slice(-MAX_HISTORY);
      }
      area.campos[campo] = 0;
    }
  }
  data.lastWeek = wk;
  return true;
}

// Normaliza shape + roda migração/seed. Lança se não for objeto (= corrompido).
function _hydrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data.json não é um objeto');
  if (!data.areas) data.areas = {};
  if (!data.areasOrder) data.areasOrder = DEFAULT_DATA.areasOrder.slice();
  if (!data.pesos) data.pesos = { ...DEFAULT_DATA.pesos };
  // seed/migração de Metas: re-seeda quando a versão do seed muda. Grava 1×.
  if (data.areas.metas && data.areas.metas.seedV !== SEED_V) {
    data.areas.metas.goals = seedMetasGoals();
    data.areas.metas.seedV = SEED_V;
    try { writeRaw(data); } catch {}
  }
  // Reinício diário + semanal: no 1º acesso do dia/semana, campos vencidos voltam
  // ao vazio/0 (histórico preservado). Guardados por data.lastDay / data.lastWeek.
  let mutated = false;

  // Migração única: journal antigo (lista simples, sem data) virou a área Diário
  // (capítulo→aventura→entrada, datado). Decisão: não migra conteúdo, descarta.
  if (data.areas.mente && data.areas.mente.journal) { delete data.areas.mente.journal; mutated = true; }
  if (rolloverDaily(data)) mutated = true;
  if (rolloverWeekly(data)) mutated = true;
  if (mutated) { try { writeRaw(data); } catch {} }
  return data;
}

function readData() {
  // ── Leitura local (disco) ──
  let raw = null;
  try { raw = fs.readFileSync(DATA_PATH, 'utf8'); } catch { raw = null; }

  if (raw != null && raw.trim() !== '') {
    try {
      return _hydrate(JSON.parse(raw));
    } catch {
      try {
        const stamp = ymdLocal() + '-' + Date.now();
        fs.renameSync(DATA_PATH, DATA_PATH.replace(/\.json$/, '') + '.corrupt-' + stamp + '.json');
      } catch {}
      try {
        const data = _hydrate(JSON.parse(fs.readFileSync(BAK_PATH, 'utf8')));
        writeRaw(data);
        return data;
      } catch {}
    }
  }

  const data = _hydrate(JSON.parse(JSON.stringify(DEFAULT_DATA)));
  try { writeRaw(data); } catch {}
  return data;
}

// Escrita atômica em disco (temp+rename, nunca trunca data.json).
function writeRaw(data) {
  const json = JSON.stringify(data, null, 2);
  try { if (fs.existsSync(DATA_PATH)) fs.copyFileSync(DATA_PATH, BAK_PATH); } catch {}
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, DATA_PATH);
  return data;
}

// Snapshot do score do dia (upsert idempotente, 1 por dia). Alimenta a tendência.
// Não grava se o snapshot de hoje não mudou (evita write-amplification no rebuild de cache).
function recordScoreSnapshot(dateStr, life) {
  const data = readData();
  if (!Array.isArray(data.scoreHistory)) data.scoreHistory = [];
  const areasScore = {};
  for (const a of (life.porArea || [])) areasScore[a.id] = a.score;
  const entry = { date: dateStr, overall: life.overall, areas: areasScore };
  const idx = data.scoreHistory.findIndex(s => s.date === dateStr);
  if (idx >= 0) {
    if (JSON.stringify(data.scoreHistory[idx]) === JSON.stringify(entry)) return data.scoreHistory;
    data.scoreHistory[idx] = entry;
  } else {
    data.scoreHistory.push(entry);
  }
  if (data.scoreHistory.length > MAX_SNAPSHOTS) data.scoreHistory = data.scoreHistory.slice(-MAX_SNAPSHOTS);
  writeRaw(data);
  return data.scoreHistory;
}

function writeData(patch) {
  return writeRaw(deepMerge(readData(), patch));
}

function writeArea(areaId, areaPatch) {
  return writeData({ areas: { [areaId]: areaPatch } });
}

// Garante que a área existe com o shape completo (idempotente).
function ensureArea(data, areaId) {
  if (!data.areas[areaId]) data.areas[areaId] = {};
  const area = data.areas[areaId];
  if (!area.campos || typeof area.campos !== 'object') area.campos = {};
  if (!area.historico || typeof area.historico !== 'object') area.historico = {};
  if (!area.metasManual || typeof area.metasManual !== 'object') area.metasManual = {};
  if (!area.metasTexto || typeof area.metasTexto !== 'object') area.metasTexto = {};
  if (!area.progresso || typeof area.progresso !== 'object') area.progresso = {};
  const p = area.progresso;
  if (!Array.isArray(p.checkins)) p.checkins = [];
  if (typeof p.recordeStreak !== 'number') p.recordeStreak = 0;
  if (!Array.isArray(p.badgesUnlocked)) p.badgesUnlocked = [];
  if (!p.missoesLog || typeof p.missoesLog !== 'object') p.missoesLog = {};
  if (!Array.isArray(area.clientes)) area.clientes = [];
  if (!Array.isArray(area.goals)) area.goals = [];
  if (!Array.isArray(area.treinos)) area.treinos = [];
  if (!Array.isArray(area.intencoes)) area.intencoes = [];
  if (!Array.isArray(area.devocoes)) area.devocoes = [];
  if (!Array.isArray(area.facPrep)) area.facPrep = [];
  if (!Array.isArray(area.livros)) area.livros = [];
  if (!Array.isArray(area.skills)) area.skills = [];
  if (!Array.isArray(area.gratidoes)) area.gratidoes = [];
  if (!Array.isArray(area.capsula)) area.capsula = [];
  if (!Array.isArray(area.capitulos)) area.capitulos = [];
  if (!Array.isArray(area.aventuras)) area.aventuras = [];
  if (!Array.isArray(area.entradas)) area.entradas = [];
  return area;
}

const ESTAGIOS = ['lead', 'negociando', 'fechado', 'entregando', 'pago'];

// ── GOALS / SONHOS (área Metas) ──
const FONTES_RITMO = ['mrr', 'savings'];
const TRACKS = ['renda', 'patrimonio', 'corpo', 'idioma', 'mentalidade', 'lideranca', 'experiencias', 'sofia'];
const SEED_V = 5;

// Formata valor pra degrau da escada: R$1 mil / R$500 mil / R$1 milhão.
function fmtMoneySeed(n) {
  if (n >= 1e6) {
    const mi = n / 1e6;
    const s = Number.isInteger(mi) ? String(mi) : mi.toFixed(1).replace('.', ',');
    return 'R$' + s + (mi === 1 ? ' milhão' : ' milhões');
  }
  if (n >= 1000) {
    const mil = n / 1000;
    const s = Number.isInteger(mil) ? String(mil) : mil.toFixed(1).replace('.', ',');
    return 'R$' + s + ' mil';
  }
  return 'R$' + n;
}

// Seed v5: objetivos datados do Emanuel, em 8 categorias (track), e CADA meta
// com 10 missões em ordem. Datas acordadas (agressivas). Metas de dinheiro
// ganham escada de 10 degraus até o alvo; as demais têm caminho próprio.
function seedMetasGoals() {
  const mis = (...txts) => txts.map((t, i) => ({ id: 'm' + (i + 1), texto: t, feito: false }));
  // escada de 10 degraus (10%..100% do alvo) com sufixo (/mês, acumulado...).
  const FRACS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const ladder = (alvo, suf) => mis(...FRACS.map(f => fmtMoneySeed(Math.round(alvo * f)) + suf));
  const g = (id, titulo, emoji, track, fonteRitmo, custo, prazo, extra) => Object.assign(
    { id, titulo, emoji, porque: '', track, fonteRitmo, custo, prazo, estrela: false, feito: false, missoes: [] },
    extra || {});
  const goals = [];

  // ── Financeiro: Renda/mês (escada de degraus mensais) ──
  const renda = [['R$10 mil/mês', 10e3, '2026-08-08'], ['R$20 mil/mês', 20e3, '2026-09-17'], ['R$30 mil/mês', 30e3, '2026-10-29'], ['R$50 mil/mês', 50e3, '2027-02-18'], ['R$80 mil/mês', 80e3, '2027-04-27'], ['R$100 mil/mês', 100e3, '2027-06-09']];
  renda.forEach(([t, v, p], i) => goals.push(g('goal-renda-' + i, t, '💸', 'renda', 'mrr', v, p, { missoes: ladder(v, '/mês recorrente') })));

  // ── Financeiro: Patrimônio / caixa (escada acumulada) ──
  const patr = [['R$10 mil em caixa', 10e3, '2026-07-12'], ['R$50 mil em caixa', 50e3, '2026-09-30'], ['R$100 mil de patrimônio', 100e3, '2026-12-22'], ['R$500 mil de patrimônio', 500e3, '2027-08-14'], ['R$1 milhão', 1e6, '2027-11-19']];
  patr.forEach(([t, v, p], i) => goals.push(g('goal-patr-' + i, t, '🏦', 'patrimonio', 'savings', v, p, { missoes: ladder(v, ' acumulado') })));

  // ── Corpo ──
  goals.push(g('goal-abdomen', 'Abdômen visível', '🔥', 'corpo', null, 0, '2026-09-20', { missoes: mis('Foto e medida inicial', 'Cortar açúcar e ultraprocessado', 'Treino 3×/semana fixo', 'Definir o déficit calórico', '4 semanas seguidas treinando', 'Primeiro -2kg de gordura', 'Cardio 2×/semana', 'Prancha de 2 minutos', '8 semanas seguidas', 'Abdômen visível no espelho') }));
  goals.push(g('goal-shape', 'Shape que chama atenção na sala', '💪', 'corpo', null, 0, '2027-02-15', { missoes: mis('Abdômen visível atingido', 'Montar plano de hipertrofia', 'Treino 4-5×/semana', 'Registrar progressão de carga', 'Bater a meta diária de proteína', 'Sono de 7h+ consistente', 'Primeiro ganho visível de massa', '12 semanas de consistência', 'Postura e presença treinadas', 'Entrar na sala e virar cabeças') }));
  goals.push(g('goal-condicionamento', 'Excelente condicionamento', '🏃', 'corpo', null, 0, '2027-05-03', { missoes: mis('Teste de base (corrida/FC)', 'Correr 2×/semana', 'Correr 5km sem parar', 'Incluir HIIT', 'Mobilidade na rotina', 'FC de repouso caindo', 'Correr 10km sem parar', 'Recuperação rápida pós-treino', 'Subir escada sem cansar', 'Condicionamento de atleta') }));

  // ── Idiomas ──
  goals.push(g('goal-ingles', 'Conversa natural em inglês', '🇺🇸', 'idioma', null, 0, '2026-10-01', { missoes: mis('Teste de nível atual', '30 min/dia de input', '500 palavras-chave', 'Falar sozinho 10 min/dia', '1ª conversa com nativo (app)', 'Pensar em inglês 1h/dia', 'Assistir sem legenda', 'Conversa de 30 min sem travar', 'Call de trabalho em inglês', 'Conversa natural, sem medo') }));
  goals.push(g('goal-espanhol', 'Fluente em espanhol', '🇪🇸', 'idioma', null, 0, '2027-01-18', { missoes: mis('Aproveitar a base do português', '20 min/dia de estudo', '500 palavras', 'Gramática essencial', 'Primeira conversa', 'Consumir conteúdo nativo', 'Escrever sem traduzir', 'Conversa de 30 min', 'Pensar em espanhol', 'Fluente') }));

  // ── Mentalidade ──
  goals.push(g('goal-100dias', '100 dias seguidos sem abandonar a execução', '🔁', 'mentalidade', null, 0, '2026-09-27', { missoes: mis('Definir a execução mínima diária', 'Dia 1 marcado', '7 dias seguidos', '21 dias (vira hábito)', '30 dias', 'Atravessar 1 recaída sem parar', '50 dias', '75 dias', '90 dias', '100 dias') }));
  goals.push(g('goal-vender-olhos', 'Vender olhando nos olhos sem medo', '👁️', 'mentalidade', null, 0, '2026-07-31', { missoes: mis('Decorar o script da oferta', 'Treinar no espelho', 'Pitch pra 1 amigo', '1ª oferta presencial', 'Aguentar o silêncio pós-preço', 'Ouvir "não" sem desmontar', '1ª venda presencial', 'Contornar 1 objeção ao vivo', 'Vender sem decoreba', 'Vender olhando nos olhos, calmo') }));
  goals.push(g('goal-venda-10k', 'Fechar uma venda de R$10 mil sozinho', '🤝', 'mentalidade', null, 0, '2026-12-13', { missoes: mis('Definir a oferta de R$10k', 'Identificar quem paga R$10k', 'Lista de 10 prospects', '1ª reunião marcada', 'Apresentar a proposta', 'Negociar sem dar desconto à toa', 'Mandar a proposta formal', 'Follow-up sem medo', 'Contornar a objeção final', 'R$10k fechado sozinho') }));
  goals.push(g('goal-venda-100k', 'Fechar uma venda de R$100 mil', '💼', 'mentalidade', null, 0, '2027-11-08', { missoes: mis('Ter um caso de R$10k provado', 'Construir a oferta de R$100k', 'Mapear cliente desse porte', 'Entrar pela indicação certa', 'Reunião com o decisor', 'Diagnóstico do problema dele', 'Proposta de alto valor', 'Várias rodadas de negociação', 'Contrato revisado', 'R$100k assinado') }));

  // ── Liderança ──
  goals.push(g('goal-1a-pessoa', 'Primeira pessoa trabalhando comigo', '🧑‍🤝‍🧑', 'lideranca', null, 0, '2026-08-21', { missoes: mis('Listar o que tira o meu tempo', 'Definir a 1ª função a delegar', 'Caixa pra pagar alguém', 'Escrever a vaga/tarefa', 'Achar candidatos', '1º teste pago pequeno', 'Treinar a pessoa', 'Delegar de verdade (soltar)', '1ª entrega feita por ela', 'Alguém trabalhando comigo') }));
  goals.push(g('goal-time', 'Primeiro pequeno time', '👥', 'lideranca', null, 0, '2027-03-11', { missoes: mis('1ª pessoa funcionando bem', 'Mapear 2ª e 3ª funções', 'Processos escritos', 'Contratar a 2ª pessoa', 'Contratar a 3ª', 'Rotina de alinhamento semanal', 'Cada um com meta clara', 'Time entrega sem apagar incêndio', 'Cultura mínima definida', 'Pequeno time rodando') }));
  goals.push(g('goal-empresa-roda', 'Empresa roda sem depender de mim', '🏢', 'lideranca', null, 0, '2027-12-09', { missoes: mis('Time formado', 'Documentar todo processo-chave', 'Indicadores no painel', 'Delegar decisões do dia a dia', 'Um gestor/COO no lugar', 'Sair 1 semana sem quebrar', 'Vendas sem eu vender', 'Entrega sem eu entregar', 'Sair 1 mês sem quebrar', 'Empresa roda sem mim') }));

  // ── Experiências ──
  goals.push(g('goal-1o-mes-renda', '1º mês vivendo 100% da própria renda', '💵', 'experiencias', null, 0, '2026-08-31', { missoes: mis('Calcular meu custo de vida', 'Renda cobre 50% do custo', 'Renda cobre 80%', 'Renda cobre 100% uma vez', 'Reserva de 1 mês guardada', 'Zerar a dependência financeira', 'Pagar minhas contas sozinho', 'Renda cobre o custo 2 meses seguidos', 'Sobra no fim do mês', '1 mês 100% da própria renda') }));
  goals.push(g('goal-morar-sozinho', '1ª temporada morando sozinho', '🏠', 'experiencias', null, 0, '2026-10-03', { missoes: mis('Definir cidade/lugar', 'Orçar o custo mensal', 'Reserva pra 3 meses', 'Renda recorrente que sustenta', 'Achar o lugar', 'Falar com a família', 'Mobiliar o básico', 'Mudança feita', '1ª semana sozinho', 'Temporada morando sozinho') }));
  goals.push(g('goal-viagem-intl', 'Primeira viagem internacional', '✈️', 'experiencias', null, 0, '2026-12-18', { missoes: mis('Tirar/renovar o passaporte', 'Escolher o destino', 'Orçar a viagem', 'Guardar o valor (sem mexer na reserva)', 'Comprar a passagem', 'Reservar hospedagem', 'Visto/documentos se precisar', 'Roteiro montado', 'Mala pronta', 'Pisar fora do Brasil') }));
  goals.push(g('goal-porsche', 'Comprar a Porsche', '🏎️', 'experiencias', 'savings', 350000, '2027-05-08', { porque: 'Consequência do trabalho.', missoes: mis('Patrimônio de R$100k', 'Definir o modelo', 'Tirar a carteira', 'Patrimônio de R$500k', 'Reserva intacta pós-compra', 'Achar a unidade certa', 'Test drive', 'Negociar', 'Pagar à vista', 'Dirigir a Porsche') }));

  // ── Sofia ──
  goals.push(g('goal-sofia-contato', 'Primeiro contato significativo', '💬', 'sofia', null, 0, '2026-09-15', { porque: 'Ou fortalecer o contato, se já existir.', missoes: mis('Clareza do que eu quero dizer', 'Reabrir/manter o canal de contato', '1ª mensagem honesta', 'Conversa fluindo', 'Saber da vida dela hoje', 'Mostrar quem eu virei (sem provar nada)', 'Conversa profunda', 'Combinar de falar com frequência', 'Ela sabe da minha intenção', 'Contato significativo de verdade') }));
  goals.push(g('goal-sofia-condicoes', 'Em condições reais de viajar até ela', '🧭', 'sofia', null, 0, '2027-03-20', { porque: 'Sem colocar a vida financeira em risco.', missoes: mis('Contato significativo mantido', 'Saber onde ela está', 'Renda recorrente estável', 'Reserva intacta pra viagem', 'Passaporte pronto', 'Inglês pra me virar lá', 'Orçar a viagem inteira', 'Não comprometer o caixa da empresa', 'Janela de tempo possível', 'Em condições reais de ir') }));
  goals.push(g('goal-sofia-encontro', 'Encontro presencial', '❤️', 'sofia', null, 0, '2027-06-12', { estrela: true, porque: 'O encontro que move tudo.', missoes: mis('Condições reais atingidas', 'Alinhar o encontro com ela', 'Comprar a passagem', 'Planejar os dias lá', 'Hospedagem reservada', 'Chegar aos EUA', 'Primeiro olho no olho', 'O encontro', 'Viver o momento sem pressa', 'Encontro presencial realizado') }));

  return goals;
}

function addGoal(areaId, obj) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const goal = {
    id: 'goal-' + Date.now(),
    titulo: String(obj.titulo || '').slice(0, 120),
    emoji: String(obj.emoji || '🎯').slice(0, 8),
    porque: String(obj.porque || '').slice(0, 160),
    fonteRitmo: FONTES_RITMO.includes(obj.fonteRitmo) ? obj.fonteRitmo : null,
    track: TRACKS.includes(obj.track) ? obj.track : 'jornada',
    custo: Number(obj.custo) || 0,
    prazo: typeof obj.prazo === 'string' ? obj.prazo.slice(0, 10) : null,
    estrela: !!obj.estrela,
    feito: !!obj.feito,
    missoes: [],
  };
  if (goal.estrela) area.goals.forEach(g => { g.estrela = false; });
  area.goals.push(goal);
  writeRaw(data);
  return goal;
}

function updateGoal(areaId, gid, patch) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const g = area.goals.find(x => x.id === gid);
  if (!g) return null;
  if (patch.titulo !== undefined) g.titulo = String(patch.titulo).slice(0, 120);
  if (patch.emoji !== undefined) g.emoji = String(patch.emoji).slice(0, 8);
  if (patch.porque !== undefined) g.porque = String(patch.porque).slice(0, 160);
  if (patch.fonteRitmo !== undefined) g.fonteRitmo = FONTES_RITMO.includes(patch.fonteRitmo) ? patch.fonteRitmo : null;
  if (patch.track !== undefined && TRACKS.includes(patch.track)) g.track = patch.track;
  if (patch.custo !== undefined) g.custo = Number(patch.custo) || 0;
  if (patch.prazo !== undefined) g.prazo = patch.prazo ? String(patch.prazo).slice(0, 10) : null;
  if (patch.feito !== undefined) g.feito = !!patch.feito;
  if (patch.estrela !== undefined) {
    g.estrela = !!patch.estrela;
    if (g.estrela) area.goals.forEach(x => { if (x.id !== gid) x.estrela = false; });
  }
  writeRaw(data);
  return g;
}

function deleteGoal(areaId, gid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.goals.length;
  area.goals = area.goals.filter(g => g.id !== gid);
  writeRaw(data);
  return { removed: n !== area.goals.length };
}

// ── MISSÕES de um goal (os passos em ordem) ──
function _goal(area, gid) {
  const g = area.goals.find(x => x.id === gid);
  if (g && !Array.isArray(g.missoes)) g.missoes = [];
  return g;
}
function addMissao(areaId, gid, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const g = _goal(area, gid);
  if (!g) return null;
  const m = { id: 'm-' + Date.now(), texto: String(texto || '').slice(0, 140), feito: false };
  g.missoes.push(m);
  writeRaw(data);
  return m;
}
function toggleMissao(areaId, gid, mid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const g = _goal(area, gid);
  if (!g) return null;
  const m = g.missoes.find(x => x.id === mid);
  if (!m) return null;
  m.feito = !m.feito;
  // mantém o goal coerente: meta com todas as missões feitas = conquistada (badges/atingido).
  if (g.missoes.length) g.feito = g.missoes.every(x => x.feito);
  writeRaw(data);
  return m;
}
function editMissao(areaId, gid, mid, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const g = _goal(area, gid);
  if (!g) return null;
  const m = g.missoes.find(x => x.id === mid);
  if (!m) return null;
  m.texto = String(texto || '').slice(0, 140);
  writeRaw(data);
  return m;
}
function deleteMissao(areaId, gid, mid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const g = _goal(area, gid);
  if (!g) return null;
  g.missoes = g.missoes.filter(x => x.id !== mid);
  writeRaw(data);
  return { ok: true };
}

// ── TREINOS (área Saúde) + EXERCÍCIOS aninhados ──
const TIPOS_TREINO = ['forca', 'cardio', 'mobilidade', 'outro'];

function addTreino(areaId, obj) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const t = {
    id: 'treino-' + Date.now(),
    nome: String(obj.nome || '').slice(0, 120),
    tipo: TIPOS_TREINO.includes(obj.tipo) ? obj.tipo : 'forca',
    dia: String(obj.dia || '').slice(0, 12),
    duracao: Number(obj.duracao) || 0,
    feito: false,
    exercicios: [],
  };
  area.treinos.push(t);
  writeRaw(data);
  return t;
}

function updateTreino(areaId, tid, patch) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const t = area.treinos.find(x => x.id === tid);
  if (!t) return null;
  if (patch.nome !== undefined) t.nome = String(patch.nome).slice(0, 120);
  if (patch.tipo !== undefined && TIPOS_TREINO.includes(patch.tipo)) t.tipo = patch.tipo;
  if (patch.dia !== undefined) t.dia = String(patch.dia).slice(0, 12);
  if (patch.duracao !== undefined) t.duracao = Number(patch.duracao) || 0;
  if (patch.feito !== undefined) t.feito = !!patch.feito;
  writeRaw(data);
  return t;
}

function deleteTreino(areaId, tid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.treinos.length;
  area.treinos = area.treinos.filter(x => x.id !== tid);
  writeRaw(data);
  return { removed: n !== area.treinos.length };
}

function _treino(area, tid) {
  const t = area.treinos.find(x => x.id === tid);
  if (t && !Array.isArray(t.exercicios)) t.exercicios = [];
  return t;
}
function addExercicio(areaId, tid, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const t = _treino(area, tid);
  if (!t) return null;
  const x = { id: 'ex-' + Date.now(), texto: String(texto || '').slice(0, 140), feito: false };
  t.exercicios.push(x);
  writeRaw(data);
  return x;
}
function toggleExercicio(areaId, tid, xid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const t = _treino(area, tid);
  if (!t) return null;
  const x = t.exercicios.find(e => e.id === xid);
  if (!x) return null;
  x.feito = !x.feito;
  if (t.exercicios.length) t.feito = t.exercicios.every(e => e.feito);
  writeRaw(data);
  return x;
}
function editExercicio(areaId, tid, xid, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const t = _treino(area, tid);
  if (!t) return null;
  const x = t.exercicios.find(e => e.id === xid);
  if (!x) return null;
  x.texto = String(texto || '').slice(0, 140);
  writeRaw(data);
  return x;
}
function deleteExercicio(areaId, tid, xid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const t = _treino(area, tid);
  if (!t) return null;
  t.exercicios = t.exercicios.filter(e => e.id !== xid);
  writeRaw(data);
  return { ok: true };
}

// ── LISTAS GENÉRICAS (intenções / devoções / preparo-FAC — área Igreja) ──
const LISTAS = ['intencoes', 'devocoes', 'facPrep', 'livros', 'gratidoes', 'capsula'];
function _lista(area, lista) {
  if (!LISTAS.includes(lista)) return null;
  if (!Array.isArray(area[lista])) area[lista] = [];
  return area[lista];
}
function addListItem(areaId, lista, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const arr = _lista(area, lista);
  if (!arr) return null;
  const item = { id: lista.slice(0, 3) + '-' + Date.now(), texto: String(texto || '').slice(0, 160), feito: false };
  arr.push(item);
  writeRaw(data);
  return item;
}
function toggleListItem(areaId, lista, iid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const arr = _lista(area, lista);
  if (!arr) return null;
  const it = arr.find(x => x.id === iid);
  if (!it) return null;
  it.feito = !it.feito;
  writeRaw(data);
  return it;
}
function editListItem(areaId, lista, iid, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const arr = _lista(area, lista);
  if (!arr) return null;
  const it = arr.find(x => x.id === iid);
  if (!it) return null;
  it.texto = String(texto || '').slice(0, 160);
  writeRaw(data);
  return it;
}
function deleteListItem(areaId, lista, iid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const arr = _lista(area, lista);
  if (!arr) return null;
  const n = arr.length;
  area[lista] = arr.filter(x => x.id !== iid);
  writeRaw(data);
  return { removed: n !== area[lista].length };
}

// ── SKILLS (skill tree — área Lazer & Crescimento; tem XP/nível, não cabe no CRUD de lista) ──
const XP_POR_NIVEL = 100;
function _nivelDe(xp) { return 1 + Math.floor(Math.max(0, xp) / XP_POR_NIVEL); }
function addSkill(areaId, nome) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const nm = String(nome || '').trim().slice(0, 60);
  if (!nm) return null;
  const skill = { id: 'sk-' + Date.now(), nome: nm, nivel: 1, xp: 0 };
  area.skills.push(skill);
  writeRaw(data);
  return skill;
}
function skillXp(areaId, id, delta) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const sk = area.skills.find(s => s.id === id);
  if (!sk) return null;
  sk.xp = Math.max(0, (Number(sk.xp) || 0) + (Number(delta) || 0));
  sk.nivel = _nivelDe(sk.xp);
  writeRaw(data);
  return sk;
}
function editSkill(areaId, id, nome) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const sk = area.skills.find(s => s.id === id);
  if (!sk) return null;
  const nm = String(nome || '').trim().slice(0, 60);
  if (!nm) return null;
  sk.nome = nm;
  writeRaw(data);
  return sk;
}
function deleteSkill(areaId, id) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.skills.length;
  area.skills = area.skills.filter(s => s.id !== id);
  writeRaw(data);
  return { removed: n !== area.skills.length };
}

function addCliente(areaId, obj) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const cli = {
    id: 'cli-' + Date.now(),
    nome: String(obj.nome || '').slice(0, 80),
    produto: String(obj.produto || '').slice(0, 80),
    valor: Number(obj.valor) || 0,
    estagio: ESTAGIOS.includes(obj.estagio) ? obj.estagio : 'lead',
    proximaAcao: String(obj.proximaAcao || '').slice(0, 120),
    prazo: typeof obj.prazo === 'string' ? obj.prazo.slice(0, 10) : null,
  };
  area.clientes.push(cli);
  writeRaw(data);
  return cli;
}

function updateCliente(areaId, cid, patch) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const cli = area.clientes.find(c => c.id === cid);
  if (!cli) return null;
  if (patch.nome !== undefined) cli.nome = String(patch.nome).slice(0, 80);
  if (patch.produto !== undefined) cli.produto = String(patch.produto).slice(0, 80);
  if (patch.valor !== undefined) cli.valor = Number(patch.valor) || 0;
  if (patch.estagio !== undefined && ESTAGIOS.includes(patch.estagio)) cli.estagio = patch.estagio;
  if (patch.proximaAcao !== undefined) cli.proximaAcao = String(patch.proximaAcao).slice(0, 120);
  if (patch.prazo !== undefined) cli.prazo = patch.prazo ? String(patch.prazo).slice(0, 10) : null;
  writeRaw(data);
  return cli;
}

function deleteCliente(areaId, cid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.clientes.length;
  area.clientes = area.clientes.filter(c => c.id !== cid);
  writeRaw(data);
  return { removed: n !== area.clientes.length };
}

// Maior sequência de dias consecutivos num array de "YYYY-MM-DD".
function longestStreak(dates) {
  if (!dates || !dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const today = new Date(sorted[i] + 'T00:00:00');
    const diff = Math.round((today - prev) / 86400000);
    if (diff === 1) { cur++; if (cur > best) best = cur; }
    else if (diff > 1) cur = 1;
  }
  return best;
}

function pushHistory(areaId, campo, valor, dateStr) {
  const data = readData();
  const area = ensureArea(data, areaId);
  if (!area.historico) area.historico = {};
  if (!Array.isArray(area.historico[campo])) area.historico[campo] = [];
  const arr = area.historico[campo];
  const num = Number(valor);
  const idx = arr.findIndex(p => p.d === dateStr);
  if (idx >= 0) arr[idx].v = num;
  else arr.push({ d: dateStr, v: num });
  arr.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (arr.length > MAX_HISTORY) area.historico[campo] = arr.slice(-MAX_HISTORY);
  if (!area.campos) area.campos = {};
  area.campos[campo] = num;
  return writeRaw(data);
}

function addMeta(areaId, metaId, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  area.metasManual[metaId] = false;
  area.metasTexto[metaId] = texto;
  return writeRaw(data);
}

function editMeta(areaId, metaId, texto) {
  const data = readData();
  const area = ensureArea(data, areaId);
  area.metasTexto[metaId] = texto;
  return writeRaw(data);
}

function deleteMeta(areaId, metaId) {
  const data = readData();
  const area = ensureArea(data, areaId);
  delete area.metasManual[metaId];
  delete area.metasTexto[metaId];
  return writeRaw(data);
}

// Toggle do check-in diário. Retorna estado novo (feito após a operação).
function doCheckin(areaId, dateStr) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const arr = area.progresso.checkins;
  const idx = arr.indexOf(dateStr);
  let feito;
  if (idx >= 0) { arr.splice(idx, 1); feito = false; }
  else { arr.push(dateStr); feito = true; }
  arr.sort();
  area.progresso.recordeStreak = Math.max(area.progresso.recordeStreak || 0, longestStreak(arr));
  writeRaw(data);
  return { feito };
}

// Toggle de missão manual. Grava a data em que foi concluída (ou remove).
function logMissao(areaId, missaoId, dateStr) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const log = area.progresso.missoesLog;
  let feita;
  if (log[missaoId] === dateStr) { delete log[missaoId]; feita = false; }
  else { log[missaoId] = dateStr; feita = true; }
  writeRaw(data);
  return { feita };
}

// Sticky: desbloqueia badge permanentemente. No-op se já desbloqueada.
function unlockBadge(areaId, badgeId) {
  const data = readData();
  const area = ensureArea(data, areaId);
  if (!area.progresso.badgesUnlocked.includes(badgeId)) {
    area.progresso.badgesUnlocked.push(badgeId);
    writeRaw(data);
    return true;
  }
  return false;
}

// ── DIÁRIO (Capítulo → Aventura → Entrada; escrita livre, sem métrica de desempenho) ──
function addCapitulo(areaId, titulo) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const c = { id: 'cap-' + Date.now(), titulo: String(titulo || '').slice(0, 80), ordem: area.capitulos.length };
  area.capitulos.push(c);
  writeRaw(data);
  return c;
}
function editCapitulo(areaId, cid, titulo) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const c = area.capitulos.find(x => x.id === cid);
  if (!c) return null;
  c.titulo = String(titulo || '').slice(0, 80);
  writeRaw(data);
  return c;
}
function deleteCapitulo(areaId, cid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const avIds = new Set(area.aventuras.filter(a => a.capituloId === cid).map(a => a.id));
  area.capitulos = area.capitulos.filter(c => c.id !== cid);
  area.aventuras = area.aventuras.filter(a => a.capituloId !== cid);
  area.entradas = area.entradas.filter(e => !avIds.has(e.aventuraId));
  writeRaw(data);
  return { ok: true };
}

function addAventura(areaId, capituloId, titulo) {
  const data = readData();
  const area = ensureArea(data, areaId);
  if (!area.capitulos.some(c => c.id === capituloId)) return null;
  const a = { id: 'av-' + Date.now(), capituloId, titulo: String(titulo || '').slice(0, 80), ordem: area.aventuras.filter(x => x.capituloId === capituloId).length };
  area.aventuras.push(a);
  writeRaw(data);
  return a;
}
function editAventura(areaId, aid, titulo) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const a = area.aventuras.find(x => x.id === aid);
  if (!a) return null;
  a.titulo = String(titulo || '').slice(0, 80);
  writeRaw(data);
  return a;
}
function deleteAventura(areaId, aid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  area.aventuras = area.aventuras.filter(a => a.id !== aid);
  area.entradas = area.entradas.filter(e => e.aventuraId !== aid);
  writeRaw(data);
  return { ok: true };
}

function addEntrada(areaId, aventuraId, obj) {
  const data = readData();
  const area = ensureArea(data, areaId);
  if (!area.aventuras.some(a => a.id === aventuraId)) return null;
  const now = Date.now();
  const today = ymdLocal();
  const dataStr = typeof obj.data === 'string' && obj.data ? obj.data.slice(0, 10) : today;
  const e = {
    id: 'ent-' + now,
    aventuraId,
    data: dataStr,
    titulo: String(obj.titulo || '').slice(0, 120),
    corpo: String(obj.corpo || '').slice(0, 8000),
    criadoEm: now,
    atualizadoEm: now,
  };
  area.entradas.push(e);
  // marca o hábito "escreveu hoje" (alimenta score/badge/missão do Diário) —
  // reflexo do dia de escrita real (hoje), não da data escolhida pra entrada.
  area.campos.escritaHoje = 1;
  if (!area.historico.escritaHoje) area.historico.escritaHoje = [];
  const hist = area.historico.escritaHoje;
  const idx = hist.findIndex(p => p.d === today);
  if (idx >= 0) hist[idx].v = 1; else hist.push({ d: today, v: 1 });
  hist.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (hist.length > MAX_HISTORY) area.historico.escritaHoje = hist.slice(-MAX_HISTORY);
  writeRaw(data);
  return e;
}
function editEntrada(areaId, eid, patch) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const e = area.entradas.find(x => x.id === eid);
  if (!e) return null;
  if (patch.data !== undefined) e.data = String(patch.data).slice(0, 10);
  if (patch.titulo !== undefined) e.titulo = String(patch.titulo).slice(0, 120);
  if (patch.corpo !== undefined) e.corpo = String(patch.corpo).slice(0, 8000);
  e.atualizadoEm = Date.now();
  writeRaw(data);
  return e;
}
function deleteEntrada(areaId, eid) {
  const data = readData();
  const area = ensureArea(data, areaId);
  const n = area.entradas.length;
  area.entradas = area.entradas.filter(x => x.id !== eid);
  writeRaw(data);
  return { removed: n !== area.entradas.length };
}

// ── NOVIDADES (changelog manual do app, top-level — não é por área) ──
function addChangelog(texto, dataStr) {
  const data = readData();
  if (!Array.isArray(data.changelog)) data.changelog = [];
  const item = { id: 'chg-' + Date.now(), data: String(dataStr || ymdLocal()).slice(0, 10), texto: String(texto || '').slice(0, 200), criadoEm: Date.now() };
  data.changelog.push(item);
  writeRaw(data);
  return item;
}
function deleteChangelog(id) {
  const data = readData();
  if (!Array.isArray(data.changelog)) data.changelog = [];
  const n = data.changelog.length;
  data.changelog = data.changelog.filter(x => x.id !== id);
  writeRaw(data);
  return { removed: n !== data.changelog.length };
}

module.exports = {
  readData, writeData, writeArea, pushHistory,
  addCapitulo, editCapitulo, deleteCapitulo,
  addAventura, editAventura, deleteAventura,
  addEntrada, editEntrada, deleteEntrada,
  addChangelog, deleteChangelog,
  addMeta, editMeta, deleteMeta,
  addCliente, updateCliente, deleteCliente, ESTAGIOS,
  addGoal, updateGoal, deleteGoal, seedMetasGoals,
  addMissao, toggleMissao, editMissao, deleteMissao,
  addTreino, updateTreino, deleteTreino, TIPOS_TREINO,
  addExercicio, toggleExercicio, editExercicio, deleteExercicio,
  addListItem, toggleListItem, editListItem, deleteListItem, LISTAS,
  addSkill, skillXp, editSkill, deleteSkill, XP_POR_NIVEL,
  ensureArea, longestStreak, doCheckin, logMissao, unlockBadge,
  recordScoreSnapshot,
  DATA_PATH, DEFAULT_DATA,
};
