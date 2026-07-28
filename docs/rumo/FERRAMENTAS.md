# FERRAMENTAS — o plano da potência (D-56)

> Pedido do ideador (2026-07-17): "ferramentas que potencializem o trabalho a
> níveis alienígenas" + "precisamos de um objetivo final". Varredura por 5
> agentes (bancadas, arte, motor v3, som, fluxo) sobre o arsenal real; síntese
> e prioridade pelo coder. Isto é PLANO — cada item vira rodada quando chegar
> a vez, e a ordem serve ao PORT v3 (missão do momento).

## O OBJETIVO FINAL

**Da frase ao mundo no ar em uma sessão — sem passo cego e sem regressão.**

O ideador descreve uma coisa ("uma ponte de corda sobre o riacho, rangendo ao
vento"); o coder a fabrica como peça (geometria+textura+animação+som), audita
com os próprios olhos (imagem, movimento, espectro, números de perf), compõe
no mundo, publica — e gates automáticos garantem que nada do que já existe
piorou. A Oficina vira **A Fábrica** (a lore do Coração aplicada a nós mesmos):
o custo marginal de criar despenca, a qualidade se defende sozinha.

**Potência, definida** (os 4 eixos que todo item abaixo serve):
1. **Ciclo** — editar→ver em segundos, não minutos (hoje: rebuild+relançamento inteiros por rodada).
2. **Visão total** — nunca criar às cegas: diff, movimento, som legível, interior, aparelho real.
3. **Alavancagem** — 1 comando = trabalho de 10: bibliotecas, variações em lote, importadores.
4. **Gates** — regressão visual/sonora/perf vira ERRO automático, não descoberta tardia.

Legenda: ★ = prioridade (serve o port já) · [N] nova · [M] melhoria

## 1 · O port v2→v3 (a missão)

- ★ [N] **porta-mundo** — gancho `__nosMundoV3()` no v2 despeja o mundo inteiro (SEGS, PLANTAS, CITY, bills, troncos, terreno) em `mundo.json`; conversor gera lotes v3. O port vira "escrever 1 conversor", não redigitar 4000 linhas.
- ★ [N] **paridade-v2v3** — mesmo ponto do `pontos.json` renderizado nos DOIS clientes, lado a lado + métrica de divergência. "Ficou igual?" vira medição com placar, não memória.
- ★ [M] **cena-composta** — visor aceita `?cena=` compondo várias peças com matrizes (`compor(ctx)`). O embrião literal do cliente v3: a clareira montada peça a peça, auditável a cada passo. **PARCIAL (D-61)**: `jogo.html` compõe ilha-chao+arvore3d de verdade (matrizes por instância, dedupe de textura por referência) — mas à mão, hardcoded na página; o mecanismo GENÉRICO (`?cena=`, `compor(ctx)` como contrato de peça) não existe ainda.
- ★ [M] **camera-andavel** — WASD/touch no visor + `?cam=` + pontos nomeados POR peça (ex.: casa-toras: "interior"). Interiores deixam de ser cegos; o ideador passeia na cena no celular. **✅ ENTREGUE (D-61)**, mas em `jogo.html` (o alicerce jogável), não no `visor.html` da Oficina — `motor/render.js` ganhou câmera livre (`setCam`) + `motor/input.js` (WASD/mouse/touch); pontos nomeados por peça não foram feitos (hoje é só `?cam=x,z,yaw,pitch` cru). Bancada: `npm run jogar`.
- ★ [N] **perf-gpu + orçamento-peça** — `__nosPerfGL` (draw calls, tris, ms por passo) + orçamento declarado em `meta` que FALHA a bancada se estourar. Sem isso o v3 cresce no escuro — a regra "nunca otimizar sem perfil" morre no port.
- [N] **boletim-celular** — `?boletim=1` mede 20s no aparelho e desenha um cartão GIGANTE (fps p50/p1, res recomendada) feito pra print. O ideador vira sensor de perf com custo de um toque.

## 2 · Os olhos (bancadas de visão)

- ★ [N] **bancada-viva** — daemon: server+Chromium sobem UMA vez, `fs.watch` re-screenshota a cada save. O ciclo editar→ver cai de ~15s pra ~2s. A fricção nº 1 do trabalho, morta.
- ★ [N] **porteiro-visual** — toda captura falha (exit≠0) se houver pageerror, `__ready` falso ou frame degenerado (tela preta/branca). Shader quebrado NUNCA mais passa "verde".
- ★ [N] **diff-visual com baseline** — `--gravar` salva referência; toda rodada gera antes|depois|heatmap + % de mudança, com `--gate` pra CI e `--aceitar` pra promover. O "vitest da estética", pra olhar/peca/prancheta.
- [M] **folha-de-contato** — todos os pontos/peças numa ÚNICA grade rotulada (+ capturas em paralelo). Auditar 14 pontos = 1 Read, não 14.
- [N] **filme** — `--filme=8` congela `animar(t)`/o mundo em N quadros numa tira única. Animação (porta, água, fumaça) finalmente LEGÍVEL — hoje é invisível no frame parado.
- [N] **lente-raiox** — `?raiox=1`: wireframe, normais como espinhos, régua de unidades + lint de geometria (tri degenerado, NaN, fora do frustum de sombra). Depuração de malha deixa de ser adivinhação.
- [N] **prancheta-peca** — vistas ortográficas (topo/frente/lado) com dimensões em tiles anotadas, direto dos lotes. Escala e proporção viram números, como a prancheta fez pro v2.
- [N] **sonda-gl** — `__nosGL`: renderer real, logs de compilação de shader, context-lost. A mensagem de erro REAL do driver no terminal.

## 3 · A fábrica de matéria (arte/texturas)

- ★ [N] **materiais-v3** — `motor/materiais.js`: fábricas parametrizadas dos materiais aprovados — `madeiraTora({larg,seed})`, `telhaBarro()`, `tabuas()`, `veneziana()`, `pedra()`. A 2ª casa não copia código da 1ª; o estilo fica coeso por construção.
- ★ [N] **paleta-estendida** — os RGB aprovados (D-54f) nomeados e registrados (`mel-crista`, `castanho-corpo`...) + lint que acusa cor literal fora do registro. A identidade visual protegida por ferramenta, não por memória.
- [M] **tex-node** — `texCanvas` isomórfico (browser+Node). Destrava auditar textura sem subir Chromium — pré-requisito do lab.
- [N] **lab-texturas** — `npm run lab -- madeiraTora --vary larg=2.4:4.4:5` gera grade de variações lado a lado (plana + wrap + paleta usada). Escolher a melhor de 15 custa 1 comando, não 15 edições.
- [N] **mostruario-v3** — todos os materiais em cubo/plano/cilindro sob a luz do jogo, publicado como página viva. Vitrine + teste de coesão de estilo.
- [M] **critico-v3** — o crítico do art-mcp (seams, banding, paleta) apontado pros materiais v3.

## 4 · Os ouvidos (som)

- ★ [N] **synth-kit + peca-som** — `motor/som.js` com blocos (`ruido/filtro/lfo/env`) e presets nomeados (vento, água, passos, sino, fogo, UI); contrato `construirSom()` nas peças. Som novo custa 1 linha; a casa pode ranger no vento com o mesmo gesto com que gira.
- ★ [N] **espectro-png** — som renderizado offline vira ESPECTROGRAMA+envelope em PNG. O pulo alienígena: eu não tenho ouvidos, mas tenho olhos — som ganha o mesmo loop desenha→olha→ajusta da arte.
- [N] **som-diff** — assinatura espectral por fonte como baseline; refactor que transforma água em chiado vira erro de gate (hoje passa).
- [M] **ouvir-offline** — medição em OfflineAudioContext com ruído seedado: determinística e ~5× mais rápida.
- [N] **ouvir-mapa** — heatmap do campo sonoro sobre o minimapa (onde a água alcança, onde há silêncio morto).
- [N] **ouvir-gesto** — grava envelope durante uma AÇÃO (andar, clicar): transientes de 80ms que o RMS médio jamais vê.

## 5 · O metabolismo (fluxo/deploy)

- ★ [N] **publicar** — `npm run publicar -- "D-56 …"`: mata a linha-monstro "Published rounds" (vira `rounds.json`), toca `site/**` como efeito estruturado, monta o commit no padrão da casa.
- ★ [N] **vigiar-deploy** — skill que acompanha o run do Pages via MCP (actions_get) até verde/vermelho, com logs em falha. Aposenta o poll ad-hoc reinventado toda sessão.
- [N] **sincronizar-batida** — `npm run sync`: rebase automático sobre as batidas do bot (verificando que são SÓ batidas). O push rejeitado de hora em hora deixa de ser interrupção.
- [N] **pre-voo** — replica localmente TUDO que o CI vai rodar, com falha rápida. Mata o push-and-pray.
- [N] **memoria** — DECISIONS/CONTINUITY indexados e consultáveis (`memoria -- buscar "billboard"`); registrar atrito vira comando. A memória do projeto para de ser grep em prosa.
- [M] **galeria da oficina** — `peca --todas`: todas as peças renderizadas + porteiro, publicado como galeria. Rede de proteção do motor compartilhado + vitrine pro ideador.
- [M] **estruturas-v3** — a skill /estruturas atualizada pro ciclo novo (prancheta→peça→paridade→publicar).

## 6 · O senso crítico (pra eu parar de me enganar)

> Pedido do ideador: "uma ferramenta para resolver teu senso crítico... uma que
> te ajude em arte, outra percepção 3D". Pesquisa por 3 agentes sonnet (senso
> crítico de IA, arte/textura, percepção 3D). **O achado que sustenta a seção:
> eu falho JUSTO quando julgo o que acabei de criar, na mesma conversa que criou
> — viés de auto-preferência + falta de grounding.** A cura não é "olhar com mais
> atenção"; é **sinal externo objetivo** (número que não depende da minha opinião)
> + **juiz cego** (sem saber que fui eu) + **checagem-CPU** (bug geométrico que
> nenhuma imagem deixa óbvio). Três tipos de ferramenta: `[cpu]` roda em Node sem
> IA · `[render]` passe extra do motor · `[disciplina]` como eu devo olhar.

