/* som.js — áudio 100% sintetizado pro v3 (D-61, porta o D-40/41 da v2: Web
   Audio pura, zero arquivo no repo — dieta D-30 vale pra áudio também). Dois
   canais independentes, mutáveis a 0: AMBIENTE e PASSOS. Nada aqui é um leito
   contínuo — o vento vem em rajadas avulsas com silêncio de verdade entre elas,
   e a água é feita de eventos discretos (bolhas com glissando, lambidas de onda
   na margem). Ruído contínuo filtrado não vira água nem vento: vira chiado, e o
   ouvido reconhece os dois pelos eventos. Passos são síntese granular com corpo
   grave. O contexto só nasce no 1º gesto (política de autoplay). */

/* A PONTE (S5b) — imports NOVOS pro `tocarEvento` reconstruir um evento exportado
   da Oficina (o núcleo em DADOS -> o adaptador Web Audio, o mesmo par das peças-som)
   e tocá-lo no mix. ADITIVO: nada da síntese abaixo depende deles nem muda por causa
   deles; sem chamar `tocarEvento`, este arquivo produz o áudio de sempre. */
import { somNucleo } from './somnucleo.js';
import { construirGrafo } from './somweb.js';

export function criarSom() {
  let AC = null, masterG = null, windG = null, rajadaG = null, turbG = null, mixerG = null, assoBioG = null, ventoLP = null, waterG = null, eventosG = null, passosG = null, noiseBuf = null;
  let ambienteVol = 0.8, passosVol = 0.8;
  // controle de agendamento da água (bolhas/lambidas) e vento
  let waterTimeout = null, ventoTimeout = null;
  let waterScheduled = false;
  let lastWaterDist = 99; // distância da última vez que agendamos

  try {
    const s = JSON.parse(localStorage.getItem('nos3_som') || 'null');
    if (s) { ambienteVol = s.ambiente ?? ambienteVol; passosVol = s.passos ?? passosVol; }
  } catch { /* sem storage: fica no padrão */ }

  /* ruído meio-rosa: a média móvel tira o chiado branco. `k` controla o BRILHO
     — é um filtro de um polo, corte ≈ 151 Hz com k=0.02 e ≈ 1 kHz com k=0.14.
     Normalizamos pelo RMS medido porque k maior aumenta a energia junto com o
     brilho, e sem isso trocar o timbre mudaria o volume. */
  function makeNoise(secs, k = 0.02) {
    const n = Math.floor(AC.sampleRate * secs);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, soma = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + k * w) / (1 + k);
      d[i] = last; soma += last * last;
    }
    const ganho = 0.183 / Math.sqrt(soma / n);   // 0.183 = RMS do buffer original
    for (let i = 0; i < n; i++) d[i] *= ganho;
    return buf;
  }

  /* turbulência: sinal lento (0,25 a 7 Hz) que treme a amplitude do vento.
     Duas exigências que apontam pra mesma solução:
     — createBuffer só aceita taxa de 3000 a 768000 Hz, então não dá pra criar
       um buffer "de 60 Hz" e deixar o navegador esticar; é na taxa do contexto;
     — o buffer TOCA EM LAÇO, e passeio aleatório não fecha onde começou, o que
       daria um degrau de volume a cada volta.
     Somar senoides de frequências INTEIRAS dentro da janela resolve as duas: o
     laço emenda exato, e com fase sorteada e peso 1/c não soa periódico. */
  function makeTurbBuffer(secs = 4) {
    const n = Math.floor(AC.sampleRate * secs);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    let pico = 0;
    for (const c of [1, 2, 3, 5, 8, 13, 21, 29]) {
      const fase = Math.random() * Math.PI * 2, amp = 1 / c;
      for (let i = 0; i < n; i++) d[i] += amp * Math.sin((2 * Math.PI * c * i) / n + fase);
    }
    for (let i = 0; i < n; i++) if (Math.abs(d[i]) > pico) pico = Math.abs(d[i]);
    for (let i = 0; i < n; i++) d[i] /= pico || 1;   // fica em -1..1
    return buf;
  }

  function build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;                        // sem Web Audio: silêncio, sem erro
    AC = new Ctx();
    noiseBuf = makeNoise(5); // um pouco mais longo para os grãos

    masterG = AC.createGain(); masterG.gain.value = 1; masterG.connect(AC.destination);

    /* vento: usa um buffer PRÓPRIO mais claro (k=0.12, corte ~866 Hz) porque
       o buffer padrão já morre em 151 Hz — com
       ele, subir o corte do filtro não clareava nada, não havia agudo na fonte.
       O passa-alta tira o ronco grave, que era o que pesava.

       RECEITA DE MAR: com k=0.14 (corte ~1 kHz) e o passa-baixa em 1400 este
       mesmo trecho vira som de mar, não de vento. Guardado aqui de propósito:
       serve de ambiente pra praia ou ilha sem precisar de mais nenhum nó. */
    const wSrc = AC.createBufferSource(); wSrc.buffer = makeNoise(3, 0.12); wSrc.loop = true;
    const wHP = AC.createBiquadFilter(); wHP.type = 'highpass'; wHP.frequency.value = 150; wHP.Q.value = 0.5;

    /* mixerG: soma os três caminhos do vento (lowpass + duas ressonâncias bandpass) */
    mixerG = AC.createGain(); mixerG.gain.value = 1;

    wSrc.connect(wHP);          // sem isto a fonte fica órfã e não sai vento nenhum

    /* caminho 1: lowpass (base do vento) */
    const wLP = AC.createBiquadFilter(); wLP.type = 'lowpass'; wLP.frequency.value = 1200; wLP.Q.value = 0.5;
    ventoLP = wLP;              // rajada() varre este corte junto com a força
    const gainLP = AC.createGain(); gainLP.gain.value = 0.6; // contribuição RMS
    wHP.connect(wLP); wLP.connect(gainLP); gainLP.connect(mixerG);

    /* caminho 2: ressonância 1 (bandpass) com frequência derivando */
    const bp1 = AC.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 600; bp1.Q.value = 1.8;
    const gainBP1 = AC.createGain(); gainBP1.gain.value = 0.3;
    const lfoBP1 = AC.createOscillator(); lfoBP1.type = 'sine'; lfoBP1.frequency.value = 0.07;
    const lfoBP1Amt = AC.createGain(); lfoBP1Amt.gain.value = 180;
    lfoBP1.connect(lfoBP1Amt); lfoBP1Amt.connect(bp1.frequency);
    wHP.connect(bp1); bp1.connect(gainBP1); gainBP1.connect(mixerG);
    lfoBP1.start();

    /* caminho 3: ressonância 2 (bandpass) em outra faixa, com deriva própria */
    const bp2 = AC.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 900; bp2.Q.value = 2.2;
    const gainBP2 = AC.createGain(); gainBP2.gain.value = 0.3;
    const lfoBP2 = AC.createOscillator(); lfoBP2.type = 'sine'; lfoBP2.frequency.value = 0.05;
    const lfoBP2Amt = AC.createGain(); lfoBP2Amt.gain.value = 250;
    lfoBP2.connect(lfoBP2Amt); lfoBP2Amt.connect(bp2.frequency);
    wHP.connect(bp2); bp2.connect(gainBP2); gainBP2.connect(mixerG);
    lfoBP2.start();

    /* turbulência EM SÉRIE, antes do rajadaG. Somada no mesmo parâmetro da
       rajada, ela tremeria sozinha durante o silêncio, quando o ganho devia ser
       zero; multiplicando, zero continua zero. O sinal é centrado em torno de
       zero (-1..1), então treme pros dois lados: 0.65 a 1.35 do volume. */
    turbG = AC.createGain(); turbG.gain.value = 1;
    const turbSrc = AC.createBufferSource(); turbSrc.buffer = makeTurbBuffer(); turbSrc.loop = true;
    const turbProf = AC.createGain(); turbProf.gain.value = 0.35;
    turbSrc.connect(turbProf); turbProf.connect(turbG.gain);
    turbSrc.start();

    /* rajadaG: envelope principal (meio-cosseno) */
    rajadaG = AC.createGain(); rajadaG.gain.value = 0;

    /* windG: ganho final, sob o volume de ambiente. 0.067 e nao 0.055 porque
       os passa-banda estreitos atenuam: medido em render offline, 8 rajadas de
       cada versao, o numero foi calibrado pra bater a mediana de RMS da versao
       de caminho unico. Mexeu na estrutura do vento? Remeça, nao chute. */
    windG = AC.createGain(); windG.gain.value = 0.067 * ambienteVol;

    /* assobio: NÃO é senoide — senoide vira apito eletrônico. Ar em fresta é
       uma ressonância ESTREITA sobre o próprio ruído, então é um passa-banda
       de Q alto. Entra no mixerG (e não no master) por dois motivos: continua
       sob o volume de ambiente, e ainda passa pelo envelope da rajada. Como a
       curva daqui multiplica a de lá, o assobio só aparece de fato no PICO,
       que é justamente quando a fresta assobia. */
    const bpAss = AC.createBiquadFilter(); bpAss.type = 'bandpass'; bpAss.frequency.value = 1400; bpAss.Q.value = 14;
    assoBioG = AC.createGain(); assoBioG.gain.value = 0;
    wHP.connect(bpAss); bpAss.connect(assoBioG); assoBioG.connect(mixerG);
    const assDrift = AC.createOscillator(); assDrift.type = 'sine'; assDrift.frequency.value = 0.031;
    const assDriftAmt = AC.createGain(); assDriftAmt.gain.value = 380;   // escorrega devagar
    assDrift.connect(assDriftAmt).connect(bpAss.frequency);
    assDrift.start();

    /* encadeamento final: mixerG -> turbG -> rajadaG -> windG -> master */
    mixerG.connect(turbG); turbG.connect(rajadaG); rajadaG.connect(windG); windG.connect(masterG);

    /* ÁGUA: agora eventos discretos. O ruído contínuo é reduzido a um fundo
       muito baixo (highpass+bandpass com ganho 0.05 * ambienteVol) para dar
       a sensação de umidade, mas o que o ouvido identifica como água são
       as bolhas/gotas (glissando ascendente) e lambidas (rajadas curtas de
       ruído com envelope lento). O agendamento é feito por setTimeout,
       reprogramado a cada evento com base na distância atual. */
    // Fundo de ruído baixo (opcional, mantido bem baixo)
    const aSrc = AC.createBufferSource(); aSrc.buffer = noiseBuf; aSrc.loop = true;
    const aHP = AC.createBiquadFilter(); aHP.type = 'highpass'; aHP.frequency.value = 640;
    const aBP = AC.createBiquadFilter(); aBP.type = 'bandpass'; aBP.frequency.value = 1600; aBP.Q.value = 0.6;
    waterG = AC.createGain(); waterG.gain.value = 0; // ganho controlado pela proximidade
    aSrc.connect(aHP).connect(aBP).connect(waterG).connect(masterG);

    /* bolhas e lambidas nascem sob demanda e penduram AQUI, não no master:
       ligadas direto no master, zerar o volume de ambiente não calaria a água */
    eventosG = AC.createGain(); eventosG.gain.value = ambienteVol;
    eventosG.connect(masterG);

    /* passos: canal próprio (cada passo cria seus nós, curtos e descartados) */
    passosG = AC.createGain(); passosG.gain.value = passosVol; passosG.connect(masterG);

    wSrc.start(); aSrc.start();

    // Inicia o agendamento da água se ainda não foi iniciado
    if (!waterScheduled) {
      waterScheduled = true;
      agendarAgua();
    }
    agendarRajada(); // inicia o ciclo do vento
  }

  function ensure() { if (!AC) build(); else if (AC.state === 'suspended') AC.resume(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, ensure, { passive: true }));

  /* ---------- VENTO: rajadas com turbulência, ressonâncias, assobio e farfalhar granular ---------- */
  /* uma rajada: sobe, segura e cai, cada trecho com duração própria. O corte
     do passa-baixa acompanha a força — vento forte é mais claro, não só mais
     alto, e sem isso a rajada soa como alguém girando um botão de volume. */
  function rajada() {
    if (!AC || !rajadaG) return 0;
    const t = AC.currentTime;
    const forca = 0.45 + Math.random() * 0.85;
    /* 1 em 4 entra de repente, como lufada que chega de vereda. A ENTRADA pode
       ser rápida; a saída nunca é — vento sumindo de estalo entrega o truque. */
    const subida = Math.random() < 0.25 ? 0.4 + Math.random() * 0.6 : 1.8 + Math.random() * 3;
    const platô = 0.4 + Math.random() * 2.2;
    const queda = 4 + Math.random() * 5;
    const fim = subida + platô + queda;

    /* meio-cosseno nas duas pontas: a derivada é ZERO no início e no fim, então
       não há canto nenhum pro ouvido pegar, e termina exatamente em zero.
       Antes era setTargetAtTime, que se aproxima do zero sem chegar nele e
       precisava de um corte seco no fim — o corte é que soava abrupto. */
    const N = 256, curva = new Float32Array(N), corte = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * fim;
      let v;
      if (x < subida) v = 0.5 - 0.5 * Math.cos(Math.PI * (x / subida));
      else if (x < subida + platô) v = 1;
      else v = 0.5 + 0.5 * Math.cos(Math.PI * ((x - subida - platô) / queda));
      curva[i] = forca * v;
      corte[i] = 1200 + forca * 650 * v;        // brilho acompanha a força
    }
    rajadaG.gain.cancelScheduledValues(t);
    rajadaG.gain.setValueCurveAtTime(curva, t, fim);
    assoBioG.gain.cancelScheduledValues(t);
    assoBioG.gain.setValueCurveAtTime(curva.map((v) => v * 0.9), t, fim);
    ventoLP.frequency.cancelScheduledValues(t);
    ventoLP.frequency.setValueCurveAtTime(corte, t, fim);

    /* farfalhar: os grãos são AGENDADOS de uma vez, no relógio do áudio. Com
       setInterval seriam ~350 por rajada (um a cada 40ms), e ainda ficariam
       reféns do estrangulamento de timer em aba de fundo. Aqui é um punhado,
       posicionado por sorteio, com o volume lido da própria curva. */
    const nGraos = Math.round(14 + forca * 18);          // 20 a 38
    for (let i = 0; i < nGraos; i++) {
      const dt = Math.random() * fim;
      const v = curva[Math.min(N - 1, Math.floor((dt / fim) * (N - 1)))];
      if (v > 0.05) farfalharGrao(t + dt, 0.5 * v * (0.5 + Math.random() * 0.5));
    }
    return fim;
  }

  /* um grão de farfalhar: ruído agudo, curto, com envelope rápido */
  function farfalharGrao(t0, amp) {
    if (amp <= 0) return;
    const dur = 0.012 + Math.random() * 0.02;
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const off = Math.random() * Math.max(0, noiseBuf.duration - dur - 0.01);
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000 + Math.random() * 2000; bp.Q.value = 2 + Math.random() * 2;
    const g = AC.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    /* entra no mixerG e nao no rajadaG: la ele levaria o envelope de novo,
       e o volume do grao ja sai lido da curva */
    src.connect(bp).connect(g).connect(mixerG);
    src.start(t0, off); src.stop(t0 + dur + 0.01);
  }

  /* espera com CAUDA LONGA: o produto de dois aleatórios concentra os valores
     perto de zero e deixa escapar uma espera bem grande de vez em quando. Uma
     senoide dava rajada em intervalo fixo, e intervalo fixo o ouvido decora. */
  function agendarRajada() {
    const espera = 1.5 + Math.random() * Math.random() * 26;
    ventoTimeout = setTimeout(() => {
      if (!AC) return;
      const dur = rajada();
      setTimeout(agendarRajada, dur * 1000);
    }, espera * 1000);
  }

  /* ---------- ÁGUA: eventos discretos ---------- */
  function bolha(t0, freqBase, amp) {
    // Glissando ascendente: frequência sobe exponencialmente de freqBase para freqBase*2.5
    const dur = 0.06 + Math.random() * 0.08;
    const osc = AC.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqBase, t0);
    osc.frequency.exponentialRampToValueAtTime(freqBase * (2 + Math.random() * 1.5), t0 + dur);
    const g = AC.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(eventosG);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function lambida(t0, amp) {
    // Rajada curta de ruído com envelope lento (subida e descida)
    const dur = 0.15 + Math.random() * 0.25;
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300 + Math.random() * 400;
    const g = AC.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(lp).connect(g).connect(eventosG);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  function agendarAgua() {
    if (!AC) return;
    // Calcula a distância atual (usando a última registrada)
    const dist = lastWaterDist;
    // Densidade de eventos baseada na distância: quanto mais perto, mais eventos
    const k = Math.max(0, Math.min(1, (7.5 - dist) / 6.0)); // mesma curva da proximidade
    // Intervalo médio entre eventos (segundos): de ~0.15s (perto) a ~2.5s (longe)
    const intervalo = 0.15 + (1 - k) * 2.5 + Math.random() * 0.3;
    const amp = 0.14 * k;   // ambienteVol ja e aplicado pelo canal eventosG
    // A cada evento, decidimos se é bolha ou lambida
    const t0 = AC.currentTime;
    if (Math.random() < 0.6) {
      // Bolha
      const freqBase = 300 + Math.random() * 600;
      bolha(t0, freqBase, amp * (0.6 + Math.random() * 0.4));
    } else {
      // Lambida
      lambida(t0, amp * (0.5 + Math.random() * 0.5));
    }
    // Eventos extras se estiver muito perto (rajadas)
    if (k > 0.7 && Math.random() < 0.3) {
      // Dispara uma segunda bolha/lambida com pequeno atraso
      setTimeout(() => {
        if (!AC) return;
        const t1 = AC.currentTime;
        if (Math.random() < 0.5) bolha(t1, 300 + Math.random() * 500, amp * 0.6);
        else lambida(t1, amp * 0.5);
      }, (Math.random() * 0.1) * 1000);
    }
    // Reprograma o próximo evento
    waterTimeout = setTimeout(() => {
      if (AC) agendarAgua();
    }, intervalo * 1000);
  }

  /* ---------- PASSOS: síntese granular com corpo grave ---------- */
  /* receita por superfície: parâmetros granulares para construir a pisada.
     `graos` = número de grãos (impactos micro) na janela.
     `espalhamento` = duração total da janela (segundos).
     `fase2Delay` = atraso da raspagem (segundos).
     `fase2Amp` = amplitude relativa da raspagem.
     `fase2Freq` = multiplicador de frequência para a raspagem (mais aguda).
     `densidade` = 0..1, quanto maior mais concentrado no início (0 = uniforme).
     `corpoAmp` = amplitude do corpo grave (thump) relativa ao pico base.
     `corpoFreq` = frequência central do corpo (lowpass).
     `corpoDur` = duração do corpo.
     `corpoAtaque` = ataque do corpo.
     Os campos de filtro/envelope definem o timbre base de cada grão.
     Pra acrescentar um piso novo, basta uma linha aqui. */
  const PISOS = {
    grama:   { graos: 16, espalhamento: 0.13, fase2Delay: 0.045, fase2Amp: 0.35, fase2Freq: 1.6, densidade: 0.7,
               filtro: 'bandpass', freq: 1800, jitter: 700, q: 0.7, pico: 0.5, ataque: 0.018, dur: 0.06,
               varPico: 0.3, varAtaque: 0.4, varDur: 0.3, varFreq: 0.15,
               corpoAmp: 0.35, corpoFreq: 120, corpoDur: 0.08, corpoAtaque: 0.008 },
    areia:   { graos: 13, espalhamento: 0.11, fase2Delay: 0.040, fase2Amp: 0.30, fase2Freq: 1.5, densidade: 0.6,
               filtro: 'bandpass', freq: 1100, jitter: 500, q: 0.6, pico: 0.4, ataque: 0.025, dur: 0.07,
               varPico: 0.3, varAtaque: 0.4, varDur: 0.3, varFreq: 0.15,
               corpoAmp: 0.30, corpoFreq: 150, corpoDur: 0.07, corpoAtaque: 0.006 },
    madeira: { graos: 7,  espalhamento: 0.06, fase2Delay: 0.030, fase2Amp: 0.20, fase2Freq: 1.3, densidade: 0.8,
               filtro: 'lowpass',  freq: 110,  jitter: 60,  q: 1,   pico: 0.7, ataque: 0.006, dur: 0.03,
               varPico: 0.2, varAtaque: 0.3, varDur: 0.2, varFreq: 0.1,
               corpoAmp: 0.25, corpoFreq: 80, corpoDur: 0.06, corpoAtaque: 0.004 },
    pedra:   { graos: 5,  espalhamento: 0.04, fase2Delay: 0.025, fase2Amp: 0.15, fase2Freq: 1.2, densidade: 0.9,
               filtro: 'lowpass',  freq: 190,  jitter: 70,  q: 1,   pico: 0.7, ataque: 0.004, dur: 0.025,
               varPico: 0.2, varAtaque: 0.3, varDur: 0.2, varFreq: 0.1,
               corpoAmp: 0.25, corpoFreq: 120, corpoDur: 0.04, corpoAtaque: 0.003 },
  };

  /* gestos: modificam a estrutura da pisada (cheia, rasteira, seca).
     Multiplicadores aplicados às amplitudes de corpo, grãos de impacto e raspagem.
     Acentuação (estalo) é sorteada à parte. */
  const GESTOS = {
    cheia:   { corpo: 1.0, graos: 1.0, raspagem: 1.0 },
    rasteira: { corpo: 0.3, graos: 0.6, raspagem: 1.5 },
    seca:    { corpo: 1.3, graos: 0.4, raspagem: 0.2 },
  };

  let lastStep = -1;
  let peDireito = false;   // alterna a cada passo: pisadas reais não são gêmeas
  let ultimoGesto = '', repeticoes = 0;

  /* correndo, quem pisa firme raramente arrasta o pé: a rasteira encolhe e a
     cheia cresce. Com 2 gestos iguais seguidos, o terceiro sorteio EXCLUI
     aquele gesto e renormaliza — sortear de novo até sair diferente
     enviesaria contra o gesto mais provável, justo o que mais cairia na
     repescagem.
     Os pesos abaixo são MAIORES que a proporção desejada de propósito: limitar
     repetição derruba o gesto dominante, então 0.62 sai como ~51% e 0.78 como
     ~59% (medido em 60 mil sorteios). Ajustou um peso? A proporção final não é
     ele, é ele menos o efeito do limite. */
  function escolherGesto(sprint) {
    const pesos = sprint
      ? { cheia: 0.78, rasteira: 0.09, seca: 0.13 }
      : { cheia: 0.62, rasteira: 0.21, seca: 0.17 };
    if (repeticoes >= 2) delete pesos[ultimoGesto];
    const total = Object.values(pesos).reduce((a, b) => a + b, 0);
    let r = Math.random() * total, escolha = Object.keys(pesos)[0];
    for (const [chave, peso] of Object.entries(pesos)) {
      r -= peso;
      if (r < 0) { escolha = chave; break; }
    }
    repeticoes = escolha === ultimoGesto ? repeticoes + 1 : 1;
    ultimoGesto = escolha;
    return escolha;
  }

  /* tempos de início dos grãos em [0, span]. Elevar o aleatório a uma potência
     MAIOR que 1 empurra os valores para perto de zero: a pisada precisa da
     energia no impacto, decaindo depois. Expoente <1 faria o contrário e o
     passo soaria de trás pra frente. */
  function temposGraos(n, span, dens) {
    const ts = [];
    for (let i = 0; i < n; i++) ts.push(Math.pow(Math.random(), 1 + dens * 2.5) * span);
    return ts.sort((a, b) => a - b);
  }

  /* ataque com overshoot e decaimento em dois estágios: a queda reta e curta
     antes da exponencial é o que tira a cara de envelope de sintetizador */
  function aplicarEnvelope(gainNode, t0, pico, ataque, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(pico * 1.15, t0 + ataque * 0.6);
    g.linearRampToValueAtTime(pico * 0.9, t0 + ataque);
    g.linearRampToValueAtTime(pico * 0.3, t0 + ataque + dur * 0.3);
    g.exponentialRampToValueAtTime(0.001, t0 + ataque + dur);
  }

  /* um grão: fatia curta do ruído, filtro próprio e envelope próprio.
     3 nós, todos descartados quando o source para. */
  function grao(p, t0, freq, pico, ataque, dur, q) {
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const off = Math.random() * Math.max(0, noiseBuf.duration - dur - 0.02);
    const f = AC.createBiquadFilter();
    f.type = p.filtro; f.frequency.value = Math.max(20, freq); f.Q.value = q;
    const g = AC.createGain();
    aplicarEnvelope(g, t0, pico, ataque, dur);
    src.connect(f).connect(g).connect(passosG);
    src.start(t0, off); src.stop(t0 + dur + 0.02);
  }

  /* corpo grave: ruído filtrado passa-baixa, com envelope curto, disparado
     uma vez por passo junto com o primeiro grão. Dá o peso da pisada. */
  function corpo(p, t0, amp, freq, ataque, dur) {
    if (amp <= 0) return;
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const off = Math.random() * Math.max(0, noiseBuf.duration - dur - 0.02);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq; lp.Q.value = 1.2;
    const g = AC.createGain();
    aplicarEnvelope(g, t0, amp, ataque, dur);
    src.connect(lp).connect(g).connect(passosG);
    src.start(t0, off); src.stop(t0 + dur + 0.02);
  }

  /* estalo: acento raro, curto e ressonante (graveto quebrando ou pedrinha) */
  function estalo(t0, amp) {
    if (amp <= 0) return;
    const dur = 0.015 + Math.random() * 0.02;
    const freq = 2000 + Math.random() * 3000;
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const off = Math.random() * Math.max(0, noiseBuf.duration - dur - 0.01);
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 10 + Math.random() * 5;
    const g = AC.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(g).connect(passosG);
    src.start(t0, off); src.stop(t0 + dur + 0.01);
  }

  /* jitter de timbre por passo; cadência: chame a cada quadro com o relógio
     do jogo — só soa se >=intervalo mínimo desde o último passo.
     sprint = true reduz o intervalo (corrida) e aumenta a intensidade.
     tipo: chave de PISOS (superfície desconhecida cai em 'grama'). */
  function passo(tSeg, tipo = 'grama', sprint = false) {
    if (!AC || passosVol <= 0 || !noiseBuf) return;
    const intervaloMin = sprint ? 0.18 : 0.34;
    if (tSeg - lastStep < intervaloMin) return;
    lastStep = tSeg;
    peDireito = !peDireito;

    const p = PISOS[tipo] || PISOS.grama;
    const varia = (amp) => 1 + (Math.random() - 0.5) * 2 * amp;

    const gesto = GESTOS[escolherGesto(sprint)];

    // correção para sprint: mais pesado, mais grave, mais seco
    const sPico = sprint ? 1.4 : 1;
    const sAtaque = sprint ? 0.6 : 1;
    const sDur = sprint ? 0.8 : 1;
    const sFreq = sprint ? 0.8 : 1;

    // fator de pé: o pé de trás (peDireito alterna) é ligeiramente mais leve e grave
    const peF = peDireito ? 1 : 0.93;
    const peP = peDireito ? 1 : 0.86;

    const t0 = AC.currentTime;
    const espalhamento = p.espalhamento * sDur;
    const n1 = p.graos, n2 = Math.max(2, Math.floor(n1 * 0.5));

    /* grãos de ruído somam INCOERENTEMENTE: amplitude cresce com √n.
       Dividimos por √n para manter o pico total próximo de 1.0.
       Além disso, cada grão decai ao longo da janela (exp(-2.2*t/span)).
       O corpo grave é adicionado separadamente, com amplitude ajustada. */
    const norma = 1 / Math.sqrt(n1);
    /* pico medido no pior caso (sprint + seca + variação máxima):
       grama: corpo ~0.76, grãos ~0.09, raspagem ~0.02 → potência ~0.77
       areia: ~0.65, madeira: ~0.57, pedra: ~0.56. Acentuação soma em potência até ~0.78.
       Todos abaixo de 1.0. */

    // Corpo
    const corpoAmp = p.corpoAmp * sPico * peP * gesto.corpo * varia(0.2);
    corpo(p, t0, corpoAmp, p.corpoFreq * sFreq * peF, p.corpoAtaque * sAtaque, p.corpoDur * sDur);

    // Calcanhar: impacto (grãos)
    for (const t of temposGraos(n1, espalhamento, p.densidade)) {
      const decai = Math.exp(-2.2 * (t / espalhamento));
      grao(p, t0 + t,
        (p.freq + Math.random() * p.jitter) * sFreq * peF * varia(p.varFreq),
        p.pico * norma * decai * sPico * peP * gesto.graos * varia(p.varPico),
        p.ataque * sAtaque * varia(p.varAtaque),
        p.dur * sDur * varia(p.varDur), p.q);
    }

    // Ponta do pé: raspagem, mais aguda e mais fraca, logo depois do impacto
    const atraso = p.fase2Delay * (sprint ? 0.7 : 1);
    for (const t of temposGraos(n2, espalhamento * 0.6, p.densidade * 0.8)) {
      const decai = Math.exp(-1.6 * (t / (espalhamento * 0.6)));
      grao(p, t0 + t + atraso,
        (p.freq * p.fase2Freq + Math.random() * p.jitter * 0.8) * sFreq * peF * varia(p.varFreq),
        p.pico * p.fase2Amp * norma * decai * sPico * peP * gesto.raspagem * varia(p.varPico),
        p.ataque * sAtaque * 1.2 * varia(p.varAtaque),
        p.dur * sDur * 0.9 * varia(p.varDur), p.q * 0.8);
    }

    // Acentuação rara (~7%, exceto pedra)
    if (tipo !== 'pedra' && Math.random() < 0.07) {
      const ampEstalo = 0.15 * sPico * peP * varia(0.3);
      estalo(t0 + 0.01 + Math.random() * 0.04, ampEstalo);
    }

    /* Pior caso (grama sprint): 16 grãos + 8 grãos de raspagem + 1 corpo + eventual estalo.
       Cada evento usa ~3 nós => ~75 nós por passo, vivos ~0.2s.
       Correndo, um passo a cada 0.18s: ~80 nós simultâneos no pico. */
  }

  /* dist em unidades/tiles até o centro da lagoa; audível a <=from, cheia
     perto da borda, sobe ao longo de `range` (mesma curva do chafariz D-40).
     Além de ajustar o ganho do fundo de ruído, atualiza a distância para o
     agendador de eventos. */
  function proximidadeAgua(dist, from = 7.5, range = 6.0) {
    if (!waterG || !AC) return;
    lastWaterDist = dist; // guarda para o agendador
    const k = Math.max(0, Math.min(1, (from - dist) / range));
    // Fundo de ruído bem baixo (0.05 * k) para dar umidade
    waterG.gain.setTargetAtTime(0.04 * k * ambienteVol, AC.currentTime, 0.4);
    // O agendador ajusta a densidade baseado em k, não precisa fazer mais nada aqui.
  }

  function setVolumes({ ambiente, passos } = {}) {
    if (ambiente !== undefined) {
      ambienteVol = Math.max(0, Math.min(1, ambiente));
      if (windG && AC) windG.gain.setTargetAtTime(0.067 * ambienteVol, AC.currentTime, 0.05);
      if (eventosG && AC) eventosG.gain.setTargetAtTime(ambienteVol, AC.currentTime, 0.05);
    }
    if (passos !== undefined) {
      passosVol = Math.max(0, Math.min(1, passos));
      if (passosG && AC) passosG.gain.setTargetAtTime(passosVol, AC.currentTime, 0.05);
    }
    try { localStorage.setItem('nos3_som', JSON.stringify({ ambiente: ambienteVol, passos: passosVol })); } catch { /* ok */ }
  }

  /* para o agendador quando a página some: aba em segundo plano estrangula
     setTimeout e a água voltaria em rajada ao retomar */
  function destroy() {
    if (waterTimeout) clearTimeout(waterTimeout);
    if (ventoTimeout) clearTimeout(ventoTimeout);
    waterTimeout = null; ventoTimeout = null; waterScheduled = false;
  }

  /* ---------- A PONTE (S5b): tocar um evento da Oficina NO MIX do jogo ----------
     tocarEvento(evento, {quando}) monta o grafo do evento exportado (peça-som:
     {PASSOS, PARAMS, semente}) pelo MESMO núcleo+adaptador das peças e liga a SAÍDA
     no barramento `eventosG` — entra no mix e fica sob o volume de AMBIENTE, NUNCA em
     AC.destination (que furaria o mix). Garante o contexto REUSANDO o `ensure` (a
     mesma init do 1º gesto, sem duplicar nem alterar nada). Devolve o handle do grafo
     ({saida, dur, montados}) pra quem quiser inspecionar; `quando` (s) adia o disparo.
     Puramente ADITIVO: sem esta chamada, a síntese acima roda intocada. */
  function tocarEvento(evento, { quando = 0 } = {}) {
    ensure();
    if (!AC || !eventosG || !evento) return null;
    const g = construirGrafo(somNucleo(evento.PASSOS, evento.PARAMS ?? {}, evento.semente ?? 0), AC, AC.currentTime + quando);
    if (g.saida) g.saida.connect(eventosG);
    return g;
  }

  return {
    ensure, passo, proximidadeAgua, setVolumes,
    volumes: () => ({ ambiente: ambienteVol, passos: passosVol }),
    debug: () => ({ estado: AC?.state || 'sem-contexto', ambiente: ambienteVol, passos: passosVol, waterGain: waterG?.gain.value ?? 0 }),
    destroy,
    tocarEvento,
  };
}
