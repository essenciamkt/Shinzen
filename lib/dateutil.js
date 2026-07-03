'use strict';

/* Datas no fuso LOCAL (BR), não UTC.

   Bug que isto corrige: `new Date().toISOString().slice(0,10)` devolve a data
   em UTC. Como o servidor roda em GMT-3, depois das 21h o "hoje" virava o dia
   seguinte — check-in e streak gravavam na data errada. Estas helpers usam os
   getters LOCAIS, então "hoje" é o hoje do relógio do usuário.

   Use SEMPRE que precisar de um carimbo de DIA ("YYYY-MM-DD").
   Para instantes (generatedAt, exportedAt) continue usando toISOString(). */

// "YYYY-MM-DD" no fuso local.
function ymdLocal(d) {
  const date = d instanceof Date ? d : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" → Date à meia-noite LOCAL (evita o off-by-one do parse ISO puro).
function parseYmd(s) {
  return new Date(String(s).slice(0, 10) + 'T00:00:00');
}

module.exports = { ymdLocal, parseYmd };
