# Resumo de Alterações — Colaborador 4 (branch `colaborador4`)

Tudo aqui é do **protótipo FPS v3** (`prototipos/fps/v3/`), fora um conserto
nas bancadas. Nada foi mexido no site, no engine ou no mundo.

O foco desta branch foi **jogabilidade e áudio**, não gráficos. A única coisa
que encosta no render está na seção "O que mexe com render" no fim — vale a
leitura mesmo pra quem só cuida do visual.

---

## Controles e câmera

**Câmera horizontal estava invertida.** A direção de visão é `(sin yaw, cos yaw)`,
então yaw crescente gira pra **esquerda**; somar o `dx` do mouse invertia o eixo.
Trocado pra subtração no mouse e no stick direito. O strafe usa o mesmo yaw e
continua coerente. O eixo vertical estava certo e não foi tocado.
`prototipos/fps/v3/jogo.html`

**Shift corre.** `input.shiftHeld()` lê `ShiftLeft`/`ShiftRight` no mesmo `Set`
de `e.code` das outras teclas. Velocidade ×1.8 só no plano — pulo, gravidade e
câmera intocados.
`motor/input.js`, `jogo.html`

**Esc não abria o menu.** Eram dois problemas somados. Havia **dois** handlers de
Esc registrados (um em `input.js`, outro em `jogo.html`) que se anulavam: o
primeiro abria, o segundo via "já pausado" e fechava. E o evento nem chegava —
com o ponteiro travado o navegador **consome** o Esc pra soltar o cursor e não
entrega o `keydown` pra página. Removido o duplicado; quem abre a pausa agora é
o `pointerlockchange`.
`jogo.html`

**Voltar do menu retoma a trava do ponteiro** na primeira tecla de jogo (WASD,
espaço, shift) — não na hora de fechar. Pedir no fechamento criava uma corrida:
o Chrome bloqueia `requestPointerLock` por ~1,25s depois de um Esc, e a negativa
derrubava a trava, o que reabria o menu sozinho. Amarrado à tecla, uma falha não
custa nada porque a próxima tentativa vem sozinha.
`jogo.html`

---

## Colisão

**A ilha barrava num círculo, mas a borda desenhada é orgânica.** O raio varia
de 23.6 a 26.8 conforme a direção (`R0 28 × 0.82..1.00`) e a colisão era um
círculo fixo de 25. Medido em 720 direções: em 38% delas dava pra andar até 1.4u
**além** da beirada visível, e em 62% o jogador travava **antes** de chegar nela.

`ilha-chao.js` passa a exportar `raioEm(x, z)`, que roda o mesmo cálculo dos
vértices da borda. As constantes saíram de dentro de `construir()` pro escopo do
módulo, como já tinha sido feito com o `LAGO`: duas cópias do número significam
duas verdades diferentes, e foi exatamente assim que o descompasso nasceu.
O jogo barra em `raioEm` menos `BEIRA` (0.7u). Folga verificada: 0.700 em todas
as 720 direções.
`pecas/ilha-chao.js`, `jogo.html`

**Colisão de objetos, começando pelas árvores.** O colisor é declarado no
**`meta` da peça**, não no jogo:

```js
colisao: { forma: 'cilindro', raio: TRONCO_R, altura: TRONCO_H }
```

Ele lê as mesmas constantes que geram o tronco, então mudar a espessura da
árvore move a colisão junto. **Plantar mais árvore não pede calibragem nenhuma**
— o jogo monta a lista a partir das posições. **Peça sem `colisao` no meta
simplesmente não colide**, então criar peça nova não quebra nada.

Só o tronco entra, não a copa: a copa começa acima da cabeça e incluí-la faria
esbarrar em nada a metros de distância. Esse é o argumento contra derivar
colisor de caixa envolvente automaticamente.

A resposta **empurra** pra fora do cilindro na direção do centro dele, em vez de
cancelar o movimento — é o que deixa encostar num tronco e seguir andando de
lado sem grudar. A ilha é aplicada **depois** dos objetos: se um tronco na
beirada empurrar pra fora, melhor ficar preso no tronco que cair no vazio.
`pecas/arvore3d.js`, `jogo.html`

**Tecla `O` mostra as áreas de colisão** — cilindros vermelhos vazados. Ver
"O que mexe com render".

---

## HUD

**Coordenadas no topo ao centro**, atualizando 10× por segundo:

```
setor E5 · x -19.0 · z 0.0 · raio 19.0/24.3 · grama
?cam=-19.0,0.0,1.85,0.00
```

O segundo número do "raio" é o limite **naquela direção**, então muda conforme
se anda. A tecla `=` copia a URL inteira pra área de transferência — abrir ela
devolve exatamente esta vista.

**Protocolo da v2 portado.** O `docs/COMUNICACAO.md` já definia `A1`–`H8` e as
etiquetas de ID pro FPS antigo, e a v3 tinha nascido sem nada disso; adotamos a
mesma notação em vez de inventar outra. A grade de setores sai de
`ilhaChao.EXTENSAO`, então acompanha se a ilha mudar de tamanho.

**Tecla `I` — etiquetas de ID.** Os 12 objetos mais próximos (até 14 unidades)
ganham etiqueta ancorada no topo do tronco, com opacidade caindo com a distância.
Objeto tapado por outro não mostra etiqueta: a checagem anda pela linha de visão
amostrando 12 pontos e vê se algum tronco fica no caminho — bom o bastante pra
tronco fino, e sem o custo de um raycast completo por objeto por quadro. Os
elementos do DOM são reusados entre quadros; criar e destruir div a 60fps é o que
transforma HUD de depuração em queda de fps. Desligada, nada fica no DOM e a
função nem é chamada.

ID no formato **`arvore@-13,8`**, derivado da posição e não de índice na lista —
reordenar as árvores não renomeia nada. Difere do `tipo-XxY` da v2 porque lá o
mundo era grade de tiles positivos e aqui são unidades com sinal.

**Tecla `M` — mapa grande.** Abre e fecha o mapa com a grade de setores e o
atual em destaque. Canvas 2D solto por cima; não encosta no WebGL. Ela **não**
cicla o minimapa: quem manda nele é a aba HUD, e uma tecla não deve desfazer a
escolha de quem joga. Fechando o mapa grande, volta pro que o HUD mandar.

O desenho é dividido em duas camadas por custo: ilha, água, areia e árvores não
mudam, então saem uma vez num canvas guardado (25ms, no primeiro `M`); por quadro
só se copia essa imagem e se desenha a seta do jogador. Redesenhar o terreno a
60fps seria varrer 175 mil pixels à toa.

As cores do terreno saem de `superficieEm` — a mesma função que escolhe o som do
passo. Superfície nova aparece no mapa sozinha, sem ninguém lembrar de atualizar
dois lugares.

Com isso o protocolo do `COMUNICACAO.md` está portado por inteiro.

**Aba HUD.** O minimapa passou a ser parte fixa do HUD, ligado por padrão no
canto de baixo à esquerda, e a aba escolhe entre os quatro cantos ou nenhum.
Também oculta de uma vez os textos da tela, pra print limpo. Ligados, os textos
ficam ACIMA do minimapa (`z-index` 17 contra 16): são pequenos e sumiriam por
baixo dele no canto em que estivesse.

---

## Configurações de gráfico

**Resolução interna** em valores explícitos: 480, 640, 960, 1440, 1920, 2560 e
3440. A opção "Nativa" foi REMOVIDA e é o caso que vale contar: ela acompanhava
a janela mas tinha um teto de 2560, então num monitor de 3440 entregava menos
que o nativo — e como o número no HUD era um retrato tirado na criação, nada
denunciava isso. Daí `info` ter virado função em vez de valor.

**Suavização** (`aa`): desligada, LINEAR no blit, ou supersampling 2×. Cuidado
com o `AA_SUAVE = aa === 1 || aa === 2`: o supersampling PRECISA do filtro
linear na redução. Trocar isso por igualdade estrita já regrediu uma vez, e o
sintoma foi o supersampling medir PIOR que o pixel duro contra um render de
referência, o que não fazia sentido nenhum e foi como o bug apareceu.

**Reconstrução** (`recon`): upscale direcionado por borda com nitidez local.
Não se chama FSR na interface porque não é a implementação oficial da AMD.

**TAA foi implementado e removido** — embaçava demais. Junto saíram o jitter de
Halton e a inversa de matriz 4×4 que só ele usava.

**Preset "Dinâmico"**, primeiro item da fila de presets: escada de 6 degraus que
mede janelas de ~1s e exige 3 janelas boas pra subir um degrau. Serve pra
máquina fraca e celular não serem forçados a uma escolha fixa.

