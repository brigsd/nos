# A Bancada do Coder — ferramentas, limites e o método (D-35)

> Para o coder (Claude) de qualquer sessão futura — e para replicar em
> qualquer mundo novo. O ideador perguntou: *"você consegue descobrir suas
> próprias limitações sozinho?"* A resposta validada está aqui.

## O método: o diário de atrito

Introspecção ("quais são minhas limitações?") produz uma lista plausível e
**não confiável** — limitação que nunca bateu na realidade é invisível para
o próprio coder. O que funciona é empírico:

1. **Toda sessão registra os erros e atritos reais no `CONTINUITY.md`**
   (já é regra da casa — cada "Achado/Erro corrigido" é uma limitação provada).
2. **Periodicamente, o atrito vira ferramenta** — e a ferramenta cita o
   incidente que a justificou. Sem incidente, sem ferramenta: é assim que se
   evita construir infraestrutura especulativa que ninguém usa.

Validação: cada item da bancada abaixo aponta o atrito real que o gerou.
"Desenvolva algo que resolva suas limitações" é um pedido executável — desde
que a resposta saia deste diário, não de imaginação.

## Os olhos — auditoria visual sem sair do sandbox

*Atrito de origem: auditar A Clareira (16/07) exigiu montar servidor +
Playwright + pontos de câmera ad hoc no scratchpad, que morre com a sessão.*

```
npm run olhar                    # todos os pontos canônicos
npm run olhar -- forja portais   # só estes
npm run olhar -- 46.2,15.6,0.9   # um ?cam= avulso
npm run olhar -- largo-noite --tod=0.8   # hora do dia forçada
```

- Roda 100% local (mundo inline no build, server efêmero, Chromium do
  sandbox) — **zero rede externa**.
- Pontos canônicos em `tools/bancadas/pontos.json`. **Criou uma área
  nova? Adicione o ponto dela** — a auditoria de amanhã custa uma linha hoje.
- Saída em `tools/bancadas/out/` (gitignorada). O passo seguinte é
  sempre LER os PNGs — screenshot que ninguém olha é ruído.
- `?cam=x,y,a` (D-33) e `?tod=0..1` (0.3 dia · 0.55 entardecer · 0.8 noite)
  funcionam em produção também — servem ao ideador ("olha AQUI") e ao coder.
- Animações: eu vejo **quadros, não vídeo**. Auditar movimento = 2+ capturas
  espaçadas (`page.waitForTimeout` entre elas) e comparar.
- Tags de ID (tecla I), setores e mapa grande (M): `docs/COMUNICACAO.md`.

## Os ouvidos — auditoria de som sem escutar (D-40)

*Atrito de origem: o áudio (D-40) tem um buraco pior que o visual — no gráfico
eu ao menos LEIO o PNG; som eu não escuto de jeito nenhum. Confiar que "soa
bem" é chute. Então mede-se.*

```
npm run ouvir                    # chafariz (perto) vs spawn (longe)
npm run ouvir -- chafariz forja  # pontos nomeados do pontos.json
npm run ouvir -- 46.2,15.6       # um ?cam= avulso
```

- Playwright headless destrava o `AudioContext` com um gesto sintético, lê
  `window.__nosAudio()` (estado + ganhos de vento/água/master) **e o RMS real**
  do sinal num `AnalyserNode` ligado ao master.
- **Porteiro anti-regressão** (sai ≠0): o contexto acorda? a água **sobe por
  proximidade** (perto > longe)? tem sinal e **sem clip**? Barra o mundo mudo;
  o "soa bonito?" continua sendo do ideador — como a arte.
- 100% local (mesma tese do `olhar`): mundo inline, server efêmero, Chromium
  do sandbox. Chromium lançado com `--autoplay-policy=no-user-gesture-required`.

## Otimização — perfilar antes, medir depois (D-45→D-48)

*Atrito de origem: "640×360 engasga" (17/07) — três rodadas provaram o método.*

- **Nunca otimize sem perfil.** `window.__nosPerf()` acumula ms por fase
  (céu/chão/paredes/billboards/resto) + `maxMs`/`slow` (pior quadro, engasgos);
  a bancada `res-bench.mjs` lê tudo nos 4 presets, com CPU÷4 como proxy de
  celular e `CAM=` pra escolher o ponto (mata = pior caso de billboards).
- **Engasgo ≠ lento**: stutter intermitente é pico (GC, vista pesada) — meça o
  PIOR quadro, não a média. Alocação por quadro é veneno (arrays de rascunho
  reusados nos billboards).
