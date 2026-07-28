# Protocolo dos Portais — R6

> Como o Salão de Portais decide o que existe, como um mundo novo entra na rede, e o que "atravessar" quer dizer hoje versus o que vai querer dizer quando a federação (D-17) estiver completa. Este documento é sobre o **protocolo** (dados + regras); a experiência do jogador está descrita em `docs/GDD.md`; a decisão de produto desta fatia está registrada em `docs/DECISIONS.md`.

## O registro: `worlds/registry.json`

Um array de entradas. Cada entrada é um mundo que o Salão de Portais conhece:

```json
{
  "id": "atrio",
  "name": "O Átrio",
  "worldUrl": "worlds/atrio.json",
  "clientHint": "nos-world-v1",
  "status": "aberto",
  "descriptionPtBR": "Uma antecâmara de pedra e água — ..."
}
```

| Campo | Obrigatório | Significado |
|---|---|---|
| `id` | sim | Identificador estável, ascii minúsculo com hífen (`coracao`, `atrio`) — nunca acentuado, é chave técnica, não texto de jogador. Único no array. |
| `name` | sim | Nome exibido no Salão de Portais (pt-BR, acentuado — `"O Coração"`, `"O Átrio"`). |
| `worldUrl` | só quando `status: "aberto"` | Onde buscar o `world.json` deste mundo: uma **URL absoluta** (`https://raw.githubusercontent.com/.../world/algum.json`, para um repositório federado de verdade) **ou um caminho relativo à raiz do site** (`world/heart.json`, `worlds/atrio.json`, para um mundo que vive neste mesmo repositório). Ausente para uma entrada `em_breve` que ainda não tem nada publicado. |
| `clientHint` | não | Nota curta e informativa de compatibilidade — ver seção própria abaixo. Não trava nada nesta fatia; é para humanos e para uma automação futura. |
| `status` | sim | `"aberto"` (tem `worldUrl`, pode ser atravessado) ou `"em_breve"` (mostrado no Salão, mas o botão "atravessar" fica desabilitado). |
| `descriptionPtBR` | sim | Uma ou duas frases, tom do `docs/LORE.md` (melancólico-esperançoso, curto, concreto). |

O primeiro registro (`R6 fase 1`) tem 3 entradas: **O Coração** (auto-referência — o próprio mundo-origem, `worldUrl` relativo a `world/heart.json`), **O Átrio** (mundo de teste estático, `worlds/atrio.json`, ver seção própria) e um placeholder `"???"` com `status: "em_breve"` — para o Salão já nascer mostrando que ele **cresce** (mais mundos chegam por PR), não que ele é uma lista fechada de 2 itens.

### `clientHint`

Uma string curta e opcional. Hoje só existe um valor em uso, `"nos-world-v1"`: *"este mundo obedece a `engine/schema/world.schema.json` tal como este cliente entende hoje — mesmas 5 biomas, mesmos tipos de evento, sem sprite ou mecânica própria. O `renderer.ts` de sempre desenha tudo, sem nenhum código extra."*

