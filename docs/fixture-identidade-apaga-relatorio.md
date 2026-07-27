# Fixture — identidade estrutural ao apagar

## Objetivo

Provar, somente com um cubo, que apagar uma face estrutural invalida a sua
referência sem ela passar a apontar para outra face.

## Resultado

**APROVADO.** O alias `topo` resolve a face estrutural enquanto ela existe. Ao
executar `['apagaFace', { sel: { alias: 'topo' } }]`, a face deixa o estado
atual. Qualquer uso posterior de `topo`, ou da origem estrutural direta do
topo, grita que a face da origem cubo foi removida.

Não há recálculo por posição, índice ou vizinhança: `topo` não escolhe frente,
fundo, uma face criada depois, nem uma face de outro cubo. Inserir geometria
antes do cubo também não muda isso.

## Provas travadas

- Antes da remoção, `topo` pinta uma única face.
- A remoção usa o resolvedor comum por `sel` e exige exatamente uma face.
- Depois dela, pintar, nomear e transladar `topo` gritam e não mudam a
  geometria; `frente` continua pintável normalmente.
- O alias composto `topoEfrente` falha inteiro quando `topo` foi removido:
  não pinta, nomeia nem translada apenas `frente`.
- A consulta direta `sel:{origem:{op:'cubo',id:70,face:'topo'}}` falha igual.
- A fixture cobre determinismo, round-trip JSON, comparação exata da geometria
  antes/depois das tentativas inválidas e a API pública `executar(...)`.
- O modo legado `['apagaFace',{face:id}]` continua com o mesmo caminho e os
  testes antigos permanecem verdes.

## Mudança mínima

O sistema existente já tinha a propriedade essencial: o resolvedor consultava
a face registrada, e as operações não aplicavam seleção que grita. Não foi
criada lista de partes apagadas, histórico persistente, sintaxe nova de origem
ou resolvedor exclusivo.

Foram feitos apenas dois ajustes: `apagaFace` aceita experimentalmente
`sel:{...}` pelo resolvedor comum, exigindo exatamente uma face; e o contrato
estrutural do cubo verifica se a face registrada ainda está viva para informar
explicitamente que ela foi removida.

## Limite

Esta rodada cobre somente cubo. Espelho, loft, extrusão, fusão, moto e
interface permanecem fora da prova.
