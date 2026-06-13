# Shinzen — Visão de Vida

Painel pessoal de metas e acompanhamento de vida. Roda **local**, single-user, sem dependências externas (Node stdlib puro — sem `npm install`).

## Rodar

```bash
./start.sh
```

Abre em **http://127.0.0.1:4317** (ou `node server.js` direto).

## O que faz

9 áreas de vida com score, streak, badges, missões e XP:

- **Claude Code** (automática) — lê suas sessões em `~/.claude/overviews.json`: sessões, custo equivalente, streak, subagentes, conquistas, objetivos, projetos, modelos, skills e MCPs, heatmap de atividade.
- **8 manuais** — Saúde, Finanças, Trabalho, Metas & Sonhos, Igreja & Fé, Lazer, Rotina & Energia, Mente & Hábitos. Cada uma com check-in diário, campos editáveis, missões, metas (auto + manuais) e histórico.

## Dados

Tudo em arquivo JSON local (versionado — é o seu estado pessoal):

- **`config.json`** — estático: perfil, câmbio USD→BRL, objetivos do Claude Code, overrides de projeto.
- **`data.json`** — dinâmico: campos, histórico, check-ins, streaks, badges e missões de cada área.
- **`~/.claude/overviews.json`** — fonte da área Claude Code (lido, nunca escrito).

## Arquitetura

- **`server.js`** — HTTP vanilla na porta 4317. API REST (`/api/dashboard`, `/api/area/:id`, `/api/area/:id/checkin`, `/api/area/:id/missao/:id`, `/api/goals/toggle`, `/api/config`…).
- **`lib/`** — módulos do payload: `payload.js` (orquestra), `datastore.js` (R/W), `progress.js` (streak/badge/missão), `goals.js`, `aggregate.js`/`parse.js`/`scan.js` (Claude Code), `cost.js`/`pricing.js`, etc.
- **`lib/areas/`** — um builder por área + `_progressDefs.js` (definições declarativas de badges/missões).
- **`index.html`** — SPA inteira (HTML+CSS+JS puro), tema dark.

## Notas

- O payload do dashboard é cacheado em memória; mutações invalidam o cache. `GET /api/dashboard?fresh=1` força rebuild.
- Único usuário, sem auth — pensado pra rodar só na sua máquina (como o `tasks/`).
</content>