> **STATUS (D-60): os 5 críticos `[cpu]` abaixo estão CONSTRUÍDOS e MEDIDOS por
> benchmark** (peças reais × defeitos plantados). Todos gateiam o defeito real
> com **NÚCLEO F1=1.00, zero falso-alarme na arte de verdade**; o round
> adversarial mapeou o piso de cada um (ver D-60 e a skill `/auditar-peca`).
> Comandos: `npm run auditar <peca>` · `npm run porteiro <peca>` · `npm run bench`.
> Marcados com ✅ abaixo. O resto (`[render]`/`[disciplina]`) segue como plano.

**Arte / textura (achados: seams, banding, paleta, referência)**
- ✅ [N] **distancia-paleta** `[cpu]` — CIEDE2000 (LAB, lib `color-diff` offline) de cada pixel gerado contra a paleta/RGB aprovados. Cor fora do registro vira NÚMERO, não "acho que ficou estranho". A defesa mais barata e a que mais me pega.
- ✅ [N] **detector-de-seam** `[cpu]` — deltaE nas bordas do tile (wrap L↔R, topo↔base) e nas junções de lote. A costura visível da tora/telha vira erro medido, não descoberta no print.
- ✅ [N] **detector-de-banding-e-ruido** `[cpu]` — run-length de cor + autocorrelação (FFT) pra separar dither Bayer (bom, periódico) de ruído aleatório (ruim). Ataca exatamente o "partes escuras/claras sem consistência" que o ideador me apontou 3×.
- ✅ [N] **pixels-orfaos** `[cpu]` — componentes conexos: pixel solto de 1px fora de forma. Lixo de textura pego antes de subir.
- [M] **comparador-com-referencia** `[cpu]` — quando o ideador manda imagem-alvo (como a madeira), histograma LAB + distância. "Bateu com a referência?" vira placar.

