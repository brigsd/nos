# Oficina — o registro de projeto

Recorte do antigo `docs/oficina.md` com **o que se fez e por quê**: o racional de
design das funções já construídas, os preparos de motor já concluídos, a migração
pra WebGL 2 e a Ordem de construção encerrada.

Imutável, como todo o `historico/`: consulta-se pra saber POR QUE algo é como é,
não pra saber como fazer. Pra isso, [`docs/uso/oficina-contrato.md`](../uso/oficina-contrato.md)
e [`docs/uso/oficina-referencia.md`](../uso/oficina-referencia.md).

## Decisões abertas

Nenhuma. As três que este documento carregava foram fechadas:

- **Conflito do Ctrl** — Q e E assumiram subir e descer, então o Ctrl ficou livre
  pro ímã.
- **Mesclagem contra as identidades de vértice** — a operação grava `de` e
  `para`. Resolvida, mas segue sendo a interação mais delicada do sistema, e é a
  primeira que deve ganhar teste de verdade.
- **Cor por face contra textura pintada** — deixou de ser escolha. Com projeção
  em caixa, cor por face é um modo do pincel, não um sistema concorrente.

---

## Funções e soluções

Cada problema levantado foi resolvido antes de virar código. As linhas marcadas
com asterisco têm a solução detalhada logo abaixo da tabela.

| Função | O que faz | Solução |
|---|---|---|
| **Ctrl+Z / Ctrl+Y**, 15 níveis | Desfaz e refaz. | Desfazer é apagar o último passo e reexecutar a lista; refazer usa pilha própria, apagada ao fazer algo novo. O arrasto vira **um** passo só: marca no `mousedown`, aplica visualmente durante o movimento, emite a operação com o total no `mouseup`. `preventDefault` no Ctrl+Z, que o navegador rouba. |
| **Indicador de eixo X/Y/Z** | Bússola no canto. | Canvas 2D por cima, com `visor.projetar`. Não toca no WebGL. |
| **Gizmo de mover** * | Setas X/Y/Z arrastáveis. | Seleção e arrasto resolvidos em 2D, projetando base e ponta da seta. Fórmula abaixo. |
| **R + eixo + graus + Enter** | Rotaciona digitando o valor. | Estado explícito `digitando`, que desvia as teclas antes de virarem comando. `rotX` e `rotZ` escritos abaixo, prontos pra colar. Pivô no centro da seleção. |
| **S para escalonar** | Redimensiona. | A escala é aplicada **nos vértices**, não guardada como matriz. As normais são recalculadas junto, então escala desigual não quebra a iluminação. |
| **Tab: objeto → edição → pintura** | Cicla os modos dentro do espaço Modelar. | `preventDefault` no Tab. Uma variável de modo decide qual mapa de teclas escuta; nunca dois ao mesmo tempo. Material e Animação são **espaços de trabalho** sobre a mesma cena, não abas — trocar não perde câmera nem seleção. |
| **Ver vértices / arestas / faces** (1, 2, 3) * | Mostra e seleciona as partes. | **Canvas 2D por cima, não WebGL.** O `visor.depurar` não serve: o `draw` do render usa `gl.TRIANGLES` fixo e não desenha ponto nem linha. Detalhe abaixo. |
| **E para extrudar** * | Puxa a face. | Extrusão de região: só as arestas de **borda** da seleção ganham parede. Resolve o caso de duas faces vizinhas sem precisar restringir a uma por vez. Algoritmo abaixo. |
| **Painel lateral** | Posição, rotação, dimensão. | A caixa do objeto fica guardada e só é refeita quando a malha muda. Enquanto o gizmo arrasta, os campos ficam de leitura — um dono por vez. |
| **Ímã (Ctrl segurado)** | Cola no vértice ou face mais próximo. | **Varredura linear, sem estrutura espacial.** 10 mil vértices a 60 quadros por segundo dá 600 mil comparações por segundo, que é barato. Só dividir o espaço em células se passar de uns 100 mil vértices. Colar em face é projetar no plano e prender dentro do triângulo. |
| **Mesclar vértices** | Dois viram um. | Grava `['mescla', { de: [7,12], para: 31 }]`, então o replay sobrevive à troca de identidade. Depois da mesclagem, apaga toda face que ficou com dois cantos iguais, de área zero. **O lint de malha roda logo depois** — mesclar pode criar aresta usada por 3+ faces ou face invertida, e é aí que aparece. |
| **Arestas** | Selecionar e mover. | Chave canônica `min(a,b) + ':' + max(a,b)`, então a mesma aresta nunca vira duas. Deduzida das faces a cada mudança de malha, não guardada. |
| **Pintar** * | Cor e pincel na malha. | **Projeção em caixa** gera a coordenada de textura sozinha, sem desdobrar malha. Cor por face é o primeiro modo do pincel, não um sistema à parte — assim o pincel macio entra depois sem jogar nada fora. Detalhe abaixo. |
| **Modo navegação (botão 5)** | Liga e desliga o voo. | `e.button === 4`, com `preventDefault` no `mousedown` e no `auxclick` pra não disparar o "avançar" do navegador. Tecla alternativa configurável pra mouse sem botão lateral. Com o voo desligado, olhar em volta fica no arrastar do botão do meio. |
| **Câmera livre** | WASD anda, Q sobe, E desce, scroll acelera. | O `freeCam` do `render.js` já entrega posição, yaw e pitch. |
| **Salvar e abrir do repositório** | Navegador de pastas dentro da ferramenta. | Três rotas no servidor de desenvolvimento: listar, ler e gravar. A página web não escreve em disco sozinha. Sem servidor, cai pra arrastar-e-soltar e download. |
| **Colisão automática** * | Encaixa cilindro, caixa ou esfera. | Calculada só das faces marcadas como sólidas. Fórmula abaixo. |
| **Botão de configurações** | Ajustes da ferramenta. | Reusa `.painelConfig` e `.abas` do jogo. Grade e ímã, velocidade da câmera, tamanho do gizmo, salvamento automático, tecla alternativa do modo navegação. `localStorage` em `nos3_oficina`, separado da chave do jogo. |

