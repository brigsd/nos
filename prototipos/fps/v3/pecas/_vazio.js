/* _vazio — fixture do P5 do playground: peça SEM geometria (0 passos), usada
   pela bancada de gabarito (tools/bancadas/gabarito.mjs) como a REFERÊNCIA DE
   FUNDO — o mesmo palco (céu/chão) que toda peça ganha, sem nenhum objeto por
   cima. A silhueta é extraída por DIFERENÇA contra este fundo, então ele
   precisa existir de verdade como peça (visor real, mesma câmera/palco) — não
   dá pra fabricar a cor do céu/chão à mão sem arriscar divergir do render.
   NÃO é peça-demonstração de nenhuma op; não entra em nenhum sweep por nome
   (prefixo `_`, como todo template).
   Teste: visor.html?peca=_vazio · npm run peca -- _vazio */
import { executar, colisaoDe } from '../motor/oficina.js';

export const PARAMS = {};
export const TOPO = {};
export const PASSOS = [];

export const meta = {
  nome: '_vazio',
  tipo: 'objeto',
  desc: 'fixture do P5 — 0 passos, só o palco padrão — referência de fundo da bancada de gabarito',
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
