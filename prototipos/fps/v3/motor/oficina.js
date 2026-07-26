/* oficina.js — NÚCLEO + ADAPTADOR v3 da OFICINA (passo 1). Executa a lista de
   PASSOS de uma peça-objeto e devolve o objeto pronto pro visor. Duas camadas
   nítidas (docs/oficina.md "Onde o código mora"): o NÚCLEO neutro monta
   vértices únicos numerados + faces apontando pra ids + atributos por face, e
   devolve NÚMEROS; o ADAPTADOR v3 converte esse neutro nos triângulos soltos do
   motor (8 floats/vértice, cor por face via textura-amostra + UV). SEM
   interface. Determinístico: mesma lista -> mesmo objeto, sempre. A numeração
   de identidade depende só da POSIÇÃO do passo (bloco de BLOCO ids por índice),
   nunca dos valores de PARAMS — mudar `raio` não renumera; mudar `lados` (TOPO)
   renumera e os passos pendurados viram órfãos que GRITAM, nunca corrompem. */

export const FORMATO = { v: 1, tipo: 'objeto' };

/* Largura do bloco de ids por passo. O passo de índice i possui os ids
   [i*BLOCO, i*BLOCO+BLOCO) — tanto no espaço de VÉRTICE quanto no de FACE (dois
   espaços independentes: pode existir vértice 12 e face 12 ao mesmo tempo). É
   isto que torna a numeração POSICIONAL: o passo 4 começa a numerar no mesmo
   lugar hoje ou daqui a um ano, e nenhum PARAM mexe nisso. */
export const BLOCO = 1000;

/* base posicional de um passo (vértice e face partem do mesmo número, espaços
   distintos). Primitivas podem trazer `id` no arquivo — é só o MESMO número,
   escrito à mão pra ficar legível; se divergir da posição, vira aviso (nunca
   uma segunda-verdade silenciosa). */
function baseDoPasso(i) { return i * BLOCO; }

/* ----------------------------------------------------------------------------
   Vetores mínimos (puros, sem dependência do motor — o núcleo roda headless).
---------------------------------------------------------------------------- */
function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

/* produto vetorial a×b — puro, usado só pela op `loft` (frame de transporte
   paralelo, mais abaixo). */
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

/* Normal de um polígono (n-gon) por Newell — robusto pra face de 3+ cantos e
   independente da triangulação. */
function normalDaFace(V, vs) {
  let nx = 0, ny = 0, nz = 0;
  for (let k = 0; k < vs.length; k++) {
    const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
    if (!c || !n) return [0, 1, 0];
    nx += (c[1] - n[1]) * (c[2] + n[2]);
    ny += (c[2] - n[2]) * (c[0] + n[0]);
    nz += (c[0] - n[0]) * (c[1] + n[1]);
  }
  return norm3(nx, ny, nz);
}

/* ruído de valor 3D determinístico com SEMENTE — usado só pela op `displace` (P8c do
   playground). `hash3` é um hash barato baseado em seno (mesma classe de determinismo
   que sin/cos já usado em lathe/cilindro/esfera: mesmo motor JS, mesma entrada, mesma
   saída sempre — não pretende ser aleatório de verdade, só parecer). `ruido3` amostra
   os 8 cantos do RETICULADO que envolve o ponto e interpola por smoothstep (suave, sem
   quina em cada célula do reticulado) — é "value noise" clássico, devolve sempre
   [0,1). FORMATO SALVO (docs/playground.md regra 4): a fórmula em si é o que faz o
   `displace` de uma peça salva reproduzir o mesmo relevo sempre — mudar hash3/ruido3
   reformaria toda peça que usa `displace`, como renumerar mudaria a malha. */
function hash3(x, y, z, seed) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 269.5) * 43758.5453123; return s - Math.floor(s); }
function ruido3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);   // smoothstep — suaviza a transição entre células
  const c000 = hash3(xi, yi, zi, seed), c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed), c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed), c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/* colapsa cantos repetidos consecutivos (inclusive no fecho do ciclo) — o que
   a mescla deixa pra trás quando dois cantos de uma face viram o mesmo id. */
function colapsaCiclo(vs) {
  const out = [];
  for (let k = 0; k < vs.length; k++) if (vs[k] !== vs[(k + 1) % vs.length]) out.push(vs[k]);
  return out;
}
function distintos(vs) { return new Set(vs).size; }

/* ----------------------------------------------------------------------------
   ESQUELETO (passo 14a) — deformação suave (linear blend skinning). Declarável
   em CÓDIGO (a UI é o 14b): `ESQUELETO = { ossos: [ { nome, pai?, pivo? } ] }`.
   `pai` = nome do osso-pai (hierarquia; raiz sem pai). `pivo` = a cabeça do osso
   no espaço do modelo (passa por `vec`, então pode citar PARAM); default [0,0,0].
   O bind (repouso) é a IDENTIDADE no pivô -> bindGlobal(osso) = T(pivo). Aqui só
   se RESOLVE e VALIDA: pai existe, sem ciclo, dentro do teto. Erro estrutural
   GRITA ALTO (throw) — cedo, como a guarda de overflow do cilindro (D3) e o canal
   desconhecido do 13a; nunca vira segunda-verdade silenciosa. (Referência a osso
   inexistente pela op `pesar` é ÓRFÃO, não throw — grita sem corromper a malha.) */
const TETO_OSSOS = 32;    // teto de ossos por peça: 32 × mat4 = 128 vec4 de uniforme no VS skinado (folga sob o mínimo 256 do WebGL2). Exceder GRITA.
const N_INFLU = 4;        // TOP-N influências por vértice (padrão 4; menos serve pro low-poly, os slots sobrando ficam peso 0)
function resolverEsqueleto(ESQUELETO, vec) {
  const ossos = (ESQUELETO.ossos || []).map((o) => ({
    nome: o.nome,
    pai: o.pai != null ? o.pai : null,
    pivo: o.pivo != null ? vec(o.pivo) : [0, 0, 0],   // dimensional (pode citar PARAM), como os outros pontos
  }));
  if (ossos.length > TETO_OSSOS) throw new Error(`oficina: esqueleto com ${ossos.length} ossos excede o teto de ${TETO_OSSOS} (limite de uniformes do VS skinado)`);
  const nomes = new Set();
  for (const o of ossos) { if (nomes.has(o.nome)) throw new Error(`oficina: osso duplicado '${o.nome}' no ESQUELETO`); nomes.add(o.nome); }
  const idx = new Map(ossos.map((o, i) => [o.nome, i]));
  for (const o of ossos) if (o.pai != null && !idx.has(o.pai)) throw new Error(`oficina: osso '${o.nome}' tem pai '${o.pai}' que não existe no ESQUELETO`);
  // ciclo: subir a cadeia de pais de cada osso; revisitar => ciclo (grita alto)
  for (const raiz of ossos) {
    const visto = new Set();
    let cur = raiz;
    while (cur.pai != null) {
      if (visto.has(cur.nome)) throw new Error(`oficina: ciclo de pai no esqueleto (osso '${raiz.nome}')`);
      visto.add(cur.nome);
      cur = ossos[idx.get(cur.pai)];
    }
  }
  return { ossos, idx };
}

/* ----------------------------------------------------------------------------
   VOCABULÁRIO de operações. Cada uma recebe (st, args, i) e muta o estado
   neutro. Toda referência a um id inexistente é registrada em `orfaos` e o
   passo é PULADO — grita, nunca corrompe (lei do envelope). Passo 1 traz só o
   suficiente pra provar o modelo e as partes difíceis; as ~20 da tabela do doc
   entram depois, cada uma como mais uma entrada aqui.
---------------------------------------------------------------------------- */
function Face(id, vs) { return { id, vs, cor: null, material: null, parte: null, liso: false, solido: false, tinta: [] }; }

function addV(st, id, pos) {
  if (st.V.has(id)) throw new Error(`oficina: colisão de id de vértice ${id} (bloco pequeno? passo mal-formado?)`);
  st.V.set(id, pos);
}
function addF(st, id, vs) {
  if (st.F.has(id)) throw new Error(`oficina: colisão de id de face ${id}`);
  st.F.set(id, Face(id, vs));
}
function grita(st, i, op, ref, motivo) { st.orfaos.push({ passo: i, op, ref, motivo }); }

/* Fase 2: a identidade é UMA só no objeto, independente do gerador. Cada
   gerador publica apenas seu contrato local reexecutável; duplicata continua
   registrada para que nenhuma seleção possa desempatar silenciosamente. */
const FACES_CUBO = new Set(['fundo', 'topo', 'tras', 'direita', 'frente', 'esquerda']);
function registraOrigem(st, i, op, origemId, contrato) {
  const registros = st.origens.get(origemId) ?? [];
  if (registros.length) grita(st, i, op, origemId, `origemId ${origemId} duplicado: a identidade deve ser única no objeto`);
  registros.push({ op, ...contrato });
  st.origens.set(origemId, registros);
}
function origemFormatoValido(origem) {
  if (!origem || typeof origem !== 'object' || Array.isArray(origem) || !Object.hasOwn(origem, 'op') || !Object.hasOwn(origem, 'id') || !Number.isSafeInteger(origem.id) || origem.id < 0) return false;
  if (origem.op === 'loft') {
    const chaves = ['op', 'id', 'faixa', 'lado'];
    return Object.keys(origem).every((k) => chaves.includes(k)) && Object.hasOwn(origem, 'faixa')
      && Number.isSafeInteger(origem.faixa) && origem.faixa >= 0
      && (origem.lado == null || (Number.isSafeInteger(origem.lado) && origem.lado >= 0));
  }
  if (origem.op === 'cubo') {
    const chaves = ['op', 'id', 'face'];
    return Object.keys(origem).every((k) => chaves.includes(k)) && Object.hasOwn(origem, 'face') && FACES_CUBO.has(origem.face);
  }
  return false;
}

/* valida o `id` opcional de uma primitiva contra a base posicional: se o
   arquivo escreveu um id que não bate com a posição, é um aviso alto (não muda
   a numeração — a POSIÇÃO manda sempre). */
function confereId(st, i, op, args) {
  const b = baseDoPasso(i);
  if (typeof args.id === 'number' && args.id !== b) grita(st, i, op, args.id, `id ${args.id} ≠ base da posição ${b} — a posição manda`);
  return b;
}

/* resolverSelecao (D-129): a ÚNICA semântica de `sel` da Oficina. Devolve os
   dois alvos que uma op pode precisar: vértices e faces. `v` seleciona os
   vértices literais E toda face que toca algum deles; `f` seleciona as faces
   literais; `grupo` seleciona as faces cuja `f.parte` tem aquele nome; e
   `regiao` seleciona os vértices dentro da caixa INCLUSIVA e as faces com
   TODOS os cantos dentro dela. Campos presentes se UNEM. Assim uma região não
   vaza meia face para uma operação de atributo, mas rotaciona/transladar
   preservam exatamente a regra antiga: movem os vértices dentro da caixa.

   A seleção é formato salvo: nunca ignora uma chave, uma referência ou uma
   seleção vazia. `grita` leva op + tipo + causa; a lista continua executando
   sem corromper o neutro. Só as ops que JÁ documentavam seleção vazia como
   no-op (vértice) passam `vazioNoop`. */
function resolverSelecao(st, sel, op, i, { vazioNoop = false } = {}) {
  if (sel == null) return { vertices: new Set(st.V.keys()), faces: new Set(st.F.keys()) };
  if (typeof sel !== 'object' || Array.isArray(sel)) {
    grita(st, i, op, 'sel', 'seleção inválida: sel precisa ser um objeto com v, f, grupo, regiao, origem e/ou alias');
    return { vertices: new Set(), faces: new Set() };
  }
  const conhecidas = new Set(['v', 'f', 'grupo', 'regiao', 'origem', 'alias']);
  for (const chave of Object.keys(sel)) if (!conhecidas.has(chave)) grita(st, i, op, `sel.${chave}`, `seleção desconhecida '${chave}' (só v, f, grupo, regiao, origem e alias)`);

  const vertices = new Set(), faces = new Set();
  const adicionaFace = (fid) => {
    const f = st.F.get(fid);
    if (!f) { grita(st, i, op, fid, 'face inexistente na seleção'); return; }
    faces.add(fid); for (const v of f.vs) vertices.add(v);
  };
  let teveChave = false;
  if (sel.v != null) {
    teveChave = true;
    if (!Array.isArray(sel.v)) grita(st, i, op, 'sel.v', 'seleção v inválida: precisa ser uma lista de ids de vértice');
    else for (const v of sel.v) {
      if (!st.V.has(v)) { grita(st, i, op, v, 'vértice inexistente na seleção'); continue; }
      vertices.add(v);
      for (const f of st.F.values()) if (f.vs.includes(v)) faces.add(f.id);
    }
  }
  if (sel.f != null) {
    teveChave = true;
    if (!Array.isArray(sel.f)) grita(st, i, op, 'sel.f', 'seleção f inválida: precisa ser uma lista de ids de face');
    else for (const fid of sel.f) adicionaFace(fid);
  }
  if (sel.grupo != null) {
    teveChave = true;
    if (typeof sel.grupo !== 'string' || !sel.grupo) grita(st, i, op, 'sel.grupo', 'seleção grupo inválida: precisa ser um nome não-vazio');
    else {
      let achou = false;
      for (const f of st.F.values()) if (f.parte === sel.grupo) { achou = true; adicionaFace(f.id); }
      if (!achou) grita(st, i, op, sel.grupo, `grupo '${sel.grupo}' não tem nenhuma face válida (nome errado, ou a op 'parte' ainda não rodou)`);
    }
  }
  if (sel.regiao != null) {
    teveChave = true;
    const r = sel.regiao;
    if (typeof r !== 'object' || Array.isArray(r) || r == null || Object.keys(r).some((k) => k !== 'min' && k !== 'max') || !Object.hasOwn(r, 'min') || !Object.hasOwn(r, 'max')) {
      grita(st, i, op, 'sel.regiao', 'seleção regiao inválida: precisa ter min E max (e só eles), os dois [x,y,z] finitos');
    } else {
      let min, max;
      try { min = st.vec(r.min); max = st.vec(r.max); }
      catch (e) { grita(st, i, op, 'sel.regiao', `seleção regiao inválida: ${e.message}`); }
      if (min && max) {
        if (min.some((v, k) => v > max[k])) grita(st, i, op, 'sel.regiao', 'seleção regiao inválida: min não pode ser maior que max');
        else {
          const dentro = (p) => p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1] && p[2] >= min[2] && p[2] <= max[2];
          for (const [v, p] of st.V) if (dentro(p)) vertices.add(v);
          for (const f of st.F.values()) if (f.vs.every((v) => dentro(st.V.get(v)))) faces.add(f.id);
        }
      }
    }
  }
  if (sel.origem != null) {
    teveChave = true;
    const origem = sel.origem;
    if (!origemFormatoValido(origem)) {
      grita(st, i, op, 'sel.origem', "seleção origem inválida: loft usa op, id, faixa e lado opcional; cubo usa op, id e face (fundo, topo, tras, direita, frente ou esquerda)");
    } else {
      const registros = st.origens.get(origem.id) ?? [];
      if (!registros.length) grita(st, i, op, 'sel.origem', `origem ${origem.op}:${origem.id} inexistente ou ainda não criada`);
      else if (registros.length !== 1) grita(st, i, op, 'sel.origem', `origem ${origem.id} ambígua: ${registros.length} geradores declararam esta identidade`);
      else if (registros[0].op !== origem.op) grita(st, i, op, 'sel.origem.op', `origem ${origem.id} foi declarada por '${registros[0].op}', não por '${origem.op}'`);
      else {
        const registro = registros[0];
        if (origem.op === 'loft') {
          const faixa = registro.faixas[origem.faixa];
          if (!faixa) grita(st, i, op, 'sel.origem.faixa', `faixa ${origem.faixa} fora do limite da origem loft:${origem.id}`);
          else if (!faixa.length) grita(st, i, op, 'sel.origem.faixa', `faixa ${origem.faixa} da origem loft:${origem.id} não tem faces laterais`);
          else if (origem.lado != null && origem.lado >= faixa.length) grita(st, i, op, 'sel.origem.lado', `lado ${origem.lado} fora do limite da faixa ${origem.faixa} (0..${faixa.length - 1})`);
          else for (const fid of origem.lado == null ? faixa : [faixa[origem.lado]]) adicionaFace(fid);
        } else adicionaFace(registro.faces[origem.face]);
      }
    }
  }
  if (sel.alias != null) {
    teveChave = true;
    const nome = sel.alias;
    const def = st.aliases.get(nome);
    if (typeof nome !== 'string' || !def) grita(st, i, op, 'sel.alias', `alias '${nome}' inexistente`);
    else {
      const termos = def.unir ?? [def];
      if (!Array.isArray(termos) || !termos.length) grita(st, i, op, 'sel.alias', `alias '${nome}' inválido: precisa apontar para origem ou unir`);
      else {
        const antes = st.orfaos.length;
        for (const termo of termos) {
          if (!termo || typeof termo !== 'object' || Array.isArray(termo) || termo.alias != null || termo.origem == null || Object.keys(termo).some((k) => k !== 'origem')) { grita(st, i, op, 'sel.alias', `alias '${nome}' inválido: aliases não encadeiam e só aceitam origem`); continue; }
          const r = resolverSelecao(st, termo, op, i);
          for (const v of r.vertices) vertices.add(v); for (const f of r.faces) faces.add(f);
        }
        if (st.orfaos.length > antes) { vertices.clear(); faces.clear(); }
      }
    }
  }
  if (!teveChave) grita(st, i, op, 'sel', 'seleção vazia: informe v, f, grupo, regiao ou origem');
  if (!vertices.size && !faces.size && !vazioNoop) grita(st, i, op, 'sel', 'seleção vazia: nenhum alvo válido foi encontrado');
  return { vertices, faces };
}

function resolverAlvosV(st, sel, op, i) { return resolverSelecao(st, sel, op, i, { vazioNoop: true }).vertices; }

/* A assinatura histórica `faces:[ids]` continua igual. `faces` e `sel` na
   mesma op seriam duas fontes concorrentes, então GRITAM em vez de unir por
   acidente. Operações por face não têm seleção vazia documentada como no-op. */
function resolverAlvosF(st, a, op, i, { todasQuandoAusente = false } = {}) {
  if (a.faces != null && a.sel != null) {
    grita(st, i, op, 'faces+sel', 'seleção ambígua: use faces:[ids] (legado) OU sel:{...}, nunca os dois');
    return new Set();
  }
  if (a.faces != null) {
    if (!Array.isArray(a.faces)) { grita(st, i, op, 'faces', 'seleção faces inválida: precisa ser uma lista de ids de face'); return new Set(); }
    const faces = new Set();
    for (const fid of a.faces) {
      if (!st.F.has(fid)) { grita(st, i, op, fid, 'face inexistente na seleção'); continue; }
      faces.add(fid);
    }
    if (!faces.size) grita(st, i, op, 'faces', 'seleção vazia: nenhum id de face válido foi encontrado');
    return faces;
  }
  if (a.sel != null) {
    const faces = resolverSelecao(st, a.sel, op, i).faces;
    // Uma região pode conter vértice(s) mas nenhuma face INTEIRA; para uma op
    // de atributo isso ainda é seleção vazia, nunca um no-op silencioso.
    if (!faces.size) grita(st, i, op, 'sel', 'seleção vazia para faces: nenhum alvo de face válido foi encontrado');
    return faces;
  }
  if (todasQuandoAusente) return new Set(st.F.keys());
  grita(st, i, op, 'seleção', 'seleção ausente: use faces:[ids] (legado) ou sel:{...}');
  return new Set();
}