---

### Funções adicionais (D-73)

Além das da tabela, decididas nesta rodada.

Ajudam quem modela à mão:
- **Valor exato** — mover/girar/escalar digitando o número, não só arrastando.
- **Espelho/simetria** — modela um lado, o outro acompanha (objeto simétrico).
- **Duplicar** uma seleção.
- **Medir** a distância entre dois pontos.
- **Esconder/isolar** uma parte, pra focar no que edita.

Ajudam a IA (que não clica, descreve uma regra):
- **Selecionar por critério** — "todas as faces viradas pra cima", "as de tal
  material", "as acima de tal tamanho". É a função de modelagem que mais ajuda a
  IA: ela raciocina sobre propriedade, não sobre clique. Vira uma operação como
  as outras (`['selecionar', { onde: 'normal.y > 0.7' }]`).

## Soluções detalhadas

### Vértices e arestas na tela: canvas 2D, não WebGL

O caminho que este documento propunha antes estava errado, e vale registrar por
quê. O `draw` do `render.js` chama `gl.drawArrays(gl.TRIANGLES, ...)` fixo, então
o `visor.depurar` só desenha triângulos. Ponto e linha não passam por ali.

A saída é melhor que a proposta original. Um canvas 2D por cima, como o minimapa
e as etiquetas de ID já fazem: projeta cada vértice com `visor.projetar` e
desenha um quadradinho. Vêm sem custo três coisas que no WebGL dariam trabalho —
tamanho constante na tela, destaque de seleção, e o traço das arestas.

O que se perde é a oclusão: vértice atrás da superfície continua aparecendo.
Isso vira **opção "ver através"**, que é como o Blender trata com o raio-X dele.
Pra esconder de verdade mais tarde, o `tapado()` das etiquetas já resolve.

### Gizmo: seleção e arrasto

Selecionar a seta é projetar base e ponta e medir a distância do cursor até esse
segmento, em 2D. Nenhum raycast.

Arrastar é a parte que parece difícil e não é:

