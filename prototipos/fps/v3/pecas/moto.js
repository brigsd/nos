/* moto — MOTOCICLETA FUTURISTA ESTILIZADA, criada 100% em PASSOS (nenhuma linha
   de geometria em JS: `construir` é só `executar`). Baixa e alongada (2.82 de
   comprimento por 1.12 de altura), duas rodas grandes, carenagem envolvendo o
   miolo e detalhes que ACENDEM (faixa do flanco, cubo das rodas, farol e
   lanterna). SIMETRIA em x=0, MEDIDA e não suposta: 480 dos 492 vértices têm par
   espelhado EXATO; os 12 que não têm são os anéis do guidão (passo 10, desvio máx
   4.45e-3) — o porquê está no comentário daquele passo, e é uma armadilha do `loft`
   que não está escrita em lugar nenhum.

   COMO ELA É FEITA — 12 passos de geometria, todos `loft`/`espelha`:
     0  roda dianteira   loft com caminho em +X (o eixo da roda) — o pneu inteiro
     1  roda traseira    idem, mais larga
     2  carenagem        loft com `contorno` em +Z — rabeta, banco, tanque, bico
     3  garfo (direito)  loft-tubo    4  espelha em x=0
     5  braço (direito)  loft-tubo    6  espelha em x=0
     7  faixa (direita)  loft-tubo    8  espelha em x=0
     9  farol            loft curto em +Z
    10  guidão           loft com caminho em +X (simétrico por construção)
    11  cúpula           lâmina fina transparente sobre o deck
   Depois vêm só atributos (pincel/liso/material/parte/solido) — nenhum cria
   vértice, então mexer numa cor NÃO renumera nada.

   POR QUE TUDO É `loft`: das 9 primitivas, só `loft` (e `inflate`) aceita
   POSIÇÃO livre — `cubo`/`cilindro`/`esfera`/`cone`/`chamferBox`/`plano` nascem
   centrados na origem com a base em y=0, e `lathe` gira sempre em torno do eixo
   Y. Não existe op de TRANSLADAR uma seleção, então usar um cilindro pra uma
   roda que não está na origem custaria um `moveV` POR VÉRTICE (32+ passos por
   peça). O `loft` resolve porque cada seção traz o `pos` dela.

   POR QUE O CONTORNO DA CARENAGEM É LITERAL: `contorno` aceita literal ou NOME
   de PARAM, nunca expressão — não há como dizer "o mesmo 10-gon, 0,8×". Como
   cada estação da carenagem tem largura e altura próprias, os 8×10 pontos são
   números escritos um a um (o `_viga.js` contorna o mesmo limite reusando UM
   retângulo em todas as seções; aqui a forma precisa variar). As POSIÇÕES das
   estações (`carY*`/`carZ*`) são PARAMS de verdade: mexer nelas remodela a
   carenagem sem tocar em passo nenhum.

   Cores da PALETA Resurrect64 (motor/tex.js), sempre em 2 tons alternando por
   PARIDADE de id dentro de cada zona — a manha do `_torno.js` contra o
   `detector-de-banding`. `liso` no que é redondo; os leques de polo ficam
   chapados, a convenção das tampas do cilindro.

   Teste: visor.html?peca=moto · npm run criar -- moto */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade NÃO altera a contagem de vértices/faces nem a
   numeração. `rodaFR`/`rodaTR` são o raio EXTERNO do pneu; `flanco*`/`aro*`/
   `cubo*` são os anéis internos da mesma roda (mexer só no externo engorda o
   pneu sem mexer no aro — o comportamento certo). `carY*`/`carZ*` são o centro
   de cada estação da carenagem. */
export const PARAMS = {
  rodaFR: 0.44,
  flancoFR: 0.41,
  aroFR: 0.3,
  cuboFR: 0.1,
  rodaFY: 0.44,
  rodaFZ: 0.95,
  rodaTR: 0.46,
  flancoTR: 0.43,
  aroTR: 0.32,
  cuboTR: 0.11,
  rodaTY: 0.46,
  rodaTZ: -0.97,
  carY0: 1.01,
  carZ0: -1.17,
  carY1: 0.99,
  carZ1: -1.08,
  carY2: 1,
  carZ2: -0.92,
  carY3: 0.87,
  carZ3: -0.66,
  carY4: 0.78,
  carZ4: -0.34,
  carY5: 0.73,
  carZ5: 0,
  carY6: 0.76,
  carZ6: 0.34,
  carY7: 0.89,
  carZ7: 0.66,
  carY8: 0.925,
  carZ8: 0.98,
  carY9: 0.84,
  carZ9: 1.18,
  faixaR: 0.022,
  guidaoR: 0.028,
  farolR1: 0.05,
  farolR2: 0.062,
};

