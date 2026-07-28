---
name: nos-fluxo
description: O fluxo pra construir e entregar QUALQUER feature no repo NÓS — a matriz de gates completa, a revisão adversarial por risco (feita solo hoje, e por que), quando ainda vale delegar a subagentes, verificar por medição, e o cuidado com git (ff-merge de branch wip, render.js e som.js são jóias). Use SEMPRE que for construir uma feature, revisar/mergear na main, rodar os gates ou registrar uma decisão no NÓS.
---

# NÓS — como construir, verificar e entregar

Convenções fixas: todo trabalho vai pra **`main`** direto; respostas e docs em **PT-BR, plano e pragmático** (sem gíria); o ID do modelo NUNCA em commit/PR/artefato.

## Git

- **Antes de TODO push**: `git fetch origin main && git rebase origin/main` (se outro push tiver entrado, o seu é rejeitado sem isso). O tick 2D que commitava de hora em hora foi DESLIGADO (D-110/D-111) — a main só muda por trabalho seu ou do ideador.
- **Todo trabalho vai numa branch `wip/...`** (a partir de `origin/main`) — delegado ou solo, sem exceção; depois `git checkout main && git merge --ff-only wip/... && git push -u origin main`. Apague a branch e limpe o `scratchpad/` no fim. O `--ff-only` é de propósito: se não fizer fast-forward, algo entrou na main e você precisa saber ANTES de mesclar, não depois.
- **Se o push falhar por REDE** (não por rejeição): tente até 4× com espera crescente (2s, 4s, 8s, 16s). Rejeição não é rede — aí é rebase.
- **DUAS jóias — `render.js` (render do jogo) e `motor/som.js` (áudio do jogo).** Mudança em qualquer uma é **opt-in e no-op quando desligada** (somar zero, guardar com `?? padrão`, passe/ramo separado), e verificada BYTE-idêntica com o recurso off: `cmp` de PIXEL (`porteiro`/frozen-clock nas peças do jogo) pro render, `cmp` de AMOSTRA (OfflineAudioContext) pro som. Se precisar mudar uma linha EXISTENTE de uma jóia, PARE e reporte. Nunca uma mudança que altere a saída do jogo sem intenção. (O `som.js` virou jóia no roteiro de som — D-99→D-105; a ponte `tocarEvento` do S5b é o único toque, aditivo.)

## Gates (rode antes de todo commit)

**Os leves, sempre:** `npm run mapa:check` (todo arquivo rastreado precisa de um comentário de cabeçalho — **arquivo novo sem cabeçalho quebra o gate**; após criar arquivos, `git add -A` → `npm run mapa` → re-stage `docs/uso/MAPA.md`), `npm run docs:toc:check`, `npm run typecheck`, `npm run test`.

**A matriz cheia, pra qualquer coisa que encoste na Oficina ou no jogo** (é o que de fato roda toda rodada do playground, D-118→D-127) — os 4 acima **mais**:

| Gate | Prova o quê | Como ler |
|---|---|---|
| `npm run oficina` | a bancada da Oficina inteira (Playwright, clique/tecla reais) | tem que fechar `BANCADA OK`; a contagem só CRESCE (402 no D-127) |
| `npm run executar` | replay: a lista de passos refaz o objeto idêntico | `replay PROVADO` |
| `npm run auditar` | lint de arte nas peças do jogo | **sai com exit 1 por 3 achados PRÉ-EXISTENTES** (arco/arvore-cartoon/vegetacao-cartoon). Baseline, não regressão — o sinal é os nomes/mensagens mudarem, não o exit code |
| `npm run porteiro` | as 7 peças do jogo abrem, sem frame degenerado nem erro de página | `7/7` |
| `npm run jogar` | o jogo real roda | `ready=true`, `erros=0` (o fps varia MUITO com carga da máquina — 11 a 37 já apareceram, todos válidos) |
| `git diff` das jóias | `render.js`/`som.js`/`motor/oficina.js` intocados quando a mudança é de interface | **vazio** |

**Cuidado ao rodar gate em background com `&&`/`;`/`| tail`:** o código de saída que a notificação mostra é o do WRAPPER, não o do comando. Leia o CONTEÚDO do log (`grep FALHA`/`BANCADA FALHOU`/`✗`) — o `auditar`, por exemplo, sempre aparece como "exit 0" no wrapper embora ele próprio saia 1.

## Quem faz o trabalho: solo por padrão hoje

**A prática das últimas ~10 rodadas (D-118→D-127) é SOLO, sem subagentes** — não por princípio, por economia: as rodadas do playground são de um arquivo ou dois, e a janela do orquestrador dá conta. A virada tem data: no P4 (D-117) o subagente revisor **morreu na cota** com a revisão incompleta, e a lição registrada foi que **quando o revisor morre a revisão NÃO pode ser dispensada** — o papel passou pra mim, e ficou.

**Delegar ainda vale quando:** o trabalho é grande o bastante pra estourar a janela (transplante de cena, migração ampla), são frentes de fato PARALELAS e independentes, ou você quer um segundo par de olhos genuinamente cego ao seu raciocínio num ponto de risco alto. Nesses casos, o molde abaixo continua valendo.

## Molde do brief (quando delegar)