```js
const o2 = visor.projetar(origem);               // base da seta
const a2 = visor.projetar(soma(origem, eixo));   // ponta, 1 unidade adiante
const dx = a2.x - o2.x, dy = a2.y - o2.y;
const compr = Math.hypot(dx, dy);                // px que 1 unidade ocupa na tela
const dir = [dx / compr, dy / compr];
// mx, my = movimento do mouse em px neste quadro
const avanco = (mx * dir[0] + my * dir[1]) / compr;   // em unidades do mundo
```

Quando a seta aponta quase pra câmera, `compr` tende a zero e o arrasto dispara
pro infinito. Trava: com `compr` abaixo de 12px, a seta fica apagada e não
aceita arrasto.

Tamanho constante na tela: escala o gizmo por `dist / 8`, então ele ocupa os
mesmos pixels de perto e de longe.

### Rotação em X e Z

Falta no `mat4.js`. Colunas-major, no mesmo estilo do `rotY` que já existe:

```js
rotX(a) { const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
rotZ(a) { const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); },
```

### Extrudar uma região de faces

O problema era a parede interna aparecendo entre duas faces vizinhas extrudadas
juntas. A solução padrão resolve sem restringir nada:

1. Junta os vértices usados pelas faces selecionadas e duplica cada um,
   deslocado por `dist` na direção da normal média.
2. Religa as faces selecionadas aos vértices novos.
3. Acha as **arestas de borda** — as usadas por exatamente **uma** face da
   seleção. Só elas ganham parede lateral.

Aresta interna, usada por duas faces selecionadas, não ganha parede. É
exatamente o caso que estava travando a extrusão em uma face por vez.

A orientação da parede sai da ordem da aresta na face de origem, então as faces
novas nascem viradas pro lado certo sem cálculo extra.

### Pintura: projeção em caixa desde o começo

Pintar numa textura exige saber qual pedaço da imagem cada ponto do objeto usa.
Este documento chegou a tratar isso como bloqueio, dizendo que exigiria
desdobrar a malha à mão. **Está errado, e a correção mudou o plano.**

A coordenada sai sozinha por **projeção em caixa**: pra cada face, vê pra qual
eixo a normal dela mais aponta e usa as outras duas coordenadas do mundo. Face
virada pra cima usa X e Z, face virada pro lado usa Y e Z. Dez linhas, nenhum
algoritmo de desdobramento, nenhuma costura pra resolver na mão. É o que se usa
em terreno e rocha há décadas, e pelo mesmo motivo.

Ela cobra emenda visível onde a face troca de eixo dominante, e distorção em
face muito inclinada. Em formas retas e orgânicas, que é o caso do jogo, quase
não aparece.

**Por que já nascer assim, e não depois.** A versão anterior deste documento
recomendava cor por face primeiro e pincel depois. Os dois usariam sistemas
diferentes por baixo, então a segunda etapa descartaria a paleta e a geração
de coordenada da primeira. Retrabalho de verdade.

Com a projeção em caixa desde o início, **cor por face vira só o primeiro modo
do pincel** — um "preenche esta face com esta cor", pintado na mesma textura que
o pincel macio vai usar depois. Mesmo sistema, mesma operação gravada. Raio,
suavidade e degradê entram como modos novos, sem desmanchar nada.

**As pinceladas são operações como qualquer outra.** O arquivo grava
`['pincel', { modo, cor, raio, pontos: [...] }]` e a textura é gerada ao abrir.
Continua sem nenhum arquivo de imagem, o Ctrl+Z desfaz pincelada igual desfaz o
resto, e a regra de zero arquivo do jogo segue de pé.

### Encaixe automático da colisão

Das faces marcadas como sólidas, pega os vértices e calcula:

```
centro = média de x e de z
raio   = maior hipotenusa(x - centroX, z - centroZ)
altura = maiorY - menorY
```

Isso dá o cilindro em pé, que é a forma que a colisão do jogo usa hoje. Caixa e
esfera saem dos mesmos números. A ferramenta sugere a de menor volume
desperdiçado e você confirma ou troca.

Sem nenhuma face marcada, usa o objeto inteiro — e é aí que a copa da árvore
viraria parede, que é o erro que a colisão de hoje evita de propósito. Por isso
a marcação aparece em destaque na hora de salvar, e não escondida num canto.