/* ----------------------------------------------------------------------------
   Frame de TRANSPORTE PARALELO — usado só pela op `loft` abaixo. Reimplementado
   AQUI, byte-equivalente ao `quadro`/`transporta` de motor/arvore-cartoon.js (a
   convenção já provada no `galhoSeca` daquele arquivo): MESMA matemática, MESMA
   ordem de operações — mas LOCAL, porque o núcleo não importa do motor de
   árvores (fica autocontido). `quadroLoft(t)` monta a semente do frame a partir
   de uma tangente `t` (um eixo de referência quase-perpendicular evita produto
   vetorial quase-nulo); `transportaLoft(uPrev, t)` propaga o `u` anterior pra
   uma tangente NOVA projetando fora a componente ao longo dela (`u = uPrev −
   t·(uPrev·t)`) e renormalizando — e, se isso degenerar (tangente ~oposta à
   anterior), refaz do zero com `quadroLoft(t)`. É isto que faz o `loft` não
   TORCER numa curva: o `u` acompanha a tangente pelo caminho mais curto. */
function quadroLoft(t) {
  const ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const c = cross3(ref, t);
  const u = norm3(c[0], c[1], c[2]);
  return [u, cross3(u, t)];
}
function transportaLoft(uPrev, t) {
  const dot = uPrev[0] * t[0] + uPrev[1] * t[1] + uPrev[2] * t[2];
  let u = [uPrev[0] - t[0] * dot, uPrev[1] - t[1] * dot, uPrev[2] - t[2] * dot];
  if (Math.hypot(u[0], u[1], u[2]) < 1e-4) u = quadroLoft(t)[0];
  return norm3(u[0], u[1], u[2]);
}

/* exportado (P7 do playground, D-120): o MANIFESTO de capacidades da Oficina
   sai daqui — `Object.keys(OPS)` é a lista de ops IMPLEMENTADAS de verdade,
   nunca precisa ser copiada à mão num doc que pode desatualizar. A bancada
   `criar.mjs` cruza isso contra a tabela da skill `criar-peca` e avisa se
   divergir (op no núcleo sem doc, ou doc citando op que não existe mais). */
