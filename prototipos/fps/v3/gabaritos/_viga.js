/* GABARITO do P5 do playground: o contorno de referência da `_viga`
   (pecas/_viga.js) no ângulo padrão 38° — o formato do P5 (docs/
   playground.md): pontos [x,y] normalizados 0..1 (x direita, y BAIXO — a
   convenção de imagem), fechado IMPLICITAMENTE (não repete o primeiro
   ponto), alça de curva RESERVADA no 3º elemento (a mesma lei fail-closed do
   lathe/loft, D-115 — validada em tools/bancadas/bench/gabarito-nucleo.mjs).

   TRAÇADO À MÃO olhando tools/bancadas/out/peca-_viga-38.png (o jeito real
   que uma IA autora um gabarito hoje — sem canvas ainda, a Aba Desenho é
   onda de interface, P9) — não é derivado da própria bancada de extração
   (senão a calibração seria circular). Contra a silhueta REAL medida por
   `tools/bancadas/gabarito.mjs`, este contorno dá IoU=0,88 — a amostra
   usada pra calibrar LIMIAR_IOU (0,55) em gabarito-nucleo.mjs.

   Teste: npm run gabarito -- _viga */
export const CONTORNOS = {
  '38': [
    [0.444, 0.431],
    [0.480, 0.451],
    [0.520, 0.593],
    [0.502, 0.682],
    [0.453, 0.632],
    [0.420, 0.510],
  ],
};
