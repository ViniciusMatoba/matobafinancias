#!/usr/bin/env node
// scripts/release.cjs — fluxo completo de release para Matoba Finanças
// Uso: npm run release
//      npm run release -- "Descrição da feature"

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });

// Lê versão atual do package.json
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const desc = process.argv[2] || '';
const commitMsg = desc
  ? `release: v${version} — ${desc}`
  : `release: v${version}`;

console.log(`\n🚀 Matoba Finanças — Release v${version}\n`);

try {
  // 1. Pull remoto para evitar conflito
  console.log('📥 Sincronizando com repositório remoto...');
  try { run('git pull --rebase origin main'); }
  catch (_) { console.log('   (sem upstream ou já sincronizado)'); }

  // 2. Commit do código-fonte (se houver alterações)
  console.log('📝 Commitando alterações...');
  run('git add -A');
  try {
    run(`git commit -m "${commitMsg}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"`);
  } catch (_) {
    console.log('   (nenhuma alteração para commitar — prosseguindo)');
  }

  // 3. Push do código-fonte
  console.log('📤 Enviando para GitHub...');
  run('git push origin main');

  // 4. Build de produção
  console.log('🔨 Gerando build de produção...');
  run('npm run build');

  // 5. Deploy no GitHub Pages
  console.log('🌐 Publicando no GitHub Pages...');
  run('npm run deploy');

  console.log(`\n✅ Release v${version} publicado com sucesso!\n`);
} catch (err) {
  console.error('\n❌ Erro durante o release:', err.message);
  process.exit(1);
}
