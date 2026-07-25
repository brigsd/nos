# TETO — relatório do REFINO da moto (2ª corrida)

2ª corrida do experimento de `docs/TETO.md`. A 1ª provou que a ferramenta
**cria** o objeto; esta mede se ela **refina** um objeto que já existe, a partir
das 6 críticas do ideador.

Artefato: `prototipos/fps/v3/pecas/moto.js` · branch `wip/teto-moto-refino` ·
3 de 3 ciclos gastos.

---

## 1 · Antes × depois, medido do artefato

| | 1ª corrida | 2ª corrida (refino) |
|---|---|---|
| `PASSOS.length` | 51 (12 geometria + 39 atributo) | **58** (23 geometria + 35 atributo) |
| Vértices / faces | 492 / 558 | **1376 / 1492** |
| Caixa | 2,82 × 1,12 × 0,56 | **2,84 × 1,08 × 0,66** |
| Ops distintas usadas | 7 de 25 | **10 de 26** |
| Ids de face escritos à mão | 2.164 (3,9× por face) | **6.374 (4,3× por face)** |
| % do arquivo que é lista de id | 42% | **64%** |
| Arquivo | 315 linhas / 27.912 B | **864 linhas / 62.880 B** |
| PARAMS | 36 | **88** |
| Pontos `[u,w]` de contorno literais | 104 (208 números) | **266 (532 números)** |
| `grep construir` | 1 (`return executar`) | **2** (a assinatura + o `return executar`) — zero geometria em JS |

**Ops usadas agora (10):** `pincel`×22, `loft`×12, `espelha`×6, `material`×6,
`parte`×5, `chamferBox`×2, `transladar`×2, `rotaciona`×1, `liso`×1, `solido`×1.

**Ops que ENTRARAM no vocabulário usado:** `chamferBox`, `transladar`,
`rotaciona` — e as três só entraram por causa do **`transladar` do D-128**, que
foi exatamente a op que a 1ª corrida elegeu. Medido: o assento e a mesa da
direção são `chamferBox` nascidas na origem, postas no lugar com `transladar`, e
a mesa é inclinada 25° com `rotaciona`. Sem `transladar` isso custaria 24 `moveV`
por caixa. **A op eleita pagou.**

**Ops ainda NUNCA usadas (16 de 26):** `cubo`, `cilindro`, `esfera`, `cone`,
`plano`, `lathe`, `inflate`, `moveV`, `extruda`, `mescla`, `moveF`, `moveA`,
`vira`, `apagaFace`, `displace`, `pesar`.

E aqui vem o achado honesto sobre o D-128: **`transladar` destravou as primitivas,
mas elas continuaram perdendo pro `loft` no mérito.** `cilindro`/`lathe`/`esfera`
só fazem sólido de revolução em torno de um eixo fixo; o `loft` faz o mesmo com
`pos` por seção, com raio VARIÁVEL estação a estação, e sem passo extra de
posicionamento. Das 9 primitivas, a única que ganhou de fato foi a `chamferBox`,
porque chanfro é a coisa que o `loft` não faz de graça. Não é que faltasse
capacidade — é que uma op cobre o espaço das outras sete.

**Renders** (regeneráveis; `tools/bancadas/out/` é gitignorado):

```
npm run criar -- moto
  tools/bancadas/out/criar-moto-{38,0,90}.png
  tools/bancadas/out/criar-moto-normais-{38,0,90}.png
npm run peca -- moto --res=1400 --giro=4
  tools/bancadas/out/peca-moto-{0,90,180,270}.png
```

---

## 2 · Uma seção por crítica

### 1 · Rodas — "discos maciços e muito facetados" → **FEITO**

**O que mudou.** O perfil da roda foi de 16 estações lisas (um domo) para **20
estações com estrutura**, no mesmo passo (`loft` ao longo de +X), com `lados`
20 em vez de 16:

