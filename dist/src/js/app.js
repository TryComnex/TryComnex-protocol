import { REGISTER, hrefOf, handleOf, caValue } from './registry.js';
import { verifyAddress } from './gate.js';
import { ownModel, dedupeTrending } from './ownrow.js';
import { fetchTrending, fetchOwn, fetchSlot, withBackoff, createPoller } from './market.js';
import { fmtPrice, fmtCompact, fmtChange, fmtInt, DASH } from './fmt.js';
import { countTo, initReveal, initParallax, initSpotlight, initProgress } from './spring.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CA = caValue();
const state = { trending: null, own: ownModel(CA, null, null), trendingFailed: false };

/* ---------- registry-driven chrome ---------- */
function wireSocials() {
  const x = $('#social-x'), cta = $('#cta-x');
  const href = hrefOf(REGISTER.x), handle = handleOf(REGISTER.x);
  for (const a of [x, cta]) {
    if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
  }
  if (handle) x.setAttribute('aria-label', `@${handle} on X`);
  const gh = hrefOf(REGISTER.github);
  if (gh) {
    const a = el('a', 'icon-btn'); a.href = gh; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.id = 'social-gh';
    a.setAttribute('aria-label', 'GitHub'); a.innerHTML = $('#social-gh').innerHTML; $('#social-gh').replaceWith(a);
  }
  $('#rpc-host').textContent = new URL(REGISTER.chain.rpc).host;
}

function wireCA() {
  const slot = $('#ca-slot');
  if (!CA) {
    slot.innerHTML = '<span class="ca-text ca-inert">To be announced. Nothing here is official until it appears in this bar.</span>';
    $('#ca-bar').classList.add('inert');
    return;
  }
  const btn = el('button', 'ca-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Copy contract address');
  btn.innerHTML = `<span class="ca-text mono">${esc(CA)}</span><span class="ca-copy"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg><span class="ca-fb" aria-live="polite">Copy</span></span>`;
  btn.addEventListener('click', async () => {
    const fb = $('.ca-fb', btn);
    try { await navigator.clipboard.writeText(CA); fb.textContent = 'Copied'; }
    catch {
      const ta = el('textarea'); ta.value = CA; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); fb.textContent = 'Copied'; } catch { fb.textContent = 'Press Ctrl+C'; }
      ta.remove();
    }
    btn.classList.add('copied');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { fb.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
  });
  slot.appendChild(btn);
  $('#own-ca-state').textContent = 'Stated';
  $('#token-tag').textContent = 'Live';
}

/* ---------- logos ---------- */
function logoNode(urls, letter, cls = 'tok-img') {
  const list = urls.filter(Boolean);
  const tile = () => el('div', 'tok-img tok-letter', esc((letter || '?').slice(0, 1).toUpperCase()));
  if (!list.length) return tile();
  const img = new Image();
  img.className = cls; img.alt = ''; img.width = 30; img.height = 30; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  let i = 0;
  img.onerror = () => { i++; if (i < list.length) img.src = list[i]; else img.replaceWith(tile()); };
  img.src = list[0];
  return img;
}

/* ---------- board ---------- */
const rowsEl = () => $('#board-rows');
const rowCache = new Map();

function cell(cls, text) { return el('span', cls, esc(text)); }

function buildRow(model, index, { own = false, placeholder = false } = {}) {
  const tag = !placeholder && model.url ? 'a' : 'div';
  const r = el(tag, 'trow spot' + (own ? ' own-row' : ''));
  r.setAttribute('role', 'row');
  if (tag === 'a') { r.href = model.url; r.target = '_blank'; r.rel = 'noopener noreferrer'; }
  if (placeholder) r.setAttribute('aria-disabled', 'true');
  r.appendChild(cell('idx mono dim', String(index)));
  const tk = el('span', 'tk');
  tk.appendChild(logoNode(model.logos || [model.logo], model.symbol));
  tk.appendChild(el('span', 'tk-t', `<b class="trunc">${esc(model.symbol)}</b><small class="trunc dim">${esc(model.name)}</small>`));
  r.appendChild(tk);
  const px = cell('r mono px'), ch = cell('r mono ch'), vol = cell('r mono c-vol'), liq = cell('r mono c-liq');
  r.append(px, ch, vol, liq);
  r._cells = { px, ch, vol, liq };
  return r;
}

