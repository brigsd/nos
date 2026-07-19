/* input.js — teclado/mouse (desktop) + joystick touch, pro alicerce jogável
   do v3 (D-61). Os joysticks portam FIEL as 3 correções pagas caro na v2
   (D-47/48/49): dono VIVO nunca é roubado por um 2º dedo, dono FANTASMA
   (o up se perdeu — gesto do Android engole) é destronado por um toque
   novo, watchdog por quadro reseta o que ninguém soltou, e a rede de
   touchend/touchcancel com 0 dedos zera tudo — touch é um canal SEPARADO
   dos pointer events, cobre quando o outro rasga. Reinventar isso do zero
   seria repetir os 3 bugs que essas decisões já pagaram. */

export function criarInput({ stageEl, onPause }) {
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { onPause?.(); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  /* olhar por mouse (pointer lock, desktop) */
  let mdx = 0, mdy = 0;
  /* sobra do quadro anterior, do amortecimento em `mouseLookDelta` */
  let restoX = 0, restoY = 0;
  const isLocked = () => document.pointerLockElement === stageEl;
  stageEl.addEventListener('click', () => { if (!isTouch) stageEl.requestPointerLock?.(); });
  addEventListener('mousemove', (e) => { if (isLocked()) { mdx += e.movementX; mdy += e.movementY; } });

  /* joysticks touch — porta fiel do D-47/48/49 */
  const JOY = { lx: 0, ly: 0, rx: 0, ry: 0 };
  const STICKS = [];
  const ACTIVE_PTRS = new Set();
  addEventListener('pointerdown', (e) => ACTIVE_PTRS.add(e.pointerId), true);
  addEventListener('pointerup', (e) => ACTIVE_PTRS.delete(e.pointerId), true);
  addEventListener('pointercancel', (e) => ACTIVE_PTRS.delete(e.pointerId), true);
  addEventListener('blur', () => ACTIVE_PTRS.clear());

  function bindStick(el, isLeft) {
    if (!el) return;
    const knob = el.firstElementChild;
    let pid = null;
    const setFrom = (e) => {
      const r = el.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy), cap = r.width * 0.4;
      if (m > cap) { dx = (dx / m) * cap; dy = (dy / m) * cap; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / cap, ny = dy / cap;
      if (isLeft) { JOY.lx = nx; JOY.ly = ny; } else { JOY.rx = nx; JOY.ry = ny; }
    };
    const reset = () => {
      pid = null;
      knob.style.transform = 'translate(-50%, -50%)';
      if (isLeft) { JOY.lx = 0; JOY.ly = 0; } else { JOY.rx = 0; JOY.ry = 0; }
    };
    el.addEventListener('pointerdown', (e) => {
      if (pid !== null && ACTIVE_PTRS.has(pid) && e.pointerId !== pid) return;   // dono vivo não é roubado
      pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch { /* toque já morto: as redes cobrem */ }
      setFrom(e); e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) setFrom(e); });
    el.addEventListener('pointerup', (e) => { if (e.pointerId === pid) reset(); });
    el.addEventListener('pointercancel', reset);
    el.addEventListener('lostpointercapture', reset);
    STICKS.push({ owns: (id) => pid === id, reset, guard: () => { if (pid !== null && !ACTIVE_PTRS.has(pid)) reset(); } });
  }
  const nukeSticks = (e) => { if (e.touches && e.touches.length === 0) { ACTIVE_PTRS.clear(); for (const s of STICKS) s.reset(); } };
  addEventListener('touchend', nukeSticks, { capture: true, passive: true });
  addEventListener('touchcancel', nukeSticks, { capture: true, passive: true });
  addEventListener('pointerup', (e) => { for (const s of STICKS) if (s.owns(e.pointerId)) s.reset(); });
  addEventListener('pointercancel', (e) => { for (const s of STICKS) if (s.owns(e.pointerId)) s.reset(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });

  const isTouch = matchMedia('(pointer: coarse)').matches;
  function clear() { keys.clear(); mdx = 0; mdy = 0; restoX = 0; restoY = 0; for (const s of STICKS) s.reset(); }

  return {
    isTouch,
    bindSticks(elL, elR) { bindStick(elL, true); bindStick(elR, false); },
    /* eixo de movimento (-1..1, já normalizado): WASD + stick esquerdo somados */
    moveAxis() {
      let x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      let z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      x += JOY.lx; z -= JOY.ly;
      const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
      return { x, z };
    },
    /* delta de olhar do MOUSE (pixels acumulados desde a última leitura, zera ao ler)

       `tau` em segundos liga o amortecimento; 0 devolve o acumulado cru.

       Por que existe: mouse comum lê a 125Hz e a tela atualiza a 120Hz. As
       duas taxas não se dividem, então uns quadros recebem duas leituras,
       outros nenhuma. O acumulado fica CERTO, o ritmo não — medido aqui em
       pico/mediana 2.42 com 4.6% de quadros vazios. Cada quadro sai nítido e
       mesmo assim o giro parece deixar rastro, porque a câmera anda aos
       trancos.

       O amortecimento NÃO descarta movimento: o que não é aplicado agora fica
       no `resto` e entra nos quadros seguintes. A soma no fim de um giro é
       idêntica à do mouse, então a mira não sai do lugar — só o caminho até
       lá deixa de ser em degraus. O custo é atraso de cerca de um quadro.

       O `tau` acompanha o dt em vez de ser fração fixa, senão o mesmo número
       amorteceria mais a 240fps que a 60. */
    mouseLookDelta(dt = 0, tau = 0) {
      restoX += mdx; restoY += mdy; mdx = 0; mdy = 0;
      if (!(tau > 0) || !(dt > 0)) { const d = { dx: restoX, dy: restoY }; restoX = 0; restoY = 0; return d; }
      const k = 1 - Math.exp(-dt / tau);
      const dx = restoX * k, dy = restoY * k;
      restoX -= dx; restoY -= dy;
      /* sobra minúscula vira arrasto perpétuo e mira que nunca assenta */
      if (Math.abs(restoX) < 0.01) restoX = 0;
      if (Math.abs(restoY) < 0.01) restoY = 0;
      return { dx, dy };
    },
    /* eixo CONTÍNUO do stick direito (-1..1) — o chamador multiplica por taxa×dt */
    stickLook() { return { rx: JOY.rx, ry: JOY.ry }; },
    /* verifica se Shift esquerdo ou direito está pressionado (sprint) */
    shiftHeld() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    guard() { for (const s of STICKS) s.guard(); },   // watchdog por quadro (D-48)
    clear,
  };
}
