/* gabarito-nucleo.mjs — P5 do playground (docs/historico/playground.md): FORMA COMO
   NÚMERO. Lógica PURA (sem Playwright/browser — unit-testável) por trás da
   bancada `gabarito.mjs`: extrai a silhueta do OBJETO por DIFERENÇA contra um
   render do FUNDO vazio (a peça `_vazio` — mesmo céu/chão, sem objeto),
   rasteriza o CONTORNO de referência (o formato do P5: lista de pontos [x,y]
   normalizados 0..1, alça de curva reservada no 3º elemento) no mesmo
   tamanho, e mede IoU (interseção/união em pixels).

   POR QUE DIFERENÇA DE FUNDO (não color-key): o céu tem gradiente + estrelas
   e o chão tem grama com dither — nenhuma cor fixa separa objeto de fundo. A
   diferença cancela os dois automaticameente; o resíduo (grama balançando no
   vento, partículas de pólen à deriva) é RUÍDO, não objeto — medido em
   scratchpad antes de escrever este arquivo (duas fotos da peça `_vazio`,
   mesmo ângulo: 0,31% dos pixels diferem, maior componente conexo de ruído
   19px @ limiar=40). LIMIAR_DIFF e MIN_COMPONENTE têm margem de ~3× sobre
   esse piso medido — não são chutados. */

export const LIMIAR_DIFF = 40;      // diferença de cor (0..255, canal máximo) pra contar como "objeto"
export const MIN_COMPONENTE = 60;   // pixels — descarta componente conexo menor (o piso de ruído medido é 19px)
/* o HUD (`#hud` em visor.html) é DOM fixo no canto sup-esq (`position:fixed;
   top:8px;left:10px`), não faz parte da cena WebGL — mas ENTRA no screenshot,
   e o texto (nome+descrição da peça) DIFERE do fundo `_vazio` como qualquer
   outro pixel, então vaza pra máscara como falso-positivo — medido: a
   descrição MAIS LONGA do repo hoje (`_viga`, 145 caracteres, quebra em 3
   linhas) ocupa até y≈60px em qualquer resolução (o HUD é DOM em pixel CSS
   fixo, não escala com --res); a régua abaixo tem margem de ~50% sobre isso. */
export const IGNORAR_TOPO = 90;     // px — faixa do HUD excluída ANTES do filtro de componente

/** máscara binária (Uint8Array W*H) = 1 onde `obj` difere de `fundo` além do limiar
    (a faixa do HUD, `ignorarTopo` px do topo, sai ZERADA antes de devolver). */
export function mascaraPorDiferenca(fundo, obj, limiar = LIMIAR_DIFF, ignorarTopo = IGNORAR_TOPO) {
  if (fundo.W !== obj.W || fundo.H !== obj.H) throw new Error(`gabarito: fundo (${fundo.W}x${fundo.H}) e objeto (${obj.W}x${obj.H}) têm tamanhos diferentes — renderize os dois no MESMO --res`);
  const { W, H } = fundo;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * fundo.ch;
    const d = Math.max(
      Math.abs(fundo.pixels[o] - obj.pixels[o]),
      Math.abs(fundo.pixels[o + 1] - obj.pixels[o + 1]),
      Math.abs(fundo.pixels[o + 2] - obj.pixels[o + 2]),
    );
    if (d > limiar) m[i] = 1;
  }
  for (let y = 0; y < Math.min(ignorarTopo, H); y++) for (let x = 0; x < W; x++) m[y * W + x] = 0;
  return { W, H, m };
}

/** componentes conexos (4-vizinhos, flood fill iterativo) — devolve a MESMA máscara
    só com componentes menores que `minTam` apagados (o filtro de ruído). */
export function filtrarComponentesPequenos(mascara, minTam = MIN_COMPONENTE) {
  const { W, H, m } = mascara;
  const visto = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  const pilha = [];
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || visto[s]) continue;
    const membros = [s];
    visto[s] = 1;
    pilha.length = 0; pilha.push(s);
    while (pilha.length) {
      const p = pilha.pop();
      const x = p % W, y = (p / W) | 0;
      const viz = [x + 1 < W ? p + 1 : -1, x > 0 ? p - 1 : -1, y + 1 < H ? p + W : -1, y > 0 ? p - W : -1];
      for (const np of viz) { if (np >= 0 && m[np] && !visto[np]) { visto[np] = 1; membros.push(np); pilha.push(np); } }
    }
    if (membros.length >= minTam) for (const p of membros) out[p] = 1;
  }
  return { W, H, m: out };
}