| estação | o que é |
|---|---|
| polo · cubo | tampa do eixo, saliente, emissiva |
| **estrela** | `contorno` com 5 raios de 4 pontos (`[vale, pico, pico, vale]`) — **5 braços em relevo** |
| aro (2×) | banda cilíndrica de raio ~0,30 |
| **sulco** | o raio DESCE 0,018 — é o que separa aro de pneu como uma linha, não como troca de cor |
| talão · flanco · ombro | o pneu com a lateral arredondada até a banda |
| banda | 0,018 de largura reta no topo do raio |

Os 5 braços são **geometria, não pintura**: entre a estação da estrela e a do
aro o `x` avança 0,012, então a teia entre os braços afunda e os braços ficam
salientes. A classificação de face vem da própria estrela (`j%4==1` = braço,
`j%4==3` = teia, resto = flanco), e a pintura reforça: braço claro, teia escura.
No ciclo 2 os flancos estavam claros e a roda lia como **moinho de 10 pás** — o
ciclo 3 escureceu o flanco e sobraram 5 braços. Isso foi visto no render e
corrigido, não suposto.

**O que NÃO deu, e é o limite de verdade.** Um pneu é topologicamente um **anel**
(toro). Um `loft`/`lathe` fechado nas duas pontas obriga `raio=0` nos dois
extremos do caminho, então o raio máximo fica no MEIO e a lateral inteira é uma
superfície contínua: **um fuso, nunca um anel com furo.** É essa a razão
geométrica do "disco maciço".

Mas — e isto **corrige o relatório da 1ª corrida**, que listou `toro` como "gap
real" — **o toro É construível hoje, e eu medi:** `loft` com caminho circular de
360° + um `mescla` por lado soldando o último anel no primeiro.

```
toro (loft 360° com 12 seções, lados 6, + 6 `mescla`):
  72 V · 72 F · 0 gritos · 288 arestas dirigidas, 0 sem par, 0 duplicada
  simetria em x: 0 sem par · volume assinado +0,02285 (fechado e pra fora)
```

Não é gap de capacidade, é **gap de custo**: `lados` passos de `mescla` por anel.
Uma roda "de verdade" (pneu-anel + aro-anel + cubo + braços com vãos reais entre
eles) sairia por ~18 passos POR RODA — 36 pro par, contra os 2 de hoje —, e
dobraria de novo um arquivo que já cresceu 2,2×. Escolhi não gastar o orçamento
nisso. **A decisão está medida, não intuída.**

### 2 · Garfos e braços — "blocos soltos" → **FEITO**

Lâminas retangulares de seção constante viraram **tubos redondos em 3 estágios**,
metade direita + `espelha`:

- **garfo**: cilindro (r 0,026) → haste (r 0,019) → punho do eixo (r 0,033),
  com 25° de caster medido (`atan(Δz/Δy)` do caminho);
- **braço traseiro**: pivô (r 0,030) → haste (r 0,021) → punho do eixo (r 0,036);
- **amortecedor** novo, um par: haste fina + corpo grosso.

"Bem conectados" virou uma regra construtiva: **todo tubo termina com o polo
ENTERRADO dentro da peça vizinha.** O polo de cima do garfo nasce dentro da mesa;
o de baixo abraça o cubo da roda; o polo de baixo do amortecedor nasce **dentro
do próprio braço traseiro** e o de cima dentro do corpo. Não há uma única ponta
cônica à mostra — que era o que fazia as lâminas lerem como espetadas.

**Sem bloqueio aqui.** O `loft` com `raio` variável por seção resolve tudo: cada
estágio é só uma seção com outro raio.

### 3 · Guidão — "não reconhecível nem bem ligado" → **FEITO**, e é o único com régua

Este é o alvo objetivo da corrida. O guidão era um `loft` de **caminho simétrico**
— e o cabeçalho da op (D-128) diz que isso NÃO garante malha simétrica, porque o
frame vem de transporte paralelo propagado. Era exatamente o que reprovava o
crítico `simetria`.

Refeito como a op manda: **modelei a metade direita e fechei com `espelha`.**