## O que preparar no motor agora

Estas são baratas hoje e caras depois. A ordem é por quanto doeria adiar.

### 0. Migrar pra WebGL 2, antes de tudo

Decidido. Seção própria mais abaixo. Vem primeiro porque gizmo, animação e
material construídos em cima do WebGL 1 nasceriam em cima do que vai mudar.

### 1. Espaço pra cor E peso de osso no formato de vértice

O formato tem posição, coordenada de textura e normal — 32 bytes, sem cor. Isso
já bloqueou coisa três vezes neste documento: o `countershade`, o `paintVerts` e
o AO falso do `nos-Craft`, que são o principal recurso de iluminação de lá.

Acrescentar agora é uma mudança de stride, uma linha no shader e um atributo.
Acrescentar depois é mexer em toda peça existente, no `geo.js`, no `render.js` e
em cada shader ao mesmo tempo.

Ganho direto: os objetos vindos do `nos-Craft` passam a **parecer os mesmos**, em
vez de perder o sombreado. E o pincel ganha um caminho a mais, mais barato que
textura pra detalhe suave.

**Custo real:** 12 bytes por vértice e uma multiplicação no shader.

**Faça junto com o peso de osso.** O esqueleto da animação também precisa de
atributos novos (índice e peso). Mudar o formato de vértice duas vezes é pagar a
migração duas vezes — decida os dois de uma vez, mesmo que o esqueleto só seja
usado meses depois. O espaço reservado não custa nada; a segunda migração custa.

Isto encosta no `render.js`, que é território de quem cuida de gráficos —
precisa ser combinado, não feito por cima.

### 2. `draw` aceitar o tipo de primitiva

Hoje é `gl.drawArrays(gl.TRIANGLES, ...)` fixo. Trocar por
`L.modo ?? gl.TRIANGLES` é uma linha e destrava linha e ponto pra sempre —
gizmo em 3D, contorno, grade, depuração. Foi exatamente isso que obrigou os
vértices do editor a irem pra canvas 2D.

### 3. Posicionamento como dado, já

Enquanto são 12 árvores escritas à mão, mover pra arquivo é uma tarde. Depois de
três mapas povoados, é uma migração.

### 4. Tensão entre valores próprios e instanciamento

Vale saber antes de esbarrar: desenhar muitos objetos iguais de uma vez
(instanciamento) exige que sejam **iguais**. Se cada árvore tiver valores
próprios, cada uma vira uma malha distinta e o ganho evapora.

Resolução: valores próprios são exceção, não regra. O jogo agrupa por assinatura
— quem não tem alteração cai no grupo do tipo e desenha junto; quem tem sai do
grupo. Basta a estrutura de dados permitir esse agrupamento desde o começo.

## WebGL 2

Decisão do ideador: migrar, sem adotar three.js.

A troca é pequena e mecânica: criar o contexto com `webgl2`, e nos shaders subir
pra `#version 300 es` — `attribute` vira `in`, `varying` vira `in`/`out`,
`gl_FragColor` vira uma saída declarada, `texture2D` vira `texture`. As peças não
são tocadas: elas geram arranjos de vértice e não sabem de shader.

O que destrava, e é bastante:

- **Instanciamento nativo** (`drawArraysInstanced`). Hoje cada árvore plantada é
  um desenho próprio; uma floresta de 500 viraria mil desenhos por quadro. Com
  instanciamento, viram um.
- **Textura de profundidade de verdade** na sombra. Hoje o motor empacota a
  profundidade em RGBA e desempacota no shader (o `PACK` do `render.js`). Some o
  truque, some a perda de precisão.
- **Vários alvos de render** de uma vez, que é o que uma passada de transparência
  ou de efeito precisa.
- **Texturas de tamanho livre** com repetição e mipmap, sem a regra de potência
  de dois do WebGL 1.
- Mais uniformes disponíveis, o que importa direto pro esqueleto da animação.

Suporte é universal hoje. O risco da migração é baixo e o retorno é alto — e ela
deve vir **antes** da Oficina, não depois, senão gizmo, animação e material
nascem em cima do que vai mudar.

