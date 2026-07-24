# O Playground — o épico da criação por IA

O objetivo: um ambiente onde a IA cria conteúdo de verdade — **"a IA modelou a
moto do Tron, um dragão, um navio" dentro do estilo do jogo** — sem sair do
formato de PASSOS. Não é uma ferramenta nova: é fechar o vocabulário da Oficina
+ uma camada de dado/veredito por cima dela. Nasceu do debate de 2026-07-24
(D-113); as specs de cada op moram em `docs/oficina.md` ("Lista de operações").

## As regras do épico (valem pra toda frente)

1. **O formato é sagrado.** Tudo emite PASSOS; nada de malha assada. O
   `construir(ctx)` JS-puro segue como *fallback que encolhe* — cada op nova
   rouba um caso dele. Cair nele = sinal de qual op construir em seguida.
2. **Núcleo primeiro, interface depois.** Uma op nova entra no `motor/oficina.js`
   + testes + doc; o botão na Oficina é onda separada. (Peça com a op nova já
   REABRE na Oficina — o `executar` roda a lista; só não tem botão de criar.)
3. **Número + VEREDITO + evidência.** Ferramenta de medir devolve
   `APROVADO/REPROVADO` (exit≠0) com limiar CALIBRADO (exemplos bons × defeitos
   plantados, o método do `bench`/D-60) e o render junto — nunca uma nota crua
   pra IA interpretar (a lição dos "83%": nota sem régua convida leitura
   otimista). Sentidos independentes têm que concordar (número + imagem +
   geometria); "está bom" continua sendo do ideador.
4. **Numeração é formato salvo.** Toda op nova documenta a numeração de
   vértice/face no cabeçalho + em `docs/oficina.md`, travada por teste — depois
   de shipada, NUNCA muda (peça salva depende dela). Revisor adversarial em
   toda op (é formato salvo por definição).
5. **A cada op entregue:** marcar aqui `[x]`, atualizar a tabela do
   `docs/oficina.md` e o vocabulário da skill `criar-peca`, registrar D-nº.

## Ordem de construção

- [x] **P0 · Este roteiro** (D-113).
- [x] **P1 · Primitivas que faltam** — `esfera`, `cone`, `plano` no núcleo.
      Winding/tampas consistentes com cubo/cilindro (normal pra fora); guarda de
      overflow do bloco; numeração documentada+testada. Peça-exemplo
      `pecas/_primitivas.js`; specs na tabela do `docs/oficina.md`.
- [x] **P2 · `lathe`** (perfil `[[raio,y],...]` rotacionado → vaso, coluna,
      roda) no núcleo. O FORMATO do perfil nasceu aqui — com alça de curva
      RESERVADA desde já (um ponto de 2 elementos é reto pra sempre; um 3º
      elemento GRITA em vez de mudar de figura sozinho quando a curva chegar —
      "Aba Desenho" no oficina.md). Generaliza o esquema da esfera (que É um
      lathe de meia-circunferência); winding/numeração travados por teste;
      guarda de overflow do bloco. Peça-exemplo `pecas/_torno.js` (peão de
      xadrez, fechado nas duas pontas por polo — watertight, provado por
      manifold).
- [x] **P3 · `espelha` + `rotaciona`** — simetria bilateral (metade → inteiro)
      e rotação de seleção. Destrava qualquer objeto simétrico (veículo, corpo).
      `espelha` DUPLICA a seleção refletida (ids novos do bloco, formato salvo)
      com WELD automático (vértice exatamente no plano é compartilhado — o
      mesmo teste de igualdade exata do polo do lathe) e winding revertido
      (mantém a normal pra fora); `rotaciona` só desloca posição (nunca cria
      id). Guarda de overflow (D3) independente pra vértice-novo/face-nova.
      Peça-exemplo `pecas/_espelhado.js` (cabeça com par de chifres, watertight
      — costura soldada provada por manifold). Specs na tabela do
      `docs/oficina.md` e no vocabulário da skill `criar-peca`.
- [ ] **P4 · `loft`** (seções ao longo de um caminho → casco, corpo, galho).
- [ ] **P5 · Contorno como DADO + gabarito IoU** — o formato do contorno
      fechado (pontos, alça reservada) + a bancada que mede silhueta renderizada
      × contorno de referência em N ângulos e devolve VEREDITO calibrado.
      Forma vira número. (O canvas da Aba Desenho — a UI — fica pra onda de
      interface.)
- [ ] **P6 · `inflate`** (contorno de lado + de cima → volume; come o P5).
- [ ] **P7 · A camada IA — laço único** — uma bancada `criar` que recebe a
      peça e devolve NUM comando: estado como dado (tabela de vértices/faces,
      caixa, medidas), os renders (3 ângulos + geo), os gates
      (auditar/porteiro/IoU se houver gabarito) e o VEREDITO agregado. O
      manifesto de capacidades (ops + limites) sai do próprio núcleo.
- [ ] **P8 · Edição restante** — `moveF`/`moveA`, `vira`, `apagaFace`,
      seleção por região/grupo, `chamferBox`, `displace` (com semente).
- [ ] **P9 · Onda de interface** — os botões da Oficina pras ops novas + o
      canvas da Aba Desenho (specs no oficina.md).

## A régua de pronto

- **P1–P4 prontos:** uma moto estilizada sai por PASSOS (espelho + lathe/loft +
  emissivo, que já existe).
- **P5–P7 prontos:** a forma é MEDIDA (IoU com veredito) e o laço é um comando
  — o "83%" fica impossível por construção.
- **Épico pronto:** a moto do Tron impecável de ponta a ponta sem sair do
  formato. O dragão é a régua do capítulo seguinte (esqueleto/skinning/keyframes
  JÁ existem — falta só a carne orgânica: loft na espinha + inflate).
