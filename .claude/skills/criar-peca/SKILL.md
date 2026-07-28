---
name: criar-peca
description: CRIAR conteúdo do jogo NÓS como IA — objeto 3D, som, animação, esqueleto — escrevendo a peça como lista de PASSOS (o formato da Oficina) e provando com as bancadas (ver PNGs, medir som). Use SEMPRE que o ideador pedir pra criar/editar uma peça, um objeto, um som, uma animação ou qualquer conteúdo do Atelier (v3) — este é o manual de autoria; a skill `oficina` é pra mexer NA ferramenta, não pra usá-la.
---

# Criar peça — o manual de autoria da IA

Você não clica na Oficina — você **escreve a peça direto** (o mesmo formato que
a Oficina grava) e **vê/mede** pelas bancadas. O laço: escrever → `npm run peca`
→ LER os PNGs → auditar → iterar. Peça de objeto mora em
`prototipos/fps/v3/pecas/`, de som em `pecas-som/`. Prefixo `_` = exemplo/preset
(o `auditar` sem argumento pula os `_`).

## Objeto 3D — o formato (copie de `pecas/_oficina-toco.js`)

`PARAMS` (dimensionais — citados por NOME nos passos, mudar NÃO renumera) +
`TOPO` (topológicos — mudar RECONSTRÓI e pode deixar passo órfão) + `PASSOS`
(a lista `[['op',{...}],...]`) + `meta` com `colisao: colisaoDe(PASSOS, PARAMS,
TOPO)` (CHAMADA, não valor) + `construir = executar(...)`. **`PASSOS` exportado**,
senão a Oficina nunca mais reabre o arquivo.

**Identidade por bloco (`BLOCO=1000`):** o passo `i` possui os ids
`[i*1000, i*1000+1000)`. Um cilindro de `lados:8` no passo 0 cria vértices
0..15 (anel de baixo 0..7, de cima 8..15 — SEM vértice de centro; as tampas são
polígonos) e faces 0..9 (laterais 0..7, fundo 8, topo 9); um `extruda` no passo
1 cria a partir de 1000. A numeração depende só da POSIÇÃO do passo — id que
aponta pro nada GRITA (órfão), nunca corrompe.

**Lei que vale pra TODA op:** número tem que ser FINITO e ponto tem que ser
`[x,y,z]`. `NaN`/`Infinity` ou aridade errada = **throw** (a peça inteira morre,
de propósito). Não é preciosismo: num TOPO o estrago é invisível a todos os
gates — `lados: NaN` vira `lados: 3` calado (`NaN|0` = 0), o cilindro cai de
V=16/F=10 pra V=6/F=5 com malha limpa, e todo id de face dos passos seguintes
passa a apontar pra outra face.

**Vocabulário IMPLEMENTADO hoje** (o resto da tabela do `docs/oficina.md` é
roteiro, ainda não existe — não use; o plano de fechar as lacunas é o épico
`docs/historico/playground.md`, e esta tabela DEVE ser atualizada a cada op entregue):

