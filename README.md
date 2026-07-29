# NÓS

## Jogar

- ▶ **[Atelier](https://brigsd.github.io/nos/fps/v3/jogo.html)** — o cliente em primeira pessoa (WebGL) + a **[Oficina](https://brigsd.github.io/nos/fps/v3/oficina.html)** (criar objeto e som — abre pelo menu do jogo, tecla ESC, ou direto no link). A frente viva, em construção.

Roda direto no navegador do **PC ou do celular**, sem instalar nada. 🌍

> O mundo 2D que veio antes é um trabalho à parte, congelado, e mora em
> **[`brigsd/nos-mentes`](https://github.com/brigsd/nos-mentes)**.

---

**NÓS** é um metaverso que vive **inteiramente dentro do GitHub** — sem servidor próprio: o código é o jogo e o Pages é a janela. A frente viva é o **Atelier**: um cliente em primeira pessoa (WebGL) com a **Oficina**, onde se cria cada objeto e cada som direto no navegador. A peça criada **é** a lista de passos que a reconstrói — nada é opaco, tudo é editável e refeito passo a passo.

## História — O Coração

O primeiro mundo do NÓS foi **O Coração**: um metaverso 2D em pixel art que rodava sozinho dentro do GitHub —

- 🗄️ o repositório era o banco de dados (o mundo feito de commits),
- ❤️ o GitHub Actions era o coração (a cada batida/tick o tempo passava, com ou sem jogadores),
- 🖥️ o GitHub Pages era a janela, e
- ✉️ as issues eram as cartas (os jogadores agiam sobre o mundo por elas).

Ele pulsou por ~250 batidas e hoje está **congelado** no [`nos-mentes`](https://github.com/brigsd/nos-mentes), ao lado das mentes-IA d'A Clareira — as demos jogáveis (**Clareira** 2D + **Miragem** raycaster) e também o código-fonte daquela era, nas branches `era-2d/*`. A ideia de **federação** — cada criador com seu repo, tick e Pages próprios, entrando na rede por um pull request — fica guardada ali como visão.

## Para quem quer mexer no projeto

- [`docs/oficina.md`](docs/oficina.md) — o roteiro do Atelier: a Oficina de objeto + som, passo a passo.
- [`CLAUDE.md`](CLAUDE.md) — as regras de trabalho: as duas jóias (`render.js` / `motor/som.js`), as três camadas e a prova por medição.
- [`docs/historico/DECISIONS.md`](docs/historico/DECISIONS.md) — o registro de toda decisão do projeto.

## Como contribuir

O NÓS é coletivo por natureza. A frente aberta é o Atelier; issues com ideias são bem-vindas.

## Licença

Este projeto é [MIT](LICENSE) — use, copie e modifique à vontade. Se ele te ajudar em algo público, um crédito ao NÓS é bem-vindo.
