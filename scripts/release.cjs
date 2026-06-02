#!/usr/bin/env node
// scripts/release.cjs — fluxo completo de release para Matoba Finanças
// Uso: npm run release
//      npm run release -- "Descrição da feature"

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });

// Verifica se a pasta functions/ foi alterada em algum dos últimos commits
// ou tem arquivos não commitados — usa staged+unstaged como fallback seguro
function functionsChanged() {
  try {
    // Verifica mudanças não commitadas em functions/
    const unstaged = execSync('git status --short functions/', { cwd: root }).toString();
    if (unstaged.trim()) return true;

    // Verifica se o último commit tocou em functions/
    const commitCount = execSync('git rev-list --count HEAD', { cwd: root }).toString().trim();
    if (Number(commitCount) < 2) return true; // repo com 1 commit → deploy por segurança
    const out = execSync('git diff HEAD~1 HEAD --name-only', { cwd: root }).toString();
    return out.includes('functions/');
  } catch {
    return true; // em caso de dúvida, faz o deploy
  }
}

// Lê versão atual do package.json
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const desc = process.argv[2] || '';
const commitMsg = desc
  ? `release: v${version} — ${desc}`
  : `release: v${version}`;

// Lê o changelog do version.js para extrair as notes da versão atual
function getVersionNotes() {
  try {
    const versionSrc = fs.readFileSync(path.join(root, 'src/utils/version.js'), 'utf8');
    const match = versionSrc.match(/version:\s*['"]([^'"]+)['"]\s*,[\s\S]*?changes:\s*\[([^\]]+)\]/);
    if (!match || match[1] !== version) return [];
    return match[2]
      .split('\n')
      .map(l => l.trim().replace(/^['"]|['"],?$/g, ''))
      .filter(Boolean);
  } catch { return []; }
}

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

  // 4. Atualiza public/version.json (lido pelo app para notificar usuários)
  console.log('📋 Atualizando version.json...');
  const versionJson = {
    version,
    date: new Date().toLocaleDateString('pt-BR'),
    notes: getVersionNotes(),
  };
  fs.writeFileSync(
    path.join(root, 'public/version.json'),
    JSON.stringify(versionJson, null, 2) + '\n',
    'utf8'
  );

  // 5. Build de produção
  console.log('🔨 Gerando build de produção...');
  run('npm run build');

  // 6. Deploy no GitHub Pages
  console.log('🌐 Publicando no GitHub Pages...');
  run('npm run deploy');

  // 7. Deploy das Cloud Functions (se alteradas)
  if (functionsChanged()) {
    console.log('☁️  Detectadas alterações em functions/ — fazendo deploy...');
    try {
      run('npx firebase deploy --only functions', { cwd: root });
      console.log('   ✅ Cloud Functions atualizadas.');
    } catch (fnErr) {
      console.warn('   ⚠️  Deploy das functions falhou:', fnErr.message);
      console.warn('   Execute manualmente: firebase deploy --only functions');
    }
  } else {
    console.log('☁️  Nenhuma alteração em functions/ — deploy ignorado.');
  }

  console.log(`\n✅ Release v${version} publicado com sucesso!\n`);
} catch (err) {
  console.error('\n❌ Erro durante o release:', err.message);
  process.exit(1);
}