WebGPU (a tecnologia gráfica acima do WebGL 2 — mais objeto na tela sem travar,
e a placa de vídeo pra cálculo pesado) fica pra depois, por um motivo concreto:
hoje ainda falta em cerca de um quinto dos aparelhos (mais antigos, Firefox no
Android), e "qualquer um entra, PC ou celular, sem instalar" é a alma do NÓS —
excluir um quinto dos jogadores não vale. Mas ele não é abandonado: o motor
nasce com o **renderizador trocável** (uma camada fina que separa *o que
desenhar* de *com qual tecnologia desenhar*), então o WebGPU fica reservado na
arquitetura. Quando o suporte dele chegar perto de universal — o que deve vir
junto com o momento em que o mundo fica grande o bastante pra precisar do teto
dele —, plugá-lo é acréscimo, não reescrita. A abstração em si não é construída
agora (com um só renderizador seria prematura); o que nasce cedo é a decisão de
deixar a porta pronta, o mesmo princípio do envelope. Decisão registrada em
D-75.

## Ordem de construção

> Estado por milestone: `[x]` feito · `[~]` em andamento · `[ ]` a fazer. O
> quebra-fino de cada milestone (as subtarefas em curso) vive na lista de
> tarefas da sessão, não aqui — aqui é o mapa, não o diário.

0. `[x]` **Migrar o motor pra WebGL 2** — feito (D-76): troca pura, contexto
   `webgl2` + os 7 programas de shader em `#version 300 es`, saída
   **byte-idêntica** à anterior (20 renders conferidos por `cmp`). O espaço de
   vértice pra cor e peso de osso ficou **reservado** como acréscimo (somar um
   atributo depois é aditivo, não re-migra shader), não embutido — mesmo
   princípio da reserva do WebGPU (D-75).
