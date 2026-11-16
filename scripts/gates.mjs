// Gates: run against dist/. Exit 0 only if every gate passes.
import { readFile, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeMutant, currentCaState, TEST_CA } from './mutate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, process.env.COMNEX_OUT || 'dist');
const results = [];
const gate = async (name, fn) => {
  try { await fn(); results.push([name, true]); console.log('  PASS  ' + name); }
  catch (e) { results.push([name, false, e.message]); console.log('  FAIL  ' + name + '\n        ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
async function walk(dir, skip = []) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, skip)); else out.push(p);
  }
  return out;
}
const isText = (f) => /\.(html|css|js|mjs|json|md|svg|txt)$/i.test(f) || path.basename(f) === 'LICENSE';

const files = await walk(dist);
const textFiles = files.filter(isText);
const read = (f) => readFile(f, 'utf8');
const index = await read(path.join(dist, 'index.html'));
const reg = await import(pathToFileURL(path.join(dist, 'src/js/registry.js')).href);
const gateMod = await import(pathToFileURL(path.join(dist, 'src/js/gate.js')).href);
const own = await import(pathToFileURL(path.join(dist, 'src/js/ownrow.js')).href);
const market = await import(pathToFileURL(path.join(dist, 'src/js/market.js')).href);

console.log('COMNEX gates  (' + path.relative(root, dist) + ')');

