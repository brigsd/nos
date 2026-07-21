#!/usr/bin/env node
/* toc.mjs — gera o índice (sumário) de um doc ENTRE os marcadores <!-- TOC --> e
   <!-- /TOC -->, a partir dos títulos `##` dele. Mesma filosofia do mapa: o
   índice é PROJEÇÃO dos títulos, não uma segunda-verdade escrita à mão que
   apodrece — `npm run docs:toc` refaz, `docs:toc:check` (CI) falha se estiver
   velho. Default: docs/oficina.md; passe outro .md como argumento pra reusar.
   Âncoras no estilo do GitHub (minúsculas, tira pontuação, espaço→hífen, dedup
   global). Zero dependências — só fs. */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = process.argv.find((a) => a.endsWith('.md'));
const REL = arg || 'docs/oficina.md';
const DOC = path.join(REPO, REL);
const INI = '<!-- TOC -->';
const FIM = '<!-- /TOC -->';

/* slug no estilo do github-slugger: minúsculas, remove pontuação (mantém
   acento, número e hífen existente), espaço vira hífen, e desambigua repetido
   com sufixo -1/-2 na ORDEM do documento (por isso caminhamos TODOS os títulos,
   não só os de nível 2). */
const usados = new Map();
function slug(s) {
  const base = s.toLowerCase().trim()
    .replace(/[ -⁯⸀-⹿\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~–—‘’“”…]/g, '')
    .replace(/ /g, '-');
  const n = usados.get(base) ?? 0;
  usados.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

function gerarLista(texto) {
  usados.clear();
  const itens = [];
  let emFence = false;
  for (const l of texto.split('\n')) {
    if (/^\s*```/.test(l)) { emFence = !emFence; continue; }
    if (emFence) continue;
    const m = l.match(/^(#{2,6}) (.+?)\s*$/);
    if (!m) continue;
    const anchor = slug(m[2]);          // dedup global, em ordem — casa com o GitHub
    if (m[1].length === 2) itens.push(`- [${m[2]}](#${anchor})`);
  }
  return itens;
}

const texto = readFileSync(DOC, 'utf8');
const re = new RegExp(`${INI}[\\s\\S]*?${FIM}`);
if (!re.test(texto)) {
  console.error(`toc: marcadores "${INI}" … "${FIM}" não encontrados em ${REL} — insira-os onde o índice deve ficar.`);
  process.exit(1);
}
const itens = gerarLista(texto);
const bloco = `${INI}\n\n**Índice** — gerado por \`npm run docs:toc\`, não edite à mão:\n\n${itens.join('\n')}\n\n${FIM}`;
const novo = texto.replace(re, bloco);

if (process.argv.includes('--check')) {
  if (novo !== texto) {
    console.error(`docs:toc:check FALHOU — o índice de ${REL} está desatualizado. Rode \`npm run docs:toc\` e commite junto.`);
    process.exit(1);
  }
  console.log(`docs:toc:check ok — índice de ${REL} em dia (${itens.length} seções).`);
} else {
  writeFileSync(DOC, novo);
  console.log(`toc: ${REL} -> índice com ${itens.length} seções.`);
}
