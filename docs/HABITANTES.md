# Os Habitantes — mentes que JOGAM o jogo (proposta)

> **Status: PROPOSTA** para o ideador. Resolve o pedido "quero uma cidade
> maior, mas sem estruturas vazias e sem sentido — vida de verdade, não
> animação sintética; um mecanismo revolucionário rodando por trás".

## A ideia numa frase

**NPCs não são scripts dentro do motor — são REPOSITÓRIOS que jogam o jogo
pelo mesmo canal público que os humanos.** Uma "mente" vive em outro repo,
pensa com IA de verdade, e age n'O Coração postando os MESMOS comandos via
issue que qualquer jogador usa. O tick não conhece a diferença.

## Por que isso não é "vida sintética"

Pássaros e grilos são animação: loops sem estado. Um Habitante é diferente:

1. **Memória persistente** — cada habitante tem um arquivo de memórias no
   repo-mente (commitado a cada pensamento): quem o tratou bem, o que
   trocou, o que quer. Ele **lembra de você semana que vem**.
2. **Consequência real** — as ações passam pelo Registro público (issues →
   tick → commit). O mundo muda de verdade: estoque, posições, falas no
   Mural, capítulos da Crônica.
3. **Histórias emergentes** — a cozinheira sem lenha para de assar e
   REGISTRA isso; o ferreiro percebe e vai coletar; um jogador que doar
   madeira vira "o amigo da cozinha" na memória dela. Ninguém roteirizou.

## Arquitetura (100% dentro do GitHub, como tudo no NÓS)

```
brigsd/nos-mentes (repo novo — "a lógica pesada")
  mentes/ferreira.json      memória + persona + objetivos de cada habitante
  mentes/cozinheira.json
  .github/workflows/pensar.yml   cron (~1x/hora, defasado do tick)
```

A cada ciclo, para cada habitante:
1. **Lê** `world/heart.json` (raw, público) + a própria memória.
2. **Pensa** com **GitHub Models** (D-15: inferência grátis DENTRO do
   Actions, token nativo, sem API key) — prompt = persona + memórias +
   estado do mundo + últimos eventos. Sai UMA ação (`/mover`, `/dizer`,
   `/trocar`, `/fabricar` ou ficar) + um pensamento íntimo.
3. **Age**: posta a issue de comando no `brigsd/nos` — o tick processa o
   habitante como processa qualquer jogador (zero mudança no motor).
4. **Registra**: commita a memória atualizada + o pensamento no repo-mente
   (o "diário interno" — auditável como tudo).

Fallback determinístico (D-09/D-15): se o Models falhar/limitar, a rotina
base (behavior tree) decide — o mundo nunca trava.

## Por que é revolucionário (e só funciona no NÓS)

O filtro anti-genérico (D-23) passa com folga: **cidadania por
repositório**. Uma mente é só um repo público que joga pelo protocolo de
todos. Ou seja: no futuro, **qualquer pessoa pode criar uma mente** — forkar
o template, escrever uma persona, e apadrinhar um habitante d'A Clareira.
A cidade cresce um prédio POR habitante novo (estrutura nunca nasce vazia:
ela é a casa de alguém que pensa). E é o ensaio geral da federação (D-17):
agentes externos agindo via o protocolo público.

## v1 enxuta (proposta de escopo)

- **3 habitantes**, um por ala: a ferreira (Forja), a cozinheira (Cozinha),
  o mestre-estaleiro (Estaleiro). Persona curta + 2 objetivos cada.
- 1 decisão/hora/habitante (24-72 ações/dia no total — sem stress de cota).
- Visível no jogo: avatar + nome no FPS e no 2D, falas no Mural, memórias
  públicas no repo-mente.
- Guardrails: teto de ações/dia, validação do comando antes de postar,
  pensamento sempre commitado junto (transparência radical).

## O que precisa do ideador

1. **Criar o repo `brigsd/nos-mentes`** (ou autorizar o coder a criar).
2. Um **fine-grained PAT** com `issues:write` só no `brigsd/nos`, salvo
   como secret do repo-mente (é a "mão" dos habitantes).
3. Batizar os 3 primeiros habitantes (ou deixar o lore-writer propor).
