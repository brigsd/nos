# TETO — relatório da moto

Execução do experimento descrito em `docs/TETO.md`: criar a motocicleta do
enunciado **exclusivamente em `PASSOS`**, com orçamento de 3 ciclos.

Artefato: `prototipos/fps/v3/pecas/moto.js` · branch `wip/teto-moto`.

---

## 1 · Os números, medidos do artefato

| | |
|---|---|
| `PASSOS.length` | **51** (12 de geometria, 39 de atributo) |
| Vértices / faces | 492 / 558 |
| Caixa | `[-0.280, 0.000, -1.430] .. [0.280, 1.116, 1.390]` — 2.82 de comprimento × 1.12 de altura |
| Colisão (`colisaoDe`) | cilindro raio 1.4311, altura 1.0980, base 0.0000 |
| `grep construir` na peça | **1 ocorrência**, e é `return executar(...)` — zero geometria em JS |
| Arquivo | 315 linhas, 27.912 bytes |
| Ciclos gastos | **3 de 3** |

**Ops usadas (7 das 25):** `pincel`×26, `loft`×9, `material`×6, `parte`×5,
`espelha`×3, `liso`×1, `solido`×1.

**Ops NUNCA usadas (18 das 25):** `cubo`, `cilindro`, `esfera`, `cone`, `plano`,
`chamferBox`, `lathe`, `inflate`, `moveV`, `extruda`, `mescla`, `moveF`, `moveA`,
`vira`, `apagaFace`, `displace`, `rotaciona`, `pesar`.

Esse é o dado mais duro do experimento: **a moto inteira saiu de `loft` +
`espelha`**. As outras 7 primitivas e as 9 ops de edição não entraram — e a
seção 4 explica que na maioria dos casos não foi escolha estética, foi
impossibilidade prática.

**Renders** (regeneráveis; `tools/bancadas/out/` é gitignorado por política do repo):

```
npm run criar -- moto
  tools/bancadas/out/criar-moto-38.png            tools/bancadas/out/criar-moto-normais-38.png
  tools/bancadas/out/criar-moto-0.png             tools/bancadas/out/criar-moto-normais-0.png
  tools/bancadas/out/criar-moto-90.png            tools/bancadas/out/criar-moto-normais-90.png
npm run peca -- moto --res=1400 --giro=4
  tools/bancadas/out/peca-moto-{0,90,180,270}.png
```

---

## 2 · APROVADO / REPROVADO — só onde existe régua

| Eixo | Régua | Número | Veredito |
|---|---|---|---|
| Abre com veredito no `criar` | `npm run criar -- moto` | exit 0 | **APROVADO** |
| Órfãos | `neutroCanonico(...).orfaos` | 0 | **APROVADO** |
| Manifesto núcleo × doc | `criar`, cruzamento `OPS` × skill | em dia | **APROVADO** |
| Críticos `[cpu]` | `auditar` (5 críticos) | 0 achados | **APROVADO** |
| Render / porteiro | `porteiro` | frame são (cores=322, dominante=49%, luma=249) | **APROVADO** |
| `test` / `typecheck` / `mapa:check` | gates do repo | 230/230, limpo, ok | **APROVADO** |
| Determinismo (canon 2×) | `neutroCanonico` 2× | idêntico bit-a-bit (61.382 chars) | **APROVADO** |
| Reabre na Oficina | `oficina.html?peca=moto` | `__ready`, 51 passos relidos, 0 erro de página | **APROVADO** |
| Round-trip do formato salvo | serializa na Oficina → reimporta em Node | `PASSOS` idênticos; canon exportado == canon original **bit-a-bit** | **APROVADO** |
| Round-trip página↔Node | canon bit-a-bit | **DIVERGE em 1 bit** — ver abaixo | **APROVADO sob a régua D-125** |
| Malha: manifold | aresta dirigida pareada 1× | 2052 arestas, 0 sem par, 0 duplicada | **APROVADO** |
| Malha: winding | volume assinado por casca | 12 cascas fechadas, **todas > 0** | **APROVADO** |
| Malha: vértice órfão de face | — | 0 (492/492 usados) | **APROVADO** |
| Simetria em x=0 | par espelhado exato por vértice | **480 de 492 têm par exato; 12 não** | **REPROVADO** (ver 4.1) |
| Forma (IoU) | gabarito | **não existe gabarito** nesta rodada | **NÃO MEDIDO** (por desenho do TETO) |

