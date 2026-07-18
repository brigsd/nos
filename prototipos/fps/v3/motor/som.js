/* som.js — áudio 100% sintetizado pro v3 (D-61, porta o D-40/41 da v2: Web
   Audio pura, zero arquivo no repo — dieta D-30 vale pra áudio também). Dois
   canais independentes, mutáveis a 0: AMBIENTE (vento constante + água por
   proximidade da lagoa, a mesma receita da v2) e PASSOS (novo — thump grave
   filtrado, cadência por movimento, jitter de tom por passo pra não soar
   metrônomo). O contexto só nasce no 1º gesto (política de autoplay). */

export function criarSom() {
  let AC = null, masterG = null, windG = null, waterG = null, passosG = null, noiseBuf = null;
  let ambienteVol = 0.8, passosVol = 0.8;
  try {
    const s = JSON.parse(localStorage.getItem('nos3_som') || 'null');
    if (s) { ambienteVol = s.ambiente ?? ambienteVol; passosVol = s.passos ?? passosVol; }
  } catch { /* sem storage: fica no padrão */ }

  function makeNoise(secs) {                 // ruído meio-rosa (média móvel tira o chiado branco)
    const n = Math.floor(AC.sampleRate * secs);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    return buf;
  }

  function build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;                        // sem Web Audio: silêncio, sem erro
    AC = new Ctx();
    noiseBuf = makeNoise(3);

    masterG = AC.createGain(); masterG.gain.value = 1; masterG.connect(AC.destination);

    /* vento: ruído grave (lowpass) com rajada lenta — a "sala" constante do mundo */
    const wSrc = AC.createBufferSource(); wSrc.buffer = noiseBuf; wSrc.loop = true;
    const wLP = AC.createBiquadFilter(); wLP.type = 'lowpass'; wLP.frequency.value = 430; wLP.Q.value = 0.5;
    windG = AC.createGain(); windG.gain.value = 0.045 * ambienteVol;
    wSrc.connect(wLP).connect(windG).connect(masterG);
    const gust = AC.createOscillator(); gust.type = 'sine'; gust.frequency.value = 0.08;
    const gustAmt = AC.createGain(); gustAmt.gain.value = 0.025 * ambienteVol;
    gust.connect(gustAmt).connect(windG.gain);
    const gust2 = AC.createOscillator(); gust2.type = 'sine'; gust2.frequency.value = 0.043;
    const gust2Amt = AC.createGain(); gust2Amt.gain.value = 130;
    gust2.connect(gust2Amt).connect(wLP.frequency);

    /* água: ruído agudo (highpass+bandpass) com borbulho; ganho sobe por
       PROXIMIDADE da lagoa (proximidadeAgua(), chamado todo quadro) */
    const aSrc = AC.createBufferSource(); aSrc.buffer = noiseBuf; aSrc.loop = true;
    const aHP = AC.createBiquadFilter(); aHP.type = 'highpass'; aHP.frequency.value = 640;
    const aBP = AC.createBiquadFilter(); aBP.type = 'bandpass'; aBP.frequency.value = 1600; aBP.Q.value = 0.6;
    waterG = AC.createGain(); waterG.gain.value = 0;
    aSrc.connect(aHP).connect(aBP).connect(waterG).connect(masterG);
    const burb = AC.createOscillator(); burb.type = 'sine'; burb.frequency.value = 5.5;
    const burbAmt = AC.createGain(); burbAmt.gain.value = 240;
    burb.connect(burbAmt).connect(aBP.frequency);

    /* passos: canal próprio (cada passo cria seus nós, curtos e descartados) */
    passosG = AC.createGain(); passosG.gain.value = passosVol; passosG.connect(masterG);

    wSrc.start(); aSrc.start(); gust.start(); gust2.start(); burb.start();
  }

  function ensure() { if (!AC) build(); else if (AC.state === 'suspended') AC.resume(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, ensure, { passive: true }));

  let lastStep = -1;
  /* thump grave filtrado, jitter de tom por passo; cadência: chame a cada
     quadro com o relógio do jogo — só soa se >=340ms desde o último passo */
  function passo(tSeg) {
    if (!AC || passosVol <= 0 || !noiseBuf) return;
    if (tSeg - lastStep < 0.34) return;
    lastStep = tSeg;
    const t0 = AC.currentTime, dur = 0.1;
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110 + Math.random() * 50;
    const g = AC.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.9, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(lp).connect(g).connect(passosG);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* dist em unidades/tiles até o centro da lagoa; audível a <=from, cheia
     perto da borda, sobe ao longo de `range` (mesma curva do chafariz D-40) */
  function proximidadeAgua(dist, from = 7.5, range = 6.0) {
    if (!waterG || !AC) return;
    const k = Math.max(0, Math.min(1, (from - dist) / range));
    waterG.gain.setTargetAtTime(0.24 * k * ambienteVol, AC.currentTime, 0.4);
  }

  function setVolumes({ ambiente, passos } = {}) {
    if (ambiente !== undefined) {
      ambienteVol = Math.max(0, Math.min(1, ambiente));
      if (windG && AC) windG.gain.setTargetAtTime(0.045 * ambienteVol, AC.currentTime, 0.05);
    }
    if (passos !== undefined) {
      passosVol = Math.max(0, Math.min(1, passos));
      if (passosG && AC) passosG.gain.setTargetAtTime(passosVol, AC.currentTime, 0.05);
    }
    try { localStorage.setItem('nos3_som', JSON.stringify({ ambiente: ambienteVol, passos: passosVol })); } catch { /* ok */ }
  }

  return {
    ensure, passo, proximidadeAgua, setVolumes,
    volumes: () => ({ ambiente: ambienteVol, passos: passosVol }),
    debug: () => ({ estado: AC?.state || 'sem-contexto', ambiente: ambienteVol, passos: passosVol, waterGain: waterG?.gain.value ?? 0 }),
  };
}
