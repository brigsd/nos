---
name: nos-fluxo
description: O fluxo pra construir e entregar QUALQUER feature no repo NÓS — orquestrar subagentes (coder + revisor adversarial por risco), verificar por medição, o cuidado com git (rebase sobre o tick, ff-merge de branch wip, render.js é jóia), rodar os gates e registrar a decisão. Use SEMPRE que for construir uma feature, orquestrar coder/revisor, mergear na main ou registrar uma decisão no NÓS.
---

# NÓS — como construir, verificar e entregar

Convenções fixas: todo trabalho vai pra **`main`** direto; respostas e docs em **PT-BR, plano e pragmático** (sem gíria); o ID do modelo NUNCA em commit/PR/artefato.

## Git

- **Antes de TODO push**: `git fetch origin main && git rebase origin/main` (se outro push tiver entrado, o seu é rejeitado sem isso). O tick 2D que commitava de hora em hora foi DESLIGADO (D-110/D-111) — a main só muda por trabalho seu ou do ideador.
- Trabalho de coder vai numa branch `wip/...` (a partir de `origin/main`); depois `git checkout main && git merge --ff-only wip/... && git push -u origin main`. Apague a branch e limpe o `scratchpad/` no fim.
- **DUAS jóias — `render.js` (render do jogo) e `motor/som.js` (áudio do jogo).** Mudança em qualquer uma é **opt-in e no-op quando desligada** (somar zero, guardar com `?? padrão`, passe/ramo separado), e verificada BYTE-idêntica com o recurso off: `cmp` de PIXEL (`porteiro`/frozen-clock nas peças do jogo) pro render, `cmp` de AMOSTRA (OfflineAudioContext) pro som. Se precisar mudar uma linha EXISTENTE de uma jóia, PARE e reporte. Nunca uma mudança que altere a saída do jogo sem intenção. (O `som.js` virou jóia no roteiro de som — D-99→D-105; a ponte `tocarEvento` do S5b é o único toque, aditivo.)

## Gates (rode antes de todo commit)

`npm run mapa:check` (todo arquivo rastreado precisa de um comentário de cabeçalho — **arquivo novo sem cabeçalho quebra o gate**; após criar arquivos, `git add -A` → `npm run mapa` → re-stage `docs/MAPA.md`), `npm run docs:toc:check`, `npm run typecheck`, `npm run test`.

## Subagentes — coder + revisor adversarial

O coder faz o trabalho pesado na janela DELE; o que volta é um resumo, e sua janela fica limpa. **O briefing é onde você agrega valor** — o gargalo é a informação, não as mãos (D-57). Molde do brief:

- **Contexto**: o que já existe + apontar a spec autoritativa (seções do doc, por número de linha).
- **Objetivo (e SÓ ele)**: o escopo fechado.
- **Restrições**: só estes arquivos; NÃO tocar em X/Y (se achar que precisa, PARE e reporte); provar por MEDIÇÃO, não no olho.
- **Git**: branch `wip/...`, commit, NÃO dar push.
- **Verificação**: os NÚMEROS reais que ele tem que produzir (bancada, gates) ANTES de reportar.
- **Relatório**: curto, com números + hash do commit no branch + surpresas.

Depois que ele volta: **reproduza a verificação você mesmo** (não confie no relatório), leia o código-chave, olhe os screenshots com seu olho.

## O revisor adversarial — POR RISCO, não por ritual

- **Dispense** quando o núcleo de risco é provado por medição OBJETIVA e é interface (ex.: migração byte-idêntica; câmera a 0.00px). Um segundo passe não acha o que uma prova byte-idêntica já fecha.
- **Rode** quando é FUNDAÇÃO, encosta no FORMATO SALVO (irreversível), ou tem conta de julgamento. É onde mora o bug: o passe adversarial pegou a normal invertida do cilindro (Oficina passo 1), a roda no arrasto (passo 4) e o Ctrl+Z no arrasto (passo 5) — todos que a revisão amistosa (coder + você) tinha passado. Dê a ele um brief pra TENTAR QUEBRAR sob estresse, não pra confirmar.
- Achou defeito → **conserte antes da main** + um teste de regressão que trava aquilo pra sempre.

## Prova por medição, não pelo olho

O olho erra em normal, luz, alinhamento e geometria (D-65); e a IA **não escuta**. Onde der, prove com número: `cmp` byte-a-byte (render sem regressão), forma canônica bit-a-bit (replay/determinismo), projeção pelo próprio motor comparada ao esperado (posição na tela). **Pro SOM (o "ouvido", D-102):** `cmp` de amostra via OfflineAudioContext (determinismo), o ESPECTROGRAMA (STFT → imagem tempo×freq que dá pra Read) e os DESCRITORES (tom/brilho-centroide/envelope/duração) do `motor/somanalise.js` (bancadas `analisar`/`somtela`), e o A/B contra o som REAL do jogo (bancada `somab`, D-105). "Parece bom" (ou "achei que soou bom") não é prova; o número é.

## Registre a decisão

Toda decisão importante entra em `docs/DECISIONS.md`: uma linha no índice (`D-nº · data · resumo`) + uma entrada de detalhe com o PORQUÊ (o que evita re-debater). Marque também o checklist do roteiro relevante (`[x]`). Decisão que reserva arquitetura ou deixa nuance aberta: escreva a nuance, pra não apodrecer.

## Transferir feature pra o passo certo (princípio do ideador, vale sempre)

Se uma feature do passo atual depende de um pré-requisito que só chega num passo POSTERIOR, **transfira-a pra lá** em vez de antecipar a dependência. Anote a transferência nos DOIS passos do roteiro (origem e destino) + no D-nº. Como o FORMATO SALVO fica estável (a operação gravada não muda), a migração posterior não descarta nada. Ex. (D-88): pintar face rodou pelo swatch no passo 9; a textura pintável / projeção em caixa foi pro passo 11, que é quem de fato precisa dela (o pincel macio) — e projeção em caixa ainda traria um furo (topo/fundo compartilham textura) se viesse cedo.
