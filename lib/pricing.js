'use strict';

/* Tabela de preços da API Anthropic (USD por 1 milhão de tokens) e o cálculo
   de custo 4-vias (input / output / cache-write / cache-read).

   O cache-write é dividido em 5 minutos (1.25x do input) e 1 hora (2x do input),
   precificados separadamente — por isso não dá pra usar uma aproximação flat.

   Preços de referência (cacheados em 2026-05-26 via skill claude-api):
     Opus 4.8   in 5  / out 25 / cw5m 6.25 / cw1h 10 / cr 0.50
     Sonnet 4.6 in 3  / out 15 / cw5m 3.75 / cw1h 6  / cr 0.30
     Haiku 4.5  in 1  / out 5  / cw5m 1.25 / cw1h 2  / cr 0.10
*/

// Preço por 1M tokens, por família de modelo.
const PRICES = {
  opus:   { in: 5, out: 25, cw5m: 6.25, cw1h: 10, cr: 0.5,  label: 'Opus' },
  sonnet: { in: 3, out: 15, cw5m: 3.75, cw1h: 6,  cr: 0.3,  label: 'Sonnet' },
  haiku:  { in: 1, out: 5,  cw5m: 1.25, cw1h: 2,  cr: 0.1,  label: 'Haiku' },
};

// Modelo desconhecido cai no preço do Sonnet (meio-termo) e é sinalizado.
const DEFAULT_FAMILY = 'sonnet';

const MILLION = 1e6;

/* Detecta a família a partir do id do modelo (ex: "claude-opus-4-8[1m]" -> opus). */
function familyOf(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return null; // desconhecido
}

/* Rótulo amigável: "claude-opus-4-8" -> "Opus 4.8". */
function prettyModel(model) {
  return String(model || '')
    .replace(/\[1m\]$/i, '')
    .replace(/^claude-/, 'Claude ')
    .replace(/(opus|sonnet|haiku)-(\d+)-(\d+)/i, function (_, fam, x, y) {
      return fam.charAt(0).toUpperCase() + fam.slice(1) + ' ' + x + '.' + y;
    })
    .replace(/-/g, ' ')
    .trim();
}

/* Custo em USD de um balde de tokens de um único modelo.
   tokens = { input, output, cacheWrite5m, cacheWrite1h, cacheRead } */
function costUSD(tokens, family) {
  const p = PRICES[family] || PRICES[DEFAULT_FAMILY];
  const t = tokens || {};
  return (
    ((t.input || 0) / MILLION) * p.in +
    ((t.output || 0) / MILLION) * p.out +
    ((t.cacheWrite5m || 0) / MILLION) * p.cw5m +
    ((t.cacheWrite1h || 0) / MILLION) * p.cw1h +
    ((t.cacheRead || 0) / MILLION) * p.cr
  );
}

module.exports = { PRICES, DEFAULT_FAMILY, familyOf, prettyModel, costUSD };
