# O Playground — o épico da criação por IA

O objetivo: um ambiente onde a IA cria conteúdo de verdade — **"a IA modelou a
moto do Tron, um dragão, um navio" dentro do estilo do jogo** — sem sair do
formato de PASSOS. Não é uma ferramenta nova: é fechar o vocabulário da Oficina
+ uma camada de dado/veredito por cima dela. Nasceu do debate de 2026-07-24
(D-113); as specs de cada op moram em `docs/oficina.md` ("Lista de operações").

## As regras do épico (valem pra toda frente)

1. **O formato é sagrado.** Tudo emite PASSOS; nada de malha assada. O
   `construir(ctx)` JS-puro segue como *fallback que encolhe* — cada op nova
   rouba um caso dele. Cair nele = sinal de qual op construir em seguida.
2. **Núcleo primeiro, interface depois.** Uma op nova entra no `motor/oficina.js`
   + testes + doc; o botão na Oficina é onda separada. (Peça com a op nova já
   REABRE na Oficina — o `executar` roda a lista; só não tem botão de criar.)
3. **Número + VEREDITO + evidência.** Ferramenta de medir devolve
   `APROVADO/REPROVADO` (exit≠0) com limiar CALIBRADO (exemplos bons × defeitos
   plantados, o método do `bench`/D-60) e o render junto — nunca uma nota crua
   pra IA interpretar (a lição dos "83%": nota sem régua convida leitura
   otimista). Sentidos independentes têm que concordar (número + imagem +
   geometria); "está bom" continua sendo do ideador.
4. **Numeração é formato salvo.** Toda op nova documenta a numeração de
   vértice/face no cabeçalho + em `docs/oficina.md`, travada por teste — depois
   de shipada, NUNCA muda (peça salva depende dela). Revisor adversarial em
   toda op (é formato salvo por definição).
5. **A cada op entregue:** marcar aqui `[x]`, atualizar a tabela do
   `docs/oficina.md` e o vocabulário da skill `criar-peca`, registrar D-nº.

## Ordem de construção

- [x] **P0 · Este roteiro** (D-113).
- [x] **P1 · Primitivas que faltam** — `esfera`, `cone`, `plano` no núcleo.
      Winding/tampas consistentes com cubo/cilindro (normal pra fora); guarda de
      overflow do bloco; numeração documentada+testada. Peça-exemplo
      `pecas/_primitivas.js`; specs na tabela do `docs/oficina.md`.
- [x] **P2 · `lathe`** (perfil `[[raio,y],...]` rotacionado → vaso, coluna,
      roda) no núcleo. O FORMATO do perfil nasceu aqui — com alça de curva
      RESERVADA desde já (um ponto de 2 elementos é reto pra sempre; um 3º
      elemento GRITA em vez de mudar de figura sozinho quando a curva chegar —
      "Aba Desenho" no oficina.md). Generaliza o esquema da esfera (que É um
      lathe de meia-circunferência); winding/numeração travados por teste;
      guarda de overflow do bloco. Peça-exemplo `pecas/_torno.js` (peão de
      xadrez, fechado nas duas pontas por polo — watertight, provado por
      manifold).
- [x] **P3 · `espelha` + `rotaciona`** — simetria bilateral (metade → inteiro)
      e rotação de seleção. Destrava qualquer objeto simétrico (veículo, corpo).
      `espelha` DUPLICA a seleção refletida (ids novos do bloco, formato salvo)
      com WELD automático (vértice exatamente no plano é compartilhado — o
      mesmo teste de igualdade exata do polo do lathe) e winding revertido
      (mantém a normal pra fora); `rotaciona` só desloca posição (nunca cria
      id). Guarda de overflow (D3) independente pra vértice-novo/face-nova.
      Peça-exemplo `pecas/_espelhado.js` (cabeça com par de chifres, watertight
      — costura soldada provada por manifold). Specs na tabela do
      `docs/oficina.md` e no vocabulário da skill `criar-peca`.