O coder faz o trabalho pesado na janela DELE; o que volta é um resumo, e sua janela fica limpa. **O briefing é onde você agrega valor** — o gargalo é a informação, não as mãos (D-57). Molde do brief:

- **Contexto**: o que já existe + apontar a spec autoritativa (seções do doc, por número de linha).
- **Objetivo (e SÓ ele)**: o escopo fechado.
- **Restrições**: só estes arquivos; NÃO tocar em X/Y (se achar que precisa, PARE e reporte); provar por MEDIÇÃO, não no olho.
- **Git**: branch `wip/...`, commit, NÃO dar push.
- **Verificação**: os NÚMEROS reais que ele tem que produzir (bancada, gates) ANTES de reportar.
- **Relatório**: curto, com números + hash do commit no branch + surpresas.

Depois que ele volta: **reproduza a verificação você mesmo** (não confie no relatório), leia o código-chave, olhe os screenshots com seu olho.

## A revisão adversarial — POR RISCO, e o papel não é dispensável

O que muda com o solo é **quem** faz, não **se** faz. Em trabalho de formato salvo ela é obrigatória (regra 4 do `docs/historico/playground.md`); rodando solo, é um passe DELIBERADO no próprio diff, com a cabeça de quem quer quebrar — não a releitura satisfeita de quem acabou de escrever.

- **Dispense** quando o núcleo de risco é provado por medição OBJETIVA e é interface (ex.: migração byte-idêntica; câmera a 0.00px). Um segundo passe não acha o que uma prova byte-idêntica já fecha.
- **Rode** quando é FUNDAÇÃO, encosta no FORMATO SALVO (irreversível), ou tem conta de julgamento. É onde mora o bug: o passe adversarial pegou a normal invertida do cilindro (Oficina passo 1), a roda no arrasto (passo 4), o Ctrl+Z no arrasto (passo 5), o cusp do `loft` e o não-finito de TODA op (P4/D-117), a face coplanar cega ao manifold (P3/D-116).
- **Rode DEPOIS de estar verde, não em vez de.** No D-127 tudo passava — 402 asserções — e o passe no diff achou uma dica de painel que passou a mentir (mandava "escolha uma cor" no espaço de onde a cor saiu). Gate nenhum pega isso: é texto, não comportamento.
- **Duas perguntas que rendem mais que reler:** (1) *o que ficou para trás?* — ao mover algo de lugar, quem apontava pra ele de onde ele morava? (2) *o que meu próprio teste assume?* — no P9a o bug estava no TESTE, não na feature (o soltar do mouse gravava um `moveV` fantasma e derrubava 3 asserções em cadeia).
- Achou defeito → **conserte antes da main** + um teste de regressão que trava aquilo pra sempre.

## Prova por medição, não pelo olho

O olho erra em normal, luz, alinhamento e geometria (D-65); e a IA **não escuta**. Onde der, prove com número: `cmp` byte-a-byte (render sem regressão), forma canônica bit-a-bit (replay/determinismo), projeção pelo próprio motor comparada ao esperado (posição na tela). **Pro SOM (o "ouvido", D-102):** `cmp` de amostra via OfflineAudioContext (determinismo), o ESPECTROGRAMA (STFT → imagem tempo×freq que dá pra Read) e os DESCRITORES (tom/brilho-centroide/envelope/duração) do `motor/somanalise.js` (bancadas `analisar`/`somtela`), e o A/B contra o som REAL do jogo (bancada `somab`, D-105). "Parece bom" (ou "achei que soou bom") não é prova; o número é.

## Registre a decisão

Toda decisão importante entra em `docs/historico/DECISIONS.md`. **Confira o formato REAL antes de escrever** (o arquivo tem duas eras e é fácil errar de zona): as decisões antigas (D-01…D-54) são linhas curtas de índice com o detalhe no `DECISIONS-ARCHIVE.md`, e existe um header `## Decisões ativas — em detalhe`; mas as recentes (D-113→) **não usam nenhum dos dois** — cada uma é **UM bullet longo e narrativo**, com o porquê inteiro dentro, inserido em ordem reverso-cronológica (a mais nova primeiro) na zona que PRECEDE aquele header. Uma entrada só, não índice+detalhe. Antes de inserir, `grep -c "D-<nº>"` pra confirmar que o número está livre.

O que a entrada tem que carregar: o **porquê** (o que evita re-debater), as decisões de formato salvo fixadas, os **achados reais** com a causa medida (não "consertei um bug"), e os NÚMEROS da prova. Marque também o checklist do roteiro relevante (`[x]`). Decisão que reserva arquitetura ou deixa nuance aberta: escreva a nuance, pra não apodrecer.

## Transferir feature pra o passo certo (princípio do ideador, vale sempre)

Se uma feature do passo atual depende de um pré-requisito que só chega num passo POSTERIOR, **transfira-a pra lá** em vez de antecipar a dependência. Anote a transferência nos DOIS passos do roteiro (origem e destino) + no D-nº. Como o FORMATO SALVO fica estável (a operação gravada não muda), a migração posterior não descarta nada. Ex. (D-88): pintar face rodou pelo swatch no passo 9; a textura pintável / projeção em caixa foi pro passo 11, que é quem de fato precisa dela (o pincel macio) — e projeção em caixa ainda traria um furo (topo/fundo compartilham textura) se viesse cedo.
