'use strict';

/* Área "Lazer & Crescimento" — DOIS EIXOS que NÃO se somam num score só.
   Veredito do Sócio: lazer é insumo (tem TETO, descanso demais em junho = fuga
   do caixa); crescimento é investimento (só conta se vira APLICAÇÃO no Safra —
   consumir conteúdo é vaidade). Score final = média honesta dos dois.

   eixo crescimento:
   - 60%: apliquei no Safra hoje (streak ≥1 hoje)
   - 40%: skill foco tocada hoje
   eixo lazer (recarga):
   - horas de descanso vs teto: penaliza débito, NÃO premia excesso (satura em 100)
*/

const { PROGRESS_DEFS } = require('./_progressDefs');
const { ymdLocal } = require('../dateutil');

const TETO_LAZER_PADRAO = 14; // h/semana de descanso "saudável"
const XP_POR_NIVEL = 100;

// dias consecutivos terminando hoje (ou ontem, carência) com v>=1 — igual igreja.js
function streakDe(pts, todayStr) {
  if (!Array.isArray(pts) || !pts.length) return 0;
  const ok = new Set(pts.filter(p => Number(p.v) >= 1).map(p => p.d));
  const DIA = 86400000;
  const hoje = new Date(todayStr + 'T00:00:00');
  let cursor = new Date(hoje);
  if (!ok.has(todayStr)) cursor = new Date(hoje.getTime() - DIA);
  let n = 0;
  while (ok.has(ymdLocal(cursor))) { n++; cursor = new Date(cursor.getTime() - DIA); }
  return n;
}

function calcCrescimento(campos, apliqueiStreak, skillTocadaHoje) {
  // aplicação (60%): hoje=100, senão escala leve pelo streak recente
  let aplPct;
  if (Number(campos.apliquei) >= 1) aplPct = 100;
  else aplPct = apliqueiStreak > 0 ? 60 : 30;
  // skill foco (40%): tocada hoje
  const skPct = skillTocadaHoje ? 100 : 50;
  return Math.round(aplPct * 0.6 + skPct * 0.4);
}

function calcLazer(horas, teto) {
  if (typeof horas !== 'number' || teto <= 0) return 50; // neutro sem dado
  // 100 ao atingir o teto; abaixo cai proporcional; acima NÃO passa de 100
  return Math.max(0, Math.min(100, Math.round((horas / teto) * 100)));
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.lazer) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto = areaData.metasTexto || {};
  const todayStr = ymdLocal();

  // ── Eixo Crescimento ──
  const apliqueiHoje = Number(campos.apliquei) >= 1;
  const apliqueiStreak = streakDe(historico.apliquei, todayStr);
  const skills = (Array.isArray(areaData.skills) ? areaData.skills : []).map(s => {
    const xp = Number(s.xp) || 0;
    const nivel = 1 + Math.floor(xp / XP_POR_NIVEL);
    return { id: s.id, nome: s.nome, nivel, xp, xpNivel: xp % XP_POR_NIVEL, xpProx: XP_POR_NIVEL };
  });
  const skillFoco = campos.skillFoco || '';
  const skillTocadaHoje = apliqueiHoje; // proxy: "estudei e usei" = aplicação
  const crescScore = calcCrescimento(campos, apliqueiStreak, skillTocadaHoje);

  // ── Eixo Lazer / Recarga ──
  const teto = typeof campos.tetoLazerSemana === 'number' ? campos.tetoLazerSemana : TETO_LAZER_PADRAO;
  const horasSemana = typeof campos.horasLazer === 'number' ? campos.horasLazer : null;
  const lazerScore = calcLazer(horasSemana, teto);
  const debito = horasSemana != null ? Math.max(0, teto - horasSemana) : null;
  const emDebito = debito != null && debito >= teto * 0.5; // faltou metade ou mais
  const descanseiHoje = Number(campos.descansei) >= 1;
  const descanseiStreak = streakDe(historico.descansei, todayStr);

  // ── Estante de livros (lista genérica; livro lido = feito:true) ──
  const livrosArr = Array.isArray(areaData.livros) ? areaData.livros : [];
  const lidos = livrosArr.filter(l => l.feito).length;
  const TIERS = [10, 25, 50, 100];
  const NOMES = { 10: 'Leitor', 25: 'Devorador', 50: 'Bibliotecário', 100: 'Erudito' };
  const placas = TIERS.map(t => ({ alvo: t, nome: NOMES[t], destravada: lidos >= t }));
  const proximaPlaca = placas.find(p => !p.destravada) || null;

  // score final = média dos dois eixos (não somados antes)
  const score = Math.max(0, Math.min(100, Math.round(crescScore * 0.5 + lazerScore * 0.5))) || 0;

  const resumo = [
    { label: 'Apliquei', valor: apliqueiStreak > 0 ? `🔥 ${apliqueiStreak}d` : (apliqueiHoje ? 'hoje' : '—') },
    { label: 'Livros', valor: String(lidos), delta: proximaPlaca ? `próx: ${proximaPlaca.alvo}` : 'tudo!' },
    { label: 'Recarga', valor: horasSemana != null ? `${horasSemana}/${teto}h` : '—', delta: emDebito ? 'em débito' : null },
  ];

  const metas = [
    { id: 'aplicar-hoje', texto: 'Aplicar algo no Safra hoje', feito: apliqueiHoje, auto: true },
    { id: 'recarga-em-dia', texto: `Descansar ~${teto}h na semana`, feito: horasSemana != null && horasSemana >= teto, auto: true, atual: horasSemana, alvo: teto },
    { id: 'skill-foco', texto: skillFoco ? `Skill foco: ${skillFoco}` : 'Definir skill foco da vez', feito: !!skillFoco, auto: true },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'lazer',
    nome: 'Lazer & Crescimento',
    icone: '🌱',
    cor: '#06b6d4',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      crescimento: {
        score: crescScore,
        apliqueiHoje,
        apliqueiStreak,
        oQueApliquei: metasTexto['aplicacao'] || '',
        skillFoco,
      },
      lazer: {
        score: lazerScore,
        horasSemana,
        teto,
        debito,
        emDebito,
        descanseiHoje,
        descanseiStreak,
      },
      livros: { itens: livrosArr, lidos, placas, proximaPlaca },
      skills,
      camposEditaveis: [
        { id: 'horasLazer',      label: 'Descanso esta sem.', tipo: 'number', unidade: 'h',   historico: true },
        { id: 'tetoLazerSemana', label: 'Teto de descanso',   tipo: 'number', unidade: 'h',   historico: false },
        { id: 'leituraMin',      label: 'Leitura hoje',       tipo: 'number', unidade: 'min', historico: true },
      ],
      // séries que ganham mini-gráfico no card Histórico
      registros: [
        { id: 'horasLazer', label: 'Descanso', unidade: 'h',   cor: '#06b6d4' },
        { id: 'leituraMin', label: 'Leitura',  unidade: 'min', cor: '#a855f7' },
        { id: 'apliquei',   label: 'Apliquei', unidade: '',    cor: '#22c55e' },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.lazer };
