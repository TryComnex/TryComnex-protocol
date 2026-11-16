// Damped spring solver (semi-implicit Euler, fixed 1/240s substep). Defaults mirror the studied
// reference's motion config: stiffness 480, damping 36, mass 1.
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function spring({ from = 0, to = 1, stiffness = 480, damping = 36, mass = 1, delay = 0, onUpdate, onDone }) {
  if (reduced()) { onUpdate(to); if (onDone) onDone(); return () => {}; }
  let x = from, v = 0, last = 0, raf = 0, cancelled = false;
  const step = 1 / 240;
  const tick = (now) => {
    if (cancelled) return;
    if (!last) last = now;
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const h = Math.min(step, dt);
      const a = (-stiffness * (x - to) - damping * v) / mass;
      v += a * h; x += v * h; dt -= h;
    }
    const done = Math.abs(x - to) < 0.0008 && Math.abs(v) < 0.01;
    onUpdate(done ? to : x);
    if (done) { if (onDone) onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  const t = setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
  return () => { cancelled = true; clearTimeout(t); cancelAnimationFrame(raf); };
}

// Number count-up driven by a softer spring. Flashes up/down on value change.
export function countTo(el, to, format, { flash = true } = {}) {
  const from = el._val;
  if (el._cancel) el._cancel();
  if (to == null || !isFinite(to)) { el._val = null; el.textContent = format(null); return; }
  if (from == null || from === to || reduced()) { el._val = to; el.textContent = format(to); return; }
  if (flash) {
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(to > from ? 'flash-up' : 'flash-down');
  }
  el._cancel = spring({
    from, to, stiffness: 170, damping: 26,
    onUpdate: (n) => { el.textContent = format(n); el._val = n; },
    onDone: () => { el._val = to; el.textContent = format(to); }
  });
}

export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (reduced()) { els.forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); return; }
  els.forEach((e) => { e.style.opacity = 0; e.style.transform = 'translateY(12px)'; });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const i = Number(en.target.dataset.reveal) || 0;
      spring({
        delay: 50 + i * 50,
        onUpdate: (p) => { en.target.style.opacity = Math.min(1, Math.max(0, p)); en.target.style.transform = `translateY(${(1 - p) * 12}px)`; },
        onDone: () => { en.target.style.transform = 'none'; en.target.style.opacity = 1; }
      });
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
  els.forEach((e) => io.observe(e));
}

export function initParallax() {
  const layers = [...document.querySelectorAll('[data-depth]')];
  if (!layers.length || reduced()) return;
  let px = 0, py = 0, tx = 0, ty = 0, sy = 0, raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
  addEventListener('scroll', () => { sy = scrollY; kick(); }, { passive: true });
  function loop() {
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    for (const l of layers) {
      const d = Number(l.dataset.depth);
      l.style.transform = `translate3d(${px * d * -40}px, ${py * d * -40 + sy * d * 0.12}px, 0)`;
    }
    raf = (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001) ? requestAnimationFrame(loop) : 0;
  }
  kick();
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.spot');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', e.clientX - r.left + 'px');
    t.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}

export function initProgress(bar) {
  const set = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', set, { passive: true });
  addEventListener('resize', set);
  set();
}
