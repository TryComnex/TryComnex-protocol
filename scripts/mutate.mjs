// Mutation harness. The anchor is state-independent: it reads the CURRENT ca record at runtime
// and flips it to the opposite state, whatever the current state is.
import { readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_CA = 'So11111111111111111111111111111111111111112'; // test value for the mutant only

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CA_LINE = /^(\s*ca:\s*)\{[^}\n]*\},?\s*$/m;

export async function currentCaState(dir = root) {
  const s = await readFile(path.join(dir, 'src/js/registry.js'), 'utf8');
  const m = s.match(CA_LINE);
  if (!m) throw new Error('ca record anchor not found');
  return /state:\s*'stated'/.test(m[0]) ? 'stated' : 'absent';
}

// Build a copy of the project source (inside the project, under .tmp-gates/) with ca flipped.
export async function makeMutant(name = 'mutant') {
  const was = await currentCaState();
  const dir = path.join(root, '.tmp-gates', name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await cp(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
  await cp(path.join(root, 'index.html'), path.join(dir, 'index.html'));
  const reg = path.join(dir, 'src/js/registry.js');
  const text = await readFile(reg, 'utf8');
  const flipped = was === 'absent'
    ? text.replace(CA_LINE, (_, pre) => `${pre}{ state: 'stated', value: '${TEST_CA}' },`)
    : text.replace(CA_LINE, (_, pre) => `${pre}{ state: 'absent', value: null },`);
  await writeFile(reg, flipped);
  return { dir, was, now: was === 'absent' ? 'stated' : 'absent' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = await makeMutant('mutant');
  console.log(`mutant ca: ${m.was} -> ${m.now} at ${path.relative(root, m.dir)}`);
}
