/* PEÇA-EXEMPLO do P8b+P8c do playground: uma PEDRA — `chamferBox` (caixa
   cantelada: cantos e arestas chanfrados, analítica, uma fórmula fechada como
   cubo/esfera/cone) seguida de `displace` (relevo procedural por ruído
   seedado, ao longo da normal média). As duas juntas são o par natural: o
   chanfro já tira a cara de "caixote" (sem virar redonda — ainda são faces
   PLANAS), e o displace quebra a monotonia das faces planas com um relevo
   orgânico determinístico — o resultado lembra uma pedra/rocha lascada sem
   ser nem um cubo nem uma esfera.

   PROVA (o motivo de existir): `displace` só MOVE vértice que já existe (não
   cria id, não muda topologia) — então o manifold do `chamferBox` de baixo
   (watertight por construção, travado por teste) sobrevive intacto por cima
   do relevo; é o mesmo raciocínio do `rotaciona` sobre qualquer malha
   fechada, agora com uma op nova. `chamfro`/`amp`/`freq`/`semente` são todos
   PARAMS citados por NOME (não literal) — troca o visual sem tocar a lista.

   Teste: visor.html?peca=_pedra · npm run peca -- _pedra */
import { executar, colisaoDe } from '../motor/oficina.js';

export const PARAMS = {
  larg: 1.4, alt: 1.15, prof: 1.3, chanfro: 0.22,   // a caixa cantelada de base
  amp: 0.06, freq: 2.2, semente: 11,                // o relevo por cima
};
export const TOPO = {};   // nem chamferBox nem displace têm parâmetro que muda CONTAGEM — sem TOPO

/* NUMERAÇÃO: chamferBox sozinho já é 24 vértices / 26 faces SEMPRE (não tem
   TOPO — a contagem não depende de PARAM nenhum, documentado no núcleo);
   displace não cria nem apaga nada. Os índices de `pincel`/`solido` abaixo
   são literais 0..25 por isso — não precisam ser medidos peça a peça, como
   o `_corpo.js` (inflate) precisa (lá a contagem depende da grade de voxel). */
export const PASSOS = [
  ['chamferBox', { id: 0, larg: 'larg', alt: 'alt', prof: 'prof', chanfro: 'chanfro' }],
  ['displace', { amplitude: 'amp', frequencia: 'freq', semente: 'semente' }],

  // 2 tons, alternando por PARIDADE de id — não um bloco chapado só (o detector-de-banding cobra)
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => k * 2), cor: '#313638' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => k * 2 + 1), cor: '#9babb2' }],
  // a pedra inteira entra na colisão
  ['solido', { faces: Array.from({ length: 26 }, (_, k) => k) }],
];

export const meta = {
  nome: '_pedra',
  tipo: 'objeto',
  desc: 'pedra lascada — chamferBox (caixa cantelada) + displace (relevo por ruído seedado) — peça-exemplo do P8b/P8c do playground',
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