const DOTS = '· · · · ·';
function fillRow(r, m, placeholder = false) {
  const c = r._cells;
  if (placeholder) { for (const k of ['px', 'ch', 'vol', 'liq']) { c[k].textContent = DOTS; c[k].classList.add('dim'); } return; }
  countTo(c.px, m.price, fmtPrice);
  countTo(c.ch, m.change, fmtChange);
  c.ch.classList.toggle('up', m.change != null && m.change > 0);
  c.ch.classList.toggle('down', m.change != null && m.change < 0);
  countTo(c.vol, m.volume, fmtCompact);
  countTo(c.liq, m.liquidity, fmtCompact);
}

function skeletonRows(n, start) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const r = el('div', 'trow skel-row');
    r.setAttribute('aria-hidden', 'true');
    r.innerHTML = `<span class="idx mono dim">${start + i}</span><span class="tk"><i class="skel-dot"></i><span class="skel-lines"><i class="skel-bar"></i><i class="skel-bar thin"></i></span></span><i class="skel-bar r"></i><i class="skel-bar r"></i><i class="skel-bar r c-vol"></i><i class="skel-bar r c-liq"></i>`;
    frag.appendChild(r);
  }
  return frag;
}

let ownRow = null;
function renderOwn() {
  const m = state.own;
  const placeholder = m.state === 'placeholder';
  const key = placeholder ? 'ph' : 'live:' + (m.url || '') + m.symbol;
  if (!ownRow || ownRow._key !== key) {
    const fresh = buildRow(m, 1, { own: true, placeholder });
    fresh._key = key;
    if (ownRow) ownRow.replaceWith(fresh); else rowsEl().prepend(fresh);
    ownRow = fresh;
  }
  fillRow(ownRow, m, placeholder);
  $('#own-sym').textContent = m.symbol;
  const mini = $('#own-px-mini');
  if (placeholder) mini.textContent = DOTS; else countTo(mini, m.price, fmtPrice);
}

function renderTrending() {
  const host = rowsEl();
  const data = state.trending;
  if (!data) {
    if (!host.querySelector('.skel-row') && !rowCache.size) host.appendChild(skeletonRows(9, 2));
    if (state.trendingFailed) showDashRows();
    return;
  }
  host.querySelectorAll('.skel-row, .dash-row').forEach((n) => n.remove());
  const rows = dedupeTrending(data, CA).slice(0, 9);
  const keep = new Set(rows.map((r) => r.address));
  for (const [k, node] of rowCache) if (!keep.has(k)) { node.remove(); rowCache.delete(k); }
  rows.forEach((m, i) => {
    let node = rowCache.get(m.address);
    const first = !node;
    if (first) {
      node = buildRow(m, i + 2);
      node.classList.add('rowin');
      node.style.setProperty('--i', i);
      rowCache.set(m.address, node);
    } else { node.querySelector('.idx').textContent = String(i + 2); }
    fillRow(node, m);
    host.appendChild(node); // keeps order
  });
  $('#board-count').textContent = `${data.length} tracked`;
  $('#board-note').hidden = true;
}

function showDashRows() {
  const host = rowsEl();
  host.querySelectorAll('.skel-row').forEach((n) => n.remove());
  if (host.querySelector('.dash-row')) return;
  for (let i = 0; i < 9; i++) {
    const r = el('div', 'trow dash-row');
    r.innerHTML = `<span class="idx mono dim">${i + 2}</span><span class="tk"><div class="tok-img tok-letter">${DASH}</div><span class="tk-t"><b>${DASH}</b><small class="dim">${DASH}</small></span></span><span class="r mono">${DASH}</span><span class="r mono">${DASH}</span><span class="r mono c-vol">${DASH}</span><span class="r mono c-liq">${DASH}</span>`;
    host.appendChild(r);
  }
  const n = $('#board-note'); n.hidden = false; n.textContent = 'The market source did not answer. Retrying with a growing pause.';
}

