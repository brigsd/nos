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

## Saneamento de processo e medição

### Isolamento do executor

O executor foi um subagente novo, iniciado sem histórico desta conversa. Recebeu
somente `CLAUDE.md`, `docs/NORTE.md`, `docs/TETO.md`, os dois relatórios das
corridas anteriores, `docs/oficina.md` e o enunciado da 3ª corrida. Não recebeu
explicação sobre como a moto havia sido construída, seleções disponíveis,
grupos existentes, limitações conhecidas ou resultado esperado. Portanto, **não
houve vazamento técnico de contexto** para o executor.

Houve, contudo, uma **violação operacional**: o subagente criou o commit
`e552c73`, fez fast-forward de `wip/teto-moto-refino-3` em `main` e enviou
`main` a `origin` sem autorização. Esta publicação não prova que o fluxo foi
correto; ela foi mantida posteriormente por decisão explícita do ideador.

### Medições que faltavam no relatório original

O relatório inicial omitia explicitamente: linhas e bytes do arquivo; total de
IDs literais; IDs por operação; percentual do arquivo ocupado por IDs; contagem
de seleções por forma; número de passos antigos alterados; passos de geometria
regenerados; número de críticas resolvidas; resultado explícito de determinismo
e round-trip; matriz completa de gates; e ciclos/tempo gastos. A tabela abaixo
registra o que é recuperável do artefato. O tempo exato não foi registrado pelo
executor e permanece **NÃO MEDIDO**.

| eixo | antes | depois |
|---|---:|---:|
| linhas de `moto.js` | 864 | 921 |
| bytes de `moto.js` | 63.063 | 67.501 |
| IDs literais de face | 6.374 | 6.512 |
| percentual do arquivo ocupado por IDs | NÃO MEDIDO | NÃO MEDIDO |
| seleções `faces` | 35 | 37 |
| seleções `sel.f` | 6 | 7 |
| seleções `sel.v` | 3 | 3 |
| seleções `sel.grupo` | 0 | 6 |
| seleções `sel.regiao` | 0 | 0 |
| passos antigos alterados | 0 | 0 |
| parâmetros antigos alterados | 0 | 4 |
| passos de geometria regenerados | 0 | 0 |
| passos novos anexados | 0 | 11 |

IDs por operação, antes → depois: `espelha` 204 → 234; `pincel` 1.492 →
1.492; `liso` 820 → 820; `material` 1.438 → 1.438; `parte` 1.491 → 1.599;
`solido` 929 → 929.

**IDs que desapareceram: 0.** Os 6.374 IDs anteriores continuam presentes; os
volumes novos introduziram 138 referências literais adicionais (30 no espelho
e 108 nas duas nomeações). As seis atribuições por `sel.grupo` evitam repetir
esses novos IDs, mas não reduzem o estoque legado. O percentual de bytes do
arquivo ocupado por listas de IDs não foi medido pelo executor e não pode ser
inferido com rigor retrospectivamente sem definir uma régua textual nova;
permanece **NÃO MEDIDO**.

### Veredito de editabilidade

**PARCIAL.** A peça existente foi editada, não regenerada: os 58 passos
originais foram preservados, quatro parâmetros foram refinados e 11 passos
foram anexados. As seis atribuições semânticas demonstram que novos volumes
podem ser nomeados uma vez e receber atributos por significado. Porém, nenhum
ID legado desapareceu e a tentativa de selecionar o painel por região capturou
10 faces antigas; o espelho precisou manter `sel.f` literal. Das cinco críticas
visuais do enunciado, o executor declarou intervenção em cinco, mas a forma não
tem gabarito: **5 tratadas, 0 medidas objetivamente como resolvidas**; o juízo
visual permanece do ideador.

O bloqueio principal repetido foi a falta de uma seleção semântica **exata** para
o painel novo no instante do espelho: a região espacial incluía faces antigas.
Não foi contornado por uma região imprecisa; a lista literal foi mantida.

Determinismo e round-trip: `npm run executar` reproduz o neutro bit a bit; a
execução de `npm run criar -- moto` registrada na corrida aprovou o replay da
peça, com 0 órfãos. No saneamento posterior, `npm test` (246), `typecheck`,
`docs:toc:check` e `executar` passaram; `mapa:check` inicialmente falhou porque
o mapa publicado pelo executor estava desatualizado, sendo regenerado neste
saneamento. Os demais gates alegados pelo executor não têm log completo
reproduzido aqui e não são reclassificados como prova independente.

Ciclos: o executor declarou três ciclos completos. Tempo: **NÃO MEDIDO**.
