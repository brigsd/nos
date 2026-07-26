# Diagnóstico — subpartes semânticas da moto

Diagnóstico da lista de 6.374 referências literais de face da moto no estado da
segunda corrida (`22f7590`), antes dos 11 passos anexados na terceira. Não altera
`moto.js`, formato salvo, núcleo ou código funcional. Os números abaixo contam
ocorrências em `faces:[…]` e `sel:{f:[…]}`, portanto uma mesma face usada por
atributos distintos aparece mais de uma vez: é justamente o acoplamento medido.

## Método

Foi extraída a matriz `PASSOS` da moto histórica e contada cada seleção das ops
`pincel`, `liso`, `material`, `solido`, `parte` e `espelha`. A classificação é
da intenção dominante de cada lista, não uma suposição geométrica: uma lista
mista permanece mista mesmo quando alguns de seus IDs pertencem a uma peça.

| operação | listas | IDs |
|---|---:|---:|
| `espelha` | 6 | 204 |
| `pincel` | 22 | 1.492 |
| `liso` | 1 | 820 |
| `material` | 6 | 1.438 |
| `parte` | 5 | 1.491 |
| `solido` | 1 | 929 |
| **total** | **41** | **6.374** |

## Classificação das listas

| categoria | listas | IDs | evidência na moto |
|---|---:|---:|---|
| 1. peça inteira | 5 | 1.491 | as cinco `parte`: roda dianteira (379), traseira (380), corpo (242), dianteira (358) e traseira (132) |
| 2. faixa/seção de um PASSO | 6 | 204 | os seis meios volumes de `espelha`, cada qual uma faixa completa de um `loft` fonte |
| 3. padrão repetido local | 25 | 2.928 | 22 `pincel` (1.492), `liso` (820), materiais borracha (440) e neon (176): paridade/lado/faixa repetida em rodas, tubos e detalhes |
| 4. conjunto visual descontínuo | 2 | 790 | materiais laca (298) e cromo (492): unem regiões visualmente equivalentes de geradores diferentes, sem uma única faixa local |
| 5. região espacial exata | 2 | 32 | materiais farol (20) e lanterna (12), já provados por caixa inclusiva sem capturar face extra |
| 6. outro: união heterogênea | 1 | 929 | `solido`: duas rodas completas (759) mais 170 faces específicas do corpo |
| **total** | **41** | **6.374** | |

Detalhe operacional: `solido` contém duas peças inteiras já nomeadas, mas não é
uma única peça nem uma única intenção local; `sel.grupo` aceita um grupo por vez.
Os 759 IDs das rodas poderiam virar duas atribuições se as partes existissem
antes, porém os 170 IDs do corpo continuariam sem representação exata.

## Comparação das famílias

Os números são cobertura exata na moto histórica; não contam economia por
aproximação nem atribuem a uma família uma intenção que ela não expressa.

| família | IDs exatos substituíveis | listas/passos simplificados | inserção antes da peça | round-trip/determinismo | intenção humana/IA | casos que ficam fora |
|---|---:|---:|---|---|---|---|
| A. `parte` criada cedo | 759 | 1 lista, repartida em 2 passos | não: a definição atual da parte ainda lista faces posicionais | já preservados, mas herda a fragilidade dos IDs | alta, porém só macropeças | subfaixas e os 170 sólidos do corpo |
| B. subpartes nomeadas no gerador | 3.132 | 31 listas | sim, se o nome nascer com o gerador | sim, se o rótulo for dado salvo/reexecutado | alta: `flanco`, `aro`, `lado`, `faixa` | laca/cromo multi-gerador, peças inteiras e uniões heterogêneas |
| C. proveniência: origem + seção/lado/faixa | 6.374 | 41 listas | sim, desde que a origem seja um id explícito estável, não o índice do passo | sim, se proveniência for derivada deterministicamente no replay | média: exata, mas `origem:roda; seção:flanco; lado:par` ainda é linguagem técnica | intenção estética que não se reduz a gerador/seção sem uma união de seletores |
| D. predicado geométrico/topológico | 502 comprovados | 6 listas | condicional: mover geometria vizinha muda o resultado | sim para predicado puro; frágil para a intenção | baixa a média: caixa/normal não nomeia a peça | padrões alternados e conjuntos multi-gerador; região do painel já capturou 10 faces extras |
| E. A + B + C mínimos | 6.374 | 41 listas | sim | sim, com origem explícita e seletor salvo | alta quando C recebe nomes B; macroparte A continua útil | conjuntos estéticos genuinamente arbitrários ainda exigem união explícita |

Os 502 de D são a prova já executada: 90 IDs de espelho, 32 de materiais e 380
da parte traseira. Eles não tornam região a solução geral; o painel da terceira
corrida mostrou a falha complementar ao capturar 10 faces antigas.

## Recomendação única

**Recomendo C — proveniência estável de origem com seletor local, enriquecida por
nomes declarados pelo gerador quando existirem.** A menor abstração geral não é
uma operação por objeto, nem uma nova caixa espacial: é cada face conhecer de
qual gerador explícito veio e sua posição local estável (seção, lado e, quando
aplicável, faixa/padrão). A seleção passa a dizer, por exemplo, “o flanco par da
roda” em vez de repetir os IDs que hoje codificam isso por acidente.

Ela resolve mais que a moto porque qualquer gerador de malha com estrutura local
— `loft`, revolução, primitiva ou espelho — pode expor a mesma relação
origem→subparte. Ao contrário de uma tag de peça escrita depois, a relação nasce
no mesmo evento que cria a face e sobrevive à inserção de outra geometria antes
da peça, desde que a origem use identificador explícito estável.

O risco ao formato salvo é real: proveniência não pode virar estado opaco nem
alterar a numeração atual. Ela precisa ser derivável no replay a partir do PASSO
e serializada apenas quando o autor escolher uma seleção por proveniência; peças
legadas com `faces:[…]` devem reabrir byte-idênticas. A superfície de erro é
selecionar uma faixa mal definida ou deixar a origem depender do índice
posicional do passo.

## Menor experimento seguinte

Sem compromisso de implementação: escolher **um único `loft` isolado** de fixture
e provar um seletor de leitura que resolve exatamente uma faixa e seus dois
lados, comparando-o à lista literal já existente. O experimento só vale se:

1. trocar a seleção produzir canônico bit a bit idêntico;
2. inserir uma geometria não relacionada antes do `loft` não mudar os alvos;
3. uma seleção inválida gritar com origem, seletor e causa;
4. `faces:[…]` legado continuar byte-idêntico.

Não deve tocar a moto, nem introduzir predicados espaciais novos, nem tentar
migrar as 41 listas antes da prova de uma única faixa.

## Decisão do ideador

A escolha exigida é de produto/formato: aceitar que a próxima prova investigue
proveniência local estável (C), ou preferir que a linguagem exponha apenas nomes
semânticos declarados por gerador (B). C cobre toda a moto, mas é mais técnica;
B é mais legível, mas deixa ao menos 3.242 referências sem representação exata
na medição atual. Nenhuma implementação é proposta nesta rodada.