/* ---------- ticker + signals + status ---------- */
function renderTicker() {
  const t = $('#ticker');
  if (!state.trending) {
    if (!t.children.length) t.innerHTML = Array.from({ length: 8 }, () => '<span class="tick skel-tick"><i class="skel-bar"></i></span>').join('');
    return;
  }
  const items = state.trending.map((m) => {
    const dir = m.change > 0 ? 'up' : m.change < 0 ? 'down' : '';
    const logo = m.logo ? `<img src="${esc(m.logo)}" width="20" height="20" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tick-letter',textContent:'${esc((m.symbol || '?')[0])}'}))">` : `<span class="tick-letter">${esc((m.symbol || '?')[0])}</span>`;
    return `<span class="tick">${logo}<b>${esc(m.symbol)}</b><span class="mono">${fmtPrice(m.price)}</span><span class="mono ${dir}">${fmtChange(m.change)}</span></span>`;
  }).join('');
  t.innerHTML = `<div class="ticker-set">${items}</div><div class="ticker-set" aria-hidden="true">${items}</div>`;
}

function renderSignals() {
  const d = state.trending;
  if (!d) return;
  countTo($('#sig-count'), d.length, fmtInt);
  countTo($('#sig-vol'), d.reduce((a, m) => a + (m.volume || 0), 0), fmtCompact);
  countTo($('#sig-liq'), d.reduce((a, m) => a + (m.liquidity || 0), 0), fmtCompact);
  const top = [...d].filter((m) => m.change != null).sort((a, b) => b.change - a.change)[0];
  $('#sig-top').textContent = top ? `${top.symbol} ${fmtChange(top.change)}` : DASH;
}

function setStatus(kind, text) {
  const p = $('#status'); p.dataset.kind = kind; $('#status-text').textContent = text;
}

/* ---------- data loops ---------- */
const marketPoller = createPoller(async () => {
  try {
    state.trending = await withBackoff(() => fetchTrending(), 3, 1000);
    state.trendingFailed = false;
    setStatus('live', 'Live');
    renderTrending(); renderTicker(); renderSignals();
  } catch (e) {
    // keep last good data; only dash out when nothing was ever loaded
    if (!state.trending) state.trendingFailed = true;
    setStatus('error', state.trending ? 'Stale data' : 'Source offline');
    renderTrending();
    throw e;
  }
});

const slotPoller = createPoller(async () => {
  const n = await withBackoff(() => fetchSlot(), 2, 1000);
  countTo($('#slot'), n, fmtInt, { flash: false });
});

const ownPoller = CA ? createPoller(async () => {
  const { dex, pump } = await fetchOwn(CA); // dex + pump in parallel, independent
  if (!dex && !pump) throw new Error('own-unavailable');
  state.own = ownModel(CA, dex, pump);
  renderOwn(); renderTrending();
}) : null;

/* ---------- address check ---------- */
function wireCheck() {
  const input = $('#addr-in'), out = $('#addr-out'), msg = $('#addr-msg');
  const text = {
    empty: ['idle', 'Waiting for an address.'],
    malformed: ['warn', 'That does not look like an address.'],
    'no-reference': ['warn', 'No contract address has been announced, so no address can be called official yet.'],
    match: ['ok', 'Match. This is the official contract address.'],
    mismatch: ['warn', 'No match. This is not the official contract address.']
  };
  input.addEventListener('input', () => {
    const [kind, t] = text[verifyAddress(input.value, REGISTER).kind];
    out.dataset.kind = kind; msg.textContent = t;
  });
}

/* ---------- boot ---------- */
function boot() {
  wireSocials(); wireCA(); wireCheck();
  renderOwn(); renderTrending(); renderTicker();
  const cs = getComputedStyle(document.documentElement);
  const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = cs.getPropertyValue('--c-bg').trim(); document.head.appendChild(meta);
  initReveal(); initParallax(); initSpotlight(); initProgress($('#progress'));
  marketPoller.start(); slotPoller.start(); if (ownPoller) ownPoller.start();
}
boot();
