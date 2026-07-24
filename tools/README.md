# tools/ — as ferramentas do Atelier

```
tools/
  bancadas/    As BANCADAS — prova por medição (Playwright headless / Node, offline):
               oficina.mjs    — prova cada passo da Oficina com número (npm run oficina)
               somtela.mjs    — prova a aba Som: editor de grafo + espectrograma (npm run somtela)
               olhar-peca.mjs — screenshot de PEÇA em 3 ângulos / giro / visão de
                                geometria --geo=normais|flat (npm run peca)
               jogar.mjs      — screenshot do jogo (jogo.html): câmera livre, menu,
                                tiers de gráfico (npm run jogar)
               auditar.mjs    — gate de senso crítico [cpu]: os 5 críticos numa peça,
                                exit≠0 em achado (npm run auditar)
               porteiro.mjs   — gate de render: pageerror/__ready/frame degenerado
                                (npm run porteiro)
               executar.mjs   — replay headless do núcleo da Oficina em Node (npm run executar)
               sintetizar.mjs — render offline de um evento de som (npm run sintetizar)
               analisar.mjs   — o OUVIDO: espectrograma + descritores de um som (npm run analisar)
               somab.mjs      — A/B: som real do jogo × preset, por medida (npm run somab)
               somexportar.mjs— round-trip do exportar de som (npm run somexportar)
               bench/         — benchmark dos críticos (defeitos plantados → placar F1)
               out/           — PNGs/saídas (gitignorado; evidência regenerável)
  mapa/        mapa.mjs (docs/MAPA.md gerado dos cabeçalhos + gate mapa:check) e
               toc.mjs (índice de docs/oficina.md + gate docs:toc:check)
  som/         Testes vitest do núcleo de som (somnucleo/somanalise/somexport)
  oficina/     Testes vitest do núcleo da Oficina (motor/oficina.js)
  servir.mjs   Servidor de dev (npm run servir): serve o v3 com no-store + salvar
               em pecas/ (POST /oficina/salvar) e pecas-som/ (POST /som/salvar)
```

**Pré-requisito das bancadas visuais:** `npm ci` na raiz, uma vez (o Playwright
está nas devDependencies; o Chromium já vem no ambiente — as bancadas avisam se
faltar). O índice único de comandos com exemplos: **`docs/RECURSOS.md`**.

Regra: **ferramenta nova de coder (bancada/auditoria) nasce em `tools/bancadas/`**.
