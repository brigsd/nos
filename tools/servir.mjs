/* servir.mjs — servidor de DESENVOLVIMENTO da Oficina (passo 10). Faz duas coisas:
   (1) serve `prototipos/fps/v3/` ESTÁTICO com `Cache-Control: no-store` — mata o
   bug de cache dos módulos ES do walkthrough_colaborador4 (`python -m http.server`
   NÃO manda no-store, e um módulo importado sem query fica preso na versão velha,
   virando um jogo novo rodando com uma peça antiga); (2) uma rota POST
   `/oficina/salvar` com `{nome, conteudo}` grava a peça exportada direto em
   `pecas/<nome>.js`, então "Salvar" na Oficina escreve no repo sem passar pela
   pasta de downloads (docs/oficina.md "Salvar: o navegador não escreve arquivo").
   A rota-IRMÃ `/som/salvar` (S5a) faz o MESMO pra a ABA SOM, gravando em
   `pecas-som/<nome>.js` (o "Exportar" da aba) — mesmo handler, mesmo `nomeSeguro`,
   só o dir de destino muda; o /oficina/salvar segue INTOCADO (passo 10 intacto).
   SEGURANÇA: o nome é sanitizado (só [A-Za-z0-9_-], extensão .js forçada) E o
   caminho é resolvido e confirmado DENTRO do dir de peças — `../`, caminho absoluto,
   subdir e nome com símbolo são rejeitados SEM gravar nada. `criarServidor({raiz,
   pecas, pecasSom})` é injetável (a bancada aponta o dir pra um temporário, nunca o
   rastreado). Uso: `npm run servir` · abra http://localhost:8080/oficina.html */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, extname, sep } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const RAIZ_PADRAO = resolve(REPO, 'prototipos/fps/v3');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
};

/* SANITIZAÇÃO do nome: vira SEMPRE `<base>.js`, com base restrita a [A-Za-z0-9_-].
   Qualquer outra coisa — barra, ponto, espaço, símbolo, ou vazio — devolve null
   (rejeita). Isto sozinho já barra '../../evil', '/etc/passwd', 'a/b', '..' e nome
   com espaço; o resolve + confere de `dentro()` lá embaixo é o cinto extra. */
export function nomeSeguro(nome) {
  if (typeof nome !== 'string') return null;
  const base = nome.replace(/\.js$/i, '');            // tolera o `.js` já vindo do cliente
  if (!/^[A-Za-z0-9_-]+$/.test(base)) return null;    // e só ele — nada de separador/ponto/espaço
  return base + '.js';
}

/* `f` está DENTRO de `base`? (o próprio `base` não conta; um filho — direto ou
   neto — sim). Barra traversal que escapou da sanitização de nome/rota. */
function dentro(f, base) { return f.startsWith(base + sep); }

function fim(res, cod, obj) {
  res.writeHead(cod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/* POST /oficina/salvar {nome, conteudo}: sanitiza, confirma dentro de PECAS e
   grava. Rejeita (>=400, nada gravado) antes de tocar em disco se o nome não passa
   ou o caminho resolvido escapa de PECAS. */
async function salvar(req, res, PECAS) {
  let corpo = '';
  for await (const ch of req) {
    corpo += ch;
    if (corpo.length > 4_000_000) return fim(res, 413, { erro: 'peça grande demais' });   // guarda de sanidade
  }
  let dados;
  try { dados = JSON.parse(corpo); } catch { return fim(res, 400, { erro: 'JSON inválido' }); }
  const arquivo = nomeSeguro(dados && dados.nome);
  if (!arquivo) return fim(res, 400, { erro: 'nome inválido — só [A-Za-z0-9_-]' });
  if (typeof dados.conteudo !== 'string') return fim(res, 400, { erro: 'conteudo ausente' });
  const destino = resolve(PECAS, arquivo);
  if (dirname(destino) !== PECAS) return fim(res, 400, { erro: 'caminho fora de pecas/' });   // cinto extra: cai DIRETO em PECAS
  await writeFile(destino, dados.conteudo);
  return fim(res, 200, { ok: true, arquivo, caminho: destino });
}

/* cria (sem escutar) o servidor. `raiz` = dir servido estático; `pecas` = onde
   /oficina/salvar grava (default `<raiz>/pecas`); `pecasSom` = onde /som/salvar grava
   (default `<raiz>/pecas-som`, a ABA SOM — S5a). Todos injetáveis pra a bancada apontar
   o dir de destino pra um TEMPORÁRIO, nunca o rastreado. */
export function criarServidor({ raiz, pecas, pecasSom } = {}) {
  const RAIZ = raiz ? resolve(raiz) : RAIZ_PADRAO;
  const PECAS = pecas ? resolve(pecas) : join(RAIZ, 'pecas');
  const PECAS_SOM = pecasSom ? resolve(pecasSom) : join(RAIZ, 'pecas-som');
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (req.method === 'POST' && pathname === '/oficina/salvar') { await salvar(req, res, PECAS); return; }
      if (req.method === 'POST' && pathname === '/som/salvar') { await salvar(req, res, PECAS_SOM); return; }   // S5a: a aba Som grava em pecas-som/ (mesmo handler/nomeSeguro)
      if (req.method !== 'GET' && req.method !== 'HEAD') { fim(res, 405, { erro: 'método não suportado' }); return; }
      /* estático com no-store. `/pecas/*` vem do dir PECAS — o MESMO que a rota de
         salvar grava —, então salvar e reabrir usam a mesma pasta (e a bancada pode
         apontar pecas/ pra um dir temporário sem tocar no rastreado); o resto vem de
         RAIZ. Traversal na URL cai no `dentro()`: um '/../..' resolve pra fora do dir
         e devolve 404, nunca serve fora. */
      const rel = pathname === '/' ? '/oficina.html' : pathname;
      let arquivo, base;
      if (rel === '/pecas' || rel.startsWith('/pecas/')) { base = PECAS; arquivo = resolve(PECAS, '.' + rel.slice('/pecas'.length)); }
      else { base = RAIZ; arquivo = resolve(RAIZ, '.' + rel); }
      if (!dentro(arquivo, base) || !existsSync(arquivo) || statSync(arquivo).isDirectory()) {
        res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('404'); return;
      }
      const buf = await readFile(arquivo);
      res.writeHead(200, { 'Content-Type': MIME[extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    } catch {
      res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('500');
    }
  });
}

/* rodado direto (`npm run servir`): sobe na PORT/argv (8080 padrão). Importado
   (bancada/teste): só exporta `criarServidor`/`nomeSeguro`, não escuta. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = parseInt(process.env.PORT || process.argv[2] || '8080', 10);
  criarServidor().listen(porta, () => {
    console.log(`Oficina — servidor de dev em http://localhost:${porta}/oficina.html`);
    console.log(`  · estático de prototipos/fps/v3/ com Cache-Control: no-store`);
    console.log(`  · POST /oficina/salvar {nome, conteudo} grava em pecas/<nome>.js`);
    console.log(`  · POST /som/salvar     {nome, conteudo} grava em pecas-som/<nome>.js (aba Som — som.html)`);
  });
}