**Percepção 3D (achado: sou pior em profundidade que em lateral; normais/winding me escapam)**
- ✅ [N] **lint-de-malha** `[cpu]` — sobre os arrays de vértice ANTES do render: triângulo degenerado (área~0), winding/normal invertida (aresta compartilhada em sentidos consistentes), buraco (aresta usada ≠2 vezes), AABB fora de proporção. Pega o bug que causa artefato sutil e NUNCA salta num PNG. (funde com o `lente-raiox` da seção 2.)
- ★ [N] **passe-normal-profundidade** `[render]` — 2 PNGs extra por cena: normal em cor + profundidade linear em cinza. Face invertida aparece como cor errada ANTES de eu tentar julgar luz; z-fighting aparece como banda no depth. Ataca direto minha fraqueza medida de profundidade.
- [N] **regua-humana** `[render+disciplina]` — silhueta humana (~1.75u) fixa num canto de todo interior/exterior novo. Escala relativa (confiável) no lugar de escala absoluta "no vácuo" (onde erro). A porta estreita/alta teria sido óbvia com ela.
- [N] **prancheta-ortografica** `[render+disciplina]` — 4 vistas orto (frente/topo/lado/iso) numa grade 2×2 com grid métrico; me obrigo a comparar vista-a-vista antes de julgar proporção. (é a `prancheta-peca` da seção 2 com o grid + a disciplina de comparação.)
- [N] **checagem-z-fighting** `[cpu]` — pares de triângulos quase-coplanares e sobrepostos dentro do epsilon do depth. Complementa o lint pro artefato mais chato de ver parado.