### O bit que diverge (página × Node)

O canônico calculado **dentro da Oficina** e o calculado em **Node** diferem em
**1 coordenada de 1476**, por **6.939e-18** (1 ULP): `v9017`, um vértice de anel
do `loft` do farol.

Isso é a exceção do **D-125** — transcendental (`Math.cos`/`Math.sin`) não é
bit-exata entre builds do V8. Sob a régua que o próprio D-125 define (estrutura
EXATA + posição com epsilon `1e-9`), passa: ids, faces e órfãos idênticos, desvio
6.9e-18 ≪ 1e-9.

**Mas o furo de contrato é real:** o D-125, o `oficina` SKILL e o `docs/oficina.md`
descrevem essa exceção **só para o `displace`** ("`Math.sin` do ruído do
`displace`"). Aqui não há um único `displace` na peça — a divergência vem do
`cos/sin` que **todo** gerador circular usa (`cilindro`, `esfera`, `cone`,
`lathe`, `loft`). Quem seguir a documentação ao pé da letra conclui
"determinismo REPROVADO" numa peça que está correta. A exceção está escrita
como se fosse de uma op; ela é de uma **classe inteira** de ops.

---

## 3 · JULGAMENTO DO IDEADOR — evidência, sem nota

Não concluo se ficou bom (regra da skill `auditar-peca`). Apresento o que o
enunciado pediu, o que é verificável e o que eu **vejo de errado** nos renders.

**O que o enunciado pede, e o que existe no artefato:**

| Pedido | O que existe (medido) |
|---|---|
| "baixa e alongada" | 2.82 × 1.12 → razão 2.52 |
| "duas rodas grandes" | Ø 0.88 (dianteira) e 0.92 (traseira) = 31% e 33% do comprimento; a traseira é mais larga (0.28 contra 0.21) |
| "carenagem envolvendo boa parte da estrutura" | 1 casca fechada de 90 faces cobrindo z −1.17…+1.18, i.e. 83% do comprimento; **não** envolve rodas nem suspensão |
| "detalhes emissivos" | 4 grupos: faixas do flanco (72 faces), cubos das 4 faces-leque das rodas (64), farol (30), lanterna (10) |
| "simétrica" | 480/492 vértices com par exato — **12 não** (ver 4.1) |
| "totalmente criada por PASSOS" | sim, verificável por `grep` |
| "pronta pra reabrir e modificar na Oficina" | abre, relê os 51 passos, exporta e reabre bit-a-bit |
| "coerente com o Atelier" | 100% das cores do `pincel` são da paleta Resurrect64 (crítico `distancia-paleta` limpo) |

**Defeitos que EU vejo nos renders (não corrigidos — o orçamento acabou):**

1. O **garfo e o braço traseiro** são lâminas retangulares de seção constante:
   leem como duas barras cinzas espetadas na carenagem, sem afunilamento, sem
   ponto de fixação, sem amortecedor.
2. A **cúpula** (para-brisa) não lê como vidro. Está com `mistura:'transparente'`
   e `opacidade: 0.45`, mas na vista lateral vira uma aleta cinza-esverdeada.
3. **Interpenetração visível** carenagem × pneus: a rabeta afunda no pneu
   traseiro e o bico no dianteiro. É intencional (não existe booleano, e a
   sobreposição foi o jeito de "envolver"), mas a linha de corte aparece.
4. **Nenhum para-lama.** A carenagem não acompanha nenhuma das rodas — o que
   mais custaria pra "envolver a estrutura" de verdade.
5. O **guidão** na vista lateral é um calombo; só lê como guidão de frente.
6. A quebra de cor **deck azul → banco preto** é pintura pura, sem quebra de
   geometria: de cima pode ler como adesivo, não como painel.
7. Os "raios" das rodas são o leque do polo do `loft` pintado em duas paridades
   — efeito gráfico, não geometria. De perto é um moinho de 16 fatias.

---

## 4 · BLOQUEADO — o que eu quis fazer e o vocabulário não deixou

Este é o item que o `docs/TETO.md` diz ser o mais valioso. Em ordem de quanto
custou.

### 4.1 · `loft` NÃO é simétrico só porque o caminho é simétrico — e isso não está escrito em lugar nenhum

**Descoberto batendo.** Não está no cabeçalho da op em `motor/oficina.js`, nem na
tabela do `docs/oficina.md`, nem na skill `criar-peca`.

Eu fiz o guidão com um `loft` cujo caminho é simétrico em x=0
(`x = −0.28 → −0.23 → +0.23 → +0.28`), e escrevi no arquivo "simétrico por
construção, sem espelho". **Falso.** A medição achou exatamente 12 vértices sem
par espelhado na peça inteira — e são exatamente os 12 anéis desse passo
(`10001`..`10012`), desvio máximo **4.45e-3**.

A causa: o frame de cada anel vem de **transporte paralelo propagado a partir da
PRIMEIRA seção**, então ele depende do **histórico** do caminho. Como os polos do
guidão estão mais baixos e mais atrás que os anéis, a tangente das pontas não é
±X puro, e as duas metades saem giradas uma em relação à outra. As **rodas**
escapam disso só porque todas as seções delas têm o mesmo y e o mesmo z — a
tangente é `(1,0,0)` constante.

Ou seja: **`loft` só preserva simetria se a tangente for constante.** É uma
condição não-óbvia, invisível no render (4,5 mm numa moto de 2,8 m) e que
NENHUM gate pega — nem `auditar`, nem `porteiro`, nem `criar`. Descobri porque
o enunciado diz "a peça deve ser simétrica" e eu escrevi uma régua para isso.
Um autor que confiasse no `criar` shipava a assimetria.

O comentário mentiroso foi corrigido no arquivo (a geometria não — o orçamento
de 3 ciclos tinha acabado; o defeito fica no artefato de propósito, com o número
ao lado).

**O que teria destravado:** uma linha no cabeçalho da op `loft` ("o frame depende
do histórico do caminho; caminho simétrico não garante malha simétrica — use
`espelha`"), **ou** um crítico de simetria no `auditar` (é 20 linhas: para cada
vértice, existe par em `(-x,y,z)`?).

### 4.2 · Não existe TRANSLADAR (nem escalar) uma seleção — e isso decidiu a peça inteira

Das 9 primitivas, **7 nascem presas à origem**: `cubo`, `cilindro`, `esfera`,
`cone`, `plano` e `chamferBox` nascem centrados em x/z com a base em y=0, e o
`lathe` gira **sempre** em torno do eixo Y (o perfil é `[raio, y]`, não tem onde
pôr um centro). Só `loft` (cada seção traz o `pos`) e `inflate` (contornos em
coordenada absoluta) aceitam posição livre.

Para mover qualquer uma das outras existe **só `moveV`, um vértice por passo**.
Uma roda de cilindro com `lados:16` custaria **32 `moveV`** — mais passos só pra
posicionar do que a peça inteira tem de geometria. O `_primitivas.js` já paga
esse preço (9 `moveV` para deslocar um cone). E `rotaciona` — que aceita seleção
rica (`{v}`/`{f}`/`{regiao}`/`{grupo}`) e pivô — **só gira**; não tem irmão que
translade.

Consequência medida: **tudo virou `loft`.** As 7 primitivas restantes ficaram de
fora não por estilo, mas porque usá-las fora da origem é proibitivo. É por isso
que uma moto inteira usa 7 das 25 ops.

**O que teria destravado:** uma op `move`/`transladar` com a MESMA assinatura de
seleção do `rotaciona` (`sel` + `d:[x,y,z]`). O helper `resolverAlvosV` já existe
e já é compartilhado; a op seria quase de graça — e destravaria imediatamente as
7 primitivas que hoje são inúteis em composição.

### 4.3 · `contorno` não aceita expressão — a seção não pode ser reescalada

`contorno` aceita literal **ou nome de PARAM**, nunca uma conta. Não há como
dizer "o mesmo 10-gon, 0,8×", nem `-nome` (o `_viga.js` já contorna isso criando
`vigaLneg` como PARAM à parte).

A carenagem precisa de uma seção que **varia** ao longo do corpo (estreita na
rabeta, larga no tanque, afilada no bico). Resultado: os **104 pontos `[u,w]` =
208 números** dos 8 contornos estão escritos um a um, e **nenhum deles é
parâmetro**. Mudar `PARAMS` só move as estações (`carY*`/`carZ*`); a forma da
seção é literal e não responde a nada. Isso é exatamente o que o
`docs/oficina.md` diz que os PARAMS existem para evitar ("sem isso o arquivo
seria só uma lista de números").

O `_viga.js` esconde o problema porque reusa UM retângulo em todas as seções —
o único caso em que o limite não aparece.

**O que teria destravado:** `escala` por seção no `loft` (`{pos, contorno, escala:[sx,sy]}`),
ou aceitar `['nome', 0.8]` como valor.

### 4.4 · Selecionar face é sempre listar id na mão — 2.164 números escritos

`rotaciona`/`displace` aceitam `sel:{regiao}` e `sel:{grupo}`. **`pincel`, `liso`,
`material`, `solido`, `parte` e `espelha` não**: só `faces:[ids]` literal.

Medido no artefato final:

- **2.104** ids de face escritos à mão nos passos de atributo;
- **60** ids a mais nos 3 `espelha`;
- **2.164 ids no total**, para uma peça de **558 faces** — cada face aparece em
  média 3,9 vezes;
- **11.656 bytes** (42% do arquivo) são listas de face;
- **26 dos 51 passos** são `pincel` — metade da peça é pintura enumerada.

Isto não é só verborragia: é o que torna a peça **hostil à edição manual**. Ela
só é escrevível porque eu gerei os ids por script; um autor humano na Oficina
clicaria face a face. E a regra de cor da casa (alternar 2 tons por PARIDADE de
id, contra o `detector-de-banding`) **dobra** o número de passos de pintura,
porque cada zona vira dois `pincel`.

Também: `parte` nomeia grupos e `resolverAlvosV` já sabe resolver `grupo:'nome'`
— mas **só `rotaciona` e `displace` usam isso**. `pincel`/`material`/`liso`/
`solido` não aceitam `grupo`, embora o mecanismo já esteja no núcleo.

**O que teria destravado:** aceitar o mesmo `sel` (`{f}`/`{regiao}`/`{grupo}`) em
`pincel`/`liso`/`material`/`solido`/`espelha`. Zero invenção — é estender o
helper que já existe.

### 4.5 · Não há como fazer um recorte (roda-a-carenagem)

Uma moto tem para-lama e caixa de roda: superfície que **abraça** o pneu. Isso
pede ou um booleano (`docs/oficina.md` tem uma seção "Booleano" — não construída)
ou uma seção **côncava/em arco**. `inflate` faz interseção de dois prismas, não
subtração, e sai *blocky*. `apagaFace` abre buraco mas deixa a malha aberta, sem
borda.

Fiz o que dava: **sobreposição**. A rabeta entra no pneu traseiro e o bico no
dianteiro. Funciona de longe e deixa uma linha de corte visível de perto — está
listado como defeito em 3.3/3.4.

**O que teria destravado:** para este caso específico, nem precisa booleano —
bastaria o `loft` aceitar caminho em **arco** com uma seção retangular fina (o
que ele até faz), mas eu não consegui garantir a orientação do contorno num
caminho curvo sem uma referência escrita de como o frame `u`/`w` se comporta
quando a tangente sai de perto de ±Y (o `quadroLoft` troca de eixo de referência
em `|t.y| > 0.9`, e isso está só no código). Não arrisquei gastar o último
ciclo nisso.

### 4.6 · Sem gabarito, o eixo de forma é cego — e "sem `_`" muda o significado da peça

Assumido pelo `docs/TETO.md`, mas vale registrar o efeito prático: durante os 3
ciclos, **a única realimentação de forma foi eu olhar o PNG**. Os 5 críticos
`[cpu]` e o porteiro não distinguem uma moto de um peixe — os dois passam com
nota cheia. O `criar` foi honesto (diz "não medido"), mas isso significa que
2/3 do meu tempo de ciclo foi julgamento subjetivo sem régua.

Detalhe menor descoberto batendo: nomear a peça `moto` (sem `_`) a coloca na
varredura do `npm run auditar` sem argumento — e ali convivem 3 peças com
achados **pré-existentes** (`arco`, `arvore-cartoon`, `vegetacao-cartoon`). A
`moto` sai limpa, mas o comando sai barulhento; não há como pedir "só as peças
novas".

---

## 5 · Onde eu travei, e o que teria destravado (auto-relato)

Travei **duas vezes de verdade**, e as duas antes de escrever uma linha da moto.

**A primeira foi descobrir que eu não podia posicionar nada.** Meu plano inicial
era o óbvio: cilindro para as rodas, `chamferBox` para o corpo, `lathe` para o
farol. Fui ler o cabeçalho de cada op para achar o argumento de posição e ele
não existe em nenhuma. Passei um tempo procurando uma op de mover no
`Object.keys(OPS)`, achei `moveV`/`moveF`/`moveA` e percebi que as três movem
**uma coisa por passo**. Aí caiu a ficha de que `loft` é o único gerador que
aceita `pos`, e o projeto inteiro se reescreveu em volta dessa restrição: a moto
não é "feita de loft" porque loft era a ferramenta certa, é feita de loft porque
era **a única**. Uma op `transladar(sel, d)` teria destravado isso em cinco
minutos e teria mudado a peça: as rodas seriam cilindros, o farol um `lathe`, o
banco um `chamferBox`.

**A segunda foi o contorno que não escala.** Eu queria uma carenagem com a mesma
seção variando de tamanho ao longo do corpo — é literalmente o que carenagem é.
Procurei um `escala` na seção do `loft`, procurei se `contorno` aceitava conta,
reli a linha do `_viga.js` que menciona `vigaLneg` e entendi que aquele PARAM
extra não é preciosismo: é o sintoma. Acabei gerando os 208 números por script.
Funciona, e o resultado é o oposto do que o formato promete — a peça tem 36
PARAMS e a forma que mais importa não está em nenhum deles.

Um terceiro atrito, menor mas constante: **escrever 2.164 ids de face à mão.**
Não me travou (script resolve), mas é o que me faz dizer que a peça não é
editável por um humano. Metade dos passos é `pincel`. Se `pincel` aceitasse
`sel:{grupo}` — coisa que o núcleo **já sabe resolver** —, a moto teria uns 25
passos em vez de 51, e o arquivo caberia numa tela.

E uma coisa que **não** me travou e eu esperava que travasse: `espelha` foi
impecável. Modelei meio garfo, meio braço e meia faixa e o espelho fechou os
três sem uma surpresa — os ids saíram na ordem documentada, os atributos foram
herdados, e as 6 cascas espelhadas têm volume positivo. É a op mais bem
documentada do conjunto, e dá pra ver.

---

## 6 · O que este relatório sugere como próximo trabalho

Pela tabela "Depois da tentativa" do `docs/TETO.md`, o bloqueio que **mais se
repetiu** é "faltou como expressar", e ele apareceu três vezes com a mesma
forma: **a seleção e a transformação são pobres onde já existe mecanismo pronto**.

1. `transladar(sel, d)` reusando `resolverAlvosV` — devolve 7 primitivas mortas ao vocabulário (§4.2).
2. `sel` (`{f}`/`{regiao}`/`{grupo}`) em `pincel`/`liso`/`material`/`solido`/`espelha` — corta ~40% do arquivo (§4.4).
3. `escala` por seção no `loft` — devolve os PARAMS à carenagem (§4.3).

E dois consertos de **contrato**, que custam linhas de texto e não código:

4. Documentar no cabeçalho do `loft` que o frame é histórico-dependente e caminho simétrico ≠ malha simétrica (§4.1).
5. Corrigir a exceção do D-125 para dizer **transcendental em qualquer op** (cos/sin de todo gerador circular), não só o ruído do `displace` (§2).
