import { REGISTER } from './registry.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, opts = {}, timeout = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

// Exponential backoff: 1s, 2s, 4s between attempts.
export async function withBackoff(fn, tries = 3, base = 1000) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await sleep(base * 2 ** i); }
  }
  throw last;
}

function bestPair(pairs) {
  const list = (pairs || []).filter((p) => p && p.chainId === 'solana');
  return list.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] || null;
}

// Market follows the market-source record only. The CA record is never read here.
export async function fetchTrending(reg = REGISTER) {
  const m = reg.market;
  const boosts = await getJSON(m.boosts);
  const seen = new Set();
  const top = (Array.isArray(boosts) ? boosts : [])
    .filter((b) => b && b.chainId === 'solana' && b.tokenAddress && !seen.has(b.tokenAddress) && seen.add(b.tokenAddress))
    .sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0))
    .slice(0, 10);
  if (!top.length) throw new Error('empty');
  const details = await Promise.allSettled(top.map((b) => getJSON(m.tokens + b.tokenAddress)));
  const rows = [];
  details.forEach((d, i) => {
    if (d.status !== 'fulfilled') return;
    const p = bestPair(d.value);
    if (!p) return;
    rows.push({
      address: top[i].tokenAddress,
      symbol: p.baseToken?.symbol || '?',
      name: p.baseToken?.name || '',
      logo: p.info?.imageUrl || top[i].icon || null,
      price: p.priceUsd != null ? Number(p.priceUsd) : null,
      change: p.priceChange?.h24 ?? null,
      volume: p.volume?.h24 ?? null,
      liquidity: p.liquidity?.usd ?? null,
      url: p.url || null
    });
  });
  if (!rows.length) throw new Error('no-details');
  return rows;
}

// Own token: DexScreener and pump.fun fetched in parallel; neither blocks the other.
export async function fetchOwn(ca, reg = REGISTER) {
  const m = reg.market;
  const [dex, pump] = await Promise.allSettled([getJSON(m.dexOwn + ca), getJSON(m.pumpOwn + ca)]);
  return { dex: dex.status === 'fulfilled' ? dex.value : null, pump: pump.status === 'fulfilled' ? pump.value : null };
}

export async function fetchSlot(reg = REGISTER) {
  const j = await getJSON(reg.chain.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' })
  });
  if (typeof j.result !== 'number') throw new Error('rpc');
  return j.result;
}

// Poll every 60s; pause while hidden; fetch immediately when visible again.
// After a failed cycle the next try backs off 5s,10s,20s,40s then caps at 60s.
export function createPoller(task, { interval = 60000 } = {}) {
  let timer = null, fails = 0, running = false, stopped = false;
  const schedule = (ms) => { clearTimeout(timer); if (!stopped && !document.hidden) timer = setTimeout(run, ms); };
  async function run() {
    if (running || document.hidden) return;
    running = true;
    try { await task(); fails = 0; schedule(interval); }
    catch { fails++; schedule(Math.min(interval, 5000 * 2 ** (fails - 1))); }
    finally { running = false; }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else run(); });
  return { start: run, stop() { stopped = true; clearTimeout(timer); }, refresh: run };
}
