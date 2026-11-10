import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'dist', 'client');
const target = path.join(root, 'public');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of await readdir(source)) {
  await cp(path.join(source, entry), path.join(target, entry), { recursive: true });
}

// The Miaoda HTML plugin may leave the generated entry under client/index.html
// in Cloudflare's build environment. Pages requires index.html at the root.
const nestedIndex = path.join(target, 'client', 'index.html');
const rootIndex = path.join(target, 'index.html');
try {
  await access(rootIndex);
} catch {
  await cp(nestedIndex, rootIndex);
}
await rm(path.join(target, 'client'), { recursive: true, force: true });
console.log(`Prepared Cloudflare Pages output in ${path.relative(root, target)}`);
