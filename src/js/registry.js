// Register pattern: every external fact is exactly one record with a state.
// state: 'stated' | 'absent' | 'unconfirmed'. Absent / unconfirmed render inert.
export const REGISTER = {
  ca: { state: 'absent', value: null },
  x: { state: 'stated', url: 'https://x.com/TryComnex' },
  github: { state: 'absent', url: null },
  chain: { state: 'stated', name: 'Solana', network: 'mainnet', rpc: 'https://solana-rpc.publicnode.com' },
  market: {
    state: 'stated',
    boosts: 'https://api.dexscreener.com/token-boosts/top/v1',
    tokens: 'https://api.dexscreener.com/tokens/v1/solana/',
    dexOwn: 'https://api.dexscreener.com/latest/dex/tokens/',
    pumpOwn: 'https://frontend-api.pump.fun/coins/'
  }
};

export const isStated = (rec) => !!rec && rec.state === 'stated' && !!(rec.value || rec.url || rec.rpc || rec.boosts);

// Link rule: store the URL, derive the handle. Unstated records yield null (no href).
export function hrefOf(rec) { return isStated(rec) && rec.url ? rec.url : null; }
export function handleOf(rec) {
  const href = hrefOf(rec);
  if (!href) return null;
  try { return new URL(href).pathname.split('/').filter(Boolean)[0] || null; } catch { return null; }
}
export const caValue = (reg = REGISTER) => (isStated(reg.ca) ? reg.ca.value : null);
