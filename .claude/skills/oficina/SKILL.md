---
name: oficina
description: A Oficina — o editor de objetos in-game do NÓS (arquitetura, ciclo de construção, verificação, armadilhas). Use SEMPRE que for construir/continuar um passo da Ordem de construção (docs/oficina.md), mexer em oficina.html ou motor/oficina.js, ou tratar da câmera do editor, overlay de malha, arrasto/edição de vértice, desfazer/refazer, gizmo, materiais, som ou qualquer ferramenta da Oficina — pra não re-derivar a arquitetura a cada sessão.
---

# A Oficina — arquitetura e como construir o próximo passo

O editor de objetos que roda dentro do jogo. O roteiro vive em **`docs/oficina.md` → "Ordem de construção"** (checklist `[x]/[~]/[ ]`); as decisões, em `docs/DECISIONS.md` (D-73…D-82). Regra de ouro: **o visor usa o MESMO motor do jogo** (`render.js`) — o que fica bom aqui fica bom no jogo.

## Por onde começar (leia estes, pule o resto)

Os arquivos que importam pra Oficina são poucos:

- **`docs/oficina.md`** → "Ordem de construção" (qual é o próximo passo) + a seção que esse passo cita (a spec autoritativa).
- **`prototipos/fps/v3/motor/oficina.js`** — o núcleo (o dado). ~300 linhas; leia inteiro se for mexer no modelo.
- **`prototipos/fps/v3/oficina.html`** — a interface (câmera, overlay, edição). Onde vive quase todo passo novo.
- **`prototipos/fps/v3/motor/render.js`** — só os hooks que a Oficina usa (`setCam`/`setLente`/`projetar`/`rodar`). NÃO leia inteiro nem mexa sem o cuidado do `nos-fluxo` (é jóia).
- **`tools/bancadas/oficina.mjs`** — a bancada que prova cada passo com número.
- **`docs/DECISIONS.md`** (D-73…) — o porquê de cada escolha.

A **árvore completa** do repo (todo arquivo + um resumo por arquivo) fica em **`docs/MAPA.md`**, gerado e sempre fresco — vá lá só quando precisar de algo fora desta lista.

## A ideia central: o objeto É a lista de passos

Uma peça é o **envelope**: `FORMATO` + `PARAMS` (dimensionais, citados por NOME) + `TOPO` (topológicos, mudam a contagem de vértices) + `PASSOS` (a lista `[['op',{...}],...]`) + `meta` + `construir`. **Editar = mexer na lista + re-executar** — não existe estado paralelo. É isso que dá undo/replay/IA de graça. Nada de aleatório sem semente escrita no passo.

## Três camadas (nunca misture)

- **Núcleo** (`motor/oficina.js`, `nucleo(PASSOS,PARAMS,TOPO)→{V,F}`): monta vértices únicos numerados + faces por id + atributos por face. Devolve NÚMEROS, roda headless, não sabe desenhar.
- **Adaptador** (`adaptarV3`): neutro → triângulos soltos do motor (8 floats: pos3 uv2 nrm3). Cor por face via textura-amostra + UV (o vértice ainda não tem cor — reservado). Única parte que muda de motor pra motor.
- **Interface** (`oficina.html`): câmera, overlay, painéis, input.

## Peças-chave já construídas (passos 0-6)

- **`motor/oficina.js`**: `nucleo`, `executar` (núcleo+adaptador → `{lotes,camera}`), `colisaoDe` (só-geometria, encaixa cilindro na malha final), `neutroCanonico` (forma canônica pra comparar/replay). **Identidade posicional por bloco** (`BLOCO=1000`): o passo `i` possui os ids `[i*1000, +1000)` — a numeração depende só da POSIÇÃO, nunca de PARAMS. Mudar `raio` não renumera; mudar `lados` (TOPO) renumera e os passos pendurados viram **órfãos que GRITAM** (nunca corrompem). `moveV` é ADITIVO (`p+d`). Ops iniciais: cubo, cilindro, moveV, extruda(face), mescla, pincel(face), solido, liso.
- **`render.js`** (motor — jóia, NÃO tocar sem o cuidado do `nos-fluxo`): hooks que a Oficina usa — `setCam(pos,yaw,pitch)` (câmera livre, dirigida no `antesDoQuadro` de `rodar(onFrame, antesDoQuadro)`), `setLente(x,y)` (deslocamento de lente opt-in pra centrar o objeto na área livre fora do painel, D-79; `[0,0]` = no-op), `projetar(p)` (mundo→tela em px, já com a lente).
- **`oficina.html`**: câmera órbita/pan/zoom de CURSOR LIVRE (dirige `setCam`; conversão órbita→câmera em `aplicarCamera`/`base()`); overlay 2D da malha (`pointer-events:none`, desenha V/F por `projetar` no `antesDoQuadro`, casa com o quadro); hit-test + arrasto de vértice → `moveV` (`malhaCtl`); desfazer/refazer com `baseline` (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z); **gizmo** de eixos (setas X/Y/Z, arrasto TRAVADO por eixo `d=eixo·avanço`) e **painel** `#props` (vértice + dimensões + valor exato editável) — na MESMA máquina `arrasto`/`malhaCtl`.
- **Bancada**: `npm run oficina` (`tools/bancadas/oficina.mjs`) — prova cada passo com NÚMERO (Playwright headless, eventos e teclas reais).

