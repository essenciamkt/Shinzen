'use strict';

/* Custo por projeto — replica o cálculo de cost.js mas agrupado por _dir.
   Reutiliza costUSD() de pricing.js para manter consistência.
*/

const { costUSD, familyOf } = require('./pricing');

function round2(n) { return Math.round(n * 100) / 100; }

function build(summaries, usdToBrl) {
  const rate = usdToBrl || 5.4;

  // Agrupar tokens por dir
  const byDir = {};
  for (const s of summaries) {
    const dir = s._dir;
    if (!dir) continue;
    if (!byDir[dir]) byDir[dir] = {};
    for (const [model, tok] of Object.entries(s.tokensByModel || {})) {
      if (!byDir[dir][model]) {
        byDir[dir][model] = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
      }
      const t = byDir[dir][model];
      t.input       += tok.input       || 0;
      t.output      += tok.output      || 0;
      t.cacheWrite5m += tok.cacheWrite5m || 0;
      t.cacheWrite1h += tok.cacheWrite1h || 0;
      t.cacheRead   += tok.cacheRead   || 0;
    }
  }

  // Calcular custo por dir
  const entries = [];
  let totalUsd = 0;

  for (const [dir, modelMap] of Object.entries(byDir)) {
    let dirUsd = 0;
    let topModel = null;
    let topTokens = 0;

    for (const [model, tok] of Object.entries(modelMap)) {
      const family = familyOf(model) || 'sonnet';
      dirUsd += costUSD(tok, family);
      const total = tok.input + tok.output;
      if (total > topTokens) { topTokens = total; topModel = model; }
    }

    totalUsd += dirUsd;
    entries.push({ dir, usd: round2(dirUsd), brl: round2(dirUsd * rate), topModel });
  }

  // Calcular pct e ordenar
  entries.sort((a, b) => b.usd - a.usd);
  for (const e of entries) {
    e.pct = totalUsd > 0 ? Math.round((e.usd / totalUsd) * 100) : 0;
  }

  return { byProject: entries };
}

module.exports = { build };
