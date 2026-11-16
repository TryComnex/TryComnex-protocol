// Build: copy index.html + src/ + public/ into dist/, then run the gates against dist/.
// Output MUST be dist/. The logo files are copied explicitly and verified by the gates.
import { rm, mkdir, cp, copyFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, process.env.COMNEX_OUT || 'dist');
const srcRoot = process.env.COMNEX_SRC ? path.resolve(root, process.env.COMNEX_SRC) : root;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile(path.join(srcRoot, 'index.html'), path.join(out, 'index.html'));
await cp(path.join(srcRoot, 'src'), path.join(out, 'src'), { recursive: true });

// public/ -> dist/ root, file by file so a missing logo fails loudly.
for (const f of ['logo-512.png', 'logo-192.png', 'favicon.svg', 'banner.jpg']) {
  await access(path.join(root, 'public', f));
  await copyFile(path.join(root, 'public', f), path.join(out, f));
}
console.log('copied -> ' + path.relative(root, out));

if (!process.env.COMNEX_SKIP_GATES) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'gates.mjs')], { stdio: 'inherit', cwd: root });
  process.exit(r.status ?? 1);
}