- [x] **P4 · `loft`** (seções ao longo de um caminho → casco, corpo, galho). O
      `lathe` é o TEMPLATE (mesmo cursor/polo/anel/leque/guarda); a peça nova é
      o FRAME por TRANSPORTE PARALELO — reimplementado local ao núcleo,
      byte-equivalente ao `quadro`/`transporta` de `arvore-cartoon.js` (a
      convenção já provada no `galhoSeca` do jogo) — que orienta cada anel sem
      torcer o tubo numa curva (provado por teste: todo quad anel↔anel
      não-borboleta, mesmo num caminho fortemente curvo). Args `secoes:
      [{pos,raio}]` (≥2) + `lados`; a chave `secao` (contorno 2D) é RESERVADA
      e fail-closed (a mesma lei da alça de curva do lathe, D-115) — o formato
      do contorno nasce no P5. Winding/numeração travados por teste; guarda de
      overflow do bloco. Peça-exemplo `pecas/_galho.js` (galho curvo em mais
      de um eixo, afinando, fechado nas duas pontas por polo — watertight e
      volume assinado positivo, provados por manifold).
- [x] **P5 · Contorno como DADO + gabarito IoU** — o formato do contorno
      fechado (pontos `[x,y]`/`[u,w]`, alça reservada no 3º elemento — a lei
      do lathe/D-115) tem DOIS consumidores: a chave `contorno` do `loft`
      (seção NÃO-circular — estrela, hexágono, retângulo, sem tocar em nada
      da numeração/faces/overflow) e `tools/bancadas/gabarito.mjs` (a
      bancada: silhueta renderizada, extraída por diferença contra o fundo
      vazio — a peça `_vazio` — e filtrada por componente conexo pequeno
      contra o ruído de partículas/grama, × contorno de referência de
      `prototipos/fps/v3/gabaritos/<peça>.js`, devolve IoU + VEREDITO
      calibrado pelo método do bench/D-60 — `LIMIAR_IOU=0.55`, o vale entre 3
      traçados bons (0,65–0,88) e 5 errados (0,00–0,44) — com evidência em
      PNG). Forma vira número. Peça-exemplo `pecas/_viga.js`. (O canvas da
      Aba Desenho — a UI — fica pra onda de interface, P9; hoje o `CONTORNOS`
      é escrito à mão olhando o PNG, o mesmo formato que o canvas vai
      preencher sem mudar nada rio abaixo.)
- [x] **P6 · `inflate`** (D-119) — dois contornos 2D (`contornoLado`, plano
      z×y; `contornoTopo`, plano z×x — a convenção da Aba Desenho) viram
      VOLUME 3D: a interseção dos dois prismas (extrusão do lado ao longo de
      X ∩ extrusão do topo ao longo de Y). Sem fórmula fechada (ao contrário
      de lathe/loft) — implementado por GRADE DE VOXEL (não CSG geral):
      watertight POR CONSTRUÇÃO (só emite face entre um voxel dentro e um
      vizinho fora — parede interna nunca aparece), numeração emerge de um
      SCAN determinístico (cantos da grade ganham id na primeira vez que uma
      face os referencia), guarda de overflow (D3) monta local antes de
      commitar em `st`. Vale a largura/altura INDEPENDENTES (o corpo pode ser
      mais largo que alto — nem lathe nem loft-com-raio conseguem, os dois só
      fazem seção circular). LIMITAÇÃO HONESTA registrada: resultado BLOCKY
      (facetado pelos voxels), não suave — a mesma classe do "lathe só reto
      por enquanto"; suavizar (marching cubes ou parecido) fica pra quando o
      caso real pedir. Peça-exemplo `pecas/_corpo.js` (corpo oval achatado,
      watertight, provado por manifold + volume assinado).
- [x] **P7 · A camada IA — laço único** (D-120) — `tools/bancadas/criar.mjs`
      (`npm run criar -- <peça>`) recebe a peça e devolve NUM comando: estado
      como dado (vértices/faces/caixa/colisão, direto do núcleo, sem browser),
      os renders (3 ângulos texturizados + 3 `geo=normais` — a evidência
      forçada), os gates (`auditar` + `porteiro` + `gabarito` SE houver
      referência em `gabaritos/`) e um VEREDITO AGREGADO (exit≠0 = reprovado).
      O manifesto de capacidades sai do PRÓPRIO núcleo — `Object.keys(OPS)`
      (exportado, D-120), nunca copiado à mão — e é CRUZADO contra a tabela
      da skill `criar-peca`: op no núcleo sem doc, ou doc citando op que não
      existe mais, vira achado (provado plantando os dois tipos de deriva e
      medindo que a bancada realmente aponta). Um único browser é reaproveitado
      pra porteiro+renders+gabarito (não relança a cada gate). Fecha o "83%"
      por construção: os quatro pilares (núcleo, crítico, render, forma) saem
      juntos sempre — nenhum fica de fora por esquecimento do operador.
