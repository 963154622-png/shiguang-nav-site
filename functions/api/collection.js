const fields = ["brandName", "brandIcon", "brandImage", "title", "subtitle", "wallpaper", "wallpaperPreset", "layout"];

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}

function settings(env) {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SECRET_KEY;
  const table = env.SUPABASE_TABLE || "navigation_collections";
  if (!url || !key) throw new Error("supabase_not_configured");
  return { url, key, table };
}

async function supabase(env, method, query, body, prefer = "return=representation") {
  const { url, key, table } = settings(env);
  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`supabase_${response.status}`);
  return response.status === 204 ? [] : response.json();
}

async function read(env) {
  const rows = await supabase(env, "GET", "?id=eq.1&select=id,revision,updated_at,data");
  const row = rows[0];
  return row
    ? { modules: [], ...(row.data || {}), revision: Number(row.revision) || 0, updatedAt: row.updated_at || "" }
    : { modules: [], revision: 0, updatedAt: "" };
}

function applyPatch(base, patch) {
  const next = { ...base, modules: (base.modules || []).map(module => ({ ...module, sites: [...(module.sites || [])] })) };
  for (const field of fields) {
    if (!Object.hasOwn(patch, field)) continue;
    const value = patch[field];
    if (value == null || value === "") delete next[field];
    else next[field] = value;
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
    const ordered = patch.moduleOrder.map(id => map.get(id)).filter(Boolean);
    for (const module of next.modules) if (!ordered.some(item => item.id === module.id)) ordered.push(module);
    next.modules = ordered;
  }
  return next;
}

function validCollection(data) {
  return data && typeof data === "object" && Array.isArray(data.modules) && data.modules.length <= 250 &&
    data.modules.every(module => module && typeof module.id === "string" && typeof module.name === "string" &&
      Array.isArray(module.sites) && module.sites.every(site => site && typeof site.id === "string" &&
        typeof site.name === "string" && typeof site.url === "string"));
}

export async function onRequestGet({ env }) {
  try {
    return json(await read(env));
  } catch (error) {
    return json({ error: String(error?.message || error) }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const input = await request.json();
    const revision = input?.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) return json({ error: "invalid_revision" }, 400);
    const previous = await read(env);
    if (previous.revision !== revision) return json(previous, 409);
    const { revision: _revision, updatedAt: _updatedAt, ...base } = previous;
    const collection = input.patch && typeof input.patch === "object"
      ? applyPatch(base, input.patch)
      : Object.fromEntries(["modules", ...fields].filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
    if (!validCollection(collection) || JSON.stringify(collection).length > 1_200_000) {
      return json({ error: "invalid_collection" }, 400);
    }
    const next = revision + 1;
    const updatedAt = new Date().toISOString();
    const rows = await supabase(env, "PATCH", `?id=eq.1&revision=eq.${revision}`, {
      revision: next,
      updated_at: updatedAt,
      data: collection,
    });
    if (!rows.length) return json(await read(env), 409);
    return json({ ...collection, revision: next, updatedAt });
  } catch (error) {
    return json({ error: String(error?.message || error) }, 503);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { allow: "GET, PUT, OPTIONS" } });
}