**Tudo aplica ao vivo** menos textura, via `visor.aplicarTiers`, que só refaz o
que mudou. Quando o recarregamento é inevitável, a posição do jogador e a aba
aberta são preservadas.

---

## Amortecimento do olhar por mouse

Mouse comum lê a 125Hz e a tela atualiza a 120Hz. As taxas não se dividem, então
uns quadros recebem duas leituras e outros nenhuma — medimos **16% de quadros
vazios** ao girar. O acumulado fica certo, o ritmo não, e a câmera anda aos
solavancos.

`mouseLookDelta(dt, tau)` espalha cada leitura pelos quadros seguintes sem
descartar nada: a soma de um giro é idêntica à do mouse, só o caminho deixa de
ser em degraus. `tau = 12ms`, custo de cerca de um quadro de atraso.

Medido com painel temporário: a irregularidade entre quadros vizinhos cai de 17%
pra 6%, e os quadros vazios pra 0%.

**Ressalva honesta, registrada de propósito:** ninguém percebeu a diferença a
olho, nem num nível exagerado de 40ms. O ganho aqui é medido e não perceptível.
Se algum dia isso atrapalhar a mira, pode ir embora sem dó.

---

## O "fantasma" ao girar — investigado e NÃO é do jogo

Fica registrado pra ninguém gastar tempo nisso de novo, especialmente quem cuida
de gráficos.

Relato: objetos parecem deixar um rastro breve ao andar ou girar a câmera.

O que foi descartado, cada um com medição:

- **Acumulação temporal no motor** — não existe. Nenhum buffer de histórico,
  nenhuma suavização de câmera, cada quadro desenhado do zero.
- **Ritmo de quadro** — dt de 8.30ms com 0.0% de quadros fora do ritmo.
- **Descompasso de taxa com o monitor** — 120 fps num painel de 120Hz, confirmado
  no teste do Blur Busters.
- **Resolução interna e o filtro do upscale** — sem mudança nenhuma em 3440 com
  as três opções de suavização.
- **Ritmo do mouse** — corrigido (acima), e o fantasma continuou igual.

O teste que fechou: um quadrado HTML grande, ancorado numa árvore pela mesma
projeção das etiquetas, atravessando a tela junto com ela. **Ele fantasma
igual ao tronco** — e quem desenha ele é o navegador, não o WebGL.

Conclusão: é persistência de tela mais comportamento do olho. A tela segura cada
quadro aceso por 8ms, então a imagem salta de posição em posição em vez de
deslizar; com o olhar fixo no centro enquanto o mundo varre por baixo, o cérebro
registra as posições sucessivas juntas. Não é rastro do quadro anterior, são
quadros distintos vistos ao mesmo tempo.

Isso explica as três observações que antes não fechavam: o texto parado do HUD
sai limpo (não se move), os discos do teste saem nítidos a 120 (seguidos com os
olhos), e tronco e quadrado fantasmam (varrem um olhar parado).

Só backlight estroboscópico no monitor resolve. **Nenhuma mudança de código muda
isso**, então não vale procurar no render.

**Faixa de erro no rodapé.** Uma exceção dentro do `antesDoQuadro` derrubava o
`rAF` inteiro: tela preta, sem movimento, e o som seguindo normal (Web Audio roda
em outra thread) — o sintoma não apontava pra lugar nenhum. Agora o quadro roda
dentro de `try/catch`: o render continua e a mensagem com a pilha aparece na
tela. Só a primeira, senão a 60 quadros por segundo vira enxurrada. Também pega
`error` e `unhandledrejection` da janela.
`jogo.html`

---

## Áudio (`motor/som.js`, reescrito em boa parte)

O princípio que guiou tudo: **ruído contínuo filtrado não vira água nem vento,
vira chiado.** O ouvido reconhece esses sons pelos **eventos** — a bolha, a
folha, a pisada — não pela banda de ruído. Os três sistemas passaram a ser
baseados em evento.

**Passos por superfície.** `ilhaChao.superficieEm(x, z)` diz o piso e escolhe a
receita na tabela `PISOS` (grama, areia, madeira, pedra). Cada pisada é síntese
granular: ~16 grãos curtíssimos em tempos irregulares, mais 8 de raspagem 45ms
depois, sobre uma camada de corpo grave que dá o peso. Alterna pé esquerdo e
direito. O **gesto** (cheia, rasteira, seca) é sorteado por passo e multiplica
corpo/grãos/raspagem — variar só os números dentro de uma estrutura fixa não
engana o ouvido, a igualdade estrutural é percebida. 7% dos passos ganham um
estalo ressonante.