- **Blocos RS**: conteúdo macio (céu, chão, vegetação, fumaça, pedra) renderiza
  na densidade do 320×180 em qualquer preset; nitidez fica em paredes/heróis/
  arquitetura. RS=1 no 320 = caminho antigo byte a byte.
- Alavanca grande restante (se precisar um dia): assar o chão estático num
  atlas — refactor grande, risco visual; só com dados na mão.

## Estruturas — prancheta e peças do motor

Fluxo completo na skill **`/estruturas`**: `npm run prancheta` (planta baixa
viva: colisões, alturas, planos), construir (`cityWall`/billboard `orient`+
`depth`/`addTrunk`), prancheta de novo, `olhar` em 3 ângulos. Fonte única:
`window.__nosMapa()`.

## O senso crítico [cpu] — medir o que o olho engana (D-60)

*Atrito de origem: o `hash2` do v3 espremia todo o ruído em [0,0.5) e o
screenshot me enganava ("deve ser o fog"); só um histograma em Node pegou.
O olho aprova o plausível; o número não mente.*

Uma peça v3 (`prototipos/fps/v3/pecas/*.js`) passa por dois portões antes de
eu confiar nela — e **todo julgamento cita ≥1 número**:

```
npm run auditar -- <peca>   # os 5 críticos [cpu] na malha+textura (exit≠0 em achado)
npm run porteiro -- <peca>  # gate de render: pageerror/__ready/frame degenerado
npm run bench               # mede se cada crítico AJUDA (F1 vs defeitos plantados)
```

- **`auditar`**: lint-de-malha (stride/tri/NaN/normal/degenerado), distancia-paleta
  (CIEDE2000 + allowlist da madeira D-54f), detector-de-seam, detector-de-banding,
  contador-de-pixels-orfaos. Rodam sobre o `construir()` da peça em **Node puro**
  (`bench/sandbox.mjs`, canvas-stub) — sem browser, determinístico.
- **`porteiro`**: renderiza de verdade (Playwright) e falha se a tela degenera.
- **`bench`**: a meta-ferramenta — peças reais × 18 defeitos plantados dão o F1
  de cada crítico (núcleo = veredito, adversarial = piso honesto). "Será que
  ajuda?" é número, não fé. Limites por ferramenta na skill `/auditar-peca`.
- Fluxo no loop: skill **`/auditar-peca`** entra antes de commitar peça nova.

## O alicerce jogável do v3 — câmera livre, som, tiers (D-61)

*Atrito de origem: o pedido de um preset de textura virou pedido de um menu
de pausa inteiro (som/gráficos/controles/idioma) — e o v3 não tinha jogador,
som, nem tiers de luz/sombra/partícula. Escolhido construir no v3, não no v2
(D-57: perguntei o escopo ANTES, o ideador confirmou o v3).*

```
npm run jogar                                   # ponto de vista padrão
npm run jogar -- --cam=-19,0,1.85,0             # câmera em x,z,yaw,pitch
npm run jogar -- --pausado --aba=graficos       # abre o menu numa aba
npm run jogar -- --ts=8 --sombra=0 --luz=2      # overrides de tier
```

- **`jogo.html`** (`prototipos/fps/v3/`) é o alicerce — ilha + árvores
  plantadas (placeholder, não o "plantar árvores" definitivo) + jogador
  andando + o menu completo. NÃO substitui `visor.html` (Oficina, peça
  isolada em órbita) — são dois cidadãos do mesmo motor.
- **`motor/render.js`** ganhou câmera LIVRE (`visor.setCam(pos,yaw,pitch)`,
  chamada num hook `antesDoQuadro(dt,T)` por quadro) ao lado da órbita, e
  3 tiers de motor de verdade (mudam custo real, não só aparência): sombra
  (desligada pula os draw calls / 1024 / 2048), luz (zera o termo direcional
  / atual / +rebote falso barato), partículas (contagem direta).
- **`motor/input.js`** (novo): WASD+pointer-lock (desktop) + joystick touch
  **portando FIEL** as 3 correções da v2 (D-47/48/49: dono vivo não é
  roubado, dono fantasma é destronado por toque novo, watchdog por quadro,
  rede touchend/cancel) — reinventar teria repetido os mesmos bugs.
