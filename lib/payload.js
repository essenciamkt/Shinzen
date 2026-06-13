'use strict';

const fs = require('fs');
const path = require('path');
const { scan, clearCache, getCache, setCache } = require('./scan');
const { parseAll } = require('./parse');
const { aggregate } = require('./aggregate');
const { build: buildCost } = require('./cost');
const { build: buildAchievements } = require('./achievements');
const { build: buildGoals } = require('./goals');
const { build: buildCoach } = require('./coach');
const { build: buildSkills } = require('./skills');
const { build: buildPeakHours } = require('./peakhours');
const { build: buildTrends } = require('./trends');
const { build: buildProjectCost } = require('./projectcost');
const { prettyModel } = require('./pricing');
const { APP_DIR, CLAUDE_DIR, CLAUDE_JSON } = require('./paths');
const { readData } = require('./datastore');
const { build: buildAreaClaudeCode } = require('./areas/claudeCode');
const { build: buildAreaSaude }      = require('./areas/saude');
const { build: buildAreaFinancas }   = require('./areas/financas');
const { build: buildAreaTrabalho }   = require('./areas/trabalho');
const { build: buildAreaMetas }      = require('./areas/metas');
const { build: buildAreaIgreja }     = require('./areas/igreja');
const { build: buildAreaLazer }      = require('./areas/lazer');
const { build: buildAreaRotina }     = require('./areas/rotina');
const { build: buildAreaMente }      = require('./areas/mente');
const { build: buildLifeScore }      = require('./lifescore');
const { PROGRESS_DEFS }              = require('./areas/_progressDefs');
const { buildProgress }              = require('./progress');
const { unlockBadge }                = require('./datastore');

const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const CATALOG_PATH = path.join(APP_DIR, 'skills-catalog.json');

const DEFAULT_CONFIG = {
  profile: { name: 'Você', email: '' },
  usdToBrl: 5.4,
  goals: [
    {
      id: 'dominar-claude-code',
      titulo: 'Dominar o Claude Code',
      icone: '🧠',
      marcos: [
        { id: 'instalar-3-skills',  texto: 'Instalar 3 skills úteis',              auto: true },
        { id: 'conectar-mcp',       texto: 'Conectar 1 integração (MCP)',           auto: true },
        { id: 'usar-subagente',     texto: 'Usar um subagente (Explore/Plan)',      auto: true },
        { id: 'criar-hook',         texto: 'Criar o seu primeiro hook',             auto: true },
        { id: 'sequencia-7-dias',   texto: 'Manter sequência de 7 dias',            auto: true },
      ],
    },
    {
      id: 'automatizar-negocio',
      titulo: 'Automatizar o negócio',
      icone: '⚙️',
      marcos: [
        { id: 'conectar-gdrive',        texto: 'Conectar o Google Drive',              auto: true },
        { id: 'conectar-meta',          texto: 'Conectar o Meta / Facebook Ads',       auto: true },
        { id: 'criar-automacao',        texto: 'Criar 1 automação (hook) de rotina',   auto: false },
        { id: 'documentar-processo',    texto: 'Documentar 1 processo com /init',      auto: false },
      ],
    },
    {
      id: 'criar-conteudo',
      titulo: 'Criar conteúdo e materiais',
      icone: '✍️',
      marcos: [
        { id: 'conectar-canva',     texto: 'Conectar o Canva',               auto: true },
        { id: 'produzir-5-pecas',   texto: 'Produzir 5 peças / textos',      auto: false },
        { id: 'montar-fluxo',       texto: 'Montar um fluxo de campanha',    auto: false },
      ],
    },
    {
      id: 'construir-apps',
      titulo: 'Construir apps / produtos',
      icone: '🚀',
      marcos: [
        { id: 'iniciar-projeto',    texto: 'Iniciar 1 projeto',          auto: true },
        { id: 'concluir-shinzen',   texto: 'Concluir o painel Shinzen',  auto: false },
        { id: 'publicar-produto',   texto: 'Publicar 1 produto',         auto: false },
      ],
    },
  ],
  projectOverrides: {},
};