**Senso crítico / juiz (achado: auto-julgamento in-context é onde eu mais erro)**
- ★ [N] **juiz-cego** `[disciplina]` — comparação pairwise antes|depois com ORDEM TROCADA e sem dizer qual fui eu; só conta como ganho se vence nas duas ordens (mata viés de posição + auto-preferência). É o cérebro do `diff-visual` da seção 2.
- ★ [N] **rubrica-multi-eixo** `[disciplina]` — cada peça julgada por eixos fixos e separados (silhueta / escala / material / costura / luz), nota por eixo, não impressão geral. Disciplina de prompt que impede o "ficou bonito" encobrir um eixo quebrado.
- [N] **similaridade-clip** `[cpu-ish]` — CLIP ViT-B/16 via transformers.js (~87MB, offline após baixar): distância imagem↔imagem e imagem↔texto ("cabana de toras aconchegante"). Um segundo olho que não sou eu. Só quando os baratos acima já rodarem.
- [N] **distancia-estrutural** `[cpu]` — SSIM já (DISTS quando der): fidelidade estrutural/textura contra baseline ou referência, melhor que diff-pixel pra material.

> Regra transversal: **todo julgamento meu passa a citar pelo menos um número
> objetivo** (`[cpu]`) — não "ficou bom", e sim "seam max ΔE 2.1, paleta 100%,
> malha limpa". O `[cpu]`/`[render]` gera o fato; a `[disciplina]` me impede de
> ignorá-lo. Quase tudo aqui roda offline, sem IA, e vira gate de CI.

## 7 · O ROBÔ (CI/Actions) — papel definido, ferramentas SUGERIDAS (D-71)

> Rodada longa de conversa com o ideador (2026-07-20) sobre "o que mais dá pra
> tirar do robô". O que o robô É: um computador de nuvem que LIGA SOZINHO
> quando algo acontece (push, horário, botão), roda a lista que escrevemos, e
> desliga. O que ele NUNCA é: motor ao vivo (o jogo roda no aparelho do
> jogador; o robô não está lá) nem consertador autônomo (sugere; humano
> aprova — mudar código sozinho é proibido).
>
> **O que está DECIDIDO aqui é só o papel e os limites** — conferidor / forno /
> relógio, nunca motor-ao-vivo nem conserto-autônomo, mais o guard-rail no fim.
> As ferramentas listadas abaixo são **SUGESTÕES — nada no roadmap.** Cada uma
> só nasce quando uma dor real aparecer; se a dor não vier, não se constrói.
> Estão escritas pra não re-pensar do zero quando a dor chegar — não pra virar
> tarefa. (O ideador não consegue, com razão, medir o ganho delas no abstrato:
> quase todas tiram dor MINHA, não dele; a dor é que vai aprovar cada uma.)

**Papéis (3):** conferidor (gates) · forno (pré-cozinha o pesado) · relógio
(tarefas agendadas — o tick já é isso).

