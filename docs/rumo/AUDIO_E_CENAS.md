# Áudio e cenas — música, voz e cutscenes (direção)

Documento de direção, não spec. Nada construído ainda. Registra a abordagem e,
principalmente, o que precisa ser decidido cedo pra não virar retrabalho.

## Princípio: código/dados, não arquivo

O jogo já sintetiza todo o áudio em código (`motor/som.js`, zero arquivo de
som). Música, voz e cutscene seguem a mesma regra. As versões em arquivo
(música gravada, voz gravada, vídeo) quebram a dieta zero-arquivo e incham o
repositório federado — ficam como exceção deliberada, não como padrão.

## Música

- **Sequência como dado** — notas e padrões num arquivo pequeno, tocados por um
  sintetizador de código. Controlável e zero-arquivo. É a camada de sequência
  por cima do sistema de som (a Aba Som cuida de eventos; música é a sequência).
- **Generativa** — o algoritmo cria as notas dentro de regras. Complementa.

## Voz e falas

Duas coisas diferentes:
- **Falas (texto)** — sistema de diálogo: texto no repositório, caixa de fala,
  ramificação, retratos (sprites por código). Zero-arquivo, padrão de jogo.
- **Voz (falada)** — recomendação: **blips sintetizados por personagem** (um
  timbre próprio tocando enquanto o texto aparece, estilo Animal Crossing /
  Undertale). Alternativa: a voz embutida do navegador (API de fala) lê o texto
  — zero-arquivo, mas robótica e dependente do aparelho. Voz gravada ou gerada
  por IA em arquivo é exceção deliberada.

## Cutscenes

Não é vídeo (arquivo enorme e não-diffável — o mesmo problema de binário vs
texto que o resto do projeto evita). É um **roteiro**: uma linha do tempo de
instruções (mover a câmera, tocar uma animação, mostrar uma fala, tocar uma
música) executada ao vivo pelo motor. Junta sistemas que já existem ou estão
planejados (câmera livre, animação, diálogo, música), então vem **depois** deles
— é o integrador, não um recurso pesado próprio.

## O teto de qualidade do áudio

Áudio em código não está preso em chiptune — o teto é a técnica de síntese, não
o formato. Sem nenhum arquivo de áudio, dá pra subir com:

- **FM** (timbres ricos e expressivos), **modelagem física** (som de instrumento
  real a partir de matemática — corda dedilhada, sino, tubo soprado),
  **wavetable**;
- **efeitos por código** — reverberação (de um impulso gerado por código),
  delay, chorus, equalização. É o maior salto de qualidade percebida;
- **AudioWorklet** — escrever qualquer processamento de áudio no nível da
  amostra; tira o teto quando os blocos prontos não bastam.

Isso chega em "trilha sintetizada de qualidade de jogo bom", bem acima de
chiptune. A única fronteira são **samples** (trechos gravados de instrumento
real): isso é dado de áudio, e é a exceção à dieta.

**POSSIBILIDADE (não roadmap):** wavetables e formas de onda de ciclo único
guardadas como pequenos vetores de dados (poucos KB) — uma zona cinza entre
"dado" e "arquivo de áudio" que sobe a riqueza mais um degrau. Fica disponível
se um dia valer, sem estar no plano.

## Reservar espaço agora (pra não ser retrabalho)

Preocupação do ideador, e é válida: construir a qualidade "quando precisar", em
cima de um sistema de som já pronto, pode forçar reescrita. O conserto é o mesmo
do envelope — decidir a **arquitetura** cedo (barato agora), mesmo construindo
as técnicas depois:

- Um **"voz/instrumento" é uma unidade trocável** — oscilador simples hoje; FM,
  modelagem física ou AudioWorklet depois, sem mexer no resto.
- O caminho do sinal tem um **slot de efeitos** (envio para reverb/delay) desde o
  começo — plugar reverb depois não re-fia tudo.

Com esses dois reservados, subir a qualidade é **aditivo**, não reescrita. O que
nasce sob necessidade são as técnicas; a estrutura que as acolhe nasce cedo.

## Quando

Os três dependem de fundações (o sintetizador, a animação, o diálogo) e não são
necessários agora. Nascem quando o jogo precisar — mas com a arquitetura acima
já reservada, pra que "nascer depois" seja acréscimo, não retrabalho.
