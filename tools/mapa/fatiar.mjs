#!/usr/bin/env node
/* fatiar.mjs — a rede de segurança do fatiamento de um doc grande (o alvo hoje
   é docs/oficina.md). Dois modos, SÓ mecânica — a classificação de qual seção
   vai pra qual arquivo de saída fica com quem decide, não com esta ferramenta:

   --secoes <doc>            lista as seções H2 (linha inicial, final, contagem).
   --conferir <original> <s1> <s2> ...   prova de NADA PERDIDO: toda linha
     não-vazia do <original> tem que aparecer em algum dos arquivos de saída.
     Reporta as linhas órfãs (com o número no original) quando não aparece.

   Decisão de comparação — CONTAGEM (multiset), não conjunto: uma linha pode se
   repetir no original (`---`, linha em branco — já excluída, item de lista
   repetido). Um conjunto marcaria a linha como "presente" mesmo que só 9 das
   10 repetições sobrevivessem, mascarando perda real. Por isso o conferidor
   varre o original em ORDEM e consome uma ocorrência do multiset combinado
   das saídas a cada linha; quando o estoque acaba, a(s) ocorrência(s)
   seguinte(s) daquele conteúdo são órfãs — com o número de linha exato, não
   só "esse texto sumiu em algum lugar".

   Allowlist: tools/mapa/fatiar-permitidas.json (arquivo à parte, não
   embutida aqui) — as linhas que o fatiamento ALTERA de propósito (cabeçalho
   novo por arquivo de saída, o bloco do índice TOC, a linha 3 do
   docs/oficina.md). Ver o arquivo pro formato e o motivo de cada entrada.

   Zero dependências — só fs. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST_PATH = path.join(REPO, 'tools', 'mapa', 'fatiar-permitidas.json');

function lerLinhas(caminhoAbs) {
  const texto = readFileSync(caminhoAbs, 'utf8');
  // remove só um \n final de arquivo (convenção POSIX), pra não contar uma
  // linha vazia fantasma que não existe pra quem lê o arquivo.
  const semQuebraFinal = texto.endsWith('\n') ? texto.slice(0, -1) : texto;
  return semQuebraFinal.split('\n');
}

/* --- modo --secoes -------------------------------------------------- */

