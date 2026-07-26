# Arquitetura — identidade estável de objetos e subpartes

> **Proposta arquitetural, não decisão implementada.** Este documento cumpre a Fase 1 de [`PLANO.md`](PLANO.md): delimita o desenho a provar em fixtures antes de mudar o núcleo, o formato salvo ou a moto.

## Estado atual

Uma peça é um envelope de `PASSOS` reexecutado deterministicamente pelo núcleo. A malha neutra atual usa IDs globais posicionais: o passo no índice `i` recebe o bloco `[i*1000, i*1000+1000)` para vértices e faces. Isso preserva IDs quando só valores dimensionais mudam, mas inserir um passo gerador antes desloca todos os blocos posteriores. Referências inválidas viram órfãos; não podem alterar a malha em silêncio.

`sel` é hoje a semântica única de seleção e une campos: `v`, `f`, `grupo`, `regiao` e, para a fixture limitada, `origem`. Em operações de face, `v` alcança faces incidentes e `regiao` alcança somente faces inteiramente dentro da caixa inclusiva. `faces:[ids]` continua como assinatura legada; misturá-la com `sel` grita por ambiguidade. Seleção inválida, desconhecida, inexistente ou vazia sem no-op documentado também grita.

`parte` atribui um único nome à face (`f.parte`) após ela existir; `grupo` consulta esse atributo. É útil para macro-partes e animação, mas é tardio e hoje depende de uma lista de faces posicionais para nascer. A mesma face só tem uma `parte`: a última atribuição vence.

`sel.origem` é a prova mínima já implementada. Um `loft` pode declarar `origemId`; durante cada replay, o núcleo reconstrói `st.origens` e indexa as faces laterais por faixa e lado. Esse índice é efêmero e não entra no canônico. `sel:{origem:{op:'loft',id,faixa,lado?}}` sobrevive à inserção de geometria antes do `loft`, desde que `origemId` permaneça o mesmo. A prova mostrou equivalência byte a byte com quatro IDs literais e, ao inserir um cubo antes, acertou as faces locais `1008..1011` enquanto o literal antigo precisou ser recalculado.

### Problemas comprovados

- A moto histórica concentrou 6.374 referências literais em 41 listas; 64% do arquivo era IDs de face.
- Seleção por grupo/região resolveu 32 IDs exatos, mas não representa conjuntos visuais descontínuos nem padrões locais sem aproximar a intenção.
- A prova de proveniência local removeu somente 12 IDs na moto e não cobre as demais listas; ela não autoriza uma migração específica da moto.
- Inserir um gerador antes de uma lista literal desloca os IDs; usar índice do passo como identidade repetiria o mesmo defeito.
- Grupos definidos depois da geometria não dão identidade à subparte que gerou as faces; escondê-los como listas de IDs não resolve o acoplamento.

### O que preservar

- `PASSOS` como intenção reexecutável; nenhuma malha assada ou metadado opaco substitui o processo.
- Numeração posicional e `faces:[ids]` para compatibilidade de peças antigas.
- O canônico como prova de replay, round-trip e determinismo.
- A regra fail-closed: órfãos e seleção inválida gritam, sem estado parcial.
- `sel` como ponto único de resolução, em vez de semânticas concorrentes por operação.
- A distinção entre identidade de origem e bloco posicional já demonstrada pela fixture.

## Invariantes obrigatórios

1. **Determinismo:** o mesmo envelope produz a mesma malha, atributos, órfãos e resolução de seleção.
2. **Round-trip:** serializar e reabrir `PASSOS` preserva a intenção e o canônico correspondente.
3. **Estabilidade estrutural:** inserir operações anteriores não altera o alvo de uma referência que usa identidade estável de origem e coordenada local válidas.
4. **Falha explícita:** origem, nome, seletor local, composição ou seleção sem alvo inválidos gritam com operação, referência e causa; não há sucesso silencioso.
5. **Autoria legível:** uma peça nova deve poder falar de aro, flanco, topo ou farol sem exigir que o autor conheça IDs globais.
6. **Legado compatível, não dominante:** passos antigos continuam byte-idênticos; o escape literal não define as abstrações de peças novas.
7. **Uma linguagem:** operações de atributo, transformação e topologia consultam a mesma seleção resolvida, com regras explícitas para seus alvos.
8. **Sem lista escondida:** um nome semântico não pode ser apenas um alias persistido para IDs globais; ele precisa apontar para uma relação reexecutável.

