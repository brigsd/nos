---
name: criar-peca
description: CRIAR conteúdo do jogo NÓS como IA — objeto 3D, som, animação, esqueleto — escrevendo a peça como lista de PASSOS (o formato da Oficina) e provando com as bancadas (ver PNGs, medir som). Use SEMPRE que o ideador pedir pra criar/editar uma peça, um objeto, um som, uma animação ou qualquer conteúdo do Atelier (v3) — este é o manual de autoria; a skill `oficina` é pra mexer NA ferramenta, não pra usá-la.
---

# Criar peça — o manual de autoria da IA

Você não clica na Oficina — você **escreve a peça direto** (o mesmo formato que
a Oficina grava) e **vê/mede** pelas bancadas. O laço: escrever → `npm run peca`
→ LER os PNGs → auditar → iterar. Peça de objeto mora em
`prototipos/fps/v3/pecas/`, de som em `pecas-som/`. Prefixo `_` = exemplo/preset
(o `auditar` sem argumento pula os `_`).

## Objeto 3D — o formato (copie de `pecas/_oficina-toco.js`)

`PARAMS` (dimensionais — citados por NOME nos passos, mudar NÃO renumera) +
`TOPO` (topológicos — mudar RECONSTRÓI e pode deixar passo órfão) + `PASSOS`
(a lista `[['op',{...}],...]`) + `meta` com `colisao: colisaoDe(PASSOS, PARAMS,
TOPO)` (CHAMADA, não valor) + `construir = executar(...)`. **`PASSOS` exportado**,
senão a Oficina nunca mais reabre o arquivo.

**Identidade por bloco (`BLOCO=1000`):** o passo `i` possui os ids
`[i*1000, i*1000+1000)`. Um cilindro de `lados:8` no passo 0 cria vértices
0..15 (anel de baixo 0..7, de cima 8..15 — SEM vértice de centro; as tampas são
polígonos) e faces 0..9 (laterais 0..7, fundo 8, topo 9); um `extruda` no passo
1 cria a partir de 1000. A numeração depende só da POSIÇÃO do passo — id que
aponta pro nada GRITA (órfão), nunca corrompe.

**Vocabulário IMPLEMENTADO hoje** (o resto da tabela do `docs/oficina.md` é
roteiro, ainda não existe — não use):

| op | args | nota |
|---|---|---|
| `cubo` / `cilindro` | `id`, medidas, `lados` (cilindro) | os DOIS únicos geradores hoje — esfera/cone/lathe/loft ainda não existem |
| `moveV` | `v`, `d:[x,y,z]` | ADITIVO (`p+d`), nunca posição absoluta |
| `extruda` | `face`, `dist` | só face única; anel novo nasce no bloco do passo |
| `mescla` | `de:[ids]`, `para:id` | solda; face de área zero some quieta |
| `escala` | seleção, `fator`, `eixo?` | |
| `pincel` | `modo:'face'` (`faces`, `cor`) ou `modo:'livre'` (`cor`,`raio`,`dureza`,`pontos:[{f,a,b}]`) | livre = dab face-local, acompanha a face |
| `liso` | `faces:[ids]` | sombreado macio (padrão: chapado) |
| `material` | `faces`, `usa` | + `MATERIAIS = {mat1:{cor,emissivo,aspereza,semLuz,mistura:'transparente'}}` exportado |
| `parte` | `nome`, `faces:[ids]` | nomeia pra animação/material |
| `pesar` | `osso`, `faces:[ids]`, `peso` | skinning (acumula por vértice, normaliza top-4) |
| `solido` | `faces:[ids]` | o que entra na colisão |