export const OPS = {
  /* ---- primitivas: criam vértices únicos + faces a partir da base do passo ---- */
  cubo(st, a, i) {
    const b = confereId(st, i, 'cubo', a);
    if (a.origemId != null && (!Number.isSafeInteger(a.origemId) || a.origemId < 0)) return grita(st, i, 'cubo', 'origemId', 'origemId precisa ser inteiro não-negativo');
    const lx = st.num(a.larg ?? a.lado ?? 1) / 2;
    const ly = st.num(a.alt ?? a.lado ?? 1);
    const lz = st.num(a.prof ?? a.lado ?? 1) / 2;
    const P = [
      [-lx, 0, -lz], [lx, 0, -lz], [lx, 0, lz], [-lx, 0, lz],   // 0..3 base (y=0)
      [-lx, ly, -lz], [lx, ly, -lz], [lx, ly, lz], [-lx, ly, lz], // 4..7 topo (y=ly)
    ];
    P.forEach((p, k) => addV(st, b + k, p));
    const q = (fid, ...c) => addF(st, fid, c.map((k) => b + k));   // ordem = normal pra FORA (mesma convenção do geo.box)
    q(b + 0, 0, 1, 2, 3);   // fundo  -y
    q(b + 1, 7, 6, 5, 4);   // topo   +y
    q(b + 2, 1, 0, 4, 5);   // -z
    q(b + 3, 2, 1, 5, 6);   // +x
    q(b + 4, 3, 2, 6, 7);   // +z
    q(b + 5, 0, 3, 7, 4);   // -x
    if (a.origemId != null) registraOrigem(st, i, 'cubo', a.origemId, { faces: { fundo: b, topo: b + 1, tras: b + 2, direita: b + 3, frente: b + 4, esquerda: b + 5 } });
  },

  cilindro(st, a, i) {
    const b = confereId(st, i, 'cilindro', a);
    const r = st.num(a.raio ?? 0.5);
    const h = st.num(a.altura ?? 1);
    const L = Math.max(3, st.num(a.lados ?? 8) | 0);   // `lados` é TOPO: muda a CONTAGEM
    if (2 * L > BLOCO) throw new Error(`oficina: cilindro com ${L} lados estoura o bloco de ids (${BLOCO}); máx ${(BLOCO / 2) | 0}`);   // D3: guarda de overflow por-passo
    for (let k = 0; k < L; k++) { const t = (k / L) * Math.PI * 2; addV(st, b + k, [Math.cos(t) * r, 0, Math.sin(t) * r]); }
    for (let k = 0; k < L; k++) { const t = (k / L) * Math.PI * 2; addV(st, b + L + k, [Math.cos(t) * r, h, Math.sin(t) * r]); }
    for (let k = 0; k < L; k++) { const n = (k + 1) % L; addF(st, b + k, [b + k, b + L + k, b + L + n, b + n]); } // lados (normal radial pra fora)
    // tampas: MESMO winding do cubo (fundo pra-frente -> normal -y; topo revertido -> +y). Inverter apaga a luz da tampa — era o bug D1.
    const fundo = []; for (let k = 0; k < L; k++) fundo.push(b + k); addF(st, b + L, fundo);          // -y
    const topo = []; for (let k = L - 1; k >= 0; k--) topo.push(b + L + k); addF(st, b + L + 1, topo); // +y
  },

  /* ---- P1 do playground: esfera / cone / plano — geradores novos, mesmas leis ----
     NUMERAÇÃO É FORMATO SALVO (docs/playground.md, regra 4): a numeração de vértice
     e de face de cada op abaixo está documentada AQUI e travada por teste — depois
     de shipada, NUNCA muda (peça salva depende dela). Winding sempre com a normal
     pra FORA (a convenção do cubo/cilindro — a lição D1 das tampas). Guarda de
     overflow por-passo como no cilindro (D3): estourar o bloco GRITA ALTO (throw). */

  /* esfera — UV-sphere APOIADA no chão como as outras primitivas: polo sul em y=0,
     centro em y=raio, polo norte em y=2·raio. `raio` é PARAM (mudar não renumera);
     `aneis` (mín 2) e `lados` (mín 3) são TOPO — mudam a CONTAGEM.
     VÉRTICES (formato salvo, travado por teste): polo sul = b+0; anel k
     (k=1..aneis-1, do sul pro norte, ângulo polar k·π/aneis), vértice j
     (j=0..lados-1, mesmo ângulo do cilindro: j=0 em +x, crescendo pra +z) =
     b + 1 + (k-1)·lados + j; polo norte = b + 1 + (aneis-1)·lados.
     Total: 2 + (aneis-1)·lados.
     FACES (formato salvo, travado por teste) — contíguas por FAIXA, do sul pro
     norte; a faixa k (k=0..aneis-1) tem `lados` faces e a face j dela é
     b + k·lados + j:
       faixa 0         = leque do polo sul, triângulo [polo, anel1[j], anel1[j+1]]
                         (ângulo crescente, como a tampa de fundo do cilindro — normal pra baixo/fora);
       faixa 1..aneis-2 = quad [anelK[j], anelK+1[j], anelK+1[j+1], anelK[j+1]]
                         (o MESMO winding da lateral do cilindro — normal radial pra fora);
       faixa aneis-1   = leque do polo norte, triângulo [polo, anelÚlt[j+1], anelÚlt[j]]
                         (ângulo decrescente, como a tampa de cima — normal pra cima/fora).
     Total: aneis·lados. */
  esfera(st, a, i) {
    const b = confereId(st, i, 'esfera', a);
    const r = st.num(a.raio ?? 0.5);
    const A = Math.max(2, st.num(a.aneis ?? 6) | 0);   // TOPO: muda a CONTAGEM
    const L = Math.max(3, st.num(a.lados ?? 8) | 0);   // TOPO: muda a CONTAGEM
    const nV = 2 + (A - 1) * L, nF = A * L;
    if (nV > BLOCO || nF > BLOCO) throw new Error(`oficina: esfera com aneis=${A}, lados=${L} estoura o bloco de ids (${BLOCO}): ${nV} vértices / ${nF} faces`);   // guarda de overflow (D3)
    const anel = (k, j) => b + 1 + (k - 1) * L + j;    // id do vértice j do anel k (1..aneis-1)
    addV(st, b, [0, 0, 0]);                            // polo sul (b+0)
    for (let k = 1; k < A; k++) {
      const f = (k / A) * Math.PI;                     // ângulo polar a partir do sul
      const rk = Math.sin(f) * r, y = (1 - Math.cos(f)) * r;
      for (let j = 0; j < L; j++) { const t = (j / L) * Math.PI * 2; addV(st, anel(k, j), [Math.cos(t) * rk, y, Math.sin(t) * rk]); }
    }
    const norte = b + 1 + (A - 1) * L;
    addV(st, norte, [0, 2 * r, 0]);                    // polo norte
    for (let j = 0; j < L; j++) { const n = (j + 1) % L; addF(st, b + j, [b, anel(1, j), anel(1, n)]); }   // leque do sul
    for (let k = 1; k < A - 1; k++) for (let j = 0; j < L; j++) { const n = (j + 1) % L; addF(st, b + k * L + j, [anel(k, j), anel(k + 1, j), anel(k + 1, n), anel(k, n)]); }   // faixas de quads
    for (let j = 0; j < L; j++) { const n = (j + 1) % L; addF(st, b + (A - 1) * L + j, [norte, anel(A - 1, n), anel(A - 1, j)]); }   // leque do norte
  },

  /* cone — base no chão como o cilindro: anel em y=0, ápice em y=altura. `raio` e
     `altura` são PARAMS; `lados` (mín 3) é TOPO.
     VÉRTICES (formato salvo, travado por teste): anel da base = b+0..b+lados-1
     (mesmo ângulo do cilindro: j=0 em +x, crescendo pra +z), ápice = b+lados.
     Total: lados+1.
     FACES (formato salvo, travado por teste): laterais = b+j, triângulo
     [b+j, ápice, b+j+1] — a lateral do cilindro com o anel de cima colapsado no
     ápice (normal pra fora); tampa da base = b+lados, polígono [b+0..b+lados-1]
     no MESMO winding da tampa de fundo do cilindro (ângulo crescente — normal -y).
     Total: lados+1. */
  cone(st, a, i) {
    const b = confereId(st, i, 'cone', a);
    const r = st.num(a.raio ?? 0.5);
    const h = st.num(a.altura ?? 1);
    const L = Math.max(3, st.num(a.lados ?? 8) | 0);   // TOPO: muda a CONTAGEM
    if (L + 1 > BLOCO) throw new Error(`oficina: cone com ${L} lados estoura o bloco de ids (${BLOCO}); máx ${BLOCO - 1}`);   // guarda de overflow (D3): lados+1 vértices E lados+1 faces
    for (let k = 0; k < L; k++) { const t = (k / L) * Math.PI * 2; addV(st, b + k, [Math.cos(t) * r, 0, Math.sin(t) * r]); }
    addV(st, b + L, [0, h, 0]);                                                                       // ápice
    for (let k = 0; k < L; k++) { const n = (k + 1) % L; addF(st, b + k, [b + k, b + L, b + n]); }    // laterais (normal pra fora)
    const fundo = []; for (let k = 0; k < L; k++) fundo.push(b + k); addF(st, b + L, fundo);          // tampa da base (-y, o winding do fundo do cilindro)
  },

  /* plano — grade no plano XZ, y=0, CENTRADA na origem (o chão). `largura` (eixo x)
     e `profundidade` (eixo z) são PARAMS; `seg` (mín 1) é TOPO: (seg+1)² vértices,
     seg² quads.
     VÉRTICES (formato salvo, travado por teste), LINHA A LINHA: linha iz
     (iz=0..seg, de -z pra +z), coluna ix (ix=0..seg, de -x pra +x) ->
     b + iz·(seg+1) + ix. Total: (seg+1)².
     FACES (formato salvo, travado por teste): o quad da célula (ix, iz)
     (ix,iz=0..seg-1) = b + iz·seg + ix, cantos
     [v(ix,iz), v(ix,iz+1), v(ix+1,iz+1), v(ix+1,iz)] — normal +y (o MESMO ciclo
     da tampa de cima do cubo). Total: seg². */
  plano(st, a, i) {
    const b = confereId(st, i, 'plano', a);
    const lx = st.num(a.largura ?? 1), lz = st.num(a.profundidade ?? 1);
    const S = Math.max(1, st.num(a.seg ?? 1) | 0);     // TOPO: muda a CONTAGEM
    const nV = (S + 1) * (S + 1);
    if (nV > BLOCO) throw new Error(`oficina: plano com seg=${S} estoura o bloco de ids (${BLOCO}): ${nV} vértices; máx seg=30`);   // guarda de overflow (D3); faces = seg² < (seg+1)², coberto
    const v = (ix, iz) => b + iz * (S + 1) + ix;
    for (let iz = 0; iz <= S; iz++) for (let ix = 0; ix <= S; ix++) addV(st, v(ix, iz), [(ix / S - 0.5) * lx, 0, (iz / S - 0.5) * lz]);
    for (let iz = 0; iz < S; iz++) for (let ix = 0; ix < S; ix++) addF(st, b + iz * S + ix, [v(ix, iz), v(ix, iz + 1), v(ix + 1, iz + 1), v(ix + 1, iz)]);
  },

  /* chamferBox — P8b do playground: o `cubo` com CANTOS E ARESTAS chanfrados (o corte
     de UM nível só — a versão "flat", sem arredondar; suavizar/arredondar é a mesma
     classe do "lathe só reto por enquanto", fica pra quando o caso real pedir). Chão
     embaixo como o cubo: `larg`/`alt`/`prof` (ou `lado`, os três) definem a mesma caixa
     x∈[-larg/2,larg/2], y∈[0,alt], z∈[-prof/2,prof/2]; `chanfro` é a distância do corte,
     em unidade de mundo, IGUAL pras 12 arestas.

     VALIDADE: `chanfro` precisa ser `> 0` e `< min(larg/2, prof/2, alt/2)` — cortes de
     CANTOS OPOSTOS da mesma aresta não podem se cruzar (uma aresta de comprimento L leva
     um corte de `chanfro` em CADA ponta, sobra `L − 2·chanfro`; a mais curta entre as 3
     famílias de aresta manda). No limite EXATO a malha já degenera (medido: normal
     zerada, arestas soltas) — por isso o teste é estrito. Fora da faixa GRITA e a op
     não constrói nada neste passo (0 vértices/faces) — o mesmo tratamento do perfil
     inválido do lathe: mais seguro que adivinhar quantos ids um corte inválido ocuparia.

     TOPOLOGIA (formato salvo, travada por teste) — SEM parâmetro TOPO, a contagem é
     SEMPRE 24 vértices / 26 faces (bem abaixo do bloco; sem guarda de overflow, não tem
     como estourar). Cada um dos 8 CANTOS do cubo reto (mesma ordem de sinal do `cubo`:
     0..3 no chão CCW-de-cima, 4..7 no topo) vira 3 vértices — um por EIXO — porque as 3
     faces que se encontravam ali (X, Y, Z) cada uma ENCOLHE por conta própria: o vértice
     "do eixo X" fica com a coordenada X no valor CHEIO do canto (ele mora na face X) e
     as OUTRAS duas (Y, Z) encolhidas por `chanfro` pra dentro — é CANTELAÇÃO (cada FACE
     encolhe), não truncagem de canto (cada canto vira 1 corte só) — as duas são
     chanfros válidos mas com topologia diferente; truncagem dava hexágono/octógono nas
     faces originais em vez de quad menor (confundi as duas na primeira derivação desta
     op — provado errado por característica de Euler, V−E+F≠2, antes de escrever
     qualquer linha aqui: a lição de sempre, medir em vez de recontar de cabeça).
     Vértice do canto k, eixo X/Y/Z: id `b + k*3 + {0,1,2}`.

     FACES: `b+0..5` as 6 faces originais (MESMO padrão de canto do `cubo`, cada uma só
     trocando pelo vértice-do-eixo-certo); `b+6..17` os 12 retângulos de aresta (4 por
     eixo, na ordem X,Y,Z — cada retângulo cobre a aresta cortada, ligando o vértice dos
     DOIS OUTROS eixos nas duas pontas); `b+18..25` os 8 triângulos de canto (ordem de
     k, ligando os 3 vértices daquele canto). Winding: ao contrário do cilindro/esfera
     (uma superfície de revolução com um giro só, então um sentido só resolve tudo), o
     chanfro não tem simetria rotacional — CADA face nasce numa ordem fixa e se
     AUTO-ORIENTA contra o CENTRO real da caixa (normal de Newell · direção do centro
     pro centroide da face; inverte se apontar pra dentro) em vez de uma tabela de sinal
     por canto decorada à mão (mais fácil de errar decorando do que deixando a própria
     geometria decidir) — verificado por teste nas 26 faces, não numa amostra. */
  chamferBox(st, a, i) {
    const b = confereId(st, i, 'chamferBox', a);
    const lx = st.num(a.larg ?? a.lado ?? 1) / 2;
    const ly = st.num(a.alt ?? a.lado ?? 1);
    const lz = st.num(a.prof ?? a.lado ?? 1) / 2;
    const c = st.num(a.chanfro ?? 0.1);
    const lim = Math.min(lx, lz, ly / 2);
    if (!(c > 0) || !(c < lim)) return grita(st, i, 'chamferBox', c, `chanfro precisa ser > 0 e < ${lim} (o menor entre metade da largura, metade da profundidade e metade da altura) — senão os cortes de pontas opostas da mesma aresta se cruzam`);

    const CANTOS = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]];   // mesma ordem de sinal do cubo
    const loc = new Map();   // local (0..23) -> posição, construído ANTES de tocar st (o padrão do inflate)
    const X = (k) => k * 3, Y = (k) => k * 3 + 1, Z = (k) => k * 3 + 2;
    CANTOS.forEach(([sx, sy, sz], k) => {
      const oy = sy ? -1 : 1;   // "pra dentro" no y: chão (sy=0) empurra +y, topo (sy=1) empurra -y
      loc.set(X(k), [sx * lx, sy * ly + oy * c, sz * (lz - c)]);
      loc.set(Y(k), [sx * (lx - c), sy * ly, sz * (lz - c)]);
      loc.set(Z(k), [sx * (lx - c), sy * ly + oy * c, sz * lz]);
    });

    const centro = [0, ly / 2, 0];   // centro REAL da caixa (y não é centrado em 0 — chão embaixo, como o cubo)
    const orienta = (vs) => {
      const n = normalDaFace(loc, vs);
      let cx = 0, cy = 0, cz = 0;
      for (const id of vs) { const p = loc.get(id); cx += p[0]; cy += p[1]; cz += p[2]; }
      const dir = norm3(cx / vs.length - centro[0], cy / vs.length - centro[1], cz / vs.length - centro[2]);
      const dot = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
      return dot < 0 ? vs.slice().reverse() : vs;
    };

    const faces = [];
    faces.push(orienta([Y(0), Y(1), Y(2), Y(3)]));   // fundo -y — padrão do cubo
    faces.push(orienta([Y(7), Y(6), Y(5), Y(4)]));   // topo  +y
    faces.push(orienta([Z(1), Z(0), Z(4), Z(5)]));   // -z
    faces.push(orienta([X(2), X(1), X(5), X(6)]));   // +x
    faces.push(orienta([Z(3), Z(2), Z(6), Z(7)]));   // +z
    faces.push(orienta([X(0), X(3), X(7), X(4)]));   // -x

    const achaCanto = (sx, sy, sz) => CANTOS.findIndex(([a2, b2, c2]) => a2 === sx && b2 === sy && c2 === sz);
    for (const [sy, sz] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { const k1 = achaCanto(-1, sy, sz), k2 = achaCanto(1, sy, sz); faces.push(orienta([Y(k1), Y(k2), Z(k2), Z(k1)])); }   // 4 arestas-X
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const k1 = achaCanto(sx, 0, sz), k2 = achaCanto(sx, 1, sz); faces.push(orienta([X(k1), X(k2), Z(k2), Z(k1)])); }   // 4 arestas-Y
    for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { const k1 = achaCanto(sx, sy, -1), k2 = achaCanto(sx, sy, 1); faces.push(orienta([X(k1), X(k2), Y(k2), Y(k1)])); }   // 4 arestas-Z
    for (let k = 0; k < 8; k++) faces.push(orienta([X(k), Y(k), Z(k)]));   // 8 triângulos de canto

    loc.forEach((p, id) => addV(st, b + id, p));
    faces.forEach((vs, k) => addF(st, b + k, vs.map((id) => b + id)));
  },

  /* lathe — P2 do playground: um perfil 2D `[[raio,y],...]` GIRADO em torno do
     eixo Y (superfície de revolução). GENERALIZA o esquema da esfera acima —
     formalmente, a esfera É um lathe de uma meia-circunferência (polo->anéis->
     polo); aqui o perfil é ARBITRÁRIO, não só um arco. `raio`/`y` de CADA ponto
     passam por st.num() (podem citar PARAM, como o raio da esfera); `lados`
     (mín 3, mesmo Math.max das outras primitivas) é TOPO pra TODO o perfil —
     muda a CONTAGEM de todo anel de uma vez.

     O PONTO DE PERFIL — RESERVA DE CURVA (formato salvo, IRREVERSÍVEL, ver
     docs/oficina.md "Aba Desenho"): um ponto é `[raio,y]`, SEMPRE 2 elementos =
     SEMPRE um canto RETO (produz exatamente 1 anel/polo — nunca muda, nem
     quando a curva chegar). Um 3º elemento é a alça de curva reservada pra uma
     rodada futura. HOJE não existe suporte: o ponto ainda constrói RETO (como
     se o 3º elemento não estivesse lá) — mas GRITA (órfão), nunca ignora em
     silêncio, senão a peça salva hoje renderizaria reta e mudaria de figura
     sozinha no dia em que a curva for implementada.

     POLO vs ANEL (a topologia, formato salvo): o teste é `raio RESOLVIDO ===
     0` -> POLO (1 vértice EM CIMA do eixo, y do ponto — como o polo da
     esfera); `raio > 0` -> ANEL de `lados` vértices (mesmo ângulo/sentido do
     cilindro/esfera: j=0 em +x, crescendo pra +z). Logo um PARAM usado como
     raio de perfil que cruze 0<->não-zero muda a TOPOLOGIA e renumera (mesma
     classe que mudar `lados`); polos típicos são `0` LITERAL. `raio < 0` não
     dá pra classificar polo/anel — GRITA e a op inteira não constrói NADA
     neste passo (0 vértices/faces), o mesmo tratamento de "perfil com menos de
     2 pontos": mais seguro que adivinhar quantos ids um ponto inválido
     ocuparia (o que quebraria a fórmula de numeração abaixo pros pontos
     seguintes). Nunca corrompe — só não constrói.

     NUMERAÇÃO DE VÉRTICE (formato salvo, travada por teste): anda o perfil com
     um CURSOR que começa em 0. Ponto i POLO consome 1 id (b+cursor); ponto i
     ANEL consome `lados` ids (b+cursor+j, j=0..lados-1). O cursor SOMA o que
     acabou de consumir a cada ponto. Só depende de QUAIS pontos são polo (a
     ESTRUTURA do perfil) + `lados` — nunca do VALOR de raio/y (PARAM não
     renumera, só muda posição).

     FACES entre pontos consecutivos (i,i+1) — cursor de face ANÁLOGO (começa
     em 0, cada segmento soma só o que ele de fato produziu, em ORDEM):
       anel<->anel : `lados` QUADS, winding EXATAMENTE a faixa da esfera —
                     [baixo[j], cima[j], cima[j+1], baixo[j+1]];
       polo->anel  : `lados` triângulos, EXATAMENTE o leque SUL da esfera —
                     [polo, anel[j], anel[j+1]] (o polo é o ponto DE BAIXO);
       anel->polo  : `lados` triângulos, EXATAMENTE o leque NORTE da esfera —
                     [polo, anel[j+1], anel[j]] (ordem invertida — o polo é o
                     ponto DE CIMA, o mesmo giro que inverte a tampa de cima);
       polo<->polo : GRITA ("perfil degenerado") e ZERO faces neste segmento —
                     o cursor de face não avança aqui, mas os pontos e
                     segmentos seguintes seguem normais (não corrompe o resto).
     Winding sempre pra FORA — reusa EXATAMENTE o esquema da esfera (perfil
     ORDENADO de baixo pra cima, raio>=0 -> normais pra fora); é essa ordem que
     faz o leque polo->anel e o leque anel->polo precisarem de sentido oposto,
     idêntico a por que a tampa de baixo e a de cima do cilindro giram opostas.

     SEM tampas automáticas — superfície de revolução PURA. Fechar uma ponta é
     terminar o perfil no eixo (raio 0 = polo): o leque do polo VIRA a tampa,
     de graça (ex.: uma coluna com tampas chatas é só `[[0,0],[R,0],[R,h],
     [0,h]]` — polo embaixo -> anel -> anel -> polo em cima). Nenhum conceito
     de "cap" à parte.

     Perfil é só ABERTO (polilinha): não fecha loop mesmo se o último ponto ==
     o primeiro (pneu/torus fica FORA do escopo do P2 — um perfil assim só
     produz dois pontos normais, sem segmento extra ligando o fim ao começo).

     Guarda de overflow (D3, por-passo): soma EXATA de vértices e de faces
     (segmento polo<->polo não conta face nenhuma) calculada ANTES de inserir
     qualquer vértice — throw como a esfera/cone/plano. */
  lathe(st, a, i) {
    const b = confereId(st, i, 'lathe', a);
    const perfil = a.perfil ?? [];
    if (perfil.length < 2) return grita(st, i, 'lathe', perfil.length, `perfil precisa de ao menos 2 pontos (tem ${perfil.length})`);
    const L = Math.max(3, st.num(a.lados ?? 8) | 0);   // TOPO (pra TODO o perfil): muda a CONTAGEM

    /* resolve + valida CADA ponto ANTES de criar qualquer vértice (raio/y podem
       citar PARAM, como os outros pontos dimensionais da Oficina). FAIL-CLOSED
       (D-115): um ponto que não seja EXATAMENTE [raio, y] (2 elementos) — 3+
       (a alça de curva RESERVADA, ainda não implementada) ou <2 (malformado) —
       GRITA e ABORTA o passo inteiro (0 V/0 F), como o raio<0. Nunca constrói
       malha "plausível-porém-reservada" que mudaria de figura quando a curva
       chegar: reserva de formato salvo é fail-closed, não fail-open. */
    let pontoInvalido = false;
    const pontos = perfil.map((pt, j) => {
      if (!Array.isArray(pt) || pt.length !== 2) { grita(st, i, 'lathe', j, `ponto ${j} do perfil precisa ser [raio, y] (2 elementos); recebido ${Array.isArray(pt) ? `${pt.length} elemento(s)` : 'não-array'} — a alça de curva (3º elemento) está RESERVADA, ainda não implementada`); pontoInvalido = true; return { raio: 0, y: 0, polo: true }; }
      const raio = st.num(pt[0]), y = st.num(pt[1]);
      if (raio < 0) { grita(st, i, 'lathe', j, `raio negativo (${raio}) no ponto ${j} do perfil — não dá pra classificar polo/anel`); pontoInvalido = true; }
      return { raio, y, polo: raio === 0 };
    });
    if (pontoInvalido) return;   // algum ponto inválido (aridade ≠ 2, ou raio<0) -> nada construído neste passo (grita já registrado por ponto)

    // guarda de overflow (D3): soma EXATA — segmento polo<->polo não soma face — ANTES de inserir
    let nV = 0; for (const p of pontos) nV += p.polo ? 1 : L;
    let nF = 0; for (let idx = 0; idx < pontos.length - 1; idx++) if (!(pontos[idx].polo && pontos[idx + 1].polo)) nF += L;
    if (nV > BLOCO || nF > BLOCO) throw new Error(`oficina: lathe com ${perfil.length} pontos × lados=${L} estoura o bloco de ids (${BLOCO}): ${nV} vértices / ${nF} faces`);

    // VÉRTICES — anda o cursor (a fórmula documentada acima)
    let cursor = 0;
    const info = pontos.map((p) => {
      if (p.polo) {
        const id = b + cursor;
        addV(st, id, [0, p.y, 0]);
        cursor += 1;
        return { polo: true, id };
      }
      const ids = [];
      for (let j = 0; j < L; j++) { const t = (j / L) * Math.PI * 2; const id = b + cursor + j; addV(st, id, [Math.cos(t) * p.raio, p.y, Math.sin(t) * p.raio]); ids.push(id); }
      cursor += L;
      return { polo: false, ids };
    });

    // FACES — cursor de face análogo, por segmento consecutivo (i,i+1)
    let fCursor = 0;
    for (let idx = 0; idx < info.length - 1; idx++) {
      const A = info[idx], B = info[idx + 1];
      if (A.polo && B.polo) { grita(st, i, 'lathe', idx, 'polo↔polo adjacente — perfil degenerado, sem face neste segmento'); continue; }   // 0 faces, cursor não avança
      if (!A.polo && !B.polo) {
        for (let j = 0; j < L; j++) { const n = (j + 1) % L; addF(st, b + fCursor + j, [A.ids[j], B.ids[j], B.ids[n], A.ids[n]]); }   // anel<->anel: quads (a faixa da esfera)
      } else if (A.polo) {
        for (let j = 0; j < L; j++) { const n = (j + 1) % L; addF(st, b + fCursor + j, [A.id, B.ids[j], B.ids[n]]); }   // polo embaixo -> anel em cima: leque SUL
      } else {
        for (let j = 0; j < L; j++) { const n = (j + 1) % L; addF(st, b + fCursor + j, [B.id, A.ids[n], A.ids[j]]); }   // anel embaixo -> polo em cima: leque NORTE (invertido)
      }
      fCursor += L;
    }
  },

  /* loft — P4 do playground: uma sequência de SEÇÕES (círculo de raio variável)
     encadeada ao longo de um CAMINHO 3D arbitrário — tubo/casco/galho/membro.
     O `lathe` acima é o TEMPLATE: reusa EXATAMENTE o esquema cursor/polo/
     anel/leque/guarda dele; a única peça NOVA é o FRAME que orienta cada anel,
     porque não existe mais um eixo fixo (o Y do lathe) pra jogar cos/sin em
     cima — o frame tem que ACOMPANHAR o caminho sem torcer.

     ARGS: `secoes: [{pos:[x,y,z], raio}, ...]` (≥2, senão GRITA e ABORTA, como
     o perfil curto do lathe) + `lados` (TOPO, mín 3, pra TODA seção de uma vez
     — como o lathe). `pos` passa por `st.vec`, `raio` por `st.num` (podem
     citar PARAM). Nome `secoes` (não `perfis`, que a linha especulativa do
     doc citava): `perfil` já é do `lathe` com outra FORMA (`[raio,y]` 2D);
     reusar o nome confundiria os dois.

     CONTORNO explícito (P5, docs/playground.md) — substitui `raio` por
     `contorno: [[u,w], ...]` com EXATAMENTE `lados` pontos no plano LOCAL do
     anel (os eixos `fr.u`/`fr.w` do transporte paralelo, o mesmo `ca,sa` que
     o círculo calculava de `cos/sin·raio`) — destrava seção NÃO-circular
     (estrela, hexágono, perfil de I) sem tocar em NADA da numeração/faces/
     overflow, que só enxergam "polo ou anel de `lados` vértices", nunca a
     ORIGEM das coordenadas. `raio` e `contorno` são MUTUAMENTE EXCLUSIVOS
     numa seção (os dois juntos GRITA — ambíguo); nenhum dos dois GRITA
     também. Cada ponto do contorno é `[u,w]` (2 elementos); a alça de curva
     é RESERVADA no 3º elemento — GRITA e ABORTA, a mesma lei do ponto do
     perfil no lathe (D-115). Contagem errada (≠ `lados`) GRITA e ABORTA.
     Winding OBRIGATORIAMENTE CCW (ângulo crescente no círculo já É CCW em
     u,w) — validado por ÁREA COM SINAL (shoelace): CW ou degenerado (área
     ~0) GRITA e ABORTA, porque silenciosamente produziria normal invertida
     ou nula (a classe do achado adversarial do P3, não pega pelo manifold).
     Nunca vira polo (polo é só `raio:0` explícito). **Não confundir com
     `MATERIAIS[nome].contorno`** (passo 12a) — homônimo só de nome; aquele é
     um número (força do rim-light), este é uma lista de pontos, e os dois
     nunca se tocam (objetos diferentes, chaves diferentes).

     Seção malformada — não-objeto, sem `pos`, ou `pos` com aridade ≠ 3 —
     GRITA e ABORTA igual (não dá pra numerar uma seção que não sabe se é
     polo ou anel).

     POLO vs ANEL (idêntico ao lathe, só pra `raio`): RESOLVIDO `=== 0` vira
     POLO (1 vértice, bem em cima de `pos` — a ponta); `> 0` vira ANEL de
     `lados` vértices; `< 0` não dá pra classificar -> GRITA e ABORTA o passo
     inteiro (0 V/0 F), o mesmo tratamento do `raio<0` do lathe. SEM tampas
     automáticas: fechar uma ponta é terminar a seção com `raio:0`.

     SEGMENTO DE COMPRIMENTO ZERO (formato salvo, fail-closed): duas seções
     CONSECUTIVAS na MESMA `pos` resolvida (comparação EXATA por eixo) fazem a
     tangente do trecho ficar indefinida — sem uma direção, o frame (abaixo)
     não tem o que transportar. GRITA e ABORTA O PASSO INTEIRO (0 V/0 F),
     verificado ANTES de montar qualquer frame — nunca deixa passar um vetor
     degenerado que corromperia (ou colapsaria) a malha em silêncio.

     FRAME POR TRANSPORTE PARALELO (a peça NOVA vs. o lathe; formato salvo,
     travada por teste) — reimplementado ACIMA (`quadroLoft`/`transportaLoft`),
     byte-equivalente ao `quadro`/`transporta` de `arvore-cartoon.js` (a
     convenção já provada no `galhoSeca`), mas LOCAL ao núcleo:
       tangente da seção i = a direção do ÚNICO segmento que toca a ponta
       (i=0 -> direção do segmento 0->1; i=última -> direção do último
       segmento) OU, no INTERIOR do caminho, a MÉDIA normalizada das direções
       dos DOIS segmentos vizinhos (i-1->i e i->i+1) — suaviza o frame numa
       quina, em vez de saltar pra direção de só um lado.
       semente do frame: `t0 = tangente(0)`; `u0 = quadroLoft(t0)[0]`
       (internamente: `ref = |t0[1]|>0.9 ? [1,0,0] : [0,1,0]`, evita cross
       quase-nulo quando o caminho é quase vertical; `u0 = norm(cross(ref,t0))`).
       propagação (seção i>0): `u_i = transportaLoft(u_{i-1}, t_i)` — projeta
       `u_{i-1}` PRA FORA da tangente nova e renormaliza; se degenerar refaz
       com `quadroLoft(t_i)[0]`. `w_i = cross(u_i,t_i)`. É ISSO que impede o
       tubo de TORCER numa curva: o frame acompanha a tangente pelo caminho
       mais curto (sem componente rotacional em torno do próprio eixo), ao
       contrário de recalcular `quadroLoft(t_i)` do zero em toda seção (que
       reintroduziria uma torção arbitrária toda vez que o `ref` trocar de
       [1,0,0] pra [0,1,0] ou vice-versa).
       ANEL: vértice j (j=0..lados-1) = `pos + u·cos(a)·raio + w·sin(a)·raio`,
       `a = j/lados·2π` — a MESMA fórmula do lathe/esfera/cone
       (`[cos(t)·raio, y, sin(t)·raio]`), só que `u`/`w` (o frame local, girado
       pelo transporte paralelo) substituem os eixos fixos X/Z. Um caminho RETO
       no eixo Y (t=[0,1,0] sempre) dá o MESMO tubo do lathe — um círculo com a
       normal radial pra fora, mesmo sentido de giro —, só que `quadroLoft`
       escolhe `u0=[0,0,1]`/`w0=[-1,0,0]` (não `[1,0,0]`/`[0,0,1]` do lathe): a
       ponta j=0 sai numa FASE 90° diferente (não é byte-idêntico ponto-a-
       ponto), mas a FORMA/ORIENTAÇÃO é a mesma — o lathe é o caso degenerado
       de caminho reto; o loft generaliza pro caminho curvo.

     ⚠ CAMINHO SIMÉTRICO **NÃO** GERA MALHA SIMÉTRICA (D-128, achado pelo
     experimento do TETO — docs/TETO.md). Consequência direta do transporte
     paralelo descrito acima: o frame de cada anel é PROPAGADO a partir da
     PRIMEIRA seção, então ele depende do HISTÓRICO do caminho, não só da
     posição da seção. Um caminho cujos `pos` são simétricos em torno de um
     plano (ex.: x = −0.28 → −0.23 → +0.23 → +0.28) produz anéis com fases
     DIFERENTES nas duas metades, porque a tangente das pontas não é o eixo
     puro e as duas metades herdam frames girados um em relação ao outro.
     O `loft` só preserva simetria quando a tangente é CONSTANTE ao longo de
     todo o caminho (todas as seções no mesmo plano perpendicular).
       Medido: o guidão da `pecas/moto.js` (caminho simétrico em x, 12 anéis)
       tem os 12 vértices SEM par espelhado da peça — desvio máx 4.45e-3, e a
       peça inteira tem 480/492 com par EXATO. As rodas da mesma peça escapam
       porque todas as seções delas têm o mesmo y e o mesmo z (tangente
       (1,0,0) constante).
       O desvio é pequeno demais pra aparecer no render (4,5 mm numa moto de
       2,8 m) — então PRECISA de régua: o `auditar` tem um crítico de simetria
       (D-128) justamente porque nenhum gate pegava isso.
     PRA GARANTIR SIMETRIA: modele UMA metade e use `espelha` (que é exato por
     construção — reflete coordenada e solda no plano), em vez de confiar num
     caminho simétrico.

     NUMERAÇÃO DE VÉRTICE (formato salvo, travada por teste) — cursor IDÊNTICO
     ao lathe: seção POLO consome 1 id (`b+cursor`), seção ANEL consome
     `lados` ids (`b+cursor+j`); o cursor soma o que acabou de consumir a cada
     seção, na ORDEM das seções.

     FACES entre seções consecutivas (i,i+1) — cursor de face PRÓPRIO,
     ANÁLOGO ao lathe (começa em 0, cada segmento soma só o que produziu):
       anel<->anel : `lados` QUADS — [A[j], B[j], B[n], A[n]] (a MESMA faixa
                     do lathe/esfera, n=(j+1)%lados);
       polo->anel  : `lados` triângulos — leque SUL do lathe, [polo, B[j],
                     B[n]] (o polo é a seção DE TRÁS no caminho);
       anel->polo  : `lados` triângulos — leque NORTE do lathe (invertido),
                     [polo, A[n], A[j]] (o polo é a seção DA FRENTE);
       polo<->polo : GRITA ("seção degenerada") e ZERO faces neste segmento —
                     o cursor de face NÃO avança aqui, mas os segmentos
                     vizinhos seguem normais (não corrompe o resto), o MESMO
                     tratamento do lathe.
     Winding pra FORA: reusa a lei do lathe (seções em ORDEM ao longo do
     caminho, raio>=0) — a mesma faixa/leque, só orientada pelo frame local em
     vez do eixo Y fixo.

     Guarda de overflow (D3, por-passo): soma EXATA de vértices e de faces
     (segmento polo<->polo não conta face) calculada ANTES de montar frame ou
     inserir qualquer vértice — throw como o lathe. */
  loft(st, a, i) {
    const b = confereId(st, i, 'loft', a);
    if (a.origemId != null && (!Number.isSafeInteger(a.origemId) || a.origemId < 0)) return grita(st, i, 'loft', 'origemId', 'origemId precisa ser inteiro não-negativo');
    const secoesArg = a.secoes ?? [];
    if (secoesArg.length < 2) return grita(st, i, 'loft', secoesArg.length, `secoes precisa de ao menos 2 (tem ${secoesArg.length})`);
    const L = Math.max(3, st.num(a.lados ?? 8) | 0);   // TOPO (pra TODA seção): muda a CONTAGEM

    /* resolve + valida CADA seção ANTES de criar qualquer vértice — a forma
       (objeto com pos + raio OU contorno) primeiro; FAIL-CLOSED (a mesma lei
       da alça de curva do lathe, D-115): qualquer problema ABORTA O PASSO
       INTEIRO (0 V/0 F), nunca constrói "quase". */
    let invalido = false;
    const secoes = secoesArg.map((s, j) => {
      if (typeof s !== 'object' || s === null || Array.isArray(s)) { grita(st, i, 'loft', j, `seção ${j} precisa ser um objeto {pos,raio} ou {pos,contorno} (recebido ${Array.isArray(s) ? 'array' : typeof s})`); invalido = true; return { pos: [0, 0, 0], raio: 0, contorno: null, polo: true }; }
      if (s.pos == null) { grita(st, i, 'loft', j, `seção ${j} sem 'pos'`); invalido = true; return { pos: [0, 0, 0], raio: 0, contorno: null, polo: true }; }
      /* ARIDADE do pos (a mesma lei do ponto do perfil no lathe, D-115): sem
         isto, `pos: [0,1]` construía com z=undefined -> coordenada NaN e 0
         órfãos, e `pos: {x:0}` estourava throw cru. O `st.vec` também barra
         (rede central), mas só a checagem AQUI diz QUAL seção — e mantém a
         lei do fail-closed por PASSO em vez de matar a peça inteira. */
      if (!Array.isArray(s.pos) || s.pos.length !== 3) { grita(st, i, 'loft', j, `pos da seção ${j} precisa ser [x,y,z] (3 elementos); recebido ${JSON.stringify(s.pos)}`); invalido = true; return { pos: [0, 0, 0], raio: 0, contorno: null, polo: true }; }
      const pos = st.vec(s.pos);
      const temRaio = Object.hasOwn(s, 'raio'), temContorno = Object.hasOwn(s, 'contorno');
      if (temRaio && temContorno) { grita(st, i, 'loft', j, `seção ${j} tem 'raio' E 'contorno' — ambíguo, escolha um (círculo OU contorno explícito)`); invalido = true; return { pos, raio: 0, contorno: null, polo: true }; }
      if (!temRaio && !temContorno) { grita(st, i, 'loft', j, `seção ${j} sem 'raio' nem 'contorno'`); invalido = true; return { pos, raio: 0, contorno: null, polo: true }; }

      if (temRaio) {
        const raio = st.num(s.raio);
        if (raio < 0) { grita(st, i, 'loft', j, `raio negativo (${raio}) na seção ${j} — não dá pra classificar polo/anel`); invalido = true; }
        return { pos, raio, contorno: null, polo: raio === 0 };
      }

      /* CONTORNO explícito (P5): substitui o círculo por EXATAMENTE `lados`
         pontos [u,w] no plano LOCAL do anel (os mesmos eixos fr.u/fr.w do
         transporte paralelo) — a contagem/numeração/faces do anel não mudam
         em NADA (só a origem das coordenadas de cada vértice), então toda a
         guarda de overflow e o cursor de face seguem intactos. Nunca é polo
         (polo é só raio:0 explícito). Ponto malformado (aridade ≠ 2 — a alça
         de curva reservada seria o 3º elemento, mesma lei do lathe/D-115) e
         contorno com contagem errada GRITAM e ABORTAM. */
      if (!Array.isArray(s.contorno) || s.contorno.length !== L) { grita(st, i, 'loft', j, `contorno da seção ${j} precisa ter exatamente 'lados' (${L}) pontos [u,w] (tem ${Array.isArray(s.contorno) ? s.contorno.length : typeof s.contorno})`); invalido = true; return { pos, raio: 0, contorno: null, polo: true }; }
      let pontoInvalido = false;
      const pts = s.contorno.map((pt, k) => {
        if (!Array.isArray(pt) || pt.length !== 2) { grita(st, i, 'loft', j, `ponto ${k} do contorno da seção ${j} precisa ser [u,w] (2 elementos); a alça de curva (3º elemento) está RESERVADA, ainda não implementada`); pontoInvalido = true; return [0, 0]; }
        return [st.num(pt[0]), st.num(pt[1])];
      });
      if (pontoInvalido) { invalido = true; return { pos, raio: 0, contorno: null, polo: true }; }

      /* winding CCW obrigatório (shoelace) — a MESMA convenção do círculo
         (ângulo crescente = CCW em u,w): CW ou degenerado (área ~0) seria
         normal invertida ou NULA silenciosa, a classe do achado do P3. */
      let area2 = 0;
      for (let k = 0; k < L; k++) { const p = pts[k], q = pts[(k + 1) % L]; area2 += p[0] * q[1] - q[0] * p[1]; }
      if (area2 <= 1e-9) { grita(st, i, 'loft', j, `contorno da seção ${j} não é CCW ou é degenerado (área assinada ${(area2 / 2).toFixed(6)}) — normal ficaria invertida ou nula`); invalido = true; return { pos, raio: 0, contorno: null, polo: true }; }
      return { pos, raio: 0, contorno: pts, polo: false };
    });
    if (invalido) return;   // alguma seção inválida -> nada construído neste passo (grita já registrado por seção)

    // segmento de comprimento zero: tangente indefinida -> GRITA e ABORTA (fail-closed), ANTES de montar frame
    let comprimentoZero = false;
    for (let idx = 0; idx < secoes.length - 1; idx++) {
      const A = secoes[idx].pos, B = secoes[idx + 1].pos;
      if (A[0] === B[0] && A[1] === B[1] && A[2] === B[2]) { grita(st, i, 'loft', idx, `segmento ${idx}->${idx + 1} tem comprimento zero (seções na mesma posição) — tangente indefinida`); comprimentoZero = true; }
    }
    if (comprimentoZero) return;

    // guarda de overflow (D3): soma EXATA — segmento polo<->polo não soma face — ANTES de montar frame/inserir
    let nV = 0; for (const s of secoes) nV += s.polo ? 1 : L;
    let nF = 0; for (let idx = 0; idx < secoes.length - 1; idx++) if (!(secoes[idx].polo && secoes[idx + 1].polo)) nF += L;
    if (nV > BLOCO || nF > BLOCO) throw new Error(`oficina: loft com ${secoes.length} seções × lados=${L} estoura o bloco de ids (${BLOCO}): ${nV} vértices / ${nF} faces`);

    // TANGENTES por seção: ponta = direção do único segmento; interior = média normalizada dos dois vizinhos
    const ultimo = secoes.length - 1;
    const dirSeg = [];
    for (let idx = 0; idx < ultimo; idx++) { const A = secoes[idx].pos, B = secoes[idx + 1].pos; dirSeg.push(norm3(B[0] - A[0], B[1] - A[1], B[2] - A[2])); }
    const tangente = (idx) => (idx === 0 ? dirSeg[0] : idx === ultimo ? dirSeg[ultimo - 1] : norm3(dirSeg[idx - 1][0] + dirSeg[idx][0], dirSeg[idx - 1][1] + dirSeg[idx][1], dirSeg[idx - 1][2] + dirSeg[idx][2]));

    // CUSP (dobra ~180°): num interior, a soma dos dois segmentos vizinhos é ~zero -> a tangente
    // fica indefinida (norm3 devolve [0,0,0] pelo guarda `||1`) e w = cross(u,0) = 0 -> o anel
    // COLAPSA numa linha (degenerado SILENCIOSO, não-NaN). GRITA e ABORTA (fail-closed), como o
    // comprimento-zero acima. (O `galhoSeca` de arvore-cartoon.js nunca cai aqui: o `desviar` dele
    // só faz desvios PEQUENOS, jamais antiparalelos; o loft aceita caminho arbitrário e precisa da
    // guarda explícita — foi o achado adversarial do P4.)
    let cusp = false;
    for (let idx = 1; idx < ultimo; idx++) {
      const p = dirSeg[idx - 1], q = dirSeg[idx];
      if (Math.hypot(p[0] + q[0], p[1] + q[1], p[2] + q[2]) < 1e-6) { grita(st, i, 'loft', idx, `seção ${idx} é um cusp (o caminho dobra ~180°) — tangente indefinida, o anel colapsaria numa linha`); cusp = true; }
    }
    if (cusp) return;

    // FRAME por TRANSPORTE PARALELO: semente em quadroLoft(tangente(0)), propaga com transportaLoft (a fórmula documentada acima)
    let u = quadroLoft(tangente(0))[0];
    const frames = [];
    for (let idx = 0; idx <= ultimo; idx++) { const t = tangente(idx); u = idx === 0 ? u : transportaLoft(u, t); frames.push({ u, w: cross3(u, t) }); }

    // VÉRTICES — anda o cursor (a fórmula documentada acima)
    let cursor = 0;
    const info = secoes.map((s, idx) => {
      if (s.polo) {
        const id = b + cursor;
        addV(st, id, s.pos);
        cursor += 1;
        return { polo: true, id };
      }
      const fr = frames[idx];
      const ids = [];
      for (let j = 0; j < L; j++) {
        /* CONTORNO explícito (P5) usa o ponto [u,w] direto no lugar de
           cos/sin·raio — a MESMA fórmula de posição abaixo, só a origem de
           ca/sa muda; toda a estrutura de cursor/faces é cega a essa troca. */
        const [ca, sa] = s.contorno ? s.contorno[j] : [Math.cos((j / L) * Math.PI * 2) * s.raio, Math.sin((j / L) * Math.PI * 2) * s.raio];
        const id = b + cursor + j;
        addV(st, id, [s.pos[0] + fr.u[0] * ca + fr.w[0] * sa, s.pos[1] + fr.u[1] * ca + fr.w[1] * sa, s.pos[2] + fr.u[2] * ca + fr.w[2] * sa]);
        ids.push(id);
      }
      cursor += L;
      return { polo: false, ids };
    });

    // FACES — cursor de face análogo, por segmento consecutivo (i,i+1) — idêntico ao lathe
    let fCursor = 0;
    const faixas = Array.from({ length: info.length - 1 }, () => []);
    for (let idx = 0; idx < info.length - 1; idx++) {
      const A = info[idx], B = info[idx + 1];
      if (A.polo && B.polo) { grita(st, i, 'loft', idx, 'polo↔polo adjacente — seção degenerada, sem face neste segmento'); continue; }   // 0 faces, cursor não avança
      if (!A.polo && !B.polo) {
        for (let j = 0; j < L; j++) { const n = (j + 1) % L, fid = b + fCursor + j; addF(st, fid, [A.ids[j], B.ids[j], B.ids[n], A.ids[n]]); faixas[idx].push(fid); }   // anel<->anel: quads (a faixa da esfera)
      } else if (A.polo) {
        for (let j = 0; j < L; j++) { const n = (j + 1) % L, fid = b + fCursor + j; addF(st, fid, [A.id, B.ids[j], B.ids[n]]); faixas[idx].push(fid); }   // polo atrás -> anel na frente: leque SUL
      } else {
        for (let j = 0; j < L; j++) { const n = (j + 1) % L, fid = b + fCursor + j; addF(st, fid, [B.id, A.ids[n], A.ids[j]]); faixas[idx].push(fid); }   // anel atrás -> polo na frente: leque NORTE (invertido)
      }
      fCursor += L;
    }
    if (a.origemId != null) {
      registraOrigem(st, i, 'loft', a.origemId, { faixas });
    }
  },

  /* inflate — P6 do playground: DOIS contornos 2D (`contornoLado`, plano z×y;
     `contornoTopo`, plano z×x — a convenção do doc "Aba Desenho": y pra cima,
     lado é z×y, cima é z×x) viram VOLUME 3D — a interseção dos dois PRISMAS
     (extrusão do lado ao longo de X; extrusão do topo ao longo de Y). Ao
     contrário do lathe/loft (fórmula fechada: cursor soma exatamente o que
     cada seção precisa), NÃO existe fórmula fechada pro nº de vértices/faces
     de uma interseção de silhuetas arbitrárias — a numeração aqui EMERGE de
     um SCAN determinístico (o mesmo espírito não-fechado do `espelha`, que
     numera por mapa determinístico em vez de fórmula), documentado abaixo e
     travado por teste igual a tudo mais.

     MÉTODO (robusto, watertight POR CONSTRUÇÃO — o motivo de não usar CSG
     geral): GRADE DE VOXEL, não interseção exata de malha. Ponto (x,y,z) do
     centro de um voxel está DENTRO se a projeção (z,y) cai dentro do
     `contornoLado` E a projeção (z,x) cai dentro do `contornoTopo` (par-ímpar
     por varredura — o mesmo teste ponto-em-polígono do `rasterizarContorno`
     da bancada de gabarito, reimplementado local ao núcleo). Uma face só é
     emitida entre um voxel DENTRO e um vizinho FORA (ou fora da grade) — toda
     parede interna (dentro↔dentro) nunca aparece — por isso a superfície é
     SEMPRE um 2-manifold fechado, por construção topológica, não por sorte.
     LIMITAÇÃO HONESTA: o resultado é BLOCKY (facetado pelos voxels), não
     suave — a mesma classe do "lathe só reto por enquanto" (D-115): útil hoje,
     suavizar (ex. marching cubes) fica pra quando o caso real pedir.

     ARGS: `contornoLado`/`contornoTopo`: `[[a,b],...]` (≥3 pontos cada, PARAM
     via `st.num`) — a MESMA lei do `contorno` do loft (D-118): ponto com
     aridade ≠ 2 é a alça de curva RESERVADA, GRITA e ABORTA o passo inteiro
     (fail-closed, D-115). `divisoes` (TOPO, mín 2): subdivide o EIXO MAIS
     LONGO da caixa combinada em `divisoes` voxels; os outros dois eixos ganham
     a MESMA aresta de voxel (proporcional, não igual contagem) — um voxel
     cúbico, não um grid distorcido.

     CAIXA COMBINADA: `contornoLado` dá (zMinL,zMaxL,yMin,yMax);
     `contornoTopo` dá (zMinT,zMaxT,xMin,xMax); Z tem que CASAR entre os dois
     (é o mesmo eixo físico nas duas vistas) — a caixa usa a UNIÃO dos dois
     intervalos de Z. Se os contornos não têm NENHUM Z em comum na prática (ou
     não se cruzam de jeito nenhum), a grade inteira fica fora -> 0 faces ->
     GRITA e ABORTA (resultado vazio nunca é o que o autor queria — a mesma
     lei do `polo↔polo` do loft, mas aqui pro passo inteiro).

     NUMERAÇÃO (formato salvo, travada por teste): SCAN em ix,iy,iz (ordem
     fixa, aninhada); pra cada voxel DENTRO, as 6 direções de face em ORDEM
     FIXA [-x,+x,-y,+y,-z,+z]; pra cada face emitida, os 4 CANTOS da grade em
     ordem CCW vista de fora (tabela fixa abaixo). Cada CANTO ganha um id na
     PRIMEIRA vez que uma face o referencia (Map local, não fórmula) — cantos
     nunca tocados por nenhuma face NÃO ganham id (não desperdiça espaço de
     bloco). Guarda de overflow (D3): a malha é montada numa estrutura LOCAL
     (nunca toca `st.V`/`st.F`) até o scan terminar; só então os totais reais
     são comparados a `BLOCO` e, se couber, tudo é commitado de uma vez — a
     mesma disciplina "nunca constrói quase" do resto do núcleo, adaptada pra
     um caso sem fórmula fechada. Guarda de SANIDADE separada (throw, antes
     até de rodar o scan): grade com mais de 200.000 voxels — sanity contra
     `divisoes` absurdo travar a sessão, independente do bloco de ids. */
  inflate(st, a, i) {
    const b = confereId(st, i, 'inflate', a);

    const validaContorno = (pontos, nome) => {
      if (!Array.isArray(pontos) || pontos.length < 3) { grita(st, i, 'inflate', nome, `${nome} precisa de ao menos 3 pontos (tem ${Array.isArray(pontos) ? pontos.length : typeof pontos})`); return null; }
      let ruim = false;
      const out = pontos.map((pt, k) => {
        if (!Array.isArray(pt) || pt.length !== 2) { grita(st, i, 'inflate', `${nome}[${k}]`, `ponto ${k} de ${nome} precisa ser [a,b] (2 elementos); a alça de curva (3º elemento) está RESERVADA, ainda não implementada`); ruim = true; return [0, 0]; }
        return [st.num(pt[0]), st.num(pt[1])];
      });
      return ruim ? null : out;
    };
    const lado = validaContorno(a.contornoLado, 'contornoLado');
    const topo = validaContorno(a.contornoTopo, 'contornoTopo');
    if (!lado || !topo) return;   // grita já registrado por contorno inválido

    const divisoes = Math.max(2, st.num(a.divisoes ?? 8) | 0);   // TOPO: muda a CONTAGEM

    const dentroPoligono = (px, py, pontos) => {
      let dentro = false;
      for (let k = 0, j = pontos.length - 1; k < pontos.length; j = k++) {
        const [xk, yk] = pontos[k], [xj, yj] = pontos[j];
        if ((yk > py) !== (yj > py) && px < (xj - xk) * (py - yk) / (yj - yk) + xk) dentro = !dentro;
      }
      return dentro;
    };
    const bboxDe = (pontos) => { let mnA = Infinity, mxA = -Infinity, mnB = Infinity, mxB = -Infinity; for (const [pA, pB] of pontos) { if (pA < mnA) mnA = pA; if (pA > mxA) mxA = pA; if (pB < mnB) mnB = pB; if (pB > mxB) mxB = pB; } return [mnA, mxA, mnB, mxB]; };

    const [zMinL, zMaxL, yMin, yMax] = bboxDe(lado);
    const [zMinT, zMaxT, xMin, xMax] = bboxDe(topo);
    const zMin = Math.min(zMinL, zMinT), zMax = Math.max(zMaxL, zMaxT);
    const dx = xMax - xMin, dy = yMax - yMin, dz = zMax - zMin;
    const maior = Math.max(dx, dy, dz);
    if (!(maior > 0)) { grita(st, i, 'inflate', null, 'contornoLado/contornoTopo degenerados — a caixa combinada tem extensão zero em todos os eixos'); return; }
    const s = maior / divisoes;
    const nx = Math.max(1, Math.round(dx / s)), ny = Math.max(1, Math.round(dy / s)), nz = Math.max(1, Math.round(dz / s));
    if (nx * ny * nz > 200000) throw new Error(`oficina: inflate com divisoes=${divisoes} pede uma grade de ${nx}×${ny}×${nz} voxels (>200000) — sanidade de performance, independe do bloco de ids`);

    const dentroDaGrade = (ix, iy, iz) => {
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return false;
      const x = xMin + (ix + 0.5) * dx / nx, y = yMin + (iy + 0.5) * dy / ny, z = zMin + (iz + 0.5) * dz / nz;
      return dentroPoligono(z, y, lado) && dentroPoligono(z, x, topo);
    };

    /* 6 direções de face [normal] com os 4 cantos (offset 0/1 em x,y,z) EM
       ORDEM CCW vista de fora — tabela fixa, verificada por Newell no teste. */
    const FACES = [
      { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
      { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
      { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
      { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    ];

    /* MONTA LOCAL primeiro — nunca toca st.V/st.F até o overflow ser conferido
       (D3): sem fórmula fechada, só dá pra saber o total rodando o scan. */
    const cornerId = new Map();   // "cx,cy,cz" -> id LOCAL (0-based)
    const posLocal = [];          // id LOCAL -> [x,y,z]
    const facesLocais = [];       // cada uma: [id,id,id,id] em ids LOCAIS
    const cornerPos = (cx, cy, cz) => [xMin + cx * dx / nx, yMin + cy * dy / ny, zMin + cz * dz / nz];
    const getCorner = (cx, cy, cz) => {
      const k = `${cx},${cy},${cz}`;
      let id = cornerId.get(k);
      if (id === undefined) { id = posLocal.length; cornerId.set(k, id); posLocal.push(cornerPos(cx, cy, cz)); }
      return id;
    };
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
      if (!dentroDaGrade(ix, iy, iz)) continue;
      for (const face of FACES) {
        const [dxn, dyn, dzn] = face.n;
        if (dentroDaGrade(ix + dxn, iy + dyn, iz + dzn)) continue;   // vizinho dentro -> parede interna, não emite
        facesLocais.push(face.c.map(([ox, oy, oz]) => getCorner(ix + ox, iy + oy, iz + oz)));
      }
    }

    if (facesLocais.length === 0) { grita(st, i, 'inflate', null, 'contornoLado e contornoTopo não se cruzam em NENHUM voxel — volume vazio (revise as posições/tamanhos dos dois contornos)'); return; }

    const nV = posLocal.length, nF = facesLocais.length;
    if (nV > BLOCO || nF > BLOCO) throw new Error(`oficina: inflate (${nx}×${ny}×${nz} voxels) estoura o bloco de ids (${BLOCO}): ${nV} vértices / ${nF} faces`);

    // COMMIT: ids LOCAIS -> ids GLOBAIS (b + local), só agora toca st.V/st.F
    posLocal.forEach((p, id) => addV(st, b + id, p));
    facesLocais.forEach((ids, fid) => addF(st, b + fid, ids.map((id) => b + id)));
  },

  /* ---- edição por id estável ---- */
  moveV(st, a, i) {
    const v = a.v;
    if (!st.V.has(v)) return grita(st, i, 'moveV', v, 'vértice inexistente');
    const d = st.vec(a.d ?? [0, 0, 0]);
    const p = st.V.get(v);
    st.V.set(v, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);   // SEMPRE por deslocamento (acompanha a base)
  },

  /* extruda (modo face): a prova da numeração de meio-de-caminho. Cria um anel
     NOVO de vértices (base = POSIÇÃO do passo), levanta a face por `dist` na
     normal, e ergue as paredes laterais. */
  extruda(st, a, i) {
    const fid = a.face;
    const f = st.F.get(fid);
    if (!f) return grita(st, i, 'extruda', fid, 'face inexistente');
    const anel = f.vs.slice();
    for (const v of anel) if (!st.V.has(v)) return grita(st, i, 'extruda', v, 'canto da face inexistente');
    const dist = st.num(a.dist ?? 0);
    const N = normalDaFace(st.V, anel);
    const b = baseDoPasso(i);                 // vértices novos: numerados pela posição
    const novo = anel.map((v, k) => { const p = st.V.get(v); const id = b + k; addV(st, id, [p[0] + N[0] * dist, p[1] + N[1] * dist, p[2] + N[2] * dist]); return id; });
    for (let k = 0; k < anel.length; k++) { const n = (k + 1) % anel.length; addF(st, b + k, [anel[k], anel[n], novo[n], novo[k]]); } // paredes
    f.vs = novo;                              // a face-tampa sobe pro anel novo (mantém o id)
  },

  /* mescla (de:[ids] -> para:id): a interação mais delicada. Some os `de`, faz
     as faces apontarem pro `para`, colapsa cantos repetidos e apaga a face que
     virou área-zero (<3 cantos distintos). Não abre buraco no motor — o solto é
     re-gerado na exportação. `de`/`para` ficam gravados no passo. */
  mescla(st, a, i) {
    const para = a.para;
    if (!st.V.has(para)) return grita(st, i, 'mescla', para, 'destino inexistente');
    const rem = new Set();
    for (const d of a.de ?? []) {
      if (d === para) continue;
      if (!st.V.has(d)) { grita(st, i, 'mescla', d, 'origem inexistente'); continue; }
      rem.add(d);
    }
    if (!rem.size) return;
    for (const f of st.F.values()) {
      const trocado = f.vs.map((v) => (rem.has(v) ? para : v));
      f.vs = colapsaCiclo(trocado);
    }
    for (const [id, f] of [...st.F]) {
      const dist = distintos(f.vs);
      if (dist < 3) { st.F.delete(id); continue; }   // área zero (merge de cantos adjacentes): some quieto, o doc prevê
      if (dist < f.vs.length) { grita(st, i, 'mescla', id, `face ${id} ficou com canto repetido (bowtie) — removida`); st.F.delete(id); }   // D2: dup não-consecutivo -> grita + remove (lei "órfão grita, nunca corrompe")
    }
    for (const d of rem) st.V.delete(d);
    st.merges.push({ de: [...rem].sort((x, y) => x - y), para });
  },

  /* ---- P8 do playground: edição restante — moveF/moveA/vira/apagaFace/displace
     são id-estável puro (como moveV/extruda/mescla acima: nunca criam id, nunca
     renumeram); nenhuma tem numeração própria pra documentar. ---- */

  /* moveF: move TODOS os cantos de uma face pelo mesmo delta — ADITIVO
     (`p+d`), a mesma lei do moveV. Um canto COMPARTILHADO com outra face
     move JUNTO (não existe "vértice exclusivo da face" na malha — é o
     comportamento normal de mover uma face num editor: desloca a geometria,
     não desconecta nada; pra deslocar sem afetar vizinho, use `extruda`
     antes). Face inexistente GRITA (órfão), nunca corrompe. */
  moveF(st, a, i) {
    const fid = a.face;
    const f = st.F.get(fid);
    if (!f) return grita(st, i, 'moveF', fid, 'face inexistente');
    const d = st.vec(a.d ?? [0, 0, 0]);
    for (const v of new Set(f.vs)) {   // Set: um canto REPETIDO na mesma face (não deveria existir — mescla já limpa bowtie) nunca aplica o delta 2×
      const p = st.V.get(v);
      if (!p) { grita(st, i, 'moveF', v, 'canto da face inexistente'); continue; }   // defensivo — nunca deveria faltar
      st.V.set(v, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
    }
  },

  /* moveA: move as DUAS pontas de uma aresta (`a`,`b`) pelo mesmo delta —
     açúcar sobre dois moveV (mesma lei ADITIVA), como UM passo só na lista
     (uma aresta é uma ação, não duas). NÃO exige que `a`/`b` estejam de fato
     ligados por alguma face — mover dois vértices juntos nunca corrompe
     nada, então checar conectividade só atrapalharia um uso legítimo. Cada
     ponta inexistente GRITA (órfão) e é ignorada — a outra ainda move. */
  moveA(st, a, i) {
    const d = st.vec(a.d ?? [0, 0, 0]);
    for (const v of [a.a, a.b]) {
      const p = st.V.get(v);
      if (!p) { grita(st, i, 'moveA', v, 'ponta da aresta inexistente'); continue; }
      st.V.set(v, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
    }
  },

  /* vira: INVERTE o winding de uma face — reverte a ORDEM dos cantos (`f.vs`),
     o que vira a normal (Newell) pro lado oposto. Não cria nem apaga
     vértice/face, só a ORDEM. Face inexistente GRITA. Conserta uma face que
     nasceu de costas sem reconstruir o passo inteiro.

     CARACTERÍSTICA (não é bug — é a natureza de uma ferramenta cirúrgica,
     medida no teste): virar uma face que já estava CONSISTENTE com as
     vizinhas QUEBRA o pareamento de arestas do teste de manifold — a
     vizinha continua no sentido antigo, então a aresta compartilhada passa a
     andar no MESMO sentido dos dois lados em vez de opostos (medido: 4
     arestas soltas ao virar o topo já-correto de um cubo). O uso responsável
     é o oposto: consertar uma face que JÁ estava de costas (aí virar
     RESTAURA o pareamento, não quebra). `vira` não valida consistência com
     vizinhas — é uma ferramenta pontual, não uma correção automática de
     malha inteira. */
  vira(st, a, i) {
    const fid = a.face;
    const f = st.F.get(fid);
    if (!f) return grita(st, i, 'vira', fid, 'face inexistente');
    f.vs = f.vs.slice().reverse();
  },

  /* apagaFace: remove uma face de `st.F`. Os VÉRTICES dela continuam
     existindo (podem estar em uso por outra face, ou não — um vértice sem
     face nenhuma não é erro, é normal ao abrir um buraco de propósito: porta,
     janela, ou preparo pra composição manual). Face inexistente GRITA. */
  apagaFace(st, a, i) {
    const fid = a.face;
    if (!st.F.has(fid)) return grita(st, i, 'apagaFace', fid, 'face inexistente');
    st.F.delete(fid);
  },

  /* displace — P8c do playground: desloca uma SELEÇÃO de vértices ao longo da própria
     NORMAL (a média das normais de Newell — `normalDaFace` — de TODAS as faces ATUAIS
     que tocam aquele vértice, medida ANTES de mover qualquer um, como o centroide do
     `rotaciona`) por uma distância de RUÍDO 3D seedado (`ruido3`, acima) amostrado na
     posição do vértice × `frequencia`. Determinístico: a mesma peça com o mesmo
     `semente` sempre desloca pro MESMO lugar (a razão de existir uma semente — sem
     ela não daria pra reproduzir a peça salva, a mesma lei do resto do formato).

     SELEÇÃO (`sel`, opcional, via `resolverAlvosV` — P8): AUSENTE = malha inteira,
     como o `rotaciona`. `amplitude` (padrão 0,1) é o desvio MÁXIMO (mundo); `ruido3`
     devolve [0,1), remapeado pra [−amplitude,+amplitude] antes de multiplicar a
     normal. `frequencia` (padrão 1) escala a posição ANTES de amostrar o ruído — mais
     alta = relevo mais fino (as células do reticulado do ruído cabem mais vezes no
     mesmo espaço); não passa por validação própria (qualquer finito serve, `st.num`
     já barra o resto). Vértice SEM NENHUMA face (ex.: sobrou solto de um `apagaFace`)
     não tem normal pra seguir — GRITA (órfão) e fica no lugar, nunca desloca às
     cegas. Amplitude 0 é no-op determinístico (desvio sempre 0, mas ainda soma —
     não é atalho, só o resultado natural da fórmula). */
  displace(st, a, i) {
    const alvos = resolverAlvosV(st, a.sel, 'displace', i);
    if (!alvos.size) return;
    const amplitude = st.num(a.amplitude ?? 0.1);
    const frequencia = st.num(a.frequencia ?? 1);
    const semente = st.num(a.semente ?? 0);

    // normal média por vértice: soma as normais (Newell) de TODAS as faces atuais que
    // tocam cada vértice — UMA passada sobre st.F, medida antes de mover qualquer coisa
    const somaN = new Map();   // vid -> [nx,ny,nz,contagem]
    for (const f of st.F.values()) {
      const n = normalDaFace(st.V, f.vs);
      for (const v of f.vs) {
        let acc = somaN.get(v);
        if (!acc) { acc = [0, 0, 0, 0]; somaN.set(v, acc); }
        acc[0] += n[0]; acc[1] += n[1]; acc[2] += n[2]; acc[3]++;
      }
    }

    for (const v of alvos) {
      const p = st.V.get(v);
      if (!p) continue;   // defensivo (nunca deveria faltar — veio de st.V.keys() ou de um canto de face já validado)
      const acc = somaN.get(v);
      if (!acc || !acc[3]) { grita(st, i, 'displace', v, 'vértice sem face nenhuma — sem normal pra seguir (apagaFace deixou solto?)'); continue; }
      const nrm = norm3(acc[0], acc[1], acc[2]);
      const r = ruido3(p[0] * frequencia, p[1] * frequencia, p[2] * frequencia, semente);   // [0,1)
      const d = (r * 2 - 1) * amplitude;   // remapeia pra [-amplitude, +amplitude]
      st.V.set(v, [p[0] + nrm[0] * d, p[1] + nrm[1] * d, p[2] + nrm[2] * d]);
    }
  },

  /* ---- P3 do playground: espelha + rotaciona — as duas transformam uma SELEÇÃO,
     mas de jeitos opostos (docs/playground.md): `rotaciona` é SIMPLES (só move
     posição, nunca cria id); `espelha` é MEATY (duplica a seleção refletida,
     ids NOVOS — formato salvo). Juntas destravam objeto bilateral (metade
     modelada + espelho vira o todo; uma parte pode nascer torta/rodada). ---- */

  /* transladar — SOMA um deslocamento `d` a uma SELEÇÃO. O IRMÃO EXATO do
     `rotaciona` abaixo: mesma semântica de seleção, mesma promessa de só mexer
     em POSIÇÃO (`st.V.set` in-place) — NUNCA cria vértice/face, NUNCA renumera,
     NÃO consome o bloco de ids do passo. Determinístico (só soma).

     POR QUE ELA EXISTE (D-128, o achado do experimento do TETO — docs/TETO.md):
     o vocabulário sabia GIRAR a malha inteira (`rotaciona` com `sel` ausente)
     mas não sabia TRANSLADAR nada maior que UMA face — `moveV` move 1 vértice,
     `moveF` 1 face, `moveA` 1 aresta. E das 9 primitivas, 7 nascem PRESAS à
     origem (`cubo`/`cilindro`/`esfera`/`cone`/`plano`/`chamferBox` centrados com
     a base em y=0; `lathe` sempre em torno de Y) — nenhuma aceita posição. Sem
     esta op, pôr um cilindro fora da origem custava um `moveV` POR VÉRTICE (32+
     passos pra uma roda de `lados:16`), então compor com primitiva era
     proibitivo na prática: a moto do TETO usou 7 das 25 ops e virou tudo `loft`,
     o único gerador que aceita `pos` por seção. Esta op devolve as outras 7 ao
     vocabulário — é a assimetria que faltava fechar, não uma conveniência.

     SELEÇÃO (`sel`, opcional, via `resolverAlvosV` — P8 do playground): AUSENTE
     = a malha INTEIRA (todos os vértices atuais de `st.V`) — é ESTE o caso que
     posiciona uma primitiva recém-criada. Presente = `{v:[ids]}` e/ou
     `{f:[ids]}` (cantos da face) e/ou `{regiao:{min,max}}` e/ou
     `{grupo:'nome'}` (as faces daquele `f.parte`) — os campos presentes se
     UNEM, DEDUPLICADOS num Set. Referência inválida GRITA (órfão) e é ignorada
     — nunca corrompe (lei do envelope). Seleção vazia é no-op determinístico.

     DESLOCAMENTO (`d`, `[x,y,z]`, via `st.vec` — pode citar PARAM, como todo
     ponto dimensional): `p' = p + d`, ADITIVO como o `moveV` (acompanha a base
     — mexer no PARAM remodela sem tocar em passo nenhum). Ausente = `[0,0,0]`,
     que é no-op silencioso, a mesma lei do `moveV`/`moveF`/`moveA`. Não tem
     PIVÔ de propósito: translação não depende de pivô. */
  transladar(st, a, i) {
    const d = st.vec(a.d ?? [0, 0, 0]);

    // seleção -> conjunto de ids de vértice afetados (AUSENTE = malha inteira) — o MESMO resolverAlvosV do rotaciona
    const alvos = resolverAlvosV(st, a.sel, 'transladar', i);
    if (!alvos.size) return;   // nada pra mover (seleção vazia, ou só ids órfãos) — no-op determinístico

    for (const v of alvos) {
      const p = st.V.get(v);
      if (!p) continue;   // defensivo (nunca deveria faltar — veio de st.V.keys() ou de um canto de face já validado)
      st.V.set(v, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);   // in-place — NUNCA cria vértice novo
    }
  },

  /* rotaciona — gira uma SELEÇÃO em torno de um EIXO (x/y/z) por `graus`, ao
     redor de um PIVÔ. SIMPLES: só desloca as posições dos vértices AFETADOS
     (`st.V.set` in-place) — NUNCA cria vértice/face nem renumera, o oposto do
     `espelha` abaixo. Determinístico (seno/cosseno de sempre, sem aleatório).

     SELEÇÃO (`sel`, opcional, via `resolverAlvosV` — P8 do playground):
     AUSENTE = a malha INTEIRA (todos os vértices atuais de `st.V`). Presente
     = `{v:[ids]}` e/ou `{f:[ids]}` (cantos da face) e/ou `{regiao:{min,max}}`
     (caixa delimitadora) e/ou `{grupo:'nome'}` (as faces daquele `f.parte`) —
     os campos presentes se UNEM, DEDUPLICADOS num Set. Referência inválida
     (vértice/face/grupo) GRITA (órfão) e é ignorada — nunca corrompe (lei do
     envelope).

     PIVÔ (`pivo`, opcional `[x,y,z]`, via `st.vec` — pode citar PARAM):
     AUSENTE = o CENTROIDE dos vértices AFETADOS (a média das posições, medida
     ANTES de girar — o mesmo default que a op `parte` usa pro pivô de
     animação). Seleção vazia (nenhum vértice afetado) é no-op determinístico
     (nada pra girar).

     ROTAÇÃO (formato salvo, travada por teste): pra cada vértice afetado,
     `p' = pivo + R_eixo(graus)·(p − pivo)`, com R_eixo a rotação padrão
     right-handed em torno do eixo — a MESMA convenção das matrizes de
     animação `mRotX/mRotY/mRotZ` já existentes neste arquivo (graus
     convertidos pra radiano), aplicada direto (sem montar matriz 4x4, x/y/z
     abaixo já são o vetor RELATIVO ao pivô, p−pivo):
       eixo 'x': y' = y·cosθ − z·senθ ;  z' = y·senθ + z·cosθ
       eixo 'y': x' = x·cosθ + z·senθ ;  z' = −x·senθ + z·cosθ
       eixo 'z': x' = x·cosθ − y·senθ ;  y' = x·senθ + y·cosθ
     `graus`/`pivo` passam por `st.num`/`st.vec` (aceitam nome de PARAM, como
     as outras ops dimensionais). Eixo desconhecido GRITA (não é erro
     estrutural de bloco — é valor de argumento, como o `modo` do pincel). */
  rotaciona(st, a, i) {
    const eixo = a.eixo;
    if (eixo !== 'x' && eixo !== 'y' && eixo !== 'z') return grita(st, i, 'rotaciona', eixo, `eixo '${eixo}' desconhecido (só 'x'/'y'/'z')`);
    const graus = st.num(a.graus ?? 0);

    // seleção -> conjunto de ids de vértice afetados (AUSENTE = malha inteira) — resolverAlvosV, P8
    const alvos = resolverAlvosV(st, a.sel, 'rotaciona', i);
    if (!alvos.size) return;   // nada pra girar (seleção vazia, ou só ids órfãos) — no-op determinístico

    // pivô: explícito (st.vec — pode citar PARAM) OU o centroide dos afetados, medido ANTES de girar
    let pivo;
    if (a.pivo != null) pivo = st.vec(a.pivo);
    else {
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const v of alvos) { const p = st.V.get(v); if (!p) continue; cx += p[0]; cy += p[1]; cz += p[2]; n++; }
      pivo = n ? [cx / n, cy / n, cz / n] : [0, 0, 0];
    }

    const rad = (graus * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    for (const v of alvos) {
      const p = st.V.get(v);
      if (!p) continue;   // defensivo (nunca deveria faltar — veio de st.V.keys() ou de um canto de face já validado)
      const dx = p[0] - pivo[0], dy = p[1] - pivo[1], dz = p[2] - pivo[2];
      let rx = dx, ry = dy, rz = dz;
      if (eixo === 'x') { ry = dy * c - dz * s; rz = dy * s + dz * c; }
      else if (eixo === 'y') { rx = dx * c + dz * s; rz = -dx * s + dz * c; }
      else { rx = dx * c - dy * s; ry = dx * s + dy * c; }
      st.V.set(v, [pivo[0] + rx, pivo[1] + ry, pivo[2] + rz]);   // in-place — NUNCA cria vértice novo
    }
  },

  /* espelha — DUPLICA uma seleção de FACES espelhada num plano perpendicular a
     `eixo` (a coordenada NEGADA) na posição `pos` — o jeito de modelar só
     METADE de um objeto bilateral e completar o resto. MEATY: ao contrário do
     `rotaciona` acima, CRIA vértices/faces NOVOS (ids do BLOCO do passo) — é
     FORMATO SALVO, travado por teste.

     SELEÇÃO (`sel`, opcional): AUSENTE = TODAS as faces atuais (`st.F`).
     Presente usa a semântica uniforme de `resolverSelecao`: `f`/`grupo`
     apontam faces; `v` pega as faces que tocam algum vértice; `regiao` pega
     só as faces inteiramente dentro da caixa. Espelhar continua operando em
     CICLOS de face (os cantos vêm junto para reverter o winding). A forma
     antiga `sel:{f:[ids]}` permanece byte-idêntica.

     REFLEXÃO: só a coordenada do EIXO muda — `coord' = 2·pos − coord` (as
     outras duas ficam intactas). `pos` (default 0) passa por `st.num` (pode
     citar PARAM, como as outras ops dimensionais).

     WELD — decisão fixa, IRREVERSÍVEL (formato salvo): um vértice cuja
     coordenada no eixo é EXATAMENTE `pos` (a reflexão dele == ele mesmo) é
     COMPARTILHADO — a face espelhada reusa o id ORIGINAL, sem copiar. Solda
     a costura sozinho pra quem modela a metade com a borda encostada no
     plano (o MESMO truque do polo `raio===0` do `lathe`: teste de igualdade
     EXATA, não uma tolerância). Vértice fora do plano ganha uma CÓPIA com id
     NOVO. Um vértice QUASE-no-plano (ruído de ponto-flutuante) NÃO solda —
     vira um par coincidente-mas-distinto; pra soldar de propósito, ponha a
     borda em `pos` LITERAL na malha original, ou solde depois com `mescla`.
     (Idem: um vértice FORA do plano cuja reflexão cai EXATAMENTE sobre um
     vértice EXISTENTE não-afetado ganha CÓPIA nova — o weld só olha o plano,
     não faz merge geral; solde com `mescla` se quiser.)

     NUMERAÇÃO DE VÉRTICE (formato salvo, travada por teste): reúne os
     vértices AFETADOS (os cantos de TODAS as faces da seleção, cada id
     DEDUPLICADO uma vez) e ordena por id ORIGINAL crescente; anda um cursor
     de vértice que começa em 0: vértice NO plano -> mapeia pra SI MESMO
     (soldado, não consome id novo); vértice FORA -> mapeia pra `b+cursor`
     (b = baseDoPasso(i)) e o cursor avança 1.

     NUMERAÇÃO DE FACE (formato salvo, travada por teste): as faces da
     seleção, em ORDEM CRESCENTE de id ORIGINAL, cada uma vira UMA face nova
     — um cursor de face PRÓPRIO que começa em 0 (`b+cursor`, cursor avança 1
     por face) — com os CANTOS = mapa(cantos originais) em ordem REVERTIDA.
     Reverter desfaz a troca de mão que a reflexão introduz (um espelho troca
     o sentido de giro visto de fora), mantendo a normal pra FORA — o mesmo
     raciocínio da tampa de cima invertida do cilindro (D1; provado por
     Newell no teste). Atributos (cor/liso/material/parte/solido) são
     HERDADOS do original — só `vs` muda. (A tinta do pincel macio, se
     houver, NÃO é copiada — fica de fora da herança por ora, documentado
     aqui pra não virar surpresa silenciosa se um dia importar.)

     Guarda de overflow (D3, por-passo, calculada ANTES de inserir qualquer
     vértice/face): vértices NOVOS (só os NÃO-soldados contam) ≤ BLOCO e
     faces NOVAS ≤ BLOCO. Eixo desconhecido GRITA (valor de argumento, como o
     `modo` do pincel — não é erro estrutural de bloco). */
  espelha(st, a, i) {
    const eixo = a.eixo;
    const ax = eixo === 'x' ? 0 : eixo === 'y' ? 1 : eixo === 'z' ? 2 : -1;
    if (ax < 0) return grita(st, i, 'espelha', eixo, `eixo '${eixo}' desconhecido (só 'x'/'y'/'z')`);
    const pos = st.num(a.pos ?? 0);
    const b = baseDoPasso(i);

    // seleção uniforme de faces (AUSENTE = todas); dedup + ordem original crescente
    const faceIds = [...resolverAlvosF(st, a, 'espelha', i, { todasQuandoAusente: true })].sort((x, y) => x - y);
    if (!faceIds.length) return;

    // vértices afetados (cantos das faces selecionadas), deduplicados, ordem de id ORIGINAL crescente
    const afetados = new Set();
    for (const fid of faceIds) for (const v of st.F.get(fid).vs) afetados.add(v);
    const vertsOrdenados = [...afetados].sort((x, y) => x - y);

    // guarda de overflow (D3): conta ANTES de inserir — só vértice NÃO-soldado consome id novo
    let nVNovos = 0;
    for (const v of vertsOrdenados) { const p = st.V.get(v); if (p && p[ax] !== pos) nVNovos++; }
    if (nVNovos > BLOCO || faceIds.length > BLOCO) throw new Error(`oficina: espelha estoura o bloco de ids (${BLOCO}): ${nVNovos} vértice(s) novo(s) / ${faceIds.length} face(s) nova(s)`);

    // mapa orig -> espelho (soldado = mapeia pra si mesmo; fora = novo id do bloco, em ordem)
    const mapa = new Map();
    let cursorV = 0;
    for (const v of vertsOrdenados) {
      const p = st.V.get(v);
      if (!p) { mapa.set(v, v); continue; }              // defensivo (canto sem posição — nunca corrompe)
      if (p[ax] === pos) { mapa.set(v, v); continue; }   // NO plano: soldado, sem id novo
      const q = p.slice(); q[ax] = 2 * pos - p[ax];
      const novo = b + cursorV; cursorV++;
      addV(st, novo, q);
      mapa.set(v, novo);
    }

    // faces novas: cursor de face PRÓPRIO, cantos revertidos (desfaz a troca de mão do espelho)
    let cursorF = 0;
    for (const fid of faceIds) {
      const f = st.F.get(fid);
      // face INTEIRAMENTE no plano (TODOS os cantos soldados): a espelhada teria os MESMOS cantos
      // revertidos = uma face COINCIDENTE de normal OPOSTA no mesmo lugar (z-fight; e o teste de
      // manifold é CEGO a ela — as arestas se pareiam). GRITA e PULA (0 face, cursor NÃO avança),
      // o mesmo tratamento do `polo↔polo` degenerado do lathe.
      if (f.vs.every((v) => mapa.get(v) === v)) { grita(st, i, 'espelha', fid, 'face inteiramente no plano do espelho — degenerado (a espelhada seria coincidente), pulada'); continue; }
      const vs = f.vs.map((v) => mapa.get(v)).reverse();
      const novo = b + cursorF; cursorF++;
      addF(st, novo, vs);
      const nf = st.F.get(novo);
      nf.cor = f.cor; nf.material = f.material; nf.parte = f.parte; nf.liso = f.liso; nf.solido = f.solido;
    }
  },

  /* ---- atributos por face ---- */
  pincel(st, a, i) {
    const modo = a.modo ?? 'face';
    if (modo === 'face') {   // passo 9: preenche faces INTEIRAS de uma cor chapada (f.cor).
      for (const fid of resolverAlvosF(st, a, 'pincel', i)) st.F.get(fid).cor = a.cor ?? null;
      return;
    }
    if (modo === 'livre') {
      /* passo 11b — PINCEL MACIO: cada ponto é um DAB (pincelada radial) numa FACE,
         ancorado à posição FACE-LOCAL {a,b} — as coords s,t da projeção do atlas em
         [0,1] (`s=(p[pa]-aMin)/aSpan`), NÃO um texel cru. É isso que faz a tinta
         ACOMPANHAR a face: mover um vértice depois muda a projeção/o UV, mas o dab
         segue no mesmo {a,b} (não desliza pra outro texel). `raio`/`dureza` são do
         pincel (a mesma pincelada) — gravados POR dab pra a face ficar auto-contida e
         o replay ser determinístico. Ordem de `pontos`/dos pushes = ordem de PINTURA
         (o rasterizador compõe mais nova por cima). Ponto com face inexistente GRITA
         (órfão), nunca corrompe (lei do envelope). */
      if (a.sel != null || a.faces != null) return grita(st, i, 'pincel', 'seleção', "modo 'livre' usa pontos:[{f,a,b}], não faces/sel");
      const cor = a.cor ?? null, raio = st.num(a.raio ?? 0), dureza = st.num(a.dureza ?? 0);
      for (const pt of a.pontos ?? []) {
        const f = st.F.get(pt.f);
        if (!f) { grita(st, i, 'pincel', pt.f, 'face inexistente'); continue; }
        f.tinta.push({ a: st.num(pt.a ?? 0), b: st.num(pt.b ?? 0), cor, raio, dureza });
      }
      return;
    }
    return grita(st, i, 'pincel', modo, `modo '${modo}' desconhecido (só 'face' e 'livre')`);
  },
  solido(st, a, i) { for (const fid of resolverAlvosF(st, a, 'solido', i)) st.F.get(fid).solido = true; },
  liso(st, a, i) { for (const fid of resolverAlvosF(st, a, 'liso', i)) st.F.get(fid).liso = true; },

  /* material (passo 12a): seta f.material = NOME de um material DECLARADO em
     MATERIAIS (a peça-nível, como PARAMS/TOPO). Só o NOME entra na face — mudar o
     material muda TODAS as faces dele de uma vez (um dono só, a regra do doc); os
     params (cor/emissivo/aspereza/semLuz/contorno) o adaptarV3 resolve em MATERIAIS
     e o render aplica POR LOTE (padrão do uRim). Grita se `usa` não é um material
     declarado, ou se a face não existe — nunca corrompe (lei do envelope). Face SEM
     material segue idêntica (o lote PADRÃO no-op). `hasOwn` (não `in`) pra um nome
     como 'toString' não passar pela cadeia de protótipos. */
  material(st, a, i) {
    const usa = a.usa;
    if (!Object.hasOwn(st.materiais, usa)) return grita(st, i, 'material', usa, `material '${usa}' não existe em MATERIAIS`);
    for (const fid of resolverAlvosF(st, a, 'material', i)) st.F.get(fid).material = usa;
  },

  /* parte (passo 13a): dá NOME a um conjunto de faces (`f.parte = nome`) — é o ALVO
     que a ANIMAÇÃO (e no futuro o material) usam pra mover/deformar aquele pedaço
     como peça sólida. Registra a parte no neutro (`st.partes[nome] = {pivo}`): `pivo`
     (opcional `[x,y,z]`) é o ponto em torno do qual ela gira/escala — dimensional
     (passa por `st.vec`, então pode citar um PARAM, como os outros pontos); AUSENTE,
     o adaptarV3 usa o CENTROIDE da parte como default. Identidade posicional: face
     inexistente GRITA (órfão), como as outras ops — nunca corrompe (lei do envelope).
     Uma face pertence a NO MÁXIMO uma parte: reatribuir sobrescreve `f.parte` — ÚLTIMA
     VENCE (o último `parte` que cita a face manda). `neutroCanonico` anexa `f.parte`
     (replay determinístico); o pivô é metadado de animação, não muda a MALHA. */
  parte(st, a, i) {
    const nome = a.nome;
    const alvos = resolverAlvosF(st, a, 'parte', i);
    if (!alvos.size) return;
    st.partes[nome] = { pivo: a.pivo != null ? st.vec(a.pivo) : null };   // registro nome->{pivo}; pivo null => centroide (no adaptador)
    for (const fid of alvos) st.F.get(fid).parte = nome;   // última atribuição vence
  },

  /* pesar (passo 14a): soma `peso` de influência do OSSO aos VÉRTICES dados (`vs`)
     ou aos vértices das `faces`. Ops `pesar` ACUMULAM por (vértice, osso) — o
     adaptarV3 depois NORMALIZA (somam 1) e mantém as TOP-N (N=4) influências. O
     peso viaja com o ID do vértice (V): toda cópia dele no mesh loose herda o
     mesmo índice+peso. Identidade posicional (lei do envelope): osso fora do
     ESQUELETO GRITA (órfão), vértice/face inexistente GRITA (órfão) — nunca
     corrompe. Vértice SEM peso nenhum fica preso à IDENTIDADE (bind pose, não
     deforma) — o default seguro, resolvido no shader. `neutroCanonico` anexa o
     peso do vértice (replay determinístico); vértice sem peso => canon intacta. */
  pesar(st, a, i) {
    const osso = a.osso;
    if (!st.ossoSet || !st.ossoSet.has(osso)) return grita(st, i, 'pesar', osso, st.ossoSet ? `osso '${osso}' não existe em ESQUELETO` : 'peça sem ESQUELETO (nenhum osso pra pesar)');
    const peso = st.num(a.peso ?? 0);
    const alvos = new Set();
    for (const v of a.vs ?? []) { if (!st.V.has(v)) { grita(st, i, 'pesar', v, 'vértice inexistente'); continue; } alvos.add(v); }
    for (const fid of a.faces ?? []) { const f = st.F.get(fid); if (!f) { grita(st, i, 'pesar', fid, 'face inexistente'); continue; } for (const v of f.vs) if (st.V.has(v)) alvos.add(v); }
    for (const v of alvos) { let m = st.pesos.get(v); if (!m) { m = new Map(); st.pesos.set(v, m); } m.set(osso, (m.get(osso) || 0) + peso); }   // ACUMULA por (vértice, osso)
  },
};

/* ----------------------------------------------------------------------------
   NÚCLEO: roda a lista e devolve o NEUTRO em números. Não sabe desenhar.
   `dict` funde PARAMS e TOPO — os passos citam o NOME (raio: 'troncoR'), então
   trocar o valor reconstrói sem tocar em número nenhum da lista.
---------------------------------------------------------------------------- */
export function nucleo(PASSOS, PARAMS = {}, TOPO = {}, MATERIAIS = {}, ESQUELETO = null, ALIASES = []) {
  const dict = { ...PARAMS, ...TOPO };
  const num = (v) => {
    /* NaN/Infinity é LIXO, não número — e sem esta guarda vazava por TODA op
       (achado adversarial do P4). Dois estragos, o segundo pior:
       (a) num DIMENSIONAL vira coordenada NaN na malha com 0 órfãos (o
           `lint-de-malha` do auditar ainda pega a jusante, mas sem dizer QUAL
           passo errou);
       (b) num TOPO degrada CALADO e NENHUM gate pega: `lados: NaN` -> `NaN|0`
           = 0 -> `Math.max(3, 0)` = 3, então um cilindro de V=16/F=10 vira
           V=6/F=5 com malha LIMPA — a peça salva muda de CONTAGEM (e todo id
           de face dos passos seguintes passa a apontar pra outra face) sem
           nada reclamar. Mesma classe do fail-open do D-115.
       Throw (não grita) porque é a lei que o `num` já aplica pro resto do
       lixo: valor que não é número não constrói "quase". */
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error(`oficina: valor numérico não-finito: ${v}`);
      return v;
    }
    if (typeof v === 'string') { if (!(v in dict)) throw new Error(`oficina: parâmetro '${v}' não existe em PARAMS/TOPO`); return num(dict[v]); }
    throw new Error(`oficina: valor numérico inválido: ${JSON.stringify(v)}`);
  };
  /* ponto 3D SEMPRE: sem a guarda de aridade, `[0,1]` passava e o z virava
     `undefined` -> NaN calado; não-array estourava `a.map is not a function`
     (throw cru, sem diagnóstico). Rede CENTRAL — a op ainda valida por conta
     pra GRITAR dizendo QUAL seção/ponto errou (a lei do lathe, D-115). */
  const vec = (a) => {
    if (!Array.isArray(a) || a.length !== 3) throw new Error(`oficina: ponto precisa ser [x,y,z] (3 elementos); recebido ${JSON.stringify(a)}`);
    return a.map(num);
  };
  /* materiais: o dicionário POR NOME (a peça declara em MATERIAIS) que a op
     `material` valida contra e o adaptarV3 lê pra montar os params por lote. Como
     PARAMS/TOPO, é dado da peça — o padrão {} deixa toda peça sem material intacta. */
  /* partes (13a): registro nome->{pivo} que a op `parte` preenche e o adaptarV3
     lê pra resolver o pivô (explícito) ou cair no centroide da parte. */
  /* ESQUELETO (14a): resolvido+validado ANTES dos passos (o `pesar` valida `osso`
     contra `ossoSet`). Ausente (o caso de 1..13 e do jogo) => esqueleto null,
     pesos vazio -> canon e mesh byte-idênticos ao de antes (compat inegociável). */
  const esqueleto = ESQUELETO ? resolverEsqueleto(ESQUELETO, vec) : null;
  const ossoSet = esqueleto ? new Set(esqueleto.ossos.map((o) => o.nome)) : null;
  const aliases = new Map();
  /* Fase 2: ALIASES entra antes dos PASSOS para que uma definição malformada
     nunca deixe a peça executar parcialmente. Cada termo usa o contrato local
     do gerador, sem IDs globais escondidos. */
  if (!Array.isArray(ALIASES)) throw new Error('oficina: ALIASES precisa ser uma lista');
  for (const ent of ALIASES) {
    if (!Array.isArray(ent) || ent.length !== 2 || typeof ent[0] !== 'string' || !ent[0]) throw new Error('oficina: alias inválido');
    if (aliases.has(ent[0])) throw new Error(`oficina: alias duplicado '${ent[0]}'`);
    const direto = (x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && origemFormatoValido(x.origem);
    const composto = ent[1] && typeof ent[1] === 'object' && !Array.isArray(ent[1]) && Object.keys(ent[1]).length === 1 && Array.isArray(ent[1].unir) && ent[1].unir.length && ent[1].unir.every(direto);
    if (!direto(ent[1]) && !composto) throw new Error(`oficina: alias '${ent[0]}' inválido: só origem ou unir de origens`);
    aliases.set(ent[0], ent[1]);
  }
  const st = { V: new Map(), F: new Map(), orfaos: [], merges: [], partes: {}, origens: new Map(), aliases, num, vec, materiais: MATERIAIS, esqueleto, ossoSet, pesos: new Map() };

  PASSOS.forEach((passo, i) => {
    const [op, args = {}] = passo;
    const fn = OPS[op];
    if (!fn) { grita(st, i, op, null, `operação desconhecida '${op}'`); return; }
    fn(st, args, i);
  });

  return { V: st.V, F: st.F, orfaos: st.orfaos, merges: st.merges, partes: st.partes, esqueleto: st.esqueleto, pesos: st.pesos };
}

/* forma canônica e ORDENADA do neutro — a base de toda comparação (replay da
   bancada, testes de determinismo). Ids crescentes; posições e atributos
   explícitos. JSON dela ida-e-volta é idêntico bit-a-bit quando o objeto é o
   mesmo. */
export function neutroCanonico(neutro) {
  const pesos = neutro.pesos;   // 14a: Map(vid -> Map(osso -> peso ACUMULADO)); ausente/vazio => nada muda
  return {
    /* V ganha uma CAUDA opcional (o peso do vértice) só quando ele TEM peso — o
       mesmo padrão do tinta/parte na F. Vértice sem peso => linha [id,x,y,z] de 4,
       BYTE-idêntica ao de antes (peças/testes de 1..13 e o toco não mudam de canon).
       O peso viaja na canon como pares [osso,peso] ORDENADOS por nome do osso
       (determinístico e independente da ordem do ESQUELETO); é o peso CRU acumulado
       (o efeito do replay das ops `pesar`), não o normalizado (isso é do adaptador). */
    V: [...neutro.V.entries()].sort((a, b) => a[0] - b[0]).map(([id, p]) => {
      const row = [id, p[0], p[1], p[2]];
      const pw = pesos && pesos.get(id);
      if (pw && pw.size) row.push([...pw.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)));
      return row;
    }),
    F: [...neutro.F.values()].sort((a, b) => a.id - b.id).map((f) => {
      const row = [f.id, f.vs.slice(), f.cor ?? null, f.material ?? null, !!f.liso, !!f.solido];
      /* tinta (pincel macio, 11b): só entra quando a face TEM dab. Assim toda peça
         sem pincel livre (o passo 1..11a inteiro, incl. o toco) canoniza BYTE-idêntico
         ao de antes — a compat pra trás é inegociável. Forma fixa [a,b,cor,raio,dureza]
         por dab, na ordem de pintura, pra o JSON ir-e-voltar igual (determinismo). */
      if (f.tinta && f.tinta.length) row.push(f.tinta.map((t) => [t.a, t.b, t.cor ?? null, t.raio, t.dureza]));
      /* parte (13a): mesmo padrão do tinta — só anexa quando a face TEM parte. Face
         SEM parte => linha byte-idêntica ao de antes (peças/testes de 1..12b não mudam
         de canon). Vem DEPOIS do tinta (o outro opcional-de-cauda): tinta é array, parte
         é string — tipos disjuntos, sem ambiguidade. É f.parte (o nome) que entra na
         canon do replay; o pivô é metadado de animação, não muda a MALHA. */
      if (f.parte) row.push(f.parte);
      return row;
    }),
    orfaos: neutro.orfaos.map((o) => ({ passo: o.passo, op: o.op, ref: o.ref ?? null, motivo: o.motivo })),
    merges: neutro.merges.map((m) => ({ de: m.de.slice(), para: m.para })),
  };
}

/* ----------------------------------------------------------------------------
   ADAPTADOR v3: neutro -> formato do motor. É a ÚNICA peça que muda de mundo
   pra mundo (outro motor = outro adaptador). Monta os triângulos soltos (pos3
   uv2 nrm3), e a cor por face chega via TEXTURA + UV — o formato de vértice
   ainda não tem cor (reservada no passo 0), então NÃO se inventa atributo de
   cor no vértice. Chapado por padrão (normal por face); face `liso` usa a média
   das normais das faces lisas vizinhas.

   PASSO 11a — a FUNDAÇÃO da textura pintável: o antigo SWATCH (uma fita de cores
   distintas, faces da mesma cor compartilhando UM texel) vira um ATLAS POR FACE.
   Cada face ganha uma ILHA própria num quadriculado ~quadrado (N faces ->
   cols=ceil(√N)); o UV de cada canto sai por PROJEÇÃO EM CAIXA *daquela* face (o
   eixo dominante da normal manda; projeta as OUTRAS duas coordenadas de mundo —
   a "caixa" do doc, docs/oficina.md "Pintura: projeção em caixa desde o começo")
   normalizada pela bbox 2D da face e mapeada pro retângulo interno da ilha. Como
   nenhuma cor é compartilhada, o furo da projeção em caixa GLOBAL some: topo (+y)
   e fundo (-y) de um cilindro — que na caixa global empilhariam no MESMO pedaço
   da textura (ambos projetam em XZ) — caem em ilhas DISTINTAS. Pintar um não
   pinta o outro: é a base sem-sobreposição que o pincel macio (passo 11b) exige.
   Em 11a o conteúdo é cor CHAPADA: a ilha inteira é a cor da face, então a face
   renderiza IGUAL ao swatch de hoje (mesmo pixel na tela; provado por medição).
   O mapa por face (retângulo da ilha + a projeção) sai ANEXADO em `atlas` pro
   11b converter superfície (face + ponto de mundo) -> texel e pintar. */
const COR_PADRAO = '#9a8f80';   // madeira neutra pra face sem pincel
function hexRGB(h) {
  const s = String(h).replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
}

/* atlas: tamanho da ILHA (bloco de texels por face) e do GUTTER (borda de folga
   entre ilhas). O motor amostra em NEAREST — não há sangramento por
   interpolação —, então o gutter é MARGEM: mantém todo UV a >= GUTTER texels da
   borda da célula (nenhum canto encosta na vizinha) e sobra a moldura pro pincel
   do 11b dilatar a cor pra fora sem vazar. Ilha chapada em 11a => a moldura é a
   própria cor da face. */
const ATLAS_TILE = 32, ATLAS_GUTTER = 2;

/* eixo dominante da normal (0=x, 1=y, 2=z: o maior |componente|) e os DOIS eixos
   de projeção — os outros dois, em ordem crescente. É a "caixa" do doc, privada
   por face: normal pra cima (y) projeta em (x,z); pro lado (x) em (y,z); pra
   frente (z) em (x,y). */
function eixoDominante(n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= az) return 1;
  return 2;
}
const OUTROS_EIXOS = [[1, 2], [0, 2], [0, 1]];   // eixos de projeção por eixo dominante

export function adaptarV3(neutro, ctx, MATERIAIS = {}) {
  const { V, F } = neutro;
  const faces = [...F.values()].sort((a, b) => a.id - b.id);

  /* normais: por face (chapado) e, pra `liso`, média por vértice das faces
     lisas que o tocam. (Intocado do swatch — o 11a só troca a textura+UV.) */
  const nFace = new Map();
  for (const f of faces) nFace.set(f.id, normalDaFace(V, f.vs));
  const acc = new Map();
  for (const f of faces) if (f.liso) { const n = nFace.get(f.id); for (const v of f.vs) { const s = acc.get(v) || [0, 0, 0]; acc.set(v, [s[0] + n[0], s[1] + n[1], s[2] + n[2]]); } }
  const nSuave = new Map();
  for (const [v, s] of acc) nSuave.set(v, norm3(s[0], s[1], s[2]));

  /* GRADE de ilhas: uma por face (ordem por id), quadriculado ~quadrado. Cada
     ilha ocupa um bloco TILE×TILE; o UV endereça só o retângulo INTERNO (inset
     de GUTTER em todo lado), então nenhum canto toca a borda da célula. */
  const N = faces.length || 1;
  const cols = Math.max(1, Math.ceil(Math.sqrt(N)));
  const rows = Math.max(1, Math.ceil(N / cols));
  const W = cols * ATLAS_TILE, H = rows * ATLAS_TILE;

  /* PROJEÇÃO POR FACE, pré-calculada por ilha: eixo dominante, bbox 2D dos cantos
     no plano dos outros dois eixos, e o retângulo interno da ilha (em UV 0..1 do
     atlas). `projeta(pontoMundo) -> [u,v]` é a FONTE ÚNICA do UV: o mesh e o mapa
     do 11b saem dela, então nunca divergem. bbox degenerada (área ~0 num eixo —
     face de fio, ou canto pendurado) cai no CENTRO daquele eixo: sem divisão por
     zero, e com a ilha chapada a cor sai a mesma. */
  const EPS = 1e-9;
  const atlasFace = new Map();
  faces.forEach((f, i) => {
    const col = i % cols, row = (i / cols) | 0;
    const ix = col * ATLAS_TILE + ATLAS_GUTTER, iy = row * ATLAS_TILE + ATLAS_GUTTER;   // canto do retângulo interno (texels)
    const iw = ATLAS_TILE - 2 * ATLAS_GUTTER, ih = ATLAS_TILE - 2 * ATLAS_GUTTER;
    const u0 = ix / W, v0 = iy / H, u1 = (ix + iw) / W, v1 = (iy + ih) / H;             // o mesmo em UV 0..1 do atlas
    const dom = eixoDominante(nFace.get(f.id));
    const [pa, pb] = OUTROS_EIXOS[dom];
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const v of f.vs) { const p = V.get(v); if (!p) continue; if (p[pa] < aMin) aMin = p[pa]; if (p[pa] > aMax) aMax = p[pa]; if (p[pb] < bMin) bMin = p[pb]; if (p[pb] > bMax) bMax = p[pb]; }
    const aSpan = aMax - aMin, bSpan = bMax - bMin;   // bbox 2D da face no plano dominante
    const projeta = (p) => {
      const s = aSpan > EPS ? (p[pa] - aMin) / aSpan : 0.5;   // 0..1 na bbox (degenerada -> centro)
      const t = bSpan > EPS ? (p[pb] - bMin) / bSpan : 0.5;
      return [u0 + s * (u1 - u0), v0 + t * (v1 - v0)];        // -> retângulo interno da ilha (UV do atlas)
    };
    atlasFace.set(f.id, { ilha: { x: ix, y: iy, w: iw, h: ih }, dom, projeta });
  });

  /* TEXTURA do atlas: base = cor CHAPADA da célula (`f.cor ?? COR_PADRAO`, o 11a),
     célula INTEIRA (miolo + gutter) preenchida; POR CIMA, os DABS do pincel macio
     daquela face. Célula sem face (sobra da última linha) fica na madeira neutra. */
  const corIlha = faces.map((f) => hexRGB(f.cor ?? COR_PADRAO));
  const corVazia = hexRGB(COR_PADRAO);

  /* PINCEL MACIO (11b): pré-computa por ilha (índice = ordem da face) os dabs que a
     face vai rasterizar — o {a,b} FACE-LOCAL vira centro em TEXELS dentro do retângulo
     interno (a MESMA conta que o UV do mesh: texel = ix + a·iw), o `raio` face-local
     vira raio em TEXELS (× a largura da ilha; a ilha é quadrada, iw==ih), e a `dureza`
     vira a fração do raio 100% opaca (o "núcleo duro"). Ordem preservada = ordem de
     pintura. raio 0/inválido -> dab no-op (defensivo, não corrompe). */
  const dabsIlha = faces.map((f) => {
    const il = atlasFace.get(f.id).ilha;
    return (f.tinta || []).map((t) => ({
      cx: il.x + t.a * il.w, cy: il.y + t.b * il.h,        // {a,b}∈[0,1] -> centro no retângulo interno da ilha
      rT: t.raio * il.w,                                    // raio face-local -> texels (ilha quadrada)
      nucleo: Math.min(1, Math.max(0, t.dureza)),           // dureza = fração do raio de opacidade cheia
      rgb: hexRGB(t.cor ?? COR_PADRAO),
    })).filter((d) => d.rT > 0);
  });

  const tex = ctx.tex.texCanvas(W, H, (x, y) => {
    const col = (x / ATLAS_TILE) | 0, row = (y / ATLAS_TILE) | 0, i = row * cols + col;
    if (i >= corIlha.length) return corVazia;               // célula sem face
    const dabs = dabsIlha[i];
    if (!dabs.length) return corIlha[i];                    // face chapada -> IDÊNTICO ao 11a (compat byte-a-byte)
    /* compõe os dabs SÓ desta face (o texel é de UMA célula): o dab fica PRESO na
       célula, nunca vaza pra ilha vizinha — o gutter é a folga pra ele dilatar sem
       clipar. Falloff: q=dist/raio em [0..1]; dentro do núcleo (q<=dureza) opacidade
       cheia, e do núcleo à borda um ombro macio (smoothstep) até 0. Dureza alta =
       núcleo grande + borda curta; baixa = degradê largo. Alpha OVER, mais nova por cima. */
    let r = corIlha[i][0], g = corIlha[i][1], b = corIlha[i][2];
    for (const d of dabs) {
      const q = Math.hypot(x + 0.5 - d.cx, y + 0.5 - d.cy) / d.rT;
      if (q >= 1) continue;                                 // fora do dab
      let a;
      if (q <= d.nucleo) a = 1;                             // núcleo duro
      else { const tt = (1 - q) / (1 - d.nucleo); a = tt * tt * (3 - 2 * tt); }   // ombro macio até 0 na borda
      r += (d.rgb[0] - r) * a; g += (d.rgb[1] - g) * a; b += (d.rgb[2] - b) * a;
    }
    return [Math.round(r), Math.round(g), Math.round(b)];
  });

  /* PASSO 12a — LOTES POR MATERIAL. Triângulos soltos (leque por face; UV da PRÓPRIA
     ilha, normal chapada ou suave em `liso`) AGRUPADOS por f.material: faces do MESMO
     material (o nome que a op `material` pôs) caem num só lote; faces SEM material vão
     pro lote PADRÃO (params no-op). Todos DIVIDEM a MESMA textura-atlas — cada lote é
     só o subconjunto de triângulos do seu grupo. Peça sem NENHUM material => um único
     grupo (null), na ORDEM de id => mesh BYTE-idêntico ao 11a (compat inegociável). */
  /* PASSO 13a — agrupa pela DUPLA (parte, material). Cada parte nomeada vira lote(s)
     próprio(s) (pra ganhar MATRIZ própria na animação); cada material segue com seus
     params. A chave junta os dois com um separador (\u0000) que nenhum nome contém.
     COMPAT INEGOCIÁVEL: face SEM parte E SEM material => chave '\u0000' pra TODAS =>
     UM só grupo, na ordem de id => mesh BYTE-idêntico ao 12b/11a (a ordem por id se
     mantém — `faces` já vem ordenado). O grupo carrega `parte` (nome|null) pro lote. */
  /* PASSO 14a — ESQUELETO (ADITIVO). SEM esqueleto (todo o jogo + peças de 1..13):
     `skin` é false, o mesh sai em 8 floats/vértice pela MESMA linha de push de antes
     -> BYTE-idêntico (a compat inegociável). COM esqueleto: o mesh ganha 8 floats a
     mais por vértice (índice+peso de OSSO, 4 influências cada) -> 16 floats, e todo
     lote é marcado `esqueleto` pro render usar o caminho skinado SEPARADO. O peso
     viaja com o ID do vértice: `infoV(v)` dá as MESMAS 4 influências pra toda cópia
     dele no mesh loose. boneIndex = posição do osso no ESQUELETO (a MESMA ordem que
     o animador usa). Vértice sem peso -> tudo 0 (o shader cai na identidade = bind
     pose, não deforma — o default seguro). */
  const skin = !!neutro.esqueleto;
  const nOssos = skin ? neutro.esqueleto.ossos.length : 0;
  let infoV = () => null;
  if (skin) {
    const ordemOsso = new Map(neutro.esqueleto.ossos.map((o, k) => [o.nome, k]));
    const infoOssoPorV = new Map();
    for (const [vid, m] of (neutro.pesos || new Map())) {
      const arr = [...m.entries()].filter(([, w]) => w > 0)
        .sort((a, b) => (b[1] - a[1]) || (ordemOsso.get(a[0]) - ordemOsso.get(b[0])));   // maior peso 1º; empate -> ordem do osso (determinístico)
      const top = arr.slice(0, N_INFLU);
      let soma = 0; for (const [, w] of top) soma += w;
      const idx = [0, 0, 0, 0], w = [0, 0, 0, 0];
      if (soma > 0) top.forEach(([osso, wt], k) => { idx[k] = ordemOsso.get(osso); w[k] = wt / soma; });   // TOP-N + NORMALIZA (somam 1)
      infoOssoPorV.set(vid, { idx, w });
    }
    const ZERO = { idx: [0, 0, 0, 0], w: [0, 0, 0, 0] };
    infoV = (v) => infoOssoPorV.get(v) || ZERO;
  }

  const grupos = new Map();   // chave `${parte}\u0000${material}` -> { parte, mat, mesh:{v} }
  for (const f of faces) {
    if (f.vs.some((v) => !V.has(v))) continue;   // defensivo: nunca desenha canto pendurado
    const ch = `${f.parte || ''}\u0000${f.material || ''}`;
    let g = grupos.get(ch);
    if (!g) { g = { parte: f.parte || null, mat: f.material || null, mesh: { v: [] } }; grupos.set(ch, g); }
    const projeta = atlasFace.get(f.id).projeta;
    const nf = nFace.get(f.id);
    const c0 = f.vs[0];
    for (let k = 1; k < f.vs.length - 1; k++) {   // leque a partir do primeiro canto
      for (const v of [c0, f.vs[k], f.vs[k + 1]]) {
        const p = V.get(v);
        const uv = projeta(p);
        const n = f.liso && nSuave.has(v) ? nSuave.get(v) : nf;
        g.mesh.v.push(p[0], p[1], p[2], uv[0], uv[1], n[0], n[1], n[2]);   // 8 floats — INTOCADO (byte-idêntico sem esqueleto)
        if (skin) { const iw = infoV(v); g.mesh.v.push(iw.idx[0], iw.idx[1], iw.idx[2], iw.idx[3], iw.w[0], iw.w[1], iw.w[2], iw.w[3]); }   // +8 floats de OSSO (índice×4, peso×4)
      }
    }
  }

  /* cada grupo -> um lote com a mesh do subconjunto + os PARAMS do material (ausentes
     no grupo padrão -> render no-op). `cor` do material MULTIPLICA a textura (corMul em
     0..1 -> uCorMul); `contorno` é o uRim POR MATERIAL; emissivo/aspereza/semLuz seguem
     o padrão do uRim no render.js (default = efeito nenhum). Os nomes CASAM os uniforms.
     PASSO 12b — MISTURA: `mistura:'transparente'` marca o lote (`transparente:true` +
     `opacidade` 0..1, default 1) pra o render desenhar numa PASSADA EXTRA (blend alpha,
     ordenada de trás pra frente). `opaco`/`recorte`/ausente = opaco como hoje: o lote NÃO
     ganha esses campos, então o render o mantém no passe de cena — byte-idêntico. */
  const lotes = [];
  for (const g of grupos.values()) {
    const L = { mesh: g.mesh, parte: g.parte || null };   // 13a: o NOME da parte do lote (null = sem parte). O render IGNORA (não lê .parte); a animação casa POR ÍNDICE via infoPorLote.
    const m = g.mat ? (MATERIAIS[g.mat] || {}) : null;
    if (m) {
      if (m.cor) L.corMul = hexRGB(m.cor).map((c) => c / 255);
      if (m.emissivo) L.emissivo = +m.emissivo;
      if (m.aspereza) L.aspereza = +m.aspereza;
      if (m.semLuz) L.semLuz = 1;
      if (m.contorno) L.rim = +m.contorno;
      if (m.mistura === 'transparente') { L.transparente = true; L.opacidade = m.opacidade == null ? 1 : Math.min(1, Math.max(0, +m.opacidade)); }   // 12b: só 'transparente' pede a passada extra
    }
    if (skin) { L.esqueleto = true; L.nOssos = nOssos; }   // 14a: lote skinado (mesh 16 floats) -> render usa o caminho skinado SEPARADO
    lotes.push(L);
  }

  /* PASSO 13a — PARTES resolvidas (nome -> {pivo}) pra a animação. O pivô é o EXPLÍCITO
     (`neutro.partes[nome].pivo`, do arquivo) OU, ausente, o CENTROIDE da parte: a média
     das posições dos vértices DISTINTOS de todas as faces dela, no espaço LOCAL do modelo
     (o mesmo espaço do mesh, antes do uModel). É metadado de animação — NÃO entra no mesh
     nem na canon; peça sem parte devolve {} (compat: nenhum consumidor de hoje lê isto). */
  const registro = neutro.partes || {};
  const vertsParte = new Map();   // nome -> Set(ids distintos)
  for (const f of faces) if (f.parte) { let s = vertsParte.get(f.parte); if (!s) { s = new Set(); vertsParte.set(f.parte, s); } for (const v of f.vs) s.add(v); }
  const partes = {};
  for (const nome of new Set([...Object.keys(registro), ...vertsParte.keys()])) {
    let pivo = registro[nome] && registro[nome].pivo;   // explícito (já passado por vec no núcleo)
    if (!pivo) {   // default: centroide da parte
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const v of (vertsParte.get(nome) || [])) { const p = V.get(v); if (!p) continue; cx += p[0]; cy += p[1]; cz += p[2]; n++; }
      pivo = n ? [cx / n, cy / n, cz / n] : [0, 0, 0];
    }
    partes[nome] = { pivo };
  }

  /* atlas: o mapa por face pro passo 11b (superfície -> texel). `daFace(id)` dá a
     ILHA (retângulo interno em texels: {x,y,w,h}, a região pintável) e
     `projeta(pontoMundo) -> [u,v]` no atlas 0..1 (o MESMO UV do mesh). O 11b
     converte pra texel por (round(u*W), round(v*H)) e prende dentro da ilha (a
     pincelada nunca escapa pra vizinha). Anexado ao retorno; `executar`/a peça
     consomem {mesh,tex} e ignoram este campo. */
  const atlas = { W, H, cols, rows, tile: ATLAS_TILE, gutter: ATLAS_GUTTER, daFace: (id) => atlasFace.get(id) };
  return { lotes, tex, atlas, partes, esqueleto: neutro.esqueleto || null };   // 14a: o esqueleto resolvido (ou null) segue pro executar/montarAnimar
}

