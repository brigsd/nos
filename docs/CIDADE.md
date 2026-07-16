# A Cidade da Clareira — proposta de arquitetura

> **Status: PROPOSTA** aguardando sign-off estético do ideador (lição do PR #46:
> nenhum tijolo antes do "sim"). O **sítio já existe no jogo** (D-31): o carreiro
> sai do spawn, atravessa a floresta NE e deságua numa clareira sem árvores de
> raio ~5 tiles centrada em (46.2, 15.6) — anel de mata por todos os lados.

## Conceito: a vila-oficina atemporal

O Coração é **A Fábrica** (D-23) e as máquinas são **sintetizadores atemporais**
(D-25a) — a cidade segue o mesmo princípio: **nem futurista, nem medieval**.
Materiais: madeira clara, pedra, metal escuro dos sintetizadores. Nada de neon,
nada de palha genérica de RPG. O estilo "de que época é isso?" sem resposta —
é a época d'O Coração.

## Forma (raio ~5 tiles, vila de ~8–10 construções)

```
            mata  mata  mata
        mata [Estaleiro]  [Forja] mata
   carreiro ->  ( LARGO )          arcos de   ~ céu/
        mata [Bancada]  [Cozinha]  PORTAIS ~  mar de nuvens
            mata  mata  mata
```

- **O Largo da Fábrica** — o disco de terra batida onde o carreiro deságua
  (já existe) vira a praça central.
- **4 alas = 4 sintetizadores**, um por diagonal, cada ala com a cara do seu
  ofício: **Forja** (pedra + chaminé fumegando), **Cozinha** (madeira + toldo +
  cheiro de pão imaginário), **Bancada** (oficina aberta, ferramentas nas
  paredes), **Estaleiro** — o maior, com uma **doca apontando pro vazio da
  ilha**: aqui se montam coisas que pilotam, e elas partem pelo céu.
- **Lojas**: bancas e quiosques de madeira com toldos coloridos no anel entre
  as alas — comércio de feira, não caixotes de shopping.
- **Hall de Portais**: semicírculo de **arcos de pedra** na borda leste da
  clareira, contra o céu (a borda da ilha está perto). Cada arco = um mundo do
  registro; O Átrio aceso, os demais adormecidos. Chegar de portal = entrar na
  cidade pela porta monumental.
- **Sem muralha**: a muralha é o próprio anel de árvores. Canteiros e
  cerca-viva onde precisar de borda.

## Relevo: chão plano, verticalidade na arquitetura

O raycaster tem UM plano de chão — honestidade técnica: **fase 1 plana**, com
a sensação de altura vinda de torres, chaminés, mastros do estaleiro e os
arcos dos portais (billboards e paredes DDA altas custam zero a mais).
Degraus/terraços REAIS (floor casting multinível) são possíveis, mas caros —
ficam como fase 2 se a cidade pedir.

## Migração das máquinas

As quatro máquinas hoje estão no quad (29,29)–(36,36) ao redor do Núcleo. Na
construção, **migram para as alas via edição versionada do `world/heart.json`**
(posição é dado, não engine — commit auditável no Registro). O Núcleo continua
onde está: a presença de luz na praça antiga, e o carreiro liga as duas.

## Pipeline de construção (quando aprovado)

1. `city-core.js` — gerador procedural (paredes DDA texturizadas madeira/pedra
   + billboards de detalhe: toldos, placas, lampiões, fumaça).
2. `CITY_PLAN` em JSON — lotes, tipos e rotações data-driven, como tudo no NÓS.
3. Iteração com screenshots (o método do carreiro) e **sign-off estético do
   ideador antes de qualquer merge**.

## Perguntas em aberto (pro ideador)

1. **Telhados**: (a) madeira/sapê rústico · (b) telhas de cobre oxidado
   (verde-azulado, ecoando os sintetizadores) · (c) misto — cada ala com o
   material do seu ofício?
2. **Veias de luz do Pulso** correndo pelo chão da cidade (e talvez pelo
   próprio carreiro), como raízes luminosas saindo do Núcleo: sim ou não?
3. **Nome da cidade** — "A Clareira"? Ou o ideador batiza.
