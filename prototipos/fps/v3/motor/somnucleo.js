/* somnucleo.js — NÚCLEO do EVENTO de som (passo 1 da Aba Som). Resolve uma lista
   de PASSOS (ops do grafo de sinal) num GRAFO em DADOS — nós + arestas + params
   resolvidos —, HEADLESS e determinístico, SEM tocar em Web Audio. É o análogo
   sonoro do `nucleo` da Oficina: os passos citam o NOME do parâmetro (freq, q,
   tempos vêm de PARAMS), a identidade é o `id` de cada nó, e toda referência a um
   id inexistente é registrada em `orfaos` e PULADA — grita, nunca corrompe (lei
   do envelope). id duplicado grita; ciclo no grafo grita (a aresta de volta é
   derrubada, o resto renderiza). `somCanonico` é a forma ORDENADA que faz o JSON
   ida-e-volta bater bit-a-bit quando o evento é o mesmo — a base do replay.
   Determinismo total: `Math.random` cru é PROIBIDO; toda aleatoriedade (as
   amostras de `ruido`) sai de `rng(semente)` (mulberry32). Ver docs/oficina.md
   "## Aba Som". O ADAPTADOR pra Web Audio mora em `somweb.js` (o par do adaptarV3). */

export const FORMATO = { v: 1, tipo: 'som' };

