/* contador-de-pixels-orfaos [orfaos] — caça pixel ÓRFÃO na textura: componente
   conexo de 1px (sem vizinho igual em 8-viz), de uma cor RARA no tile, que
   destoa muito da vizinhança. É o defeito clássico "sujeira" — um ponto solto
   que ninguém pintou de propósito.
   TENSÃO: texturas limpas têm pontinhos intencionais (flor 2×2, glint, grão).
   Filtros que separam o órfão das miçangas:
     · isolado   — nenhum vizinho 8-viz da MESMA cor (comp. de tamanho 1);
     · raro      — a cor aparece ≤ RARO vezes no tile inteiro (miçanga/padrão
                   reaparece; sujeira injetada é quase-única). Isso derruba o
                   defeito de PALETA (80 magentas iguais → cor não é rara);
     · contraste — dista ≥ CONTRA da vizinhança (destoa de verdade);
     · poucos    — nº de órfãos dentro de [MIN, MAX]. Chuvisco/ruído gera
                   centenas de pixels raros isolados: isso é BANDING, não órfão. */
export const id = 'contador-de-pixels-orfaos';
export const dom = 'orfaos';

const RARO = 8;      // cor considerada "solta" se aparece ≤ isso no tile
const CONTRA = 120;  // distância RGB mínima p/ vizinhança (destoa)
const MIN = 2;       // menos que isso pode ser detalhe intencional avulso
const MAX = 40;      // mais que isso é chuvisco/ruído (outro domínio), não órfão

export function analisar(built, { pixels }) {
  const f = [];
  const vistos = new Set();
  built.lotes.forEach((L, li) => {
    const cv = L.tex;
    if (!cv || vistos.has(cv)) return; vistos.add(cv);
    const { w, h, data } = pixels(cv);
    const key = (i) => { const o = i * 4; return data[o + 3] < 200 ? -1 : (data[o] << 16) | (data[o + 1] << 8) | data[o + 2]; };
    const hist = new Map();
    for (let i = 0; i < w * h; i++) { const k = key(i); if (k >= 0) hist.set(k, (hist.get(k) || 0) + 1); }
    const orfaos = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = key(y * w + x);
      if (k < 0 || (hist.get(k) || 0) > RARO) continue;   // transparente ou cor comum
      const r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255;
      let vizIgual = false, minD = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = key(ny * w + nx);
        if (nk === k) { vizIgual = true; break; }
        if (nk >= 0) { const d = Math.hypot(r - ((nk >> 16) & 255), g - ((nk >> 8) & 255), b - (nk & 255)); if (d < minD) minD = d; }
      }
      if (vizIgual || minD < CONTRA) continue;             // tem par vizinho, ou não destoa
      orfaos.push([x, y]);
    }
    if (orfaos.length >= MIN && orfaos.length <= MAX) {
      const amostra = orfaos.slice(0, 5).map(([x, y]) => `${x},${y}`).join(' ');
      f.push({ sev: 'erro', msg: `lote ${li}: ${orfaos.length} pixel(s) órfão(s) isolado(s) de cor rara/destoante @ ${amostra}` });
    }
  });
  return f;
}
