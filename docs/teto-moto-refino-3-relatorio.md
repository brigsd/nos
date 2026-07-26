# TETO — relatório da 3ª corrida de refino da moto

Artefato: `prototipos/fps/v3/pecas/moto.js`. Esta corrida modifica a peça da
segunda corrida; não a reconstrói nem altera a geometria ou os atributos já
existentes.

## Antes × depois

| eixo | antes | depois |
|---|---:|---:|
| `PASSOS.length` | 58 | 69 |
| vértices / faces | 1376 / 1492 | 1470 / 1600 |
| caixa | 0,658 × 1,082 × 2,844 | 0,658 × 1,082 × 2,844 |
| órfãos | 0 | 0 |
| simetria em x | 0 sem par | 0 sem par |

O refino preserva todos os 58 passos anteriores. Só altera quatro dimensões
existentes (`garfoRc`, `bracoRa`, `bracoRc` e o contorno do para-lama) e acrescenta
11 passos no fim: um painel direito, seu espelho, uma crista central contínua,
duas nomeações exatas e seis atribuições por grupo.

## Mudanças executadas

- O para-lama frontal passa de seção `0,172 × 0,028` para `0,224 × 0,068`;
  ganha largura e 2,43× a espessura, sem mudar sua topologia.
- Os punhos do garfo e do braço reduzem de `0,033 → 0,027` e `0,036 → 0,029`;
  o braço também afina na raiz (`0,030 → 0,027`).
- Um par de painéis laterais ocupa o vazio entre garfo e corpo.
- Uma crista de 48 faces percorre rabeta, assento e tanque, elevando e dando
  forma ao topo sem reemitir o loft do corpo.

## Seleção semântica: o que a prova mostra

Os dois volumes novos são nomeados uma vez por faces exatas: `painelDianteiro`
(60 faces) e `cristaTanqueRabeta` (48). Material, pintura e liso usam
`sel:{grupo:...}`: seis atribuições semânticas passam a acompanhar as partes,
em vez de repetir suas listas.

Uma tentativa de espelhar o painel por `sel.regiao` foi medida antes de entrar:
a caixa espacial selecionava 40 faces — as 30 do painel mais 10 faces antigas
(`2122`, `2123`, `5003`, `20007`, `21030..21035`). Ela foi rejeitada. O espelho
fica com `sel.f` literal das 30 faces do painel, pois essa é a única seleção
exata para a intenção. Assim a peça demonstra semântica onde ela é correta,
sem transformar uma região aproximada em economia artificial de IDs.

## Provas

`npm run criar -- moto`: **APROVADO** — 1470 V, 1600 F, 69 passos, 0 órfãos,
seis críticos limpos e porteiro com frame são (397 cores, dominante 49%, luma
249). Forma permanece **NÃO MEDIDA**: não há gabarito da moto.

Os renders regeneráveis estão em `tools/bancadas/out/criar-moto-{38,0,90}.png`
e `criar-moto-normais-{38,0,90}.png`. O julgamento estético continua sendo do
ideador.
