# NÓS

> O contrário de Jogador Nº 1.

## ▶ [JOGAR — abrir O Coração](https://brigsd.github.io/nos/fps/)

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

- 💓 **Batidas (Ticks):** `113`
- 👥 **Jogadores Ativos:** `1`
<!-- stats-end -->

## Como jogar

**▶ [Abrir O Coração](https://brigsd.github.io/nos/fps/)** — PC ou celular, sem instalar nada. Primeira pessoa: **WASD** anda, **clique** captura o mouse para mirar (**ESC** solta e abre o menu), **←→**/arrastar também olham, **M** cicla o mapa (minimapa → mapa grande com setores), **I** liga as tags de identificação, **G** alterna a iluminação global, **V** (ou o botão 🔊) liga o som. Siga o carreiro de terra até **A Clareira**, a cidade-oficina: quatro oficinas de telhado de cobre oxidado ao redor de um chafariz de três níveis, com o Portal do Átrio ao fundo — a água do chafariz murmura conforme você chega perto, sobre uma cama suave de vento. O [mapa 2D](https://brigsd.github.io/nos/) é a visão de cima do mesmo mundo, com os painéis (Mural, Comércio, Nativos, Portais).

- **Explorar é instantâneo:** no 2D, arraste para andar pelo mapa, pinça ou roda do mouse para dar zoom.
- **Agir no mundo é por comando** (via issue): `/entrar` cria seu avatar; depois `/mover`, `/coletar`, `/dizer`, `/trocar` e `/fabricar` (as quatro máquinas vivem n'A Clareira). O tick processa em segundos e responde na sua própria issue.
- Os **Nativos** (gota, raiz, cinza) vivem no mundo e agem a cada batida, mesmo sem ninguém online.
- Os **Habitantes** d'A Clareira (brasa, broa, quilha) são **mentes que vivem em outro repositório** ([`nos-mentes`](https://github.com/brigsd/nos-mentes)): pensam com IA a cada hora e falam no mundo pelo mesmo canal de comandos que você — NPCs que são repositórios, com memória própria commitada.

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
