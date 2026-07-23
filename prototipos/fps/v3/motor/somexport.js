/* somexport.js — o EXPORTADOR da ABA SOM (S5a, o análogo do passo 10 / D-89 do 3D).
   Serializa o evento atual do editor ({meta, PARAMS, PASSOS, semente}) numa STRING
   `.js` com a anatomia IDÊNTICA às peças de pecas-som/ (_bolha/_passo/_vento/_agua):
   cabeçalho de comentário GERADO (pra uma export commitada passar no `mapa:check`),
   os dois imports do núcleo/adaptador, `PARAMS`/`semente`/`PASSOS`, o `meta` com a
   `duracao` como CHAMADA (recalculada no load, não o valor), e o `construir`. A prova
   é o IDA-E-VOLTA: reimportar a string dá o MESMO grafo (somCanonico bit-a-bit) — por
   isso `String(número)` (round-trip-safe pra double), NUNCA `toFixed`: arredondar
   QUEBRA o bit-a-bit (a lição do passo 10). Função PURA, headless — a aba a importa
   pro botão "Exportar" e a bancada a importa em Node pra provar o round-trip. */

/* String de um NÚMERO round-trip-safe: String(double) reabre o MESMO bit (arredondar
   perde precisão e o reimport diverge). Não-finito nunca deve chegar, mas não vaza NaN
   pro arquivo. É o `jsVal` numérico do 3D (oficina.html, passo 10). */
export function jsNum(v) { return Number.isFinite(v) ? String(v) : '0'; }

/* String literal com aspas simples e escapes — idêntico ao `jsStr` do 3D. */
export function jsStr(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'"; }

/* valor -> fonte JS, recursivo (número/string/bool/null/array/objeto). `fmtNum` é o
   formatador de número: default o seguro (jsNum = String); a bancada injeta um
   NEUTRALIZADO (x.toFixed(3)) só pra PROVAR que arredondar faz o round-trip divergir —
   a produção nunca passa outro. Espelha o `jsVal` do 3D. */
export function jsVal(v, fmtNum = jsNum) {
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return jsStr(v);
  if (typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) return '[' + v.map((x) => jsVal(x, fmtNum)).join(', ') + ']';
  if (v && typeof v === 'object') { const ks = Object.keys(v); return ks.length ? '{ ' + ks.map((k) => `${k}: ${jsVal(v[k], fmtNum)}`).join(', ') + ' }' : '{}'; }
  return 'null';
}

/* um PASSO -> `[op]` ou `[op, {args}]` — o espelho do `jsPasso` do 3D. */
export function jsPasso(p, fmtNum = jsNum) { const op = jsStr(p[0]); return (p.length > 1 && p[1] !== undefined) ? `[${op}, ${jsVal(p[1], fmtNum)}]` : `[${op}]`; }

/* a STRING `.js` completa de um evento-som. `PASSOS` sai UMA op por linha (2 espaços),
   como as peças de pecas-som/. O `meta.duracao` é a CHAMADA literal
   `duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente))` (recalculada no load, um dono
   só — nunca o valor), e `construir` é o mesmo envelope da peça-som. `fmtNum` só existe
   pro teste de neutralização (ver jsVal); a aba chama sem ele = String(número). */
export function serializarEvento({ meta, PARAMS, PASSOS, semente } = {}, fmtNum = jsNum) {
  const nome = (meta && meta.nome) || 'som';
  const desc = (meta && meta.desc) || '';
  const passosTxt = (PASSOS || []).map((p) => '  ' + jsPasso(p, fmtNum) + ',').join('\n');
  return `/* ${nome} — peça-som gerada pela ABA SOM (exportar, S5a). Descrita 100% como
   PASSOS + PARAMS/semente e reconstruída pelo núcleo (somNucleo) -> adaptador Web Audio
   (construirGrafo); a aba relê este mesmo arquivo pra reabrir o som (por isso
   PARAMS/PASSOS/semente são exportados). \`meta.duracao\` é CALCULADA no load por
   duracaoDoGrafo, não guardada. Reabrir: som.html?som=${nome} */
import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';
import { construirGrafo } from '../motor/somweb.js';

/* dimensionais nomeados: mexer varia o som sem tocar na estrutura dos passos. Os
   números saem via String(double) — reimportar reabre o MESMO bit (não arredonda). */
export const PARAMS = ${jsVal(PARAMS || {}, fmtNum)};

/* semente do RNG determinístico (o ruído sai dela): reabrir com a mesma semente
   reproduz o mesmo som — sem ela, reabrir mudaria o chiado. */
export const semente = ${((semente ?? 0) >>> 0)};

/* os passos citam o NOME do parâmetro (ou o número inline), na ordem — a lista É o som.
   Exportado (não \`const\` privado): sem isto a aba não relê a lista e o som não reabre. */
export const PASSOS = [
${passosTxt}
];

export const meta = {
  nome: ${jsStr(nome)},
  tipo: 'som',
  desc: ${jsStr(desc)},
  /* CALCULADA no load (não guardada): a duração implícita do grafo, um dono só —
     a aba/o jogo leem isto ao carregar o módulo, antes de construir(). */
  duracao: duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente)),
};

/* constrói o evento num contexto de áudio (vivo OU offline) — núcleo (dados) ->
   adaptador (Web Audio), o mesmo envelope de uma peça-som de pecas-som/. */
export function construir(ctx, quando = 0) { return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando); }
`;
}
