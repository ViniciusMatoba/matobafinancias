#!/usr/bin/env node
// scripts/release.cjs — fluxo completo de release para Matoba Finanças
// Uso: npm run release -- "Descrição da feature"
//      npm run release -- "Descrição" --dry-run      (só verifica remoto, testes e build; não commita nem publica)
//      npm run release -- "Descrição" --skip-tests   (pula os testes — use só em emergência)
//
// Ordem: remoto em dia? → testes → versão → build → commit → push → GitHub Pages → Cloud Functions.
// O build vem antes do push: se quebrar, nada chega ao main.

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
const sh  = (cmd) => execSync(cmd, { cwd: root }).toString().trim();

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const desc = args.find(a => !a.startsWith('--')) || '';
const DRY_RUN = flags.has('--dry-run');
const SKIP_TESTS = flags.has('--skip-tests');

// Lê versão atual do package.json
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const commitMsg = desc ? `release: v${version} — ${desc}` : `release: v${version}`;
const COAUTHOR = 'Co-Authored-By: Claude <noreply@anthropic.com>';

// O remoto pode ter releases feitos de outra máquina. Publicar sem integrar sobrescreveria o site
// com um build sem essas correções — por isso o release PARA se o remoto estiver à frente.
function garantirRemotoEmDia() {
  try {
    sh('git fetch origin main');
  } catch (e) {
    console.error('\n❌ Não consegui consultar o remoto (git fetch falhou). Verifique a conexão e tente de novo.');
    process.exit(1);
  }
  const atras = Number(sh('git rev-list --count HEAD..origin/main'));
  if (atras > 0) {
    console.error(`\n❌ O remoto (origin/main) está ${atras} commit(s) à frente do seu código local:\n`);
    console.error(sh('git log --format="   %h %an %ad %s" --date=short HEAD..origin/main'));
    console.error('\nIntegre antes de lançar (senão o site perderia essas correções):');
    console.error('   git stash push -u && git merge --ff-only origin/main && git stash pop');
    console.error('   (resolva conflitos de versão, suba a versão para a próxima livre e rode o release de novo)\n');
    process.exit(1);
  }
  console.log('   ✅ Remoto em dia.');
}

// Verifica se a pasta functions/ foi alterada no último commit ou tem arquivos não commitados
function functionsChanged() {
  try {
    const pendente = sh('git status --short functions/');
    if (pendente) return true;
    const commitCount = sh('git rev-list --count HEAD');
    if (Number(commitCount) < 2) return true; // repo com 1 commit → deploy por segurança
    return sh('git diff HEAD~1 HEAD --name-only').includes('functions/');
  } catch {
    return true; // em caso de dúvida, faz o deploy
  }
}

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

// Prefere o firebase global (o npx demora a carregar e estourava o limite de 10 s da descoberta de código)
function comandoFirebase() {
  try { execSync('firebase --version', { cwd: root, stdio: 'ignore' }); return 'firebase'; }
  catch { return 'npx firebase'; }
}

console.log(`\n🚀 Matoba Finanças — Release v${version}${DRY_RUN ? '  (dry-run: nada será commitado nem publicado)' : ''}\n`);

try {
  // 1. Remoto em dia?
  console.log('📥 Conferindo o repositório remoto...');
  garantirRemotoEmDia();

  // 2. Testes
  if (SKIP_TESTS) {
    console.log('🧪 Testes pulados (--skip-tests).');
  } else {
    console.log('🧪 Rodando testes...');
    run('npx vitest run');
  }

  // 3. Atualiza public/version.json ANTES do build/commit (lido pelo app para notificar usuários)
  if (!DRY_RUN) {
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
  }

  // 4. Build de produção (antes do push: se quebrar, nada é enviado)
  console.log('🔨 Gerando build de produção...');
  run('npm run build');

  if (DRY_RUN) {
    console.log('\n🔎 Dry-run concluído: remoto em dia, testes e build OK.');
    console.log(`   Commit que seria criado: ${commitMsg}`);
    console.log(`   Deploy das functions: ${sh('git status --short functions/') ? 'SIM (functions/ com alterações pendentes)' : 'não (functions/ sem alterações pendentes)'}`);
    console.log('   Nada foi commitado nem publicado.\n');
    process.exit(0);
  }

  // 5. Commit do código-fonte (se houver alterações)
  console.log('📝 Commitando alterações...');
  run('git add -A');
  try {
    execFileSync('git', ['commit', '-m', commitMsg, '-m', COAUTHOR], { cwd: root, stdio: 'inherit' });
  } catch (_) {
    console.log('   (nenhuma alteração para commitar — prosseguindo)');
  }

  // 6. Push do código-fonte
  console.log('📤 Enviando para GitHub...');
  run('git push origin main');

  // 7. Deploy no GitHub Pages (se for rejeitado por cache antigo do gh-pages, limpa e tenta de novo)
  console.log('🌐 Publicando no GitHub Pages...');
  try {
    run('npm run deploy');
  } catch (_) {
    console.warn('   ⚠️  Deploy rejeitado — limpando o cache do gh-pages e tentando de novo...');
    fs.rmSync(path.join(root, 'node_modules', '.cache', 'gh-pages'), { recursive: true, force: true });
    run('npm run deploy');
  }

  // 8. Deploy das Cloud Functions (se alteradas)
  if (functionsChanged()) {
    const fb = comandoFirebase();
    console.log(`☁️  Detectadas alterações em functions/ — fazendo deploy (${fb})...`);
    try {
      run(`${fb} deploy --only functions`, { env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: '60' } });
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
