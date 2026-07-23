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

/* colapsa cantos repetidos consecutivos (inclusive no fecho do ciclo) — o que
   a mescla deixa pra trás quando dois cantos de uma face viram o mesmo id. */
function colapsaCiclo(vs) {
  const out = [];
  for (let k = 0; k < vs.length; k++) if (vs[k] !== vs[(k + 1) % vs.length]) out.push(vs[k]);
  return out;
}
function distintos(vs) { return new Set(vs).size; }

/* ----------------------------------------------------------------------------
   VOCABULÁRIO de operações. Cada uma recebe (st, args, i) e muta o estado
   neutro. Toda referência a um id inexistente é registrada em `orfaos` e o
   passo é PULADO — grita, nunca corrompe (lei do envelope). Passo 1 traz só o
   suficiente pra provar o modelo e as partes difíceis; as ~20 da tabela do doc
   entram depois, cada uma como mais uma entrada aqui.
---------------------------------------------------------------------------- */
function Face(id, vs) { return { id, vs, cor: null, material: null, liso: false, solido: false, tinta: [] }; }

function addV(st, id, pos) {
  if (st.V.has(id)) throw new Error(`oficina: colisão de id de vértice ${id} (bloco pequeno? passo mal-formado?)`);
  st.V.set(id, pos);
}
function addF(st, id, vs) {
  if (st.F.has(id)) throw new Error(`oficina: colisão de id de face ${id}`);
  st.F.set(id, Face(id, vs));
}
function grita(st, i, op, ref, motivo) { st.orfaos.push({ passo: i, op, ref, motivo }); }

/* valida o `id` opcional de uma primitiva contra a base posicional: se o
   arquivo escreveu um id que não bate com a posição, é um aviso alto (não muda
   a numeração — a POSIÇÃO manda sempre). */
function confereId(st, i, op, args) {
  const b = baseDoPasso(i);
  if (typeof args.id === 'number' && args.id !== b) grita(st, i, op, args.id, `id ${args.id} ≠ base da posição ${b} — a posição manda`);
  return b;
}