/* ----------------------------------------------------------------------------
   PASSO 13a — ANIMAÇÃO RÍGIDA POR PARTE (em laço). Matemática de matriz 4x4 LOCAL
   (funções PURAS, sem Date/Math.random) pra o determinismo ser ABSOLUTO: mesmo T
   -> mesmas matrizes, byte-a-byte, na página e em Node. Coluna-major como o motor
   (mat4.js) e o WebGL esperam — o que casa com o `uniformMatrix4fv(.., false, M)`
   do render.js. Não uso o `ctx.m4` porque ele só tem rotY/translate; escrevo os
   ops que faltam (rotX/rotZ/escala) aqui, LOCAIS ao oficina.js (não toco no motor).
---------------------------------------------------------------------------- */
function mMul(a, b) {   // a·b coluna-major (idêntico ao m4.mul do motor)
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function mTranslate(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
function mScale(s) { return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]; }
function mRotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
function mRotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }   // == m4.rotY
function mRotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

/* os canais que uma trilha pode dirigir. Canal fora desta lista GRITA (throw) ao
   montar — como uma op desconhecida no núcleo, o erro é ALTO e cedo, nunca silêncio. */
const CANAIS = new Set(['rotX', 'rotY', 'rotZ', 'posX', 'posY', 'posZ', 'escala']);

