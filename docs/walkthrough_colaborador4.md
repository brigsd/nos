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
x -19.0 · z 0.0 · raio 19.0/24.3 · grama
?cam=-19.0,0.0,1.85,0.00
```

O segundo número do "raio" é o limite **naquela direção**, então muda conforme
se anda. A string `?cam=` sai pronta pra colar na URL e voltar ao mesmo ponto de
vista.

> ⚠️ **Isto provavelmente duplica convenção que já existe.** `docs/COMUNICACAO.md`
> define, pro FPS da v2, a tecla `I` pra etiquetas de ID, a tecla `M` pro mapa,
> setores `A1`–`H8` e um HUD que já mostrava `?cam=`. A v3 não herdou nada disso
> e eu inventei um segundo vocabulário sem saber. **Antes de consolidar, vale
> decidir**: portar o protocolo da v2 pra v3 (com setores e tecla `I`), ou assumir
> o formato novo e atualizar o COMUNICACAO.md. Duas notações pra mesma coisa é o
> mesmo erro que causou o bug da borda, só que na documentação.

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

Só uma coisa, e é aditiva: **`motor/render.js` ganhou `visor.depurar(lotes)`**.

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
