#!/usr/bin/env node
/**
 * scripts/git-worktree.mjs — várias instâncias, zero briga de checkout.
 *
 * Atrito real (16-17/07): rodar mais de um Claude no mesmo repo ao mesmo
 * tempo faz as sessões brigarem pelo MESMO checkout — uma dá `git checkout`
 * e puxa o tapete da outra; um `stash` de uma engole o trabalho da outra
 * (aconteceu, e custou trabalho não commitado).
 *
 * `git worktree` resolve na raiz: cada branch ganha seu PRÓPRIO diretório de
 * trabalho, com índice e checkout independentes, compartilhando o mesmo .git
 * (mesma história, mesmos objetos). Duas instâncias, duas pastas, nenhuma
 * pisa na outra.
 *
 *   npm run git:worktree -- <branch> [base]   # cria/abre um worktree
 *   npm run git:worktree -- list              # lista os worktrees
 *   npm run git:worktree -- remove <branch>   # remove o worktree (não a branch)
 *
 * Os worktrees nascem em ../nos-worktrees/<branch> (irmão do repo), fora da
 * árvore versionada — some com `remove`, nunca vira lixo commitado.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function git(args, { capture = true } = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function die(msg) { console.error(`\n❌ ${msg}\n`); process.exit(2); }

if (git(['rev-parse', '--is-inside-work-tree']).status !== 0) die('não estou dentro de um repositório git.');

const repoRoot = git(['rev-parse', '--show-toplevel']).out;
const treesDir = path.resolve(repoRoot, '..', 'nos-worktrees');
const slug = (b) => b.replace(/[^\w.-]+/g, '-');

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === '-h' || cmd === '--help') {
  console.log(`uso:
  npm run git:worktree -- <branch> [base]   cria/abre um worktree (base padrão origin/main)
  npm run git:worktree -- list              lista os worktrees ativos
  npm run git:worktree -- remove <branch>   remove o worktree (a branch continua no .git)`);
  process.exit(cmd ? 0 : 2);
}

if (cmd === 'list') {
  console.log(git(['worktree', 'list']).out || '(nenhum worktree extra)');
  process.exit(0);
}

if (cmd === 'remove') {
  const branch = rest[0];
  if (!branch) die('diga qual branch remover: npm run git:worktree -- remove <branch>');
  const dir = path.join(treesDir, slug(branch));
  const r = git(['worktree', 'remove', dir], { capture: false });
  if (r.status !== 0) die(`não removi ${dir} (worktree suja? use --force manualmente).`);
  console.log(`\n🧹 worktree removido: ${dir}\n   (a branch "${branch}" continua salva no .git.)\n`);
  process.exit(0);
}

// caso geral: cmd é o nome da branch; rest[0] é a base opcional
const branch = cmd;
const base = rest[0] || 'origin/main';
const dir = path.join(treesDir, slug(branch));

if (existsSync(dir)) die(`já existe um worktree em ${dir} — abra-o (cd) ou remova antes.`);

// a branch já existe (local ou remota)? então só faz checkout dela; senão cria a partir da base
const branchExists =
  git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0 ||
  git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).status === 0;

const args = branchExists
  ? ['worktree', 'add', dir, branch]
  : ['worktree', 'add', '-b', branch, dir, base];

console.log(`\n🌿 criando worktree para "${branch}"${branchExists ? '' : ` (nova, a partir de ${base})`}...`);
const r = git(args, { capture: false });
if (r.status !== 0) die('git worktree add falhou (branch já em uso em outro worktree?).');

console.log(`\n   pronto: ${dir}`);
console.log(`   entre com:  cd ${dir}`);
console.log(`   cada worktree tem índice e checkout PRÓPRIOS — rode outra instância aqui sem medo.`);
console.log(`   ao terminar:  npm run git:worktree -- remove ${branch}\n`);
