# O TETO — medir o que a Oficina de fato cria

Este documento não propõe capacidade nova. Ele mede **onde o vocabulário atual
para**, com uma criação de verdade, pra que a próxima evolução seja escolhida por
falha observada em vez de palpite.

## Por que isto vem antes de qualquer op ou tela nova

O épico do Playground (`docs/playground.md`, D-113→D-127) entregou 25 operações,
uma bancada de 402 asserções e um laço único (`npm run criar`). Cada op foi
provada **isoladamente**. O que nunca aconteceu: alguém usar o conjunto pra
autorar conteúdo de verdade.

O número que fecha o argumento, medido em 2026-07-25:

| | quantas | quais |
|---|---|---|
| Peças em `PASSOS` | 13 | **todas** com prefixo `_` — fixtures escritas pra exercitar ops |
| Peças em `construir(ctx)` JS-puro | 14 | **todo** o conteúdo real do jogo: `arco`, `arvore`, `arvore-cartoon`, `arvore3d`, `casa-toras`, `ilha-chao`, `vegetacao-cartoon` |

A regra 1 do épico diz que o `construir(ctx)` é "fallback **que encolhe** — cada
op nova rouba um caso dele; **cair nele = sinal de qual op construir em
seguida**". Medido: depois do épico inteiro, o fallback **não encolheu um caso**.
E a maior coisa já expressa em PASSOS é `_primitivas`, com 22 ops — que é
literalmente "uma de cada forma".

Ou seja: o chão é desconhecido. Somar uma quinta maneira de criar contorno (a Aba
Desenho) antes de alguém ter construído um objeto real com as 25 ops que já
existem é avançar sem saber onde se pisa.

## O desafio (um só, de propósito)

**A moto.** Escolhida porque a régua de pronto do `docs/playground.md` já a nomeia
e porque P1–P4 foram construídos pensando nela. É a promessa mais explícita que o
épico fez; testá-la é cobrar o que já foi prometido.

### O enunciado (palavras do ideador, 2026-07-25)

> Crie uma motocicleta futurista estilizada, baixa e alongada, com duas rodas
> grandes, carenagem envolvendo boa parte da estrutura e detalhes emissivos. A
> silhueta precisa ser claramente reconhecível como uma moto e as proporções
> devem parecer funcionais, mesmo sendo estilizadas. A peça deve ser simétrica,
> visualmente coerente com o Atelier e totalmente criada por PASSOS, pronta para
> ser reaberta e modificada na Oficina.

### O orçamento: 3 ciclos

**No máximo 3 ciclos completos de criar → medir → corrigir.** O limite é parte do
experimento, não uma restrição administrativa: uma capacidade que precisa de 20
ciclos pra sair do chão é, ela mesma, um achado sobre o teto. Ao fim do 3º ciclo
o resultado é o que é — melhor ou pior, entra no relatório.

**Um, não três.** Se a moto sozinha revelar três bloqueios, uma criatura e uma
cena não acrescentam informação — só custo. E uma criatura misturaria
esqueleto/animação, um subsistema diferente: falha ali não aponta pra lugar
específico.

## Quem executa: um agente LIMPO (a regra que faz a medição valer)

A execução **não** pode ser feita por quem construiu as ferramentas. Quem
implementou as ops carrega, de cabeça, as restrições de cada uma e o jeito certo
de contorná-las — e produziria uma moto que prova pouco sobre o vocabulário e
muito sobre a própria memória.

**Este documento é lido pelo agente executor, então ele não enumera armadilha
nenhuma de propósito.** Se uma restrição de op só é conhecível implementando (não
está no cabeçalho da op, na tabela de `docs/oficina.md` nem na skill
`criar-peca`), ela **tem** que ser descoberta pelo agente batendo nela — é assim
que o furo no contrato formal aparece. Escrever a armadilha aqui destruiria a
medição que este documento existe pra fazer.

O agente executor recebe **só**: o repositório, as skills (`oficina`,
`criar-peca`, `auditar-peca`, `nos-fluxo`), os documentos e a descrição do
desafio. **Não** recebe: dicas sobre armadilhas internas, o raciocínio de projeto
das ops, nem atalhos que não estejam escritos nos docs. Se ele precisar de algo
que só existe na cabeça de quem implementou, **isso é um achado do teste** — quer
dizer que o "contrato formal" (canal 4, `docs/oficina.md`) tem um furo.

