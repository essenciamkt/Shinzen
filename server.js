'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { build, CONFIG_PATH } = require('./lib/payload');
const { clearCache } = require('./lib/scan');
const { writeArea, pushHistory, addMeta, editMeta, deleteMeta, doCheckin, logMissao } = require('./lib/datastore');

const PORT = 4317;
const APP_DIR = path.resolve(__dirname);
const INDEX_HTML = path.join(APP_DIR, 'index.html');

let _cachedPayload = null;

async function getPayload(fresh) {
  if (fresh || !_cachedPayload) {
    _cachedPayload = await build({ fresh: !!fresh });
  }
  return _cachedPayload;
}

// Lê body JSON de uma requisição POST
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET /api/health
  if (req.method === 'GET' && pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
    return;
  }

  // GET /api/dashboard[?fresh=1]
  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const fresh = url.searchParams.get('fresh') === '1';
    try {
      const payload = await getPayload(fresh);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/goals/toggle
  if (req.method === 'POST' && pathname === '/api/goals/toggle') {
    try {
      const body = await readBody(req);
      const marcoId = body && body.marcoId;
      if (!marcoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'marcoId required' }));
        return;
      }
      let config;
      try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
      catch { config = {}; }
      if (!config.goalsDone) config.goalsDone = {};
      const prev = !!config.goalsDone[marcoId];
      config.goalsDone[marcoId] = !prev;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, marcoId, done: !prev }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/area/:id — atualiza campos/metasManual de uma área manual
  if (req.method === 'PATCH' && pathname.startsWith('/api/area/')) {
    const areaId = decodeURIComponent(pathname.slice('/api/area/'.length));
    try {
      const body = await readBody(req);
      const patch = {};
      if (body.campos !== undefined) patch.campos = body.campos;
      if (body.metasManual !== undefined) patch.metasManual = body.metasManual;
      if (!Object.keys(patch).length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'campos ou metasManual requerido' }));
        return;
      }
      writeArea(areaId, patch);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/history — registra ponto histórico
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/history$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    try {
      const body = await readBody(req);
      const { campo, valor } = body || {};
      if (!campo || valor == null) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'campo e valor requeridos' }));
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      pushHistory(areaId, campo, valor, today);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, campo, d: today }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/meta — cria nova meta manual
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/meta$/) && !pathname.includes('/history')) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    try {
      const body = await readBody(req);
      const { texto } = body || {};
      if (!texto || !texto.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'texto requerido' }));
        return;
      }
      const metaId = 'meta-' + Date.now();
      addMeta(areaId, metaId, texto.trim().slice(0, 200));
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, metaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/area/:id/meta/:metaId — edita texto de meta manual
  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/meta\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const metaId = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const { texto } = body || {};
      if (!texto || !texto.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'texto requerido' }));
        return;
      }
      editMeta(areaId, metaId, texto.trim().slice(0, 200));
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, metaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // DELETE /api/area/:id/meta/:metaId — remove meta manual
  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/meta\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const metaId = decodeURIComponent(parts[5]);
    try {
      deleteMeta(areaId, metaId);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, metaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/checkin — toggle do check-in diário
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/checkin$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    try {
      const body = await readBody(req);
      const date = (body && body.date) || new Date().toISOString().slice(0, 10);
      const r = doCheckin(areaId, date);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, date, feito: r.feito }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/missao/:missaoId — toggle de missão manual
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/missao\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const missaoId = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const date = (body && body.date) || new Date().toISOString().slice(0, 10);
      const r = logMissao(areaId, missaoId, date);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, missaoId, feita: r.feita }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/config — salva campos permitidos: profile.name, usdToBrl
  if (req.method === 'PATCH' && pathname === '/api/config') {
    try {
      const body = await readBody(req);
      let config;
      try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
      catch { config = {}; }
      if (body.profileName !== undefined) {
        if (!config.profile) config.profile = {};
        config.profile.name = String(body.profileName).slice(0, 80);
      }
      if (body.usdToBrl !== undefined) {
        const n = parseFloat(body.usdToBrl);
        if (!isNaN(n) && n > 0) config.usdToBrl = n;
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // GET /api/stats/project/:dir
  if (req.method === 'GET' && pathname.startsWith('/api/stats/project/')) {
    const dir = decodeURIComponent(pathname.slice('/api/stats/project/'.length));
    try {
      const payload = await getPayload(false);
      const proj = payload.projects.projects.find(p => p.id === dir);
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'project not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, project: proj }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // GET / → index.html
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(INDEX_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('index.html not found.');
    }
    return;
  }

  // GET /assets/* — serve arquivos estáticos da pasta assets/
  if (req.method === 'GET' && pathname.startsWith('/assets/')) {
    const rel = pathname.slice('/assets/'.length).replace(/\.\./g, '');
    const fpath = path.join(APP_DIR, 'assets', rel);
    const ext = path.extname(rel).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
    try {
      const buf = fs.readFileSync(fpath);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('asset not found');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Shinzen v2 rodando em http://localhost:${PORT}`);
  console.log('Pressione Ctrl+C para parar.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} já em uso. Mate o processo anterior ou troque a porta.`);
  } else {
    console.error('Erro no servidor:', err);
  }
  process.exit(1);
});
