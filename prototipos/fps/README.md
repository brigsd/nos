# O Coração em primeira pessoa — o cliente OFICIAL

Raycaster clássico (DDA + floor casting + billboards, sem lib) lendo o
MESMO `world/heart.json` e os MESMOS sprites 16px do jogo. 60fps a
320×180, tudo procedural (árvores L-system, água com shader, ilha
flutuante, ciclo dia/noite).

**Aprovado como visão oficial do jogo** (decisão do ideador): o botão
JOGAR do README abre esta visão, publicada pelo Pages em **`/fps/`** —
`site/scripts/build-fps.mjs` inline o mundo da batida atual dentro deste
HTML a cada deploy (e o Pages redeploya a cada batida, então ela fica
sincronizada com o mundo vivo). Este arquivo (`nos-fps.html`) segue
sendo a fonte da verdade; `site/public/fps/` é só saída de build.
O mapa 2D continua no ar na raiz do Pages como visão de cima + painéis.

Screenshots de QA não ficam na main (peso) — evidência visual vive no
branch de trabalho `claude/fps-prototipo` e é regenerável via Playwright.

## Rodar
```
# o data.js já vem committado; regenerar é opcional:
node build-data.mjs   # regenera data.js a partir do mundo/sprites atuais
# abra nos-fps.html no navegador (file:// funciona — tudo local;
# tree3d-core.js precisa estar na mesma pasta, e está)
```
Controles: WASD anda, clique mira com o mouse (ESC solta), ←/→ olha,
M alterna o minimapa, T acelera o tempo, G alterna a GI; no touch,
arraste (esquerda anda, direita olha).

## Árvores 3D (esta branch: `claude/tree3d-leaves`)

As árvores deixaram de ser sprite de um lado só: cada uma cresce como
esqueleto 3D de verdade (`tree3d-core.js`) e é rasterizada de **8
azimutes** com **sol fixo no mundo** — 6 espécies × 8 vistas + cerejeira
+ árvore seca, folhas como pinceladas presas em 3D à copa.

**Como testar o efeito 3D (o roteiro do QA):**

1. Abra `nos-fps.html` e espere ~3s (o load assa só a vista frontal;
   as outras 7 assam em segundo plano — se você correr antes disso,
   algumas árvores seguram a vista mais próxima já pronta até a certa
   chegar).
2. Escolha uma árvore isolada na campina e **ande em círculo** ao redor
   dela olhando pra copa: a silhueta e os galhos mudam de verdade a cada
   ~22.5° (8 vistas), e **o lado iluminado fica parado no mundo** — de um
   lado você vê a face ao sol (amarelo-esverdeada), do oposto a face à
   sombra (verde-azulada). É o mesmo truque das pedrinhas 3D.
3. `window.__setTod(0.5)` no console fixa meio-dia (luz estável pra
   comparar); `T` acelera o ciclo se quiser ver a noite.
4. Vento: a copa verga e a base fica parada (cisalhamento no desenho,
   não frames assados).

Limite conhecido e honesto: com 8 vistas há um "pulo" perceptível ao
cruzar o limite de vista MUITO perto da árvore. Se incomodar em jogo,
os caminhos são 16 vistas (2× memória) ou um fade curto na troca.

## AS RUÍNAS — A Clareira v3 (esta branch, D-38)

A vila deixou de ser vila: **A Clareira é o que restou de quem veio
antes** (quem fez o Commit Primordial? — LORE.md). As oficinas saíram;
o que há são ruínas que afundam um pouco a cada pulso, lore literal.

### O que existe agora (nomes canônicos)

| Estrutura | Onde | O que é |
|---|---|---|
| **Torre da Crônica** | NE do largo | lasca de 3.1 tiles com degraus de desabamento e escombros na base |
| **Ala do Átrio** | em volta do portal | o Portal do Átrio é o ÚNICO arco de pé do salão; fragmentos altos e tocos marcam o resto |
| **O Arquivo** | SW | salão sem teto (dizem que a Crônica era guardada ali); um canto de 2.1 sobreviveu, uma coluna caída dorme dentro |
| **Anel da Primeira Batida** | NW | 7 monólitos de basalto com glifos lavanda; as veias do Pulso correm mais fortes por baixo — à noite é o lugar mais bonito do mundo |
| **Quarteirão Afundado** | S | muros engolidos até a cintura (h 0.25–0.55) — o chão cobra as ruínas de volta |
| **Colunata quebrada** | chegada oeste | pares de colunas partidas em alturas diferentes; uma já está deitada na grama |
| **Obelisco torto** | S | afundou de um lado e aponta errado; glifos descendo a face |
| **A CABEÇA** (`a-cabeca`) | S | colosso de pedra afundado até os olhos. De quem era? Ninguém liga em voz alta ao "horror sem cabeça" (Detached Head, LORE.md) |

Ficaram: o Portal do Átrio + painel ◈ MUNDOS CONECTADOS (D-37), os 4
lampiões (o toque dos Nativos entre as pedras), o calçamento — agora
ERODIDO onde a grama venceu.