const OPS = {
  /* ---- primitivas: criam vértices únicos + faces a partir da base do passo ---- */
  cubo(st, a, i) {
    const b = confereId(st, i, 'cubo', a);
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

  /* ---- atributos por face ---- */
  pincel(st, a, i) {
    const modo = a.modo ?? 'face';
    if (modo === 'face') {   // passo 9: preenche faces INTEIRAS de uma cor chapada (f.cor). Compat pra trás: intocado.
      for (const fid of a.faces ?? []) { const f = st.F.get(fid); if (!f) { grita(st, i, 'pincel', fid, 'face inexistente'); continue; } f.cor = a.cor ?? null; }
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
  solido(st, a, i) { for (const fid of a.faces ?? []) { const f = st.F.get(fid); if (!f) { grita(st, i, 'solido', fid, 'face inexistente'); continue; } f.solido = true; } },
  liso(st, a, i) { for (const fid of a.faces ?? []) { const f = st.F.get(fid); if (!f) { grita(st, i, 'liso', fid, 'face inexistente'); continue; } f.liso = true; } },

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
    for (const fid of a.faces ?? []) { const f = st.F.get(fid); if (!f) { grita(st, i, 'material', fid, 'face inexistente'); continue; } f.material = usa; }
  },
};

/* ----------------------------------------------------------------------------
   NÚCLEO: roda a lista e devolve o NEUTRO em números. Não sabe desenhar.
   `dict` funde PARAMS e TOPO — os passos citam o NOME (raio: 'troncoR'), então
   trocar o valor reconstrói sem tocar em número nenhum da lista.
---------------------------------------------------------------------------- */
export function nucleo(PASSOS, PARAMS = {}, TOPO = {}, MATERIAIS = {}) {
  const dict = { ...PARAMS, ...TOPO };
  const num = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { if (!(v in dict)) throw new Error(`oficina: parâmetro '${v}' não existe em PARAMS/TOPO`); return num(dict[v]); }
    throw new Error(`oficina: valor numérico inválido: ${JSON.stringify(v)}`);
  };
  const vec = (a) => a.map(num);
  /* materiais: o dicionário POR NOME (a peça declara em MATERIAIS) que a op
     `material` valida contra e o adaptarV3 lê pra montar os params por lote. Como
     PARAMS/TOPO, é dado da peça — o padrão {} deixa toda peça sem material intacta. */
  const st = { V: new Map(), F: new Map(), orfaos: [], merges: [], num, vec, materiais: MATERIAIS };

  PASSOS.forEach((passo, i) => {
    const [op, args = {}] = passo;
    const fn = OPS[op];
    if (!fn) { grita(st, i, op, null, `operação desconhecida '${op}'`); return; }
    fn(st, args, i);
  });

  return { V: st.V, F: st.F, orfaos: st.orfaos, merges: st.merges };
}

/* forma canônica e ORDENADA do neutro — a base de toda comparação (replay da
   bancada, testes de determinismo). Ids crescentes; posições e atributos
   explícitos. JSON dela ida-e-volta é idêntico bit-a-bit quando o objeto é o
   mesmo. */
export function neutroCanonico(neutro) {
  return {
    V: [...neutro.V.entries()].sort((a, b) => a[0] - b[0]).map(([id, p]) => [id, p[0], p[1], p[2]]),
    F: [...neutro.F.values()].sort((a, b) => a.id - b.id).map((f) => {
      const row = [f.id, f.vs.slice(), f.cor ?? null, f.material ?? null, !!f.liso, !!f.solido];
      /* tinta (pincel macio, 11b): só entra quando a face TEM dab. Assim toda peça
         sem pincel livre (o passo 1..11a inteiro, incl. o toco) canoniza BYTE-idêntico
         ao de antes — a compat pra trás é inegociável. Forma fixa [a,b,cor,raio,dureza]
         por dab, na ordem de pintura, pra o JSON ir-e-voltar igual (determinismo). */
      if (f.tinta && f.tinta.length) row.push(f.tinta.map((t) => [t.a, t.b, t.cor ?? null, t.raio, t.dureza]));
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
  const grupos = new Map();   // chave (f.material || '') -> { mat:nome|null, mesh:{v} }
  for (const f of faces) {
    if (f.vs.some((v) => !V.has(v))) continue;   // defensivo: nunca desenha canto pendurado
    const ch = f.material || '';
    let g = grupos.get(ch);
    if (!g) { g = { mat: f.material || null, mesh: { v: [] } }; grupos.set(ch, g); }
    const projeta = atlasFace.get(f.id).projeta;
    const nf = nFace.get(f.id);
    const c0 = f.vs[0];
    for (let k = 1; k < f.vs.length - 1; k++) {   // leque a partir do primeiro canto
      for (const v of [c0, f.vs[k], f.vs[k + 1]]) {
        const p = V.get(v);
        const uv = projeta(p);
        const n = f.liso && nSuave.has(v) ? nSuave.get(v) : nf;
        g.mesh.v.push(p[0], p[1], p[2], uv[0], uv[1], n[0], n[1], n[2]);
      }
    }
  }

  /* cada grupo -> um lote com a mesh do subconjunto + os PARAMS do material (ausentes
     no grupo padrão -> render no-op). `cor` do material MULTIPLICA a textura (corMul em
     0..1 -> uCorMul); `contorno` é o uRim POR MATERIAL; emissivo/aspereza/semLuz seguem
     o padrão do uRim no render.js (default = efeito nenhum). Os nomes CASAM os uniforms. */
  const lotes = [];
  for (const g of grupos.values()) {
    const L = { mesh: g.mesh };
    const m = g.mat ? (MATERIAIS[g.mat] || {}) : null;
    if (m) {
      if (m.cor) L.corMul = hexRGB(m.cor).map((c) => c / 255);
      if (m.emissivo) L.emissivo = +m.emissivo;
      if (m.aspereza) L.aspereza = +m.aspereza;
      if (m.semLuz) L.semLuz = 1;
      if (m.contorno) L.rim = +m.contorno;
    }
    lotes.push(L);
  }

  /* atlas: o mapa por face pro passo 11b (superfície -> texel). `daFace(id)` dá a
     ILHA (retângulo interno em texels: {x,y,w,h}, a região pintável) e
     `projeta(pontoMundo) -> [u,v]` no atlas 0..1 (o MESMO UV do mesh). O 11b
     converte pra texel por (round(u*W), round(v*H)) e prende dentro da ilha (a
     pincelada nunca escapa pra vizinha). Anexado ao retorno; `executar`/a peça
     consomem {mesh,tex} e ignoram este campo. */
  const atlas = { W, H, cols, rows, tile: ATLAS_TILE, gutter: ATLAS_GUTTER, daFace: (id) => atlasFace.get(id) };
  return { lotes, tex, atlas };
}

/* ----------------------------------------------------------------------------
   API pública que a PEÇA usa.
---------------------------------------------------------------------------- */
/* executar: roda a lista e devolve o objeto pronto pro visor
   ({lotes:[{mesh:{v}, tex, matriz, ...params-de-material}], ...}). É núcleo +
   adaptador. MATERIAIS (passo 12a) é dado da peça, como PARAMS/TOPO — vem por ÚLTIMO
   e o padrão {} deixa toda peça sem material com UM lote só, byte-idêntico ao 11a.
   Os lotes DIVIDEM a mesma tex/matriz; cada um carrega os params do seu material. */
export function executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS = {}) {
  const neutro = nucleo(PASSOS, PARAMS, TOPO, MATERIAIS);
  if (!ctx || !ctx.tex || !ctx.tex.texCanvas) throw new Error('oficina.executar precisa de ctx {tex,...} do motor v3');
  if (neutro.orfaos.length && typeof console !== 'undefined') console.warn(`oficina: ${neutro.orfaos.length} órfão(s) —`, neutro.orfaos);
  const { lotes, tex } = adaptarV3(neutro, ctx, MATERIAIS);
  const matriz = ctx.m4 ? ctx.m4.ident() : undefined;
  return { lotes: lotes.map((L) => ({ ...L, tex, matriz })), camera: { e: 1.05, r: 2.9 } };
}

/* colisaoDe: SÓ a geometria (sem adaptador/textura/pincel) -> descritor de
   colisão encaixado na malha FINAL (depois das extrusões). Roda no CARREGAMENTO
   do módulo, então é barato e tem um dono só (nada de número medido e guardado).
   Encaixa nas faces `solido` se houver; senão, na malha toda. */
export function colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS = {}) {
  const { V, F } = nucleo(PASSOS, PARAMS, TOPO, MATERIAIS);
  let ids = new Set();
  for (const f of F.values()) if (f.solido) for (const v of f.vs) ids.add(v);
  if (!ids.size) ids = new Set(V.keys());
  let raio = 0, minY = Infinity, maxY = -Infinity;
  for (const v of ids) { const p = V.get(v); if (!p) continue; raio = Math.max(raio, Math.hypot(p[0], p[2])); if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  if (!Number.isFinite(minY)) { minY = 0; maxY = 0; }
  return { forma: 'cilindro', raio, altura: maxY - minY, base: minY };
}
