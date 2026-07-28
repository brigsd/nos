#!/usr/bin/env node
/* links.mjs — o gate de referência: varre todo arquivo rastreado por menções a
   `docs/<...>.md` (caminho com barra, não prosa solta) e reprova quando o
   caminho citado não resolve. Duas zonas, dois rigores: ZONA VIVA (todo
   arquivo fora de `docs/historico/`) exige resolução EXATA; ZONA HISTÓRICA
   (arquivos sob `docs/historico/`) aceita resolução por NOME de arquivo em
   qualquer lugar sob `docs/` — histórico é imutável por regra do repo, e
   reescrever caminho ali seria editar registro. Allowlist de 2 exceções
   conhecidas, com o motivo escrito abaixo. `npm run docs:links` imprime;
   `npm run docs:links:check` sai ≠0 em qualquer falha. Zero dependências (git
   ls-files + fs). */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTS = new Set(['.md', '.js', '.mjs', '.ts', '.html', '.json']);
// o próprio verificador cita, em comentário, os caminhos da allowlist — não se auto-varre.
const IGNORAR = new Set(['tools/mapa/links.mjs']);

/* Caminho no formato docs/<...>.md — exige barra depois de "docs" pra não
   capturar menção solta a nome de arquivo em prosa (ex.: "veja o LORE.md"). */
const PADRAO = /\bdocs\/[A-Za-z0-9_.\-\/]+\.md\b/g;

/* Allowlist: exatamente 2, com o motivo. Chave = "arquivo:caminho citado". */
const ALLOWLIST = new Map([
  // caminho errado num doc arquivado; o arquivo real é CLAUDE.md na raiz.
  ['docs/historico/legado/PORTALS_PROTOCOL.md:docs/CLAUDE.md', 'caminho errado herdado — o real é CLAUDE.md na raiz'],
  // arquivo genuinamente inexistente, citado pelo DECISIONS-ARCHIVE.md como registro histórico de uma branch já descartada.
  ['docs/historico/DECISIONS-ARCHIVE.md:docs/R3_COMPARATIVO_RENDER.md', 'arquivo nunca existiu na main — citado como registro de branch descartada'],
]);

const rastreados = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !IGNORAR.has(f) && EXTS.has(path.extname(f)));

const todosDocsMd = rastreados.filter((f) => f.startsWith('docs/') && f.endsWith('.md'));
const nomeParaCaminhos = new Map(); // basename -> [caminhos]
for (const f of todosDocsMd) {
  const nome = path.basename(f);
  if (!nomeParaCaminhos.has(nome)) nomeParaCaminhos.set(nome, []);
  nomeParaCaminhos.get(nome).push(f);
}

function ehZonaHistorica(arquivo) {
  return arquivo.startsWith('docs/historico/');
}

const falhas = [];

for (const arquivo of rastreados) {
  const texto = readFileSync(path.join(REPO, arquivo), 'utf8');
  const linhas = texto.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    let m;
    PADRAO.lastIndex = 0;
    while ((m = PADRAO.exec(linha))) {
      const citado = m[0];
      const chaveAllow = `${arquivo}:${citado}`;
      if (ALLOWLIST.has(chaveAllow)) continue;

      const resolveExato = existsSync(path.join(REPO, citado));
      if (resolveExato) continue;

      if (ehZonaHistorica(arquivo)) {
        const nome = path.basename(citado);
        const resolvePorNome = (nomeParaCaminhos.get(nome) ?? []).length > 0;
        if (resolvePorNome) continue;
      }

      falhas.push({ arquivo, linha: i + 1, citado, zona: ehZonaHistorica(arquivo) ? 'historica' : 'viva' });
    }
  }
}

const check = process.argv.includes('--check');

if (falhas.length) {
  console.error(`docs:links — ${falhas.length} referência(s) quebrada(s):`);
  for (const { arquivo, linha, citado, zona } of falhas) {
    /* a mensagem diz o que DE FATO foi tentado: na zona viva só existe a
       resolução exata, então dizer "nem por nome" ali seria mentira. */
    const motivo = zona === 'historica'
      ? 'não resolve exato nem por nome sob docs/'
      : 'não resolve (zona viva exige caminho exato)';
    console.error(`  ${arquivo}:${linha} → ${citado} → ${motivo}`);
  }
} else {
  console.log(`docs:links ok — todas as referências docs/*.md resolvem (${rastreados.length} arquivos varridos).`);
}

if (check && falhas.length) process.exit(1);
