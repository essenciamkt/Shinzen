'use strict';

/* Analisa timestamps das sessões para produzir:
   - Matriz de atividade 24h × 7 dias
   - Hora/dia de pico
   - Duração média de sessão (mediana)

   Privacidade: usa apenas firstTs e lastTs (metadados de sessão, não conteúdo).
*/

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Converte Date.getDay() (0=Dom) para índice Mon-first (0=Seg)
function dayIndex(d) {
  return (d.getDay() + 6) % 7;
}

function build(summaries) {
  // matrix[hour 0-23][day 0-6 (Seg=0)]
  const matrix = Array.from({ length: 24 }, () => new Array(7).fill(0));
  const durations = [];

  for (const s of summaries) {
    if (!s.lastTs) continue;

    const d = new Date(s.lastTs);
    const hour = d.getHours();
    const day = dayIndex(d);
    matrix[hour][day]++;

    // duração: ignora <2min e >8h
    if (s.firstTs && s.lastTs) {
      const minutos = (s.lastTs - s.firstTs) / 60000;
      if (minutos >= 2 && minutos <= 480) {
        durations.push(Math.round(minutos));
      }
    }
  }

  // pico: célula com maior valor
  let peakHour = 0, peakDay = 0, peakVal = 0;
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      if (matrix[h][d] > peakVal) {
        peakVal = matrix[h][d];
        peakHour = h;
        peakDay = d;
      }
    }
  }

  const peakLabel = peakVal > 0
    ? `${DAY_LABELS[peakDay]}s às ${peakHour}h`
    : 'Sem dados suficientes';

  durations.sort((a, b) => a - b);
  const avgSessionDuration = durations.length >= 3 ? median(durations) : null;

  return {
    matrix,
    peakHour,
    peakDay,
    peakLabel,
    avgSessionDuration,
    sessionDurations: durations,
  };
}

module.exports = { build };