/* avaliarChaves(chaves, t): interpola as CHAVES `[[tempo,valor],...]` (assumidas
   ORDENADAS por tempo) no instante `t`. SUAVE por padrão: smoothstep por SEGMENTO
   (s = u²(3−2u)) — ease-in/out, derivada 0 nas pontas do segmento, sem overshoot.
   Antes da 1ª chave -> 1º valor; depois da última -> último valor (clamp nas pontas).
   Exportada pra o teste unitário do interpolador bater valores conhecidos. PURA. */
export function avaliarChaves(chaves, t) {
  const n = chaves.length;
  if (!n) return 0;
  if (t <= chaves[0][0]) return chaves[0][1];
  if (t >= chaves[n - 1][0]) return chaves[n - 1][1];
  let i = 0; while (i < n - 1 && t > chaves[i + 1][0]) i++;
  const [t0, v0] = chaves[i], [t1, v1] = chaves[i + 1];
  const dt = t1 - t0;
  const u = dt > 0 ? (t - t0) / dt : 0;
  const s = u * u * (3 - 2 * u);   // smoothstep
  return v0 + (v1 - v0) * s;
}

/* monta a MATRIZ LOCAL de uma parte em torno do pivô: M = T(pos)·T(piv)·R·S·T(−piv),
   com R = Rz·Ry·Rx (ordem fixa) e S escala uniforme. Aplicada como uModel a cada
   vértice LOCAL do lote (o render multiplica uModel·pos). Pura, coluna-major. */
