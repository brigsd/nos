# Game Design Document — NÓS

## Loop central

explorar → agir (coletar/construir/interagir) → o tick confirma → o mundo muda → voltar a explorar.

Sensação instantânea no cliente (andar, olhar, abrir painéis); consequência oficial no tick.

## O tick (o Pulso)

- **Híbrido (D-11):** batida do mundo por cron — **a cada 1 hora** (natureza, NPCs, safras) — MAIS processamento de comandos disparado por evento de issue (confirmação em ~30–60s). `concurrency` aglutina comandos simultâneos num único lote.
- Lê todos os comandos pendentes (issues/comentários), valida, aplica em lote, avança o tempo do mundo (clima, safras, NPCs), grava `world/*.json` e faz **1 commit**.
- Ordem de resolução determinística: por timestamp do comando; empates por número da issue.
- Limite de justiça: **N ações por jogador por tick** (v1: 3).

## Jogador (o Nó)

- Cadastro: primeiro comando cria o avatar automaticamente (login do GitHub = identidade).
- Atributos v1: posição, inventário, energia. (v2: vida, habilidades, reputação.)
- Movimento: no cliente é livre e fluido (local); a posição oficial é a do último comando confirmado.

## O Coração (primeiro mundo)

- Mapa procedural 64×64 tiles (16×16 px): campina central com o **Núcleo pulsante**, floresta, rio, ruínas.
- O Núcleo bate a cada tick — visível no jogo (animação) e no README (contador de batidas).
- Recursos v1: madeira, pedra, fragmentos de pulso (moeda).

## Comandos v1 (via issue/comentário)

| Comando | Efeito |
|---|---|
| `/entrar` | cria o avatar no Coração |
| `/mover x y` | define posição oficial |
| `/coletar` | coleta recurso do tile atual |
| `/dizer texto` | mensagem no mural do mundo |

## Comandos v2 (via issue/comentário)

| Comando | Efeito |
|---|---|
| `/conversar nativo` | puxa conversa com um Nativo a até 3 tiles (0 de energia); resposta roteirizada e determinística |

## Combate (v2) — autoritativo por turnos

Estilo JRPG: jogador submete intenções (`/atacar goblin ruinas`), o tick rola a batalha com os dados oficiais (stats + RNG com seed do tick), o cliente exibe o resultado como replay animado. À prova de trapaça por construção. PvP assíncrono (ataca-se o estado, não a pessoa), estilo Clash of Clans.

## Economia (v2)

Moeda: **Pulso (₱)**. Fontes: coleta, quests, comércio com NPCs. Drenos: construção, itens, viagens de portal. O tick é o banco central; inflação monitorada por relatório automático. **O Pulso jamais terá conversão para dinheiro real, em nenhuma direção (D-20)** — seu valor é de jogo e social (cosméticos, governança, memória na Crônica).

## NPCs

- v1: nenhum (mundo puro).
- v2: **Nativos** com árvores de comportamento procedurais + falas escritas pelo lore-writer (sem LLM em runtime).
- v2.5: decisões e falas enriquecidas por IA via **GitHub Models** (D-15) — inferência gratuita no Actions com o token nativo; procedural permanece como fallback.

## Arte

- Pixel art **16×16**, paleta **Resurrect 64** (CC0).
- Base de tiles/objetos: packs CC0 (Kenney e afins) adaptados à paleta; sprites únicos (Núcleo, Nativos) feitos pelo pixel-artist.
- Todo asset externo registrado em `assets/CREDITS.md`.

## Cliente (Pages)

- Canvas 2D, TypeScript puro, mobile-first: toque para mover, d-pad virtual opcional, painéis deslizantes.
- Lê `world/*.json` publicado com o site; botão de ação monta a issue pré-preenchida.
- **UI otimista (D-12):** ação vira "fantasma pendente" na hora e reconcilia na confirmação; posições de terceiros interpoladas entre batidas.
- **v2 — login GitHub (D-13):** OAuth device flow direto do site estático; comandos criados via API sem sair do jogo.
- **Notificações (D-14):** resposta do tick na issue do jogador = push gratuito pelo app oficial do GitHub.
- PWA na v3 (ícone na tela inicial, tela cheia).
