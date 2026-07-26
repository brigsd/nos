# TETO — medição da seleção semântica na moto

Registro objetivo da correção do bloqueio §4.1 da segunda corrida do TETO:
atributos e espelho não precisarem mais carregar listas enormes de IDs de face.

## Demonstração reproduzível

A prova está em `tools/oficina/oficina.test.ts`, no teste
`medição na moto`. Ele carrega a `pecas/moto.js` atual e troca somente duas
operações `material` por `sel.regiao`, usando caixas calculadas a partir das
faces que elas já atingiam:

| material | antes | depois | ids removidos |
|---|---|---|---:|
| `farol` | `faces:[19040..19059]` | `sel:{regiao:{min,max}}` | 20 |
| `lanterna` | `faces:[2000..2011]` | `sel:{regiao:{min,max}}` | 12 |

Resultado medido: **32 IDs removíveis**, **0 PASSOS a mais ou a menos** e
**forma canônica byte-idêntica**, sem órfãos. No arquivo da moto, o bloco do
farol passa de 3 linhas para 1; a lanterna já ocupava uma linha, mas perde seus
12 literais. Portanto a amostra economiza **2 linhas físicas e 32 IDs** sem
alterar o resultado.

## O que ainda não comprime sozinho

Uma região representa uma caixa espacial e um grupo representa uma parte já
nomeada. Eles não substituem uma intenção descontínua (por exemplo, alternar
faixas de cor numa roda) nem uma classe visual que cruza partes sem uma caixa
exata. Nesses casos, `faces:[ids]` continua sendo o formato legado correto; a
rodada não reescreve a moto nem finge que toda lista pode desaparecer.

## Contrato adotado

Para operações de face, `sel.v` resolve as faces incidentes a qualquer vértice
selecionado e `sel.regiao` resolve apenas faces inteiramente contidas na caixa
inclusiva. Chave desconhecida, grupo/id inexistente, região inválida, mistura de
`faces` com `sel` ou alvo vazio grita no núcleo e não altera parcialmente a
peça.