1. `[x]` **Estrutura de dados (vértices únicos, faces, identidades) e a lista de passos** — feito (D-77): `motor/oficina.js` (núcleo neutro + adaptador v3 + `colisaoDe`), numeração posicional por bloco, vocabulário inicial (cubo/cilindro/moveV/extruda/mescla/pincel-face/solido/liso), a bancada `executar` que prova o replay, e a peça `_oficina-toco`. As operações restantes da tabela entram nos passos que as usam (extruda no 7, mescla+ímã no 8, etc.).
2. `[x]` **Câmera do editor com cursor livre** — feito (D-78): `oficina.html`, esqueleto D-73 + órbita/pan/zoom dirigindo o motor por `setCam`, centragem provada por medição (`projetar`, 0.00px). Nuance de centrar na área visível resolvida com lente deslocada (D-79); auto-enquadrar peça arbitrária segue aberto.
3. `[x]` **Ver vértices e faces por cima da malha, em canvas 2D** — feito (D-80): overlay 2D (`pointer-events:none`) desenha os vértices (pontos) e faces (arestas) do neutro (`nucleo`), projetados por `visor.projetar`, redesenhado no `antesDoQuadro` (casa com o quadro + a lente D-79). Alinhamento provado por bbox de pixels (19/19); tecla `i` mostra os ids.
4. `[x]` **Selecionar e arrastar um vértice, gravado como operação** — feito, o MILESTONE (D-81): hit-test câmera-vs-vértice no `pointerdown`, arrasto 2D→3D no plano da câmera na profundidade do vértice (segue o cursor 0.04-0.06px, provado por medição), grava `moveV`, e a lista editada re-executada refaz o objeto bit-idêntico (página == Node). "O teste da ideia inteira" passou.
5. `[x]` **Desfazer e refazer em cima disso** — feito (D-82): como toda edição é uma operação no FIM de `PASSOS` (passo 4), desfazer = tirar a última e re-executar, refazer = pôr de volta — sem sistema de histórico à parte. `oficina.html` trava um `baseline = PASSOS.length` ao abrir (as operações que vieram do ARQUIVO): Ctrl+Z remove a última e a empilha em `redo` enquanto `PASSOS.length > baseline` (no piso é no-op — a construção da peça não se desfaz); Ctrl+Y / Ctrl+Shift+Z desempilha de `redo` e devolve ao fim; uma edição nova (arrasto → moveV) limpa `redo`. Só mexe na lista e reexecuta — determinístico. Provado por medição (`tools/bancadas/oficina.mjs`, passo 5): desfazer volta ao baseline e o neutro canônico bate BIT-A-BIT com o de ANTES do arrasto; refazer bate com o de DEPOIS; piso do baseline é no-op; edição-nova-limpa-redo; e o ciclo 3 arrastos → 3 desfaz → 3 refaz fecha idêntico. Status mostra `passos N · desfazer M · refazer K`.
6. `[x]` **Gizmo de eixos e o painel lateral** — feito (D-83): setas X/Y/Z no vértice selecionado (tamanho constante `dist/8`, trava `compr<12px`) pra arrasto TRAVADO por eixo (`d=eixo·avanço`, vazamento 0 por construção), na MESMA máquina de arrasto (guardas 4/5 cobrem); painel `#props` mostra o vértice (id+x,y,z) + a caixa do objeto + valor editável (digitar → moveV). Passe adversarial: pronto pra main; consertado o D3 (re-digitar o valor exibido gravava moveV fantasma). Nuances de UX abertas: D1 (seta cobre outro vértice ~21% dos ângulos), D4 (sem clamp no valor digitado).
7. `[x]` **Extrudar uma face** — feito (D-86): interface só (`oficina.html`), núcleo intocado. Seleção de FACE (a da FRENTE por profundidade do centroide, adiada pro pointerup pra não deselecionar ao orbitar) + um handle na NORMAL que, arrastado, grava `['extruda',{face,dist}]` — reusa a op provada do núcleo e a MESMA máquina de arrasto do passo 6 (as guardas de roda/Ctrl+Z já cobrem). Provado por medição (bancada 25 afirmações, replay página==Node, normal do handle espelhada byte-a-byte do núcleo) + prova adversarial em Node da classe formato-salvo (edição composta, órfão grita-não-corrompe, inset, empilhar). Extrusão de REGIÃO (várias faces, arestas de borda) fica pra um passo próprio (muda o núcleo).
8. `[x]` **Mesclar e ímã** — feito (D-87): interface só (`oficina.html`), núcleo intocado. Multi-seleção de vértice (Shift+clique, o ATIVO é o último e dirige gizmo/painel — com 1 vértice idêntico aos passos 6/7); tecla M/botão grava `['mescla',{de:[não-ativos],para:ATIVO}]` (a op provada do núcleo); ÍMÃ com Ctrl no arrasto cola o vértice na posição EXATA do vizinho (`d=posAlvo−orig`), reusando a máquina de arrasto (a guarda do Ctrl+Z já cobre o Ctrl-segurado). Provado por medição (bancada 35, replay página==Node, ímã 5.6e-17) + prova adversarial em Node da classe identidade/formato (mescla determinística/ordem-independente, bowtie grita, órfão pós-mescla não corrompe). Colar em face e lint de malha visual ficam pra um passo próprio.
9. `[x]` **Pintar faces (o pincel modo "face")** — feito (D-88): interface só (`oficina.html`), núcleo/adaptador intocados. Multi-seleção de face (Shift+clique, espelha o passo 8) + `<input type=color>`+presets no painel → grava `['pincel',{modo:'face',faces,cor}]`, renderiza pelo SWATCH que já existe (`reexec` recarrega a textura). **Projeção em caixa + textura pintável por objeto TRANSFERIDAS pro passo 11** — o pincel macio é quem precisa de textura espacial; e box projection faz topo/fundo de objeto fechado caírem no mesmo pedaço da textura (pintar um pinta o outro), pior que o swatch pra cor por face. Provado por medição (bancada 26 afirmações, incl. probe de pixel madeira→azul; replay página==Node) + prova adversarial em Node.
10. `[x]` **Exportar código pelo servidor de desenvolvimento, e colisão automática** — feito (D-89): núcleo intocado. Serializa o estado (PARAMS/TOPO/PASSOS/meta) num `.js` idêntico ao molde de peça (número via `String(double)` reabre exato, `colisao: colisaoDe(...)` como chamada literal, cabeçalho gerado) — a peça exportada REABRE bit-a-bit idêntica à editada. Servidor de dev novo (`tools/servir.mjs`): serve com `no-store` + `POST /oficina/salvar` grava em `pecas/<nome>.js` (nome sanitizado + confinamento — barra traversal literal e codificado), download como fallback. Interface de marcar `solido` (alimenta `colisaoDe`; aviso em destaque se nenhuma face sólida). Provado por medição (bancada 26, ida-e-volta bit-a-bit, replay página==Node) + prova de segurança independente em Node.
11. `[x]` **Modos livres do pincel: raio, dureza, degradê** — feito (D-90/91/92), em 3 partes. Inclui (transferido do passo 9, D-88) a base de textura pintável. **11a (D-90):** `adaptarV3` troca o swatch por um ATLAS por face (projeção em caixa PRIVADA por face, sem o furo do topo/fundo da caixa global), render BYTE-IDÊNTICO ao swatch. **11b motor (D-91):** a op `pincel` aprendeu `modo:'livre'` (dab `{f,a,b}` face-local em `f.tinta`, raio/dureza) + o `adaptarV3` rasteriza o dab radial macio; determinístico, tinta acompanha a face, modo 'face' byte-idêntico (compat estrutural). **11c (D-92):** a interface — modo pincel (chip/tecla B) + raio/dureza/cor no painel; arrastar na superfície pinta (raycast = inverso EXATO de `projetar` com a lente, round-trip 0.00px → `{f,a,b}`), preview ao vivo, desfazível, reusa a máquina de arrasto. As duas únicas mudanças no núcleo desde o passo 1 (11a/11b, só `adaptarV3`+op `pincel`). O modo "face" (passo 9) migrou pro atlas sem trocar o formato salvo. Nuance: borda pixelada (ilha 28×28 texels/face) — combina com o estilo; sobe o `ATLAS_TILE` pra suavizar.
12. `[x]` Espaço Material: parâmetros por lote no shader, e a passada de transparência. **12a FEITO (D-93):** materiais OPACOS — a op `material` + `MATERIAIS` (por peça), o `adaptarV3` agrupa faces por material em lotes, e o `render.js` ganha `uEmissivo/uAspereza/uSemLuz/uCorMul` por lote no padrão do `uRim` (default no-op). **12b FEITO (D-94):** a MISTURA transparente — `mistura:'transparente'` + `opacidade` marca o lote e o `render.js` desenha os transparentes numa passada EXTRA de trás pra frente (blend alpha, depth-write off), restaurando o estado pras partículas. 1ª vez que a Oficina toca a jóia: **byte-idêntico no jogo com material desligado** (leitura estrutural + cmp de relógio congelado 15 frames + prova de 2 lados: vidro transparente deixa o núcleo aparecer, opaco esconde). Passo COMPLETO.
13. `[x]` Espaço Animação: `parte` com nome, trilhas de chave, animação rígida. **13a FEITO (D-95):** o MOTOR — a op `['parte',{nome,faces,pivo?}]` nomeia faces, o `adaptarV3` agrupa por (parte,material) pra cada parte ter matriz própria, e uma seção `ANIMACOES` (`{duracao,repete,trilhas:[{parte,canal,chaves}]}`) vira `peca.animar` (canais rot/pos/escala, interpolação suave, pivô centroide-ou-explícito, determinístico). **A jóia `render.js` fica com DIFF VAZIO** — o animador entra pelo hook `animar(t,lotes)` que já existe, casando parte↔lote por índice; compat byte-a-byte (peça sem parte idêntica). Peça-exemplo `_oficina-anim` gira no visor. Só laço (`repete`); gatilho/estado e esqueleto ficam pro futuro/passo 14. **13b FEITO (D-96):** a INTERFACE — o chip "Animação" (seletor de espaço) abre a lista de partes + a linha do tempo (só `oficina.html`, motor/jóia intocados); nomear parte grava a op `parte`, montar trilhas+chaves edita `ANIMACOES`, o scrub/play preview vem de um `animar` embrulhado com `previewT` (sem tocar no render.js), e `serializarPeca` grava ANIMACOES (round-trip bit-a-bit + pose T=1 página==Node). Passo COMPLETO.
14. `[x]` Esqueleto com deformação suave — adiciona ao formato de vértice os
    atributos de peso/índice de osso (o acréscimo reservado no 0, feito quando
    o esqueleto finalmente os consome). **14a FEITO (D-97):** o MOTOR — `ESQUELETO`
    (ossos com hierarquia/pivô) + a op `pesar` (peso por vértice, top-4), linear blend
    skinning determinístico, e a trilha de `ANIMACOES` pode mirar um osso. **A 1ª vez
    que a animação toca a jóia `render.js`:** o skinning é ADITIVO (programa/stride de
    16 floats num passe SEPARADO, precedente do 12b) — lote sem osso segue no caminho de
    8 floats de hoje, **byte-idêntico** (jogo 15/15 @ 0px, cmp à parte). A peça `_oficina-esqueleto`
    (tentáculo de 3 ossos) dobra suave. Só cena (sombra/contorno do mesh skinado ficam de
    fora, anotado). **14b FEITO (D-98):** a INTERFACE de rigging — no espaço Animação, um
    painel Esqueleto (criar ossos com pai/pivô, hierarquia, validação do motor na UI) +
    Peso (face + osso + slider → op `pesar`, junta suave por 50/50 acumulado, heatmap); o
    dropdown de alvo da trilha passou a listar ossos, e o `serializarPeca` grava ESQUELETO
    (round-trip bit-a-bit + pose skinada T=1 página==Node). Motor/jóia intocados. **Passo
    COMPLETO — e com ele o ROTEIRO INTEIRO (0–14): a Oficina está pronta.**