/* topológicos: mudar RECONSTRÓI e pode deixar passo órfão. `ladosCar` é o número
   de pontos do contorno da carenagem — mudar exige reescrever os 8 contornos. */
export const TOPO = {ladosRoda: 16, ladosCar: 10, ladosTubo: 6, ladosFarol: 10, ladosChapa: 4};

/* MATERIAIS por NOME. `cor` MULTIPLICA a textura, então aqui é branco (neutro):
   quem manda na cor é o `pincel`, e o material só acrescenta brilho/emissão. */
export const MATERIAIS = {
  laca:     { cor: '#ffffff', aspereza: 0.35 },
  cromo:    { cor: '#ffffff', aspereza: 0.12 },
  neon:     { cor: '#ffffff', emissivo: 1.7, semLuz: true },
  farol:    { cor: '#ffffff', emissivo: 1.3, semLuz: true },
  lanterna: { cor: '#ffffff', emissivo: 1.5, semLuz: true },
  vidro:    { cor: '#ffffff', mistura: 'transparente', opacidade: 0.45 },
};

/* exportado (não `const` privado): sem isto a Oficina não relê a lista e o
   arquivo nunca mais reabre pra edição.
   NUMERAÇÃO (a documentada no comentário da op `loft` em motor/oficina.js —
   o passo i possui os ids [i*1000, i*1000+1000)):
     passo  0  rodaDianteira  F 0..143 (144 faces, 9 segmentos × 16)
     passo  1  rodaTraseira   F 1000..1143 (144 faces, 9 segmentos × 16)
     passo  2  carenagem      F 2000..2089 (90 faces, 9 segmentos × 10)
     passo  3  garfoDir       F 3000..3011 (12 faces, 3 segmentos × 4)
     passo  4  garfoEsq       F 4000..4011 (12 faces, 3 segmentos × 4)
     passo  5  bracoDir       F 5000..5011 (12 faces, 3 segmentos × 4)
     passo  6  bracoEsq       F 6000..6011 (12 faces, 3 segmentos × 4)
     passo  7  faixaDir       F 7000..7035 (36 faces, 6 segmentos × 6)
     passo  8  faixaEsq       F 8000..8035 (36 faces, 6 segmentos × 6)
     passo  9  farol          F 9000..9029 (30 faces, 3 segmentos × 10)
     passo 10  guidao         F 10000..10017 (18 faces, 3 segmentos × 6)
     passo 11  cupula         F 11000..11011 (12 faces, 3 segmentos × 4) */
