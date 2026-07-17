#!/usr/bin/env node
/**
 * scripts/git-maintenance.mjs — mantém a Crônica RÁPIDA de ler.
 *
 * O NÓS grava 1 commit por batida, para sempre — a Crônica só cresce. O git
 * guarda a história como uma corrente: consultas como `log`, `blame`,
 * `merge-base` andam essa corrente commit a commit. Com dezenas de milhares
 * de batidas isso arrasta — e o "servidor" do NÓS é o Actions rodando git a
 * cada batida, então lentidão ali atrasa o jogo inteiro.
 *
 * O commit-graph é um índice pré-calculado ao lado da história (posições,
 * ancestralidade, filtros de caminho). Com ele, essas consultas respondem em
 * tempo quase constante, não importa o tamanho da Crônica. É PURO cache de
 * leitura: NÃO altera um único commit, NÃO reescreve história, NÃO toca o
 * estado do jogo. Rodar de novo é inofensivo (idempotente).
 *
 *   npm run git:maintenance
 *
 * Quando ligar de vez: enquanto a Crônica for pequena não muda nada — seria
 * otimização prematura. O limiar recomendado (D-39) é ~5.000 batidas; aí o
 * passo entra no workflow do tick (pendência do ideador, ver docs/GIT.md).
 * Localmente, dá pra rodar quando quiser — ou `git maintenance start` uma vez
 * agenda em segundo plano.
 */
import { spawnSync } from 'node:child_process';

function git(args, { capture = true } = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

if (git(['rev-parse', '--is-inside-work-tree']).status !== 0) {
  console.error('❌ não estou dentro de um repositório git.');
  process.exit(2);
}

const commits = git(['rev-list', '--count', 'HEAD']).out || '?';
console.log(`\n🗂️  Manutenção da Crônica — ${commits} batidas na história.\n`);

// 1) commit-graph com bloom de caminhos: acelera até log/blame de UM arquivo
//    (ex.: "história de world/heart.json") — exatamente o que a forense usa.
process.stdout.write('   • escrevendo commit-graph (--reachable --changed-paths)... ');
const cg = git(['commit-graph', 'write', '--reachable', '--changed-paths']);
console.log(cg.status === 0 ? 'ok' : `falhou\n     ${cg.err}`);

// 2) manutenção incremental: reempacota objetos soltos, expira reflogs, etc.
//    `--auto` só age se o repo realmente precisa (barato de chamar sempre).
process.stdout.write('   • git maintenance run --auto... ');
let mnt = git(['maintenance', 'run', '--auto']);
if (mnt.status !== 0) {
  // git antigo sem `maintenance`: cai no gc automático (mesmo espírito)
  process.stdout.write('sem `maintenance`, usando `gc --auto`... ');
  mnt = git(['gc', '--auto']);
}
console.log(mnt.status === 0 ? 'ok' : `falhou\n     ${mnt.err}`);

// 3) relatório
const hasGraph = git(['rev-parse', '--git-path', 'objects/info/commit-graph']);
console.log(`\n   commit-graph: ${hasGraph.out ? 'presente' : 'ausente'} — leitura da história otimizada.`);
console.log('   (nada da história foi alterado; só o índice de leitura.)\n');

process.exit(cg.status === 0 ? 0 : 1);
