# Fixture de proveniência local de loft

## Objetivo

Provar uma seleção estável por gerador + coordenada local sem gravar metadado na
malha canônica e sem depender do índice do PASSO.

## Contrato mínimo

Um `loft` pode declarar uma identidade estável aditiva:

```js
['loft', { id: 0, origemId: 1000, lados: 4, secoes: [...] }]
['pincel', { modo: 'face', cor: '#123456',
  sel: { origem: { op: 'loft', id: 1000, faixa: 2 } } }]
```

`faixa:2` escolhe as faces laterais entre as seções 2 e 3; `lado:1` restringe
ao lado local 1. Ambos são zero-based. Não há seleção de tampas. `origemId`
não é a numeração posicional `id` do PASSO: ele é registrado em `st.origens`,
índice efêmero reconstruído a cada `nucleo` e ausente do resultado canônico.

## Prova medida

Com quatro seções e quatro lados, a faixa 2 produz as faces `8..11`.
`faces:[8,9,10,11]` e a seleção por origem têm canônico byte-idêntico. Ao
inserir um cubo antes do loft, a mesma seleção por origem pinta exatamente as
faces locais `1008..1011`; o literal antigo `8..11` deixa de existir e grita.
Recalculado para `1008..1011`, o literal volta a ser byte-idêntico ao resultado
por origem. A lista salva antiga não foi alterada.

## Falhas explícitas cobertas

Origem inexistente, `op` desconhecida, faixa/lado fora do limite, chave
desconhecida, objeto vazio e duas declarações com o mesmo `origemId` gritam e
não pintam. Round-trip JSON e duas execuções do mesmo PASSO permanecem
determinísticos. `rotaciona`, `transladar`, `grupo` e `faces:[ids]` legados
continuam cobertos pela mesma bateria.

## Limite e risco

A fixture só indexa faces laterais de `loft`. A convenção local de outra
primitiva precisa ser provada antes de ser exposta; usar seu cursor global ou
índice de PASSO repetiria a fragilidade que esta fixture elimina. `origemId`
duplicado é ambíguo de propósito e grita — não há desempate implícito.
