# NORTE — objetivo e método do NÓS

Este documento registra o objetivo maior do projeto e o método usado para decidir sua evolução. Ele existe para preservar o contexto entre pessoas, agentes e conversas. O plano de fases, critérios e sinais de parada vigentes está em [`PLANO.md`](PLANO.md) e também é leitura obrigatória antes de propor, planejar ou executar uma rodada.

## Objetivo

O NÓS deve ser capaz de criar nativamente qualquer tipo de experiência, objeto, mundo e direção artística.

Não depende de Blender, modelos 3D externos ou ferramentas externas de autoria.

Não possui uma estética obrigatória. Low-poly, estilizado, realista, hard-surface, orgânico e outras linguagens visuais devem ser resultados possíveis do mesmo sistema.

A ambição não é construir apenas um jogo ou editor. É construir uma linguagem universal de criação digital em que humano e IA sejam usuários nativos.

## Unidade fundamental

Toda criação deve ser:

- estruturada;
- determinística;
- reproduzível;
- versionável;
- mensurável;
- reaberta e modificada;
- compreensível por humano e IA.

O artefato salvo é a intenção e seu processo, não apenas o resultado final.

`PASSOS` é a base atual dessa linguagem. Malha pronta ou geometria escondida em JavaScript não substituem uma representação editável.

## Princípio central

O projeto evolui por falha observada, não por listas especulativas de funcionalidades.

Ciclo obrigatório:

1. Criar ou refinar algo real.
2. Medir o resultado.
3. Identificar o bloqueio mais repetido e geral.
4. Implementar a menor capacidade geral que o resolve.
5. Repetir o desafio e verificar se o teto subiu.

Não criar operações específicas para um único objeto quando uma capacidade geral resolver a classe inteira de problemas.

## O que significa elevar o teto

Existem dois tetos diferentes:

### Teto de criação

Capacidade de produzir algo novo a partir de uma intenção.

### Teto de refinamento

Capacidade de receber uma crítica e modificar o artefato existente sem regenerá-lo inteiro, perder sua semântica ou reescrever milhares de identificadores.

Reconhecível não significa bom. Passar gates técnicos não substitui julgamento estético do ideador.

## Direção técnica

A linguagem deve crescer em capacidades gerais e combináveis:

- topologia;
- seleção;
- transformação;
- deformação;
- superfícies e curvas;
- composição sólida;
- materiais e aparência;
- iluminação e renderização;
- semântica, relações e parâmetros;
- medição e percepção do próprio resultado.

Nenhuma dessas categorias define uma estética. Elas aumentam o espaço de criação possível.

## Semântica é parte da geometria

Uma criação complexa precisa poder nomear e reencontrar suas partes.

A IA deve conseguir expressar ações como:

- mover o farol;
- afinar a rabeta;
- pintar o pneu;
- trocar o material do aro;
- espelhar o garfo;
- aumentar o tanque.

Listas enormes de IDs posicionais são sinal de teto baixo, mesmo quando o resultado visual funciona.

Referências inválidas, seleções vazias involuntárias e argumentos ignorados devem gritar. Silêncio não é sucesso.

## Provas

Não confiar apenas em aparência nem apenas em testes técnicos.

Usar, quando aplicável:

- testes e typecheck;
- determinismo e round-trip;
- integridade de malha;
- críticos objetivos;
- métricas geométricas;
- renders regeneráveis;
- comparação antes/depois;
- julgamento explícito do ideador.

Quando não existe uma regra válida, registrar `NÃO MEDIDO` ou `JULGAMENTO DO IDEADOR`. Não inventar precisão.

## Papéis

### Ideador

Define a ambição, fornece críticas e julga o resultado visual e de produto.

### Planejador

Lê as evidências, escolhe o próximo experimento e limita o escopo. Não executa por impulso nem agenda pacotes especulativos.

### Executor

Implementa exatamente a rodada escolhida, mede, documenta e apresenta achados. Não amplia o escopo sem evidência ou autorização.

O repositório é a memória compartilhada entre os três.

## Regra de trabalho

Uma rodada deve ter:

- um objetivo principal;
- uma hipótese clara;
- critério de pronto;
- critério de parada;
- provas executáveis;
- relatório curto dos achados;
- decisão seguinte baseada no resultado.

Não misturar várias capacidades novas na mesma rodada, salvo quando forem inseparáveis para provar uma única hipótese.

## Estado atual

A moto provou criação nativa em `PASSOS` e revelou que o teto de refinamento continua inferior ao teto de criação. Seleção semântica e proveniência local foram provadas em escala mínima, mas a sintaxe mínima de proveniência resolveu apenas 12 IDs e não cobriu as outras listas da moto.

A moto atual está congelada como espécime histórico e teste de regressão. Não haverá nova migração nem refinamento nela. A Fase 1 foi concluída: a arquitetura híbrida de origem estável, coordenada local, aliases no objeto e composição foi escolhida como hipótese para prova. A primeira fixture da Fase 2 foi aprovada para aliases diretos e multi-origem de `loft`, inclusive pela API pública, inserção anterior e transformação sem topologia; a fase continua em andamento. O próximo passo é provar o mesmo modelo em uma primitiva simples, sem testar a moto, a interface ou operações topológicas.

## Não negociáveis

- Sem dependência de ferramentas externas de autoria.
- Sem modelo 3D externo como solução para o teto nativo.
- Sem estética obrigatória.
- Sem geometria opaca quando ela deveria ser editável.
- Sem no-op silencioso.
- Sem aleatoriedade ou tempo não controlados.
- Sem planejar longas sequências de features antes da próxima prova real.
- Sem confundir “consigo gerar” com “consigo compreender e refinar”.

## Pergunta permanente

A cada mudança, perguntar:

> Isto aumenta uma capacidade geral da linguagem ou apenas contorna o objeto atual?

A primeira opção eleva o NÓS. A segunda exige justificativa e normalmente deve ser rejeitada.