```
simetria em x=0 (crítico `simetria` do `auditar`, opt-in por meta.simetria)
  antes:  12 de  492 posições sem par espelhado (desvio máx 4,45e-3)  REPROVADO
  depois:  0 de 1376 posições sem par                                 APROVADO
```

Reconhecível: a barra ganhou **punho mais grosso** (r 0,028 contra 0,021 da
barra) e **flange de ponta** (r 0,034), e varre pra trás 0,145 em z ao longo da
meia-envergadura. Ligado: o polo interno nasce **dentro da carenagem de cockpit**,
que por sua vez se apoia na mesa da direção, que prende os dois garfos.

### 4 · Farol — "forma colocada na ponta" → **FEITO**

O farol agora é **uma peça só** que cresce de dentro do cockpit (o polo de trás
dela está enterrado ali), com:

- **degrau de aro**: entre duas seções o raio cai de 0,074 para 0,058 num passo
  — o anel resultante é o aro cromado, e a lente fica **encaixada num rebaixo**;
- **lente** nas duas últimas faixas, com material emissivo próprio;
- **suporte visível**: um par de hastes (r 0,014) da ponta da mesa até o flanco
  da nacela — medido que ficam FORA da superfície do cockpit em toda a extensão,
  então aparecem de lado e de frente.

**Limite tocado (não bloqueou, mas moldou a solução):** não existe booleano nem
op de casca/espessura, então a lente não pode ser um objeto separado
*embutido* num aro. O rebaixo é feito por degrau de raio no mesmo `loft`. Lê
como bisel; não é um bisel.

### 5 · Carenagem e corpo — → **PARCIAL**

**O que deu:**

- **Proporção e silhueta.** 13 estações em vez de 10: rabeta alta, degrau do
  assento, tanque com volume (topo em 0,998 contra 0,916 do assento) e bico.
  A **quilha desce a 0,548** no meio e sobe nas pontas acompanhando o **arco das
  duas rodas** — é o que dá o perfil de moto em vez de "prancha".
- **Transições.** O ombro do corpo ficou **CHAPADO** entre duas faixas `liso`.
  Isso desenha um **vinco** ao longo de toda a carenagem, de graça — e a faixa
  emissiva do flanco corre em cima dele. É a única "linha de design" da peça, e
  ela é geometria + sombreado, não adesivo.
- **O assento virou geometria.** Era troca de cor no topo do mesmo `loft` (a 1ª
  corrida registrou isso como defeito: "de cima pode ler como adesivo"). Agora é
  uma `chamferBox` de verdade, posicionada com `transladar`, saliente 0,047
  sobre o topo do corpo no vão do degrau.
