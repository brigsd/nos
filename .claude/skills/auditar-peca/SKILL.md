---
name: auditar-peca
description: Gate de senso crítico [cpu] pra peças do motor v3 (prototipos/fps/v3/pecas/*.js). Roda os críticos validados por benchmark (geometria, paleta, costura, banding, órfãos) + o gate de render, dando NÚMEROS objetivos no lugar de "achei que ficou bom". Use ANTES de commitar/publicar qualquer peça v3 nova ou alterada (árvore, ilha, casa, textura, malha), ou quando suspeitar de defeito que não salta no screenshot.
---

# Auditar peça — senso crítico com número, não opinião

A tese (D-56/D-60): eu erro mais justo quando julgo o que **acabei de criar**.
A cura não é olhar com mais atenção — é **sinal externo objetivo**. Estas
ferramentas movem o julgamento pra fora de mim, onde não dá pra me enganar.
Regra transversal: **todo julgamento de peça cita ≥1 número destes**, não
"ficou bom" e sim "malha limpa, paleta ok, sem costura".

## O gate (rode os dois; ambos offline/rápidos)

```bash
node tools/bancadas/auditar.mjs <peca>     # críticos [cpu] em Node puro (ms) — geometria + texturas
npm run porteiro -- <peca>                 # gate de RENDER (Playwright): pageerror / __ready / frame degenerado
```

`auditar` sem argumento roda em TODAS as peças (não-`_`). Exit≠0 = achado →
não commite antes de resolver ou justificar.

## O que cada crítico pega (e o PISO — onde NÃO confiar)

Medido pelo benchmark (`npm run bench`): 3 peças reais × defeitos plantados.
Todos gateiam o defeito REAL com **F1=1.00 no núcleo e zero falso-alarme na
arte de verdade**. Mas cada um tem um piso honesto:

| crítico | pega (núcleo) | PISO — o que passa |
|---|---|---|
| **lint-de-malha** | tri degenerado, vértice NaN/Inf/gigante, normal zero/não-unit, stride/contagem, lote vazio | nada medido — geometria é exata |
| **distancia-paleta** | cor fora da paleta (CIEDE2000) + desvio multi-tom; allowlist da madeira D-54f | desvio SUTIL de 1 tom só; e faixa chapada off-palette é do banding (fronteira compartilhada) |
| **detector-de-seam** | costura forte (borda chapada + salto vs interior) sem acusar textura que só não ladrilha | costura SUTIL (borda ainda texturada) passa |
| **detector-de-banding** | faixa chapada interior + chuvisco RGB forte | ruído MODERADO (abaixo do chuvisco) passa |
| **contador-de-pixels-orfaos** | pixel 1px isolado de cor rara e alto contraste | pode alarmar sob ruído pesado; pontilhismo intencional denso de cores únicas daria FP |

**Tradução:** os críticos são gate de defeito REAL/óbvio (o que de fato
acontece — foi um `[cpu]` que pegou o bug do `hash2`, D-58). Não são olho
artístico nem pegam o sutil no limite; "bonito" continua sendo do ideador.

## Se mexeu no MOTOR ou nas mutações

Rode o benchmark e confirme que nada regrediu:

```bash
npm run bench            # placar núcleo/adversarial + limites por ferramenta
```

Ao ADICIONAR um crítico novo: um arquivo em `tools/bancadas/bench/tools/` que
exporta `id`, `dom` e `analisar(built, {pixels}) -> findings[]`. O runner o
descobre sozinho e o pontua. Sem defeito plantado do seu domínio em
`bench/mutacoes.mjs`, ele não tem como provar que ajuda — adicione a mutação
junto.
