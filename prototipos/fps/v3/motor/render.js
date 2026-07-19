/* O VISOR do motor v3 (D-55) — o ambiente PADRÃO onde toda peça é criada e
   auditada: framebuffer fixo (?res) com upscale NEAREST (pixel art, custo
   independente da tela), sol + SOMBRA direcional (shadow-map RGBA-packed,
   PCF 3×3 — roda em qualquer celular), luz de céu hemisférica, névoa,
   partículas de pólen e chão de grama. Nasceu do teto-de-beleza D-54.
   Cada lote tem uModel próprio -> peças podem ANIMAR (animar(t, lotes)). */
import { m4 } from './mat4.js';
import { texCanvas, fbm, hash2 } from './tex.js';

const SUN_DIR = (() => { const v = [0.48, 0.72, 0.5]; const l = Math.hypot(...v); return [v[0]/l, v[1]/l, v[2]/l]; })();
const SUN_COL = [1.05, 0.98, 0.84], SKY_TOP = [0.55, 0.72, 0.95], SKY_HZ = [0.86, 0.90, 0.86], GROUND_AMB = [0.34, 0.30, 0.24];
/* tiers de qualidade (D-61): sombra 0=desligada(pula o passe)/1=1024(atual)/2=2048;
   luz 0=só ambiente/1=sol+sombra(atual)/2=+rebote falso; partículas = contagem direta */
const SOMBRA_SM = { 0: 64, 1: 1024, 2: 2048 };
const LUZ_TIER = { 0: { diff: 0, bounce: 0 }, 1: { diff: 1, bounce: 0 }, 2: { diff: 1, bounce: 0.12 } };

const PACK = `
  vec4 packDepth(float d){ vec4 e = fract(d * vec4(1.0,255.0,65025.0,16581375.0)); e -= e.yzww * (1.0/255.0); return e; }
  float unpackDepth(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }`;

/* VENTO GLOBAL (D-64): curva a vegetação no VERTEX shader. Injetado IDÊNTICO nos
   3 VS (cena, profundidade/sombra, contorno) -> planta, sombra e line-art curvam
   JUNTOS. Gate por-lote via uWind (0 = chão/prédio não balança). O deslocamento é
   uWindDir (vetor) × ESCALAR -> vaivém 1-D (nunca círculo); a fase vem da posição
   de MUNDO (rajada corre pelo campo; tronco+copa concordam na junção). `* sc`
   escala pelo porte da instância (topo local² igual, mundo maior balança igual). */
const WIND = `
  uniform vec2 uWindDir;                 // direção do vento no plano-xz do MUNDO (unitária), deriva devagar
  uniform float uWindT, uWind, uWindF;   // uWindT = relógio (s); uWind = amplitude POR-LOTE; uWindF = ritmo (rad/s) POR-LOTE
  vec3 vento(vec3 local, vec3 world, float sc){
    if (uWind <= 0.0) return world;               // gate coerente (grátis): chão/prédios saem aqui
    float bend = local.y * local.y;               // cantilever: base (y=0) travada, topo arqueia (y²)
    float trav = dot(world.xz, uWindDir) * 0.18;  // FASE ESPACIAL da posição BASE (λ≈35 u)
    float gust = 0.80 + 0.20 * sin(uWindT * 0.5 - trav * 0.5);   // rajada global lenta
    float s    = sin(uWindT * uWindF - trav);     // OSCILADOR 1-D; uWindF = ritmo (árvore lenta, grama rápida)
    world.xz  += uWindDir * (uWind * bend * sc * gust * s);   // * sc -> sway ∝ porte da instância
    return world;
  }`;

