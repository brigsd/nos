/* sandbox.mjs — roda o construir() de uma peça v3 em NODE PURO, sem browser.
   Um canvas-stub mínimo cobre o texCanvas/bufToCanvas (só usam createImageData/
   put/getImageData), então dá pra introspectar malhas E pixels de textura em ms,
   determinístico e paralelizável — a base do benchmark de senso crítico (D-60). */
function makeCanvas() {
  let W = 0, H = 0, buf = null;
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { buf = img.data; },
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: buf || new Uint8ClampedArray(w * h * 4) }),
    fillRect() {}, clearRect() {}, drawImage() {}, set fillStyle(v) {}, get fillStyle() { return '#000'; },
  };
  return { getContext: () => ctx, get width() { return W; }, set width(v) { W = v; }, get height() { return H; }, set height(v) { H = v; } };
}
if (!globalThis.document) globalThis.document = { createElement: () => makeCanvas() };

const V3 = new URL('../../../prototipos/fps/v3/', import.meta.url);
export async function construirPeca(nome, { TS = 4, mut = null } = {}) {
  const tex = await import(new URL('motor/tex.js', V3));
  const geo = await import(new URL('motor/geo.js', V3));
  const { m4 } = await import(new URL('motor/mat4.js', V3));
  const mod = await import(new URL(`pecas/${nome}.js`, V3));
  let erro = null, built = null;
  try { built = mod.construir({ TS, tex, geo, m4 }); if (mut) built = mut(built) || built; }
  catch (e) { erro = e; }
  return { meta: mod.meta, built, erro };
}
export function pixels(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return { w: canvas.width, h: canvas.height, data: d.data };
}
