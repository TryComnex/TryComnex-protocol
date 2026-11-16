export const DASH = '—';

export function fmtPrice(n) {
  if (n == null || !isFinite(n)) return DASH;
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n === 0) return '$0';
  const d = Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return '$' + n.toFixed(d);
}

export function fmtCompact(n) {
  if (n == null || !isFinite(n)) return DASH;
  const a = Math.abs(n);
  const u = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  return '$' + (n / u[0]).toFixed(u[1] ? 2 : 0) + u[1];
}

export function fmtChange(n) {
  if (n == null || !isFinite(n)) return DASH;
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

export const fmtInt = (n) => (n == null || !isFinite(n) ? DASH : Math.round(n).toLocaleString('en-US'));
