// Own-token model. Pure functions: no DOM, no network — testable in both CA branches.
export const BRAND_LOGO = './logo-192.png';

export function pickPair(pairs) {
  const list = Array.isArray(pairs) ? pairs.filter(Boolean) : [];
  if (!list.length) return null;
  return [...list].sort((a, b) => (b?.volume?.h24 ?? 0) - (a?.volume?.h24 ?? 0))[0];
}

export function ownModel(ca, dex, pump) {
  if (!ca) {
    return { state: 'placeholder', symbol: 'COMNEX', name: 'Comnex', logos: [BRAND_LOGO], price: null, change: null, volume: null, liquidity: null, url: null };
  }
  const pair = pickPair(dex && dex.pairs);
  // Logo order: pump.fun image_uri -> DexScreener -> brand/ folder -> letter tile (UI fallback)
  const logos = [pump && pump.image_uri, pair && pair.info && pair.info.imageUrl, BRAND_LOGO].filter(Boolean);
  return {
    state: 'live',
    symbol: (pair && pair.baseToken && pair.baseToken.symbol) || (pump && pump.symbol) || 'COMNEX',
    name: (pair && pair.baseToken && pair.baseToken.name) || (pump && pump.name) || 'Comnex',
    logos,
    price: pair ? Number(pair.priceUsd) || null : null,
    change: pair && pair.priceChange ? pair.priceChange.h24 ?? null : null,
    volume: pair && pair.volume ? pair.volume.h24 ?? null : null,
    liquidity: pair && pair.liquidity ? pair.liquidity.usd ?? null : null,
    url: pair ? pair.url || null : null
  };
}

// Dedup: the own token never appears in trending rows 2-10.
export const dedupeTrending = (rows, ca) => (ca ? rows.filter((r) => r.address !== ca) : rows);
