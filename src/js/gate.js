// Gate warning: match address-shaped strings against the stated registry.
// Never blanket-reject 0x hex — a 0x string is only flagged when it matches nothing stated.
const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const HEX = /0x[0-9a-fA-F]{40}/g;

export const looksLikeAddress = (s) =>
  /^0x[0-9a-fA-F]{40}$/.test(s) ||
  (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s));

export function statedValues(reg) {
  const out = new Set();
  for (const rec of Object.values(reg)) {
    if (rec && rec.state === 'stated') for (const v of [rec.value, rec.url, rec.rpc]) if (v) out.add(v);
  }
  return out;
}

// Text scan. The stated CA is exempt (it is meant to appear everywhere).
export function scanText(text, reg) {
  const stated = [...statedValues(reg)];
  const ca = reg.ca && reg.ca.state === 'stated' ? reg.ca.value : null;
  const hex = text.match(HEX) || [];
  const rest = text.replace(HEX, ' '); // a 0x string must not also be counted as base58
  const hits = [...(rest.match(B58) || []), ...hex].filter(looksLikeAddress);
  return [...new Set(hits)].filter((h) => h !== ca && !stated.some((s) => s.includes(h)));
}

// Interactive verification of a pasted string against the registry.
export function verifyAddress(input, reg) {
  const v = String(input || '').trim();
  if (!v) return { kind: 'empty' };
  if (!looksLikeAddress(v)) return { kind: 'malformed' };
  const ca = reg.ca && reg.ca.state === 'stated' ? reg.ca.value : null;
  if (!ca) return { kind: 'no-reference' };
  return v === ca ? { kind: 'match' } : { kind: 'mismatch' };
}