Este campo é **informativo nesta fatia** — o cliente não trava em cima dele. A validação real, para qualquer mundo que o jogador realmente tente atravessar, é a checagem de plausibilidade (`site/src/live.ts`'s `isPlausibleWorld`, reaproveitada por `site/src/portals.ts` — ver "O que 'visitar' significa hoje" abaixo). `clientHint` existe para o dia em que um mundo federado precisar de outro cliente ou de mecânica própria (D-17: *"cada repositório de criador = um planeta"*) e quiser se anunciar como tal antes de alguém clicar em "atravessar" — nesse dia, um novo valor aqui (`"nos-world-v2"`, `"custom-renderer"`, o que fizer sentido) é o lugar natural para declarar isso, e o Salão de Portais pode decidir mostrar um aviso ou desabilitar a travessia com base nele. Não vale a pena construir esse branching agora, para um único valor em uso.

## Como um mundo federado entra na rede

A visão de longo prazo (D-17): *"cada repositório de criador = um planeta (tick e Pages próprios); portais são um protocolo (registro de endereços + passaporte de avatar)."* Nesta fatia, o "registro de endereços" já é real — é este arquivo. O caminho para um criador de fora entrar:

1. Criar (ou usar) um repositório GitHub próprio, público.
2. Publicar um ou mais `world/*.json` que validem contra o **mesmo** `engine/schema/world.schema.json` deste repositório (importável, é código aberto) — rode `assertValidWorld` (ou um script equivalente ao `scripts/validate-worlds.ts` deste repo) antes de publicar.
3. Abrir um Pull Request no `brigsd/nos` adicionando uma entrada em `worlds/registry.json` com `worldUrl` apontando para a **raw URL** do `world.json` publicado (ex.: `https://raw.githubusercontent.com/algumdev/meu-mundo/main/world/meu-mundo.json`) e `status: "aberto"`.
4. O coder revisa (o mesmo fluxo de qualquer PR, `docs/CLAUDE.md`) — confirma que o JSON valida, que a descrição está em pt-BR e no tom do `docs/LORE.md`, e mescla.

Nenhuma mudança de engine é necessária para isso — é exatamente por isso que a Fase 1 restringe a fatia a "visitar": o protocolo de descoberta (o registro) e o protocolo de estado (o schema) já bastam para um mundo aparecer no Salão e ser desenhado na tela. O que falta para federação de verdade está na próxima seção.

## O que "visitar" significa hoje (R6 fase 1)

Esta fatia implementa **travessia sem sair do site**: o jogador clica "atravessar", o mesmo cliente (a mesma janela, o mesmo `index.html`) busca o `world.json` do destino, valida sua forma (`isPlausibleWorld`, o mesmo guarda-chuva que já protege o polling ao vivo em `site/src/live.ts` — não é a validação completa de schema do `engine/validate.ts`, que é Node-only e não entra no bundle do cliente por design, ver o comentário daquela função) e desenha esse mundo no lugar do anterior, reaproveitando o mesmo caminho que a Fluidez B (R5) já usa para atualizar a tela sem recarregar a página.

Enquanto de visita:
- **É seu Registro que fica.** Você olha o mundo, anda pela tela (a Intenção local continua livre — D-12/D-22), mas seu Registro (o que o Pulso gravou) nunca sai d'O Coração. Um banner permanente lembra disso e oferece "voltar ao Coração".
- **É só leitura.** Os links/botões de ação ("agir daqui", `/trocar`, `/conversar`, `/sintetizar`) somem enquanto você visita — eles sempre montam um comando contra o Coração (`brigsd/nos`), então mostrá-los sobre o mapa de outro mundo seria, na melhor das hipóteses, confuso, e na pior, um comando que erra o alvo. A informação (quem mora lá, o que cada oficina fabricaria) continua visível — você pode olhar, só não agir de lá.
- **O pulso ao vivo d'O Coração pausa.** Enquanto você visita, o polling da Camada B/C (R5) para — não faria sentido continuar batendo na API por um mundo que não está na tela. Ao voltar, O Coração é buscado de novo (fresco, não uma cópia em cache) e o polling recomeça do zero.
- **Não é federação.** Não existe ainda `outbox.json`, não existe check-in/check-out, seu avatar não "existe" no mundo visitado de nenhuma forma que o mundo visitado saiba — você é um fantasma passando por uma janela. Ver a seção seguinte.

## O que falta para a federação completa (D-21) — não implementado aqui

O design de longo prazo já está registrado em `docs/DECISIONS.md` (D-21): *"ledger central + leitura mútua — saldo de ₱ vive só no Coração (`ledger/`); mundos federados registram eventos num `outbox.json` público que o tick do hub lê a cada batida (federação pull-based via raw URLs — sem tokens nem webhooks entre repos). Avatar presente em 1 mundo por vez (check-in/check-out sequencial no hub ⇒ gasto duplo impossível)."*

Nada disso existe ainda. Em concreto, ainda faltam:

- **Check-in/check-out real.** Hoje "visitar" não registra em lugar nenhum que você foi — não há trava de "avatar em 1 mundo por vez" porque não há avatar remoto nenhum, só uma janela. A federação de verdade precisa de um comando (`/atravessar <mundo>`?) que o tick d'O Coração processe, gravando o check-out no Coração antes de qualquer ação valer no mundo remoto.
- **Agir em outro mundo.** Um mundo visitado ser só leitura é a decisão desta fatia, não uma limitação técnica seguinte — a ação exigiria que o mundo remoto tivesse seu próprio tick processando comandos, e um jeito de essas ações voltarem a ser conhecidas pelo hub (o `outbox.json` do D-21).
- **Cota de emissão de ₱ por mundo** (D-21: *"conforme nível de confiança em `federation.json`"*) — esse arquivo não existe ainda; é o próximo passo natural quando um mundo federado de verdade quiser emitir Pulso.
- **CI validando PRs de mundos federados automaticamente** — `npm run validate-worlds` (este PR) já faz a validação local; falta decidir se/como rodar isso (ou uma checagem raw-URL-reachable) no `ci.yml` para PRs que só tocam `worlds/registry.json`. Deliberadamente fora do escopo desta fatia (`workflows/` não foi tocado).

## Nota técnica: por que `worlds/` e não dentro de `world/`

`world/heart.json` (singular) é o estado **oficial** d'O Coração — o único arquivo que o tick escreve, 1 commit por batida (`docs/ARCHITECTURE.md`). `worlds/` (plural, novo) é o **hall**: o registro do protocolo e os mundos estáticos de teste/demonstração que vivem neste mesmo repositório. São conceitos diferentes de propósito (um é o coração pulsando; o outro é o átrio de entrada da rede), por isso pastas diferentes — e por isso a régua "não tocar `world/heart.json`" desta tarefa nunca colide com criar `worlds/registry.json` ou `worlds/atrio.json`.
