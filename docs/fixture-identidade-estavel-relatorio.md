# Fixture — identidade estável de loft

## Escopo

Prova mínima da Fase 2: somente `loft`, aliases diretos e união de aliases, e transformação sem topologia. Não toca moto, interface, `render.js` ou `motor/som.js`.

## Sintaxe experimental

O envelope passa uma lista, nunca objeto, para detectar duplicatas antes da execução:

```js
ALIASES = [
  ['faixaA', { origem: { op: 'loft', id: 10, faixa: 1 } }],
  ['duasFaixas', { unir: [
    { origem: { op: 'loft', id: 10, faixa: 1 } },
    { origem: { op: 'loft', id: 20, faixa: 2 } },
  ] }],
]
```

É sintaxe experimental, não aprovada para autoria de peças. Os aliases são reconstruídos no replay, aceitam apenas seletores `origem` de `loft` ou `unir` desses seletores, e não aceitam cadeia de alias.

## Resultado

Dois lofts com `origemId` 10 e 20 foram selecionados por alias direto e composto. A união pintou oito faces. Ao inserir um cubo antes dos lofts, as mesmas oito faces locais foram selecionadas, apesar de os IDs posicionais mudarem. `transladar` aplicado ao alias direto não invalidou nem os aliases nem a proveniência. JSON round-trip e duas execuções mantiveram canônico idêntico.

Não existem IDs globais escondidos: `ALIASES` guarda somente origem estável e faixa; o índice de faces continua efêmero em `st.origens`. A fixture não usa índice do PASSO como identidade.

## Falhas explícitas

- alias duplicado: throw antes de executar;
- alias encadeado: órfão e nenhuma pintura;
- origem inexistente: órfão e nenhuma pintura;
- faixa inexistente: órfão e nenhuma pintura;
- origem duplicada: a resolução de origem grita ambiguidade e a operação não aplica resultado parcial.

## Revisão adversarial

Não há despachante de subagente disponível nesta sessão. Foi feito passe adversarial solo sobre o diff: aliases são lista para não perder duplicata por sobrescrita JavaScript; qualquer erro dentro de `unir` limpa os alvos acumulados; a implementação não aceita alias dentro de alias; e a seleção continua sendo resolvida pelo helper único existente. A ausência de revisor dedicado é limitação de processo desta rodada.

## Veredito

**PARCIAL.** A hipótese foi provada para aliases de duas proveniências de `loft` e transformação sem topologia. Ainda não prova outras primitivas, novas origens topológicas, remoção real de faixa nem sintaxe final.
