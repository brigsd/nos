# NÓS

> O contrário de Jogador Nº 1.

## ▶ JOGAR — abrir O Coração (esta branch: `claude/tree3d-leaves`)

> Esta branch ainda não foi mesclada na `main`, e o GitHub Pages só publica a
> partir dela — o link de produção (`brigsd.github.io/nos/fps/`) por enquanto
> **não** tem as árvores 3D daqui. Pra jogar com elas, rode local:
>
> ```bash
> git clone https://github.com/brigsd/nos.git && cd nos
> git checkout claude/tree3d-leaves
> cd site && npm install && npm run dev
> ```
>
> Abra a URL que o Vite imprimir (ex.: `http://localhost:5173/`) e vá em
> `/fps/`. Depois que este branch for mesclado, o link de produção volta a
> valer normalmente.

Roda no navegador do **PC ou do celular**, em **primeira pessoa**. O mundo está vivo agora. 🌍
(Prefere ver de cima? O [mapa 2D](https://brigsd.github.io/nos/) continua no ar — mesmo mundo, mesmo Registro.)

---

**NÓS** é um metaverso 2D em pixel art que vive **inteiramente dentro do GitHub**:

- 🗄️ O repositório é o banco de dados — o mundo é feito de commits.
- ❤️ O GitHub Actions é o coração — a cada batida (tick), o tempo passa, com ou sem jogadores online.
- 🖥️ O GitHub Pages é a janela — o cliente visual do jogo, no navegador do PC ou do celular.
- ✉️ As issues são as cartas — é por elas que os jogadores agem sobre o mundo.

O primeiro mundo se chama **O Coração**. Ele pulsa. Mesmo agora.

## Status

<!-- stats-start -->
### Status do Mundo

- 💓 **Batidas (Ticks):** `70`
- 👥 **Jogadores Ativos:** `1`
<!-- stats-end -->

## Como jogar

**▶ Nesta branch, rode local** (veja o comando acima) — o link de produção só reflete a `main`. Primeira pessoa: **WASD** anda, **clique** captura o mouse para mirar (**ESC** solta e abre o menu), **←→**/arrastar também olham, **M** cicla o mapa (minimapa → mapa grande com setores), **I** liga as tags de identificação. Siga o carreiro de terra até **A Clareira**, a cidade-oficina. O [mapa 2D](https://brigsd.github.io/nos/) é a visão de cima do mesmo mundo, com os painéis (Mural, Comércio, Nativos, Portais).

- **Explorar é instantâneo:** no 2D, arraste para andar pelo mapa, pinça ou roda do mouse para dar zoom.
- **Agir no mundo é por comando** (via issue): `/entrar` cria seu avatar; depois `/mover`, `/coletar`, `/dizer`, `/trocar` e `/fabricar` (as quatro máquinas vivem n'A Clareira). O tick processa em segundos e responde na sua própria issue.
- Os **Nativos** (gota, raiz, cinza) vivem no mundo e agem a cada batida, mesmo sem ninguém online.

## Portais e federação

O NÓS é um metaverso: O Coração é o mundo-origem, não o único. O protocolo é
um arquivo público — [`worlds/registry.json`](worlds/registry.json) — onde
cada entrada é um mundo com `id`, `name`, `worldUrl` e `status`:

- **Hoje**: o painel **Portais** do [mapa 2D](https://brigsd.github.io/nos/)
  atravessa de verdade para **O Átrio** (`worlds/atrio.json`, um mundo local
  deste repositório) — visita só-leitura: você vê e explora, seu avatar não
  muda de casa. No cliente em primeira pessoa, os arcos do Hall de Portais
  d'A Clareira marcam o lugar (o arco aceso é O Átrio); a travessia por eles
  é a fase 3.
- **Federação (v3)**: `worldUrl` também aceita uma **URL raw absoluta de
  OUTRO repositório** — cada criador hospeda seu mundo (repo próprio, tick
  próprio, Pages próprio) e entra na rede **abrindo um PR que adiciona a
  própria entrada ao registro**, sem tocar em mais nada. Regras, check-in de
  avatar e economia federada: [`docs/PORTALS_PROTOCOL.md`](docs/PORTALS_PROTOCOL.md).

## Para quem quer mexer no projeto

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — como o repo é o jogo (engine, tick, duas janelas).
- [`docs/COMUNICACAO.md`](docs/COMUNICACAO.md) — **IDs visíveis e setores**: aperte `I` no jogo e todo objeto mostra seu identificador (`arvore-38x12`); o mapa grande (`M`) divide a ilha em setores `A1`–`H8`. É o vocabulário para pedir mudanças exatas ("remove a arvore-38x12", "no setor C2…").
- [`docs/CIDADE.md`](docs/CIDADE.md) — A Clareira: a cidade-oficina e suas fases.

## Como contribuir

O NÓS é coletivo por natureza — na v3, qualquer pessoa poderá criar um mundo novo via pull request. Antes disso, issues com ideias são bem-vindas.