## Conceitos formais

| conceito | definição proposta |
|---|---|
| **objeto** | Envelope salvo de parâmetros, topologia declarada, materiais e `PASSOS`; é reexecutável e contém as declarações de identidade que seus passos usam. |
| **operação / origem** | Um PASSO gerador identificado por um identificador estável declarado pelo autor, único no objeto, e por seu tipo de gerador. A origem reconstrói um índice efêmero de suas saídas locais durante o replay. |
| **parte** | Unidade funcional ou transformável do objeto, potencialmente formada por uma ou mais seleções reexecutáveis. Não é sinônimo de uma lista de faces. |
| **subparte** | Recorte estrutural de uma origem ou de uma parte: por exemplo, faixa 2 de um loft, flanco externo de uma revolução ou metade espelhada. |
| **nome semântico** | Rótulo legível declarado pelo autor que aponta para uma seleção estrutural ou composição de seleções, como `aro`, `flanco` ou `farol`. Ele é uma camada sobre a proveniência, não um segundo sistema de IDs. |
| **coordenada local** | Endereço estável dentro do contrato de um gerador, definido pelo próprio gerador: faixa, lado, seção, tampa, anel, face de primitiva ou lado do espelho. Não é uma coordenada global nem o índice do PASSO. |
| **seleção** | Expressão que resolve, no replay, para vértices e/ou faces existentes. Pode ser literal legada, estrutural por origem, por nome ou geométrica; cada forma declara sua regra de alvo. |
| **composição de seleções** | União explícita e ordenada de seleções. A união remove duplicatas, preserva a ordem canônica de resolução e falha se qualquer termo declarado pelo autor for inválido ou vazio sem no-op documentado. |

Uma seleção estrutural é, portanto, o par **origem estável + coordenada local**. Um nome é uma referência legível a uma ou mais dessas seleções. Uma parte pode usar um nome, mas não muda a origem das faces.

## Alternativas reais

| abordagem | legibilidade | estabilidade | complexidade do núcleo | impacto no formato salvo | edição topológica | generalização / compatibilidade | riscos |
|---|---|---|---|---|---|---|---|
| **A. Proveniência local por gerador** | Média: `origem + faixa + lado` é técnica, porém exata. | Alta para geometria inserida antes; depende do contrato local não mudar. | Incremental: cada gerador expõe sua coordenada local e reconstrói índice efêmero. | Aditivo: origem declarada no passo; índice fora do canônico; literais intactos. | A operação precisa declarar como preserva, deriva ou invalida a proveniência das saídas. | Boa se cada gerador adotar o mesmo protocolo; legado continua literal. | Virar dialetos por gerador; nomes técnicos vazarem à autoria; topologia sem regra explícita. |
| **B. Grafo de entidades/partes estáveis** | Alta em tese: objetos, partes e relações têm nomes próprios. | Alta se entidades forem estáveis e relações forem reexecutáveis. | Alta: novo grafo, ciclo de vida, referência, serialização e resolução além da malha. | Grande: introduz um segundo modelo salvo que deve permanecer coerente com PASSOS. | Pode expressar divisão, fusão e parentesco, mas exige política completa para cada operação. | Ampla, porém migração e compatibilidade ficam complexas. | Duplicar a fonte de verdade, nomes apontarem indiretamente para IDs, ou antecipar uma arquitetura maior que a prova. |
| **C. Híbrido: proveniência estrutural + nomes declarativos + composição** | Alta para autoria: nomes ocultam o detalhe só quando ele existe; o seletor local continua visível e auditável. | Alta: origem explícita e coordenada local não dependem do índice do passo; nomes se resolvem no replay. | Média: protocolo comum de proveniência, tabela de nomes e composição no resolvedor único. | Aditivo e gradual: novas peças declaram origem/nomes; PASSOS antigos mantêm literais. | Cada operação topológica publica uma regra pequena de proveniência; sem regra, invalida e grita em vez de inventar continuidade. | Geral sem exigir que todos os geradores tenham os mesmos seletores; aliases podem nascer depois sobre o mesmo protocolo. | Composição excessiva pode esconder intenção; taxonomia local mal definida pode recriar sistemas incompatíveis. |

