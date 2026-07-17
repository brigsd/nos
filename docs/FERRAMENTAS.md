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
- ★ [M] **cena-composta** — visor aceita `?cena=` compondo várias peças com matrizes (`compor(ctx)`). O embrião literal do cliente v3: a clareira montada peça a peça, auditável a cada passo.
- ★ [M] **camera-andavel** — WASD/touch no visor + `?cam=` + pontos nomeados POR peça (ex.: casa-toras: "interior"). Interiores deixam de ser cegos; o ideador passeia na cena no celular.
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

## Ordem de construção proposta (as 5 primeiras rodadas)

1. **porteiro-visual + diff-visual** — dão olhos seguros a TODAS as outras rodadas; tudo que vier depois já nasce auditado.
2. **bancada-viva + folha-de-contato + filme** — o ciclo cai pra segundos; movimento vira legível.
3. **porta-mundo + cena-composta + camera-andavel** — o port começa de verdade, com o mundo v2 como dado.
4. **perf-gpu + orçamento-peça + paridade-v2v3** — o port avança MEDIDO (fps e fidelidade), não no escuro.
5. **materiais-v3 + paleta-estendida** — a fábrica de matéria; daqui em diante toda peça nova custa menos que a anterior.

(som, metabolismo e o resto entram intercalados conforme a dor apertar — som
quando a 1ª peça sonora nascer; publicar/sync na primeira sessão de port longa.)