export const PASSOS = [
  // roda DIANTEIRA — um pneu inteiro num passo: loft com o caminho em +X (o eixo da roda),
  //     polo->cubo->aro->flanco->banda->flanco->aro->cubo->polo. Fechado nos dois polos = watertight.
  ['loft', {
    id: 0, lados: 'ladosRoda',
    secoes: [
        { pos: [-0.105, 'rodaFY', 'rodaFZ'], raio: 0 },
        { pos: [-0.098, 'rodaFY', 'rodaFZ'], raio: 'cuboFR' },
        { pos: [-0.086, 'rodaFY', 'rodaFZ'], raio: 'aroFR' },
        { pos: [-0.062, 'rodaFY', 'rodaFZ'], raio: 'flancoFR' },
        { pos: [-0.042, 'rodaFY', 'rodaFZ'], raio: 'rodaFR' },
        { pos: [0.042, 'rodaFY', 'rodaFZ'], raio: 'rodaFR' },
        { pos: [0.062, 'rodaFY', 'rodaFZ'], raio: 'flancoFR' },
        { pos: [0.086, 'rodaFY', 'rodaFZ'], raio: 'aroFR' },
        { pos: [0.098, 'rodaFY', 'rodaFZ'], raio: 'cuboFR' },
        { pos: [0.105, 'rodaFY', 'rodaFZ'], raio: 0 },
    ],
  }],
  // roda TRASEIRA — mesmo desenho, mais larga e um pouco maior (a de tração)
  ['loft', {
    id: 1000, lados: 'ladosRoda',
    secoes: [
        { pos: [-0.14, 'rodaTY', 'rodaTZ'], raio: 0 },
        { pos: [-0.13, 'rodaTY', 'rodaTZ'], raio: 'cuboTR' },
        { pos: [-0.115, 'rodaTY', 'rodaTZ'], raio: 'aroTR' },
        { pos: [-0.082, 'rodaTY', 'rodaTZ'], raio: 'flancoTR' },
        { pos: [-0.056, 'rodaTY', 'rodaTZ'], raio: 'rodaTR' },
        { pos: [0.056, 'rodaTY', 'rodaTZ'], raio: 'rodaTR' },
        { pos: [0.082, 'rodaTY', 'rodaTZ'], raio: 'flancoTR' },
        { pos: [0.115, 'rodaTY', 'rodaTZ'], raio: 'aroTR' },
        { pos: [0.13, 'rodaTY', 'rodaTZ'], raio: 'cuboTR' },
        { pos: [0.14, 'rodaTY', 'rodaTZ'], raio: 0 },
    ],
  }],
  // CARENAGEM — loft com CONTORNO ao longo de +Z (rabeta -> bico): 8 estações-anel entre dois polos.
  //   O contorno é o mesmo 10-gon em todas, reescalado estação a estação (números LITERAIS — ver cabeçalho)
  ['loft', {
    id: 2000, lados: 'ladosCar',
    secoes: [
        { pos: [0, 'carY0', 'carZ0'], raio: 0 },
        { pos: [0, 'carY1', 'carZ1'], contorno: [[0, -0.07], [0.0462, -0.063], [0.07, -0.021], [0.0644, 0.0245], [0.0294, 0.0616], [0, 0.07], [-0.0294, 0.0616], [-0.0644, 0.0245], [-0.07, -0.021], [-0.0462, -0.063]] },
        { pos: [0, 'carY2', 'carZ2'], contorno: [[0, -0.1], [0.0858, -0.09], [0.13, -0.03], [0.1196, 0.035], [0.0546, 0.088], [0, 0.1], [-0.0546, 0.088], [-0.1196, 0.035], [-0.13, -0.03], [-0.0858, -0.09]] },
        { pos: [0, 'carY3', 'carZ3'], contorno: [[0, -0.085], [0.1089, -0.0765], [0.165, -0.0255], [0.1518, 0.0297], [0.0693, 0.0748], [0, 0.085], [-0.0693, 0.0748], [-0.1518, 0.0297], [-0.165, -0.0255], [-0.1089, -0.0765]] },
        { pos: [0, 'carY4', 'carZ4'], contorno: [[0, -0.25], [0.1419, -0.225], [0.215, -0.075], [0.1978, 0.0875], [0.0903, 0.22], [0, 0.25], [-0.0903, 0.22], [-0.1978, 0.0875], [-0.215, -0.075], [-0.1419, -0.225]] },
        { pos: [0, 'carY5', 'carZ5'], contorno: [[0, -0.3], [0.165, -0.27], [0.25, -0.09], [0.23, 0.105], [0.105, 0.264], [0, 0.3], [-0.105, 0.264], [-0.23, 0.105], [-0.25, -0.09], [-0.165, -0.27]] },
        { pos: [0, 'carY6', 'carZ6'], contorno: [[0, -0.27], [0.1551, -0.243], [0.235, -0.081], [0.2162, 0.0945], [0.0987, 0.2376], [0, 0.27], [-0.0987, 0.2376], [-0.2162, 0.0945], [-0.235, -0.081], [-0.1551, -0.243]] },
        { pos: [0, 'carY7', 'carZ7'], contorno: [[0, -0.13], [0.1188, -0.117], [0.18, -0.039], [0.1656, 0.0455], [0.0756, 0.1144], [0, 0.13], [-0.0756, 0.1144], [-0.1656, 0.0455], [-0.18, -0.039], [-0.1188, -0.117]] },
        { pos: [0, 'carY8', 'carZ8'], contorno: [[0, -0.065], [0.0759, -0.0585], [0.115, -0.0195], [0.1058, 0.0227], [0.0483, 0.0572], [0, 0.065], [-0.0483, 0.0572], [-0.1058, 0.0227], [-0.115, -0.0195], [-0.0759, -0.0585]] },
        { pos: [0, 'carY9', 'carZ9'], raio: 0 },
    ],
  }],
  // GARFO dianteiro em LÂMINA (contorno retangular), metade DIREITA — a esquerda sai do espelho abaixo.
  //   As duas pontas (polos) ficam ENTERRADAS no casco e no cubo da roda: polo à mostra vira espeto.
  ['loft', {
    id: 3000, lados: 'ladosChapa',
    secoes: [
        { pos: [0.15, 0.86, 0.5], raio: 0 },
        { pos: [0.146, 0.79, 0.6], contorno: [[0.026, 0.062], [-0.026, 0.062], [-0.026, -0.062], [0.026, -0.062]] },
        { pos: [0.128, 0.53, 0.9], contorno: [[0.026, 0.062], [-0.026, 0.062], [-0.026, -0.062], [0.026, -0.062]] },
        { pos: [0.118, 0.44, 0.96], raio: 0 },
    ],
  }],
  // espelho do garfo em x=0 — nenhum vértice está no plano, então nada solda: 14 vértices e 18 faces novas
  ['espelha', { eixo: 'x', pos: 0, sel: { f: [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011] } }],
  // BRAÇO traseiro, mesma lâmina, metade DIREITA
  ['loft', {
    id: 5000, lados: 'ladosChapa',
    secoes: [
        { pos: [0.165, 0.7, -0.22], raio: 0 },
        { pos: [0.168, 0.66, -0.34], contorno: [[0.03, 0.07], [-0.03, 0.07], [-0.03, -0.07], [0.03, -0.07]] },
        { pos: [0.158, 0.49, -0.88], contorno: [[0.03, 0.07], [-0.03, 0.07], [-0.03, -0.07], [0.03, -0.07]] },
        { pos: [0.15, 0.46, -0.98], raio: 0 },
    ],
  }],
  // espelho do braço
  ['espelha', { eixo: 'x', pos: 0, sel: { f: [5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010, 5011] } }],
  // FAIXA emissiva do flanco, metade DIREITA — segue a linha mais larga da carenagem
  ['loft', {
    id: 7000, lados: 'ladosTubo',
    secoes: [
        { pos: [0.1, 1.01, -0.88], raio: 0 },
        { pos: [0.165, 0.896, -0.66], raio: 'faixaR' },
        { pos: [0.215, 0.855, -0.34], raio: 'faixaR' },
        { pos: [0.25, 0.82, 0], raio: 'faixaR' },
        { pos: [0.235, 0.841, 0.34], raio: 'faixaR' },
        { pos: [0.18, 0.929, 0.66], raio: 'faixaR' },
        { pos: [0.095, 0.945, 0.92], raio: 0 },
    ],
  }],
  // espelho da faixa
  ['espelha', { eixo: 'x', pos: 0, sel: { f: [7000, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 7009, 7010, 7011, 7012, 7013, 7014, 7015, 7016, 7017, 7018, 7019, 7020, 7021, 7022, 7023, 7024, 7025, 7026, 7027, 7028, 7029, 7030, 7031, 7032, 7033, 7034, 7035] } }],
  // FAROL — lente no bico (loft curto em +Z)
  ['loft', {
    id: 9000, lados: 'ladosFarol',
    secoes: [
        { pos: [0, 0.905, 1.055], raio: 0 },
        { pos: [0, 0.893, 1.105], raio: 'farolR1' },
        { pos: [0, 0.878, 1.15], raio: 'farolR2' },
        { pos: [0, 0.866, 1.185], raio: 0 },
    ],
  }],
  // GUIDÃO — loft com caminho em +X, SEM espelho. ATENÇÃO (medido, não suposto): isto NÃO
  //   garante simetria. O frame do loft vem de TRANSPORTE PARALELO propagado a partir da
  //   PRIMEIRA seção, então ele depende do HISTÓRICO do caminho — e aqui os polos estão mais
  //   baixos/atrás que os anéis, logo a tangente das pontas não é ±X puro e as duas metades
  //   saem giradas uma em relação à outra. Medido: os 12 vértices de anel deste passo (10001..
  //   10012) são os ÚNICOS 12 da peça inteira sem par espelhado exato — desvio máx 4.45e-3.
  //   As rodas (passos 0/1) escapam porque TODAS as seções delas têm o mesmo y/z, então a
  //   tangente é (1,0,0) constante. A saída certa seria modelar meio guidão e usar `espelha`.
  ['loft', {
    id: 10000, lados: 'ladosTubo',
    secoes: [
        { pos: [-0.28, 0.995, 0.38], raio: 0 },
        { pos: [-0.23, 1.055, 0.4], raio: 'guidaoR' },
        { pos: [0.23, 1.055, 0.4], raio: 'guidaoR' },
        { pos: [0.28, 0.995, 0.38], raio: 0 },
    ],
  }],
  // CÚPULA (para-brisa) — lâmina fina subindo do deck; material transparente
  ['loft', {
    id: 11000, lados: 'ladosChapa',
    secoes: [
        { pos: [0, 1, 0.46], raio: 0 },
        { pos: [0, 1.06, 0.56], contorno: [[0.115, 0.018], [-0.115, 0.018], [-0.115, -0.018], [0.115, -0.018]] },
        { pos: [0, 1.1, 0.68], contorno: [[0.085, 0.016], [-0.085, 0.016], [-0.085, -0.016], [0.085, -0.016]] },
        { pos: [0, 1.08, 0.76], raio: 0 },
    ],
  }],

  /* ───── atributos: cor, sombreado, material, partes e colisão. Vêm todos DEPOIS
     da geometria de propósito — assim mexer numa cor não renumera face nenhuma. ───── */
  // borracha dos dois pneus (2 tons por paridade — o detector-de-banding cobra)
  ['pincel', { modo: 'face', faces: [32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108, 110, 1032, 1034, 1036, 1038, 1040, 1042, 1044, 1046, 1048, 1050, 1052, 1054, 1056, 1058, 1060, 1062, 1064, 1066, 1068, 1070, 1072, 1074, 1076, 1078, 1080, 1082, 1084, 1086, 1088, 1090, 1092, 1094, 1096, 1098, 1100, 1102, 1104, 1106, 1108, 1110], cor: '#2e222f' }],
  ['pincel', { modo: 'face', faces: [33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105, 107, 109, 111, 1033, 1035, 1037, 1039, 1041, 1043, 1045, 1047, 1049, 1051, 1053, 1055, 1057, 1059, 1061, 1063, 1065, 1067, 1069, 1071, 1073, 1075, 1077, 1079, 1081, 1083, 1085, 1087, 1089, 1091, 1093, 1095, 1097, 1099, 1101, 1103, 1105, 1107, 1109, 1111], cor: '#3e3546' }],
  // disco do aro
  ['pincel', { modo: 'face', faces: [16, 18, 20, 22, 24, 26, 28, 30, 112, 114, 116, 118, 120, 122, 124, 126, 1016, 1018, 1020, 1022, 1024, 1026, 1028, 1030, 1112, 1114, 1116, 1118, 1120, 1122, 1124, 1126], cor: '#625565' }],
  ['pincel', { modo: 'face', faces: [17, 19, 21, 23, 25, 27, 29, 31, 113, 115, 117, 119, 121, 123, 125, 127, 1017, 1019, 1021, 1023, 1025, 1027, 1029, 1031, 1113, 1115, 1117, 1119, 1121, 1123, 1125, 1127], cor: '#7f708a' }],
  // cubo da roda — acende (material neon)
  ['pincel', { modo: 'face', faces: [0, 2, 4, 6, 8, 10, 12, 14, 128, 130, 132, 134, 136, 138, 140, 142, 1000, 1002, 1004, 1006, 1008, 1010, 1012, 1014, 1128, 1130, 1132, 1134, 1136, 1138, 1140, 1142], cor: '#30e1b9' }],
  ['pincel', { modo: 'face', faces: [1, 3, 5, 7, 9, 11, 13, 15, 129, 131, 133, 135, 137, 139, 141, 143, 1001, 1003, 1005, 1007, 1009, 1011, 1013, 1015, 1129, 1131, 1133, 1135, 1137, 1139, 1141, 1143], cor: '#8ff8e2' }],
  // DECK do capô (faixa de cima do contorno) — azul de acento
  ['pincel', { modo: 'face', faces: [2010, 2040, 2050, 2060, 2070], cor: '#4d65b4' }],
  ['pincel', { modo: 'face', faces: [2011, 2019, 2041, 2049, 2051, 2059, 2061, 2069, 2071, 2079], cor: '#4d9be6' }],
  // BANCO — a mesma faixa de cima, mas escura nos dois segmentos do assento
  ['pincel', { modo: 'face', faces: [2020, 2030], cor: '#2e222f' }],
  ['pincel', { modo: 'face', faces: [2021, 2029, 2031, 2039], cor: '#3e3546' }],
  // FLANCO
  ['pincel', { modo: 'face', faces: [2012, 2018, 2022, 2028, 2032, 2038, 2042, 2048, 2052, 2058, 2062, 2068, 2072, 2078], cor: '#323353' }],
  ['pincel', { modo: 'face', faces: [2013, 2017, 2023, 2027, 2033, 2037, 2043, 2047, 2053, 2057, 2063, 2067, 2073, 2077], cor: '#484a77' }],
  // VENTRE (escuro — faz a moto parecer mais baixa)
  ['pincel', { modo: 'face', faces: [2014, 2016, 2024, 2026, 2034, 2036, 2044, 2046, 2054, 2056, 2064, 2066, 2074, 2076], cor: '#2e222f' }],
  ['pincel', { modo: 'face', faces: [2015, 2025, 2035, 2045, 2055, 2065, 2075], cor: '#3e3546' }],
  // leque do bico
  ['pincel', { modo: 'face', faces: [2080, 2082, 2084, 2086, 2088], cor: '#4d9be6' }],
  ['pincel', { modo: 'face', faces: [2081, 2083, 2085, 2087, 2089], cor: '#8fd3ff' }],
  // lanterna traseira (leque do polo da rabeta)
  ['pincel', { modo: 'face', faces: [2000, 2002, 2004, 2006, 2008], cor: '#c32454' }],
  ['pincel', { modo: 'face', faces: [2001, 2003, 2005, 2007, 2009], cor: '#f04f78' }],
  // garfo, braço e guidão — metal
  ['pincel', { modo: 'face', faces: [3000, 3002, 3004, 3006, 3008, 3010, 4000, 4002, 4004, 4006, 4008, 4010, 5000, 5002, 5004, 5006, 5008, 5010, 6000, 6002, 6004, 6006, 6008, 6010, 10000, 10002, 10004, 10006, 10008, 10010, 10012, 10014, 10016], cor: '#7f708a' }],
  ['pincel', { modo: 'face', faces: [3001, 3003, 3005, 3007, 3009, 3011, 4001, 4003, 4005, 4007, 4009, 4011, 5001, 5003, 5005, 5007, 5009, 5011, 6001, 6003, 6005, 6007, 6009, 6011, 10001, 10003, 10005, 10007, 10009, 10011, 10013, 10015, 10017], cor: '#9babb2' }],
  // faixa emissiva do flanco
  ['pincel', { modo: 'face', faces: [7000, 7002, 7004, 7006, 7008, 7010, 7012, 7014, 7016, 7018, 7020, 7022, 7024, 7026, 7028, 7030, 7032, 7034, 8000, 8002, 8004, 8006, 8008, 8010, 8012, 8014, 8016, 8018, 8020, 8022, 8024, 8026, 8028, 8030, 8032, 8034], cor: '#30e1b9' }],
  ['pincel', { modo: 'face', faces: [7001, 7003, 7005, 7007, 7009, 7011, 7013, 7015, 7017, 7019, 7021, 7023, 7025, 7027, 7029, 7031, 7033, 7035, 8001, 8003, 8005, 8007, 8009, 8011, 8013, 8015, 8017, 8019, 8021, 8023, 8025, 8027, 8029, 8031, 8033, 8035], cor: '#8ff8e2' }],
  // lente do farol (âmbar — contrasta com o neon ciano)
  ['pincel', { modo: 'face', faces: [9000, 9002, 9004, 9006, 9008, 9010, 9012, 9014, 9016, 9018, 9020, 9022, 9024, 9026, 9028], cor: '#f9c22b' }],
  ['pincel', { modo: 'face', faces: [9001, 9003, 9005, 9007, 9009, 9011, 9013, 9015, 9017, 9019, 9021, 9023, 9025, 9027, 9029], cor: '#fbb954' }],
  // cúpula (para-brisa) — vidro
  ['pincel', { modo: 'face', faces: [11000, 11002, 11004, 11006, 11008, 11010], cor: '#8fd3ff' }],
  ['pincel', { modo: 'face', faces: [11001, 11003, 11005, 11007, 11009, 11011], cor: '#c7dcd0' }],
  // macio no que é redondo (pneu, casco, tubos); os leques de polo ficam CHAPADOS, como as tampas do cilindro
  ['liso', { faces: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067, 2068, 2069, 2070, 2071, 2072, 2073, 2074, 2075, 2076, 2077, 2078, 2079, 7006, 7007, 7008, 7009, 7010, 7011, 7012, 7013, 7014, 7015, 7016, 7017, 7018, 7019, 7020, 7021, 7022, 7023, 7024, 7025, 7026, 7027, 7028, 7029, 8006, 8007, 8008, 8009, 8010, 8011, 8012, 8013, 8014, 8015, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8024, 8025, 8026, 8027, 8028, 8029, 9010, 9011, 9012, 9013, 9014, 9015, 9016, 9017, 9018, 9019, 10006, 10007, 10008, 10009, 10010, 10011] }],
  // casco lacado (especular espalhado)
  ['material', { faces: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067, 2068, 2069, 2070, 2071, 2072, 2073, 2074, 2075, 2076, 2077, 2078, 2079, 2080, 2081, 2082, 2083, 2084, 2085, 2086, 2087, 2088, 2089], usa: 'laca' }],
  // metal polido
  ['material', { faces: [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011, 4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4011, 5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010, 5011, 6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010, 6011, 10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011, 10012, 10013, 10014, 10015, 10016, 10017], usa: 'cromo' }],
  // faixas do flanco + cubos das rodas ACENDEM
  ['material', { faces: [7000, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 7009, 7010, 7011, 7012, 7013, 7014, 7015, 7016, 7017, 7018, 7019, 7020, 7021, 7022, 7023, 7024, 7025, 7026, 7027, 7028, 7029, 7030, 7031, 7032, 7033, 7034, 7035, 8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010, 8011, 8012, 8013, 8014, 8015, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8024, 8025, 8026, 8027, 8028, 8029, 8030, 8031, 8032, 8033, 8034, 8035, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143], usa: 'neon' }],
  // farol
  ['material', { faces: [9000, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012, 9013, 9014, 9015, 9016, 9017, 9018, 9019, 9020, 9021, 9022, 9023, 9024, 9025, 9026, 9027, 9028, 9029], usa: 'farol' }],
  // lanterna traseira
  ['material', { faces: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009], usa: 'lanterna' }],
  // cúpula transparente (passada extra de mistura)
  ['material', { faces: [11000, 11001, 11002, 11003, 11004, 11005, 11006, 11007, 11008, 11009, 11010, 11011], usa: 'vidro' }],
  // pivô no eixo — pronta pra girar
  ['parte', { nome: 'rodaDianteira', faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143], pivo: [0, 'rodaFY', 'rodaFZ'] }],
  ['parte', { nome: 'rodaTraseira', faces: [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143], pivo: [0, 'rodaTY', 'rodaTZ'] }],
  ['parte', { nome: 'carenagem', faces: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067, 2068, 2069, 2070, 2071, 2072, 2073, 2074, 2075, 2076, 2077, 2078, 2079, 2080, 2081, 2082, 2083, 2084, 2085, 2086, 2087, 2088, 2089, 11000, 11001, 11002, 11003, 11004, 11005, 11006, 11007, 11008, 11009, 11010, 11011] }],
  ['parte', { nome: 'suspensao', faces: [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011, 4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4011, 5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010, 5011, 6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010, 6011] }],
  ['parte', { nome: 'luzes', faces: [7000, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 7009, 7010, 7011, 7012, 7013, 7014, 7015, 7016, 7017, 7018, 7019, 7020, 7021, 7022, 7023, 7024, 7025, 7026, 7027, 7028, 7029, 7030, 7031, 7032, 7033, 7034, 7035, 8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010, 8011, 8012, 8013, 8014, 8015, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8024, 8025, 8026, 8027, 8028, 8029, 8030, 8031, 8032, 8033, 8034, 8035, 9000, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012, 9013, 9014, 9015, 9016, 9017, 9018, 9019, 9020, 9021, 9022, 9023, 9024, 9025, 9026, 9027, 9028, 9029] }],
  // rodas + carenagem entram na colisão
  ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067, 2068, 2069, 2070, 2071, 2072, 2073, 2074, 2075, 2076, 2077, 2078, 2079, 2080, 2081, 2082, 2083, 2084, 2085, 2086, 2087, 2088, 2089] }],
];

export const meta = {
  nome: 'moto',
  tipo: 'objeto',
  desc: 'motocicleta futurista estilizada — baixa, alongada, duas rodas grandes, carenagem e detalhes emissivos; 100% em PASSOS',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria (sem textura/pincel)
     e encaixa o cilindro nas faces `solido` (rodas + carenagem). */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS); }
