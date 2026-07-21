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

export function criarVisor({ canvas, res = 640, camOrbita = true, cam = {}, sombra = 1, particulasN = 320, luz = 1, debug = 0, aa = 0 }) {
  const DEBUG = debug | 0;   // 0 normal, 1 normais (geometria), 2 flat (forma sem textura)
  /* ANTISSERRILHADO. WebGL1 nao tem MSAA em framebuffer (isso e WebGL2), e o
     serrilhado daqui nem vem das bordas de poligono: vem da AMPLIACAO do quadro
     interno com pixel duro — o mesmo efeito que da a cara de pixel art. Sobram
     dois caminhos honestos, e sao os tiers:
       0  pixel duro. O visual do projeto. Serrilha e nao custa nada.
       1  ampliacao suave (LINEAR no blit). De graca, mas borra o pixel art.
       2  supersampling 2x: desenha no dobro e reduz. Antisserrilhado de
          verdade, e o unico que suaviza SEM borrar — ao custo de 4x pixels. */
  let AA_ESCALA = aa === 2 ? 2 : 1;
  /* o SSAA (2) TAMBEM precisa do filtro linear: sem ele o quadro maior e
     amostrado ponto a ponto na saida, nenhuma media acontece, e sao 4x pixels
     desenhados pra serrilhar ate MAIS que o pixel duro. Medido, nao suposto. */
  let AA_SUAVE = aa === 1 || aa === 2;
  let RECON = 0;                // reconstrução na saída (0 desliga)
  /* O quadro interno segue a PROPORÇÃO DA JANELA, não 16:9 fixo. Antes a cena
     era desenhada em 16:9 e esticada pra tela inteira no blit final: num
     ultrawide 21:9 tudo saía 33% mais largo, círculo virava oval. Como a
     abertura vertical é que fica fixa (58°), tela mais larga passa a MOSTRAR
     mais dos lados, que é o comportamento certo — e não deformar o mesmo
     enquadramento. `res` é a largura interna; a altura sai da proporção. */
  const propJanela = () => Math.max(0.5, Math.min(3.5, innerWidth / Math.max(1, innerHeight)));
  let RES = Math.max(160, res | 0);
  let IW = RES * AA_ESCALA;
  let IH = Math.max(90, Math.round(IW / propJanela()));
  let SM = SOMBRA_SM[sombra] ?? 1024, sombraOn = sombra > 0;
  let LT = LUZ_TIER[luz] ?? LUZ_TIER[1];
  const gl = canvas.getContext('webgl2', { antialias: false, depth: true });
  if (!gl) throw new Error('WebGL 2 indisponível');

  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  function prog(v, f) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

  const depthProg = prog(`#version 300 es
    in vec3 aPos; in vec2 aUV; uniform mat4 uLMVP, uModel; out float vZ; out vec2 vUV;
    ${WIND}
    void main(){ vec4 w = uModel * vec4(aPos,1.0);
      w.xyz = vento(aPos, w.xyz, length(uModel[0].xyz));   // MESMO deslocamento da cena -> sombra acompanha
      vec4 p = uLMVP * w; gl_Position = p; vZ = p.z / p.w * 0.5 + 0.5; vUV = aUV; }`,
    `#version 300 es
     precision highp float; in float vZ; in vec2 vUV; uniform sampler2D uTex; out vec4 outColor; ${PACK}
     void main(){ if (texture(uTex, vUV).a < 0.5) discard; outColor = packDepth(vZ); }`);

  const scene = prog(`#version 300 es
    in vec3 aPos; in vec2 aUV; in vec3 aNrm;
    uniform mat4 uMVP, uLMVP, uModel; uniform vec3 uCam;
    out vec2 vUV; out vec3 vN; out float vD; out vec4 vLP; out vec3 vW;
    ${WIND}
    void main(){ vec4 w = uModel * vec4(aPos,1.0);
      w.xyz = vento(aPos, w.xyz, length(uModel[0].xyz));   // curva no MUNDO antes de tudo
      vW = w.xyz;
      gl_Position = uMVP * w; vUV = aUV; vN = mat3(uModel) * aNrm;
      vD = distance(w.xyz, uCam); vLP = uLMVP * w; }`, `#version 300 es
    precision highp float;
    in vec2 vUV; in vec3 vN; in float vD; in vec4 vLP; in vec3 vW;
    uniform sampler2D uTex, uShadow;
    uniform vec3 uSun, uSunCol, uSkyTop, uSkyHz, uGround; uniform vec2 uFog; uniform vec3 uCam; uniform float uRim; out vec4 outColor; ${PACK}
    uniform float uShadowTexel, uDiffOn, uBounce, uToon, uDebug;
    float shadow(){
      vec3 lc = vLP.xyz / vLP.w * 0.5 + 0.5;
      if (lc.x < 0.0 || lc.x > 1.0 || lc.y < 0.0 || lc.y > 1.0 || lc.z > 1.0) return 1.0;
      float cur = lc.z - 0.0035; float s = 0.0; float t = uShadowTexel;
      for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++){
        float d = unpackDepth(texture(uShadow, lc.xy + vec2(float(i),float(j))*t));
        s += cur <= d ? 1.0 : 0.0; }
      return s / 9.0;
    }
    void main(){
      vec4 tx = texture(uTex, vUV); if (tx.a < 0.5) discard;
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
      vec3 outc = mix(sky, lit, fog);
      // MODO DEBUG (D-65): tira a textura pra a GEOMETRIA aparecer (emenda/faceta/junção
      // que a casca esconde). 1 = normais cruas (N*.5+.5); 2 = flat cinza (só forma+luz).
      if (uDebug > 0.5 && uDebug < 1.5) outc = N * 0.5 + 0.5;
      else if (uDebug > 1.5) outc = mix(sky, vec3(0.8) * (amb + uSunCol * sunL), fog);
      outColor = vec4(outc, 1.0);
    }`);

  const bg = prog(`#version 300 es
in vec2 aPos; out vec2 vUV; void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0);} `,
    `#version 300 es
precision mediump float; in vec2 vUV; uniform vec3 uTop, uHz; out vec4 outColor;
     void main(){ outColor = vec4(mix(uHz, uTop, pow(clamp(vUV.y,0.0,1.0),0.7)), 1.0); }`);

  const parts = prog(`#version 300 es
    in vec3 aSeed; uniform mat4 uMVP; uniform float uT; uniform vec3 uCam; out float vTw;
    void main(){ vec3 p = aSeed;
      p.x += sin(uT*0.3 + aSeed.y*7.0)*0.6; p.z += cos(uT*0.24 + aSeed.x*6.0)*0.6;
      p.y += mod(uT*0.12 + aSeed.z, 1.0)*2.4;
      gl_Position = uMVP * vec4(p, 1.0);
      gl_PointSize = clamp(9.0/distance(p,uCam), 1.5, 5.0);
      vTw = 0.5 + 0.5*sin(uT*2.0 + aSeed.x*30.0); }`, `#version 300 es
    precision mediump float; in float vTw; out vec4 outColor;
    void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d);
      if (r > 0.25) discard; float a = (1.0 - r*4.0) * (0.35 + 0.5*vTw);
      outColor = vec4(1.0, 0.93, 0.7, a); }`);

  const VS_QUAD = `#version 300 es
in vec2 aPos; out vec2 vUV; void main(){ vUV=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0);} `;
  const blit = prog(VS_QUAD,
    `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; out vec4 outColor; void main(){ outColor = texture(uTex, vUV);} `);

  /* CONTORNO por-lote (casca invertida, D-63): infla a malha ao longo da normal
     e pinta chapado de verde-escuro; desenhada com as faces DA FRENTE culled (só
     as de TRÁS) ANTES da cena -> sobra só na silhueta = contorno firme e uniforme
     (toon), independente da luz. Ligado por lote via L.outline (largura em
     unidades de mundo); 0 = sem contorno (as outras peças seguem iguais). */
  const outline = prog(`#version 300 es
    in vec3 aPos; in vec3 aNrm; uniform mat4 uMVP, uModel; uniform float uW;
    ${WIND}
    void main(){ vec4 w = uModel * vec4(aPos + normalize(aNrm) * uW, 1.0);
      w.xyz = vento(aPos, w.xyz, length(uModel[0].xyz));   // contorno curva junto (aPos LOCAL no bend)
      gl_Position = uMVP * w; }`,
    `#version 300 es
precision mediump float; uniform vec3 uInk; out vec4 outColor; void main(){ outColor = vec4(uInk, 1.0); }`);

  /* Reconstrução na saída, no espírito do FSR: em vez de esticar o quadro com
     bilinear (que borra tudo por igual), olha a vizinhança e puxa a
     interpolação NA DIREÇÃO da borda, depois devolve a nitidez com um realce
     de contraste local.
     Não é o FSR oficial da AMD — aquele é bem mais longo. É a mesma ideia numa
     versão compacta, e por isso a opção não se chama FSR na tela. */
  const recon = prog(VS_QUAD, `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uTex;
    uniform vec2 uTexel;
    uniform float uNitidez;
    out vec4 outColor;
    void main(){
      vec2 p = vUV / uTexel - 0.5;
      vec2 base = (floor(p) + 0.5) * uTexel, f = fract(p);
      vec3 a = texture(uTex, base).rgb;
      vec3 b = texture(uTex, base + vec2(uTexel.x, 0.0)).rgb;
      vec3 c = texture(uTex, base + vec2(0.0, uTexel.y)).rgb;
      vec3 d = texture(uTex, base + uTexel).rgb;
      /* onde o degrau é mais forte, a mistura fica mais dura: borda não é
         suavizada por igual, é seguida */
      vec3 dx = abs((b + d) - (a + c)), dy = abs((c + d) - (a + b));
      float gx = dot(dx, vec3(0.333)), gy = dot(dy, vec3(0.333));
      vec2 t = f * f * (3.0 - 2.0 * f);                 // curva em S
      vec2 w = mix(f, t, clamp(vec2(gx, gy) * 3.0, 0.0, 1.0));
      vec3 cor = mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
      // realce local: devolve o que a interpolação tirou, sem halo
      vec3 viz = (a + b + c + d) * 0.25;
      outColor = vec4(clamp(cor + (cor - viz) * uNitidez, 0.0, 1.0), 1.0);
    }`);

  const AL = { pos: gl.getAttribLocation(scene,'aPos'), uv: gl.getAttribLocation(scene,'aUV'), nrm: gl.getAttribLocation(scene,'aNrm') };
  const DL = { pos: gl.getAttribLocation(depthProg,'aPos'), uv: gl.getAttribLocation(depthProg,'aUV') };
  const OL = { pos: gl.getAttribLocation(outline,'aPos'), nrm: gl.getAttribLocation(outline,'aNrm') };

  /* uniforms de TIER: escritos aqui e sempre que um tier muda (aplicarTiers).
     Ficam fora do laço de quadro de propósito — mudam por escolha do jogador,
     não a 60 vezes por segundo. */
  const U_TEXEL = gl.getUniformLocation(scene, 'uShadowTexel');
  const U_DIFF = gl.getUniformLocation(scene, 'uDiffOn');
  const U_BOUNCE = gl.getUniformLocation(scene, 'uBounce');
  function subirUniformesDeTier() {
    gl.useProgram(scene);
    gl.uniform1f(U_TEXEL, 1 / SM);
    gl.uniform1f(U_DIFF, LT.diff);
    gl.uniform1f(U_BOUNCE, LT.bounce);
  }
  subirUniformesDeTier();

  const isPOT = (n) => (n & (n - 1)) === 0;
  function glTex(cv) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    // REPEAT exige POT no WebGL1; sprite NPOT (árvore 166×218) com REPEAT = PRETO.
    // billboard usa UV 0..1, então CLAMP é o certo pra NPOT.
    const wrap = (isPOT(cv.width) && isPOT(cv.height)) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; }
  function glMesh(m) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW); return { buf: b, n: m.v.length / 8 }; }
  function makeFBO(w, h, suave) {
    /* O filtro vale SÓ pro quadro final da cena. As texturas das peças seguem
       NEAREST sempre — suavizar elas apagaria o pixel art na origem.
       E o SHADOW MAP nunca pode vir suave: ele guarda profundidade empacotada
       em RGBA, e interpolar os canais mistura bits de casas decimais
       diferentes, o que vira sombra suja. Por isso `suave` só é passado no
       sceneFBO, e o shadowFBO chama sem o argumento. */
    const f = suave ? gl.LINEAR : gl.NEAREST;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    return { fb, tex, rb };   // rb vai junto: sem ele, refazer o FBO vaza o renderbuffer
  }
  function descartarFBO(f) {
    if (!f) return;
    gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex);
    if (f.rb) gl.deleteRenderbuffer(f.rb);
  }
  let sceneFBO = makeFBO(IW, IH, AA_SUAVE);
  let shadowFBO = makeFBO(SM, SM);

  function refazerCena() {
    IH = Math.max(90, Math.round(IW / propJanela()));
    descartarFBO(sceneFBO);
    sceneFBO = makeFBO(IW, IH, AA_SUAVE);
  }
  /* girar a tela ou arrastar a janela muda a proporcao: o quadro interno tem
     que ser refeito, senao volta a esticar. Sem isso o conserto do ultrawide
     so valeria ate o primeiro redimensionamento. */
  function ajustarProporcao() {
    if (Math.max(90, Math.round(IW / propJanela())) === IH) return;
    refazerCena();
  }

  const quadVBO = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  let NP = Math.max(0, particulasN | 0);
  let seeds = new Float32Array(NP * 3);
  const partVBO = gl.createBuffer();
  function subirSementes() {
    seeds = new Float32Array(NP * 3);
    for (let i = 0; i < NP; i++) { seeds[i*3] = (hash2(i,1)*2-1)*4.5; seeds[i*3+1] = hash2(i,2)*2.2; seeds[i*3+2] = hash2(i,3); }
    gl.bindBuffer(gl.ARRAY_BUFFER, partVBO); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  }
  subirSementes();
  const PA = gl.getAttribLocation(parts, 'aSeed');
  const BA = gl.getAttribLocation(blit, 'aPos'), BT = gl.getUniformLocation(blit, 'uTex');
  const RA = gl.getAttribLocation(recon, 'aPos'), R_TEX = gl.getUniformLocation(recon, 'uTex');
  const R_TEXEL = gl.getUniformLocation(recon, 'uTexel'), R_NITIDEZ = gl.getUniformLocation(recon, 'uNitidez');

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
  let extras = [];     // camada de DEPURAÇÃO (colisores etc). Vazia = nada a pagar.
  let mvpAtual = null, camAtualPos = null;   // do último quadro, pra projetar()
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
    /* leva um ponto do MUNDO pra COORDENADA DE TELA em pixels de CSS, usando a
       matriz do último quadro desenhado. Serve pra ancorar HTML em cima de algo
       3D (etiqueta de objeto, marcador). Devolve null se o ponto está atrás da
       câmera — que é onde a divisão por w inverte o sinal e joga o elemento pro
       lado oposto da tela, o clássico "a etiqueta aparece nas costas".
       `dist` vem junto porque quem chama quase sempre quer filtrar por distância
       e ordenar, e o cálculo já está feito aqui. */
    projetar(p) {
      /* Com câmera de jogador, RECONSTRÓI a matriz do estado atual em vez de
         usar a do último quadro: projetar() é chamado no antesDoQuadro, ou
         seja, ANTES do quadro existir, e a matriz velha faria a etiqueta
         arrastar um quadro atrás ao girar. Na órbita não dá pra reconstruir
         (o ângulo depende do relógio do quadro), então lá vale a guardada. */
      let M = mvpAtual, C = camAtualPos;
      if (freeCam) {
        const { pos: fp, yaw, pitch } = freeCam;
        const cy = Math.cos(pitch), sy = Math.sin(pitch), sx = Math.sin(yaw), cx = Math.cos(yaw);
        const lk = m4.lookAt(fp, [fp[0] + sx * cy, fp[1] + sy, fp[2] + cx * cy], [0, 1, 0]);
        M = m4.mul(m4.persp(58 * Math.PI / 180, IW / IH, 0.05, farCfg), lk);
        C = fp;
      }
      if (!M) return null;
      const w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
      if (w <= 1e-6) return null;                     // atrás da câmera
      const x = (M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12]) / w;
      const y = (M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13]) / w;
      if (x < -1.2 || x > 1.2 || y < -1.2 || y > 1.2) return null;   // fora da tela
      const c = C;
      return {
        x: (x * 0.5 + 0.5) * canvas.clientWidth,
        y: (1 - (y * 0.5 + 0.5)) * canvas.clientHeight,
        dist: c ? Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) : 0,
      };
    },
    /* troca tiers AO VIVO, sem recarregar a página. Só o de TEXTURA fica de
       fora: aquele é das PEÇAS, não do visor — mudar exige reconstruir as
       texturas de tudo, e quem faz isso é quem monta a cena.
       Cada campo é opcional; o que não vier fica como está. */
    aplicarTiers({ luz, sombra, particulas, res, aa, recon } = {}) {
      let refazQuadro = false;
      if (luz !== undefined) LT = LUZ_TIER[luz] ?? LT;
      if (sombra !== undefined) {
        const novoSM = SOMBRA_SM[sombra] ?? SM;
        sombraOn = sombra > 0;
        if (novoSM !== SM) {
          SM = novoSM;
          descartarFBO(shadowFBO);
          shadowFBO = makeFBO(SM, SM);   // sem `suave`: profundidade empacotada não pode interpolar
        }
      }
      if (particulas !== undefined) {
        const n = Math.max(0, particulas | 0);
        if (n !== NP) { NP = n; subirSementes(); }
      }
      if (res !== undefined) {
        const r = Math.max(160, res | 0);
        if (r !== RES) { RES = r; refazQuadro = true; }
      }
      if (aa !== undefined) {
        const esc = aa === 2 ? 2 : 1, suave = aa === 1 || aa === 2;
        if (esc !== AA_ESCALA || suave !== AA_SUAVE) { AA_ESCALA = esc; AA_SUAVE = suave; refazQuadro = true; }
      }
      if (recon !== undefined) RECON = recon ? 1 : 0;
      if (refazQuadro) { IW = RES * AA_ESCALA; refazerCena(); }
      subirUniformesDeTier();
    },
    /* camada de depuração desenhada por cima da cena. Passe [] (ou nada) pra
       desligar: a lista some do laço de desenho, então DESLIGADA não custa
       quadro nenhum — não é um lote invisível, é lote que não existe.
       As malhas vêm em CPU e sobem pra GPU aqui, uma vez por chamada; quem
       chama deve guardar o retorno e reusar em vez de remontar a cada toque. */
    depurar(lotesCPU) {
      extras = (lotesCPU || []).map((L) => ({
        mesh: L.mesh.buf ? L.mesh : glMesh(L.mesh),
        tex: L.tex.width ? glTex(L.tex) : L.tex,
        matriz: L.matriz || m4.ident(), rim: 0,
      }));
      return extras;
    },
    /* antesDoQuadro(dt, T): chamado TODO quadro, antes da câmera ser lida —
       o jogo.html usa isso pra integrar movimento (input -> pos/yaw/pitch ->
       setCam()) sempre imediatamente antes do frame que vai desenhá-lo. */
    rodar(onFrame, antesDoQuadro) {
      const fixedA = camOrbita ? null : (cam.a ?? 0.66);
      const eye = cam.e ?? camCfg.e ?? 1.15, rad = cam.r ?? camCfg.r ?? 5.4;
      function resize() { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr | 0; canvas.height = innerHeight * dpr | 0; }
      addEventListener('resize', () => { resize(); ajustarProporcao(); }); resize();
      let t0 = performance.now(), frames = 0, tPrev = performance.now();
      const draw = (prg, aL, comExtras) => {
        const uM = gl.getUniformLocation(prg, 'uModel');
        const uR = gl.getUniformLocation(prg, 'uRim');   // null no passe de profundidade
        const uTo = gl.getUniformLocation(prg, 'uToon');
        const uWnd = gl.getUniformLocation(prg, 'uWind');   // VENTO: existe nos DOIS passes (cena+depth)
        const uWF = gl.getUniformLocation(prg, 'uWindF');   // VENTO: ritmo por lote
        const base = semPalco ? lotes : [stage, ...lotes];
        /* extras só no passe de cor: colisor de depuração projetando sombra no
           chão confundiria mais do que ajuda */
        const all = comExtras && extras.length ? [...base, ...extras] : base;
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
        /* IH muda quando a janela muda de proporção, então a abertura é lida
           aqui e não uma vez só — senão o mundo volta a esticar ao redimensionar */
        const proj = m4.persp(58 * Math.PI/180, IW/IH, near, farCfg);
        const mvp = m4.mul(proj, lookAtM);
        mvpAtual = mvp; camAtualPos = camPos;   // guardados pra projetar()

        const mvpf = new Float32Array(mvp);
        // 1: sombra (tier 0 = só limpa pra "tudo lit"; pula os draw calls, o custo real)
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO.fb); gl.viewport(0, 0, SM, SM);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(1,1,1,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (sombraOn) {
          gl.useProgram(depthProg); gl.uniformMatrix4fv(gl.getUniformLocation(depthProg,'uLMVP'), false, lMVPf);
          gl.uniform1i(gl.getUniformLocation(depthProg,'uTex'), 0);
          gl.uniform2f(gl.getUniformLocation(depthProg,'uWindDir'), windDir[0], windDir[1]);   // VENTO
          gl.uniform1f(gl.getUniformLocation(depthProg,'uWindT'), windT);                        // VENTO
          draw(depthProg, DL, false);
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
        gl.uniform1f(gl.getUniformLocation(scene,'uDebug'), DEBUG);   // modo geometria (D-65)
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
        draw(scene, AL, true);
        // partículas (pólen do palco — paisagens desligam)
        if (!semParts) {
          gl.useProgram(parts); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
          gl.uniformMatrix4fv(gl.getUniformLocation(parts,'uMVP'), false, mvpf);
          gl.uniform1f(gl.getUniformLocation(parts,'uT'), T); gl.uniform3fv(gl.getUniformLocation(parts,'uCam'), camPos);
          gl.bindBuffer(gl.ARRAY_BUFFER, partVBO); gl.enableVertexAttribArray(PA); gl.vertexAttribPointer(PA, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, NP); gl.depthMask(true); gl.disable(gl.BLEND);
        }
        // 3: pra tela — cópia direta ou reconstrução
        const fonte = sceneFBO.tex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.DEPTH_TEST);
        if (RECON) {
          gl.useProgram(recon);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fonte);
          gl.uniform1i(R_TEX, 0); gl.uniform2f(R_TEXEL, 1 / IW, 1 / IH); gl.uniform1f(R_NITIDEZ, 0.42);
          gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO); gl.enableVertexAttribArray(RA); gl.vertexAttribPointer(RA, 2, gl.FLOAT, false, 0, 0);
        } else {
          gl.useProgram(blit);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fonte); gl.uniform1i(BT, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO); gl.enableVertexAttribArray(BA); gl.vertexAttribPointer(BA, 2, gl.FLOAT, false, 0, 0);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        frames++;
        if (now - t0 >= 500) { if (onFrame) onFrame(Math.round(frames * 1000 / (now - t0))); frames = 0; t0 = now; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    /* funcao, nao valor: os tiers trocam ao vivo, entao um retrato
       tirado na criacao passa a mentir no primeiro ajuste */
    info: () => `${IW}×${IH}`,
    renderer: gl.getParameter(gl.RENDERER) || '',
  };
  return visor;
}
