/* mutacoes.mjs — DEFEITOS PLANTADOS pro benchmark de senso crítico (D-60).
   Cada mutação injeta UM defeito de UM domínio numa peça recém-construída
   (aplicada em construirPeca, sem contaminar outros casos). O domínio (dom) é
   o gabarito: a ferramenta daquele domínio DEVE pegar; as outras NÃO. */

/* -- helpers de geometria (v = float32 chato, 8/vértice: x y z u v nx ny nz) -- */
const geo = (fn) => (b) => { const L = b.lotes.find((l) => l.mesh?.v?.length); if (L) fn(L.mesh.v); return b; };
/* -- helpers de textura (mutação in-place no buffer do 1º lote) -- */
const texOf = (b) => { const t = b.lotes[0].tex; const im = t.getContext('2d').getImageData(0, 0, t.width, t.height); return { d: im.data, w: t.width, h: t.height }; };
const tex = (fn) => (b) => { const { d, w, h } = texOf(b); fn(d, w, h); return b; };

export const MUT = {
  /* ---- MALHA (lint-de-malha) ---- */
  'malha:triDegenerado': { dom: 'malha', desc: 'triângulo de área ~0 (2 vértices iguais)', fn: geo((v) => { for (let k = 0; k < 3; k++) v[8 + k] = v[k]; }) },
  'malha:vertNaN': { dom: 'malha', desc: 'coordenada NaN', fn: geo((v) => { v[0] = NaN; }) },
  'malha:vertInf': { dom: 'malha', desc: 'coordenada Infinity', fn: geo((v) => { v[1] = Infinity; }) },
  'malha:normalZero': { dom: 'malha', desc: 'normal de comprimento 0', fn: geo((v) => { v[5] = v[6] = v[7] = 0; }) },
  'malha:normalNaoUnit': { dom: 'malha', desc: 'normal não-normalizada (|n|≫1)', fn: geo((v) => { v[5] = 5; v[6] = 5; v[7] = 5; }) },
  'malha:vertGigante': { dom: 'malha', desc: 'vértice fora de qualquer escala sã (1e6)', fn: geo((v) => { v[2] = 1e6; }) },
  'malha:loteVazio': { dom: 'malha', desc: 'lote com malha vazia', fn: (b) => { b.lotes.push({ mesh: { v: [] }, tex: b.lotes[0].tex }); return b; } },
  'malha:triCount': { dom: 'malha', desc: 'contagem de vértices não-múltipla de 3', fn: geo((v) => { v.push(0, 0, 0, 0, 0, 0, 1, 0); }) },

  /* ---- PALETA (distancia-paleta) ---- */
  'paleta:corForaDaPaleta': { dom: 'paleta', desc: 'pixels magenta puro (longe de qualquer cor Resurrect64)', fn: tex((d, w, h) => { const N = w * h; for (let i = 0; i < 80; i++) { const o = ((i * 137) % N) * 4; d[o] = 255; d[o + 1] = 0; d[o + 2] = 255; } }) },
  'paleta:desvioSutil': { dom: 'paleta', desc: 'bloco levemente fora da paleta (+22 em cada canal)', fn: tex((d, w, h) => { for (let y = 0; y < (h / 3 | 0); y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; d[o] = Math.min(255, d[o] + 22); d[o + 1] = Math.min(255, d[o + 1] + 22); d[o + 2] = Math.min(255, d[o + 2] + 22); } }) },

  /* ---- SEAM (detector-de-seam) ---- */
  'seam:bordaDireita': { dom: 'seam', desc: 'coluna da direita destoa da esquerda (wrap L≠R)', fn: tex((d, w, h) => { for (let y = 0; y < h; y++) { const o = (y * w + (w - 1)) * 4; d[o] = 240; d[o + 1] = 20; d[o + 2] = 20; } }) },
  'seam:bordaTopo': { dom: 'seam', desc: 'linha do topo destoa da base (wrap T≠B)', fn: tex((d, w, h) => { for (let x = 0; x < w; x++) { const o = x * 4; d[o] = 20; d[o + 1] = 20; d[o + 2] = 240; } }) },

  /* ---- BANDING / RUÍDO (detector-de-banding) ---- */
  'banding:faixaChapada': { dom: 'banding', desc: 'faixa horizontal de cor única (banding)', fn: tex((d, w, h) => { const y0 = h / 2 | 0; for (let y = y0; y < y0 + 10 && y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; d[o] = 110; d[o + 1] = 110; d[o + 2] = 110; } }) },
  'banding:ruidoAleatorio': { dom: 'banding', desc: 'bloco de ruído RGB aleatório (chuvisco)', fn: tex((d, w, h) => { let s = 12345; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let y = 8; y < 24 && y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; d[o] = r() * 255; d[o + 1] = r() * 255; d[o + 2] = r() * 255; } }) },

  /* ---- ÓRFÃOS (contador-de-pixels-orfaos) ---- */
  'orfaos:pixelsIlhados': { dom: 'orfaos', desc: 'pixels isolados de 1px (cor solta, sem vizinho igual)', fn: tex((d, w, h) => { for (const [x, y] of [[9, 9], [29, 19], [49, 39], [19, 47], [40, 7]]) { if (x < w && y < h) { const o = (y * w + x) * 4; d[o] = 255; d[o + 1] = 0; d[o + 2] = 255; } } }) },

  /* ==== ADVERSARIAIS (dificil): a versão SUTIL de cada defeito — mede o PISO de
     sensibilidade. Perder aqui é honesto ("pega o óbvio, não o sutil"), não
     motivo pra re-tunar até quebrar a precisão nos casos limpos. ==== */
  'seam:sutil': { dom: 'seam', dificil: true, desc: 'costura SUTIL: coluna direita clareada +48 (texturada, não chapada)', fn: tex((d, w, h) => { for (let y = 0; y < h; y++) { const o = (y * w + (w - 1)) * 4; d[o] = Math.min(255, d[o] + 48); d[o + 1] = Math.min(255, d[o + 1] + 48); d[o + 2] = Math.min(255, d[o + 2] + 48); } }) },
  'banding:ruidoSutil': { dom: 'banding', dificil: true, desc: 'ruido MODERADO (diferenca adjacente ~110, abaixo do chuvisco puro)', fn: tex((d, w, h) => { let s = 999; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let y = 8; y < 24 && y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; const j = (r() - 0.5) * 110; d[o] = Math.max(0, Math.min(255, d[o] + j)); d[o + 1] = Math.max(0, Math.min(255, d[o + 1] + j)); d[o + 2] = Math.max(0, Math.min(255, d[o + 2] + j)); } }) },
  'paleta:desvioUmTom': { dom: 'paleta', dificil: true, desc: 'desvio de UM tom so (+18) num bloco (a Regra B pede >=2 tons)', fn: tex((d, w, h) => { const b = (5 * w + 5) * 4, alvo = [d[b], d[b + 1], d[b + 2]]; for (let y = 0; y < (h / 3 | 0); y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (d[o] === alvo[0] && d[o + 1] === alvo[1] && d[o + 2] === alvo[2]) { d[o] = Math.min(255, d[o] + 18); d[o + 1] = Math.min(255, d[o + 1] + 18); d[o + 2] = Math.min(255, d[o + 2] + 18); } } }) },
};

export const DOMINIOS = [...new Set(Object.values(MUT).map((m) => m.dom))];
