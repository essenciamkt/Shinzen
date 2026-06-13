'use strict';

/* Lê um arquivo .jsonl linha a linha e emite um RESUMO compacto.
   NUNCA toca message.content[].text nem .thinking — privacidade hard.

   Resumo por arquivo (FileSummary):
   {
     sessionId:      string,   // primeiro sessionId encontrado
     cwd:            string,   // cwd do primeiro evento do tipo "user" ou "assistant"
     gitBranch:      string|null,
     firstTs:        number,   // timestamp ms do primeiro evento
     lastTs:         number,   // timestamp ms do último evento
     msgCount:       number,   // total de linhas válidas
     assistantCount: number,
     agentTypes:     string[], // valores únicos de subagent_type encontrados
     models:         string[], // valores únicos de message.model
     tokensByModel:  {         // chaves = model id
       [model]: { input, output, cacheWrite5m, cacheWrite1h, cacheRead }
     },
   }
*/

const fs = require('fs');
const readline = require('readline');

function parseFile(filePath) {
  return new Promise((resolve, reject) => {
    const summary = {
      sessionId: null,
      cwd: null,
      gitBranch: null,
      firstTs: Infinity,
      lastTs: -Infinity,
      msgCount: 0,
      assistantCount: 0,
      agentTypes: new Set(),
      models: new Set(),
      tokensByModel: {},
    };

    let stream;
    try {
      stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    } catch (err) {
      return reject(err);
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch { return; }

      summary.msgCount++;

      // timestamp
      const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : NaN;
      if (!isNaN(ts)) {
        if (ts < summary.firstTs) summary.firstTs = ts;
        if (ts > summary.lastTs) summary.lastTs = ts;
      }

      // sessionId + cwd + gitBranch
      if (!summary.sessionId && ev.sessionId) summary.sessionId = ev.sessionId;
      if (!summary.cwd && ev.cwd) summary.cwd = ev.cwd;
      if (!summary.gitBranch && ev.gitBranch) summary.gitBranch = ev.gitBranch;

      if (ev.type === 'assistant') {
        summary.assistantCount++;

        // model
        const model = ev.message && ev.message.model;
        if (model) summary.models.add(model);

        // usage tokens
        const usage = ev.message && ev.message.usage;
        if (usage && model) {
          if (!summary.tokensByModel[model]) {
            summary.tokensByModel[model] = {
              input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0,
            };
          }
          const bucket = summary.tokensByModel[model];
          bucket.input += usage.input_tokens || 0;
          bucket.output += usage.output_tokens || 0;
          bucket.cacheRead += usage.cache_read_input_tokens || 0;

          // cache_creation: prefere o split 5m/1h aninhado; senão flat → 5m conservador
          const nested = usage.cache_creation;
          if (nested && typeof nested === 'object') {
            bucket.cacheWrite5m += nested.ephemeral_5m_input_tokens || 0;
            bucket.cacheWrite1h += nested.ephemeral_1h_input_tokens || 0;
          } else {
            bucket.cacheWrite5m += usage.cache_creation_input_tokens || 0;
          }
        }

        // subagent detection: tool_use name:"Task" → input.subagent_type
        const content = ev.message && ev.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block &&
              block.type === 'tool_use' &&
              (block.name === 'Task' || block.name === 'Agent') &&
              block.input &&
              block.input.subagent_type
            ) {
              summary.agentTypes.add(block.input.subagent_type);
            }
          }
        }
      }
    });

    rl.on('close', () => {
      // converter Sets em arrays
      summary.agentTypes = [...summary.agentTypes];
      summary.models = [...summary.models];
      if (summary.firstTs === Infinity) summary.firstTs = null;
      if (summary.lastTs === -Infinity) summary.lastTs = null;
      resolve(summary);
    });

    rl.on('error', reject);
    stream.on('error', reject);
  });
}

/* Parseia lista de arquivos, usando cache de scan.js para pular unchanged.
   Retorna { summaries: FileSummary[], cacheHits, parsed, errors } */
async function parseAll(files, { getCache, setCache }) {
  const summaries = [];
  let cacheHits = 0;
  let parsed = 0;
  let errors = 0;

  for (const { filePath, mtimeMs, cached } of files) {
    if (cached) {
      const hit = getCache(filePath, mtimeMs);
      if (hit) {
        summaries.push(hit);
        cacheHits++;
        continue;
      }
    }

    try {
      const summary = await parseFile(filePath);
      setCache(filePath, mtimeMs, summary);
      summaries.push(summary);
      parsed++;
    } catch {
      errors++;
    }
  }

  return { summaries, cacheHits, parsed, errors };
}

module.exports = { parseFile, parseAll };
