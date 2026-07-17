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
- Pontos canônicos em `prototipos/fps/qa/pontos.json`. **Criou uma área
  nova? Adicione o ponto dela** — a auditoria de amanhã custa uma linha hoje.
- Saída em `prototipos/fps/qa/out/` (gitignorada). O passo seguinte é
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
