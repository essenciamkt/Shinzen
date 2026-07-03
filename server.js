'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { build, CONFIG_PATH } = require('./lib/payload');
const { clearCache } = require('./lib/scan');
const { ymdLocal, parseYmd } = require('./lib/dateutil');
const {
  writeArea, pushHistory, addMeta, editMeta, deleteMeta,
  doCheckin, logMissao,
  addCliente, updateCliente, deleteCliente,
  addGoal, updateGoal, deleteGoal,
  addMissao, toggleMissao, editMissao, deleteMissao,
  addTreino, updateTreino, deleteTreino,
  addExercicio, toggleExercicio, editExercicio, deleteExercicio,
  addListItem, toggleListItem, editListItem, deleteListItem,
  addSkill, skillXp, editSkill, deleteSkill,
  addCapitulo, editCapitulo, deleteCapitulo,
  addAventura, editAventura, deleteAventura,
  addEntrada, editEntrada, deleteEntrada,
  addChangelog, deleteChangelog,
  readData, DATA_PATH,
} = require('./lib/datastore');

const PORT     = process.env.PORT || 4317;
const APP_DIR  = path.resolve(__dirname);
const INDEX_HTML = path.join(APP_DIR, 'index.html');

// ── Guardas anti-CSRF / DNS-rebinding (app local, single-user) ──
// O servidor escuta só em 127.0.0.1, mas o NAVEGADOR é a máquina local: um site
// malicioso aberto na aba consegue disparar requests pra http://127.0.0.1:4317.
// Sem essas guardas (e com o CORS '*' antigo) qualquer página apagava os dados.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

// Só aceita Host local → barra DNS rebinding (hostname que resolve pra 127.0.0.1).
function hostOk(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return LOCAL_HOSTS.has(host.split(':')[0]);
}

// Request que muda estado só passa se o Origin for local (ou ausente: curl/cron,
// que não é ataque cross-site de navegador). Origin externo (evil.com) → bloqueia.
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // sem Origin = não-browser (notify.sh, curl)
  try { return LOCAL_HOSTS.has(new URL(origin).hostname); }
  catch { return false; }
}

let _cachedPayload = null;

async function getPayload(fresh) {
  if (fresh || !_cachedPayload) {
    _cachedPayload = await build({ fresh: !!fresh });
  }
  return _cachedPayload;
}

function invalidateCache() { _cachedPayload = null; }

// Digest diário (consumido pelo cron notify.sh).
function buildDigest(p) {
  const lines = [];
  const meta  = p.meta   || {};
  const areas = p.areas  || [];
  const today = ymdLocal();
  if (meta.caixaData) {
    const dias = Math.round((parseYmd(meta.caixaData) - parseYmd(today)) / 86400000);
    if (dias >= 0 && dias <= 7) lines.push(`💰 Meta de caixa (R$${meta.caixaValor}) vence em ${dias}d.`);
  }
  const metasArea = areas.find(a => a.id === 'metas');
  const goals = (metasArea && metasArea.detalhe && metasArea.detalhe.goals) || [];
  for (const g of goals) {
    if (!g.atingido && typeof g.diasPrazo === 'number' && g.diasPrazo >= 0 && g.diasPrazo <= 7)
      lines.push(`🎯 "${g.titulo}" vence em ${g.diasPrazo}d.`);
  }
  for (const a of areas) {
    if (a.id === 'claude-code') continue;
    const st = a.progress && a.progress.streak;
    if (st && st.atual >= 3 && !st.ativoHoje) lines.push(`🔥 ${a.nome}: streak de ${st.atual}d — não perca hoje.`);
  }
  let pend = 0;
  for (const a of areas) {
    const ms = (a.progress && a.progress.missoes) || [];
    pend += ms.filter(m => m.periodo === 'semana' && !m.feita).length;
  }
  if (pend > 0) lines.push(`📋 ${pend} missão(ões) da semana pendente(s).`);
  const socio = p.life && p.life.socio ? p.life.socio.frase : null;
  return { count: lines.length, lines, socio };
}

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

