'use strict';

/* Calcula custo monetário a partir dos tokens agregados por modelo.

   Saída de build():
   {
     rate:         number,   // usdToBrl usado
     currencyNote: string,   // framing correto (assinatura, não fatura)
     totals: {
       usd: number, brl: number,
       tokens: { input, output, cacheCreate, cacheRead }
     },
     byModel: [
       { model, label, tokens:{…}, usd, brl, pct }   // pct do total USD
     ],
     weekly: [
       { weekStart:"YYYY-MM-DD", usd, brl }          // 12 semanas
     ],
     unknownModels: string[],
   }
*/

const { familyOf, prettyModel, costUSD } = require('./pricing');

const CURRENCY_NOTE =
  'Valor de uso equivalente — quanto custaria pela API. ' +
  'Você está numa assinatura e não paga por token.';

/* summaries  = FileSummary[] (de parse.js), com _lastTs injetado
   activityWeeks = [{ weekStart, ... }] de aggregate.js (shape já calculado)
   usdToBrl = number */
function build(summaries, activityWeeks, usdToBrl) {
  const rate = usdToBrl || 5.4;

  // ---- totais por modelo ----
  const modelAccum = {}; // model -> { tokens, usd }
  const unknownSet = new Set();

  let totalInput = 0, totalOutput = 0, totalCacheCreate = 0, totalCacheRead = 0;
  let totalUsd = 0;

  // Precisamos de custo por semana → acumular por semana e por modelo
  // weeklyUsd: Map<weekStart, usd>
  const weeklyUsd = new Map();
  for (const w of activityWeeks) weeklyUsd.set(w.weekStart, 0);

  // Helper: qual weekStart dono de um timestamp ms?
  // Compara contra as semanas (cada semana é [weekStart, weekStart+7d))
  const weekBoundaries = activityWeeks.map(w => {
    const [y, mo, d] = w.weekStart.split('-').map(Number);
    return { start: new Date(y, mo - 1, d).getTime(), key: w.weekStart };
  });

  function getWeekKey(tsMs) {
    if (!tsMs) return null;
    // Última semana cujo start ≤ ts
    let hit = null;
    for (const wb of weekBoundaries) {
      if (tsMs >= wb.start) hit = wb.key;
    }
    return hit;
  }

  for (const s of summaries) {
    if (!s) continue;
    for (const [model, tok] of Object.entries(s.tokensByModel || {})) {
      const family = familyOf(model);
      if (!family) unknownSet.add(model);

      const usd = costUSD(tok, family || 'sonnet');

      if (!modelAccum[model]) {
        modelAccum[model] = {
          tokens: { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 },
          usd: 0,
        };
      }
      const acc = modelAccum[model];
      acc.tokens.input += tok.input || 0;
      acc.tokens.output += tok.output || 0;
      acc.tokens.cacheWrite5m += tok.cacheWrite5m || 0;
      acc.tokens.cacheWrite1h += tok.cacheWrite1h || 0;
      acc.tokens.cacheRead += tok.cacheRead || 0;
      acc.usd += usd;

      totalInput += tok.input || 0;
      totalOutput += tok.output || 0;
      totalCacheCreate += (tok.cacheWrite5m || 0) + (tok.cacheWrite1h || 0);
      totalCacheRead += tok.cacheRead || 0;
      totalUsd += usd;

      // semana: usar lastTs da sessão como âncora
      const wk = getWeekKey(s.lastTs);
      if (wk !== null) weeklyUsd.set(wk, (weeklyUsd.get(wk) || 0) + usd);
    }
  }

  // ---- byModel ----
  const byModel = Object.entries(modelAccum)
    .map(([model, { tokens, usd }]) => ({
      model,
      label: prettyModel(model),
      tokens: {
        input: tokens.input,
        output: tokens.output,
        cacheCreate: tokens.cacheWrite5m + tokens.cacheWrite1h,
        cacheRead: tokens.cacheRead,
      },
      usd: round(usd),
      brl: round(usd * rate),
      pct: totalUsd > 0 ? round((usd / totalUsd) * 100) : 0,
    }))
    .sort((a, b) => b.usd - a.usd);

  // ---- weekly ----
  const weekly = activityWeeks.map(w => {
    const usd = weeklyUsd.get(w.weekStart) || 0;
    return { weekStart: w.weekStart, usd: round(usd), brl: round(usd * rate) };
  });

  return {
    rate,
    currencyNote: CURRENCY_NOTE,
    totals: {
      usd: round(totalUsd),
      brl: round(totalUsd * rate),
      tokens: {
        input: totalInput,
        output: totalOutput,
        cacheCreate: totalCacheCreate,
        cacheRead: totalCacheRead,
      },
    },
    byModel,
    weekly,
    unknownModels: [...unknownSet],
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { build };