## O ciclo pra construir o próximo passo

1. **Escopo**: leia o passo na Ordem + as seções que ele cita em `oficina.md` (são a spec autoritativa). Ache qualquer decisão IRREVERSÍVEL (encosta no formato salvo) e fixe/confirme ANTES.
2. **Delegue** a um coder (molde do brief no `nos-fluxo`): só os arquivos do passo; NÃO tocar em `render.js`/`motor/oficina.js` sem avisar; provar por MEDIÇÃO.
3. **Verifique** (disciplina abaixo).
4. **Revisor adversarial POR RISCO**: interface com núcleo provado objetivamente → dispensa; passo que grava operação (formato salvo) ou tem conta de julgamento → roda (foi ele que pegou a normal invertida no passo 1, a roda no passo 4, o Ctrl+Z no passo 5).
5. **Conserte os achados antes da main**, **mergeie** (git no `nos-fluxo`), **registre** D-nº + marque o checklist `[x]`.

## Verificação — prova por MEDIÇÃO, não pelo olho

O olho engana em normal, luz e alinhamento (D-65). Prove com número:
- **Render idêntico**: `cmp` dos PNGs, byte-a-byte (foi assim que a migração WebGL2 provou zero regressão).
- **Replay**: `neutroCanonico` da lista editada, re-executado na PÁGINA e em NODE à parte, bit-a-bit igual — o critério do doc ("o arquivo de passos refaz o objeto igual").
- **Posição na tela**: projete o ponto pelo PRÓPRIO motor (`projetar`) e compare com o esperado (centro, cursor). Assim a câmera (0.00px) e o arrasto (0.06px) foram provados — e assim se acha uma normal invertida que o olho não vê.

## Armadilhas recorrentes (aprendidas doendo)

- **Input no meio de um arrasto**: QUALQUER handler que dispara durante um arrasto precisa de `if (arrasto) return`. A roda (passo 4) e o Ctrl+Z (passo 5) tiveram o MESMO bug — mudavam a lista/escala com uma edição em voo e gravavam um `moveV` errado (formato salvo). O JEITO CERTO de escapar disso: um tipo de arrasto novo (o gizmo, passo 6) **reusa a MESMA máquina `arrasto`/`soltar`/`reexec`** — aí as guardas existentes já cobrem, sem código novo. Todo passo interativo novo: pergunte "e se isto disparar no meio de um arrasto?".
- **Campo numérico editável × precisão do display**: o no-op de um campo tem que ser amarrado à precisão MOSTRADA (ex.: `toFixed(3)`), não a `1e-9`. Senão re-digitar o valor já exibido grava um passo fantasma sub-visual (D3 do passo 6). Vale pra qualquer campo futuro (material, animação).
- **Profundidade do vértice ≠ distância do alvo**: no arrasto 2D→3D, use `prof = dot(P−camPos, olhar)` do PRÓPRIO vértice (o galho extrudado está noutra profundidade; usar `dist` erra nele).
- **Determinismo**: se o neutro não replaya idêntico, algo não é determinístico — cace a fonte (relógio, ordem, `Math.random`).

Progresso e nuances abertas ficam em `docs/DECISIONS.md` (D-77 núcleo · D-78 câmera · D-79 lente · D-80 overlay · D-81 arrasto · D-82 undo · D-83 gizmo+painel).
