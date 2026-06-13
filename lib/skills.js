'use strict';

/* Descobre skills, agents, commands, MCPs e hooks instalados.

   Saída:
   {
     installed: [{ id, name, description, type, status, usageCount?, lastUsedAt? }],
     connectedMcp: [{ server, toolCount? }],
     hooks: [{ event, command, type }],
     counts: { installed, connectedMcp, hooks },
   }
*/

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR, AGENTS_DIR, COMMANDS_DIR, PLUGINS_DIR, SETTINGS, SETTINGS_LOCAL, CLAUDE_JSON } = require('./paths');

/* Lê front-matter de um arquivo Markdown via regex simples (sem dep yaml).
   Retorna { name, description, ... } ou {} se falhar. */
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const result = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
    if (kv) result[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return result;
}

/* Lê todos os .md em um diretório (não recursivo) e retorna metadados básicos. */
function scanMdDir(dir, type) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  const items = [];
  for (const fname of entries) {
    if (!fname.endsWith('.md')) continue;
    const fpath = path.join(dir, fname);
    let text;
    try { text = fs.readFileSync(fpath, 'utf8'); } catch { continue; }
    const fm = parseFrontMatter(text);
    const id = fname.replace(/\.md$/, '');
    items.push({
      id,
      name: fm.name || id,
      description: fm.description || '',
      type,
      status: 'instalada',
    });
  }
  return items;
}

/* Lê skills em subdiretórios (~/skills/<name>/SKILL.md ou <name>.md) */
function scanSkillsDir() {
  let entries;
  try { entries = fs.readdirSync(SKILLS_DIR); } catch { return []; }
  const items = [];
  for (const name of entries) {
    const dirPath = path.join(SKILLS_DIR, name);
    let isSub;
    try { isSub = fs.statSync(dirPath).isDirectory(); } catch { continue; }

    let text;
    if (isSub) {
      // pode ser SKILL.md ou <name>.md
      for (const candidate of ['SKILL.md', `${name}.md`]) {
        try {
          text = fs.readFileSync(path.join(dirPath, candidate), 'utf8');
          break;
        } catch {}
      }
    } else if (name.endsWith('.md')) {
      try { text = fs.readFileSync(dirPath, 'utf8'); } catch {}
    }

    if (!text) continue;
    const fm = parseFrontMatter(text);
    const id = name.replace(/\.md$/, '');
    items.push({
      id,
      name: fm.name || id,
      description: fm.description || '',
      type: 'skill',
      status: 'instalada',
    });
  }
  return items;
}

/* Lê pluginsDir — só subdirs que parecem plugins reais (têm package.json ou index.js) */
function scanPluginsDir() {
  let entries;
  try { entries = fs.readdirSync(PLUGINS_DIR); } catch { return []; }
  const items = [];
  for (const name of entries) {
    const dirPath = path.join(PLUGINS_DIR, name);
    let isSub;
    try { isSub = fs.statSync(dirPath).isDirectory(); } catch { continue; }
    if (!isSub) continue; // ignorar arquivos .json soltos

    let pkg;
    try {
      const raw = fs.readFileSync(path.join(dirPath, 'package.json'), 'utf8');
      pkg = JSON.parse(raw);
    } catch {}

    // só incluir se parecer plugin real
    const hasPackage = !!pkg;
    const hasIndex = (() => { try { fs.statSync(path.join(dirPath, 'index.js')); return true; } catch { return false; } })();
    if (!hasPackage && !hasIndex) continue;

    items.push({
      id: name,
      name: (pkg && pkg.name) || name,
      description: (pkg && pkg.description) || '',
      type: 'plugin',
      status: 'instalada',
    });
  }
  return items;
}

/* Parseia hooks do settings.json (shape aninhado). */
function parseHooks(settingsObj) {
  const hooks = [];
  const hooksRoot = settingsObj && settingsObj.hooks;
  if (!hooksRoot || typeof hooksRoot !== 'object') return hooks;
  for (const [event, eventArray] of Object.entries(hooksRoot)) {
    if (!Array.isArray(eventArray)) continue;
    for (const group of eventArray) {
      const innerHooks = group && group.hooks;
      if (!Array.isArray(innerHooks)) continue;
      for (const hook of innerHooks) {
        if (hook && hook.command) {
          hooks.push({ event, command: hook.command, type: 'command' });
        }
      }
    }
  }
  return hooks;
}

function readJson(fpath) {
  try { return JSON.parse(fs.readFileSync(fpath, 'utf8')); } catch { return null; }
}

function build() {
  // ---- installed skills/agents/commands ----
  const skillUsageMap = {};
  try {
    const claudeJson = readJson(CLAUDE_JSON);
    const usage = claudeJson && claudeJson.skillUsage;
    if (usage && typeof usage === 'object') {
      for (const [id, info] of Object.entries(usage)) {
        skillUsageMap[id] = info;
      }
    }
  } catch {}

  const installed = [
    ...scanSkillsDir(),
    ...scanMdDir(AGENTS_DIR, 'agent'),
    ...scanMdDir(COMMANDS_DIR, 'command'),
    ...scanPluginsDir(),
  ].map(item => {
    const usage = skillUsageMap[item.id];
    if (usage) {
      return { ...item, usageCount: usage.usageCount, lastUsedAt: usage.lastUsedAt };
    }
    return item;
  });

  // ---- connectedMcp ----
  const mcpSet = new Map(); // server -> { server }
  try {
    const claudeJson = readJson(CLAUDE_JSON);
    if (claudeJson) {
      // cloud MCPs
      const cloud = claudeJson.claudeAiMcpEverConnected;
      if (Array.isArray(cloud)) {
        for (const s of cloud) { if (s) mcpSet.set(s, { server: s }); }
      }
      // local MCPs (por projeto)
      const projects = claudeJson.projects;
      if (projects && typeof projects === 'object') {
        for (const proj of Object.values(projects)) {
          const mcpServers = proj && proj.mcpServers;
          if (mcpServers && typeof mcpServers === 'object') {
            for (const name of Object.keys(mcpServers)) {
              if (!mcpSet.has(name)) mcpSet.set(name, { server: name });
            }
          }
        }
      }
    }
  } catch {}
  const connectedMcp = [...mcpSet.values()];

  // ---- hooks ----
  const hooks = [];
  for (const fpath of [SETTINGS, SETTINGS_LOCAL]) {
    const obj = readJson(fpath);
    if (obj) hooks.push(...parseHooks(obj));
  }
  // dedup por event+command
  const hooksSeen = new Set();
  const hooksDeduped = hooks.filter(h => {
    const key = h.event + '|' + h.command;
    if (hooksSeen.has(key)) return false;
    hooksSeen.add(key);
    return true;
  });

  return {
    installed,
    connectedMcp,
    hooks: hooksDeduped,
    counts: {
      installed: installed.length,
      connectedMcp: connectedMcp.length,
      hooks: hooksDeduped.length,
    },
  };
}

module.exports = { build };