### Como foi feito (pra quem for mexer)

- **Paredes**: o mesmo `CITY` map do D-32 (DDA client-side com altura por
  tile) — "quebrado" é composição de ALTURAS (degraus de desabamento),
  porque raycaster não tem topo recortado. ~40 tiles em 6 conjuntos.
- **Texturas novas** (`genWallTex`): `ruin` = fiadas ciclópicas tortas
  com blocos FALTANDO (vãos escuros por hash), rachadura serpenteante e
  musgo subindo da base, em 3 seeds pra variar; `ruinDark` = monólito
  SEM argamassa (pedra única: grão vertical alongado, arestas fundas,
  glifos lavanda com trechos apagados). Lição do olhar: monólito com
  fiada lia como muro de tijolo.
- **Billboards novos**: `genColumn` (fuste canelado partido em altura
  sorteada), `genFallenColumn` (deitada, face do corte visível, grama
  por cima), `genObelisk` (inclinação no desenho, ponta lascada),
  `genHead` (domo frontal enterrado: arcada pesada, olhos fechados,
  nariz mergulhando na terra, musgo em manchas, faixa de terra em
  dither + franja de grama POR CIMA pra assentar).
- **A Cabeça levou 5 versões de olhar** — registro honesto: v1 deitada
  de perfil = ovo; v2 feições maiores = baleia dormindo; v3 perfil
  esculpido na silhueta = bico de chaleira + "portinha" (orelha); v4 sem
  orelha ainda não lia; v5 FRONTAL E ENTERRADA leu na hora. Moral pra
  próxima arte: nesta resolução, rosto lê de frente e simétrico.
- **Escombros**: os pedregulhos 3D grandes (`rock3d` scale 0.42–0.6)
  voltaram como entulho com colisão (`rockTiles`) — exatamente o uso
  previsto quando viraram pedrinhas ("pra ressuscitar os grandes em
  outro cenário: ruínas?").
- **Chão**: clareira sem árvores cresceu de r5→8.2; calçamento ganhou
  manchas novas (Anel/Arquivo/colunata) com EROSÃO por noise (buracos
  onde a grama venceu — sem isso lia como estacionamento); as veias do
  Pulso ganharam 3 nascentes (largo, Anel mais forte, vazamento fraco
  em volta da Cabeça).
- **GI (D-36)**: `bake-gi.mjs` re-sincronizado com a geometria v3 +
  luzes de veia novas no Anel e na Cabeça; o artefato não é committado,
  todo deploy re-assa. `build-fps.mjs` agora inline `tree3d-core.js`
  no html único do Pages.

Roteiro de teste: entre pelo carreiro (oeste) — colunata → largo →
portal; suba ao Anel (NW) DE NOITE (`window.__setTod(0.97)`); desça ao
Quarteirão Afundado (S) e encare A Cabeça; `?cam=46.3,20.3,1.15` cai
direto nela.

## Modo dia (iteração 2 — direção BotW)

A pedido do ideador (referência: campos de Breath of the Wild), o protótipo
virou DIA e a floresta deixou de ser parede esticada:

- **Árvores geradas** (`tree-core.js`, L-system + copa por campo de
  densidade) como BILLBOARDS de verdade — 6 variantes, uma por tile de
  floresta (com desbaste + jitter determinístico), até ~3.0 tiles de altura.
- **Rochas geradas** (blob + normal quantizada + musgo) espalhadas pela
  campina por hash determinístico; bloqueiam movimento.
- **Céu panorâmico** (gira com a câmera): gradiente liso + cúmulos + maciço
  fixo no rumo leste como marco do mundo. Nuvens à deriva.
- **Bruma diurna** (paleMint) no lugar do breu — a distância derrete em luz.
- Chão de grama gerado (base clara + salpicos + flores, ref. BotW).
- `prototipos/estudio/tree-studio.html`: o Estúdio de Cena interativo
  (árvores 9 espécies, rochas, céu, cena composta — exporta PNG; regenera
  qualquer referência visual, por isso não commitamos os PNGs dele).

## Dia e noite (iteração 3)

Ciclo completo em ~4 min (segure **T** para o dia voar; QA:
`window.__setTod(0.75)`). A sacada da ilha flutuante: **o horizonte é o
mar de nuvens lá embaixo** — o sol se põe AFUNDANDO nele (visível só pelos
pixels de vazio além da borda; o nosso chão o oculta via groundMask), e o
mar incandesce perto de onde ele desce. À noite: lua com crateras, halo e
**pilar de luz**, estrelas cintilando atrás das nuvens, mundo em luz fria
(fog/ambiente dinâmicos no shade()) — o glow violeta do Núcleo é emissivo
e domina o escuro. Crepúsculo: céu quente concentrado no rumo do sol,
nuvens rosadas, raios crepusculares. Vida: bandos de pássaros ocasionais
de dia, grilos e sapinhos raros pulando perto da câmera (sapos só perto
d'água, via shoreField).
