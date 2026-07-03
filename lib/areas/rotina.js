'use strict';

/* Área "Rotina & Energia" — a ÚNICA área que olha caixa direto (veredito Sócio).
   Diferencial vs Saúde (combustível) e Lazer (equilíbrio): aqui o número-rei é
   EXECUÇÃO — blocos de deep-work voltados a produto vendável. Água/sono saíram
   dos pontos (pertencem à Saúde). Celular é teto leve, não meta.

   score:
   - 60% execução: produtividadeH / metaExecucao
   - 25% acordar cedo
   - 15% celular (teto leve, invertido)
*/

const { PROGRESS_DEFS } = require('./_progressDefs');
const { ymdLocal } = require('../dateutil');

const META_EXEC_PADRAO = 3; // h/dia de execução

// dias consecutivos terminando hoje (ou ontem, carência) com v>=1 — igual igreja/lazer
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

function calcScore(campos) {
  const { acordouCedo, celularH } = campos || {};
  const horas = typeof campos.produtividadeH === 'number' ? campos.produtividadeH : null;
  const meta = typeof campos.metaExecucao === 'number' && campos.metaExecucao > 0 ? campos.metaExecucao : META_EXEC_PADRAO;

  // execução (60%)
  let execPct = horas != null ? Math.min(100, Math.round((horas / meta) * 100)) : 30;

  // acordar cedo (25%)
  let cedoPct = 50;
  if (typeof acordouCedo === 'number') {
    cedoPct = acordouCedo <= 6 ? 100 : acordouCedo <= 7 ? 85 : acordouCedo <= 8 ? 60 : 30;
  } else if (acordouCedo === true) cedoPct = 90;
  else if (acordouCedo === false) cedoPct = 20;

  // celular como teto leve (15%, invertido)
  let celularPct = 60;
  if (typeof celularH === 'number') {
    celularPct = celularH <= 2 ? 100 : celularH <= 3 ? 70 : celularH <= 5 ? 30 : 0;
  }

  return Math.max(0, Math.min(100, Math.round(execPct * 0.6 + cedoPct * 0.25 + celularPct * 0.15))) || 0;
}

function build({ data }) {
  const areaData = (data && data.areas && data.areas.rotina) || {};
  const campos = areaData.campos || {};
  const historico = areaData.historico || {};
  const metasManual = areaData.metasManual || {};
  const metasTexto  = areaData.metasTexto  || {};
  const todayStr = ymdLocal();

  const score = calcScore(campos);

  // ── Execução (número-rei) ──
  const horas = typeof campos.produtividadeH === 'number' ? campos.produtividadeH : null;
  const metaExec = typeof campos.metaExecucao === 'number' && campos.metaExecucao > 0 ? campos.metaExecucao : META_EXEC_PADRAO;
  const execPct = horas != null ? Math.min(100, Math.round((horas / metaExec) * 100)) : 0;
  const execucao = {
    horas, meta: metaExec, pct: execPct,
    bateuHoje: horas != null && horas >= metaExec,
    streak: streakDe(historico.produtividadeH, todayStr),
  };

  // ── Check do Sistema (5 não-negociáveis) ──
  const SYS = [
    { id: 'sysAcordar', label: 'Acordar no horário', icone: '⏰', manha: true },
    { id: 'sysOrar',    label: 'Orar / meditar',     icone: '🙏', manha: true },
    { id: 'sysPlano',   label: 'Revisar o plano',    icone: '📋', manha: true },
    { id: 'sysBloco',   label: '1 bloco de execução', icone: '🎯', manha: false },
    { id: 'sysDormir',  label: 'Dormir no horário',  icone: '😴', manha: false },
  ];
  const sistema = SYS.map(s => ({
    ...s,
    hoje: Number(campos[s.id]) >= 1,
    streak: streakDe(historico[s.id], todayStr),
  }));
  const completoHoje = sistema.every(s => s.hoje);

  // ── Win the Morning ──
  const manhaIds = SYS.filter(s => s.manha).map(s => s.id);
  const venci = manhaIds.every(id => Number(campos[id]) >= 1);

  // ── Countdown adolescência produtiva (até 18) ──
  let countdown = null;
  if (campos.nascimento && typeof campos.nascimento === 'string') {
    const nasc = new Date(campos.nascimento + 'T00:00:00');
    if (!isNaN(nasc)) {
      const dezoito = new Date(nasc); dezoito.setFullYear(dezoito.getFullYear() + 18);
      const hoje = new Date(todayStr + 'T00:00:00');
      const dias = Math.round((dezoito - hoje) / 86400000);
      const anos = Math.floor((hoje - nasc) / (365.25 * 86400000));
      countdown = { nascimento: campos.nascimento, diasAte18: dias, anos };
    }
  }

  const resumo = [
    { label: 'Execução', valor: horas != null ? `${horas}/${metaExec}h` : '—', delta: execucao.bateuHoje ? 'bateu!' : null },
    { label: 'Acordou', valor: typeof campos.acordouCedo === 'number' ? `${campos.acordouCedo}h` : (campos.acordouCedo ? 'cedo' : '—') },
    { label: 'Sistema', valor: `${sistema.filter(s => s.hoje).length}/5` },
  ];

  const metas = [
    {
      id: 'bater-execucao',
      texto: `Fazer ${metaExec}h de execução`,
      feito: execucao.bateuHoje, auto: true, atual: horas, alvo: metaExec,
    },
    { id: 'sistema-completo', texto: 'Rodar o sistema completo hoje', feito: completoHoje, auto: true },
    {
      id: 'acordar-cedo', texto: 'Acordar antes das 7h',
      feito: typeof campos.acordouCedo === 'number' ? campos.acordouCedo <= 7 : !!campos.acordouCedo,
      auto: true,
    },
    ...Object.entries(metasManual).map(([id, feito]) => ({
      id, texto: metasTexto[id] || id.replace(/-/g, ' '), feito: !!feito, auto: false,
    })),
  ];

  return {
    id: 'rotina',
    nome: 'Rotina & Energia',
    icone: '⚡',
    cor: '#f59e0b',
    fonte: 'manual',
    score,
    resumo,
    metas,
    detalhe: {
      campos,
      historico,
      execucao,
      sistema,
      manha: { venci, ids: manhaIds },
      completoHoje,
      scoreDia: score,
      countdown,
      camposEditaveis: [
        { id: 'produtividadeH', label: 'Horas de execução',  tipo: 'number', unidade: 'h', historico: true },
        { id: 'metaExecucao',   label: 'Meta de execução',   tipo: 'number', unidade: 'h', historico: false },
        { id: 'acordouCedo',    label: 'Hora que acordou',   tipo: 'number', unidade: 'h', historico: false },
        { id: 'celularH',       label: 'Celular (horas)',    tipo: 'number', unidade: 'h', historico: true },
      ],
      registros: [
        { id: 'produtividadeH', label: 'Execução', unidade: 'h', cor: '#f59e0b' },
        { id: 'celularH',       label: 'Celular',  unidade: 'h', cor: '#94a3b8' },
      ],
    },
  };
}

module.exports = { build, progressDef: PROGRESS_DEFS.rotina };
