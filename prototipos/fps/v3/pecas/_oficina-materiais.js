/* PEÇA-EXEMPLO da OFICINA (passo 12a): MATERIAIS OPACOS. Um toco com BRASA — um
   cilindro de casca (cor + aspereza) e o topo como brasa que BRILHA (emissivo +
   semLuz, ignora luz/sombra). Prova a cadeia do material: MATERIAIS declara os
   materiais POR NOME (como PARAMS/TOPO), a op `material` aponta faces pra um nome,
   `executar` recebe MATERIAIS e o adaptarV3 agrupa por material em LOTES; o render
   (render.js) aplica cor/emissivo/aspereza/semLuz POR LOTE (padrão do uRim). Segue o
   envelope: PARAMS/TOPO/MATERIAIS/PASSOS exportados, `meta.colisao` CALCULADA por
   colisaoDe, `construir` = executar. Teste: visor.html?peca=_oficina-materiais ·
   npm run peca -- _oficina-materiais */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudam à vontade, não renumeram. */
export const PARAMS = { raio: 0.5, altura: 0.85 };

/* topológico: `lados` muda a CONTAGEM (e os ids das faces das tampas). */
export const TOPO = { lados: 10 };

/* MATERIAIS (passo 12a): materiais POR NOME, como PARAMS/TOPO — a op `material`
   aponta faces pra um nome, e mudar o material aqui muda TODA a casca de uma vez (um
   dono só). `cor` multiplica a textura; `aspereza` espalha o especular; `emissivo`
   brilha ignorando luz; `semLuz` chapa (sem sombreamento). Só opaco no 12a. */
export const MATERIAIS = {
  casca: { cor: '#6b4a2f', aspereza: 0.9 },
  brasa: { cor: '#ff7326', emissivo: 1.4, semLuz: true },
};

/* faces do cilindro de 10 lados: 0..9 lados, 10 fundo (-y), 11 topo (+y). */
export const PASSOS = [
  ['cilindro', { id: 0, raio: 'raio', altura: 'altura', lados: 'lados' }],
  ['liso',     { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }],                 // barril macio
  ['material', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], usa: 'casca' }],   // casca: cor + brilho especular espalhado
  ['material', { faces: [11], usa: 'brasa' }],                             // topo: brasa que BRILHA (emissivo + semLuz)
  ['solido',   { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],             // corpo sólido (colisão); a brasa do topo não é parede
];

export const meta = {
  nome: '_oficina-materiais',
  tipo: 'objeto',
  desc: 'toco com brasa — peça-exemplo dos MATERIAIS OPACOS (cor/aspereza/emissivo/semLuz)',
  /* CALCULADA no load por colisaoDe (só geometria — material não muda colisão);
     recebe MATERIAIS pra a op `material` não gritar à toa. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS); }
