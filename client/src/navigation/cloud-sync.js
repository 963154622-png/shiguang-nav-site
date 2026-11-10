import axios from "axios";

export function createCollectionSync({ getCollection, setCollection, defaultCollection, isEditing, notify, openSettings }) {
  const key = "shiguang-nav-cloud-v1";
  const dirtyKey = "shiguang-nav-cloud-dirty-v1";
  const accessKey = "shiguang-nav-access-v1";
  const byId = id => document.getElementById(id);
  const snapshot = () => JSON.stringify(getCollection());
  const defaults = JSON.stringify(defaultCollection);
  const status = byId("cloudStatus");
  const notice = byId("cloudNotice");
  const refreshButtons = [byId("refreshCloudBtn"), byId("settingsRefreshCloudBtn")];
  const syncButtons = [byId("syncCloudBtn"), byId("settingsSyncCloudBtn")];
  const enable = byId("enableCloudBtn");
  const useCloud = byId("useCloudVersionBtn");
  const useLocal = byId("useLocalVersionBtn");
  const accessDialog = byId("accessDialog");
  const accessForm = byId("accessForm");
  const accessInput = byId("accessCodeInput");
  const accessHint = byId("accessCodeHint");
  // GitHub-backed deployments are passwordless: the server holds the
  // repository credential and browsers only use the shared API endpoint.
  let accessCode = "github";
  try { accessCode = localStorage.getItem(accessKey)?.trim() || ""; } catch {}
  let accessPromise;
  let accessResolve;
  let accessReject;
  let base;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Number.isSafeInteger(saved?.revision) && saved.revision > 0 && typeof saved.snapshot === "string") base = saved;
  } catch {}
  let remote;
  let busy = false;
  let conflict = false;
  let error = "";
  let localDirty = false;
  try { localDirty = localStorage.getItem(dirtyKey) === "1"; } catch {}
  let remoteUpdateAvailable = false;
  let changedDuringAction = false;

  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  function markLocalDirty(value) {
    localDirty = value;
    try {
      if (value) localStorage.setItem(dirtyKey, "1");
      else localStorage.removeItem(dirtyKey);
    } catch {}
  }

  function mergeList(baseList = [], localList = [], remoteList = []) {
    const baseMap = new Map(baseList.map(item => [item.id, item]));
    const localMap = new Map(localList.map(item => [item.id, item]));
    const remoteMap = new Map(remoteList.map(item => [item.id, item]));
    const ids = [...new Set([...baseList, ...localList, ...remoteList].map(item => item.id))];
    const mergedMap = new Map();
    for (const id of ids) {
      const before = baseMap.get(id);
      const local = localMap.get(id);
      const remote = remoteMap.get(id);
      const localChanged = !same(local, before);
      const remoteChanged = !same(remote, before);
      // The device currently writing wins when both sides changed the same
      // entity. A deletion is treated as a change too.
      const chosen = localChanged ? local : remoteChanged ? remote : before;
      if (chosen) mergedMap.set(id, chosen);
    }
    const baseOrder = baseList.map(item => item.id);
    const localOrder = localList.map(item => item.id);
    const remoteOrder = remoteList.map(item => item.id);
    const order = !same(localOrder, baseOrder) ? localOrder
      : !same(remoteOrder, baseOrder) ? remoteOrder : baseOrder;
    for (const id of ids) if (!order.includes(id)) order.push(id);
    return order.map(id => mergedMap.get(id)).filter(Boolean);
  }

  function mergeModule(baseModule, localModule, remoteModule) {
    const before = baseModule || {};
    const local = localModule || {};
    const remote = remoteModule || {};
    const merged = { ...remote };
    for (const key of Object.keys({ ...before, ...local, ...remote })) {
      if (key === "sites" || key === "id") continue;
      if (!same(local[key], before[key])) merged[key] = local[key];
      else if (!same(remote[key], before[key])) merged[key] = remote[key];
      else if (before[key] !== undefined) merged[key] = before[key];
    }
    merged.id = before.id || local.id || remote.id;
    merged.sites = mergeList(before.sites, local.sites, remote.sites);
    return merged;
  }

  function mergeCollections(before, local, remote) {
    const merged = { ...remote };
    for (const key of ["brandName", "brandIcon", "brandImage", "title", "subtitle", "wallpaper", "wallpaperPreset", "layout"]) {
      if (!same(local[key], before?.[key])) merged[key] = local[key];
      else if (same(remote[key], before?.[key])) merged[key] = before?.[key];
    }
    const baseModules = before?.modules || [];
    const localModules = local?.modules || [];
    const remoteModules = remote?.modules || [];
    const baseMap = new Map(baseModules.map(item => [item.id, item]));
    const localMap = new Map(localModules.map(item => [item.id, item]));
    const remoteMap = new Map(remoteModules.map(item => [item.id, item]));
    const moduleIds = [...new Set([...baseModules, ...localModules, ...remoteModules].map(item => item.id))];
    const modules = [];
    for (const id of moduleIds) {
      const before = baseMap.get(id);
      const localModule = localMap.get(id);
      const remoteModule = remoteMap.get(id);
      const localChanged = !same(localModule, before);
      const remoteChanged = !same(remoteModule, before);
      const chosen = localChanged ? localModule : remoteChanged ? remoteModule : before;
      if (chosen) modules.push(mergeModule(before, localModule || chosen, remoteModule || chosen));
    }
    const baseOrder = baseModules.map(item => item.id);
    const localOrder = localModules.map(item => item.id);
    const remoteOrder = remoteModules.map(item => item.id);
    const order = !same(localOrder, baseOrder) ? localOrder : !same(remoteOrder, baseOrder) ? remoteOrder : baseOrder;
    for (const id of moduleIds) if (!order.includes(id)) order.push(id);
    merged.modules = order.map(id => modules.find(item => item.id === id)).filter(Boolean);
    return merged;
  }

  const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

  function forgetAccess() {
    accessCode = "";
    try { localStorage.removeItem(accessKey); } catch {}
  }

  function requestAccess(message = "用于安全读取和更新你的飞书云端收藏。") {
    if (accessCode) return Promise.resolve(accessCode);
    if (accessPromise) return accessPromise;
    accessHint.textContent = message;
    accessHint.classList.toggle("invalid", message.includes("不正确"));
    accessInput.value = "";
    if (!accessDialog.open) accessDialog.showModal();
    window.setTimeout(() => accessInput.focus(), 0);
    accessPromise = new Promise((resolve, reject) => {
      accessResolve = resolve;
      accessReject = reject;
    });
    return accessPromise;
  }

  accessForm.addEventListener("submit", event => {
    event.preventDefault();
    const next = accessInput.value.trim();
    if (!next) return;
    accessCode = next;
    try { localStorage.setItem(accessKey, next); } catch {}
    accessDialog.close();
    accessResolve?.(next);
    accessPromise = undefined;
    accessResolve = undefined;
    accessReject = undefined;
  });

  function skipAccess() {
    accessDialog.close();
    accessReject?.(new Error("未连接云端，当前收藏仅保存在本机。"));
    accessPromise = undefined;
    accessResolve = undefined;
    accessReject = undefined;
  }

  byId("skipAccessBtn").addEventListener("click", skipAccess);
  accessDialog.addEventListener("cancel", event => {
    event.preventDefault();
    skipAccess();
  });

  function remember(result, savedSnapshot) {
    base = { revision: result.revision, snapshot: savedSnapshot, updatedAt: result.updatedAt };
    try { localStorage.setItem(key, JSON.stringify(base)); } catch {}
  }

  function resultData(result) {
    const data = { modules: result.modules };
    for (const field of ["brandName", "brandIcon", "brandImage", "title", "subtitle", "wallpaper", "wallpaperPreset", "layout"]) {
      if (Object.hasOwn(result, field)) data[field] = result[field];
    }
    return data;
  }

  async function compactBrandImage(value) {
    if (typeof value !== "string" || !value.startsWith("data:image/") || value.length <= 70_000) return value;
    try {
      const image = await new Promise((resolve, reject) => {
        const item = new Image();
        item.onload = () => resolve(item);
        item.onerror = reject;
        item.src = value;
      });
      const scale = Math.min(1, 96 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const compact = canvas.toDataURL("image/webp", .65);
      return compact.length < value.length ? compact : value;
    } catch {
      return value;
    }
  }

  async function snapshotForSync() {
    const current = getCollection();
    const brandImage = await compactBrandImage(current.brandImage);
    if (brandImage !== current.brandImage && setCollection({ brandImage })) {
      return snapshot();
    }
    return JSON.stringify(current);
  }

  function patchForSync(sent) {
    if (!base) return null;
    let before;
    let current;
    try {
      before = JSON.parse(base.snapshot);
      current = JSON.parse(sent);
    } catch {
      return null;
    }
    const patch = {};
    for (const field of ["brandName", "brandIcon", "brandImage", "title", "subtitle", "wallpaper", "wallpaperPreset", "layout"]) {
      if (!same(current[field], before[field])) patch[field] = current[field] ?? null;
    }
    const beforeMap = new Map((before.modules || []).map(module => [module.id, module]));
    const currentMap = new Map((current.modules || []).map(module => [module.id, module]));
    patch.modules = (current.modules || []).filter(module => !same(module, beforeMap.get(module.id)));
    patch.deletedModuleIds = (before.modules || []).filter(module => !currentMap.has(module.id)).map(module => module.id);
    if (!same((current.modules || []).map(module => module.id), (before.modules || []).map(module => module.id))) {
      patch.moduleOrder = (current.modules || []).map(module => module.id);
    }
    const hasModules = patch.modules.length || patch.deletedModuleIds.length || patch.moduleOrder;
    if (!hasModules) delete patch.modules;
    if (!patch.deletedModuleIds?.length) delete patch.deletedModuleIds;
    if (!patch.moduleOrder) delete patch.moduleOrder;
    return Object.keys(patch).length ? patch : {};
  }

  function formatTime(time) {
    return time ? new Date(time).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  }

  function render() {
    const fresh = remote?.revision === 0;
    refreshButtons.forEach(button => { button.disabled = busy; });
    syncButtons.forEach(button => { button.disabled = busy; });
    enable.hidden = !fresh;
    useCloud.hidden = useLocal.hidden = !conflict;
    [enable, useCloud, useLocal].forEach(button => { button.disabled = busy; });
    syncButtons.forEach(button => button.classList.toggle("needs-action", localDirty && !busy));
    refreshButtons.forEach(button => button.classList.toggle("needs-action", remoteUpdateAvailable && !busy));
    const conflictText = "本机和云端都有不同的收藏。可先导出本机备份，再选择要保留的版本。";
    const actionText = localDirty && remoteUpdateAvailable
      ? "本机和云端都有改动：请先更新数据，再确认需要同步的本机修改。"
      : remoteUpdateAvailable ? "云端有新版本，点击“更新数据”后再继续编辑。"
      : localDirty ? "本机有改动，点击“同步到云端”保存到其他设备。" : "";
    status.textContent = busy ? "正在同步…"
      : error || (conflict ? conflictText
        : fresh ? "云端还没有收藏。请在收藏最全的设备上启用同步。"
        : actionText || (base ? `已同步 · ${formatTime(base.updatedAt)}`
        : "正在检查云端收藏…"));
    const banner = conflict ? conflictText : error
      || actionText
      || (fresh ? "首次使用：将收藏最全的设备同步到云端，其他设备即可读取。" : "");
    notice.hidden = !banner;
    byId("cloudNoticeText").textContent = banner;
  }

  async function request(method, body, canRetry = true) {
    const code = accessCode || await requestAccess();
    const basePath = window.location.pathname.replace(/\/+$/, "");
    const csrf = document.cookie.split("; ").find(item => item.startsWith("suda-csrf-token="))?.slice("suda-csrf-token=".length) || "";
    let response;
    // The server already performs bounded Feishu retries. Keep one browser
    // request so a delayed write cannot be duplicated by the client.
    for (let attempt = 0; attempt < 1; attempt += 1) {
      try {
        response = await axios({
          url: `${basePath}/api/collection`, method, data: body,
          headers: {
            "X-Shiguang-Access": code,
            ...(csrf && { "X-Suda-Csrf-Token": csrf })
          },
          withCredentials: true,
          timeout: 65_000,
          validateStatus: () => true
        });
      } catch (failure) {
        if (attempt === 0) throw failure;
        await wait(400 * (2 ** attempt) + Math.round(Math.random() * 250));
        continue;
      }
      if (![429, 502, 503, 504].includes(response.status) || attempt === 0) break;
      await wait(400 * (2 ** attempt) + Math.round(Math.random() * 250));
    }
    if (response.status === 401 || response.status === 403) {
      forgetAccess();
      if (canRetry) {
        await requestAccess("同步码不正确，请重新输入。");
        return request(method, body, false);
      }
      throw new Error("同步码不正确，当前收藏保留在本机。");
    }
    if (response.status === 400) throw new Error("收藏格式不符合要求，本机收藏仍已保存。");
    if (response.status === 413) throw new Error("品牌图片或壁纸过大，无法写入飞书云端。请重新上传图片，系统会自动压缩后再同步。");
    if ([429, 502, 503, 504].includes(response.status)) throw new Error("飞书暂时繁忙，请稍后重试；本机收藏仍已保存。");
    if (response.status === 423) throw new Error("另一台设备正在保存，请稍后更新。");
    if (![200, 409].includes(response.status) || !Number.isSafeInteger(response.data?.revision)) {
      throw new Error("暂时无法连接飞书，当前收藏保留在本机。");
    }
    return { conflict: response.status === 409, result: response.data };
  }

  async function send(revision, attempt = 0) {
    const sent = await snapshotForSync();
    const patch = patchForSync(sent);
    const response = await request("PUT", patch ? { revision, patch } : { revision, ...JSON.parse(sent) });
    remote = response.result;
    if (response.conflict) {
      if (remote.revision && JSON.stringify(resultData(remote)) === sent) {
        remember(remote, sent);
        conflict = false;
      } else if (remote.revision && attempt < 5) {
        const before = base ? JSON.parse(base.snapshot) : defaultCollection;
        const local = JSON.parse(sent);
        const merged = mergeCollections(before, local, resultData(remote));
        if (!setCollection(merged)) throw new Error("本机空间不足，无法合并云端更新。请先导出备份。");
        remember(remote, JSON.stringify(resultData(remote)));
        return send(remote.revision, attempt + 1);
      } else conflict = false;
      return;
    }
    remember(remote, sent);
    markLocalDirty(snapshot() !== sent);
    remoteUpdateAvailable = false;
    conflict = false;
    if (snapshot() !== sent) changedDuringAction = true;
  }

  function adopt(result) {
    const incomingData = resultData(result);
    const incoming = JSON.stringify(incomingData);
    if (incoming !== snapshot() && !setCollection(incomingData)) {
      throw new Error("本机空间不足，无法读取云端收藏。请先导出备份。");
    }
    // setCollection normalizes omitted optional fields against the app defaults.
    // Remember the exact post-adoption snapshot so an idle device does not
    // immediately look dirty and upload its stale pre-cloud shape.
    remember(result, snapshot());
    markLocalDirty(false);
    remoteUpdateAvailable = false;
    conflict = false;
  }

  async function run(operation) {
    if (busy) return;
    busy = true;
    error = "";
    render();
    try {
      await operation();
    } catch (failure) {
      error = failure instanceof TypeError || failure.name === "TimeoutError" || failure.name === "AbortError"
        ? "暂时无法连接云端，当前收藏保留在本机。" : failure.message;
    } finally {
      busy = false;
      render();
      if (changedDuringAction) {
        changedDuringAction = false;
        localChanged();
      }
    }
  }

  function refresh(showFeedback = false, applyRemote = false) {
    return run(async () => {
      ({ result: remote } = await request("GET"));
      if (!remote.revision) {
        conflict = false;
        if (showFeedback) notify("云端还没有收藏");
        return;
      }
      // Older cloud snapshots contain modules only. Fill their missing appearance
      // locally for display, but never migrate them with an automatic write.
      const legacyRemote = !Object.hasOwn(remote, "brandName") && !Object.hasOwn(remote, "wallpaper");
      if (legacyRemote) {
        remote = { ...getCollection(), ...remote };
      }
      const local = snapshot();
      const incoming = JSON.stringify(resultData(remote));
      if (applyRemote) {
        if (localDirty && local !== incoming &&
            !confirm("本机还有未同步的修改。更新数据会用云端版本替换本机内容，确定继续吗？")) {
          remoteUpdateAvailable = remote.revision !== base?.revision;
          return;
        }
        adopt(remote);
        if (showFeedback) notify("已更新为云端最新版本");
      } else if (local === incoming) {
        adopt(remote);
      } else if (!base && local === defaults && !isEditing()) {
        // A genuinely new device may safely start from the cloud. Existing
        // devices only receive a reminder and must click Update explicitly.
        adopt(remote);
      } else if (base?.revision !== remote.revision) {
        remoteUpdateAvailable = true;
        if (showFeedback) notify("云端有新版本，请点击“更新数据”");
      } else {
        if (local === base.snapshot) markLocalDirty(false);
        remoteUpdateAvailable = false;
      }
    });
  }

  function localChanged() {
    markLocalDirty(true);
    render();
    // Changes are deliberately local until the user clicks Sync. Background
    // checks may announce a cloud update, but never write or replace data.
  }

  // A manual sync is an explicit "upload this device's current collection"
  // action. Fetch the latest revision first so the write remains conflict-safe.
  function syncNow() {
    return run(async () => {
      ({ result: remote } = await request("GET"));
      const revision = Number.isSafeInteger(remote?.revision) ? remote.revision : 0;
      const incoming = remote?.revision ? JSON.stringify(resultData(remote)) : "";
      if (remote?.revision && base?.revision !== remote.revision && snapshot() !== incoming) {
        remoteUpdateAvailable = true;
        notify("云端有新版本，请先点击“更新数据”");
        return;
      }
      await send(revision);
      if (conflict) {
        notify("云端有更新版本，请先选择保留哪一份");
      } else {
        notify("已同步到云端（含品牌图标与页面设置）");
      }
    });
  }

  for (const button of refreshButtons) button.addEventListener("click", () => refresh(true, true));
  for (const button of syncButtons) button.addEventListener("click", syncNow);
  byId("cloudNoticeBtn").addEventListener("click", openSettings);
  enable.addEventListener("click", () => {
    if (remote?.revision !== 0) return;
    const modules = getCollection().modules;
    const count = modules.reduce((total, module) => total + module.sites.length, 0);
    if (!confirm(`将本机的 ${modules.length} 个模块、${count} 个网站同步到云端？以后输入同一同步码的其他设备也可读取这份收藏。`)) return;
    run(async () => {
      await send(0);
      if (!conflict && remote.revision) notify("已开启跨设备同步");
    });
  });
  useCloud.addEventListener("click", () => {
    if (!conflict || !remote?.revision ||
        !confirm("使用云端收藏会替换本机收藏。请先导出需要保留的本机备份。确定继续吗？")) return;
    run(async () => {
      ({ result: remote } = await request("GET"));
      if (remote.revision) {
        adopt(remote);
        notify("已使用云端收藏");
      } else {
        conflict = false;
      }
    });
  });
  useLocal.addEventListener("click", () => {
    if (!conflict || !remote?.revision ||
        !confirm("这会用本机收藏覆盖云端版本，并同步到其他设备。确定继续吗？")) return;
    run(async () => {
      await send(remote.revision);
      if (!conflict && remote.revision) notify("已使用本机收藏");
    });
  });

  return {
    localChanged,
    start() {
      render();
      refresh();
      window.addEventListener("focus", () => { if (!document.hidden) refresh(); });
      window.addEventListener("online", () => refresh());
      document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
      // Background checks are read-only. They only light up Update when the
      // cloud revision changes; writes happen exclusively after a button click.
      setInterval(() => {
        if (document.hidden) return;
        refresh();
      }, 15_000);
    }
  };
}
