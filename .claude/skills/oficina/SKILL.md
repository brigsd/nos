---
name: oficina
description: A Oficina — o editor de objetos in-game do NÓS (arquitetura, ciclo de construção, verificação, armadilhas). Use SEMPRE que for construir/continuar um passo da Ordem de construção (docs/oficina.md), mexer em oficina.html ou motor/oficina.js, ou tratar da câmera do editor, overlay de malha, arrasto/edição de vértice, desfazer/refazer, gizmo, materiais, som ou qualquer ferramenta da Oficina — pra não re-derivar a arquitetura a cada sessão.
---

# A Oficina — arquitetura e como construir o próximo passo

O editor de objetos que roda dentro do jogo. O roteiro vive em **`docs/oficina.md` → "Ordem de construção"** (checklist `[x]/[~]/[ ]`); as decisões, em `docs/DECISIONS.md` (D-73…D-82). Regra de ouro: **o visor usa o MESMO motor do jogo** (`render.js`) — o que fica bom aqui fica bom no jogo.

## A ideia central: o objeto É a lista de passos

Uma peça é o **envelope**: `FORMATO` + `PARAMS` (dimensionais, citados por NOME) + `TOPO` (topológicos, mudam a contagem de vértices) + `PASSOS` (a lista `[['op',{...}],...]`) + `meta` + `construir`. **Editar = mexer na lista + re-executar** — não existe estado paralelo. É isso que dá undo/replay/IA de graça. Nada de aleatório sem semente escrita no passo.

## Três camadas (nunca misture)

- **Núcleo** (`motor/oficina.js`, `nucleo(PASSOS,PARAMS,TOPO)→{V,F}`): monta vértices únicos numerados + faces por id + atributos por face. Devolve NÚMEROS, roda headless, não sabe desenhar.
- **Adaptador** (`adaptarV3`): neutro → triângulos soltos do motor (8 floats: pos3 uv2 nrm3). Cor por face via textura-amostra + UV (o vértice ainda não tem cor — reservado). Única parte que muda de motor pra motor.
- **Interface** (`oficina.html`): câmera, overlay, painéis, input.

## Peças-chave já construídas (passos 0-5)

- **`motor/oficina.js`**: `nucleo`, `executar` (núcleo+adaptador → `{lotes,camera}`), `colisaoDe` (só-geometria, encaixa cilindro na malha final), `neutroCanonico` (forma canônica pra comparar/replay). **Identidade posicional por bloco** (`BLOCO=1000`): o passo `i` possui os ids `[i*1000, +1000)` — a numeração depende só da POSIÇÃO, nunca de PARAMS. Mudar `raio` não renumera; mudar `lados` (TOPO) renumera e os passos pendurados viram **órfãos que GRITAM** (nunca corrompem). `moveV` é ADITIVO (`p+d`). Ops iniciais: cubo, cilindro, moveV, extruda(face), mescla, pincel(face), solido, liso.
- **`render.js`** (motor — jóia, NÃO tocar sem o cuidado do `nos-fluxo`): hooks que a Oficina usa — `setCam(pos,yaw,pitch)` (câmera livre, dirigida no `antesDoQuadro` de `rodar(onFrame, antesDoQuadro)`), `setLente(x,y)` (deslocamento de lente opt-in pra centrar o objeto na área livre fora do painel, D-79; `[0,0]` = no-op), `projetar(p)` (mundo→tela em px, já com a lente).
- **`oficina.html`**: câmera órbita/pan/zoom de CURSOR LIVRE (dirige `setCam`; conversão órbita→câmera em `aplicarCamera`/`base()`); overlay 2D da malha (`pointer-events:none`, desenha V/F por `projetar` no `antesDoQuadro`, casa com o quadro); hit-test + arrasto de vértice → `moveV` (`malhaCtl`); desfazer/refazer com `baseline` (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z).
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

- **Input no meio de um arrasto**: QUALQUER handler que dispara durante um arrasto de vértice precisa de `if (arrasto) return`. A roda (passo 4) e o Ctrl+Z (passo 5) tiveram o MESMO bug — mudavam a lista/escala com uma edição em voo e gravavam um `moveV` errado (formato salvo). Todo passo interativo novo: pergunte "e se isto disparar no meio de um arrasto?".
- **Profundidade do vértice ≠ distância do alvo**: no arrasto 2D→3D, use `prof = dot(P−camPos, olhar)` do PRÓPRIO vértice (o galho extrudado está noutra profundidade; usar `dist` erra nele).
- **Determinismo**: se o neutro não replaya idêntico, algo não é determinístico — cace a fonte (relógio, ordem, `Math.random`).

Progresso e nuances abertas ficam em `docs/DECISIONS.md` (D-77 núcleo · D-78 câmera · D-79 lente · D-80 overlay · D-81 arrasto · D-82 undo).