await gate('logo files copied into dist/ and non-empty', async () => {
  for (const f of ['logo-512.png', 'logo-192.png']) { const s = await stat(path.join(dist, f)); ok(s.size > 1000, f + ' missing/empty'); }
});
await gate('index.html references logo with correct relative path', async () => {
  ok(index.includes('src="./logo-192.png"') && index.includes('src="./logo-512.png"'), 'logo src not found');
  ok(own.BRAND_LOGO === './logo-192.png' && await exists(path.join(dist, own.BRAND_LOGO)), 'BRAND_LOGO path does not resolve in dist');
});
await gate('every relative src/href in index.html resolves inside dist', async () => {
  const refs = [...index.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  ok(refs.length > 5, 'too few refs');
  for (const r of refs) ok(await exists(path.join(dist, r)), 'missing ' + r);
});
await gate('favicon is SVG 32x32 and linked', async () => {
  const s = await read(path.join(dist, 'favicon.svg'));
  ok(/viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s), 'not 32x32');
  ok(index.includes('rel="icon"') && index.includes('./favicon.svg'), 'not linked');
});
await gate('every relative JS import resolves', async () => {
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    for (const m of (await read(f)).matchAll(/from\s+'(\.[^']+)'/g)) ok(await exists(path.resolve(path.dirname(f), m[1])), `${path.basename(f)} -> ${m[1]}`);
  }
});
await gate('colour literals live only in tokens.css', async () => {
  for (const f of textFiles) {
    if (f.endsWith('tokens.css') || f.endsWith('favicon.svg')) continue;
    const t = await read(f);
    if (/(^|[^&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.test(t.replace(/&#\d+;/g, '').replace(/href="#[^"]*"/g, '').replace(/url\(#[^)]*\)/g, ''))) {
      const m = t.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      if (!/href=/.test(m ? t.slice(Math.max(0, t.indexOf(m[0]) - 8), t.indexOf(m[0])) : '')) throw new Error(path.relative(dist, f) + ' has ' + m[0]);
    }
  }
});
await gate('no ch units in CSS', async () => {
  for (const f of files.filter((x) => x.endsWith('.css'))) ok(!/\d(\.\d+)?ch\b/.test(await read(f)), path.basename(f));
});
await gate('no dates, timestamps or "as of" copy anywhere', async () => {
  const bad = /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\bas of\b|\bchecked\b|\blast updated\b|\b\d{1,2}:\d{2}(:\d{2})?\b/i;
  for (const f of textFiles) {
    if (f.endsWith('.svg')) continue; // path coordinates, not visible text
    const t = (await read(f)).replace(/wght@[\d;]+/g, '').replace(/animation-delay:[^;]+/g, '');
    const m = t.match(bad);
    ok(!m, path.relative(dist, f) + ' -> "' + (m && m[0]) + '"');
  }
});
await gate('address scanner: zero unregistered address-shaped strings in dist (CA exempt)', async () => {
  for (const f of textFiles) {
    const hits = gateMod.scanText(await read(f), reg.REGISTER);
    ok(hits.length === 0, path.relative(dist, f) + ' -> ' + hits.join(','));
  }
});
await gate('gate warning does not blanket-reject 0x hex', async () => {
  const hex = '0x' + 'ab12'.repeat(10);
  const withHex = { ca: { state: 'stated', value: hex }, x: { state: 'absent' } };
  ok(gateMod.scanText('see ' + hex, withHex).length === 0, 'stated 0x was rejected');
  ok(gateMod.scanText('see ' + hex, { ca: { state: 'absent', value: null } }).length === 1, 'unknown 0x not flagged');
  ok(gateMod.verifyAddress(hex, withHex).kind === 'match', '0x did not verify against registry');
});
await gate('gate warning matches stated CA / exempts CA / handles absent', async () => {
  const stated = { ca: { state: 'stated', value: TEST_CA } };
  ok(gateMod.scanText(TEST_CA, stated).length === 0, 'CA not exempt');
  ok(gateMod.verifyAddress(TEST_CA, stated).kind === 'match', 'no match');
  ok(gateMod.verifyAddress(TEST_CA.replace('So', 'Sx'), stated).kind === 'mismatch', 'no mismatch');
  ok(gateMod.verifyAddress(TEST_CA, { ca: { state: 'absent' } }).kind === 'no-reference', 'absent not inert');
  ok(gateMod.verifyAddress('hello', stated).kind === 'malformed', 'malformed');
});
await gate('register: unstated records render inert (no href)', async () => {
  ok(reg.hrefOf(reg.REGISTER.github) === null && reg.REGISTER.github.state === 'absent', 'github should be inert');
  ok(reg.hrefOf({ state: 'unconfirmed', url: 'https://x.com/q' }) === null, 'unconfirmed has href');
  ok(reg.hrefOf(reg.REGISTER.x) === 'https://x.com/TryComnex' && reg.handleOf(reg.REGISTER.x) === 'TryComnex', 'x link/handle');
  ok(!/id="social-gh"[^>]*href=/.test(index) && !/<a[^>]*id="social-gh"/.test(index), 'github icon is a link');
});
await gate('social icons: both present, icon-only SVG, no text labels, in top bar', async () => {
  const bar = index.slice(index.indexOf('<nav class="socials"'), index.indexOf('</nav>'));
  ok(/id="social-x"/.test(bar) && /id="social-gh"/.test(bar), 'icons missing');
  ok(bar.split('<svg').length - 1 === 2, 'expected 2 svgs');
  ok(!/>\s*[A-Za-z]{2,}\s*</.test(bar.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'text label found');
  ok(!/socials[^{]*\{[^}]*display:\s*none/.test(await read(path.join(dist, 'src/styles/layout.css'))), 'socials hidden at a breakpoint');
});
await gate('tap targets are at least 44x44', async () => {
  const css = await read(path.join(dist, 'src/styles/base.css')) + await read(path.join(dist, 'src/styles/layout.css'));
  ok(/\.icon-btn\{[^}]*width:44px;height:44px/.test(css), 'icon-btn');
  ok(/\.btn\{[^}]*min-height:44px/.test(css), 'btn');
  ok(/\.ca-btn\{[^}]*min-height:44px/.test(css), 'ca-btn');
});
await gate('reduced motion: global kill-switch + own pulse disabled', async () => {
  const b = await read(path.join(dist, 'src/styles/base.css')), m = await read(path.join(dist, 'src/styles/market.css'));
  ok(/prefers-reduced-motion:reduce\)\{[^}]*animation:none!important/.test(b), 'global');
  ok(/prefers-reduced-motion:reduce\)\{[^}]*\.own-row\{animation:none\}/.test(m), 'own-row');
  ok((await read(path.join(dist, 'src/js/spring.js'))).includes('prefers-reduced-motion: reduce'), 'js solver');
});
await gate('polling: 60s interval, pause on hidden, immediate on visible, backoff', async () => {
  const t = await read(path.join(dist, 'src/js/market.js'));
  ok(/interval = 60000/.test(t) && /document\.hidden/.test(t) && /visibilitychange/.test(t) && /2 \*\* /.test(t), 'poller');
});
await gate('market is independent of CA state (source scan)', async () => {
  const t = await read(path.join(dist, 'src/js/market.js'));
  ok(!/reg\.ca\b|caValue|REGISTER\.ca\b/.test(t), 'market.js reads the ca record');
});
await gate('backoff retries with exponential waits', async () => {
  let n = 0; const t0 = Date.now();
  try { await market.withBackoff(async () => { n++; throw new Error('x'); }, 3, 20); } catch {}
  ok(n === 3 && Date.now() - t0 >= 55, `attempts=${n}`);
});

await gate('animation audit: every @keyframes is applied, durations/easing declared, reduced-motion kills all', async () => {
  const css = (await Promise.all(files.filter((x) => x.endsWith('.css')).map(read))).join('\n');
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  ok(names.length >= 10, 'keyframes found: ' + names.length);
  const dynamic = { flashUp: 'flash-up', flashDown: 'flash-down' }; // applied by JS class toggles
  for (const n of names) {
    const used = new RegExp('animation:[^;}]*\\b' + n + '\\b').test(css);
    ok(used, 'keyframes ' + n + ' never applied');
    if (!used) continue;
    const decl = css.match(new RegExp('animation:([^;}]*\\b' + n + '\\b[^;}]*)'))[1];
    ok(/\d(\.\d+)?m?s/.test(decl), n + ' has no duration: ' + decl);
    if (dynamic[n]) ok((await Promise.all(files.filter((x) => x.endsWith('.js')).map(read))).join('').includes(dynamic[n]), n + ' class never toggled');
  }
  ok(/prefers-reduced-motion:reduce\)\{\s*\*,\*::before,\*::after\{animation:none!important;transition:none!important/.test(css), 'no global reduced-motion kill');
  // reference-matched stagger values (panel .45s spring-ish, rows .3s/20ms, steps .3s/40ms, ease .22,1,.36,1)
  ok(/--ease:\s*cubic-bezier\(\.22, 1, \.36, 1\)/.test(css), 'ease token');
  ok(/\.rowin\{animation:rowIn \.3s var\(--ease\) both;animation-delay:calc\(var\(--i,0\) \* 20ms\)/.test(css), 'row stagger');
  ok(/\.step\{animation:stepIn \.3s var\(--ease\) both;animation-delay:calc\(var\(--i,0\) \* 40ms\)/.test(css), 'step stagger');
  ok(/1\.6s ease-in-out infinite/.test(css), 'skeleton shine 1.6s ease-in-out');
});
await gate('exactly one X icon, linking https://x.com/TryComnex; CA bar is in the sticky header', async () => {
  ok((index.match(/M18\.901 1\.153h3\.68/g) || []).length === 1, 'X glyph count');
  ok((index.match(/id="social-x"/g) || []).length === 1, 'social-x count');
  ok(reg.REGISTER.x.url === 'https://x.com/TryComnex', 'x url');
  const head = index.slice(index.indexOf('<header'), index.indexOf('</header>'));
  ok(head.includes('id="ca-bar"') && head.includes('id="social-x"'), 'ca bar / socials outside header');
  ok(/\.head\{position:sticky;top:0/.test(await read(path.join(dist, 'src/styles/layout.css'))), 'header not sticky');
});

// ---- fetch-mocked behaviour, both CA branches ----
const boosts = [{ chainId: 'solana', tokenAddress: 'A1', totalAmount: 5 }, { chainId: 'ethereum', tokenAddress: 'E1', totalAmount: 99 }, ...Array.from({ length: 11 }, (_, i) => ({ chainId: 'solana', tokenAddress: 'T' + i, totalAmount: 100 - i }))];
const pairFor = (a) => [{ chainId: 'solana', baseToken: { symbol: 'S' + a, name: 'N' + a }, priceUsd: '0.5', priceChange: { h24: 3 }, volume: { h24: 10 }, liquidity: { usd: 20 }, url: 'https://x/' + a, info: { imageUrl: 'https://img/' + a } }];
const calls = [];
function mockFetch({ dexFail = false, pumpFail = false, order = [] } = {}) {
  globalThis.fetch = async (url) => {
    url = String(url); calls.push(url);
    if (url.includes('token-boosts')) return { ok: true, json: async () => boosts };
    if (url.includes('/tokens/v1/solana/')) return { ok: true, json: async () => pairFor(url.split('/').pop()) };
    if (url.includes('/latest/dex/tokens/')) { order.push('dex-start'); await new Promise((r) => setTimeout(r, 40)); order.push('dex-end'); if (dexFail) throw new Error('dex'); return { ok: true, json: async () => ({ pairs: [{ volume: { h24: 1 }, priceUsd: '1' }, { baseToken: { symbol: 'OWN', name: 'Own' }, priceUsd: '2', priceChange: { h24: -4 }, volume: { h24: 900 }, liquidity: { usd: 77 }, url: 'https://own', info: { imageUrl: 'https://dexlogo' } }] }) }; }
    if (url.includes('pump.fun')) { order.push('pump-start'); if (pumpFail) throw new Error('pump'); return { ok: true, json: async () => ({ image_uri: 'https://pumplogo', symbol: 'PUMPSYM' }) }; }
    throw new Error('unexpected ' + url);
  };
}
await gate('trending: solana only, top 10 by totalAmount, deduped', async () => {
  mockFetch(); const rows = await market.fetchTrending(reg.REGISTER);
  ok(rows.length === 10, 'rows=' + rows.length);
  ok(!rows.some((r) => r.address === 'E1'), 'non-solana leaked');
  ok(rows[0].address === 'T0' || rows.some((r) => r.address === 'T0'), 'ordering');
  ok(!calls.some((c) => c.includes('/A1')) , 'lowest-amount token should be cut');
});

for (const branch of ['current', 'mutated']) {
  const was = await currentCaState();
  let dir = dist, label = was;
  if (branch === 'mutated') { const m = await makeMutant('gate'); dir = path.join(m.dir, 'src'); label = m.now; }
  else dir = path.join(dist, 'src');
  const R = await import(pathToFileURL(path.join(dir, 'js/registry.js')).href + '?b=' + branch);
  const O = await import(pathToFileURL(path.join(dir, 'js/ownrow.js')).href + '?b=' + branch);
  const M = await import(pathToFileURL(path.join(dir, 'js/market.js')).href + '?b=' + branch);
  const ca = R.caValue();
  await gate(`[branch CA ${label}] registry state is ${label}`, async () => { ok((label === 'stated') === !!ca, 'ca/state mismatch'); });
  await gate(`[branch CA ${label}] own row model`, async () => {
    mockFetch(); const { dex, pump } = ca ? await M.fetchOwn(ca) : { dex: null, pump: null };
    const m = O.ownModel(ca, dex, pump);
    if (!ca) {
      ok(m.state === 'placeholder' && m.logos.length === 1 && m.logos[0] === O.BRAND_LOGO, 'placeholder must use brand logo');
      ok(m.price === null && m.volume === null && !m.url, 'placeholder must be inert/dots');
    } else {
      ok(m.state === 'live' && m.symbol === 'OWN' && m.price === 2 && m.change === -4 && m.volume === 900 && m.liquidity === 77, 'pair must be highest 24h volume');
      ok(m.logos[0] === 'https://pumplogo' && m.logos[1] === 'https://dexlogo' && m.logos[2] === O.BRAND_LOGO, 'logo order pump -> dex -> brand');
    }
  });
  await gate(`[branch CA ${label}] dedupe trending rows`, async () => {
    const rows = [{ address: 'a' }, { address: ca || 'zz' }, { address: 'c' }];
    const d = O.dedupeTrending(rows, ca);
    ok(ca ? d.length === 2 && !d.some((r) => r.address === ca) : d.length === 3, 'dedupe');
  });
  await gate(`[branch CA ${label}] market result identical regardless of CA`, async () => {
    mockFetch(); const a = await M.fetchTrending(R.REGISTER); mockFetch(); const b = await market.fetchTrending(reg.REGISTER);
    ok(JSON.stringify(a) === JSON.stringify(b), 'market differs by CA state');
  });
  if (ca) {
    await gate(`[branch CA ${label}] pump.fun fetched in parallel with DexScreener, neither blocks`, async () => {
      const order = []; mockFetch({ order }); await M.fetchOwn(ca);
      ok(order.indexOf('pump-start') < order.indexOf('dex-end'), 'pump started only after dex finished: ' + order);
      mockFetch({ dexFail: true }); let r = await M.fetchOwn(ca); ok(!r.dex && r.pump, 'dex failure blocked pump');
      mockFetch({ pumpFail: true }); r = await M.fetchOwn(ca); ok(r.dex && !r.pump, 'pump failure blocked dex');
      const mm = O.ownModel(ca, r.dex, null); ok(mm.logos[0] === 'https://dexlogo', 'dex logo fallback');
    });
  }
}
await rm(path.join(root, '.tmp-gates'), { recursive: true, force: true });

await gate('mutation anchor is state-independent (flips either way)', async () => {
  const m = await makeMutant('anchor'); const a = m.was;
  ok(m.now !== a, 'no flip'); ok(await currentCaState(m.dir) === m.now, 'mutant state wrong');
  await rm(path.join(root, '.tmp-gates'), { recursive: true, force: true });
});
await gate('repo hygiene: no CLAUDE.md, .claude, AI attribution', async () => {
  ok(!await exists(path.join(root, 'CLAUDE.md')) && !await exists(path.join(root, '.claude')), 'forbidden file');
  const all = (await walk(root, ['node_modules', 'brand', 'reference', 'dist', 'dist-mutant', '.tmp-gates', 'gates.mjs'])).filter(isText);
  for (const f of all) ok(!/claude|anthropic|co-authored-by|generated (by|with)|\bai[- ]generated\b/i.test(await read(f)), 'attribution in ' + path.relative(root, f));
});
await gate('repo content files exist (README, whitepaper, MIT LICENSE)', async () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) ok(await exists(path.join(root, f)), f);
  ok(/MIT License/.test(await read(path.join(root, 'LICENSE'))) && /COMNEX, 2026/.test(await read(path.join(root, 'LICENSE'))), 'license');
});

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} gates passed`);
process.exit(failed.length ? 1 : 0);