| op | args | nota |
|---|---|---|
| `cubo` / `cilindro` | `id`, medidas, `lados` (cilindro) | geradores originais |
| `esfera` | `raio` (PARAM, 0.5), `aneis` (TOPO, 6, mín 2), `lados` (TOPO, 8, mín 3) | UV-sphere apoiada no chão (polo sul y=0, norte y=2·raio); numeração no comentário da op |
| `cone` | `raio` (PARAM, 0.5), `altura` (PARAM, 1), `lados` (TOPO, 8, mín 3) | anel da base b+0..b+lados−1 (y=0), ápice b+lados; tampa −y como o fundo do cilindro |
| `plano` | `largura` (PARAM, 1), `profundidade` (PARAM, 1), `seg` (TOPO, 1, mín 1) | grade XZ centrada na origem, y=0, linha a linha; seg² quads +y — o chão |
| `chamferBox` | `larg`/`alt`/`prof` (ou `lado`, PARAM — a convenção do cubo, chão embaixo), `chanfro` (PARAM, distância do corte) | o cubo com CANTOS E ARESTAS chanfrados — corte FLAT (não arredonda). SEM parâmetro TOPO: sempre 24 vértices/26 faces, não tem como estourar o bloco. `chanfro` precisa ser `>0` e `<min(larg/2,prof/2,alt/2)` (cortes de pontas opostas da mesma aresta não podem se cruzar) — fora da faixa GRITA e aborta (0V/0F) |
| `lathe` | `perfil:[[raio,y],...]` (≥2 pontos, PARAM), `lados` (TOPO, mín 3) | perfil 2D girado no eixo Y — generaliza a esfera (polo↔anel↔polo). Ponto de 2 elementos = canto reto PRA SEMPRE; ponto ≠ 2 elementos (a alça de curva reservada num 3º elemento, ou malformado) GRITA e ABORTA o passo (fail-closed). `raio` resolvido `===0` vira polo (1 vértice), `>0` vira anel (`lados` vértices), `<0` GRITA e aborta. Sem tampas automáticas: fechar uma ponta é terminar no eixo (raio 0) |
| `loft` | `secoes:[{pos:[x,y,z],raio} ou {pos,contorno:[[u,w],...]},...]` (≥2 seções, PARAM), `lados` (TOPO, mín 3) | seções ao longo de um CAMINHO 3D arbitrário — generaliza o lathe (que é o caso degenerado de caminho reto no eixo Y). Cada anel é orientado por TRANSPORTE PARALELO (não torce numa curva — o mesmo `quadro`/`transporta` do `galhoSeca` de `arvore-cartoon.js`, reimplementado local ao núcleo). `raio` resolvido `===0` vira polo, `>0` vira anel, `<0` GRITA e aborta — igual ao lathe. `contorno` (P5) troca o círculo por EXATAMENTE `lados` pontos `[u,w]` explícitos (estrela, hexágono, retângulo — não-circular) no plano local do anel; `raio` e `contorno` são mutuamente exclusivos (os dois juntos, ou nenhum, GRITA); ponto com aridade ≠ 2 (a alça de curva reservada) e winding CW/degenerado também GRITAM e ABORTAM. Também GRITAM e ABORTAM: seção malformada, `pos` com aridade ≠ 3, segmento de comprimento zero (duas seções na mesma posição) e CUSP (caminho dobrando ~180°) — nos dois últimos a tangente fica indefinida. Sem tampas automáticas: fechar uma ponta é terminar a seção com raio 0 |
| `moveV` | `v`, `d:[x,y,z]` | ADITIVO (`p+d`), nunca posição absoluta |
| `moveF` | `face`, `d:[x,y,z]` | move TODOS os cantos da face, ADITIVO; canto compartilhado com outra face move junto (use `extruda` antes se não quiser afetar vizinho) |
| `moveA` | `a`, `b`, `d:[x,y,z]` | move as duas pontas de uma aresta, ADITIVO — açúcar sobre dois `moveV`; não exige `a`/`b` ligados por face |
| `vira` | `face` | inverte o winding (reverte `f.vs`) — SINGULAR, uma face por passo. Virar face JÁ consistente desalinha o pareamento com as vizinhas (não é bug — use pra consertar face já de costas, não como correção automática) |
| `apagaFace` | `face` | remove a face; os vértices dela CONTINUAM existindo (buraco de propósito — porta, janela, preparo pra composição manual) |
| `displace` | `sel?` (o formato do `rotaciona`, default = malha inteira), `amplitude` (PARAM, 0.1), `frequencia` (PARAM, 1), `semente` (PARAM, 0) | desloca cada vértice ao longo da NORMAL MÉDIA (Newell das faces que o tocam) por ruído seedado determinístico (`ruido3` — value noise, [0,1) remapeado pra [−amplitude,+amplitude]). Vértice sem face nenhuma GRITA (sem normal pra seguir). Id-estável (não cria/apaga nada) — preserva manifold de malha já fechada. Peça-exemplo `_pedra.js` |
| `extruda` | `face`, `dist` | só face única; anel novo nasce no bloco do passo |
| `mescla` | `de:[ids]`, `para:id` | solda; face de área zero some quieta |
| `rotaciona` | `eixo` (`'x'\|'y'\|'z'`), `graus` (PARAM), `sel?` (`{v:[ids]}` e/ou `{f:[ids]}` e/ou `{regiao:{min,max}}` e/ou `{grupo:'nome'}`, default = malha inteira), `pivo?` (`[x,y,z]`, default = centroide da seleção) | SIMPLES: só move posição (`p' = pivo + R_eixo(graus)·(p−pivo)`); NUNCA cria vértice/face nem renumera. `regiao` é caixa delimitadora (min/max os dois OBRIGATÓRIOS, sem `Infinity`); `grupo` são as faces daquele `f.parte` |
| `transladar` | `d` (`[x,y,z]`, PARAM, default `[0,0,0]`), `sel?` (o MESMO formato do `rotaciona`, default = malha inteira) | SIMPLES: `p' = p + d`, ADITIVO como o `moveV`; NUNCA cria vértice/face nem renumera; sem pivô (translação não usa). **É COMO SE POSICIONA UMA PRIMITIVA:** `cubo`/`cilindro`/`esfera`/`cone`/`plano`/`chamferBox` nascem PRESOS à origem e `lathe` sempre gira em torno de Y — nenhum aceita posição. Crie a primitiva e translade no passo seguinte (`sel` ausente = tudo que existe até ali; use `sel:{regiao}`/`{grupo}` pra mover só a peça nova quando já houver outra geometria) |
| `espelha` | `eixo` (`'x'\|'y'\|'z'`), `pos?`, `sel?` uniforme | DUPLICA faces; `sel:{f}`/`{grupo}` aponta faces, `{v}` alcança faces incidentes e `{regiao}` só faces inteiras na caixa. Weld no plano; ids novos do bloco; winding revertido; atributos herdados. |
| `pincel` | `modo:'face'` (`faces` legado OU `sel`, `cor`) ou `modo:'livre'` (`cor`,`raio`,`dureza`,`pontos:[{f,a,b}]`) | livre = dab face-local, acompanha a face; não aceita `sel` |
| `liso` | `faces:[ids]` (legado) ou `sel` | sombreado macio (padrão: chapado) |
| `material` | `faces` (legado) ou `sel`, `usa` | + `MATERIAIS = {mat1:{cor,emissivo,aspereza,semLuz,mistura:'transparente'}}` exportado |
| `parte` | `nome`, `faces:[ids]` (legado) ou `sel` | nomeia pra animação/material/grupo |
| `pesar` | `osso`, `faces:[ids]`, `peso` | skinning (acumula por vértice, normaliza top-4) |
| `solido` | `faces:[ids]` (legado) ou `sel` | o que entra na colisão |
| `inflate` | `contornoLado:[[z,y],...]` (≥3 pontos, PARAM), `contornoTopo:[[z,x],...]` (idem), `divisoes` (TOPO, mín 2) | dois contornos 2D (plano z×y e z×x) viram VOLUME por interseção de dois prismas — não é malha booleana geral, é uma GRADE DE VOXEL (watertight por construção, mas o resultado sai BLOCKY/facetado — não suave). Ponto com aridade ≠ 2 (alça de curva reservada) GRITA e aborta, igual ao `contorno` do loft; <3 pontos idem; contornos que não se cruzam em nenhum voxel GRITA (volume vazio nunca é o que você queria). Vale largura≠altura — o único gerador sem seção circular. Peça-exemplo `_corpo.js` |