**Água.** Bolhas com glissando ascendente e lambidas de onda na margem,
agendadas em intervalo irregular, densidade por proximidade. O leito de ruído
caiu de 0.24 pra 0.04, só umidade de fundo.

**Vento.** Rajadas avulsas com **silêncio de verdade** entre elas — o ganho fica
em zero e só abre na rajada. Espera com cauda longa (produto de dois aleatórios):
mediana ~6s, passando de 20s de vez em quando. Envelope de meio-cosseno, com
derivada zero nas duas pontas, então entra e sai sem canto. Uma em cada quatro
entra rápido; a saída é sempre longa (4 a 9s). Quatro camadas dentro do envelope:
turbulência tremendo a amplitude, dois passa-banda derivando em ritmos
diferentes, um assobio de Q alto que só aparece no pico, e grãos de farfalhar.

**Receita de mar guardada no código.** Com `k=0.14` no buffer do vento e o
passa-baixa em 1400, o mesmo trecho vira som de mar. Anotado no comentário — serve
de ambiente de praia sem nenhum nó a mais.

Amplitudes somadas **em potência** (tudo é ruído, soma incoerente, não linear).
Picos medidos e anotados no código: passo entre 0.67 e 0.99 por piso; vento
calibrado em render offline contra a versão anterior.

---

## Ferramentas

**7 bancadas quebradas no Windows.** `await import(PW)` com caminho absoluto cru
(`c:\...`) estoura `ERR_UNSUPPORTED_ESM_URL_SCHEME` no ESM. `auditar.mjs` já
fazia certo com `pathToFileURL`; os outros sete foram alinhados.
`tools/bancadas/{jogar,olhar-peca,olhar,ouvir,porteiro,prancheta,res-bench}.mjs`

---

## O que mexe com render

Duas coisas, ambas aditivas.

### `visor.projetar([x,y,z])`

Leva um ponto do mundo pra coordenada de tela em pixels de CSS, pra ancorar HTML
em cima de algo 3D (é o que as etiquetas de ID usam). Devolve `{x, y, dist}`, ou
`null` se o ponto está atrás da câmera ou fora da tela.

Detalhe que vale saber: com câmera de jogador ele **reconstrói** a matriz do
estado atual em vez de usar a do último quadro. `projetar` é chamado no
`antesDoQuadro`, ou seja, antes do quadro existir — usar a matriz velha faria a
etiqueta arrastar um quadro atrás ao girar. Na câmera de órbita não dá pra
reconstruir (o ângulo depende do relógio do quadro), então lá ele usa a guardada.

### `visor.depurar(lotes)`

```js
visor.depurar([{ mesh, tex }]);   // liga
visor.depurar([]);                // desliga
```

- Desligada, a camada **não existe** no laço de desenho. Não é lote invisível
  nem material transparente — a linha é `extras.length ? [...base, ...extras] : base`,
  então sem a camada o array nem é reconstruído. Custo de quadro zero.
- Fica **fora do passe de sombra** (o `draw` recebe um flag `comExtras`), senão o
  colisor projetaria sombra no chão.
- As malhas sobem pra GPU na chamada; quem chama deve guardar o retorno e reusar.
  No jogo, a malha dos colisores é montada na primeira vez que se aperta `O`.

O visual é vermelho **furado em xadrez**, não translúcido: o shader das peças
recorta por alfa (`if (tx.a < 0.5) discard`) e não faz blend, então transparência
de verdade não existe nesse caminho. O furo é o que deixa ver o tronco através da
parede. Se um dia o render ganhar uma passada com blend, essa textura pode virar
alfa contínuo.

Nada mais foi tocado no render: shaders, tiers, sombra, névoa e partículas estão
como estavam.

---

## Armadilha que custou tempo

`python -m http.server` **não manda `Cache-Control`**, então o navegador arbitra
a validade sozinho e módulo ES importado sem query fica preso na versão guardada.
Isso produziu um `jogo.html` novo rodando com um `ilha-chao.js` velho: tela preta
e `raioEm is not a function`, sem erro nenhum no carregamento. Como cada peça é um
arquivo separado, é questão de tempo até duas ficarem em versões diferentes de
novo. Servidor de desenvolvimento deveria mandar `no-store`.
