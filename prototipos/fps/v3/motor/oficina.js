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
       citar PARAM, como os outros pontos dimensionais da Oficina). */
    let raioInvalido = false;
    const pontos = perfil.map((pt, j) => {
      if (pt.length > 2) grita(st, i, 'lathe', j, 'alça de curva reservada — P2 é só reta');   // reserva (formato salvo): NUNCA ignora em silêncio
      const raio = st.num(pt[0]), y = st.num(pt[1]);
      if (raio < 0) { grita(st, i, 'lathe', j, `raio negativo (${raio}) no ponto ${j} do perfil — não dá pra classificar polo/anel`); raioInvalido = true; }
      return { raio, y, polo: raio === 0 };
    });
    if (raioInvalido) return;   // algum ponto não classifica (polo/anel) -> nada construído neste passo (grita já registrado por ponto)

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
    st.partes[nome] = { pivo: a.pivo != null ? st.vec(a.pivo) : null };   // registro nome->{pivo}; pivo null => centroide (no adaptador)
    for (const fid of a.faces ?? []) { const f = st.F.get(fid); if (!f) { grita(st, i, 'parte', fid, 'face inexistente'); continue; } f.parte = nome; }   // última atribuição vence
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
export function nucleo(PASSOS, PARAMS = {}, TOPO = {}, MATERIAIS = {}, ESQUELETO = null) {
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
  /* partes (13a): registro nome->{pivo} que a op `parte` preenche e o adaptarV3
     lê pra resolver o pivô (explícito) ou cair no centroide da parte. */
  /* ESQUELETO (14a): resolvido+validado ANTES dos passos (o `pesar` valida `osso`
     contra `ossoSet`). Ausente (o caso de 1..13 e do jogo) => esqueleto null,
     pesos vazio -> canon e mesh byte-idênticos ao de antes (compat inegociável). */
  const esqueleto = ESQUELETO ? resolverEsqueleto(ESQUELETO, vec) : null;
  const ossoSet = esqueleto ? new Set(esqueleto.ossos.map((o) => o.nome)) : null;
  const st = { V: new Map(), F: new Map(), orfaos: [], merges: [], partes: {}, num, vec, materiais: MATERIAIS, esqueleto, ossoSet, pesos: new Map() };

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
export function executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS = {}, ANIMACOES = {}, ESQUELETO = null) {
  const neutro = nucleo(PASSOS, PARAMS, TOPO, MATERIAIS, ESQUELETO);   // 14a: ESQUELETO por ÚLTIMO + opcional (compat: sem ele, tudo byte-idêntico)
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