- **P8 · Edição restante** — seis peças, ficam soltas (não uma numeração
      salva nova, cada uma é independente):
  - [x] **P8a** (D-121) — `moveF` (move os cantos de uma face, ADITIVO,
        compartilhado move junto), `moveA` (move as duas pontas de uma
        aresta, açúcar sobre dois `moveV`), `vira` (inverte o winding de uma
        face — CARACTERÍSTICA documentada: virar uma face já consistente
        desalinha o pareamento com as vizinhas, o uso responsável é o
        oposto), `apagaFace` (remove a face; os vértices ficam — buraco de
        propósito). Nenhuma cria id novo — todas id-estável puro, como
        `moveV`/`extruda`/`mescla`. **Seleção por região/grupo:**
        `resolverAlvosV` (novo helper compartilhado) amplia o `sel` do
        `rotaciona` (P3) com `{regiao:{min,max}}` (caixa delimitadora — os
        dois lados OBRIGATÓRIOS, sem sentinela `Infinity`, que o `st.num`
        já recusa por lei, D-118) e `{grupo:'nome'}` (as faces daquele
        `f.parte`, reusa a nomeação do passo 13a) — refatorado sem mudar o
        comportamento de `{v}`/`{f}` (141 testes preexistentes continuam
        batendo byte-a-byte).
  - [x] **P8b** (D-122) — `chamferBox`: primitiva nova, a caixa CANTELADA
        (cantos e arestas chanfrados por um corte flat só — não arredonda).
        Fórmula fechada como cubo/esfera/cone (SEM parâmetro TOPO: a
        contagem é sempre 24 vértices/26 faces, sem guarda de overflow —
        não tem como estourar). A primeira derivação à mão (puxar o
        vértice de canto por UM eixo — "truncagem") dava uma malha que NÃO
        fecha (provado errado por característica de Euler, V−E+F≠2, ANTES
        de escrever uma linha de oficina.js); a certa é cantelação (cada
        FACE encolhe pelos dois eixos que não são o dela). Winding não tem
        giro único (ao contrário do cilindro/esfera) — cada face se
        auto-orienta contra o centro real da caixa, verificado nas 26
        faces por teste, não numa amostra.
  - [x] **P8c** (D-122) — `displace`: desloca uma seleção ao longo da
        NORMAL MÉDIA (Newell por vértice) por ruído de valor 3D seedado
        (`ruido3`/`hash3`, novo utilitário do núcleo — FORMATO SALVO: a
        fórmula do ruído é o que faz a peça salva reproduzir o mesmo
        relevo sempre). Reusa `resolverAlvosV` (P8a) pra seleção; vértice
        sem nenhuma face GRITA (sem normal pra seguir). Peça-exemplo
        `pecas/_pedra.js` combina as duas: chamferBox + displace = pedra
        lascada, watertight por cima do relevo (displace só move posição,
        nunca topologia).