**Seleção semântica (`sel`, D-129/D-130/D-131):** campos `v`, `f`, `grupo`,
`regiao` e `origem` podem coexistir e se unem. `origem` existe para `loft` e
`cubo`. No loft, `sel:{origem:{op:'loft',id,faixa?,lado?}}` endereça a grade
de duas dimensões da origem — **`faixa` e `lado` são os DOIS opcionais**
(D-130, Rodada A da Fase 3.5), ausente = "todos" nesse eixo: `{faixa}` é o
anel local zero-based; `{faixa,lado}` é uma face só; `{lado}` sem `faixa` é a
**coluna** (uma face por faixa, no mesmo lado — pula faixa sem lateral, e
lado fora do limite em qualquer faixa GRITA sem selecionar parcial); `{}` é
toda a origem (a união de todas as faixas; se nenhuma render face, GRITA).
Sem tampas. No cubo, `sel:{origem:{op:'cubo',id,face?}}` — `face` também
opcional: ausente = as 6 faces (pulando as já removidas por `apagaFace`; se
nenhuma sobrar, GRITA). Essa proveniência é reconstruída no núcleo, não
entra no canônico; `id` posicional do PASSO não ganha novo significado.
Campos `v`, `f`, `grupo` e `regiao` podem coexistir e se unem. Em operações
de FACE (`pincel` face, `liso`,
`material`, `solido`, `parte`, `espelha`), `v` significa faces incidentes e
`regiao` significa somente faces inteiramente dentro da caixa inclusiva. Para
`rotaciona`/`transladar`/`displace`, região continua sendo os vértices dentro da
caixa. `faces:[ids]` é compatibilidade para arquivo salvo; nunca misture com
`sel`. Nome errado, id inválido, chave desconhecida, região incompleta/invertida
ou seleção sem alvo **GRITA** — pare e corrija a lista, não tente adivinhar.

