# NÓS

## Jogar

Três janelas — escolha a sua:

- ▶ **[Clareira](https://brigsd.github.io/nos/)** — o mundo visto de cima (mapa 2D), com os painéis (Mural, Comércio, Nativos, Portais).
- ▶ **[Miragem](https://brigsd.github.io/nos/fps/)** — primeira pessoa, raycaster. Estável.
- ▶ **[Atelier](https://brigsd.github.io/nos/fps/v3/jogo.html)** — primeira pessoa em WebGL, com a **[Oficina](https://brigsd.github.io/nos/fps/v3/oficina.html)** (criar objeto e som — abre pelo menu do jogo, tecla ESC, ou direto no link). Em construção ativa.

Todos rodam direto no navegador do **PC ou do celular**, sem instalar nada — mesmo mundo, mesmo Registro. 🌍

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

- 💓 **Batidas (Ticks):** `240`
- 👥 **Jogadores Ativos:** `1`
<!-- stats-end -->

## Portais e federação

O NÓS é um metaverso: O Coração é o mundo-origem, não o único. O protocolo é
um arquivo público — [`worlds/registry.json`](worlds/registry.json) — onde
cada entrada é um mundo com `id`, `name`, `worldUrl` e `status`:

- **Hoje**: o painel **Portais** do [mapa 2D](https://brigsd.github.io/nos/)
  atravessa de verdade para **O Átrio** (`worlds/atrio.json`, um mundo local
  deste repositório) — visita só-leitura: você vê e explora, seu avatar não
  muda de casa. No cliente em primeira pessoa, o **Portal do Átrio** fica no
  fim do calçamento d'A Clareira; chegar perto dele acende o painel **Mundos
  Conectados**, que lista os mundos do registro. A travessia pelo próprio
  portal em primeira pessoa é a fase 3.
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

## Licença

Este projeto é [MIT](LICENSE) — use, copie e modifique à vontade. Se ele te ajudar em algo público, um crédito ao NÓS é bem-vindo.