A **aba Desenho** não depende de nada disso e pode ser construída a qualquer
momento, inclusive primeiro: é polígono em canvas 2D, sem malha e sem
identidades. Mesmo sem a modelagem pronta, ela já paga sozinha — você passa a
mandar contorno exato pra IA em vez de imagem pra ser traçada.

A **Aba Som** também não depende do resto: é Web Audio puro, sem malha e sem
identidade de vértice. Pode nascer em paralelo a qualquer ponto da lista
acima — `motor/som.js` já prova que a síntese funciona, falta só a
interface e o formato de passos por cima.

A **IA na criação de peças** (os dois caminhos) depende de uma coisa só do
formato: a Lista de operações ter os passos descritivos que o contrato
promete (`loft`, `inflate`, `lathe` — já fechados nesta rodada). O painel
BYOK dentro do jogo em si está fora do roadmap (possível, não planejado); o
caminho por assinatura — a IA soltando peça no repositório — já funciona e
não espera nada desta lista de construção.

A bancada sem interface do `executar` entra junto com o passo 1, não no fim:
ela é o que deixa provar que o replay está certo antes de existir tela pra
olhar.

Os passos 1 e 4 são o teste da ideia inteira. Quando arrastar um vértice
funcionar e o arquivo de passos refizer o objeto igual, o resto é trabalho
conhecido.

---

## O que este documento assume do motor

- `visor.projetar` — mundo → tela, já existe (feito pras etiquetas de ID).
- `visor.depurar` — existe, mas hoje **não serve pro editor**: o `draw` usa
  `gl.TRIANGLES` fixo, então não desenha ponto nem linha. Vértices e arestas vão
  pra canvas 2D por cima. Ver "O que preparar no motor agora": uma linha resolve.
- `freeCam` no `render.js` — câmera livre, já existe.
- `mat4.js` — falta rotação em X e Z (escritas neste documento, prontas).
- **Servidor de desenvolvimento com rota de gravação** — não existe ainda. É o
  que permite salvar em `pecas/` sem passar pela pasta de downloads. O servidor
  `no-store` da investigação de cache é a base.
- Formato de vértice: posição, coordenada de textura e normal. **Não tem cor** —
  é a limitação nº 1 a resolver (ver "O que preparar no motor agora"). Enquanto
  não for, a pintura vive na textura gerada por objeto. Mexer nisso é território
  de quem cuida de gráficos, então precisa ser combinado, não feito por cima.