Precedente desta disciplina: o D-120 validou o manifesto de capacidades
**plantando deriva de propósito** em vez de confiar que funcionava. Um teste que
não pode falhar não mede nada.

### Duas regras que protegem a medição

1. **Exclusivamente `PASSOS`.** Resolver por `construir(ctx)` JS-puro não vale —
   é justamente o fallback cujo tamanho está sendo medido. Se o agente concluir
   que algo só sai por JS puro, ele **registra como BLOQUEADO** e segue; não
   contorna.
2. **A corrida pode falhar, e ninguém resgata.** Se sair algo ruim, **isso é a
   entrega**. Socorrer o agente no meio destrói a medição — o instinto de ajudar
   é exatamente o que precisa ser contido aqui.

## O relatório: três vereditos, e nenhuma nota inventada

A regra 3 do épico exige número + **veredito** + limiar **calibrado**. Com uma
tentativa só não existe calibração possível (o método — D-60, e o `LIMIAR_IOU`
do D-118 — pede exemplos bons × defeitos plantados). Inventar uma barra ("≤100
passos = aprovado") seria falsa precisão: o mesmo pecado do número cru, vestido
de limiar.

Então o relatório usa **três estados**, e cada eixo declara qual se aplica:

- **APROVADO / REPROVADO** — só onde já existe régua real: os gates
  (`test`/`typecheck`/`oficina`/`porteiro`/`auditar`), round-trip do formato
  salvo (bit-a-bit), determinismo (canon 2×), malha (manifold / winding /
  órfãos), colisão, e IoU **quando houver gabarito**.
- **BLOQUEADO** — faltou vocabulário ou ferramenta pra expressar o que se
  queria. **É este o estado que escolhe o próximo trabalho** — o mais valioso
  dos três, e o único que não existia antes deste documento.
- **JULGAMENTO DO IDEADOR** — fidelidade estética sem régua calibrada. Fica
  explícito como julgamento humano, nunca como nota.

### Artefato acima de auto-relato

Auto-relato é exatamente o que a lição dos "83%" desconfia. O que conta como
evidência durável:

| Eixo | Medido de onde |
|---|---|
| concluiu? | a peça abre no `criar` com veredito |
| tamanho | `PASSOS.length` e quais ops usou (contado do arquivo, não narrado) |
| caiu no fallback? | `grep` de `construir` na peça final |
| erros / métricas | saída do `npm run criar` (objetiva) |
| tentativas | os commits do agente |
| **onde travou** | **aqui sim, auto-relato** — é qualitativo e insubstituível |

O último item é o único que depende da narrativa do agente, e de propósito: "o
que eu queria fazer e não achei como" não sai de nenhum artefato.

## Gabarito: NÃO nesta rodada (e por quê)

Um gabarito converteria fidelidade de forma num eixo objetivo (IoU, régua
calibrada em 0,55 no D-118). Mesmo assim fica de fora agora, por um motivo
metodológico e não de custo: **quem traça o alvo escolhe o que é alcançável.**
Quem conhece o vocabulário desenharia, sem querer, uma silhueta que `lathe`/
`loft`/`espelha` conseguem produzir — viciando o teste pro sucesso. Além disso,
os gabaritos existentes foram traçados *olhando o render de uma peça que já
existe* (`gabaritos/_viga.js`, D-118); usar um como alvo a-priori é uso novo, não
provado.

Consequência assumida: o `criar` reporta o eixo de forma como **não medido** (ele
falha alto sem gabarito — D-118, "nada foi medido não é 'passou'"), e a aparência
fica no **julgamento do ideador**. O gabarito da moto se traça **depois**, da moto
que sair — e aí ele serve as rodadas seguintes.

## Depois da tentativa

Não se planejam dez recursos. Escolhe-se **o bloqueio que mais se repetiu**, e a
categoria dele já diz o remédio:

| O que aconteceu | O que isso pede |
|---|---|
| faltou como expressar | operação nova |
| criou, mas não percebeu o defeito | métrica ou visualização nova |
| percebeu, mas não soube corrigir | diagnóstico melhor |
| ficou enorme e difícil de editar | op de nível mais alto, hierarquia — ou o **canal `descrever`** (`docs/oficina.md`, canal 5) |

**Nada é pré-agendado** — nem `descrever`, nem a Aba Desenho, nem op nova. Os
dois primeiros são candidatos fortes e já estão escritos como dívida
reconhecida; se forem eleitos, será por falha observada. Pré-agendar é o vício
que este documento existe pra corrigir.
