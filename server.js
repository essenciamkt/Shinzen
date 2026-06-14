'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { build, CONFIG_PATH } = require('./lib/payload');
const { clearCache } = require('./lib/scan');
const { writeArea, pushHistory, addMeta, editMeta, deleteMeta, doCheckin, logMissao, addCliente, updateCliente, deleteCliente, addGoal, updateGoal, deleteGoal, addMissao, toggleMissao, editMissao, deleteMissao } = require('./lib/datastore');

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

  // ── CLIENTES (pipeline da área Trabalho) ── (antes do PATCH genérico)
  // POST /api/area/:id/cliente — cria cliente
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/cliente$/)) {
    const areaId = decodeURIComponent(pathname.split('/')[3]);
    try {
      const body = await readBody(req);
      if (!body.nome || !String(body.nome).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'nome requerido' }));
        return;
      }
      const cli = addCliente(areaId, body);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cliente: cli }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/area/:id/cliente/:cid — atualiza cliente
  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/cliente\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const cid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const cli = updateCliente(areaId, cid, body || {});
      if (!cli) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'cliente não encontrado' }));
        return;
      }
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cliente: cli }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // DELETE /api/area/:id/cliente/:cid — remove cliente
  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/cliente\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const cid = decodeURIComponent(parts[5]);
    try {
      deleteCliente(areaId, cid);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // ── GOALS / SONHOS (área Metas) ── (antes do PATCH genérico)
  // POST /api/area/:id/goal — cria sonho rico
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/goal$/)) {
    const areaId = decodeURIComponent(pathname.split('/')[3]);
    try {
      const body = await readBody(req);
      if (!body.titulo || !String(body.titulo).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'titulo requerido' }));
        return;
      }
      const goal = addGoal(areaId, body);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, goal }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/area/:id/goal/:gid — atualiza sonho
  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const gid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const goal = updateGoal(areaId, gid, body || {});
      if (!goal) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'sonho não encontrado' }));
        return;
      }
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, goal }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // DELETE /api/area/:id/goal/:gid — remove sonho
  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const gid = decodeURIComponent(parts[5]);
    try {
      deleteGoal(areaId, gid);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // ── MISSÕES de um goal (os passos em ordem) ── (antes do PATCH genérico)
  // POST /api/area/:id/goal/:gid/missao — cria missão
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+\/missao$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), gid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      if (!body.texto || !String(body.texto).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'texto requerido' })); return;
      }
      const m = addMissao(areaId, gid, String(body.texto).trim());
      if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'meta não encontrada' })); return; }
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, missao: m }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/area/:id/goal/:gid/missao/:mid — texto (edita) ou toggle (sem texto)
  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+\/missao\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), gid = decodeURIComponent(parts[5]), mid = decodeURIComponent(parts[7]);
    try {
      const body = await readBody(req);
      const m = (body.texto !== undefined) ? editMissao(areaId, gid, mid, String(body.texto).trim()) : toggleMissao(areaId, gid, mid);
      if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'missão não encontrada' })); return; }
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, missao: m }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // DELETE /api/area/:id/goal/:gid/missao/:mid — remove missão
  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+\/missao\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), gid = decodeURIComponent(parts[5]), mid = decodeURIComponent(parts[7]);
    try {
      deleteMissao(areaId, gid, mid);
      _cachedPayload = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
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
      // tags de projeto: { [projectId]: 'caixa'|'dispersao'|'infra'|null } (merge)
      if (body.projectTags && typeof body.projectTags === 'object') {
        if (!config.projectTags) config.projectTags = {};
        const ALLOWED = ['caixa', 'dispersao', 'infra'];
        for (const [k, v] of Object.entries(body.projectTags)) {
          if (v === null || v === '') delete config.projectTags[k];
          else if (ALLOWED.includes(v)) config.projectTags[k] = v;
        }
      }
      // meta de caixa / janela (datas e valor editáveis)
      if (body.meta && typeof body.meta === 'object') {
        if (!config.meta) config.meta = {};
        if (body.meta.caixaValor !== undefined) {
          const n = parseFloat(body.meta.caixaValor);
          if (!isNaN(n) && n >= 0) config.meta.caixaValor = n;
        }
        if (typeof body.meta.caixaData === 'string') config.meta.caixaData = body.meta.caixaData.slice(0, 10);
        if (typeof body.meta.claudeOffData === 'string') config.meta.claudeOffData = body.meta.claudeOffData.slice(0, 10);
        if (body.meta.mrrAlvo !== undefined) {
          const n = parseFloat(body.meta.mrrAlvo);
          if (!isNaN(n) && n >= 0) config.meta.mrrAlvo = n;
        }
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