**Animação/esqueleto** (exportados junto, opcionais): `ANIMACOES =
{nome:{duracao,repete,trilhas:[{parte|osso,canal,chaves:[[t,v],...]}]}}` (canais
`rotX/rotY/rotZ/pos...`, interpolação smoothstep) e `ESQUELETO =
{ossos:{b0:{pai,pivo:[x,y,z]},...}}` — a assinatura completa é
`executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS = {}, ANIMACOES = {}, ESQUELETO = null)`. Exemplos:
`_oficina-anim.js` (partes), `_oficina-esqueleto.js` (rig completo).

**Alcance honesto:** caixa+cilindro+esfera+cone+plano+lathe+loft+extruda+move
cobrem arquitetura, móveis, props angulados, troncos, bolas, chão, perfil
rotacionado (vaso, coluna, peão — lathe, só reto por enquanto) e forma
orgânica OU angular composta ao longo de um caminho (tubo/casco/galho/membro
com seção `{pos,raio}`; viga/perfil-I/haste-de-estrela com seção `{pos,
contorno}` — loft, frame por transporte paralelo, sem torcer numa curva).
`espelha`+`rotaciona` destravam objeto BILATERAL — modele só metade (com a
borda EXATA no plano do espelho pra soldar) e complete com `espelha`; incline
uma parte com `rotaciona`. `inflate` destrava corpo com largura≠altura (torso,
pedra, casco achatado) a partir de dois perfis 2D — mas sai BLOCKY (voxel, não
suave); se o caso pedir superfície lisa e orgânica, `inflate` ainda não serve,
reporte o limite (ou use o caminho JS-puro abaixo). `chamferBox` destrava caixa
"macia" sem virar redonda (baú, caixote, pedestal, bloco de concreto puído —
ainda faces PLANAS, só sem quina viva); `displace` quebra a monotonia de
qualquer malha fechada com relevo orgânico determinístico (pedra, tronco
áspero, terreno) — os dois juntos (chamferBox + displace) dão pedra
lascada/rocha sem precisar de `inflate`. Exemplo das primitivas novas:
`_primitivas.js`; do loft com raio: `_galho.js`; do loft com contorno
explícito (seção não-circular): `_viga.js`; do inflate: `_corpo.js`; do
chamferBox+displace: `_pedra.js`.

## O laço de VER (você tem olhos — use-os)

**`npm run criar -- minha-peca`** é o COMANDO PADRÃO (P7, D-120) — um laço
único: estado do núcleo + manifesto de capacidades (cruzado contra a tabela
acima — avisa se ela ficou pra trás) + `auditar` + `porteiro` + `gabarito`
(se houver referência) + VEREDITO AGREGADO, com os renders (3 ângulos + 3
`geo=normais`) salvos em `tools/bancadas/out/criar-*` pra você LER. Prefira
ele a rodar os comandos abaixo em separado — existe justamente pra nenhum
gate ficar de fora por esquecimento.