// ── ROTAS /api/* (local, single-user) ──────────────────────────────────────
async function handle(req, res, url, pathname) {

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

  // GET /api/digest
  if (req.method === 'GET' && pathname === '/api/digest') {
    try {
      const payload = await getPayload(false);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(buildDigest(payload)));
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
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, marcoId, done: !prev }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // ── CLIENTES ──
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
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cliente: cli }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/cliente\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const cid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const cli = updateCliente(areaId, cid, body || {});
      if (!cli) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'cliente não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cliente: cli }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/cliente\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const cid = decodeURIComponent(parts[5]);
    try {
      deleteCliente(areaId, cid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // ── GOALS / SONHOS ──
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
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, goal }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const gid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const goal = updateGoal(areaId, gid, body || {});
      if (!goal) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'sonho não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, goal }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const gid = decodeURIComponent(parts[5]);
    try {
      deleteGoal(areaId, gid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // ── MISSÕES de goal ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+\/missao$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), gid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      if (!body.texto || !String(body.texto).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'texto requerido' })); return; }
      const m = addMissao(areaId, gid, String(body.texto).trim());
      if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'meta não encontrada' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, missao: m }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+\/missao\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), gid = decodeURIComponent(parts[5]), mid = decodeURIComponent(parts[7]);
    try {
      const body = await readBody(req);
      const m = (body.texto !== undefined) ? editMissao(areaId, gid, mid, String(body.texto).trim()) : toggleMissao(areaId, gid, mid);
      if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'missão não encontrada' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, missao: m }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/goal\/[^/]+\/missao\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), gid = decodeURIComponent(parts[5]), mid = decodeURIComponent(parts[7]);
    try {
      deleteMissao(areaId, gid, mid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── TREINOS ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/treino$/)) {
    const areaId = decodeURIComponent(pathname.split('/')[3]);
    try {
      const body = await readBody(req);
      if (!body.nome || !String(body.nome).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'nome requerido' })); return; }
      const treino = addTreino(areaId, body);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, treino }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/treino\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), tid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const treino = updateTreino(areaId, tid, body || {});
      if (!treino) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'treino não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, treino }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/treino\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), tid = decodeURIComponent(parts[5]);
    try {
      deleteTreino(areaId, tid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── EXERCÍCIOS de treino ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/treino\/[^/]+\/exercicio$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), tid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      if (!body.texto || !String(body.texto).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'texto requerido' })); return; }
      const ex = addExercicio(areaId, tid, String(body.texto).trim());
      if (!ex) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'treino não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, exercicio: ex }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/treino\/[^/]+\/exercicio\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), tid = decodeURIComponent(parts[5]), xid = decodeURIComponent(parts[7]);
    try {
      const body = await readBody(req);
      const ex = (body.texto !== undefined) ? editExercicio(areaId, tid, xid, String(body.texto).trim()) : toggleExercicio(areaId, tid, xid);
      if (!ex) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'exercício não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, exercicio: ex }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/treino\/[^/]+\/exercicio\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), tid = decodeURIComponent(parts[5]), xid = decodeURIComponent(parts[7]);
    try {
      deleteExercicio(areaId, tid, xid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── LISTAS GENÉRICAS ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/lista\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), lista = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      if (!body.texto || !String(body.texto).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'texto requerido' })); return; }
      const item = addListItem(areaId, lista, String(body.texto).trim());
      if (!item) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'lista inválida' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, item }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/lista\/[^/]+\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), lista = decodeURIComponent(parts[5]), iid = decodeURIComponent(parts[6]);
    try {
      const body = await readBody(req);
      const item = (body.texto !== undefined) ? editListItem(areaId, lista, iid, String(body.texto).trim()) : toggleListItem(areaId, lista, iid);
      if (!item) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'item não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, item }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/lista\/[^/]+\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), lista = decodeURIComponent(parts[5]), iid = decodeURIComponent(parts[6]);
    try {
      deleteListItem(areaId, lista, iid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── SKILLS ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/skill$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    try {
      const body = await readBody(req);
      if (!body.nome || !String(body.nome).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'nome requerido' })); return; }
      const skill = addSkill(areaId, String(body.nome).trim());
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, skill }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/skill\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), sid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const skill = (body.xp !== undefined) ? skillXp(areaId, sid, Number(body.xp)) : editSkill(areaId, sid, String(body.nome || '').trim());
      if (!skill) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'skill não encontrada' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, skill }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/skill\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), sid = decodeURIComponent(parts[5]);
    try {
      deleteSkill(areaId, sid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── DIÁRIO: CAPÍTULOS ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/capitulo$/)) {
    const areaId = decodeURIComponent(pathname.split('/')[3]);
    try {
      const body = await readBody(req);
      if (!body.titulo || !String(body.titulo).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'titulo requerido' })); return; }
      const capitulo = addCapitulo(areaId, body.ano, String(body.titulo).trim());
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, capitulo }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/capitulo\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), cid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const capitulo = editCapitulo(areaId, cid, String(body.titulo || '').trim());
      if (!capitulo) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'capítulo não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, capitulo }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/capitulo\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), cid = decodeURIComponent(parts[5]);
    try {
      deleteCapitulo(areaId, cid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── DIÁRIO: AVENTURAS ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/capitulo\/[^/]+\/aventura$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), cid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      if (!body.titulo || !String(body.titulo).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'titulo requerido' })); return; }
      const aventura = addAventura(areaId, cid, String(body.titulo).trim());
      if (!aventura) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'capítulo não encontrado' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, aventura }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/aventura\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), aid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const aventura = editAventura(areaId, aid, String(body.titulo || '').trim());
      if (!aventura) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'aventura não encontrada' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, aventura }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/aventura\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), aid = decodeURIComponent(parts[5]);
    try {
      deleteAventura(areaId, aid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── DIÁRIO: ENTRADAS ──
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/aventura\/[^/]+\/entrada$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), aid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      if (!body.corpo || !String(body.corpo).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'corpo requerido' })); return; }
      const entrada = addEntrada(areaId, aid, body);
      if (!entrada) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'aventura não encontrada' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, entrada }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+\/entrada\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), eid = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const entrada = editEntrada(areaId, eid, body || {});
      if (!entrada) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'entrada não encontrada' })); return; }
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, entrada }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/entrada\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]), eid = decodeURIComponent(parts[5]);
    try {
      deleteEntrada(areaId, eid);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // ── NOVIDADES (changelog manual, Configurações) ──
  if (req.method === 'POST' && pathname === '/api/changelog') {
    try {
      const body = await readBody(req);
      if (!body.texto || !String(body.texto).trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'texto requerido' })); return; }
      const item = addChangelog(String(body.texto).trim(), body.data);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, item }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/changelog\/[^/]+$/)) {
    const id = decodeURIComponent(pathname.split('/')[3]);
    try {
      deleteChangelog(id);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(err) })); }
    return;
  }

  // PATCH /api/area/:id — atualiza campos/metasManual de uma área manual
  if (req.method === 'PATCH' && pathname.match(/^\/api\/area\/[^/]+$/)) {
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
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/history
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
      const today = ymdLocal();
      pushHistory(areaId, campo, valor, today);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, campo, d: today }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/meta — cria meta manual
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
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, metaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/area/:id/meta/:metaId
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
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, metaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // DELETE /api/area/:id/meta/:metaId
  if (req.method === 'DELETE' && pathname.match(/^\/api\/area\/[^/]+\/meta\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const metaId = decodeURIComponent(parts[5]);
    try {
      deleteMeta(areaId, metaId);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, metaId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/checkin
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/checkin$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    try {
      const body = await readBody(req);
      const date = (body && body.date) || ymdLocal();
      const r = doCheckin(areaId, date);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, date, feito: r.feito }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // POST /api/area/:id/missao/:missaoId — toggle missão manual
  if (req.method === 'POST' && pathname.match(/^\/api\/area\/[^/]+\/missao\/[^/]+$/)) {
    const parts = pathname.split('/');
    const areaId = decodeURIComponent(parts[3]);
    const missaoId = decodeURIComponent(parts[5]);
    try {
      const body = await readBody(req);
      const date = (body && body.date) || ymdLocal();
      const r = logMissao(areaId, missaoId, date);
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, areaId, missaoId, feita: r.feita }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // PATCH /api/config — salva configurações do usuário
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
      if (body.projectTags && typeof body.projectTags === 'object') {
        if (!config.projectTags) config.projectTags = {};
        const ALLOWED = ['caixa', 'dispersao', 'infra'];
        for (const [k, v] of Object.entries(body.projectTags)) {
          if (v === null || v === '') delete config.projectTags[k];
          else if (ALLOWED.includes(v)) config.projectTags[k] = v;
        }
      }
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
      if (body.theme !== undefined) {
        const TEMAS = ['carvao', 'meianoite', 'sepia'];
        if (TEMAS.includes(body.theme)) config.theme = body.theme;
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      invalidateCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  // GET /api/export — backup do usuário
  if (req.method === 'GET' && pathname === '/api/export') {
    try {
      let config; try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { config = {}; }
      const data = readData();
      const stamp = ymdLocal();
      const out = JSON.stringify({ exportedAt: new Date().toISOString(), config, data }, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="shinzen-backup-${stamp}.json"`,
      });
      res.end(out);
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

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

// ── SERVIDOR HTTP ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── Guarda 1: Host local (DNS-rebinding). Vale pra TODO request. ──
  if (!hostOk(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('forbidden host'); return; }

  // ── Guarda 2: mutação (POST/PATCH/DELETE) exige Origin local (CSRF). ──
  // Sem CORS '*': não emitimos Access-Control-Allow-Origin, então JS cross-origin
  // nem lê a resposta de GET. O frontend é same-origin (servido aqui), não precisa.
  const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  if (mutating && !originOk(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('cross-origin blocked'); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── ROTAS PÚBLICAS (sem auth) ──

  if (req.method === 'GET' && pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
    return;
  }

  // Disponibilidade do Claude Code (condicional)
  if (req.method === 'GET' && pathname === '/api/claude-overview') {
    try {
      const fpath = path.join(os.homedir(), '.claude', 'overviews.json');
      const raw = fs.readFileSync(fpath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: true, data: JSON.parse(raw) }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false }));
    }
    return;
  }

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

  // ── ROTAS /api/* (local, single-user) ──
  if (!pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  await handle(req, res, url, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Shinzen rodando em http://localhost:${PORT}`);
  console.log('Pressione Ctrl+C para parar.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} já em uso.`);
  } else {
    console.error('Erro no servidor:', err);
  }
  process.exit(1);
});