### Limite de predicados geométricos

Seleção por região e predicados topológicos é uma quarta ferramenta auxiliar, não uma alternativa suficiente. Ela é adequada quando a intenção é espacial e a caixa é exata, como os 32 IDs de farol e lanterna. Ela falha quando geometria vizinha muda, quando a intenção é alternada/discontínua e quando uma caixa inclui faces extras. Não deve ser promovida a identidade.

## Direção recomendada

**Recomenda-se a alternativa C: proveniência estrutural por origem + coordenada local, enriquecida por nomes declarativos e composição explícita.**

Ela mantém a menor abstração que já foi provada: o gerador sabe, no momento em que cria uma face, qual é seu endereço local. A origem declarada é estável diante de inserção anterior, e o índice de resolução continua reconstruído, determinístico e ausente da malha canônica. Nomes tornam a linguagem humana sem trocar essa relação por listas de IDs; composição cobre uma intenção que abrange origens diferentes sem fingir que é uma única subparte.

Isso é geral porque não nomeia peças da moto nem pressupõe um único gerador. O contrato comum é pequeno: uma origem oferece seletores locais documentados, uma seleção os resolve, e um nome aponta para uma seleção reexecutável. Cada gerador acrescenta apenas a sua coordenada local, não uma arquitetura paralela.

Esta é uma proposta. Ela não aprova sintaxe, altera formato salvo nem decide a política completa de topologia; as fixtures abaixo devem decidir se a hipótese merece implementação.

## Exemplos concretos em PASSOS

Os exemplos são ilustrativos e **não funcionam no núcleo atual**. A sintaxe é apenas um vocabulário coerente para discutir o desenho: `identidade` declara a origem, `nomes` declara aliases reexecutáveis, e `sel` os consulta.

### Declarar origens e nomes

```js
['loft', {
  identidade: 'roda-dianteira',
  lados: 24,
  secoes: [/* ... */],
  nomes: {
    aro: { local: { faixa: 1 } },
    flancoExterno: { local: { faixa: 2, lado: 'externo' } },
    flancoInterno: { local: { faixa: 2, lado: 'interno' } },
  },
}]

['parte', { nome: 'aro', sel: { nome: 'aro' } }]
['pincel', { modo: 'face', sel: { nome: 'flancoExterno' }, cor: '#151515' }]
```

O nome não armazena faces. Ele equivale a uma seleção por origem `roda-dianteira` e seletor local declarado pelo `loft`.

### Selecionar várias faixas e unir origens

```js
['material', {
  usa: 'borracha',
  sel: { unir: [
    { origem: { id: 'roda-dianteira', local: { faixas: [2, 3] } } },
    { origem: { id: 'roda-traseira', local: { faixas: [2, 3] } } },
  ] },
}]
```

Essa união é explícita: duas origens não são fingidas como uma parte local única. Se qualquer termo não resolver, a operação grita e não aplica atributo parcial por acidente.

### Lado interno e externo

```js
['material', {
  usa: 'cromo',
  sel: { origem: { id: 'aro-dianteiro', local: { faixa: 1, lado: 'externo' } } },
}]
```

`externo` só é válido se o contrato daquele gerador define uma orientação local estável. Caso contrário, a fixture deve reprovar a proposta em vez de aceitar uma convenção visual ambígua.