function matrizLocal(a, piv) {
  const R = mMul(mRotZ(a.rotZ), mMul(mRotY(a.rotY), mRotX(a.rotX)));
  let M = mMul(R, mScale(a.escala));               // R·S
  M = mMul(M, mTranslate(-piv[0], -piv[1], -piv[2]));   // R·S·T(−piv)
  M = mMul(mTranslate(piv[0], piv[1], piv[2]), M);      // T(piv)·R·S·T(−piv)
  M = mMul(mTranslate(a.posX, a.posY, a.posZ), M);      // T(pos)·…
  return M;
}

const IDENT16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/* PASSO 14a — SKINNING (linear blend skinning), determinístico e coluna-major como o
   resto. localAnimBone(a): a transformada LOCAL do OSSO a partir dos canais, SEM o
   pivô (diferente da parte rígida): num esqueleto o pivô do osso É a origem do frame
   local do osso (embutida na cadeia de offsets), então a rotação já gira em torno
   dele. M = T(pos)·Rz·Ry·Rx·S — identidade quando o osso não é animado. */
function localAnimBone(a) {
  const R = mMul(mRotZ(a.rotZ), mMul(mRotY(a.rotY), mRotX(a.rotX)));
  let M = mMul(R, mScale(a.escala));                     // R·S em torno da ORIGEM (= o pivô do osso, no frame local)
  M = mMul(mTranslate(a.posX, a.posY, a.posZ), M);       // T(pos)·R·S
  return M;
}

