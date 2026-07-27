# Fixture — identidade estrutural do espelho

> **Experimental.** Esta fixture prova somente `espelha` derivado de uma
> seleção estrutural de cubo. Ela não aprova sintaxe definitiva nem altera a
> moto, a interface ou outros geradores.

## Hipótese e sintaxe

O modo estrutural opcional é aditivo ao espelho legado:

```js
['espelha', {
  eixo: 'x',
  origemId: 50,
  derivaDe: { op: 'cubo', id: 30, face: 'topo' },
  sel: { origem: { op: 'cubo', id: 30, face: 'topo' } },
}]

sel: { origem: {
  op: 'espelha', id: 50,
  de: { op: 'cubo', id: 30, face: 'topo' },
} }
```

`origemId` e `derivaDe` são inseparáveis. No modo estrutural, a fonte precisa
ser exatamente `sel:{origem:derivaDe}`; alias, região, `f`, `v` e
`faces:[ids]` são recusados antes de alocar qualquer cópia. Sem os dois campos,
o espelho legado mantém seu comportamento anterior.

## Resultado da prova

Um cubo de origem 30 foi transladado para `x` positivo e somente seu topo foi
espelhado em `x=0` como origem 50. O topo original e a cópia recebem aliases
distintos. Pintar um não pinta o outro; transladar e depois reutilizar o alias
da cópia alcança a mesma face estrutural já movida; a composição dos dois
alcança exatamente duas faces. Inserir um cubo não relacionado antes dos
passos desloca os IDs posicionais, mas os dois aliases continuam resolvendo as
mesmas partes locais.

A relação é reconstruída no replay num registro efêmero da origem 50:
`Map(faceOriginal, faceCopiada)`. Ela não entra em `PASSOS`, `ALIASES` nem no
canônico. O contrato de `espelha` resolve primeiro `de` pelo resolvedor comum e
só então consulta esse mapa; portanto nunca retorna a face original por engano.

`executar(...)` recebeu `ALIASES` pelo caminho público e `parte` criada pelo
alias da cópia devolveu um lote contendo somente a face copiada, idêntico ao
equivalente literal desta fixture.

## Falhas verificadas

- origem de saída duplicada é conhecida antes do replay e nenhum uso anterior
  pelo alias pinta, nomeia ou translada parcialmente;
- fonte inexistente ou ambígua impede criar a origem derivada;
- `derivaDe` diferente de `sel.origem`, campos únicos sem par e fontes
  literais ou geométricas gritam antes de criar geometria;
- `v`, `f` e `faces` escondidos dentro de `de` são rejeitados pelo contrato;
- se a face-fonte está toda no plano, a origem 50 é registrada sem cópia e uma
  seleção posterior grita explicitamente, sem redirecionar para a original;
- determinismo e round-trip JSON permanecem canonicamente idênticos.

## Contrato comum e veredito

`espelha` entrou em `CONTRATOS_ORIGEM` com `validar(origem)` e
`resolver(st, registro, origem)`, como cubo e loft. O resolvedor central apenas
localiza o contrato e o chama; não ganhou condição específica para espelho.

**APROVADO.** A operação topológica cria uma origem nova, mantém a relação com
a fonte como proveniência reexecutável e separa cópia de original sem IDs
globais escondidos. O limite continua explícito: só há espelho derivado de uma
seleção estrutural direta, nesta fixture de cubo.