### Mover farol e pintar pneu

```js
['transladar', { d: [0, 0.04, 0], sel: { nome: 'farol' } }]
['pincel', { modo: 'face', sel: { nome: 'pneu-dianteiro' }, cor: '#111111' }]
```

`farol` pode compor duas origens se sua construção precisar; `pneu-dianteiro` pode ser um nome local de uma revolução. Ambos são resolvidos no replay, não por IDs globais salvos no nome.

### Inserir geometria antes e editar depois

```js
['cubo', { identidade: 'suporte-novo', lado: 0.1 }], // inserido depois na lista, antes da roda
['material', { usa: 'metal', sel: { nome: 'aro' } }]
```

O bloco posicional da roda pode mudar, mas `aro` continua apontando para a origem declarada e sua coordenada local. Um PASSO legado com `faces:[...]` não ganha essa garantia e permanece um escape explícito.

## Operações topológicas e identidade

Toda operação que cria ou muda topologia deve dizer qual relação de proveniência produz. A ausência de regra é uma falha de contrato, não licença para copiar IDs globais escondidos.

| operação | regra proposta para identidade |
|---|---|
| **cria faces** | O gerador cria uma nova origem ou publica subpartes locais novas; as faces recebem proveniência derivada dessa origem durante o replay. |
| **divide faces** | A face-filho carrega proveniência derivada da face-pai mais um seletor de divisão local. Se a divisão não tem endereço estável compreensível, a subparte antiga é invalidada explicitamente. |
| **remove faces** | Remove a saída correspondente. Seleções posteriores que exigem a subparte removida resolvem vazio e gritam; nomes não apontam silenciosamente para outra face. |
| **funde vértices** | Não transfere automaticamente pertencimento de faces que não existam; as faces sobreviventes mantêm proveniência. Se a fusão colapsa uma face, vale a regra de remoção. |
| **espelha** | Cria uma origem derivada com relação `espelho(de origem, eixo, lado)` ou publica lado local no mesmo contrato; atributos podem herdar, mas a identidade do lado novo precisa ser selecionável sem enumerar as cópias. |
| **duplica** | Cria uma nova origem com novo identificador declarado, ligada à origem-pai apenas como proveniência histórica. Reutilizar o mesmo identificador é ambíguo e grita. |
| **altera a origem** | Mudança dimensional que preserva o contrato local preserva seletores. Mudança topológica que altera a grade local exige versão/contrato novo ou falha explícita; nunca remapeia por coincidência numérica. |

Essa tabela é uma exigência de implementação futura, não uma promessa de que as operações atuais já atendem a todas as linhas.

## Compatibilidade e migração

1. PASSOS antigos abrem e replayam como hoje; IDs globais e `faces:[ids]` permanecem escape legado.
2. Peças novas podem declarar origens e nomes de forma aditiva. Ausência de declaração não produz índice oculto nem altera o canônico antigo.
3. A migração é opcional quando uma lista literal possui uma expressão estrutural exatamente equivalente, provada por canônico e render quando aplicável.
4. A migração é impossível — e deve permanecer literal — quando a intenção é um conjunto arbitrário, visual descontínuo ou sem coordenada local estável conhecida.
5. Um alias sem seletor estrutural não é migração: é apenas uma lista de IDs escondida e deve ser recusado pelo desenho.
6. Compatibilidade não autoriza usar a numeração posicional como chave da nova identidade; ela só preserva o leitor do formato anterior.

## Fixtures da Fase 2