Comandos individuais (pra investigar um achado específico do `criar`, ou pra
ângulo/resolução fora do padrão):

```bash
npm run peca -- minha-peca --giro=8             # 8 ângulos (defeito de um lado só)
npm run peca -- minha-peca --res=1400 --geo=normais   # SEM textura: emenda/faceta SALTAM
npm run peca -- minha-peca --res=1400 --geo=flat      # silhueta/volume
npm run auditar -- minha-peca && npm run porteiro -- minha-peca   # os mesmos gates do criar, isolados
npm run executar                                # replay/determinismo do núcleo
npm run gabarito -- minha-peca                  # o mesmo IoU do criar, isolado — mais ângulos que o CONTORNOS cobrir
```

**LEIA os PNGs de verdade** (Read no arquivo, incluindo a sobreposição do
`gabarito`). Regra de comportamento (skill `auditar-peca`): todo julgamento
cita ≥1 número/gate; FORMA é do ideador — você aponta os defeitos que vê,
entrega, e NUNCA conclui sozinho "ficou bom". O `gabarito` FORÇA o número (IoU
calibrado) mas ainda depende de um `CONTORNOS` desenhado à mão em
`prototipos/fps/v3/gabaritos/<peça>.js` (0..1, olhando o PNG) — sem gabarito
pra peça, a bancada falha alto (nada foi medido), nunca finge que passou.

## Som — o formato (copie de `pecas-som/_agua.js`)

`PARAMS` + `semente` + `PASSOS` (grafo em dados: cada passo um NÓ com `id`,
ligado por `de:`) + `meta` (com `duracao: duracaoDoGrafo(somNucleo(...))`) +
`construir(ctx,quando) = construirGrafo(somNucleo(PASSOS,PARAMS,semente), ctx, quando)`.
O nó de áudio LIVRE (sem consumidor) é a saída.

**Nós implementados:** `oscilador` (forma/freq), `ruido` (cor/k), `filtro`
(passa-baixa/alta/banda, freq, q), `envelope` (ataque/pico/decaimento/duracao),
`ganho`, `lfo` (modula um param de outro nó), `soma`. Presets de referência com
os números do jogo: `_passo` (estalo agudo ~3 kHz), `_vento` (sustentado 4,5 s),
`_bolha` (tonal, varre), `_agua` (grave abafado ~350 Hz).

**O ouvido (você não escuta — MEDE):**

```bash
npm run analisar -- minha-peca-som    # espectrograma (Read a imagem!) + tom/brilho/envelope/duração
npm run sintetizar -- minha-peca-som  # amostras/hash offline (determinismo)
npm run somab                         # A/B contra o som real do jogo, por eixo
```

Brilho alto ≈ estalo/agudo; centroide baixo ≈ abafado/grave; o espectrograma
mostra varredura/harmônico/tremor. Compare SEMPRE com um preset vizinho.

## O caminho JS-puro (fora da Oficina — fallback)

`construir(ctx)` direto com `ctx.{TS,tex,geo,m4}` (molde: `pecas/_modelo.js`;
exemplos grandes: `arvore3d`, `casa-toras`, `ilha-chao`). Geometria ilimitada,
MAS **não reabre na Oficina** nem tem replay canônico — é pra motor/paisagem e
pro que o vocabulário ainda não cobre. Prefira PASSOS sempre que der; se cair
aqui por falta de uma op, DIGA (é sinal de qual op construir em seguida).

## Entrega

Peça nova precisa de CABEÇALHO (1º comentário — o `mapa:check` barra sem) e
passa pelos gates (`npm run mapa` + os quatro de sempre). Determinismo:
NENHUM `Date.now()`/`Math.random()` cru — semente escrita na peça. O fluxo de
commit/decisão: skill `nos-fluxo`.
