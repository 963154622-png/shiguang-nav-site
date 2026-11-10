import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'dist', 'client');
const target = path.join(root, 'public');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of await readdir(source)) {
  await cp(path.join(source, entry), path.join(target, entry), { recursive: true });
}
console.log(`Prepared Cloudflare Pages output in ${path.relative(root, target)}`);
