# PLANO — evolução da linguagem de criação do NÓS

> **VIGENTE.** Este é o roteiro ativo do NÓS — sessão nova começa por aqui.

Este plano preserva as decisões, fases, critérios de saída e sinais de arquitetura errada que orientam a próxima etapa do NÓS.

## Objetivo final

O NÓS deve permitir que humano e IA criem, compreendam e refinem qualquer tipo de objeto, mundo ou estética, sem ferramentas externas de autoria. O resultado precisa ser:

- nativo;
- editável;
- determinístico;
- versionável;
- mensurável;
- compreensível por significado, não por milhares de números internos.

## Regra de evolução

Sempre seguir:

> criar → medir → identificar o gargalo → implementar uma capacidade geral → provar novamente

Não desenvolver várias capacidades de uma vez. Não criar ferramentas específicas para salvar um único objeto.

## Fase 0 — Encerrar o experimento da moto antiga

**Estado:** a moto atual fica na `main`; ela é um **espécime histórico e teste de regressão**, está congelada e não será mais refinada. Não migraremos seus 6.374 IDs manualmente. A branch que remove apenas 12 IDs não será mesclada.

**Saída desta fase:** moto congelada e foco de volta ao motor.

## Fase 1 — Desenhar a nova identidade dos objetos — concluída

**Objetivo:** definir como objetos, partes e subpartes mantêm identidade estável.

O desenho deve responder:

- como um objeto é identificado;
- como uma operação geradora é identificada;
- como suas partes locais são reencontradas;
- como nomes como aro, flanco ou topo apontam para essas partes;
- como combinar várias seleções;
- como inserir geometria antes sem quebrar referências;
- como manter compatibilidade com peças antigas.

**Direção provável:** identidade estável da origem; coordenadas locais do gerador; nomes semânticos por cima; IDs globais apenas como escape legado.

**Prova de saída:** documento arquitetural e decisão formal, sem implementar tudo ainda. **Concluída:** a hipótese híbrida está registrada em [`arquitetura-identidade-estavel.md`](arquitetura-identidade-estavel.md); a sintaxe ilustrativa não está aprovada.

## Fase 2 — Provar a arquitetura em fixtures pequenas — concluída

Não usar a moto. Criar peças mínimas para testar:

- uma origem;
- várias faixas;
- vários lados;
- união de seleções;
- nomes semânticos;
- inserção de geometria antes;
- edição posterior da forma.

A prova deve mostrar:

- seleção continua correta após mudanças anteriores;
- round-trip e determinismo permanecem;
- nenhuma referência silenciosa;
- a linguagem continua legível;
- não é necessário conhecer IDs globais.

**Critério de saída:** fixtures completas sem regras especiais para um objeto específico.

**Concluída:** as fixtures de `loft` e cubo provaram aliases diretos e multi-origem pela API pública, inserção anterior e transformação sem topologia, sem IDs globais escondidos. As duas formas usam a mesma base de identidade e uma duplicata é detectada antes de qualquer PASSO. A sintaxe segue experimental e não está aprovada como formato definitivo.

## Fase 3 — Validar em mais de um gerador — concluída

A ideia não pode funcionar apenas no `loft`. Aplicar gradualmente a:

- uma primitiva;
- `loft`;
- espelhamento;
- transformação;
- uma operação que modifica topologia.

Cada gerador precisa expor uma coordenada local coerente.

**Critério de parada:** se cada gerador exigir uma arquitetura diferente, parar e redesenhar o modelo central.

**Critério de saída:** uma mesma linguagem de seleção funciona em geradores diferentes.

**Concluída:** `loft`, cubo, transformação, espelhamento e remoção usaram a mesma linguagem de seleção estrutural. A remoção invalida explicitamente a parte, sem redirecionar seu nome, e as seleções compostas falham por inteiro. A sintaxe permanece experimental; moto e interface continuam fora desta prova.

## Fase 3.5 — Fechar as três lacunas de endereçamento — concluída

Fase não prevista, aberta por **medição** sobre a moto congelada: 6.512 ids escritos
à mão, 98% deles dentro de progressões aritméticas cujos passos são os próprios
valores de `TOPO` da peça. As Fases 2/3 não podiam revelar isso — suas fixtures
testam geradores isolados, e as causas só doem em peça real com atributos por cima.

Três causas, três correções (detalhe e prova em D-139):