function secoes(relDoc) {
  const abs = path.resolve(process.cwd(), relDoc);
  const linhas = lerLinhas(abs);
  const marcos = []; // {titulo, inicio} — 1-indexado
  for (let i = 0; i < linhas.length; i++) {
    if (/^## (?!#)/.test(linhas[i])) {
      marcos.push({ titulo: linhas[i].replace(/^## /, '').trim(), inicio: i + 1 });
    }
  }
  const resultado = marcos.map((m, idx) => {
    const fim = idx + 1 < marcos.length ? marcos[idx + 1].inicio - 1 : linhas.length;
    return { titulo: m.titulo, inicio: m.inicio, fim, contagem: fim - m.inicio + 1 };
  });
  return { relDoc, totalLinhas: linhas.length, resultado };
}

function imprimirSecoes(relDoc) {
  const { totalLinhas, resultado } = secoes(relDoc);
  console.log(`fatiar --secoes ${relDoc} — ${resultado.length} seção(ões) H2 em ${totalLinhas} linhas:\n`);
  for (const s of resultado) {
    console.log(`  linha ${String(s.inicio).padStart(5)} .. ${String(s.fim).padStart(5)}  (${String(s.contagem).padStart(4)} linhas)  ## ${s.titulo}`);
  }
  console.log(`\ntotal: ${resultado.length} seções H2.`);
}

/* --- allowlist -------------------------------------------------------- */

function carregarAllowlist() {
  try {
    const texto = readFileSync(ALLOWLIST_PATH, 'utf8');
    return JSON.parse(texto).entradas ?? [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/* Devolve o Set de números de linha (1-indexado) do `relOriginal` que a
   allowlist excusa — sejam por número direto (tipo "linha") ou por bloco
   delimitado por dois padrões (tipo "bloco", inclusive dos dois marcos). */
function linhasExcusadas(relOriginal, linhas, allowlist) {
  const excusadas = new Set();
  for (const entrada of allowlist) {
    if (entrada.arquivo && entrada.arquivo !== relOriginal) continue;
    if (entrada.tipo === 'linha') {
      excusadas.add(entrada.linha);
    } else if (entrada.tipo === 'bloco') {
      const reInicio = new RegExp(entrada.inicio);
      const reFim = new RegExp(entrada.fim);
      let dentro = false;
      for (let i = 0; i < linhas.length; i++) {
        const num = i + 1;
        if (!dentro && reInicio.test(linhas[i])) dentro = true;
        if (dentro) {
          excusadas.add(num);
          if (reFim.test(linhas[i])) dentro = false; // fim do bloco é inclusive
        }
      }
    } else if (entrada.tipo === 'padrao') {
      const re = new RegExp(entrada.padrao);
      for (let i = 0; i < linhas.length; i++) if (re.test(linhas[i])) excusadas.add(i + 1);
    }
  }
  return excusadas;
}

/* --- modo --conferir ---------------------------------------------------- */

function conferir(relOriginal, relSaidas) {
  const absOriginal = path.resolve(process.cwd(), relOriginal);
  const linhasOriginal = lerLinhas(absOriginal);

  const allowlist = carregarAllowlist();
  // a allowlist casa pelo caminho REPO-relativo (ex.: "docs/oficina.md"),
  // não pelo caminho literal digitado — senão rodar de outro cwd (ou com o
  // arquivo fora do repo, como nas provas desta rodada) nunca casaria.
  const chaveAllowlist = path.relative(REPO, absOriginal).split(path.sep).join('/');
  const excusadas = linhasExcusadas(chaveAllowlist, linhasOriginal, allowlist);

  // multiset combinado de TODAS as linhas não-vazias das saídas.
  const estoque = new Map(); // conteúdo -> contagem disponível
  for (const rel of relSaidas) {
    const abs = path.resolve(process.cwd(), rel);
    for (const l of lerLinhas(abs)) {
      if (l.trim().length === 0) continue;
      estoque.set(l, (estoque.get(l) ?? 0) + 1);
    }
  }

  const orfas = [];
  let naoVazias = 0;
  let excusadasContadas = 0;
  for (let i = 0; i < linhasOriginal.length; i++) {
    const conteudo = linhasOriginal[i];
    if (conteudo.trim().length === 0) continue; // "linha não-vazia" — vazia não entra na prova
    naoVazias++;
    const numero = i + 1;
    if (excusadas.has(numero)) { excusadasContadas++; continue; }

    const disponivel = estoque.get(conteudo) ?? 0;
    if (disponivel > 0) {
      estoque.set(conteudo, disponivel - 1);
    } else {
      orfas.push({ numero, conteudo });
    }
  }

  return { relOriginal, naoVazias, excusadasContadas, orfas };
}

function imprimirConferir(relOriginal, relSaidas) {
  const { naoVazias, excusadasContadas, orfas } = conferir(relOriginal, relSaidas);
  console.log(`fatiar --conferir ${relOriginal} contra ${relSaidas.length} arquivo(s) de saída:`);
  console.log(`  ${naoVazias} linha(s) não-vazia(s) no original; ${excusadasContadas} excusada(s) pela allowlist.`);
  if (orfas.length === 0) {
    console.log(`fatiar:conferir OK — nenhuma linha perdida.`);
  } else {
    console.error(`fatiar:conferir FALHOU — ${orfas.length} linha(s) órfã(s) (sumiram do fatiamento):`);
    for (const { numero, conteudo } of orfas) {
      const preview = conteudo.length > 80 ? conteudo.slice(0, 77) + '...' : conteudo;
      console.error(`  linha ${numero}: ${preview}`);
    }
  }
  return orfas.length === 0;
}

/* --- CLI ------------------------------------------------------------ */

const args = process.argv.slice(2);

if (args[0] === '--secoes') {
  const doc = args[1];
  if (!doc) { console.error('uso: fatiar.mjs --secoes <doc.md>'); process.exit(2); }
  imprimirSecoes(doc);
  process.exit(0);
} else if (args[0] === '--conferir') {
  const [original, ...saidas] = args.slice(1);
  if (!original || saidas.length === 0) {
    console.error('uso: fatiar.mjs --conferir <original> <saida1> [saida2 ...]');
    process.exit(2);
  }
  const ok = imprimirConferir(original, saidas);
  process.exit(ok ? 0 : 1);
} else {
  console.error('uso: fatiar.mjs --secoes <doc.md>  |  fatiar.mjs --conferir <original> <saida1> [saida2 ...]');
  process.exit(2);
}
