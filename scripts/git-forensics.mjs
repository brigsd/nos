#!/usr/bin/env node
/**
 * scripts/git-forensics.mjs — "a Reversão ao contrário".
 *
 * No NÓS, 1 batida = 1 commit, para sempre (a Crônica). Quando o mundo
 * quebra — um estado inválido, uma regressão que ninguém viu entrar — a
 * pergunta é sempre a mesma: QUAL batida fez isso? Achar isso na mão,
 * commit por commit, é inviável com milhares de batidas.
 *
 * Este script embrulha `git bisect run`: uma BUSCA BINÁRIA na história que
 * encontra o commit culpado em log2(n) passos, testando cada candidato com
 * um validador automático. 10.000 batidas -> ~14 testes.
 *
 *   npm run git:forensics -- <batida-boa>
 *   npm run git:forensics -- <batida-boa> -- npm test
 *   npm run git:forensics -- abc1234 -- node scripts/meu-predicado.mjs
 *
 * - <batida-boa>: um ref (hash/tag/HEAD~N) onde o mundo AINDA estava são.
 *   HEAD é assumido como "ruim" (é onde o problema aparece hoje).
 * - Validador (depois do 2º `--`): opcional. Padrão: `npm run validate-world`
 *   (valida world/heart.json contra o schema). Deve sair 0 = são, != 0 = quebrado.
 *
 * SEGURANÇA: o bisect faz checkout de commits antigos. Este script RECUSA
 * rodar com a árvore suja (perderia trabalho não commitado) e SEMPRE faz
 * `git bisect reset` no fim — mesmo se algo explodir no meio.
 *
 * CAVEAT do validador: por padrão o validador roda como ELE ERA em cada
 * commit (o checkout leva junto o engine/validate.ts daquela época). Isso
 * é o certo para "quando o DADO quebrou sob as regras da época". Se o schema
 * mudou muito no intervalo, fixe o validador passando um comando que aponte
 * para uma versão estável (ex.: um script copiado para fora da árvore).
 */
import { spawnSync } from 'node:child_process';

/** roda git capturando stdout (trim); lança em erro se `check`. */
function git(args, { check = true } = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (check && r.status !== 0) {
    throw new Error(`git ${args.join(' ')} falhou:\n${r.stderr || r.stdout}`);
  }
  return (r.stdout || '').trim();
}

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(2);
}

// ---- parse dos argumentos: <boa> [-- validador...] ----
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const positional = sep === -1 ? argv : argv.slice(0, sep);
const validator = sep === -1 ? ['npm', 'run', 'validate-world'] : argv.slice(sep + 1);
const goodRef = positional[0];

if (!goodRef || goodRef === '-h' || goodRef === '--help') {
  console.log(`uso: npm run git:forensics -- <batida-boa> [-- <comando validador>]

  <batida-boa>   ref onde o mundo AINDA estava são (hash/tag/HEAD~N)
  validador      opcional; padrão "npm run validate-world" (sai 0=são, !=0=quebrado)

exemplos:
  npm run git:forensics -- HEAD~200
  npm run git:forensics -- v1.0 -- npm test
  npm run git:forensics -- abc1234 -- node scripts/meu-predicado.mjs`);
  process.exit(goodRef ? 0 : 2);
}

// ---- guardas ----
try {
  git(['rev-parse', '--is-inside-work-tree']);
} catch {
  die('não estou dentro de um repositório git.');
}

const dirty = git(['status', '--porcelain']);
if (dirty) {
  die(
    'a árvore de trabalho está suja e o bisect faz checkout de commits antigos ' +
      '(perderia seu trabalho). Faça commit ou `git stash -u` antes.\n\nPendente:\n' +
      dirty,
  );
}

// já em bisect? aborta pra não empilhar
const bisecting = spawnSync('git', ['bisect', 'log'], { encoding: 'utf8' }).status === 0;
if (bisecting) {
  console.error('⚠️  um bisect já estava em andamento — encerrando antes de começar limpo.');
  git(['bisect', 'reset'], { check: false });
}

let goodHash;
try {
  goodHash = git(['rev-parse', '--verify', `${goodRef}^{commit}`]);
} catch {
  die(`não consegui resolver "${goodRef}" para um commit.`);
}
const headHash = git(['rev-parse', 'HEAD']);
if (goodHash === headHash) {
  die('a batida-boa é o próprio HEAD — não há intervalo para procurar.');
}
// a boa precisa ser ancestral do HEAD
if (spawnSync('git', ['merge-base', '--is-ancestor', goodHash, 'HEAD']).status !== 0) {
  die(`"${goodRef}" não é ancestral de HEAD — o bisect precisa de um intervalo bom→ruim reto.`);
}

const n = Number(git(['rev-list', '--count', `${goodHash}..HEAD`]));
console.log(`\n🔎 Forense: procurando a batida que quebrou o mundo.`);
console.log(`   intervalo: ${goodRef} (são) → HEAD (quebrado) = ${n} commits (~${Math.ceil(Math.log2(n + 1))} testes)`);
console.log(`   validador: ${validator.join(' ')}\n`);

// ---- o bisect ----
let culprit = null;
try {
  git(['bisect', 'start']);
  git(['bisect', 'bad', 'HEAD']);
  git(['bisect', 'good', goodHash]);

  // `git bisect run` roda o validador em cada candidato: 0=bom, 1..124=ruim,
  // 125=pular (não testável). Deixamos a saída fluir para o terminal.
  const run = spawnSync('git', ['bisect', 'run', ...validator], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
  const out = run.stdout || '';
  process.stdout.write(out);

  const m = out.match(/^([0-9a-f]{7,40}) is the first bad commit/m);
  if (m) culprit = m[1];
} finally {
  // SEMPRE volta o repo ao normal (mesmo se algo acima falhou)
  git(['bisect', 'reset'], { check: false });
}

// ---- veredito ----
if (!culprit) {
  console.error('\n⚠️  o bisect terminou sem apontar um culpado único. Causas comuns:');
  console.error('   - o validador nunca acusou "quebrado" no intervalo (revise a batida-boa);');
  console.error('   - commits pulados (125) demais deixaram a busca ambígua.');
  process.exit(1);
}

console.log('\n🕯️  A batida da Reversão — o primeiro commit quebrado:\n');
console.log(git(['show', '--no-patch', '--format=  %C(yellow)%h%C(reset) %s%n  autor: %an  ·  %ad', '--date=short', culprit]));
console.log('\n  arquivos tocados:');
console.log(
  git(['show', '--stat', '--format=', culprit])
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n'),
);
console.log(`\n  inspecionar:  git show ${culprit}`);
console.log(`  reverter:     git revert ${culprit}\n`);