- **Para-lama dianteiro**, um `loft` em ARCO sobre o pneu. A 1ª corrida registrou
  isso como BLOQUEADO (§4.5: "não consegui garantir a orientação do contorno num
  caminho curvo"). **Não é bloqueio — está no cabeçalho da op.** A regra é:
  `ref = |t0.y|>0,9 ? [1,0,0] : [0,1,0]`, e ela vale só pra PRIMEIRA seção. Basta
  a tangente inicial ser rasa (a minha tem `|t.y| = 0,71`) para o `u` do frame
  ser o eixo LATERAL e o contorno retangular sair na orientação óbvia.

**O que NÃO deu:**

- **`contorno` não escala e não aceita conta.** "A mesma seção, 0,8×" não é
  expressável. Consequência medida: **266 pontos = 532 números literais**, e a
  roda traseira repete a estrela da dianteira inteira, só que maior. A carenagem
  tem 88 PARAMS, e **a forma da seção não está em nenhum deles** — mexer nos
  PARAMS move as estações, nunca a silhueta da seção. É o mesmo bloqueio da 1ª
  corrida (§4.3), intacto.
- **"Envolvendo a estrutura" continua fingido.** A carenagem é um sólido, não
  uma casca. Não há booleano, nem op de espessura/casca, nem como abrir a
  barriga pra o motor aparecer por dentro. Ela envolve por ser grande.
- **Uma coisa que eu supus bloqueada e NÃO é:** contorno **côncavo** é aceito
  (medido: um "U" invertido de 8 pontos constrói 18 V / 24 F com zero gritos).
  Ou seja, dava pra fazer a rabeta **montar a cavalo** sobre a roda traseira, em
  vez de passar por cima dela. Não tentei — foi escolha de orçamento, e registro
  como oportunidade perdida, não como limite da ferramenta.

### 6 · Encaixes, alinhamento e folgas → **FEITO**

Três regras, e as três são verificáveis:

1. **Todo par lateral sai de `espelha`** (garfo, braço, amortecedor, guidão,
   suporte do farol, faixa emissiva) — 6 `espelha` contra 3 da 1ª corrida. É o
   que dá `0 de 1376` no crítico de simetria.
2. **Toda caixa nasce na origem e vai pro lugar com `transladar`**; a mesa é
   inclinada com `rotaciona` no MESMO ângulo do garfo (25°), então clamp e tubos
   são paralelos por construção, não por olho.
3. **Zero interpenetração, medido.** Escrevi a régua: para cada vértice com
   `|x| ≤ largura da roda`, a distância ao centro da roda menos o raio do pneu.

```
folga corpo/assento/para-lama × pneu (excluídos os punhos do garfo e do
braço, que ABRAÇAM o cubo de propósito):
  roda dianteira: 0 vértices dentro do envelope · folga mínima 0,0163
  roda traseira:  0 vértices dentro do envelope · folga mínima 0,0077
```

A 1ª corrida listava a interpenetração como defeito assumido (§3.3). Aqui ela é
zero — e a régua achou **um** vértice 0,006 dentro do pneu traseiro no ciclo 3,
que eu não teria visto no render. Consertei subindo a quilha daquela estação.

---

## 3 · APROVADO / REPROVADO — só onde existe régua

| Eixo | Régua | Número | Veredito |
|---|---|---|---|
| `npm run criar -- moto` | veredito agregado | exit 0, **APROVADO** (era REPROVADO) | **APROVADO** |
| **Simetria em x=0** | crítico `simetria` | **0 de 1376 sem par** (era 12 de 492) | **APROVADO** |
| Órfãos | `nucleo(...).orfaos` | 0 | **APROVADO** |
| Críticos `[cpu]` | `auditar` (6 críticos) | 0 achados | **APROVADO** |
| Render / porteiro | `porteiro` | frame são (cores=398, dominante=49%, luma=249) | **APROVADO** |
| Porteiro, todas as peças | `npm run porteiro` | **8/8** | **APROVADO** |
| `auditar` (varredura) | baseline do repo | moto limpa; os 3 achados pré-existentes (`arco`, `arvore-cartoon`, `vegetacao-cartoon`) **inalterados** | **APROVADO** (sem regressão) |
| `test` / `typecheck` | gates do repo | 240/240, limpo | **APROVADO** |
| `mapa:check` / `docs:toc:check` | gates do repo | 119 arquivos em dia / 37 seções | **APROVADO** |
| `executar` (replay) | núcleo | `replay PROVADO, tudo idêntico` | **APROVADO** |
| Determinismo | `neutroCanonico` 2× | idêntico bit-a-bit (176.359 chars) | **APROVADO** |
| Reabre na Oficina | `oficina.html?peca=moto` | `__ready=true`, overlay 1376 V / 1492 F, **58 passos relidos**, 0 erro de página | **APROVADO** |
| Round-trip do formato salvo | serializa na Oficina → reimporta em Node | `PASSOS` IDÊNTICOS · canon **idêntico bit-a-bit** | **APROVADO** |
| Malha: manifold | aresta dirigida pareada 1× | **5.656 arestas, 0 sem par, 0 duplicada** | **APROVADO** |
| Malha: winding | volume assinado por casca | **20 cascas, todas > 0** (menor 4,73e-5) | **APROVADO** |
| Vértice órfão de face | — | 0 (1376/1376 usados) | **APROVADO** |
| Interpenetração roda × corpo | régua escrita nesta corrida | 0 vértices dentro; mínimas 0,0077 / 0,0163 | **APROVADO** |
| Jogo | `npm run jogar` | ready=true, 38 fps, erros=0 | **APROVADO** |
| Forma (IoU) | gabarito | não existe gabarito | **NÃO MEDIDO** (por desenho do TETO) |

Nada do que passava regrediu. O que era REPROVADO (simetria) virou APROVADO.

**Custo que cresceu e vale registrar:** V/F quase triplicou (492→1376, 558→1492)
e o fps do render da bancada da peça caiu de 31/32 para 26/30 a 900×506 em
software. O jogo em si segue em 38 fps porque a moto não está na cena dele.

---

## 4 · BLOQUEADO — o que eu quis fazer e o vocabulário não deixou

### 4.1 · A seleção por atributo continua sendo lista literal — e agora falha CALADA

Este é o mesmo §4.4 da 1ª corrida, **não consertado**, e o refino piorou o
sintoma porque a peça cresceu: **6.374 ids de face escritos à mão** (eram
2.164), **64% do arquivo** (eram 42%).

`rotaciona` e `transladar` aceitam `sel:{v}/{f}/{regiao}/{grupo}`.
`pincel`, `liso`, `material`, `parte`, `solido` e `espelha` **não** — só
`faces:[ids]` literal.

**O que eu descobri batendo, e é pior que "não suporta":**

```
espelha  com sel:{grupo:'g'}   → 8 V, 6 F, 0 gritos   (o cubo intacto: espelhou NADA)
espelha  com sel:{regiao:{...}}→ 8 V, 6 F, 0 gritos   (idem)
pincel   com sel:{grupo:'g'}   → 0 faces pintadas, 0 gritos
liso     com grupo:'g'         → 0 faces lisas,     0 gritos
```

**Silêncio total.** Nenhum grito, nenhum órfão, exit 0, `auditar` limpo. Quem
escrever `['espelha',{eixo:'x',sel:{grupo:'garfo'}}]` — que é a assinatura óbvia,
porque é a do `rotaciona` ao lado — ganha uma peça sem a metade esquerda e
**nenhum sinal de que pediu algo que a op ignora**. Isso viola a lei do envelope
("referência inválida GRITA e é ignorada — nunca corrompe"): aqui a referência
não é inválida, é *não-lida*, e o silêncio é o pior dos mundos.

**O que teria destravado:** (a) aceitar o mesmo `sel` nas 6 ops — o
`resolverAlvosV` já existe e já resolve `grupo`; (b) enquanto isso não vem,
**gritar** quando uma op recebe uma chave que ela não lê.

Medida do custo: dos 58 passos, **22 são `pincel`**. E só couberam em 22 porque
eu agrupei a pintura **por par de tons**, não por zona — sem esse truque seriam
**70**. Ou seja: o arquivo não tem 22 passos de pintura porque tem 22 zonas; tem
22 porque eu misturei zonas que nada têm a ver (o pneu, o assento e o punho do
guidão dividem um passo por serem da mesma cor). Isso é o oposto de editável.

### 4.2 · `contorno` não escala, não aceita conta — e a documentação está errada sobre o PARAM

Mesmo bloqueio da 1ª corrida (§4.3), e ele domina o arquivo: **532 números
literais** de contorno.

Batendo nele, achei uma divergência de contrato. O relatório da 1ª corrida diz
"`contorno` aceita literal **ou nome de PARAM**". Medido:

```
contorno: 'ret'                        → GRITA: "precisa ter exatamente 'lados' pontos [u,w] (tem string)"
contorno: [['a','a'],['an','a'],...]   → constrói (6 V, 0 gritos)
```

Ou seja: o **array** não pode ser um PARAM; cada **componente de cada ponto**
pode. Na prática isso não ajuda — para reusar uma seção em 3 tamanhos eu teria
que declarar 3 PARAMS por componente (para a estrela da roda: 40 PARAMS por
tamanho). Nem a skill `criar-peca` nem `docs/oficina.md` dizem qual das duas
formas vale; a 1ª corrida documentou a errada.

**O que teria destravado:** `escala:[sx,sy]` por seção no `loft` (o `escala` da
tabela do `docs/oficina.md` existe como CANAL de animação e está marcado
"ainda NÃO existe como op de malha"). Isso sozinho devolveria os 532 números
a 2 PARAMS por estação.

### 4.3 · Não existe casca/espessura nem booleano — "envolver" é sempre fingido

Para a carenagem "envolver a estrutura" faltaria: (a) subtrair a roda da
carenagem (caixa de roda), (b) dar espessura a uma superfície (casca), ou
(c) abrir uma janela mantendo a borda. O que existe: `apagaFace` (abre buraco e
deixa a malha ABERTA — mataria o manifold, que é um dos eixos que eu não posso
regredir) e `inflate` (interseção de dois prismas, não subtração, e sai blocky).

Solução adotada: folga geométrica em vez de recorte — a quilha da carenagem
segue o arco das rodas com 0,008 a 0,016 de folga. Funciona, e é honestamente
uma silhueta diferente da que eu queria (uma carenagem que ABRAÇA a roda).

### 4.4 · Refinar não tem alvo: nenhuma régua de forma, e nenhuma de "ficou melhor"

Os 6 críticos `[cpu]` mais o porteiro dão a MESMA nota cheia para a peça da 1ª
corrida e para a desta. O único eixo de forma com régua nesta corrida foi a
**simetria** — e ele existe porque a 1ª corrida o construiu. Todo o resto do
refino (proporção, transição, "parece desenhado") foi eu olhando PNG.

Isso é qualitativamente diferente de criar: quando se cria, "não existe ainda"
é um sinal claro. Quando se refina, a pergunta é "está melhor?", e **não há
nenhum número no repositório que responda isso**. Escrevi duas réguas próprias
durante a corrida (a de interpenetração e a de folga por vértice) e as duas
acharam defeito real — o que sugere que o custo de uma régua é baixo e o retorno
alto, mas hoje ela não existe pronta.

### 4.5 · O `id:` da primitiva e a numeração posicional tornam o arquivo não-editável no meio

Testei o que acontece ao **inserir um passo de geometria no meio** da lista (o
gesto mais natural de um refino: "quero mais uma peça aqui"):

```
inserir 1 ['cubo'] na posição 3 de 58:
  1376 → 1339 V · 1492 → 1476 F · 649 GRITOS
  134 faces ficaram sem cor · 0 face silenciosamente recolorida
```

A boa notícia: **grita alto e não corrompe calado** — a promessa da identidade
posicional se sustenta (649 gritos, entre eles todos os `id: N ≠ base da posição`
e as seleções `{v:[...]}` das caixas apontando pro vazio). A má: a única
correção possível é **reescrever os 6.374 ids**. Foi literalmente o que aconteceu
comigo no ciclo 3 quando troquei a torre (2 passos: `chamferBox` + `transladar`)
por uma carenagem de cockpit (1 passo `loft`) — o arquivo inteiro se renumerou.

Consequência prática: **eu não editei esta peça, eu a regerei 5 vezes.** O
artefato entregue é um `.js` com PASSOS literais (e reabre na Oficina bit-a-bit),
mas ele foi escrito por um script gerador porque escrever 6.374 ids à mão não é
possível — e, o que é pior pro refino, **corrigi-los à mão depois de mexer na
geometria também não**.

---

## 5 · Editabilidade — a pergunta central desta corrida

Foi **hostil**, e o número mostra a direção errada: 2.164 → 6.374 ids à mão,
42% → 64% do arquivo. Concretamente, o que atrapalhou, em ordem:

1. **Toda mudança de geometria invalida toda a pintura.** Não porque a pintura
   esteja errada, mas porque os ids dela são posicionais e a lista mudou de
   tamanho. Mexer numa roda obriga a reemitir 6.374 números.
2. **Não dá pra dizer "pinte o grupo X"** (§4.1), então zonas não têm nome no
   arquivo — têm listas. Reler `['pincel',{faces:[3000,3002,...×200]}]` não
   informa NADA sobre o que está sendo pintado. Eu tive que carregar essa
   semântica no gerador, fora da peça.
3. **A forma da seção não é parametrizável** (§4.2), então "afine a rabeta 10%"
   não é uma edição de PARAM, é reescrever 12 pares de números por estação.
4. **O que ajudou muito:** `espelha` de novo foi impecável — modelei 6 metades e
   as 6 fecharam sem surpresa, com atributos herdados e ids na ordem
   documentada. E `transladar`+`rotaciona`+`chamferBox` juntos deram o único
   caminho de composição que parece um editor de verdade: "crie, posicione,
   incline". Foi a parte mais agradável da corrida.

O contraste é o achado: **compor ficou fácil (D-128 resolveu), atribuir continua
impossível.** As duas metades do formato evoluíram em velocidades diferentes.

---

## 6 · JULGAMENTO DO IDEADOR — evidência, e o que EU ainda vejo de errado

Não concluo se ficou bom (regra da skill `auditar-peca`); listo o que vejo.

**Evidência:** `tools/bancadas/out/peca-moto-{0,90,180,270}.png` (1400px, 4
vistas), `criar-moto-{38,0,90}.png` e os três `criar-moto-normais-*.png`.
Regenere com `npm run criar -- moto` e `npm run peca -- moto --res=1400 --giro=4`.

**Defeitos que eu vejo nos renders finais:**

1. **As rodas ainda dominam.** Ø 0,904 e 0,944 contra 1,082 de altura total —
   83% e 87%. Lê como "conceito de roda grande", não como moto de proporção
   funcional. Não mexi porque o enunciado original pede "duas rodas grandes", e
   reduzir cascatearia em eixo, garfo, braço e nas folgas todas.
2. **A frente é vazia entre o garfo e o corpo.** A carenagem de cockpit deu massa
   ao bico, mas de 3/4 sobra um vão grande onde numa moto haveria radiador,
   entrada de ar ou painel lateral. É o pedaço mais "não desenhado" que restou.
3. **O topo do corpo é um plano largo e liso.** O vinco do ombro e o assento
   quebram o perfil de lado, mas visto de cima o tanque ainda é uma superfície
   única. Faltou uma segunda linha de design.
4. **O para-lama é fino demais.** Ele lê como uma lâmina curva, não como uma peça
   com espessura — e é exatamente o tipo de coisa que uma op de casca resolveria.
5. **Os punhos do garfo e do braço** (as bossas que abraçam o cubo) ainda leem
   como bloquinhos hexagonais quando vistos de frente. Diminuí de 0,046 pra
   0,033 no último ciclo, e melhorou, mas não sumiu.
6. **A rabeta**, de 3/4 da frente, ainda destaca como um plano azul separado —
   é fina (0,10 de altura) porque é obrigada a passar por cima do pneu traseiro,
   e o contorno convexo não deixa ela montar a cavalo na roda.

---

## 7 · Onde eu travei, e o que teria destravado (auto-relato)

**Travei uma vez de verdade, e foi no começo: descobrir o que já não era mais
verdade.** Eu li o relatório da 1ª corrida antes do `docs/oficina.md`, e ele
descreve um vocabulário que mudou. Três afirmações dele são hoje falsas ou
incompletas: `transladar` passou a existir (e muda o desenho inteiro da peça);
`contorno` **não** aceita nome de PARAM como o relatório diz (aceita por
componente, que é outra coisa); e o para-lama em arco, listado como bloqueado,
não é bloqueio nenhum — a regra do frame está escrita no cabeçalho da op. Perdi
tempo planejando ao redor de restrições que já tinham caído. **O que teria
destravado: ler o cabeçalho da op ANTES do relatório anterior.** O contrato
formal estava certo; a narrativa da corrida anterior é que envelheceu.

**O segundo atrito não me travou, mas me custou o ciclo 2 inteiro.** No ciclo 1
eu reconstruí tudo e a moto ficou objetivamente correta (gates verdes, simetria
zerada) e visualmente pior de silhueta que a original: um casco liso e chato,
uma canoa. A causa foi banal — a seção do corpo tinha o ponto mais largo ACIMA
do meio e o topo quase plano, então o volume não lia — mas eu só descobri
**olhando o PNG**, porque nenhum gate distingue uma moto de uma canoa. O ciclo 2
foi inteiro gasto em "dar volume", que é uma correção que um gabarito (IoU)
teria apontado no ciclo 1. **O que teria destravado: um gabarito.** O
`docs/TETO.md` deixou de fora de propósito na 1ª corrida (quem traça o alvo
escolhe o alcançável) — mas na 2ª existe uma peça anterior de onde traçar, e a
objeção metodológica não vale mais.

**A coisa que mais me atrapalhou de forma contínua** não foi uma op faltando, foi
o **acoplamento entre geometria e atributo**. Cada vez que eu mexia numa estação
de roda, os 6.374 ids tinham que ser recalculados. Isso não me impediu (o
gerador resolve), mas é o que me faz dizer que a Oficina hoje **cria** melhor do
que **refina**: criar é escrever a lista uma vez; refinar é mexer no meio dela, e
é exatamente aí que o formato cobra o preço todo.

**E uma coisa que eu esperava que travasse e não travou:** o `contorno` em
ESTRELA. Eu não tinha nenhuma garantia de que um polígono não-convexo, com raio
alternando entre duas escalas, produziria uma malha limpa — e produziu, watertight,
com winding correto, na primeira tentativa. Os 5 braços da roda, que são a
melhoria mais visível da corrida inteira, saíram de trocar `raio: 0.3` por uma
lista de 20 pontos. **O `contorno` é a op mais subestimada do conjunto**: ele é
o único lugar onde a peça pode ter forma que não seja um círculo, e por isso ele
é justamente o que mais precisa de `escala`.

---

## 8 · O que esta corrida sugere como próximo trabalho

Pela tabela "Depois da tentativa" do `docs/TETO.md`, o bloqueio que **mais se
repetiu** mudou de categoria. Na 1ª corrida era "faltou como expressar"
(resolvido pelo `transladar`). Nesta é **"ficou enorme e difícil de editar"** —
a 4ª linha da tabela, e a que o próprio TETO já nomeava como a mais provável
num refino.

1. **`sel` (`{f}`/`{regiao}`/`{grupo}`) em `pincel`/`liso`/`material`/`solido`/
   `parte`/`espelha`** — §4.1. Corta 64% do arquivo e dá NOME às zonas. É a
   mesma recomendação nº 2 da 1ª corrida, agora com o dobro do número por trás
   dela (6.374 ids) e com um agravante novo: hoje a chave errada é **ignorada em
   silêncio**.
2. **Gritar quando uma op recebe chave que não lê** — §4.1. É barato e fecha uma
   classe inteira de erro invisível.
3. **`escala` por seção no `loft`** (`{pos, contorno, escala:[sx,sy]}`) — §4.2.
   Devolve 532 números literais aos PARAMS, e é o que faria a estrela da roda
   traseira ser a mesma da dianteira.
4. **Um gabarito para a moto**, traçado da peça que existe — §7. Esta corrida
   gastou 1 dos 3 ciclos numa correção de silhueta que um IoU teria apontado
   imediatamente, e a objeção metodológica do TETO ("quem traça o alvo escolhe o
   alcançável") não se aplica quando o alvo é traçado de um artefato já existente.

E dois **consertos de contrato**, que custam texto e não código:

5. `contorno` aceita PARAM **por componente do ponto**, não como array — a skill
   e o `docs/oficina.md` não dizem, e o relatório da 1ª corrida diz errado (§4.2).
6. Registrar que **`toro` NÃO é gap de capacidade** (`loft` 360° + `lados`
   `mescla` produz anel manifold, medido) — é gap de custo. O item "adiado" na
   lista do `docs/TETO.md` está classificado errado (§ crítica 1).
