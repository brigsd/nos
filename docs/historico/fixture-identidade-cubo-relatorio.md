# Fixture — identidade estável de cubo

## Escopo

Segunda prova da Fase 2, limitada a `cubo`. Ela estende o mesmo índice efêmero
de origens, `ALIASES`, `sel.alias`, `resolverSelecao`, `executar(...)` e
`colisaoDe(...)` já usados por `loft`; não toca moto, interface, jóias ou outro
gerador.

## Contrato local

Um cubo pode declarar `origemId` e publica seis faces locais:

```js
{ origem: { op: 'cubo', id: 30, face: 'topo' } }
```

Os nomes são `fundo` (-y), `topo` (+y), `tras` (-z), `direita` (+x), `frente`
(+z) e `esquerda` (-x). Eles descrevem a orientação na criação, não câmera ou
mundo: depois de uma rotação, `frente` continua sendo a mesma face estrutural.

## Resultado

O mesmo modelo funcionou no cubo. `origemId` é único entre `cubo` e `loft` no
mesmo índice reconstruído em cada replay; cada registro só expõe seu contrato
local. Não foi criado sistema especial, seletor paralelo nem lista de IDs no
formato salvo.

O alias `topo` seleciona uma única face, sobrevive a inserir geometria antes e
a mudanças de largura, altura ou profundidade. Após rotação de 180° em Y, o
alias `frente` ainda pinta a face que nasceu em +z, mesmo ela passando a estar
em -z no mundo. Uma composição uniu o topo do cubo a uma faixa de `loft` e
atingiu exatamente cinco faces. `executar(...)` devolveu o lote da parte do
topo, e `colisaoDe(...)` por alias coincidiu com a seleção literal sem incluir
um `loft` distante.

Foi encontrada uma brecha: a duplicata só ficava visível quando o segundo
gerador era executado; por isso um alias usado antes dela ainda podia atuar. A
correção faz uma pré-varredura das declarações de `origemId` de cubo e loft
antes de qualquer `PASSO`. Uma identidade repetida já nasce ambígua, com os
passos e geradores declaradores no diagnóstico; `alias` e `sel.origem` direto
falham tanto antes quanto depois da segunda declaração. Operações de outra
identidade continuam normais.

Duplicar `origemId` entre dois cubos ou entre cubo e loft agora grita desde o
início do replay; nenhuma pintura, parte ou transformação é aplicada. Nome de
face inválido, campo extra ou origem de gerador errado gritam. Uma união cujo
loft não existe não aplica parcialmente pintura, `parte` ou transformação.

Loft e cubo também passaram a usar o mesmo protocolo de contratos de origem:
cada contrato valida sua coordenada local e resolve faces pelo registro
efêmero, retornando o próprio diagnóstico quando a coordenada não existe. O
resolvedor comum só localiza o contrato por `op`, valida e pede a resolução. Um
terceiro gerador precisa registrar seu contrato e publicar seus dados locais
com `registraOrigem`; não precisa alterar `resolverSelecao`.

## Revisão adversarial

Passe adversarial solo: a chave do índice foi reduzida a `origemId`, não a
`op:id`, para que cubo e loft não possam coexistir silenciosamente com a mesma
identidade. A pré-varredura fecha a falha temporal: o segundo registro não
precisa mais ser alcançado para invalidar a identidade. A seleção valida o
contrato antes dos PASSOS e limpa os alvos da união quando qualquer termo
falha; os testes travam esses casos, além de confirmar que a face local não
vira uma direção do mundo.

## Veredito

**APROVADO.** O mesmo modelo de origem estável + contrato local + alias
reexecutável funciona para uma primitiva simples, inclusive diante de duplicata
declarada depois do uso, sem estender a sintaxe de produção. A prova ainda não
cobre outros geradores, interface ou operações topológicas.