/** silhueta do objeto: diferença contra o fundo + filtro de componente pequeno, num passo. */
export function extrairSilhueta(fundo, obj, opts = {}) {
  const bruta = mascaraPorDiferenca(fundo, obj, opts.limiar ?? LIMIAR_DIFF, opts.ignorarTopo ?? IGNORAR_TOPO);
  return filtrarComponentesPequenos(bruta, opts.minTam ?? MIN_COMPONENTE);
}

/* CONTORNO (o formato do P5, docs/historico/playground.md): lista de pontos [x,y]
   normalizados 0..1 (x direita, y BAIXO — convenção de imagem, casa direto
   com pixel row-major), fechada IMPLICITAMENTE (não repete o primeiro
   ponto). Alça de curva RESERVADA no 3º elemento — a mesma lei fail-closed
   do `lathe`/`loft` (D-115): ponto com aridade ≠ 2 é erro, não vira reto
   silencioso. Aqui é bancada (não núcleo), então o erro é EXCEÇÃO crua — um
   gabarito malformado tem que estourar alto, nunca medir "quase". */
export function validarContorno(pontos, contexto = 'contorno') {
  if (!Array.isArray(pontos) || pontos.length < 3) throw new Error(`gabarito: ${contexto} precisa de ao menos 3 pontos (tem ${Array.isArray(pontos) ? pontos.length : typeof pontos})`);
  return pontos.map((pt, k) => {
    if (!Array.isArray(pt) || pt.length !== 2) throw new Error(`gabarito: ponto ${k} de ${contexto} precisa ser [x,y] (2 elementos) — a alça de curva (3º elemento) está RESERVADA, ainda não implementada`);
    const [x, y] = pt;
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`gabarito: ponto ${k} de ${contexto} tem coordenada não-finita: ${JSON.stringify(pt)}`);
    return [x, y];
  });
}

/** rasteriza o contorno (pontos 0..1) num canvas WxH — preenchimento par-ímpar
    por varredura de linha (scanline), o método clássico pra polígono simples. */
export function rasterizarContorno(pontosNorm, W, H) {
  const pts = pontosNorm.map(([x, y]) => [x * W, y * H]);
  const m = new Uint8Array(W * H);
  const n = pts.length;
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;   // centro do pixel
    const xs = [];
    for (let k = 0; k < n; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % n];
      if ((y1 <= py && y2 > py) || (y2 <= py && y1 > py)) xs.push(x1 + (py - y1) / (y2 - y1) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.round(xs[k])), x1 = Math.min(W, Math.round(xs[k + 1]));
      for (let x = x0; x < x1; x++) m[y * W + x] = 1;
    }
  }
  return { W, H, m };
}

/** IoU entre duas máscaras do MESMO tamanho: interseção / união (0 se união vazia). */
export function iou(a, b) {
  if (a.W !== b.W || a.H !== b.H) throw new Error(`gabarito: máscaras de tamanhos diferentes (${a.W}x${a.H} vs ${b.W}x${b.H})`);
  let inter = 0, uniao = 0;
  for (let i = 0; i < a.W * a.H; i++) {
    const x = a.m[i], y = b.m[i];
    if (x && y) inter++;
    if (x || y) uniao++;
  }
  return uniao === 0 ? 0 : inter / uniao;
}

/** conta pixels ligados (soma da máscara) — usado pro veredito "nada renderizou". */
export function areaMascara(m) { let n = 0; for (let i = 0; i < m.m.length; i++) n += m.m[i]; return n; }

/* LIMIAR calibrado (método do bench/D-60: separar caso bom de caso ruim por
   MEDIÇÃO, não chute) contra `_viga` — 8 casos, silhueta REAL extraída do
   render vs contornos de referência: 3 traçados "bons" (à mão olhando o PNG,
   com imprecisão de autoria de propósito — o jeito real que uma IA desenha)
   ficaram em 0,65 / 0,74 / 0,88; 5 traçados deliberadamente ERRADOS (forma
   trocada, deslocado, escala errada, girado 90°) ficaram em 0,00 / 0,15 /
   0,20 / 0,25 / 0,44 — vale de 0,21 entre o pior bom (0,65) e o melhor ruim
   (0,44). 0.55 fica no meio do vale, puxado pro lado permissivo (dá margem
   pra imprecisão de quem desenha à mão, sem deixar passar forma errada). */
export const LIMIAR_IOU = 0.55;
