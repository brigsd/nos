/* PEÇA-EXEMPLO do P6 do playground: um CORPO — o volume que só `inflate` faz
   hoje (dois contornos 2D, lado e topo, virando um sólido por interseção de
   prismas). É o caso que `docs/historico/playground.md` cita como motivação: "a régua
   do capítulo seguinte é o dragão... falta só a carne orgânica" — aqui é só
   um corpo oval achatado (o torso de um bicho pequeno), mas prova o
   mecanismo: `contornoLado` (plano z×y) e `contornoTopo` (plano z×x) são
   DOIS perfis INDEPENDENTES — nem o `lathe` (uma seção circular só, girada
   em Y) nem o `loft` com `raio` (seção circular também) conseguem um corpo
   MAIS LARGO que ALTO; aqui a largura (`ampTopo`) e a altura (`ampLado`) são
   números diferentes de propósito — o corpo sai ACHATADO, não redondo.

   OS DOIS CONTORNOS são GERADOS (não pontos soltos hand-tuned como o perfil
   do `_torno.js`): a função `ovo(zTras,zFrente,amp,n)` amostra um "ovo" —
   raio de Z diferente na METADE de trás (`zTras`) e na da frente (`zFrente`,
   maior — a cabeça é mais comprida que a cauda), amplitude `amp` no eixo
   perpendicular — CONTÍNUO na costura (cos(t)=0 nos dois polos t=π/2 e
   3π/2, onde as duas metades se encontram, então nunca dá pico). Os dois
   contornos usam o MESMO zTras/zFrente (o comprimento tem que CASAR entre
   lado e topo — é o mesmo eixo Z físico nas duas vistas) e amplitudes
   DIFERENTES (`ampLado` a altura, `ampTopo` a largura, maior — achatado).

   RESULTADO: superfície de voxel (facetada de propósito — a limitação
   honesta do `inflate`, documentada no núcleo: watertight POR CONSTRUÇÃO,
   não suave; `divisoes` maior deixa mais fino, ao custo de mais faces).
   Watertight provado por manifold (toda aresta dirigida pareada 1×) + volume
   assinado > 0 no teste.

   Segue o envelope (docs/oficina.md "Formato do arquivo gerado"): PARAMS/
   TOPO/PASSOS exportados (a Oficina relê a lista pra reabrir — os PONTOS já
   GERADOS, não a fórmula), `meta.colisao` CALCULADA por colisaoDe no
   carregamento (`solido` marca o corpo inteiro), `construir` = executar.
   Cores da PALETA Resurrect64 (motor/tex.js), 2 tons alternando por
   PARIDADE de id (a manha de sempre contra o `detector-de-banding`). SEM
   `liso`: a faceta do voxel é o ponto — suavizar esconderia a limitação
   documentada em vez de mostrá-la honestamente.

   Teste: visor.html?peca=_corpo · npm run peca -- _corpo */
import { executar, colisaoDe } from '../motor/oficina.js';

/* forma do "ovo": raio de Z por metade (a cabeça, zFrente, mais comprida
   que a cauda, zTras) + amplitude no eixo perpendicular. Mudar aqui NÃO
   altera a contagem de vértices/faces (só a FORMA) — a numeração depende só
   de `nPontos`/`divisoes` (TOPO). */
const zTras = 1.0, zFrente = 1.25, ampLado = 0.34, ampTopo = 0.5, nPontos = 16;
function ovo(amp) {
  const pts = [];
  for (let k = 0; k < nPontos; k++) {
    const t = (k / nPontos) * Math.PI * 2;
    const zr = Math.cos(t) >= 0 ? zFrente : zTras;   // continuo em t=π/2 e 3π/2 (cos(t)=0 nos dois -> as duas metades casam sem pico)
    pts.push([Math.cos(t) * zr, Math.sin(t) * amp]);
  }
  return pts;
}

export const PARAMS = {};
/* topológico: `divisoes` controla a FINURA da grade de voxel (muda a
   contagem) — mín 2 (o núcleo clampa sozinho). 12 fica bem abaixo do bloco
   de 1000 ids pra esse corpo (medido: ~216 faces). */
export const TOPO = { divisoes: 12 };

/* exportado (não `const`): sem isto a Oficina não relê a lista. NUMERAÇÃO
   (a documentada no comentário da op `inflate` em motor/oficina.js): emerge
   do SCAN determinístico da grade de voxel (sem fórmula fechada, ao
   contrário do lathe/loft) — travada por teste, não por contagem prevista
   aqui (a forma decide quantos voxels ficam "dentro"). */
export const PASSOS = [
  ['inflate', { contornoLado: ovo(ampLado), contornoTopo: ovo(ampTopo), divisoes: 'divisoes' }],

  // 2 tons, alternando por PARIDADE de id — não um bloco chapado só (o detector-de-banding cobra)
  ['pincel', { modo: 'face', faces: Array.from({ length: 108 }, (_, k) => k * 2), cor: '#7f708a' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 108 }, (_, k) => k * 2 + 1), cor: '#625565' }],
  // o corpo inteiro entra na colisão
  ['solido', { faces: Array.from({ length: 216 }, (_, k) => k) }],
];

export const meta = {
  nome: '_corpo',
  tipo: 'objeto',
  desc: 'corpo oval achatado (torso) — inflate: dois contornos independentes (lado+topo) viram volume — peça-exemplo do P6 do playground',
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
