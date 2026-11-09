import { gunzipSync, gzipSync } from 'node:zlib';

type Site = {
  id: string;
  name: string;
  url: string;
  description?: string;
  favicon?: string;
  color?: string;
};

export type NavModule = {
  id: string;
  name: string;
  icon?: string;
  sites: Site[];
};

export type Collection = {
  modules: NavModule[];
  revision: number;
  updatedAt: string;
};

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function id(value: unknown, used: Set<string>): value is string {
  if (!text(value, 128) || !value || used.has(value)) return false;
  used.add(value);
  return true;
}

function link(value: unknown): boolean {
  if (!text(value, 4096)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validModules(value: unknown): value is NavModule[] {
  if (!Array.isArray(value) || value.length > 250) return false;
  const moduleIds = new Set<string>();
  const siteIds = new Set<string>();
  return value.every(module => {
    if (!module || !id(module.id, moduleIds) || !text(module.name, 200) ||
        !module.name.trim() || !Array.isArray(module.sites)) return false;
    if (module.icon != null && !text(module.icon, 12) &&
        !(text(module.icon, 16_000) && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(module.icon))) return false;
    return module.sites.every(site => site && id(site.id, siteIds) && siteIds.size <= 4000 &&
      text(site.name, 200) && site.name.trim() && link(site.url) &&
      (site.description == null || text(site.description, 1000)) &&
      (site.favicon == null || text(site.favicon, 200_000)) &&
      (site.color == null || text(site.color, 64)));
  });
}

const rawLimit = 750_000;
const encodedLimit = 90_000;
const prefix = 'nav1:';

export function pack(modules: NavModule[]): string | null {
  const raw = JSON.stringify(modules);
  if (Buffer.byteLength(raw) > rawLimit) return null;
  const data = prefix + gzipSync(raw).toString('base64url');
  return data.length <= encodedLimit ? data : null;
}

export function unpack(data: string): NavModule[] {
  if (!data.startsWith(prefix) || data.length > encodedLimit) throw new Error('Invalid snapshot');
  const raw = gunzipSync(Buffer.from(data.slice(prefix.length), 'base64url'), { maxOutputLength: rawLimit });
  const parsed: unknown = JSON.parse(raw.toString('utf8'));
  if (!validModules(parsed)) throw new Error('Invalid snapshot');
  return parsed;
}
