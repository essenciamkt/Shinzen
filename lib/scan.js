'use strict';

/* Varre ~/.claude/projects/ e retorna lista de arquivos .jsonl com mtime+size.
   Cache em memória: só re-parseia arquivos cujo mtime mudou.
   ?fresh=1 → limpa cache antes de varrer. */

const fs = require('fs');
const path = require('path');
const { PROJECTS_DIR } = require('./paths');

// Map<filePath, { mtimeMs, parsed }> — persiste entre requests
const _cache = new Map();

function clearCache() {
  _cache.clear();
}

/* Lê o diretório de projetos e retorna:
   {
     files: [{ filePath, dir, mtimeMs, size, cached }],
     dirs:  [string],   // dirs com ao menos 1 jsonl
   }
   Erros de stat individuais são ignorados (arquivo sumiu entre readdir e stat). */
function scan() {
  let entries;
  try {
    entries = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return { files: [], dirs: [] };
  }

  const files = [];
  const dirsWithFiles = new Set();

  for (const dirName of entries) {
    const dirPath = path.join(PROJECTS_DIR, dirName);
    let dirStat;
    try { dirStat = fs.statSync(dirPath); } catch { continue; }
    if (!dirStat.isDirectory()) continue;

    let jsonls;
    try {
      jsonls = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    } catch { continue; }
    if (jsonls.length === 0) continue;

    dirsWithFiles.add(dirName);

    for (const fname of jsonls) {
      const filePath = path.join(dirPath, fname);
      let st;
      try { st = fs.statSync(filePath); } catch { continue; }

      const cached = _cache.has(filePath) && _cache.get(filePath).mtimeMs === st.mtimeMs;
      files.push({ filePath, dir: dirName, mtimeMs: st.mtimeMs, size: st.size, cached });
    }
  }

  return { files, dirs: [...dirsWithFiles] };
}

/* Registra o resultado de parse para um arquivo (chamado por parse.js). */
function setCache(filePath, mtimeMs, parsed) {
  _cache.set(filePath, { mtimeMs, parsed });
}

/* Recupera o cache para um arquivo (null se ausente ou stale). */
function getCache(filePath, mtimeMs) {
  const entry = _cache.get(filePath);
  if (!entry || entry.mtimeMs !== mtimeMs) return null;
  return entry.parsed;
}

module.exports = { scan, clearCache, setCache, getCache };
