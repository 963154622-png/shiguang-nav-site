import { gunzipSync, gzipSync } from 'node:zlib';

type Site = {
  id: string;
  name: string;
  url: string;
  description?: string;
  favicon?: string;
  color?: string;
};

const blockedHosts = new Set([
  'xn--4gq62f52gdss.com',
]);

const blockedContentPattern =
  /(?:\bvpn\b|\bproxy\b|\bclash\b|\bv2ray\b|shadowsocks|翻墙|科学上网|机场订阅|节点订阅|代理节点)/iu;

export type NavModule = {
  id: string;
  name: string;
  icon?: string;
  sites: Site[];
};

export type NavCollectionData = {
  modules: NavModule[];
  brandName?: string;
  brandIcon?: string;
  brandImage?: string;
  title?: string;
  subtitle?: string;
  wallpaper?: string;
  wallpaperPreset?: string;
  layout?: number;
};

export type CollectionPatch = {
  modules?: NavModule[];
  deletedModuleIds?: string[];
  moduleOrder?: string[];
  brandName?: string | null;
  brandIcon?: string | null;
  brandImage?: string | null;
  title?: string | null;
  subtitle?: string | null;
  wallpaper?: string | null;
  wallpaperPreset?: string | null;
  layout?: number | null;
};

export type Collection = {
  modules: NavModule[];
  brandName?: string;
  brandIcon?: string;
  brandImage?: string;
  title?: string;
  subtitle?: string;
  wallpaper?: string;
  wallpaperPreset?: string;
  layout?: number;
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

export function allowedSite(site: Site): boolean {
  let hostname: string;
  try {
    hostname = new URL(site.url).hostname.toLowerCase().replace(/[.]$/, '');
  } catch {
    return false;
  }
  const blockedHost = [...blockedHosts].some(
    host => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (blockedHost) return false;
  return !blockedContentPattern.test(
    `${site.name}\n${site.description ?? ''}\n${hostname}`,
  );
}

export function sanitizeCollection(data: NavCollectionData): NavCollectionData {
  return {
    ...data,
    modules: data.modules.map(module => ({
      ...module,
      sites: module.sites.filter(allowedSite),
    })),
  };
}

export function validModules(value: unknown): value is NavModule[] {
  if (!Array.isArray(value) || value.length > 250) return false;
  const moduleIds = new Set<string>();
  const siteIds = new Set<string>();
  return value.every(module => {
    if (!module || !id(module.id, moduleIds) || !text(module.name, 200) ||
        !module.name.trim() || !Array.isArray(module.sites)) return false;
    // Module icons can be a short text/emoji, one of the built-in line icons
    // (stored as `icon:<name>`), or a compact uploaded PNG.  The previous
    // 12-character limit rejected the line-icon names (for example
    // `icon:folder-line`), which made an otherwise valid collection fail with
    // “收藏格式不符合要求” as soon as a user changed a module icon.
    if (module.icon != null &&
        !(text(module.icon, 64) && (!module.icon.startsWith('icon:') || /^icon:[a-z-]+$/.test(module.icon))) &&
        !(text(module.icon, 16_000) && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(module.icon))) return false;
    return module.sites.every(site => site && id(site.id, siteIds) && siteIds.size <= 4000 &&
      text(site.name, 200) && site.name.trim() && link(site.url) &&
      allowedSite(site) &&
      (site.description == null || text(site.description, 1000)) &&
      (site.favicon == null || text(site.favicon, 200_000)) &&
      (site.color == null || text(site.color, 64)));
  });
}

function image(value: unknown, max: number): value is string {
  return value == null || value === '' || (text(value, max) && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
}

export function validCollection(value: unknown): value is NavCollectionData {
  if (!value || typeof value !== 'object' || !validModules((value as { modules?: unknown }).modules)) return false;
  const data = value as Record<string, unknown>;
  return (data.brandName == null || text(data.brandName, 64)) &&
    (data.brandIcon == null || text(data.brandIcon, 12)) &&
    image(data.brandImage, 80_000) &&
    (data.title == null || text(data.title, 120)) &&
    (data.subtitle == null || text(data.subtitle, 200)) &&
    image(data.wallpaper, 900_000) &&
    (data.wallpaperPreset == null || text(data.wallpaperPreset, 32)) &&
    (data.layout == null || (typeof data.layout === 'number' && Number.isInteger(data.layout) && [1, 2, 3, 4].includes(data.layout)));
}

export function applyPatch(base: NavCollectionData, patch: CollectionPatch): NavCollectionData {
  const next: NavCollectionData = { ...base, modules: base.modules.map(module => ({ ...module, sites: [...module.sites] })) };
  for (const field of ["brandName", "brandIcon", "brandImage", "title", "subtitle", "wallpaper", "wallpaperPreset", "layout"] as const) {
    if (!Object.hasOwn(patch, field)) continue;
    const value = patch[field];
    if (value == null || value === "") delete next[field];
    else next[field] = value as never;
  }
  const deleted = new Set(patch.deletedModuleIds || []);
  const changed = new Map((patch.modules || []).map(module => [module.id, module]));
  next.modules = next.modules.filter(module => !deleted.has(module.id));
  for (const [id, module] of changed) {
    const index = next.modules.findIndex(item => item.id === id);
    if (index >= 0) next.modules[index] = module;
    else next.modules.push(module);
  }
  if (patch.moduleOrder?.length) {
    const map = new Map(next.modules.map(module => [module.id, module]));
    next.modules = patch.moduleOrder.map(id => map.get(id)).filter((module): module is NavModule => Boolean(module));
    for (const module of map.values()) if (!next.modules.some(item => item.id === module.id)) next.modules.push(module);
  }
  return next;
}

const rawLimit = 1_200_000;
// The packed snapshot is split across multiple Feishu records by the service,
// so the overall collection can be larger than one Base cell while each chunk
// remains comfortably below the per-cell limit.
const encodedLimit = 900_000;
const prefix = 'nav1:';

export function pack(data: NavCollectionData): string | null {
  if (!validCollection(data)) return null;
  const raw = JSON.stringify(data);
  if (Buffer.byteLength(raw) > rawLimit) return null;
  const encoded = prefix + gzipSync(raw).toString('base64url');
  return encoded.length <= encodedLimit ? encoded : null;
}

export function unpack(data: string): NavCollectionData {
  if (!data.startsWith(prefix) || data.length > encodedLimit) throw new Error('Invalid snapshot');
  const raw = gunzipSync(Buffer.from(data.slice(prefix.length), 'base64url'), { maxOutputLength: rawLimit });
  const parsed: unknown = JSON.parse(raw.toString('utf8'));
  if (Array.isArray(parsed)) {
    const sanitized: NavCollectionData = sanitizeCollection({ modules: parsed as NavModule[] });
    if (!validModules(sanitized.modules)) throw new Error('Invalid snapshot');
    return sanitized;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as NavCollectionData).modules)) {
    throw new Error('Invalid snapshot');
  }
  const sanitized: NavCollectionData = sanitizeCollection(parsed as NavCollectionData);
  if (!validCollection(sanitized)) throw new Error('Invalid snapshot');
  return sanitized;
}
