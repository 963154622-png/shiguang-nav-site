import { axiosForBackend } from "@lark-apaas/client-toolkit/utils/getAxiosForBackend";

export function createCollectionSync({ getModules, setModules, defaultModules, isEditing, notify, openSettings }) {
  const key = "shiguang-nav-cloud-v1";
  const byId = id => document.getElementById(id);
  const snapshot = () => JSON.stringify(getModules());
  const defaults = JSON.stringify(defaultModules);
  const status = byId("cloudStatus");
  const notice = byId("cloudNotice");
  const refreshButtons = [byId("refreshCloudBtn"), byId("settingsRefreshCloudBtn")];
  const enable = byId("enableCloudBtn");
  const useCloud = byId("useCloudVersionBtn");
  const useLocal = byId("useLocalVersionBtn");
  let base;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Number.isSafeInteger(saved?.revision) && saved.revision > 0 && typeof saved.snapshot === "string") base = saved;
  } catch {}
  let remote;
  let busy = false;
  let conflict = false;
  let error = "";
  let localTimer;
  let changedDuringAction = false;

  function pending() {
    return Boolean(base && snapshot() !== base.snapshot);
  }

  function remember(result, savedSnapshot) {
    base = { revision: result.revision, snapshot: savedSnapshot, updatedAt: result.updatedAt };
    try { localStorage.setItem(key, JSON.stringify(base)); } catch {}
  }

  function formatTime(time) {
    return time ? new Date(time).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  }

  function render() {
    const fresh = remote?.revision === 0;
    refreshButtons.forEach(button => { button.disabled = busy; });
    enable.hidden = !fresh;
    useCloud.hidden = useLocal.hidden = !conflict;
    [enable, useCloud, useLocal].forEach(button => { button.disabled = busy; });
    const conflictText = "本机和云端都有不同的收藏。可先导出本机备份，再选择要保留的版本。";
    status.textContent = busy ? "正在同步…"
      : error || (conflict ? conflictText
        : fresh ? "云端还没有收藏。请在收藏最全的设备上启用同步。"
        : pending() ? "本机已保存，等待同步到云端。"
        : base ? `已同步 · ${formatTime(base.updatedAt)}`
        : "正在检查云端收藏…");
    const banner = conflict ? conflictText : error
      || (fresh ? "首次使用：将收藏最全的设备同步到云端，其他设备即可读取。" : "");
    notice.hidden = !banner;
    byId("cloudNoticeText").textContent = banner;
  }

  async function request(method, body) {
    const response = await axiosForBackend({
      url: "/api/collection", method, data: body,
      timeout: 15_000,
      validateStatus: () => true
    });
    if (response.status === 401 || response.status === 403) throw new Error("请在原来的飞书账号中打开导航，当前收藏保留在本机。");
    if (response.status === 400 || response.status === 413) throw new Error("收藏格式或大小超出飞书云端限制，本机收藏仍已保存。");
    if (response.status === 423) throw new Error("另一台设备正在保存，请稍后更新。");
    if (![200, 409].includes(response.status) || !Number.isSafeInteger(response.data?.revision)) {
      throw new Error("暂时无法连接飞书，当前收藏保留在本机。");
    }
    return { conflict: response.status === 409, result: response.data };
  }

  async function send(revision) {
    const sent = snapshot();
    const response = await request("PUT", { revision, modules: JSON.parse(sent) });
    remote = response.result;
    if (response.conflict) {
      if (remote.revision && JSON.stringify(remote.modules) === sent) {
        remember(remote, sent);
        conflict = false;
      } else {
        conflict = Boolean(remote.revision);
      }
      return;
    }
    remember(remote, sent);
    conflict = false;
    if (snapshot() !== sent) changedDuringAction = true;
  }

  function adopt(result) {
    const incoming = JSON.stringify(result.modules);
    if (incoming !== snapshot() && !setModules(result.modules)) {
      throw new Error("本机空间不足，无法读取云端收藏。请先导出备份。");
    }
    remember(result, incoming);
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

  function refresh(showFeedback = false) {
    return run(async () => {
      ({ result: remote } = await request("GET"));
      if (!remote.revision) {
        conflict = false;
        if (showFeedback) notify("云端还没有收藏");
        return;
      }
      const local = snapshot();
      if (local === JSON.stringify(remote.modules)) {
        adopt(remote);
      } else if (base?.revision === remote.revision && local !== base.snapshot) {
        await send(base.revision);
      } else if (!conflict && (base ? local === base.snapshot : local === defaults)) {
        if (isEditing()) return;
        adopt(remote);
      } else {
        conflict = true;
      }
      if (showFeedback && !conflict) notify("收藏已更新");
    });
  }

  function localChanged() {
    render();
    if (!base || conflict || !pending()) return;
    if (busy) {
      changedDuringAction = true;
      return;
    }
    clearTimeout(localTimer);
    localTimer = setTimeout(() => refresh(), 350);
  }

  for (const button of refreshButtons) button.addEventListener("click", () => refresh(true));
  byId("cloudNoticeBtn").addEventListener("click", openSettings);
  enable.addEventListener("click", () => {
    if (remote?.revision !== 0) return;
    const modules = getModules();
    const count = modules.reduce((total, module) => total + module.sites.length, 0);
    if (!confirm(`将本机的 ${modules.length} 个模块、${count} 个网站同步到云端？以后同一账号的其他设备也可读取这份收藏。`)) return;
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
      setInterval(() => { if (!document.hidden) refresh(); }, 20_000);
    }
  };
}
