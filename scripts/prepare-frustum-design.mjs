import { mkdir, cp, copyFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'dist-frustum-design');
const destination = resolve(root, 'frustum-design');

// The new copy owns only frustum-design/. Preserve both earlier published
// pages and their assets, including the complete new-design source tree.
async function digestTree(relativePath) {
  const hash = createHash('sha256');
  async function visit(relative) {
    const absolute = resolve(root, relative);
    let entries;
    try { entries = await readdir(absolute, { withFileTypes: true }); }
    catch (error) {
      if (error.code !== 'ENOTDIR') throw error;
      hash.update(relative.replaceAll('\\', '/'));
      hash.update(await readFile(absolute));
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error(`Unexpected link in protected page: ${relative}/${entry.name}`);
      await visit(join(relative, entry.name));
    }
  }
  await visit(relativePath);
  return hash.digest('hex');
}

const protectedPaths = ['index.html', 'assets', 'new-design'];
const before = await Promise.all(protectedPaths.map(digestTree));
await mkdir(resolve(destination, 'assets'), { recursive: true });
await cp(resolve(source, 'assets'), resolve(destination, 'assets'), { recursive: true });
await copyFile(resolve(source, 'model.glb'), resolve(destination, 'model.glb'));
await copyFile(resolve(source, 'index.source.html'), resolve(destination, 'index.html'));
const after = await Promise.all(protectedPaths.map(digestTree));
for (let index = 0; index < protectedPaths.length; index++) {
  if (before[index] !== after[index]) throw new Error(`Existing page changed: ${protectedPaths[index]}`);
}
console.log('Published files prepared only under frustum-design/. Existing pages and assets unchanged.');
