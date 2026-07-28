# Relatório de criação — drone-inspecao

Peça criada do zero na branch `wip/fase4-drone-inspecao`, sem ler, copiar ou adaptar a moto antiga. O artefato usa `PASSOS` reexecutáveis e mantém a geometria fora de JavaScript assado.

## Resultado visual direto

Em vista 3/4, a silhueta lê como um drone quadricóptero compacto: corpo central baixo e largo, tampa superior laranja, quatro braços diagonais, quatro conjuntos de rotor com duas pás visíveis, câmera azulada na frente e dois apoios de pouso. A frente é identificada pela câmera e pelo suporte laranja; a traseira fica limpa e mais curta visualmente.

O render 3/4 foi observado em `tools/bancadas/out/criar-drone-inspecao-38.png`. O comando `criar` produziu frame saudável, mas não aprovou a peça porque os críticos de arte encontraram banding e desvio sutil de paleta. Isso é uma limitação visual registrada, não sucesso visual presumido.

## Métricas do artefato

| Medição | Resultado |
|---|---:|
| PASSOS | 92 |
| Linhas do arquivo | 203 |
| Bytes UTF-8 | 14.010 |
| Origens estruturais declaradas | 20 |
| Nomes `parte` únicos | 22 |
| Aliases estruturais declarados | 23 |
| Referências literais a IDs de vértices/faces | 0 |
| Maior lista estrutural | 56 seletores diretos, sem IDs globais de vértices/faces |
| Vértices finais | 218 |
| Faces finais | 169 |
| Órfãos | 0 |

As contagens de linhas e bytes são do arquivo final. As referências `origem:{op,id,face/faixa}` são seletores estruturais, não listas literais de vértices ou faces. O arquivo exporta `PARAMS`, `TOPO`, `PASSOS`, `ALIASES`, `meta` e `construir`.

### Fidelidade dos nomes agregados

Os grupos individuais continuam sendo `parte` de uma única origem de face: `corpo`, `tampaBateria`, os quatro braços, os quatro hubs (`rotorDianteiroDireito`, `rotorDianteiroEsquerdo`, `rotorTraseiroDireito`, `rotorTraseiroEsquerdo`), as oito pás (`pala...`), `suporteCamera`, `camera`, `lente` e `pouso`. Não há mais `parte` chamado `rotoresDianteiros` ou `rotoresTraseiros`.

Os três nomes agregados são aliases declarativos, sem encadeamento: `rotoresDianteiros` resolve 36 faces (hubs 108/109 e pás 116–119), `rotoresTraseiros` resolve 36 faces (hubs 110/111 e pás 120–123) e `detalhesLaranja` resolve 62 faces (tampa 102, as duas faixas do loft 112 e pás 116–123). A medição foi feita com cópias temporárias de `PASSOS` pela API pública. A interseção de faces entre dianteiros e traseiros foi 0; `detalhesLaranja` e `camera` também tiveram interseção 0.

## Editabilidade para o próximo agente

Partes editáveis por `grupo` incluem `corpo`, `tampaBateria`, os quatro braços (`bracoDianteiroDireito`, `bracoDianteiroEsquerdo`, `bracoTraseiroDireito`, `bracoTraseiroEsquerdo`), quatro hubs de rotor, oito pás, `suporteCamera`, `camera`, `lente` e `pouso`. Os aliases exportados acrescentam `detalhesLaranja`, `rotoresDianteiros` e `rotoresTraseiros` como seleções agregadas de faces inteiras.

Parâmetros claros preparados para refinamento: `larguraCorpo`, `comprimentoBracos`, `alturaCorpo`, `tamanhoRotores`, `avancoCamera`, `corPrincipal` e `corDestaque`, além de espessuras, afastamentos e dimensões da lente. O próximo agente pode engrossar braços, aumentar rotores, mover a câmera ou trocar o destaque alterando esses donos dimensionais/de aparência, sem reescrever a peça.

## Três qualidades visuais

1. A leitura 3/4 é imediata pela combinação da tampa, câmera frontal e quatro braços simétricos.
2. O contraste grafite/laranja separa corpo, pás, tampa e suporte sem introduzir cores em excesso.
3. O uso de `chamferBox`, `loft`, transformações e espelhamento dá uma linguagem técnica coerente, com apoios e câmera integrados ao volume central.

## Três limitações visuais

1. Os hubs de rotor são cubos técnicos, não cilindros: o motor atual não publica `origemId` para `cilindro`, e a peça priorizou editabilidade estrutural sem alterar o motor.
2. Os braços e pás ainda têm quinas muito ortogonais e pouca variação de perfil; falta um arredondamento/bevel geral para subir o acabamento hard-surface.
3. O crítico `detector-de-banding` acusa faixas chapadas nos lotes de pintura e `distancia-paleta` acusa desvio sutil em tons renderizados. O primeiro é consequência da pintura chapada por face/atlas atual; não foi criada uma operação nova para contornar um único objeto.

## Bloqueios gerais

O comando `criar` não encaminha `ALIASES` ao seu diagnóstico headless, embora `construir` e `colisaoDe` aceitem a tabela. Por isso as operações da peça usam `parte`/`grupo` e seleções estruturais diretas; aliases ficam exportados como metadado útil para o refinamento. Não foi alterado `motor/oficina.js` nem a bancada.

Não foi criado gabarito numérico de silhueta: não havia referência visual fornecida para a peça. O próprio `criar` registra esse eixo como não medido; o reconhecimento foi julgamento visual explícito da imagem 3/4.

## Veredito

**PARCIAL.** A peça é tecnicamente reexecutável, determinística, sem órfãos, com nomes e parâmetros editáveis, e visualmente reconhecível como drone. O veredito não é APROVADO porque os críticos objetivos acusam banding/desvio de paleta e a silhueta não tem gabarito numérico.

## Validação

- Determinismo e replay: `npm run executar`.
- Round-trip: exercitado pela bancada `npm run oficina` e pelos testes do núcleo.
- Integridade: 218 vértices, 169 faces, 0 órfãos.
- Enquadramento: `porteiro` abriu a peça com frame saudável; `criar` mediu 195 cores, dominante 47% e luma 248.
- Reconhecimento 3/4: confirmado por inspeção da imagem `criar-drone-inspecao-38.png`; gabarito formal não medido.
- Jóias: `render.js` e `motor/som.js` não foram alterados.
- Peças existentes: regressão da moto e jogo incluídos na matriz de gates da rodada.