/* calcularSkin(esqueleto, accOf) -> Float32Array de N mat4s: a matriz de SKIN de cada
   osso, NA ORDEM do ESQUELETO (= a ordem do boneIndex que o adaptarV3 gravou no mesh).
   LBS padrão, com o bind (repouso) = IDENTIDADE no pivô:
     bindGlobal(osso)     = T(pivo)                                   (offsets telescopam)
     globalCorrente(osso) = globalCorrente(pai) · T(pivo−pivoPai) · localAnim(osso)
     skin(osso)           = globalCorrente(osso) · inverse(bindGlobal) = globalCorrente · T(−pivo)
   Sem animação -> localAnim=I -> globalCorrente=T(pivo) -> skin=I (bind pose, deforma 0).
   Osso-filho girado R -> skin = T(pivo)·R·T(−pivo): gira EM TORNO do pivô (a junta); os
   vértices do pai (skin=I) ficam. inverse(bindGlobal) é T(−pivo) EXATO (bind é translação
   pura) — sem inversa geral 4x4, sem erro numérico. globalDe é memoizado + recursivo: a
   ordem de declaração não importa (ciclo já barrado no resolverEsqueleto). PURA. */
function calcularSkin(esqueleto, accOf) {
  const ossos = esqueleto.ossos, idx = esqueleto.idx;
  const globalCache = new Array(ossos.length).fill(null);
  const globalDe = (bi) => {
    if (globalCache[bi]) return globalCache[bi];
    const o = ossos[bi];
    const paiIdx = o.pai != null ? idx.get(o.pai) : -1;
    const paiG = paiIdx >= 0 ? globalDe(paiIdx) : IDENT16;
    const paiPivo = paiIdx >= 0 ? ossos[paiIdx].pivo : [0, 0, 0];
    const off = mTranslate(o.pivo[0] - paiPivo[0], o.pivo[1] - paiPivo[1], o.pivo[2] - paiPivo[2]);   // rest-relative ao pai
    const a = accOf(o.nome);
    const g = mMul(paiG, mMul(off, a ? localAnimBone(a) : IDENT16));
    globalCache[bi] = g;
    return g;
  };
  const out = new Float32Array(ossos.length * 16);
  for (let bi = 0; bi < ossos.length; bi++) {
    const o = ossos[bi];
    const sk = mMul(globalDe(bi), mTranslate(-o.pivo[0], -o.pivo[1], -o.pivo[2]));   // skin = global · T(−pivo)
    for (let k = 0; k < 16; k++) out[bi * 16 + k] = sk[k];
  }
  return out;
}