| fixture | hipótese | mudança adversarial | resultado esperado | critério de reprovação |
|---|---|---|---|---|
| **Origem e faixa** | Uma origem de `loft` com várias faixas resolve exatamente cada faixa e lado. | Inserir um gerador não relacionado antes dela. | A seleção estrutural atinge as mesmas faces locais; o literal antigo falha ou precisa ser recalculado. | A seleção usa índice de PASSO ou muda de alvo silenciosamente. |
| **Nome sem lista** | Um nome declarado sobre uma subparte resolve a mesma seleção estrutural. | Alterar o bloco posicional sem alterar a origem. | Nome continua canônico-equivalente ao seletor estrutural. | O nome serializa IDs globais ou não pode explicar sua origem. |
| **Composição multi-origem** | União de duas origens aplica atributo a ambas, sem duplicata. | Tornar uma origem inexistente ou uma subparte vazia. | A operação grita com o termo causador e não aplica parcialmente sem política declarada. | Uma origem some e a operação parece bem-sucedida. |
| **Orientação local** | Interno/externo ou lado é consistente no gerador que o declara. | Espelhar ou transformar a peça e inserir passo antes. | O contrato local mantém a mesma interpretação documentada. | A seleção muda por orientação global ou depende da câmera. |
| **Topologia derivada** | Uma divisão ou extrusão declara o destino da identidade da face-pai. | Dividir, apagar ou colapsar uma subparte nomeada. | Filhos são selecionáveis por regra derivada, ou a referência grita como inválida. | IDs de filhos são gravados escondidos ou a seleção aponta para vizinho por acidente. |
| **Geradores distintos** | Uma primitiva, `loft`, espelho e uma edição topológica usam o mesmo resolvedor. | Combinar suas seleções numa operação de atributo e transformação. | Uma linguagem comum resolve todos os casos suportados. | Cada gerador exige uma sintaxe/semântica incompatível. |
| **Legado** | `faces:[ids]` não muda com o novo modelo ausente. | Replay, JSON round-trip e seleção literal após novas declarações em outras peças. | Canônico byte-idêntico e mesmos órfãos. | O formato antigo ganha metadado, muda numeração ou deixa de gritar. |

Cada fixture deve incluir determinismo em duas execuções, round-trip JSON, órfãos, canônico, e uma medição visual quando mudar aparência. A Fase 2 reprova o desenho se qualquer fixture pedir regra especial para um objeto específico.

## Perguntas ainda abertas

### Fatos comprovados

- IDs posicionais são estáveis contra alterações dimensionais, não contra inserção anterior.
- `resolverSelecao` já centraliza `v`, `f`, `grupo`, `regiao` e a prova limitada de `origem`.
- Origem explícita de `loft` + faixa/lado é determinística, round-trip estável e não altera o canônico.
- Região é útil em casos espaciais exatos, mas não representa com segurança conjuntos visuais arbitrários.
- A moto não é mais laboratório de migração; é espécime histórico e regressão.

### Decisões propostas neste documento

- Usar o híbrido de proveniência estrutural, nomes declarativos e composição explícita como hipótese de Fase 2.
- Manter nomes como aliases de relações reexecutáveis, nunca de IDs globais.
- Exigir que cada transformação topológica publique regra de preservação, derivação ou invalidação de proveniência.
- Tratar seletor sem contrato local como erro explícito, não como aproximação geométrica implícita.

### Dúvidas não resolvidas

- Qual conjunto mínimo de coordenadas locais cada família de gerador consegue prometer sem criar dialetos incompatíveis?
- `lado interno/externo` é uma propriedade topológica, de orientação local ou um alias de domínio por gerador?
- Como versionar uma alteração legítima de topologia local sem fazer a compatibilidade legada ditar o desenho novo?
- Qual política de composição deve existir se um termo falha: abortar toda a operação, como proposto, ou permitir termos opcionais declarados?
- Qual relação de proveniência é suficiente para `mescla`, `extruda`, `apagaFace`, cópia e espelho sem inflar o formato salvo?
- Nomes devem morar no argumento do gerador, em PASSOS declarativos separados ou em ambos? A resposta depende de qual forma preserva autoria legível sem duplicar fonte de verdade.

Nenhuma dessas perguntas deve ser respondida por nova implementação antes das fixtures pequenas. O próximo ato é revisar esta proposta e escolher o menor experimento que possa reprová-la.