- **`motor/som.js`** (novo): porta o D-40/41 (vento constante + água por
  proximidade) e sintetiza PASSOS (thump filtrado, jitter por passo) — dois
  volumes independentes, mudos em 0, tudo Web Audio (zero arquivo, D-30).
- **Textura por tier**: peças que querem respeitar o preset (Baixo/Médio/
  Alto = 32/64/128px) leem `ctx.TS` — a MESMA convenção que `casa-toras.js`
  já usava (`GT = 16*TS`), não um campo novo. Hoje só `arvore3d.js` respeita;
  `ilha-chao.js` fica de fora (limite honesto).
- **O QA achou 2 bugs reais** (não hipotéticos) antes do commit: o spawn
  nascia quase dentro de uma árvore (não cruzei a lista de plantio com o
  próprio spawn); os botões de canto (`voltar`/`✕`) perdiam a batalha de
  especificidade CSS pra `.painel > button` (1 classe+1 elemento vence 1
  classe só) e viravam uma barra larga sobreposta — corrigido subindo a
  especificidade (`.painel .cantoBtn`). Os dois só apareceram no screenshot
  real; "roda sem erro de JS" não teria pegado nenhum.

## Navegar no `nos-fps.html` (o arquivo grande)

*Atrito de origem: um edit às cegas na região do loop pendurou um `else` no
`if` errado (16/07); e todo retorno ao arquivo começava com re-descoberta.*

- O arquivo tem **marcadores de seção grep-áveis**: `/* ---------- NOME ---------- */`.
  Comece por `grep -n "^\/\* ----------" prototipos/fps/nos-fps.html` — é o sumário.
- **Nunca editar sem ler a região inteira antes** (o `if/else` do loop é a
  cicatriz). Edits cirúrgicos com âncoras únicas; conferir chaves ao redor.
- Convenções que permeiam tudo: cores são `Uint32 ABGR` via `rgb(r,g,b)`;
  campos assados (RIMF/PATHF/VEINF…) com amostragem bilinear; tudo que roda
  por pixel é lookup precomputado — nada de trigonometria nova no hot path.

## Limites do ambiente (cada um com a mitigação que funciona)

| Limite (provado em sessão) | Mitigação |
| --- | --- |
| Páginas no Chromium do sandbox **não alcançam rede externa** (raw/api do GitHub) — fetch de `falas.json` etc. falha | Testar a LÓGICA injetando dados na página (`page.evaluate`); produção usa raw normalmente. Ferramentas de auditoria são 100% locais por design |
| **Edições em `.github/workflows/` são bloqueadas** para o coder | A mudança vira pendência explícita para o ideador (ex.: adicionar `- 'prototipos/fps/**'` aos paths do `pages.yml` — ainda aberta) |
| **`world/heart.json` só muda com autorização explícita do ideador** (Registro vivo) | Efeitos visuais ficam client-side (campos assados); canonização autorizada usa o ferramental do motor (`serializeWorld`/`assertValidWorld`), nunca edição manual |
| **Sem `gh` CLI**; token não dispara workflow nem deleta branch remota | Tools MCP do GitHub para issues/PRs/actions; deleção de branch e dispatch manual ficam com o ideador |
| **Sessão/scratchpad são efêmeros** | Tudo que importa: commitado ou regenerável por comando (D-30). Ferramenta boa no scratchpad = ferramenta que devia estar no repo |
| Vejo **quadros, não vídeo**; gosto final é do ideador | Pares de frames para movimento; **antes/depois** para decisões estéticas |
| **Não escuto** (buraco maior que o visual) | `npm run ouvir` mede estado/ganho/RMS e barra a regressão muda; o "soa bonito?" é do ideador |

## Replicar num mundo novo (o kit)

Um repo-mundo novo nasce copiando daqui:

1. `CLAUDE.md` (o acordo + regras da casa) e o esqueleto de `docs/`
   (`CONTINUITY`, `DECISIONS`, `IMPLEMENTATION_PLAN`, este arquivo).
2. O contrato de mundo (`engine/types.ts` + schema + validador) — a fundação
   que deixa QUALQUER cliente ser descartável.
3. O padrão de build do cliente (`site/scripts/build-fps.mjs`: mundo inline
   → auditável offline) e a bancada (`qa/olhar.mjs` + `pontos.json` novos).
4. As convenções do arquivo grande (marcadores de seção, campos assados).

O que NÃO copiar: o diário (`CONTINUITY`) e as decisões — cada mundo escreve
os seus. O método, sim: registrar atrito, destilar ferramenta.