/* ----------------------------------------------------------------------------
   RNG determinístico (mulberry32). Sem Date, sem Math.random — mesma semente,
   mesma sequência, sempre. Devolve uma função () -> [0,1). É a MESMA regra da
   geometria: aleatoriedade reproduzível ou reabrir o arquivo muda o som.
---------------------------------------------------------------------------- */
export function rng(semente) {
  let a = semente >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* semente derivada por NÓ: mistura a semente-base do evento com o id do nó (hash
   FNV-1a de 32 bits sobre a string do id). Dois `ruido` no mesmo evento ganham
   ruído DIFERENTE (senão dois canais soariam idênticos, coerentes — chiado), mas
   o mesmo evento com a mesma semente reproduz tudo. */
export function sementeDe(semente, id) {
  let h = ((semente >>> 0) ^ 0x9e3779b9) >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/* amostras de RUÍDO, PURO e headless (sem AudioContext) — a matemática do
   `makeNoise` do som.js, mas alimentada pelo RNG semeado em vez de Math.random,
   pra ser determinística E testável fora do browser. `rosa` passa o branco por um
   filtro de um polo (média móvel — tira o chiado agudo; `k` é o brilho, ~151 Hz
   em 0.02); `branco` é o ruído cru. Os dois são normalizados pelo MESMO alvo de
   RMS (0.183) do som.js, pra trocar a cor não mudar o volume. Devolve Float32Array. */
export function ruidoAmostras(n, cor = 'branco', k = 0.02, prox = Math.random) {
  const d = new Float32Array(n);
  let last = 0, soma = 0;
  for (let i = 0; i < n; i++) {
    const w = prox() * 2 - 1;
    const v = cor === 'rosa' ? (last = (last + k * w) / (1 + k)) : w;
    d[i] = v; soma += v * v;
  }
  const ganho = 0.183 / (Math.sqrt(soma / n) || 1);   // 0.183 = RMS-alvo do som.js
  for (let i = 0; i < n; i++) d[i] *= ganho;
  return d;
}

/* ----------------------------------------------------------------------------
   VOCABULÁRIO. Cada tipo declara seu PAPEL no grafo — o que decide como o nó
   entra na resolução de arestas, na detecção de saída e na modulação:
     - audio-fonte      : produz áudio, sem entrada (`oscilador`, `ruido`)
     - audio-proc       : passa áudio adiante, consome `de` (`filtro`, `envelope`,
                          `ganho`, `soma`) — é o CAMINHO do sinal
     - modulador        : NÃO produz áudio; agenda automação num PARAM de OUTRO nó
                          (`alturaEnv` -> freq do `de`; `lfo` -> alvo.no.param)
   `lfo` é fonte E modulador (tem oscilador próprio, mas a saída vai pra um param,
   não pro caminho de áudio) — então nunca é a SAÍDA do evento.

   PARAM_MOD = quais params de cada tipo um modulador pode mirar (validação do
   alvo no núcleo; o mapeamento pra AudioParam real é do adaptador).
---------------------------------------------------------------------------- */
const TIPOS = {
  oscilador: { papel: 'audio-fonte' },
  ruido:     { papel: 'audio-fonte' },
  lfo:       { papel: 'modulador' },   // modulador-fonte: nunca é saída de áudio
  filtro:    { papel: 'audio-proc', de: 'um' },
  envelope:  { papel: 'audio-proc', de: 'um' },
  ganho:     { papel: 'audio-proc', de: 'um' },
  soma:      { papel: 'audio-proc', de: 'muitos' },
  alturaEnv: { papel: 'modulador', de: 'um' },   // sweep de frequência do `de`
};
const FORMAS_OSC = ['seno', 'quadrada', 'triangular', 'serra'];
const CORES = ['branco', 'rosa'];
const TIPOS_FILTRO = ['passa-baixa', 'passa-alta', 'passa-banda'];
const PARAM_MOD = {
  oscilador: new Set(['freq']),
  filtro:    new Set(['freq', 'q']),
  lfo:       new Set(['freq']),
  ganho:     new Set(['ganho']),
  envelope:  new Set(['ganho']),
  soma:      new Set(['ganho']),
  ruido:     new Set(),
  alturaEnv: new Set(),
};

/* enum com queda segura: valor inválido não corrompe nem explode — cai no padrão
   (o 1º da lista) e GRITA, pra o nó ainda renderizar (lei do envelope). */
function lerEnum(lista, v, grita, motivo) {
  if (v == null) return lista[0];
  if (lista.includes(v)) return v;
  grita(v, motivo(v));
  return lista[0];
}

/* ----------------------------------------------------------------------------
   NÚCLEO: roda a lista de PASSOS e devolve o GRAFO resolvido em DADOS.
   `num` resolve nome->número por PARAMS (recursivo), como na geometria — nome
   inexistente é ERRO DURO (evento mal-formado), não órfão (órfão é referência a
   ID de nó pendurada). Assinatura: somNucleo(PASSOS, PARAMS={}, semente=0).
---------------------------------------------------------------------------- */
export function somNucleo(PASSOS, PARAMS = {}, semente = 0) {
  const num = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { if (!(v in PARAMS)) throw new Error(`som: parâmetro '${v}' não existe em PARAMS`); return num(PARAMS[v]); }
    throw new Error(`som: valor numérico inválido: ${JSON.stringify(v)}`);
  };
  const opt = (v, def) => (v == null ? def : num(v));

  const orfaos = [];
  const grita = (passo, op, ref, motivo) => orfaos.push({ passo, op, ref: ref ?? null, motivo });

  const nos = new Map();     // id -> nó (ordem de declaração via insertion order)
  const ordem = [];          // ids na ordem em que foram declarados
  let saidaExplicita = null; // op ['saida', {de}]

  /* ---- passo 1: registra ids + resolve enums/números; guarda refs cruas ---- */
  PASSOS.forEach((passo, i) => {
    const [op, a = {}] = passo;

    if (op === 'saida') {   // marcador de saída explícita (sem id — não é nó)
      if (a.de == null) return grita(i, 'saida', null, 'saida sem `de`');
      saidaExplicita = a.de;   // validado no passo 3
      return;
    }
    const spec = TIPOS[op];
    if (!spec) return grita(i, op, null, `operação desconhecida '${op}'`);
    if (a.id == null) return grita(i, op, null, `${op} sem id — todo nó precisa de id`);
    if (nos.has(a.id)) return grita(i, op, a.id, `id duplicado '${a.id}' — o segundo foi ignorado`);

    const gritaEnum = (ref, m) => grita(i, op, ref, m);
    const no = { id: a.id, tipo: op, papel: spec.papel, passo: i, params: {}, de: [], alvo: null, _de: null, _alvo: null };

    switch (op) {
      case 'oscilador':
        no.params.tipo = lerEnum(FORMAS_OSC, a.tipo, (v) => gritaEnum(v, `tipo de oscilador '${v}' desconhecido -> 'seno'`), (v) => v);
        no.params.freq = opt(a.freq, 440);
        break;
      case 'ruido':
        no.params.cor = lerEnum(CORES, a.cor, (v) => gritaEnum(v, `cor de ruido '${v}' desconhecida -> 'branco'`), (v) => v);
        no.params.k = opt(a.k, 0.02);
        if (a.dur != null) no.params.dur = num(a.dur);
        break;
      case 'lfo':
        no.params.tipo = lerEnum(FORMAS_OSC, a.tipo, (v) => gritaEnum(v, `tipo de lfo '${v}' desconhecido -> 'seno'`), (v) => v);
        no.params.freq = opt(a.freq, 5);
        no.params.profundidade = opt(a.profundidade, 1);
        no._alvo = a.alvo ?? null;
        break;
      case 'filtro':
        no.params.tipo = lerEnum(TIPOS_FILTRO, a.tipo, (v) => gritaEnum(v, `tipo de filtro '${v}' desconhecido -> 'passa-baixa'`), (v) => v);
        no.params.freq = opt(a.freq, 800);
        no.params.q = opt(a.q, 1);
        no._de = a.de ?? null;
        break;
      case 'envelope':
        no.params.ataque = opt(a.ataque, 0.01);
        no.params.pico = opt(a.pico, 1);
        no.params.decaimento = opt(a.decaimento, 0.1);
        no.params.duracao = opt(a.duracao, 0.2);
        no._de = a.de ?? null;
        break;
      case 'alturaEnv':
        no.params.freq0 = opt(a.freq0, 200);
        no.params.freq1 = opt(a.freq1, 800);
        no.params.tempo = opt(a.tempo, 0.1);
        no._de = a.de ?? null;
        break;
      case 'ganho':
        no.params.valor = opt(a.valor, 1);
        no._de = a.de ?? null;
        break;
      case 'soma':
        no._de = Array.isArray(a.de) ? a.de.slice() : (a.de == null ? [] : [a.de]);
        break;
      default: break;
    }
    nos.set(a.id, no);
    ordem.push(a.id);
  });

  const ehAudio = (id) => nos.has(id) && (nos.get(id).papel === 'audio-fonte' || nos.get(id).papel === 'audio-proc');

  /* ---- passo 2: resolve referências em arestas (áudio) e alvos (modulação) ---- */
  const arestas = [];   // {de, para, kind:'audio'|'mod', param?}
  for (const id of ordem) {
    const no = nos.get(id);
    if (no.tipo === 'soma') {
      for (const d of no._de) {
        if (!nos.has(d)) { grita(no.passo, 'soma', d, `soma: entrada '${d}' inexistente`); continue; }
        if (!ehAudio(d)) { grita(no.passo, 'soma', d, `soma: entrada '${d}' é modulador (sem áudio)`); continue; }
        no.de.push(d); arestas.push({ de: d, para: id, kind: 'audio' });
      }
      if (no._de.length && !no.de.length) grita(no.passo, 'soma', null, 'soma sem nenhuma entrada válida');
    } else if (no.papel === 'audio-proc') {   // filtro / envelope / ganho: um `de`
      const d = no._de;
      if (d == null) grita(no.passo, no.tipo, null, `${no.tipo} sem \`de\``);
      else if (!nos.has(d)) grita(no.passo, no.tipo, d, `${no.tipo}: \`de\` '${d}' inexistente`);
      else if (!ehAudio(d)) grita(no.passo, no.tipo, d, `${no.tipo}: \`de\` '${d}' é modulador (sem áudio)`);
      else { no.de.push(d); arestas.push({ de: d, para: id, kind: 'audio' }); }
    } else if (no.tipo === 'alturaEnv') {   // modulador de FREQUÊNCIA do `de`
      const d = no._de;
      if (d == null) grita(no.passo, 'alturaEnv', null, 'alturaEnv sem `de`');
      else if (!nos.has(d)) grita(no.passo, 'alturaEnv', d, `alturaEnv: \`de\` '${d}' inexistente`);
      else if (!PARAM_MOD[nos.get(d).tipo].has('freq')) grita(no.passo, 'alturaEnv', d, `alturaEnv: '${d}' (${nos.get(d).tipo}) não tem frequência`);
      else { no.alvo = { no: d, param: 'freq' }; arestas.push({ de: id, para: d, kind: 'mod', param: 'freq' }); }
    } else if (no.tipo === 'lfo') {   // modulador de param arbitrário do alvo
      const alvo = no._alvo;
      if (!alvo || alvo.no == null) grita(no.passo, 'lfo', null, 'lfo sem alvo');
      else if (!nos.has(alvo.no)) grita(no.passo, 'lfo', alvo.no, `lfo: alvo '${alvo.no}' inexistente`);
      else if (!PARAM_MOD[nos.get(alvo.no).tipo].has(alvo.param)) grita(no.passo, 'lfo', alvo.no, `lfo: '${alvo.no}' (${nos.get(alvo.no).tipo}) não tem param '${alvo.param}'`);
      else { no.alvo = { no: alvo.no, param: alvo.param }; arestas.push({ de: id, para: alvo.no, kind: 'mod', param: alvo.param }); }
    }
    delete no._de; delete no._alvo;
  }

  /* ---- passo 3: ciclo grita. DFS de cor na direção influência (de->para,
     áudio E modulação). Aresta de volta (para já na pilha) é registrada e
     DERRUBADA, e o nó consumidor perde essa entrada — o resto do grafo fica
     intacto e renderizável (lei do envelope). */
  const adj = new Map();   // de -> [aresta]
  for (const id of ordem) adj.set(id, []);
  for (const e of arestas) adj.get(e.de)?.push(e);
  const cor = new Map();   // id -> 0 branco / 1 cinza(pilha) / 2 preto
  const derrubar = new Set();
  const visita = (u) => {
    cor.set(u, 1);
    for (const e of adj.get(u) || []) {
      if (derrubar.has(e)) continue;
      const c = cor.get(e.para) || 0;
      if (c === 1) { derrubar.add(e); const consumidor = e.kind === 'mod' ? e.de : e.para; grita(nos.get(consumidor).passo, nos.get(consumidor).tipo, e.para, `ciclo no grafo: aresta ${e.de}->${e.para} derrubada`); }
      else if (c === 0) visita(e.para);
    }
    cor.set(u, 2);
  };
  for (const id of ordem) if ((cor.get(id) || 0) === 0) visita(id);
  if (derrubar.size) {
    for (let i = arestas.length - 1; i >= 0; i--) {
      const e = arestas[i];
      if (!derrubar.has(e)) continue;
      arestas.splice(i, 1);
      if (e.kind === 'audio') { const c = nos.get(e.para); c.de = c.de.filter((x) => x !== e.de); }
      else { nos.get(e.de).alvo = null; }
    }
  }

  /* ---- passo 4: SAÍDA. Convenção: a saída é o único nó de ÁUDIO que não
     alimenta ninguém (o "sink" — moduladores não contam). Explícito com
     ['saida',{de}] vence. Zero sinks -> grita (vazio/ciclo). Vários -> grita e
     usa o ÚLTIMO declarado (determinístico), sugerindo `soma` ou saída explícita. */
  const consumidos = new Set();
  for (const e of arestas) if (e.kind === 'audio') consumidos.add(e.de);
  /* candidato a saída = nó de áudio que não alimenta ninguém E que de fato produz
     sinal: uma fonte, ou um processador COM entrada. Um processador que ficou sem
     entrada (todo `de` pendurado/derrubado) é um toco mudo — já gritou, e não pode
     virar a saída (senão o órfão sequestraria o render e calaria o caminho bom). */
  const produzSinal = (id) => { const n = nos.get(id); return n.papel === 'audio-fonte' || (n.papel === 'audio-proc' && n.de.length > 0); };
  const sinks = ordem.filter((id) => ehAudio(id) && !consumidos.has(id) && produzSinal(id));
  let saida = null;
  if (saidaExplicita != null) {
    if (!ehAudio(saidaExplicita)) grita(-1, 'saida', saidaExplicita, `saida explícita '${saidaExplicita}' não é nó de áudio`);
    else saida = saidaExplicita;
  }
  if (saida == null) {
    if (sinks.length === 1) saida = sinks[0];
    else if (sinks.length === 0) grita(-1, 'saida', null, 'sem saída: nenhum nó de áudio livre (grafo vazio ou consumido por ciclo)');
    else { saida = sinks[sinks.length - 1]; grita(-1, 'saida', null, `múltiplas saídas ${JSON.stringify(sinks)} — usei '${saida}' (a última). Envolva numa \`soma\` ou marque ['saida',{de}]`); }
  }

  return { semente: semente >>> 0, saida, nos: ordem.map((id) => nos.get(id)), arestas, orfaos };
}

/* ----------------------------------------------------------------------------
   FORMA CANÔNICA e ORDENADA do grafo — o espelho do `neutroCanonico`. Nós por id,
   params por chave ordenada, `de` ordenado, arestas ordenadas, órfãos na ordem em
   que gritaram. O JSON dela ida-e-volta é IDÊNTICO bit-a-bit quando o evento é o
   mesmo — é a base do replay (o "cmp de dados" do som).
---------------------------------------------------------------------------- */
export function somCanonico(g) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pares = (o) => Object.keys(o).sort().map((k) => [k, o[k]]);
  return {
    semente: g.semente >>> 0,
    saida: g.saida ?? null,
    nos: [...g.nos].sort((a, b) => cmp(a.id, b.id)).map((n) => [
      n.id, n.tipo, n.papel, pares(n.params), [...n.de].sort(cmp), n.alvo ? [n.alvo.no, n.alvo.param] : null,
    ]),
    arestas: [...g.arestas].sort((a, b) => cmp(a.de, b.de) || cmp(a.para, b.para) || cmp(a.kind, b.kind) || cmp(a.param || '', b.param || '')).map((e) => [e.de, e.para, e.kind, e.param ?? null]),
    orfaos: g.orfaos.map((o) => ({ passo: o.passo, op: o.op, ref: o.ref ?? null, motivo: o.motivo })),
  };
}

/* duração implícita do grafo em segundos: o maior envelope/sweep (e `ruido.dur`
   se dado). O adaptador usa isto pra dimensionar o buffer de ruído e a janela do
   render offline; `minimo` é o piso pra um grafo sem envelope (ex.: tom + lfo). */
export function duracaoDoGrafo(g, minimo = 0.3) {
  let d = 0;
  for (const n of g.nos) {
    if (n.tipo === 'envelope') d = Math.max(d, n.params.duracao ?? 0);
    else if (n.tipo === 'alturaEnv') d = Math.max(d, n.params.tempo ?? 0);
    else if (n.tipo === 'ruido' && n.params.dur) d = Math.max(d, n.params.dur);
  }
  return Math.max(d, minimo);
}