/* bind pose (N identidades): o L.ossos inicial de um lote skinado — o que o render sobe
   quando a peça NÃO tem `animar` (deforma 0 = repouso). Float32Array pra subir direto. */
export function bindPoseOssos(n) { const out = new Float32Array(n * 16); for (let i = 0; i < n; i++) out.set(IDENT16, i * 16); return out; }

/* montarAnimar(ANIMACOES, infoPorLote, partes) -> função `animar(T, lotes)` (ou
   undefined se ANIMACOES vazio). ANIMACOES é uma seção da peça (como MATERIAIS):
   `{ nome: { duracao, repete, trilhas:[{parte,canal,chaves}] } }`.

   COMO CASA parte<->lote SEM TOCAR NO render.js: o render mapeia `peca.lotes` 1:1 na
   MESMA ORDEM e chama `animar(T, lotes)` a cada quadro (cada lote tem `.matriz`=uModel).
   Então capturo no closure `infoPorLote` — um array PARALELO aos lotes (infoPorLote[i]
   = nome-da-parte-do-lote-i, ou null) — e caso POR ÍNDICE. NUNCA leio um campo novo dos
   lotes do render (o render nem copia `.parte`).

   Por quadro, pra cada animação: tempo local `lt = repete ? (dur>0 ? T%dur : 0) :
   min(T,dur)`. Pra cada trilha: avalia as chaves em `lt` (SUAVE) e ACUMULA por parte —
   rotX.Y.Z e posX.Y.Z SOMAM (0 default), `escala` MULTIPLICA (1 default, pra compor sem zerar).
   Monta a matriz da parte em torno do pivô (parte.pivo ?? centroide, já resolvido no
   adaptarV3) e escreve em TODO lote i cuja parte casa. Partes/lotes não animados ficam
   com a identidade que o executar já pôs (nunca escrevo neles). Determinístico. */
export function montarAnimar(ANIMACOES = {}, infoPorLote = [], partes = {}, esqueleto = null) {
  const nomes = Object.keys(ANIMACOES || {});
  if (!nomes.length) return undefined;

  /* índices de lote por parte, do MAPA paralelo (a fonte da verdade do casamento). */
  const lotesDaParte = new Map();
  infoPorLote.forEach((p, i) => { if (!p) return; let a = lotesDaParte.get(p); if (!a) { a = []; lotesDaParte.set(p, a); } a.push(i); });

  /* PASSO 14a — esqueleto: o alvo de uma trilha pode ser um OSSO (nome no ESQUELETO) ou
     uma PARTE (13a). `ossoSet` resolve os dois: alvo em ossoSet dirige o SKINNING (as
     matrizes de osso do quadro, escritas em L.ossos de TODO lote skinado); alvo fora
     dele segue a parte rígida (L.matriz). Sem esqueleto (1..13), ossoSet vazio -> tudo
     idêntico ao 13a. */
  const ossoSet = esqueleto ? new Set(esqueleto.ossos.map((o) => o.nome)) : new Set();

  /* pré-processa: valida canais (GRITA cedo), ordena as chaves, deriva a duração
     (default = maior tempo de chave da animação). Feito UMA vez, não por quadro. */
  const anims = nomes.map((nome) => {
    const A = ANIMACOES[nome] || {};
    const trilhas = (A.trilhas || []).map((tr) => {
      if (!CANAIS.has(tr.canal)) throw new Error(`oficina: canal '${tr.canal}' desconhecido na animação '${nome}' (parte '${tr.parte}') — só ${[...CANAIS].join('/')}`);
      const chaves = (tr.chaves || []).slice().sort((x, y) => x[0] - y[0]);
      return { parte: tr.parte, canal: tr.canal, chaves };
    });
    let maxT = 0; for (const tr of trilhas) if (tr.chaves.length) maxT = Math.max(maxT, tr.chaves[tr.chaves.length - 1][0]);
    return { repete: !!A.repete, duracao: A.duracao != null ? +A.duracao : maxT, trilhas };
  });

  return function animar(T, lotes) {
    const acc = new Map();   // parte -> {rotX,rotY,rotZ,posX,posY,posZ,escala}, ZERADO por quadro (determinismo)
    const getAcc = (p) => { let a = acc.get(p); if (!a) { a = { rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0, escala: 1 }; acc.set(p, a); } return a; };
    for (const A of anims) {
      const lt = A.repete ? (A.duracao > 0 ? T % A.duracao : 0) : Math.min(T, A.duracao);
      for (const tr of A.trilhas) {
        const v = avaliarChaves(tr.chaves, lt);
        const a = getAcc(tr.parte);
        if (tr.canal === 'escala') a.escala *= v; else a[tr.canal] += v;
      }
    }
    for (const [parte, a] of acc) {
      if (ossoSet.has(parte)) continue;   // 14a: alvo é um OSSO -> vai pelo skinning abaixo, não como parte rígida
      const idx = lotesDaParte.get(parte);
      if (!idx || !idx.length) continue;   // trilha aponta pra parte sem lote (nenhuma face) -> nada a mover
      const piv = (partes[parte] && partes[parte].pivo) || [0, 0, 0];
      const M = matrizLocal(a, piv);
      for (const i of idx) if (lotes[i]) lotes[i].matriz = M;   // escreve por ÍNDICE; o render lê L.matriz como uModel
    }
    /* 14a: as matrizes de osso do quadro (mesmo que NENHUM osso seja animado — a bind
       pose = identidades) num Float32Array, escrito em L.ossos de TODO lote skinado. O
       render sobe L.ossos em uOssos[] e usa o programa skinado. accOf lê o acc por NOME
       de osso (undefined = osso não animado -> localAnim identidade). */
    if (esqueleto) {
      const skinBuf = calcularSkin(esqueleto, (nome) => acc.get(nome));
      for (let i = 0; i < infoPorLote.length; i++) if (lotes[i]) lotes[i].ossos = skinBuf;   // todo lote de peça skinada é skinado
    }
  };
}

/* ----------------------------------------------------------------------------
   API pública que a PEÇA usa.
---------------------------------------------------------------------------- */
/* executar: roda a lista e devolve o objeto pronto pro visor
   ({lotes:[{mesh:{v}, tex, matriz, ...params-de-material}], animar?, camera}). É núcleo
   + adaptador. MATERIAIS (12a) e ANIMACOES (13a) são dados da peça, como PARAMS/TOPO —
   vêm por ÚLTIMO e opcionais: {} deixa toda peça sem material com UM lote só (byte-idêntico
   ao 11a) e ANIMACOES vazio -> `animar` undefined -> o render vê `peca.animar||null`=null
   -> byte-idêntico (nenhuma peça de hoje anima). Cada lote ganha a SUA identidade (não uma
   compartilhada) pra a animação sobrescrever o lote certo sem alias; `animar` casa
   parte<->lote por ÍNDICE via `infoPorLote`, PARALELO aos lotes que o render vai mapear. */
export function executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS = {}, ANIMACOES = {}, ESQUELETO = null, ALIASES = []) {
  const neutro = nucleo(PASSOS, PARAMS, TOPO, MATERIAIS, ESQUELETO, ALIASES);
  if (!ctx || !ctx.tex || !ctx.tex.texCanvas) throw new Error('oficina.executar precisa de ctx {tex,...} do motor v3');
  if (neutro.orfaos.length && typeof console !== 'undefined') console.warn(`oficina: ${neutro.orfaos.length} órfão(s) —`, neutro.orfaos);
  const { lotes, tex, partes, esqueleto } = adaptarV3(neutro, ctx, MATERIAIS);
  const infoPorLote = lotes.map((L) => L.parte || null);   // PARALELO aos lotes (mesma ordem que o render mapeia)
  const animar = montarAnimar(ANIMACOES, infoPorLote, partes, esqueleto);   // 14a: esqueleto resolvido -> trilhas de OSSO viram L.ossos
  const ident = () => (ctx.m4 ? ctx.m4.ident() : undefined);
  /* 14a: lote skinado nasce na BIND POSE (L.ossos = N identidades) — o render sobe isso
     e a peça renderiza em repouso mesmo SEM `animar`. Com `animar`, ele sobrescreve por
     quadro. Lote sem esqueleto não ganha L.ossos (o render nem olha). */
  return { lotes: lotes.map((L) => ({ ...L, tex, matriz: ident(), ...(L.esqueleto ? { ossos: bindPoseOssos(L.nOssos) } : {}) })), animar, camera: { e: 1.05, r: 2.9 } };
}

/* colisaoDe: SÓ a geometria (sem adaptador/textura/pincel) -> descritor de
   colisão encaixado na malha FINAL (depois das extrusões). Roda no CARREGAMENTO
   do módulo, então é barato e tem um dono só (nada de número medido e guardado).
   Encaixa nas faces `solido` se houver; senão, na malha toda. */
export function colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS = {}, ALIASES = []) {
  const { V, F } = nucleo(PASSOS, PARAMS, TOPO, MATERIAIS, null, ALIASES);
  let ids = new Set();
  for (const f of F.values()) if (f.solido) for (const v of f.vs) ids.add(v);
  if (!ids.size) ids = new Set(V.keys());
  let raio = 0, minY = Infinity, maxY = -Infinity;
  for (const v of ids) { const p = V.get(v); if (!p) continue; raio = Math.max(raio, Math.hypot(p[0], p[2])); if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  if (!Number.isFinite(minY)) { minY = 0; maxY = 0; }
  return { forma: 'cilindro', raio, altura: maxY - minY, base: minY };
}