export function criarVisor({ canvas, res = 640, camOrbita = true, cam = {}, sombra = 1, particulasN = 320, luz = 1 }) {
  const IW = Math.max(160, res | 0), IH = Math.round(IW * 9 / 16);
  const SM = SOMBRA_SM[sombra] ?? 1024, sombraOn = sombra > 0;
  const LT = LUZ_TIER[luz] ?? LUZ_TIER[1];
  const gl = canvas.getContext('webgl', { antialias: false, depth: true });
  if (!gl) throw new Error('WebGL indisponível');

  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  function prog(v, f) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

  const depthProg = prog(`
    attribute vec3 aPos; attribute vec2 aUV; uniform mat4 uLMVP, uModel; varying float vZ; varying vec2 vUV;
    ${WIND}
    void main(){ vec4 w = uModel * vec4(aPos,1.0);
      w.xyz = vento(aPos, w.xyz, length(uModel[0].xyz));   // MESMO deslocamento da cena -> sombra acompanha
      vec4 p = uLMVP * w; gl_Position = p; vZ = p.z / p.w * 0.5 + 0.5; vUV = aUV; }`,
    `precision highp float; varying float vZ; varying vec2 vUV; uniform sampler2D uTex; ${PACK}
     void main(){ if (texture2D(uTex, vUV).a < 0.5) discard; gl_FragColor = packDepth(vZ); }`);

  const scene = prog(`
    attribute vec3 aPos; attribute vec2 aUV; attribute vec3 aNrm;
    uniform mat4 uMVP, uLMVP, uModel; uniform vec3 uCam;
    varying vec2 vUV; varying vec3 vN; varying float vD; varying vec4 vLP; varying vec3 vW;
    ${WIND}
    void main(){ vec4 w = uModel * vec4(aPos,1.0);
      w.xyz = vento(aPos, w.xyz, length(uModel[0].xyz));   // curva no MUNDO antes de tudo
      vW = w.xyz;
      gl_Position = uMVP * w; vUV = aUV; vN = mat3(uModel) * aNrm;
      vD = distance(w.xyz, uCam); vLP = uLMVP * w; }`, `
    precision highp float;
    varying vec2 vUV; varying vec3 vN; varying float vD; varying vec4 vLP; varying vec3 vW;
    uniform sampler2D uTex, uShadow;
    uniform vec3 uSun, uSunCol, uSkyTop, uSkyHz, uGround; uniform vec2 uFog; uniform vec3 uCam; uniform float uRim; ${PACK}
    uniform float uShadowTexel, uDiffOn, uBounce, uToon;
    float shadow(){
      vec3 lc = vLP.xyz / vLP.w * 0.5 + 0.5;
      if (lc.x < 0.0 || lc.x > 1.0 || lc.y < 0.0 || lc.y > 1.0 || lc.z > 1.0) return 1.0;
      float cur = lc.z - 0.0035; float s = 0.0; float t = uShadowTexel;
      for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++){
        float d = unpackDepth(texture2D(uShadow, lc.xy + vec2(float(i),float(j))*t));
        s += cur <= d ? 1.0 : 0.0; }
      return s / 9.0;
    }
    void main(){
      vec4 tx = texture2D(uTex, vUV); if (tx.a < 0.5) discard;
      vec3 N = normalize(vN);
      float diff = max(0.0, dot(N, uSun)) * uDiffOn;
      vec3 amb = mix(uGround, mix(uSkyHz, uSkyTop, clamp(N.y,0.0,1.0)), N.y*0.5+0.5) * 0.5;
      amb += uGround * uBounce * max(0.0, -N.y);   // rebote falso embaixo de copas/beirais (tier Alto)
      float sunL = diff * shadow();
      // CEL (toon, D-63): quantiza a luz do sol em 3 DEGRAUS duros — a faixa clara
      // é o "brilho" e SEGUE o sol (some de noite/contraluz), sem baked na textura.
      if (uToon > 0.5) sunL = sunL > 0.6 ? 1.15 : sunL > 0.24 ? 0.55 : 0.0;
      vec3 lit = tx.rgb * (amb + uSunCol * sunL);
      if (uRim > 0.0) {   // contorno de tinta FINO (fresnel): só a borda mais rasante à vista
        float r = 1.0 - abs(dot(N, normalize(uCam - vW)));
        lit = mix(lit, vec3(0.11, 0.09, 0.12), uRim * smoothstep(0.78, 0.97, r));
      }
      vec3 sky = uSkyHz; /* derrete pro tom do HORIZONTE do fundo (sem degrau) */
      float fog = clamp(1.0 - (vD - uFog.x)/uFog.y, 0.0, 1.0);
      gl_FragColor = vec4(mix(sky, lit, fog), 1.0);
    }`);

  const bg = prog(`attribute vec2 aPos; varying vec2 vUV; void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0);} `,
    `precision mediump float; varying vec2 vUV; uniform vec3 uTop, uHz;
     void main(){ gl_FragColor = vec4(mix(uHz, uTop, pow(clamp(vUV.y,0.0,1.0),0.7)), 1.0); }`);

  const parts = prog(`
    attribute vec3 aSeed; uniform mat4 uMVP; uniform float uT; uniform vec3 uCam; varying float vTw;
    void main(){ vec3 p = aSeed;
      p.x += sin(uT*0.3 + aSeed.y*7.0)*0.6; p.z += cos(uT*0.24 + aSeed.x*6.0)*0.6;
      p.y += mod(uT*0.12 + aSeed.z, 1.0)*2.4;
      gl_Position = uMVP * vec4(p, 1.0);
      gl_PointSize = clamp(9.0/distance(p,uCam), 1.5, 5.0);
      vTw = 0.5 + 0.5*sin(uT*2.0 + aSeed.x*30.0); }`, `
    precision mediump float; varying float vTw;
    void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d);
      if (r > 0.25) discard; float a = (1.0 - r*4.0) * (0.35 + 0.5*vTw);
      gl_FragColor = vec4(1.0, 0.93, 0.7, a); }`);

  const blit = prog(`attribute vec2 aPos; varying vec2 vUV; void main(){ vUV=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0);} `,
    `precision mediump float; varying vec2 vUV; uniform sampler2D uTex; void main(){ gl_FragColor = texture2D(uTex, vUV);} `);

  /* CONTORNO por-lote (casca invertida, D-63): infla a malha ao longo da normal
     e pinta chapado de verde-escuro; desenhada com as faces DA FRENTE culled (só
     as de TRÁS) ANTES da cena -> sobra só na silhueta = contorno firme e uniforme
     (toon), independente da luz. Ligado por lote via L.outline (largura em
     unidades de mundo); 0 = sem contorno (as outras peças seguem iguais). */
  const outline = prog(`
    attribute vec3 aPos; attribute vec3 aNrm; uniform mat4 uMVP, uModel; uniform float uW;
    ${WIND}
    void main(){ vec4 w = uModel * vec4(aPos + normalize(aNrm) * uW, 1.0);
      w.xyz = vento(aPos, w.xyz, length(uModel[0].xyz));   // contorno curva junto (aPos LOCAL no bend)
      gl_Position = uMVP * w; }`,
    `precision mediump float; uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0); }`);

  const AL = { pos: gl.getAttribLocation(scene,'aPos'), uv: gl.getAttribLocation(scene,'aUV'), nrm: gl.getAttribLocation(scene,'aNrm') };
  const DL = { pos: gl.getAttribLocation(depthProg,'aPos'), uv: gl.getAttribLocation(depthProg,'aUV') };
  const OL = { pos: gl.getAttribLocation(outline,'aPos'), nrm: gl.getAttribLocation(outline,'aNrm') };

  /* uniforms de TIER são fixos pela vida do visor (tier muda = recarrega a
     página, como o D-49 já faz pro ?res — evita geri-los por quadro) */
  gl.useProgram(scene);
  gl.uniform1f(gl.getUniformLocation(scene, 'uShadowTexel'), 1 / SM);
  gl.uniform1f(gl.getUniformLocation(scene, 'uDiffOn'), LT.diff);
  gl.uniform1f(gl.getUniformLocation(scene, 'uBounce'), LT.bounce);

  const isPOT = (n) => (n & (n - 1)) === 0;
  function glTex(cv) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    // REPEAT exige POT no WebGL1; sprite NPOT (árvore 166×218) com REPEAT = PRETO.
    // billboard usa UV 0..1, então CLAMP é o certo pra NPOT.
    const wrap = (isPOT(cv.width) && isPOT(cv.height)) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; }
  function glMesh(m) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW); return { buf: b, n: m.v.length / 8 }; }
  function makeFBO(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    return { fb, tex };
  }
  const sceneFBO = makeFBO(IW, IH), shadowFBO = makeFBO(SM, SM);

  const quadVBO = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const NP = Math.max(0, particulasN | 0), seeds = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { seeds[i*3] = (hash2(i,1)*2-1)*4.5; seeds[i*3+1] = hash2(i,2)*2.2; seeds[i*3+2] = hash2(i,3); }
  const partVBO = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, partVBO); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const PA = gl.getAttribLocation(parts, 'aSeed');
  const BA = gl.getAttribLocation(blit, 'aPos'), BT = gl.getUniformLocation(blit, 'uTex');

  /* PALCO padrão: chão de grama CARTOON (D-63) — CHAPADO (um verde só, 31). Com
     NEAREST + o line-art das árvores, qualquer ruído/2-tom vira camuflagem de
     borda dura que briga com o fill limpo das copas; o chão chapado CASA. A
     "grama de verdade" (tufos com caráter) deve vir por GEOMETRIA no idioma
     cartoon (billboard flat + contorno), não por textura — fica pra depois. */
  const GRASS = texCanvas(4, 4, () => 32);   // verde chapado (#91db69) — menos limão, um tico mais escuro
  const stage = { mesh: null, tex: glTex(GRASS), matriz: m4.ident() };
  {
    const g = { v: [] }, T = 10;   // T = ladrilhos da grama no palco (era 36; menos = menos padrão repetido)
    const push = (p, u, v) => g.v.push(p[0], p[1], p[2], u, v, 0, 1, 0);
    push([-18,0,18],0,T); push([18,0,18],T,T); push([18,0,-18],T,0);
    push([-18,0,18],0,T); push([18,0,-18],T,0); push([-18,0,-18],0,0);
    stage.mesh = glMesh(g);
  }

  const lightView = m4.lookAt([SUN_DIR[0]*8, SUN_DIR[1]*8, SUN_DIR[2]*8], [0, 0.5, 0], [0, 1, 0]);
  const lMVPf = new Float32Array(m4.mul(m4.ortho(-4, 4, -4, 4, 0.1, 20), lightView));

  let lotes = [];       // [{mesh:{buf,n}, tex, matriz}]
  let animar = null;
  let semPalco = false; // peça-chão (palco:false) É o chão: dispensa a grama padrão
  let semParts = false; // paisagens desligam o pólen (particulas:false)
  const FOG_PADRAO = [6, 26];
  let fogCfg = FOG_PADRAO;
  let farCfg = 60;  // far plane; paisagens (far>100) sobem o near junto (precisão do depth16)
  let camCfg = {};  // câmera SUGERIDA pela peça {e,r} (paisagem pede órbita alta) — ?e/?r vencem
  let freeCam = null;  // {pos:[x,y,z], yaw, pitch} — câmera de JOGADOR (jogo.html); substitui a órbita quando setada
  const visor = {
    glTex, glMesh,
    /* câmera livre (jogo.html chama a cada quadro com a posição/olhar do
       jogador); passar null volta pra órbita — usado só no visor da Oficina */
    setCam(pos, yaw, pitch) { freeCam = pos ? { pos, yaw, pitch } : null; },
    /* carrega uma peça construída:
       {lotes:[{mesh,tex,matriz?}], animar?, palco?, particulas?, fog?} —
       mesh ainda em CPU ({v}) e tex ainda canvas: o visor sobe pra GPU aqui.
       palco:false = a peça substitui o chão de grama padrão (é ela o terreno);
       particulas:false = sem pólen (paisagem); fog:[início,alcance] em unidades */
    carregar(peca) {
      /* dedupe por REFERÊNCIA (D-61): plantar a mesma árvore em N posições
         reusa a MESMA textura/malha na GPU (o pool de variantes medido —
         textura não paga por instância) — no-op pras peças de hoje, que só
         passam objetos frescos por lote. */
      const meshCache = new Map(), texCache = new Map();
      const getMesh = (m) => { let g = meshCache.get(m); if (!g) { g = glMesh(m); meshCache.set(m, g); } return g; };
      const getTex = (t) => { let g = texCache.get(t); if (!g) { g = glTex(t); texCache.set(t, g); } return g; };
      lotes = peca.lotes.map(L => ({ mesh: getMesh(L.mesh), tex: getTex(L.tex), matriz: L.matriz || m4.ident(), rim: L.rim || 0, outline: L.outline || 0, outlineInk: L.outlineInk || null, toon: L.toon || 0, wind: L.wind || 0, windF: L.windF || 1.3 }));
      animar = peca.animar || null;
      semPalco = peca.palco === false;
      semParts = peca.particulas === false;
      fogCfg = peca.fog || FOG_PADRAO;
      farCfg = peca.far || 60;
      camCfg = peca.camera || {};
    },
    /* antesDoQuadro(dt, T): chamado TODO quadro, antes da câmera ser lida —
       o jogo.html usa isso pra integrar movimento (input -> pos/yaw/pitch ->
       setCam()) sempre imediatamente antes do frame que vai desenhá-lo. */
    rodar(onFrame, antesDoQuadro) {
      const fixedA = camOrbita ? null : (cam.a ?? 0.66);
      const eye = cam.e ?? camCfg.e ?? 1.15, rad = cam.r ?? camCfg.r ?? 5.4;
      function resize() { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr | 0; canvas.height = innerHeight * dpr | 0; }
      addEventListener('resize', resize); resize();
      let t0 = performance.now(), frames = 0, tPrev = performance.now();
      const draw = (prg, aL) => {
        const uM = gl.getUniformLocation(prg, 'uModel');
        const uR = gl.getUniformLocation(prg, 'uRim');   // null no passe de profundidade
        const uTo = gl.getUniformLocation(prg, 'uToon');
        const uWnd = gl.getUniformLocation(prg, 'uWind');   // VENTO: existe nos DOIS passes (cena+depth)
        const uWF = gl.getUniformLocation(prg, 'uWindF');   // VENTO: ritmo por lote
        const all = semPalco ? lotes : [stage, ...lotes];
        for (const L of all) {
          gl.uniformMatrix4fv(uM, false, L.matriz);
          if (uR) gl.uniform1f(uR, L.rim || 0);          // contorno por lote
          if (uTo) gl.uniform1f(uTo, L.toon || 0);       // cel-shading por lote
          if (uWnd) gl.uniform1f(uWnd, L.wind || 0);     // VENTO: amplitude por lote (chão/prédio = 0)
          if (uWF) gl.uniform1f(uWF, L.windF || 1.3);    // VENTO: ritmo por lote (árvore 0.9, grama 2.6)
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.tex);   // ambos os passes: alfa p/ recorte
          gl.bindBuffer(gl.ARRAY_BUFFER, L.mesh.buf);
          gl.enableVertexAttribArray(aL.pos); gl.vertexAttribPointer(aL.pos, 3, gl.FLOAT, false, 32, 0);
          gl.enableVertexAttribArray(aL.uv); gl.vertexAttribPointer(aL.uv, 2, gl.FLOAT, false, 32, 12);
          if (aL.nrm !== undefined && aL.nrm >= 0) { gl.enableVertexAttribArray(aL.nrm); gl.vertexAttribPointer(aL.nrm, 3, gl.FLOAT, false, 32, 20); }
          gl.drawArrays(gl.TRIANGLES, 0, L.mesh.n);
        }
      };
      const frame = (now) => {
        const T = now / 1000;
        /* VENTO GLOBAL (D-64): direção que DERIVA devagar (linear lento + 2 senos)
           + relógio do balanço. θ̇ ~0.003–0.037 rad/s << ω=1.3 -> re-aponta o eixo
           adiabaticamente, nunca rodopia. Varre ~90–130°/min. */
        const windAngle = T * 0.02 + 0.45 * Math.sin(T * 0.021) + 0.20 * Math.sin(T * 0.037 + 2.1);
        const windDir = [Math.cos(windAngle), Math.sin(windAngle)];   // unitário no plano xz do MUNDO
        const windT = T;
        const dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;   // trava dt (aba em 2º plano não "pula")
        if (antesDoQuadro) antesDoQuadro(dt, T);
        if (animar) animar(T, lotes);
        let camPos, lookAtM;
        if (freeCam) {
          const { pos, yaw, pitch } = freeCam;
          const cy = Math.cos(pitch), sy = Math.sin(pitch), sx = Math.sin(yaw), cx = Math.cos(yaw);
          camPos = pos;
          lookAtM = m4.lookAt(camPos, [camPos[0] + sx * cy, camPos[1] + sy, camPos[2] + cx * cy], [0, 1, 0]);
        } else {
          const ang = fixedA !== null ? fixedA : now / 5200;
          camPos = [Math.sin(ang) * rad, eye, Math.cos(ang) * rad];
          lookAtM = m4.lookAt(camPos, [0, 0.6, 0], [0, 1, 0]);
        }
        const near = freeCam ? 0.05 : (farCfg > 100 ? farCfg / 1000 : 0.05);
        const mvpf = new Float32Array(m4.mul(m4.persp(58 * Math.PI/180, IW/IH, near, farCfg), lookAtM));
        // 1: sombra (tier 0 = só limpa pra "tudo lit"; pula os draw calls, o custo real)
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO.fb); gl.viewport(0, 0, SM, SM);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(1,1,1,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (sombraOn) {
          gl.useProgram(depthProg); gl.uniformMatrix4fv(gl.getUniformLocation(depthProg,'uLMVP'), false, lMVPf);
          gl.uniform1i(gl.getUniformLocation(depthProg,'uTex'), 0);
          gl.uniform2f(gl.getUniformLocation(depthProg,'uWindDir'), windDir[0], windDir[1]);   // VENTO
          gl.uniform1f(gl.getUniformLocation(depthProg,'uWindT'), windT);                        // VENTO
          draw(depthProg, DL);
        }
        // 2: cena
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb); gl.viewport(0, 0, IW, IH);
        gl.disable(gl.DEPTH_TEST); gl.useProgram(bg);
        gl.uniform3fv(gl.getUniformLocation(bg,'uTop'), SKY_TOP); gl.uniform3fv(gl.getUniformLocation(bg,'uHz'), SKY_HZ);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO); gl.enableVertexAttribArray(BA); gl.vertexAttribPointer(BA, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(scene);
        gl.uniformMatrix4fv(gl.getUniformLocation(scene,'uMVP'), false, mvpf);
        gl.uniformMatrix4fv(gl.getUniformLocation(scene,'uLMVP'), false, lMVPf);
        gl.uniform3fv(gl.getUniformLocation(scene,'uCam'), camPos);
        gl.uniform3fv(gl.getUniformLocation(scene,'uSun'), SUN_DIR); gl.uniform3fv(gl.getUniformLocation(scene,'uSunCol'), SUN_COL);
        gl.uniform3fv(gl.getUniformLocation(scene,'uSkyTop'), SKY_TOP); gl.uniform3fv(gl.getUniformLocation(scene,'uSkyHz'), SKY_HZ);
        gl.uniform3fv(gl.getUniformLocation(scene,'uGround'), GROUND_AMB);
        gl.uniform2f(gl.getUniformLocation(scene,'uFog'), fogCfg[0], fogCfg[1]);
        gl.uniform2f(gl.getUniformLocation(scene,'uWindDir'), windDir[0], windDir[1]);   // VENTO
        gl.uniform1f(gl.getUniformLocation(scene,'uWindT'), windT);                        // VENTO
        gl.uniform1i(gl.getUniformLocation(scene,'uTex'), 0); gl.uniform1i(gl.getUniformLocation(scene,'uShadow'), 1);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shadowFBO.tex);
        // 2a: CONTORNO (casca invertida) — só lotes com outline>0, ANTES da cena
        { const outLotes = lotes.filter((L) => L.outline > 0);
          if (outLotes.length) {
            gl.useProgram(outline);
            gl.uniformMatrix4fv(gl.getUniformLocation(outline, 'uMVP'), false, mvpf);
            gl.uniform2f(gl.getUniformLocation(outline, 'uWindDir'), windDir[0], windDir[1]);   // VENTO
            gl.uniform1f(gl.getUniformLocation(outline, 'uWindT'), windT);                        // VENTO
            const uInkL = gl.getUniformLocation(outline, 'uInk');
            gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);   // desenha só as faces de TRÁS da casca inflada
            for (const L of outLotes) {
              const ink = L.outlineInk || [0.05, 0.17, 0.11];   // tinta por lote (verde-escuro padrão)
              gl.uniform3f(uInkL, ink[0], ink[1], ink[2]);
              gl.uniformMatrix4fv(gl.getUniformLocation(outline, 'uModel'), false, L.matriz);
              gl.uniform1f(gl.getUniformLocation(outline, 'uW'), L.outline);
              gl.uniform1f(gl.getUniformLocation(outline, 'uWind'), L.wind || 0);    // VENTO: amplitude do lote
              gl.uniform1f(gl.getUniformLocation(outline, 'uWindF'), L.windF || 1.3);  // VENTO: ritmo do lote (senão a tinta desincroniza)
              gl.bindBuffer(gl.ARRAY_BUFFER, L.mesh.buf);
              gl.enableVertexAttribArray(OL.pos); gl.vertexAttribPointer(OL.pos, 3, gl.FLOAT, false, 32, 0);
              gl.enableVertexAttribArray(OL.nrm); gl.vertexAttribPointer(OL.nrm, 3, gl.FLOAT, false, 32, 20);
              gl.drawArrays(gl.TRIANGLES, 0, L.mesh.n);
            }
            gl.disable(gl.CULL_FACE); gl.useProgram(scene);
          } }
        draw(scene, AL);
        // partículas (pólen do palco — paisagens desligam)
        if (!semParts) {
          gl.useProgram(parts); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
          gl.uniformMatrix4fv(gl.getUniformLocation(parts,'uMVP'), false, mvpf);
          gl.uniform1f(gl.getUniformLocation(parts,'uT'), T); gl.uniform3fv(gl.getUniformLocation(parts,'uCam'), camPos);
          gl.bindBuffer(gl.ARRAY_BUFFER, partVBO); gl.enableVertexAttribArray(PA); gl.vertexAttribPointer(PA, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, NP); gl.depthMask(true); gl.disable(gl.BLEND);
        }
        // 3: blit
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.DEPTH_TEST);
        gl.useProgram(blit); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex); gl.uniform1i(BT, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO); gl.enableVertexAttribArray(BA); gl.vertexAttribPointer(BA, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        frames++;
        if (now - t0 >= 500) { if (onFrame) onFrame(Math.round(frames * 1000 / (now - t0))); frames = 0; t0 = now; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    info: `${IW}×${IH}`,
    renderer: gl.getParameter(gl.RENDERER) || '',
  };
  return visor;
}