**Animação/esqueleto** (exportados junto, opcionais): `ANIMACOES =
{nome:{duracao,repete,trilhas:[{parte|osso,canal,chaves:[[t,v],...]}]}}` (canais
`rotX/rotY/rotZ/pos...`, interpolação smoothstep) e `ESQUELETO =
{ossos:{b0:{pai,pivo:[x,y,z]},...}}` — a assinatura completa é
`executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS = {}, ANIMACOES = {}, ESQUELETO = null)`. Exemplos:
`_oficina-anim.js` (partes), `_oficina-esqueleto.js` (rig completo).

**Alcance honesto:** caixa+cilindro+extruda+move cobrem arquitetura, móveis,
props angulados, troncos. Forma REDONDA/orgânica lisa (esfera, vaso, copa
suave) ainda não tem gerador — não finja com mil moveV; reporte o limite (ou
use o caminho JS-puro abaixo).

## O laço de VER (você tem olhos — use-os)

```bash
npm run peca -- minha-peca                      # 3 ângulos → tools/bancadas/out/*.png
npm run peca -- minha-peca --giro=8             # 8 ângulos (defeito de um lado só)
npm run peca -- minha-peca --res=1400 --geo=normais   # SEM textura: emenda/faceta SALTAM
npm run peca -- minha-peca --res=1400 --geo=flat      # silhueta/volume
npm run auditar -- minha-peca && npm run porteiro -- minha-peca   # gates (exit≠0 = achado)
npm run executar                                # replay/determinismo do núcleo
```

**LEIA os PNGs de verdade** (Read no arquivo). Regra de comportamento (skill
`auditar-peca`): todo julgamento cita ≥1 número/gate; FORMA é do ideador — você
aponta os defeitos que vê, entrega, e NUNCA conclui sozinho "ficou bom".

## Som — o formato (copie de `pecas-som/_agua.js`)

`PARAMS` + `semente` + `PASSOS` (grafo em dados: cada passo um NÓ com `id`,
ligado por `de:`) + `meta` (com `duracao: duracaoDoGrafo(somNucleo(...))`) +
`construir(ctx,quando) = construirGrafo(somNucleo(PASSOS,PARAMS,semente), ctx, quando)`.
O nó de áudio LIVRE (sem consumidor) é a saída.

**Nós implementados:** `oscilador` (forma/freq), `ruido` (cor/k), `filtro`
(passa-baixa/alta/banda, freq, q), `envelope` (ataque/pico/decaimento/duracao),
`ganho`, `lfo` (modula um param de outro nó), `soma`. Presets de referência com
os números do jogo: `_passo` (estalo agudo ~3 kHz), `_vento` (sustentado 4,5 s),
`_bolha` (tonal, varre), `_agua` (grave abafado ~350 Hz).

**O ouvido (você não escuta — MEDE):**

```bash
npm run analisar -- minha-peca-som    # espectrograma (Read a imagem!) + tom/brilho/envelope/duração
npm run sintetizar -- minha-peca-som  # amostras/hash offline (determinismo)
npm run somab                         # A/B contra o som real do jogo, por eixo
```

Brilho alto ≈ estalo/agudo; centroide baixo ≈ abafado/grave; o espectrograma
mostra varredura/harmônico/tremor. Compare SEMPRE com um preset vizinho.

## O caminho JS-puro (fora da Oficina — fallback)

`construir(ctx)` direto com `ctx.{TS,tex,geo,m4}` (molde: `pecas/_modelo.js`;
exemplos grandes: `arvore3d`, `casa-toras`, `ilha-chao`). Geometria ilimitada,
MAS **não reabre na Oficina** nem tem replay canônico — é pra motor/paisagem e
pro que o vocabulário ainda não cobre. Prefira PASSOS sempre que der; se cair
aqui por falta de uma op, DIGA (é sinal de qual op construir em seguida).

## Entrega

Peça nova precisa de CABEÇALHO (1º comentário — o `mapa:check` barra sem) e
passa pelos gates (`npm run mapa` + os quatro de sempre). Determinismo:
NENHUM `Date.now()`/`Math.random()` cru — semente escrita na peça. O fluxo de
commit/decisão: skill `nos-fluxo`.