| causa | % dos ids | correção |
|---|---|---|
| não havia como dizer "tudo" | 77,6% | `sel:{tudo:true}`, explícito — seleção ausente continua gritando |
| não havia como dizer "alternado" | 18,6% | filtro de progressão `{passo,fase}` nos eixos de `sel.origem` |
| grade de dois eixos, um endereçável | 3,8% | `faixa`/`face` opcionais — abre a coluna e a origem inteira |

**Prova de saída, com agente limpo:** `_galho.js` foi de **160 ids à mão para 0**,
com o objeto construído byte-idêntico; uma peça nova (`caixa-ferramentas.js`) nasceu
com **0 ids**. Rede de segurança permanente: `npm run gabarito:selecao:check`, no CI.

**O que a fase descobriu e não resolveu** — é isto que escolhe o trabalho seguinte:

- o gargalo maior não é ENDEREÇAR, é **EXPRESSAR**. O agente limpo não escreveu id
  nenhum, mas travou em (i) o bloco de ids ser `posição-do-passo × 1000` e não
  escolhível — numerar por tipo de peça custou 234 órfãos e recontagem manual a
  cada passo inserido antes; (ii) não existir posicionamento **relativo** ("encosta
  a tampa no topo do corpo") nem expressão entre dois PARAMS num campo de passo;
- `lathe` não registra `sel.origem`, embora seja a mesma família do `loft`;
- não há **intervalo** de faixa (`{de,ate}`), só paridade;
- `pesar` é a única op que ainda não aceita `sel`.

Nada disso vira trabalho por catálogo: a Fase 4 mede e a falha observada escolhe a ordem.

## Fase 4 — Criar uma peça média do zero

Antes da nova moto, criar um objeto menor, mas com partes variadas. Exemplos adequados: capacete; câmera; tênis; drone; cadeira mecânica.

A peça deve nascer sem listas grandes de IDs e depois receber críticas de refinamento.

**Medições:** quantidade de referências globais; tamanho do arquivo; partes nomeadas; alterações realizadas sem regeneração; facilidade de entendimento por outro agente.

**Critério de saída:** um agente limpo consegue criar e outro consegue refinar.

## Fase 5 — Moto nova por imagens de referência

Um agente limpo receberá imagens de uma moto diferente da atual: lateral; frente; traseira; vista 3/4. Ele não poderá ler nem copiar a moto antiga.

A corrida terá duas etapas.

### Criação

Medir: silhueta; proporções; partes obrigatórias; semelhança com as referências; qualidade visual; integridade técnica.

### Refinamento

Você fornece críticas específicas. Medir: se ele edita a peça existente; se precisa regenerar; se partes são localizáveis por significado; se o resultado se aproxima das referências; quais capacidades gerais faltaram.

**Critério de saída:** descobrir o novo teto real da linguagem.

## Fase 6 — Elevar o teto visual

Somente as falhas da moto nova escolherão o próximo trabalho.

Possíveis áreas, sem ordem pré-definida:

- modelagem hard-surface;
- bevel e arredondamento;
- subdivisão;
- cortes e composição sólida;
- espessura e cascas;
- curvas e superfícies;
- materiais mais avançados;
- texturas;
- iluminação;
- renderização;
- métricas visuais por referência.

Uma capacidade por rodada, sempre seguida de nova prova.

## Fase 7 — Oficina para humano e IA

Depois que a linguagem estiver estável:

- expor as capacidades na interface;
- mostrar objetos, partes e subpartes;
- permitir seleção por nome;
- permitir edição de parâmetros;
- mostrar relações entre operações;
- explicar o impacto antes de aplicar;
- registrar tudo em `PASSOS`.

A interface não deve inventar uma segunda linguagem. Ela será apenas outra forma de operar o mesmo núcleo.

## Critérios gerais de sucesso

Uma nova peça deve:

- evitar IDs globais como linguagem principal;
- sobreviver à inserção de operações anteriores;
- permitir que outro agente entenda sua estrutura;
- receber críticas sem ser regenerada inteira;
- manter determinismo e round-trip;
- permitir qualquer estética, sem foco artístico obrigatório.

## Sinais de arquitetura errada

Parar e redesenhar caso:

- cada gerador precise de um sistema incompatível;
- nomes semânticos sejam apenas listas de IDs escondidas;
- editar uma parte continue invalidando o restante;
- a IA precise regenerar arquivos inteiros;
- a representação fique mais complexa que a própria intenção;
- a compatibilidade legada dite toda a arquitetura nova.

## Próximo passo imediato

Iniciar a Fase 4: escolher e criar uma única peça média do zero por um agente limpo, para medir criação e refinamento com a linguagem provada. Ainda sem moto e sem interface; a sintaxe estrutural continua experimental.