**Sugestões (nenhuma no roadmap — esperam dor real):**
- [N] **ronda-da-oficina** — nasce JUNTO com o núcleo da Oficina: toda peça
  renderiza sem erro (porteiro), replay 2× dá idêntico (determinismo), órfão
  grita, exemplos executáveis do contrato rodam. É o braço automático do
  "portão de regressão" do túnel da IA (`oficina.md`).
- [M] **sentinela-de-custo** — o `perf-gpu`/`orçamento-peça` (seção 1)
  rodando no robô: "esta peça custa N× a mediana" vira aviso automático.
  Honestidade: CPU de nuvem compara peça-contra-peça bem; não crava fps de
  celular específico — pra isso segue o `boletim-celular`.
- [M] **diff-visual no robô** — o baseline da seção 2 rodando a cada push:
  mexeu no motor → lista de QUAIS peças mudaram de aparência, com recortes.
- [M] **forno** — o padrão `bake-gi` (luz assada na publicação) é a regra
  geral: conta pesada que dá pra fazer UMA vez e salvar roda no robô, o jogo
  só lê pronto. Candidatos: posicionamento/mapas grandes, empacotamento.
- [N] **shaders** — o robô NÃO compila shader (compilação é da GPU de cada
  jogador; resultado não é portátil) — ele VALIDA (shader quebrado reprova) e
  pré-monta o texto final. No jogo: **aquecimento de shaders no carregamento
  como OPÇÃO ligável/desligável nas configurações** (decisão do ideador) —
  paga o custo no loading pra não engasgar jogando; vira relevante quando o
  espaço Material multiplicar os shaders.
- **Logs do jogo → análise**: possível, fora do roadmap (exige canal de
  coleta que não existe). Conserto automático: NÃO, nunca — só sugestão.

**Mais 3 sugestões que a conversa não tinha visto (também fora do roadmap):**
- [N] **painel-de-botões** — `workflow_dispatch` + artifacts: o ideador
  dispara uma bancada PELO NAVEGADOR/celular (botão na aba Actions, sem
  terminal) e os PNGs/números ficam anexados na página da rodada. O ideador
  ganha as bancadas do coder sem precisar do coder.
- [N] **PR-com-olhos** — PR que toca peça ganha comentário automático do robô
  com o render antes|depois. Revisão vira VISUAL — e é exatamente o que a
  federação por PR (cada mundo um repo) precisa pra colaborador de fora.
- [N] **ronda-profunda** — por push, só os gates rápidos; de madrugada/semanal
  o pesado: varredura completa de perf, folha-de-contato de TODAS as peças,
  bench dos críticos. Rápido no dia a dia, fundo no ciclo lento.

**Guard-rail (o medo do ideador, virado regra):** só entra checagem que a
gente ENTENDE; uma por vez; checagem nova começa AVISANDO e só vira reprovação
depois de calibrada (senão o robô vira ruído e a gente para de ler); desligar
= apagar a linha. O robô não inventa nada — tudo que ele faz está escrito em
`.github/workflows/`, legível.

## Ordem de construção proposta (as 5 primeiras rodadas)

1. **porteiro-visual + diff-visual** — dão olhos seguros a TODAS as outras rodadas; tudo que vier depois já nasce auditado.
2. **bancada-viva + folha-de-contato + filme** — o ciclo cai pra segundos; movimento vira legível.
3. **porta-mundo + cena-composta + camera-andavel** — o port começa de verdade, com o mundo v2 como dado.
4. **perf-gpu + orçamento-peça + paridade-v2v3** — o port avança MEDIDO (fps e fidelidade), não no escuro.
5. **materiais-v3 + paleta-estendida** — a fábrica de matéria; daqui em diante toda peça nova custa menos que a anterior.

Os `[cpu]` do senso crítico (distancia-paleta, detector-de-seam, lint-de-malha)
entram JUNTO da rodada 1: são baratos, offline, e passam a proteger toda peça
nova desde o primeiro material v3 — é o senso crítico virando gate, não opinião.

(som, metabolismo e o resto entram intercalados conforme a dor apertar — som
quando a 1ª peça sonora nascer; publicar/sync na primeira sessão de port longa.)