function ensureSidecar(fpath, defaultValue) {
  try { fs.accessSync(fpath); } catch {
    fs.writeFileSync(fpath, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
  try { return JSON.parse(fs.readFileSync(fpath, 'utf8')); } catch { return defaultValue; }
}

function readClaudeVersion() {
  try {
    const j = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
    return j && j.version ? j.version : '';
  } catch { return ''; }
}

async function build({ fresh = false } = {}) {
  const t0 = Date.now();

  if (fresh) clearCache();

  const config = ensureSidecar(CONFIG_PATH, DEFAULT_CONFIG);
  const catalog = ensureSidecar(CATALOG_PATH, { catalog: [] });
  const data = readData();

  // scan + parse
  const { files } = scan();
  const tagged = files.map(f => ({ ...f, _dir: f.dir }));
  const { summaries, cacheHits, parsed: filesParsed, errors: parseErrors } =
    await parseAll(tagged, { getCache, setCache });

  tagged.forEach((f, i) => { if (summaries[i]) summaries[i]._dir = f._dir; });

  const agg = aggregate(summaries);

  const usdToBrl = config.usdToBrl || 5.4;
  const cost = buildCost(summaries, agg.activityWeeks, usdToBrl);
  const peakHours = buildPeakHours(summaries);
  const trends = buildTrends(agg.activityWeeks, cost.weekly, summaries, agg);
  const projectCostResult = buildProjectCost(summaries, usdToBrl);

  const skills = buildSkills();
  const { achievements, level } = buildAchievements(agg, skills);
  agg.level = level;

  const doneMap = config.goalsDone || {};
  const goalsResult = buildGoals(config.goals || DEFAULT_CONFIG.goals, doneMap, agg, skills);

  const coach = buildCoach(achievements, goalsResult, agg);

  const version = readClaudeVersion();
  const profile = {
    name: (config.profile && config.profile.name) || 'Você',
    email: (config.profile && config.profile.email) || '',
    version,
    desde: agg.projects.length > 0 && agg.projects[agg.projects.length - 1].firstSeen
      ? agg.projects[agg.projects.length - 1].firstSeen
      : '',
  };

  const avgSessionsPerWeek = agg.activityWeeks.length > 0
    ? Math.round((agg.activityWeeks.reduce((s, w) => s + w.sessions, 0) / agg.activityWeeks.length) * 10) / 10
    : 0;

  const agentTypesArr = Object.entries(agg.agentTypes)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const modelsArr = Object.entries(agg.models)
    .map(([model, tok]) => ({
      model,
      label: prettyModel(model),
      count: tok.input + tok.output,
    }))
    .sort((a, b) => b.count - a.count);

  const projectCostMap = {};
  for (const pc of projectCostResult.byProject) {
    projectCostMap[pc.dir] = { usd: pc.usd, brl: pc.brl, pct: pc.pct };
  }

  const overrides = config.projectOverrides || {};
  const projectTags = config.projectTags || {};
  const projectsArr = agg.projects.map(p => {
    const ov = overrides[p.dir] || {};
    const pc = projectCostMap[p.dir] || { usd: 0, brl: 0, pct: 0 };
    return {
      id: p.dir,
      path: p.cwd || '',
      name: ov.name || p.name,
      sessions: p.sessions,
      lastActive: p.lastSeen ? new Date(p.lastSeen).getTime() : null,
      firstActive: p.firstSeen ? new Date(p.firstSeen).getTime() : null,
      gitBranch: p.gitBranch || null,
      status: p.status,
      description: ov.description || '',
      tag: projectTags[p.dir] || null,
      subagents: p.subagents,
      agentTypes: Object.entries(p.agentTypes).map(([type, count]) => ({ type, count })),
      models: p.models,
      cost: pc,
      sessionsByDay: p.sessionsByDay || {},
    };
  });

  const parseMs = Date.now() - t0;

  // ── ÁREAS ──
  const ctx = { agg, skills, cost, goalsResult, achievements, level, peakHours, trends, avgSessionsPerWeek, projectsArr, data, config };

  const areaClaudeCode = buildAreaClaudeCode(ctx);
  const areaSaude      = buildAreaSaude(ctx);
  const areaFinancas   = buildAreaFinancas(ctx);
  const areaTrabalho   = buildAreaTrabalho(ctx);
  const areaMetas      = buildAreaMetas(ctx);
  const areaIgreja     = buildAreaIgreja(ctx);
  const areaLazer      = buildAreaLazer(ctx);
  const areaRotina     = buildAreaRotina(ctx);
  const areaMente      = buildAreaMente(ctx);

  const DEFAULT_ORDER = ['claude-code', 'saude', 'financas', 'trabalho', 'metas', 'igreja', 'lazer', 'rotina', 'mente'];
  const areasOrder = data.areasOrder || DEFAULT_ORDER;
  const areasMap = {
    'claude-code': areaClaudeCode,
    saude: areaSaude,
    financas: areaFinancas,
    trabalho: areaTrabalho,
    metas: areaMetas,
    igreja: areaIgreja,
    lazer: areaLazer,
    rotina: areaRotina,
    mente: areaMente,
  };
  const areas = areasOrder.map(id => areasMap[id]).filter(Boolean);

  // áreas presentes não listadas na ordem → adiciona no final
  for (const a of Object.values(areasMap)) {
    if (!areas.find(x => x.id === a.id)) areas.push(a);
  }

  // ── PROGRESSO por área (streaks, badges, missões) ──
  const today = new Date().toISOString().slice(0, 10);
  for (const area of areas) {
    const def = PROGRESS_DEFS[area.id];
    if (!def) continue; // claude-code não tem progresso manual
    const areaData = (data.areas && data.areas[area.id]) || {};
    const { progress, newlyUnlocked } = buildProgress(area.id, def, areaData, today);
    area.progress = progress;
    // Persiste badges recém-desbloqueadas (sticky) e reflete no objeto.
    if (newlyUnlocked && newlyUnlocked.length) {
      for (const bId of newlyUnlocked) unlockBadge(area.id, bId);
    }
  }

  const life = buildLifeScore(areas, data, level.xp);

  // ── claudeRaw (compat com frontend antigo) ──
  const claudeRaw = {
    ok: true,
    generatedAt: new Date().toISOString(),
    overview: {
      profile,
      totals: {
        ...agg.totals,
        skills: skills.counts.installed,
        mcps: skills.counts.connectedMcp,
      },
      level,
      achievements,
      agentTypes: agentTypesArr,
      models: modelsArr,
      activityDays: agg.activityDays,
      activityWeeks: agg.activityWeeks,
      lastActive: agg.activityDays.filter(d => d.count > 0).reduce((max, d) => d.date > max ? d.date : max, ''),
      cost,
      peakHours,
      trends,
      avgSessionsPerWeek,
    },
    coach,
    skills: {
      installed: skills.installed,
      catalog: catalog.catalog || [],
      connectedMcp: skills.connectedMcp,
      hooks: skills.hooks,
      permissions: {},
      counts: skills.counts,
      empty: skills.installed.length === 0,
    },
    projects: {
      projects: projectsArr,
      counts: { total: projectsArr.length, active: projectsArr.filter(p => p.status === 'active').length },
      empty: projectsArr.length === 0,
    },
    goals: {
      ...goalsResult,
      empty: goalsResult.goals.length === 0,
    },
  };

  const meta = {
    caixaValor: (config.meta && config.meta.caixaValor != null) ? config.meta.caixaValor : 1000,
    caixaData: (config.meta && config.meta.caixaData) || '2026-06-25',
    claudeOffData: (config.meta && config.meta.claudeOffData) || '2026-07-01',
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    life,
    meta,
    areas,
    claudeRaw,
    health: {
      ok: true,
      claudeDir: CLAUDE_DIR,
      claudeDirExists: (() => { try { fs.accessSync(CLAUDE_DIR); return true; } catch { return false; } })(),
      hasProjects: files.length > 0,
      hasSkills: skills.installed.length > 0,
      hasSessions: summaries.length > 0,
      connectedMcp: skills.counts.connectedMcp,
      node: process.version,
      configLoaded: true,
      catalogLoaded: true,
      cacheHits,
      filesParsed,
      parseErrors,
      parseMs,
      warnings: cost.unknownModels.length > 0
        ? [`Modelos desconhecidos (custo estimado): ${cost.unknownModels.join(', ')}`]
        : [],
    },
  };
}

module.exports = { build, CONFIG_PATH };