- **P9 · Onda de interface** — os botões da Oficina pras ops novas + o canvas
      da Aba Desenho (specs no oficina.md). Investigação antes de codar (achado
      que define o tamanho do épico): NENHUMA op do playground (P1-P8) tinha
      QUALQUER botão até aqui — nem `espelha`/`rotaciona`, que existem no núcleo
      desde o P3 — e não existia jeito nenhum de criar geometria do zero pela UI
      (só editar uma peça já escrita à mão). `serializarPeca`/desfazer/refazer já
      são 100% genéricos (não sabem nome de op) — não precisam mudar pra nenhuma
      op nova. Fatiado como o P8, cada rodada uma capacidade coerente:
  - [x] **P9a** (D-123) — Adicionar forma: o bloco `#blocoAdicionar`
        (`oficina.html`, "Passo 15" — o comentário-mestre da linha 2 já estava
        desatualizado antes desta rodada, não documentava o Passo 14b; a
        numeração daqui em diante é só nos comentários locais, não mais
        emendada nele) lista as 6 primitivas de parâmetro ESCALAR (cubo/
        cilindro/esfera/cone/plano/`chamferBox`) — `lathe`/`loft`/`inflate`
        ficam de fora de propósito (pedem perfil/contorno, um array de
        pontos — a Aba Desenho, P9-futuro). Empurra `[tipo,{...campos}]` no
        fim de PASSOS (cai no BLOCO livre seguinte por POSIÇÃO, nunca colide
        com o que já existe) e seleciona as faces novas. Nasce na ORIGEM
        sempre — reposicionar é o vértice/gizmo já existentes, não uma
        feature nova. Parâmetro inválido (ex. chanfro fora da faixa) GRITA
        sem corromper a geometria já existente (provado).
  - [x] **P9b** (D-124) — bloco `#blocoEditar` (`oficina.html`, "Passo 16"),
        por ÚLTIMO no painel Modelar (achado ao rodar a bancada inteira, não
        por leitura, D-116: entre Vértice e Cor empurrava `#pcPresets` do
        passo 9 pra fora da área visível do painel rolável, e o clique de
        coordenada crua do teste errava o alvo — 2 falhas silenciosas sem
        nada a ver com pincel/cor). `moveF`/`vira`/`apagaFace` agem na FACE
        ATIVA (a convenção do handle de extrude: "a seta extruda só a
        ativa"); `moveA` no PAR de EXATAMENTE 2 vértices selecionados — sem
        hit-test de aresta novo, o par-de-2 do Shift+clique (passo 8) já
        SERVE porque o núcleo não exige adjacência real (doc do `moveA`). Um
        delta `dX/dY/dZ` RELATIVO (não um alvo absoluto — isso é o painel
        Vértice, só faz sentido pra 1 vértice), guardado como o valor exato
        do passo 6 (D3 no-op de zero, D4 recusa além de ±100).
  - [x] **P9c** (D-125) — blocos `#blocoRuido` (`displace`, P8c) e
        `#blocoTransformar` (`espelha`/`rotaciona`, P3), no fim do painel
        Modelar (a mesma lição de posição do P9b). Aparecem com QUALQUER
        seleção (vértice(s) OU face(s) — o núcleo aceita qualquer contagem,
        ao contrário do par-exato do bloco Editar); Espelhar fica
        desabilitado sem face (a op só aceita `sel.f`). Depois de espelhar,
        a seleção pula pras faces NOVAS (o padrão do adicionarForma).
        Achado ao rodar (não hipotético): o round-trip página↔Node com
        `displace` na lista diverge na 12ª casa decimal (`Math.sin` do
        ruído não é garantido bit-exato entre engines, D-116) — não é bug,
        é limite de medição; a bancada compara estrutura EXATA + posição
        com epsilon 1e-9.
  - [x] **P9d** (D-126) — blocos `#blocoGrupo` e `#blocoRegiao` (`oficina.html`,
        "Passo 18"), sempre visíveis no Modelar. Grupo REUSA
        `animCtl.selecionarParte` (a mesma fonte da lista de Partes em
        Animação) — nomear parte continua sendo ação de Animação (D-96),
        Modelar só LÊ. Região é seleção nova: min/max XYZ inclusivos + botão
        "usar caixa do objeto"; a regra de dentro/fora é a MESMA do
        `resolverAlvosV`. As duas são SÓ SELEÇÃO — nunca gravam passo,
        populam `selVertices`/`selFaces` como um clique — então os botões
        dos P9a-c já funcionam em cima do que elas selecionam, de graça.
        2 achados reais ao rodar: um hook novo chamava `partesNomeadas()`
        de um escopo que não a enxerga (só `animCtl.partes()` tinha o
        closure certo); e os botões de Grupo/Região não desabilitavam no
        arrasto, ao contrário de todo botão desde o P9a — os dois
        consertados antes da bancada formal.
  - [ ] **Aba Desenho** — canvas 2D vetor (contorno pro `loft`/`inflate` +
        gabarito IoU AO VIVO) + o modo pintura livre (specs em
        docs/oficina.md "Aba Desenho"/"Desenho livre"). Epico à parte, maior
        que o resto do P9 somado — não teto de uma rodada só.

## A régua de pronto

- **P1–P4 prontos:** uma moto estilizada sai por PASSOS (espelho + lathe/loft +
  emissivo, que já existe).
- **P5–P7 prontos:** a forma é MEDIDA (IoU com veredito) e o laço é um comando
  — o "83%" fica impossível por construção.
- **Épico pronto:** a moto do Tron impecável de ponta a ponta sem sair do
  formato. O dragão é a régua do capítulo seguinte (esqueleto/skinning/keyframes
  JÁ existem — falta só a carne orgânica: loft na espinha + inflate).
