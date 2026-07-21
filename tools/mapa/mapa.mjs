#!/usr/bin/env node
/* mapa.mjs — gera docs/MAPA.md: a árvore do repositório com o resumo de cada
   arquivo. O resumo NÃO mora aqui: mora no PRÓPRIO arquivo (primeiro
   comentário de cabeçalho; H1 nos .md) — este script só projeta. Assim o mapa
   não vira segunda verdade que apodrece: renomeou/criou/apagou arquivo ou
   mudou cabeçalho, `npm run mapa` refaz; `npm run mapa:check` (CI) falha se o
   commitado estiver velho OU se algum arquivo-fonte estiver sem cabeçalho.
   Sem timestamp de propósito: saída 100% determinística do estado do repo,
   senão o check nunca bateria. Zero dependências (git ls-files + fs). */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAIDA = path.join(REPO, 'docs', 'MAPA.md');
const CODIGO = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.html']);
const DOCS = new Set(['.md']);
const IGNORAR = new Set(['docs/MAPA.md']); // o mapa não se auto-lista

const rastreados = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => {
    if (IGNORAR.has(f)) return false;
    const ext = path.extname(f);
    return CODIGO.has(ext) || DOCS.has(ext);
  })
  .sort();

/* Primeiro comentário nas primeiras linhas (o CABEÇALHO). Aceita os três
   sabores (/* … , // …, <!-- …), pula shebang e junta até 3 linhas do mesmo
   comentário (senão cabeçalho multi-linha corta no meio da frase). Nos .md o
   resumo é o H1 — pulando frontmatter (--- … ---), e usando `description:` do
   frontmatter se houver (caso dos agents). Devolve null se não achou — e null
   é ERRO no --check, não silêncio. */
function resumoDe(rel) {
  const linhas = readFileSync(path.join(REPO, rel), 'utf8').split('\n', 40);
  if (DOCS.has(path.extname(rel))) {
    let i = 0;
    if (linhas[0]?.trim() === '---') {           // frontmatter: description vale mais que o H1
      for (i = 1; i < linhas.length && linhas[i].trim() !== '---'; i++) {
        const m = linhas[i].match(/^description:\s*(.+)/);
        if (m) return limpa(m[1].replace(/^['"]|['"]$/g, ''));
      }
      i++;
    }
    for (; i < linhas.length; i++) { const m = linhas[i].match(/^#\s+(.+)/); if (m) return limpa(m[1]); }
    for (const l of linhas) if (l.trim() && l.trim() !== '---') return limpa(l);
    return null;
  }
  const junta = (partes) => limpa(partes.join(' '));
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const l = linhas[i].trim();
    if (i === 0 && l.startsWith('#!')) continue;
    let m = l.match(/\/\*+\s*(.*)/);
    if (m) { // bloco: junta as primeiras linhas do comentário
      const partes = [];
      let t = m[1].replace(/\*+\/\s*$/, '').trim();
      if (t) partes.push(t);
      if (l.includes('*/')) return partes.length ? junta(partes) : null; // bloco de 1 linha: fecha aqui
      for (let j = i + 1; j < linhas.length && partes.length < 3; j++) {
        if (linhas[j].includes('*/') && !linhas[j].replace(/^\s*\*?\s?/, '').replace(/\*+\/.*$/, '').trim()) break;
        t = linhas[j].replace(/^\s*\*?\s?/, '').replace(/\*+\/.*$/, '').trim();
        if (!t) break;                            // linha vazia encerra o resumo
        partes.push(t);
        if (linhas[j].includes('*/')) break;
      }
      return partes.length ? junta(partes) : null;
    }
    if (/^\/\//.test(l)) {                        // linha(s) //: junta a sequência
      const partes = [];
      for (let j = i; j < linhas.length && partes.length < 3; j++) {
        const mm = linhas[j].trim().match(/^\/\/\s?(.*)/);
        if (!mm || !mm[1].trim()) break;
        partes.push(mm[1].trim());
      }
      if (partes.length) return junta(partes);
    }
    m = l.match(/<!--\s*(.*?)(?:-->)?\s*$/);
    if (m && m[1].trim()) return limpa(m[1]);
  }
  return null;
}

function limpa(s) {
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}

function gerar() {
  const semCabecalho = [];
  const porPasta = new Map();
  for (const rel of rastreados) {
    const resumo = resumoDe(rel);
    if (resumo === null) semCabecalho.push(rel);
    const pasta = path.dirname(rel);
    if (!porPasta.has(pasta)) porPasta.set(pasta, []);
    porPasta.get(pasta).push({ nome: path.basename(rel), resumo });
  }
  const pastas = [...porPasta.keys()].sort((a, b) => (a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b)));
  const L = [];
  L.push('# MAPA — a árvore do NÓS, arquivo por arquivo');
  L.push('');
  L.push('> **GERADO** por `npm run mapa` — não edite à mão. O resumo de cada arquivo');
  L.push('> mora no próprio arquivo (primeiro comentário; H1 nos `.md`); isto é a');
  L.push('> projeção. `npm run mapa:check` (CI) falha se isto estiver velho ou se');
  L.push('> algum arquivo-fonte estiver sem cabeçalho.');
  L.push('');
  L.push(`${rastreados.length} arquivos (código \`.js .mjs .cjs .ts .tsx .html\` + docs \`.md\`).`);
  for (const pasta of pastas) {
    L.push('');
    L.push(`## ${pasta === '.' ? '(raiz)' : pasta + '/'}`);
    L.push('');
    for (const { nome, resumo } of porPasta.get(pasta)) {
      L.push(`- \`${nome}\` — ${resumo ?? '**SEM CABEÇALHO**'}`);
    }
  }
  L.push('');
  return { texto: L.join('\n'), semCabecalho };
}

const { texto, semCabecalho } = gerar();

if (process.argv.includes('--check')) {
  let falhou = false;
  if (semCabecalho.length) {
    falhou = true;
    console.error(`mapa:check FALHOU — ${semCabecalho.length} arquivo(s) sem cabeçalho (todo arquivo se descreve na primeira linha de comentário):`);
    for (const f of semCabecalho) console.error(`  - ${f}`);
  }
  let atual = '';
  try { atual = readFileSync(SAIDA, 'utf8'); } catch { /* nunca gerado */ }
  if (atual !== texto) {
    falhou = true;
    console.error('mapa:check FALHOU — docs/MAPA.md está desatualizado. Rode `npm run mapa` e commite junto.');
  }
  if (falhou) process.exit(1);
  console.log(`mapa:check ok — ${rastreados.length} arquivos, mapa em dia, todos com cabeçalho.`);
} else {
  mkdirSync(path.dirname(SAIDA), { recursive: true });
  writeFileSync(SAIDA, texto);
  console.log(`mapa: ${rastreados.length} arquivos -> docs/MAPA.md${semCabecalho.length ? ` (ATENÇÃO: ${semCabecalho.length} sem cabeçalho)` : ''}`);
}
