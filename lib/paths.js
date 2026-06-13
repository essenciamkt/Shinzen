'use strict';

/* Resolve os caminhos do Claude Code no computador do usuário.
   Respeita CLAUDE_CONFIG_DIR se definido; senão usa ~/.claude. */

const os = require('os');
const path = require('path');

const HOME = os.homedir();

const CLAUDE_DIR =
  process.env.CLAUDE_CONFIG_DIR && process.env.CLAUDE_CONFIG_DIR.trim()
    ? process.env.CLAUDE_CONFIG_DIR.trim()
    : path.join(HOME, '.claude');

// O ~/.claude.json fica ao lado do diretório, no home — não dentro dele.
const CLAUDE_JSON = path.join(HOME, '.claude.json');

module.exports = {
  HOME,
  CLAUDE_DIR,
  CLAUDE_JSON,
  PROJECTS_DIR: path.join(CLAUDE_DIR, 'projects'),
  SKILLS_DIR: path.join(CLAUDE_DIR, 'skills'),
  AGENTS_DIR: path.join(CLAUDE_DIR, 'agents'),
  COMMANDS_DIR: path.join(CLAUDE_DIR, 'commands'),
  PLUGINS_DIR: path.join(CLAUDE_DIR, 'plugins'),
  SETTINGS: path.join(CLAUDE_DIR, 'settings.json'),
  SETTINGS_LOCAL: path.join(CLAUDE_DIR, 'settings.local.json'),
  // Diretório do próprio Shinzen (sidecars config/catalog ficam aqui).
  APP_DIR: path.resolve(__dirname, '..'),
};
