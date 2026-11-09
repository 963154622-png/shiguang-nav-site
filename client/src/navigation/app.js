import { createCollectionSync } from "./cloud-sync.js";
import iconSprite from "./icons.svg?raw";

document.body.insertAdjacentHTML("afterbegin", iconSprite.replace("<svg ", '<svg aria-hidden="true" style="display:none" '));

const STORAGE_KEY = "shiguang-nav-data-v3";
const PREVIOUS_STORAGE_KEY = "shiguang-nav-data-v2";
const OLD_STORAGE_KEY = "shiguang-nav-data-v1";
const THEME_KEY = "shiguang-nav-theme-v1";
const ENGINE_KEY = "shiguang-nav-engine-v1";

const engines = [
  { id: "google", name: "Google", url: "https://www.google.com/search?q=" },
  { id: "baidu", name: "百度", url: "https://www.baidu.com/s?wd=" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=" },
  { id: "quark", name: "夸克", url: "https://quark.sm.cn/s?q=" },
  { id: "github", name: "GitHub", url: "https://github.com/search?q=" }
];

const wallpaperPresets = {
  default: { name: "素白", background: "" },
  sunrise: { name: "晨曦", background: "linear-gradient(135deg,#f9ece0,#f5e7ed)" },
  mint: { name: "薄荷", background: "linear-gradient(135deg,#edf7f0,#dcece7)" },
  blossom: { name: "樱花", background: "linear-gradient(135deg,#fcf0f3,#efdee8)" },
  cream: { name: "奶油", background: "linear-gradient(135deg,#fcf6e9,#eee8da)" },
  sea: { name: "海盐", background: "linear-gradient(135deg,#ecf3fa,#e0e9ef)" }
};

const defaultSites = {
  daily: [
    ["ChatGPT", "chatgpt.com", "对话、写作与日常问题解答"],
    ["Notion", "www.notion.so", "笔记、文档与项目整理"],
    ["GitHub", "github.com", "代码托管与开源协作"],
    ["DeepL", "www.deepl.com/translator", "多语言文本与文档翻译"],
    ["Vercel", "vercel.com", "前端项目部署与托管"],
    ["少数派", "sspai.com", "数字生活、应用与效率技巧"]
  ],
  learn: [
    ["知乎", "www.zhihu.com", "中文问答与经验分享"],
    ["哔哩哔哩", "www.bilibili.com", "视频教程与兴趣社区"],
    ["掘金", "juejin.cn", "开发者技术文章与实践分享"],
    ["CSDN", "www.csdn.net", "技术博客与编程社区"],
    ["极客时间", "time.geekbang.org", "面向开发者的技术课程"],
    ["慕课网", "www.imooc.com", "编程实战与职业技能课程"]
  ],
  design: [
    ["Figma", "www.figma.com", "界面设计、原型与团队协作"],
    ["Dribbble", "dribbble.com", "浏览设计师作品与界面灵感"],
    ["Behance", "www.behance.net", "创意作品集与设计案例"],
    ["Pinterest", "www.pinterest.com", "发现并整理视觉灵感"],
    ["花瓣", "huaban.com", "图片素材与创意收藏"],
    ["站酷", "www.zcool.com.cn", "中文设计作品与创意社区"]
  ],
  office: [
    ["飞书", "www.feishu.cn", "团队沟通、文档与协作"],
    ["腾讯文档", "docs.qq.com", "多人在线编辑文档和表格"],
    ["语雀", "www.yuque.com", "团队知识库与文档写作"],
    ["OneDrive", "onedrive.live.com", "微软云盘与文件同步"],
    ["Google Drive", "drive.google.com", "在线文件存储与共享"],
    ["石墨文档", "shimo.im", "在线文档和表格协作"]
  ],
  dev: [
    ["MDN", "developer.mozilla.org", "网页开发文档与教程"],
    ["npm", "www.npmjs.com", "JavaScript 软件包注册库"],
    ["LeetCode", "leetcode.cn", "算法练习与编程题库"],
    ["Docker", "www.docker.com", "容器工具与开发资源"],
    ["Stack Overflow", "stackoverflow.com", "编程问题与技术问答"],
    ["Gitee", "gitee.com", "代码仓库与开源项目"]
  ],
  life: [
    ["YouTube", "www.youtube.com", "观看与分享视频"],
    ["Spotify", "open.spotify.com", "在线音乐和播客"],
    ["豆瓣", "www.douban.com", "书影音条目与社区讨论"],
    ["小红书", "www.xiaohongshu.com", "生活方式笔记与经验分享"]
  ]
};

const defaultData = {
  brandName: "拾光导航",
  brandIcon: "拾",
  brandImage: "",
  title: "我的数字空间",
  subtitle: "收藏灵感，连接世界，从这里开始。",
  layout: 1,
  wallpaper: "",
  wallpaperPreset: "default",
  modules: [
    ["daily", "常用工具"], ["learn", "学习资料"], ["design", "设计灵感"],
    ["office", "效率办公"], ["dev", "开发资源"], ["life", "娱乐生活"]
  ].map(([id, name]) => ({
    id, name,
    sites: defaultSites[id].map(([name, host, description], index) => ({
      id: `site-${id}-${index + 1}`, name, url: `https://${host}`, description, color: accentFor(index)
    }))
  }))
};
const recommendedSites = new Map(defaultData.modules.flatMap(module => module.sites.map(site => [domainOf(site.url), site])));

const clone = value => JSON.parse(JSON.stringify(value));
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const $ = selector => document.querySelector(selector);
const moduleGrid = $("#moduleGrid");
const siteDialog = $("#siteDialog");
const moduleDialog = $("#moduleDialog");
const manageDialog = $("#manageDialog");
const siteTooltip = $("#siteTooltip");
const editingModules = new Set();
let data = loadData();
let selectedEngine = localStorage.getItem(ENGINE_KEY) || "google";
let activeSuggestion = -1;
let currentMatches = [];
let draggedSite = null;
let detectController = null;
let lastAutoName = "";
let lastAutoDescription = "";
let toastTimer;
let tooltipTimer;
let tooltipAnchor;
let menuAnchor;
let pendingBrandImage = "";
let brandImageRequest = 0;
let faviconImageRequest = 0;
let moduleDraft;
let moduleImageRequest = 0;
let cloudSync;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.modules)) return { ...clone(defaultData), ...saved };
    const previous = JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY));
    if (Array.isArray(previous?.modules)) return { ...clone(defaultData), ...previous, layout: 1 };
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if (Array.isArray(old?.modules)) return { ...clone(defaultData), modules: old.modules };
  } catch {}
  return clone(defaultData);
}

function saveData(message = "已自动保存") {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    showToast(message);
    cloudSync?.localChanged();
    return true;
  } catch {
    showToast("本地空间不足，请换一张更小的壁纸");
    return false;
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function siteInitial(name = "") {
  const value = name.trim();
  if (!value) return "?";
  return /[\u4e00-\u9fff]/.test(value[0]) ? value[0] : value.slice(0, 2).toUpperCase();
}

function normalizeUrl(value) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function domainOf(url) {
  try { return new URL(normalizeUrl(url)).hostname.replace(/^www\./, ""); } catch { return url; }
}

function faviconFor(url) {
  const address = normalizeUrl(url);
  return address ? new URL("/favicon.ico", address).href : "";
}

function inferredName(url) {
  const domain = domainOf(url).toLowerCase();
  if (recommendedSites.has(domain)) return recommendedSites.get(domain).name;
  const known = { "chatgpt.com": "ChatGPT", "github.com": "GitHub", "zhihu.com": "知乎", "bilibili.com": "哔哩哔哩", "juejin.cn": "掘金", "xiaohongshu.com": "小红书", "douban.com": "豆瓣", "notion.so": "Notion", "figma.com": "Figma", "youtube.com": "YouTube", "yuque.com": "语雀", "feishu.cn": "飞书" };
  const match = Object.entries(known).find(([key]) => domain === key || domain.endsWith(`.${key}`));
  if (match) return match[1];
  const part = domain.split(".").filter(Boolean).slice(-2, -1)[0] || domain.split(".")[0] || "新网站";
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function accentFor(index) {
  return ["#5278f7", "#8b63f6", "#49a5d8", "#f08b66", "#55aa8a", "#df6e96"][index % 6];
}

function findSite(siteId) {
  for (const module of data.modules) {
    const site = module.sites.find(item => item.id === siteId);
    if (site) return { site, module };
  }
  return null;
}

function icon(id, className = "ui-icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#${id}"/></svg>`;
}

function moduleIconMarkup(module) {
  const value = typeof module.icon === "string" ? module.icon : "";
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 16_000) {
    return `<img class="module-icon module-icon-image" src="${value}" alt="" />`;
  }
  if (value && value.length <= 12) {
    return `<span class="module-icon module-icon-text" aria-hidden="true">${escapeHtml(value)}</span>`;
  }
  const id = Object.hasOwn(defaultSites, module.id) ? module.id : "daily";
  return icon(id, "ui-icon module-icon");
}

function logoMarkup(site) {
  const host = domainOf(site.url);
  if (host === "github.com" && !site.favicon) return `<span class="site-logo has-logo">${icon("github", "engine-logo")}</span>`;
  const src = site.favicon || faviconFor(site.url);
  const color = /^#[0-9a-f]{6}$/i.test(site.color) ? site.color : "#44444b";
  return `<span class="site-logo" style="--logo-bg:${color}"><span aria-hidden="true">${escapeHtml(siteInitial(site.name))}</span>${src ? `<img src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer" />` : ""}</span>`;
}

function siteTemplate(site, moduleId) {
  const url = normalizeUrl(site.url);
  return `<div class="site-card" draggable="true" data-site-id="${escapeHtml(site.id)}" data-module-id="${escapeHtml(moduleId)}">
    <a class="site-main" href="${escapeHtml(url || "#")}" draggable="false" target="_blank" rel="noopener noreferrer">${logoMarkup(site)}<span class="site-info"><strong>${escapeHtml(site.name)}</strong></span></a>
    <div class="site-menu"><button class="more-button" type="button" data-menu="site" aria-label="管理 ${escapeHtml(site.name)}" aria-expanded="false">${icon("more")}</button></div>
  </div>`;
}

function renderModules() {
  closeTooltip();
  closeMenu();
  moduleGrid.innerHTML = data.modules.map(module => {
    const id = escapeHtml(module.id);
    const editing = editingModules.has(module.id);
    const addButton = editing || !module.sites.length
      ? `<button class="add-site-button" type="button" data-action="add-site" data-module-id="${id}">＋ 添加网站</button>` : "";
    return `<article class="module-card" data-module-id="${id}" data-editing="${editing}">
      <header class="module-header">
        <div class="module-title-wrap">${moduleIconMarkup(module)}<h2 class="module-title" title="双击修改名称">${escapeHtml(module.name)}</h2><span class="site-count">${module.sites.length}</span></div>
        <div class="module-menu"><button class="more-button" type="button" data-menu="module" aria-label="${escapeHtml(module.name)}菜单" aria-expanded="false">${icon("more")}</button></div>
      </header>
      <div class="site-list">${module.sites.map(site => siteTemplate(site, module.id)).join("")}${addButton}</div>
    </article>`;
  }).join("");
  $("#emptyState").hidden = data.modules.length > 0;
  moduleGrid.hidden = data.modules.length === 0;
}

document.addEventListener("load", event => {
  if (event.target.matches?.(".site-logo img")) event.target.parentElement.classList.add("has-logo");
}, true);
document.addEventListener("error", event => {
  const img = event.target;
  if (img.matches?.(".site-logo img")) img.hidden = true;
}, true);

function isLocalImage(value) {
  return typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

function renderBrandMark(mark, icon, image) {
  mark.textContent = icon || defaultData.brandIcon;
  const hasImage = isLocalImage(image);
  mark.classList.toggle("has-image", hasImage);
  if (hasImage) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = image;
    mark.replaceChildren(img);
  }
}

function applyContent() {
  const brandName = data.brandName || defaultData.brandName;
  const brandIcon = data.brandIcon || defaultData.brandIcon;
  renderBrandMark($(".brand .brand-mark"), brandIcon, data.brandImage);
  document.querySelector('link[rel="icon"]').href = isLocalImage(data.brandImage) ? data.brandImage : "./mark.svg";
  $(".brand > span:last-child").textContent = brandName;
  $(".brand").setAttribute("aria-label", `${brandName}首页`);
  document.title = brandName;
  $("#hero-title").textContent = data.title || defaultData.title;
  $("#hero-subtitle").textContent = data.subtitle || defaultData.subtitle;
  document.body.dataset.layout = String([1, 2, 3, 4].includes(Number(data.layout)) ? data.layout : 1);
  document.querySelectorAll("[data-layout-choice]").forEach(button => {
    const active = button.dataset.layoutChoice === document.body.dataset.layout;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  applyWallpaper();
}

function applyWallpaper() {
  const presetId = Object.hasOwn(wallpaperPresets, data.wallpaperPreset) ? data.wallpaperPreset : "default";
  const preset = wallpaperPresets[presetId];
  const custom = isLocalImage(data.wallpaper);
  const background = custom ? `url("${data.wallpaper}")` : preset.background;
  document.body.dataset.wallpaper = custom ? "custom" : presetId;
  $("#wallpaper").style.backgroundImage = background;
  $("#wallpaperPreview").style.backgroundImage = background;
  $("#wallpaperPreview span").textContent = custom ? "当前自定义壁纸" : preset.name;
  document.querySelectorAll("[data-wallpaper-choice]").forEach(button => {
    button.setAttribute("aria-pressed", !custom && button.dataset.wallpaperChoice === presetId);
  });
}

function editText(element, key, maxLength) {
  if (element.querySelector("input")) return;
  const previous = data[key] || "";
  const input = document.createElement("input");
  input.className = "inline-hero-input";
  input.maxLength = maxLength;
  input.value = previous;
  element.textContent = "";
  element.appendChild(input);
  input.focus(); input.select();
  const commit = () => {
    const next = input.value.trim() || previous;
    data[key] = next;
    saveData("文字已更新");
    applyContent();
  };
  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") { input.value = previous; input.blur(); }
  });
}

$("#hero-title").addEventListener("dblclick", () => editText($("#hero-title"), "title", 36));
$("#hero-subtitle").addEventListener("dblclick", () => editText($("#hero-subtitle"), "subtitle", 60));
$(".brand > span:last-child").addEventListener("dblclick", event => editText(event.currentTarget, "brandName", 16));

function addModule(name, customIcon = "") {
  const module = { id: uid("module"), name: name.trim(), sites: [] };
  if (customIcon) module.icon = customIcon;
  data.modules.push(module);
  if (!saveData("模块已创建")) {
    data.modules.pop();
    return null;
  }
  renderModules();
  return module;
}

function renderModuleIconDraft() {
  $("#moduleIconPreview").innerHTML = moduleIconMarkup(moduleDraft);
}

function openModuleDialog(moduleId) {
  const module = data.modules.find(item => item.id === moduleId);
  moduleDraft = { id: module?.id, icon: module?.icon || "" };
  moduleImageRequest++;
  $("#moduleForm").reset();
  $("#moduleDialogTitle").textContent = module ? "编辑模块" : "新建模块";
  $("#moduleName").value = module?.name || "";
  $("#moduleIconText").value = moduleDraft.icon.length <= 12 ? moduleDraft.icon : "";
  $("#moduleIconHint").textContent = "图标随模块一起保存与同步。";
  $("#saveModuleBtn").textContent = module ? "保存模块" : "创建模块";
  $("#saveModuleBtn").disabled = false;
  renderModuleIconDraft();
  moduleDialog.showModal();
}

function renameModule(moduleId) {
  const module = data.modules.find(item => item.id === moduleId);
  const title = moduleGrid.querySelector(`[data-module-id="${CSS.escape(moduleId)}"] .module-title`);
  if (!module || !title || title.querySelector("input")) return;
  const previous = module.name;
  title.innerHTML = `<input value="${escapeHtml(previous)}" maxlength="20" aria-label="模块名称" />`;
  const input = title.querySelector("input");
  input.style.cssText = "width:100%;border:0;outline:0;background:transparent;color:var(--text);font-weight:700;padding:0";
  input.focus(); input.select();
  const commit = () => {
    const next = input.value.trim();
    if (next && next !== previous) { module.name = next; saveData("模块名称已更新"); }
    renderModules();
  };
  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") { input.value = previous; input.blur(); }
  });
}

function fillModuleOptions(selected) {
  $("#siteModule").innerHTML = data.modules.map(module => `<option value="${escapeHtml(module.id)}">${escapeHtml(module.name)}</option>`).join("") + '<option value="__new__">＋ 新建模块…</option>';
  $("#siteModule").value = selected || data.modules[0]?.id || "__new__";
  toggleNewModuleField();
}

function openSiteDialog(moduleId, siteId = null) {
  closeTooltip();
  $("#siteForm").reset();
  $("#siteUrl").setCustomValidity("");
  $("#siteFaviconFile").value = "";
  $("#siteId").value = siteId || "";
  $("#siteDialogTitle").textContent = siteId ? "编辑网站" : "添加网站";
  $("#detectStatus").textContent = "输入网址后，将自动尝试识别名称、简介和图标。";
  lastAutoName = "";
  lastAutoDescription = "";
  if (siteId) {
    const found = findSite(siteId);
    if (!found) return;
    fillModuleOptions(found.module.id);
    $("#siteName").value = found.site.name;
    $("#siteUrl").value = found.site.url;
    $("#siteFavicon").value = found.site.favicon || "";
    $("#siteDescription").value = descriptionOf(found.site);
  } else {
    fillModuleOptions(moduleId);
  }
  updateFaviconPreview();
  siteDialog.showModal();
  setTimeout(() => $("#siteUrl").focus(), 30);
}

function toggleNewModuleField() {
  const isNew = $("#siteModule").value === "__new__";
  $("#newModuleField").hidden = !isNew;
  $("#newModuleName").required = isNew;
}

function updateFaviconPreview() {
  const value = $("#siteFavicon").value.trim() || faviconFor(normalizeUrl($("#siteUrl").value));
  const img = $("#faviconPreview");
  $("#faviconFallback").textContent = siteInitial($("#siteName").value || "网");
  if (!value) { img.hidden = true; return; }
  img.onerror = () => { img.hidden = true; };
  img.onload = () => { img.hidden = false; };
  img.src = value;
}

async function detectMetadata() {
  const normalized = normalizeUrl($("#siteUrl").value);
  if (!normalized) {
    if ($("#siteUrl").value.trim()) $("#detectStatus").textContent = "请输入有效的 HTTP 或 HTTPS 网址。";
    return;
  }
  $("#siteUrl").value = normalized;
  const guessed = inferredName(normalized);
  if (!$("#siteName").value.trim() || $("#siteName").value === lastAutoName) {
    $("#siteName").value = guessed;
    lastAutoName = guessed;
  }
  const suggestedDescription = descriptionOf({ url: normalized });
  if (!$("#siteDescription").value.trim() || $("#siteDescription").value === lastAutoDescription) {
    $("#siteDescription").value = suggestedDescription;
    lastAutoDescription = suggestedDescription;
  }
  updateFaviconPreview();
  $("#detectStatus").textContent = "正在尝试读取网页名称、简介和图标…";
  $("#detectStatus").classList.add("loading");
  detectController?.abort();
  const controller = new AbortController();
  detectController = controller;
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(normalized, { signal: controller.signal, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("No page title");
    const html = await response.text();
    if (detectController !== controller || $("#siteUrl").value !== normalized) return;
    const title = new DOMParser().parseFromString(html, "text/html").querySelector("title")?.textContent.trim();
    const documentRoot = new DOMParser().parseFromString(html, "text/html");
    const metaDescription = documentRoot.querySelector('meta[name="description" i]')?.getAttribute("content")?.trim()
      || documentRoot.querySelector('meta[property="og:description" i]')?.getAttribute("content")?.trim();
    if (title && (!$("#siteName").value.trim() || $("#siteName").value === lastAutoName)) {
      const clean = title.split(/[|｜—–-]/)[0].trim().slice(0, 30);
      if (clean) { $("#siteName").value = clean; lastAutoName = clean; }
    }
    if (metaDescription && (!$("#siteDescription").value.trim() || $("#siteDescription").value === lastAutoDescription)) {
      $("#siteDescription").value = metaDescription.slice(0, 80);
      lastAutoDescription = $("#siteDescription").value;
    }
    $("#detectStatus").textContent = "已识别；名称、简介和图标仍可手动修改。";
  } catch {
    if (detectController !== controller || $("#siteUrl").value !== normalized) return;
    $("#detectStatus").textContent = suggestedDescription
      ? "已根据网址生成名称、简介和图标，可继续手动修改。"
      : "已根据网址生成名称和图标，简介可手动填写。";
  } finally {
    clearTimeout(timer);
    if (detectController === controller) {
      $("#detectStatus").classList.remove("loading");
      updateFaviconPreview();
    }
  }
}

$("#siteModule").addEventListener("change", toggleNewModuleField);
$("#detectBtn").addEventListener("click", detectMetadata);
$("#siteUrl").addEventListener("input", () => {
  $("#siteUrl").setCustomValidity("");
  $("#detectStatus").classList.remove("loading");
  $("#detectStatus").textContent = "输入网址后，将自动尝试识别名称、简介和图标。";
});
$("#siteUrl").addEventListener("blur", () => { if (!$("#siteId").value) detectMetadata(); });
$("#siteName").addEventListener("input", updateFaviconPreview);
$("#siteFavicon").addEventListener("input", updateFaviconPreview);
$("#uploadFaviconBtn").addEventListener("click", () => $("#siteFaviconFile").click());
$("#siteFaviconFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const request = ++faviconImageRequest;
  try {
    const image = await compressImage(file, { max: 64, type: "image/webp", quality: .7 });
    if (request !== faviconImageRequest || !siteDialog.open) return;
    $("#siteFavicon").value = image;
    updateFaviconPreview();
    $("#detectStatus").textContent = "已上传图标；保存后会随网站一起同步。";
  } catch {
    if (request === faviconImageRequest && siteDialog.open) $("#detectStatus").textContent = "无法读取这张图标，请换一张再试。";
  }
});
siteDialog.addEventListener("close", () => {
  detectController?.abort();
  detectController = null;
  faviconImageRequest++;
  $("#detectStatus").classList.remove("loading");
});

function descriptionOf(site) {
  const domain = domainOf(site.url);
  return site.description ?? recommendedSites.get(domain)?.description ??
    (domain === "iconfont.cn" ? "查找和管理矢量图标素材" : "");
}

function closeTooltip() {
  clearTimeout(tooltipTimer);
  tooltipAnchor?.removeAttribute("aria-describedby");
  tooltipAnchor = null;
  siteTooltip.hidden = true;
}

function showTooltip(anchor) {
  const found = findSite(anchor.closest(".site-card").dataset.siteId);
  if (!found || draggedSite || menuAnchor || !anchor.isConnected) return;
  const description = descriptionOf(found.site);
  $("#tooltipDescription").textContent = description;
  $("#tooltipDescription").hidden = !description;
  $("#tooltipDomain").textContent = domainOf(found.site.url);
  siteTooltip.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  const left = Math.max(12, Math.min(center - siteTooltip.offsetWidth / 2, innerWidth - siteTooltip.offsetWidth - 12));
  const above = rect.bottom + siteTooltip.offsetHeight + 12 > innerHeight;
  siteTooltip.dataset.above = above;
  siteTooltip.style.left = `${left}px`;
  siteTooltip.style.top = `${above ? Math.max(8, rect.top - siteTooltip.offsetHeight - 8) : rect.bottom + 8}px`;
  siteTooltip.style.setProperty("--tip-arrow", `${Math.max(8, Math.min(siteTooltip.offsetWidth - 8, center - left))}px`);
  anchor.setAttribute("aria-describedby", siteTooltip.id);
}

function scheduleTooltip(anchor, delay) {
  if (anchor === tooltipAnchor && !siteTooltip.hidden) {
    clearTimeout(tooltipTimer);
    return;
  }
  closeTooltip();
  if (anchor.closest('[data-editing="true"]')) return;
  tooltipAnchor = anchor;
  tooltipTimer = setTimeout(() => showTooltip(anchor), delay);
}

moduleGrid.addEventListener("pointerover", event => {
  const anchor = event.target.closest(".site-main");
  if (event.pointerType === "mouse" && anchor && !anchor.contains(event.relatedTarget)) scheduleTooltip(anchor, 400);
});
moduleGrid.addEventListener("pointerout", event => {
  const anchor = event.target.closest(".site-main");
  if (event.pointerType !== "mouse" || anchor !== tooltipAnchor || anchor?.contains(event.relatedTarget)) return;
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(closeTooltip, 150);
});
moduleGrid.addEventListener("focusin", event => {
  if (event.target.matches(".site-main:focus-visible")) scheduleTooltip(event.target, 0);
});
moduleGrid.addEventListener("focusout", event => {
  if (event.target === tooltipAnchor) closeTooltip();
});
siteTooltip.addEventListener("pointerenter", () => clearTimeout(tooltipTimer));
siteTooltip.addEventListener("pointerleave", closeTooltip);

function closeMenu(restoreFocus = false) {
  $(".menu-popover")?.remove();
  menuAnchor?.setAttribute("aria-expanded", "false");
  if (restoreFocus) menuAnchor?.focus();
  menuAnchor = null;
}

function openMenu(anchor, items) {
  const wasOpen = menuAnchor === anchor;
  closeMenu();
  closeTooltip();
  if (wasOpen) return;
  const menu = document.createElement("div");
  menu.className = "menu-popover";
  menu.innerHTML = items.map(item => `<button type="button" data-action="${item.action}" class="${item.danger ? "danger" : ""}">${item.label}</button>`).join("");
  document.body.appendChild(menu);
  menuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${rect.bottom + menu.offsetHeight + 6 < innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - menu.offsetHeight - 5)}px`;
  menu.querySelector("button").focus();
  menu.addEventListener("click", event => {
    const item = items.find(option => option.action === event.target.dataset.action);
    if (item) {
      closeMenu(true);
      item.run();
    }
  });
}

moduleGrid.addEventListener("click", event => {
  const addButton = event.target.closest('[data-action="add-site"]');
  if (addButton) return openSiteDialog(addButton.dataset.moduleId);
  const link = event.target.closest(".site-main");
  if (link) {
    closeTooltip();
    if (link.closest('[data-editing="true"]')) {
      event.preventDefault();
      const card = link.closest(".site-card");
      openSiteDialog(card.dataset.moduleId, card.dataset.siteId);
    }
    return;
  }
  const menuButton = event.target.closest("[data-menu]");
  if (!menuButton) return;
  event.stopPropagation();
  const moduleCard = menuButton.closest(".module-card");
  const moduleId = moduleCard.dataset.moduleId;
  if (menuButton.dataset.menu === "module") {
    openMenu(menuButton, [
      { action: "manage", label: editingModules.has(moduleId) ? "完成编辑" : "编辑网站", run: () => {
        if (editingModules.has(moduleId)) editingModules.delete(moduleId);
        else editingModules.add(moduleId);
        renderModules();
        moduleGrid.querySelector(`[data-module-id="${CSS.escape(moduleId)}"] [data-menu="module"]`)?.focus();
      }},
      { action: "add", label: "添加网站", run: () => openSiteDialog(moduleId) },
      { action: "rename", label: "修改名称", run: () => renameModule(moduleId) },
      { action: "icon", label: "设置模块图标", run: () => openModuleDialog(moduleId) },
      { action: "delete", label: "删除模块", danger: true, run: () => {
        const module = data.modules.find(item => item.id === moduleId);
        if (module?.sites.length && !confirm(`“${module.name}”中还有 ${module.sites.length} 个网站，确定一起删除吗？`)) return;
        data.modules = data.modules.filter(item => item.id !== moduleId);
        editingModules.delete(moduleId);
        saveData("模块已删除"); renderModules();
      }}
    ]);
  } else {
    const siteCard = menuButton.closest(".site-card");
    const siteId = siteCard.dataset.siteId;
    const found = findSite(siteId);
    openMenu(menuButton, [
      { action: "edit", label: "编辑网站", run: () => openSiteDialog(moduleId, siteId) },
      { action: "delete", label: "删除网站", danger: true, run: () => {
        if (!confirm(`确定删除“${found.site.name}”吗？`)) return;
        found.module.sites = found.module.sites.filter(item => item.id !== siteId);
        saveData("网站已删除"); renderModules();
      }}
    ]);
  }
});

moduleGrid.addEventListener("dblclick", event => {
  const title = event.target.closest(".module-title");
  if (title) renameModule(title.closest(".module-card").dataset.moduleId);
});

document.addEventListener("click", event => {
  if (!event.target.closest(".module-menu,.site-menu,.menu-popover")) closeMenu();
});
window.addEventListener("scroll", () => { closeTooltip(); closeMenu(); }, { capture: true, passive: true });
window.addEventListener("resize", () => { closeTooltip(); closeMenu(); });

$("#siteForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#siteName").value.trim();
  const url = normalizeUrl($("#siteUrl").value);
  if (!url) {
    $("#siteUrl").setCustomValidity("请输入有效的 HTTP 或 HTTPS 网址。");
    $("#siteUrl").reportValidity();
    return;
  }
  if (!name) return $("#siteName").focus();
  let targetModule;
  if ($("#siteModule").value === "__new__") {
    if (!$("#newModuleName").value.trim()) return $("#newModuleName").focus();
    targetModule = addModule($("#newModuleName").value);
  }
  else targetModule = data.modules.find(module => module.id === $("#siteModule").value);
  if (!targetModule) return;
  const siteId = $("#siteId").value;
  const favicon = $("#siteFavicon").value.trim();
  const description = $("#siteDescription").value.trim();
  if (siteId) {
    const found = findSite(siteId);
    const color = found?.site.color || accentFor(targetModule.sites.length);
    if (!found) return;
    const updated = { ...found.site, name, url, favicon, description, color };
    if (found.module === targetModule) {
      Object.assign(found.site, updated);
    } else {
      found.module.sites = found.module.sites.filter(item => item.id !== siteId);
      targetModule.sites.push(updated);
    }
    saveData("网站已更新");
  } else {
    targetModule.sites.push({ id: uid("site"), name, url, favicon, description, color: accentFor(targetModule.sites.length + data.modules.indexOf(targetModule)) });
    saveData("网站已添加");
  }
  siteDialog.close(); renderModules(); updateSuggestions();
});

$("#moduleForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#moduleName").value.trim();
  if (!name || $("#saveModuleBtn").disabled) return;
  const index = data.modules.findIndex(item => item.id === moduleDraft.id);
  let module;
  if (index === -1) {
    module = addModule(name, moduleDraft.icon);
    if (!module) return;
  } else {
    const previous = data.modules[index];
    module = { ...previous, name };
    if (moduleDraft.icon) module.icon = moduleDraft.icon;
    else delete module.icon;
    data.modules[index] = module;
    if (!saveData("模块已更新")) {
      data.modules[index] = previous;
      return;
    }
    renderModules();
  }
  moduleDialog.close();
  moduleGrid.querySelector(`[data-module-id="${CSS.escape(module.id)}"]`)?.scrollIntoView({ block: "nearest" });
});
$("#moduleIconText").addEventListener("input", event => {
  moduleImageRequest++;
  moduleDraft.icon = event.target.value.trim();
  $("#moduleIconHint").textContent = "图标随模块一起保存与同步。";
  $("#saveModuleBtn").disabled = false;
  renderModuleIconDraft();
});
$("#uploadModuleIconBtn").addEventListener("click", () => $("#moduleIconFile").click());
$("#resetModuleIconBtn").addEventListener("click", () => {
  $("#moduleIconText").value = "";
  $("#moduleIconText").dispatchEvent(new Event("input"));
});
$("#moduleIconFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const request = ++moduleImageRequest;
  $("#saveModuleBtn").disabled = true;
  $("#moduleIconHint").textContent = "正在处理图片…";
  try {
    const image = await compressImage(file, { max: 48, type: "image/png" });
    if (image.length > 16_000) throw new Error("Module icon too large");
    if (request !== moduleImageRequest || !moduleDialog.open) return;
    moduleDraft.icon = image;
    $("#moduleIconText").value = "";
    $("#moduleIconHint").textContent = "已选好图片，保存后生效。";
    renderModuleIconDraft();
  } catch {
    if (request === moduleImageRequest && moduleDialog.open) $("#moduleIconHint").textContent = "无法读取图片，请换一张再试。";
  } finally {
    if (request === moduleImageRequest) $("#saveModuleBtn").disabled = false;
  }
});
$("#addModuleBtn").addEventListener("click", () => openModuleDialog());
$("[data-action='add-module']").addEventListener("click", () => openModuleDialog());
$("#addSiteTopBtn").addEventListener("click", () => openSiteDialog(data.modules[0]?.id));
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog).close()));

function clearDragStyles() {
  document.querySelectorAll(".drag-target,.drop-before,.drop-after").forEach(element => element.classList.remove("drag-target","drop-before","drop-after"));
}

moduleGrid.addEventListener("dragstart", event => {
  const card = event.target.closest(".site-card");
  if (!card) return;
  closeTooltip();
  closeMenu();
  draggedSite = { siteId: card.dataset.siteId, fromModuleId: card.dataset.moduleId };
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.siteId);
});

moduleGrid.addEventListener("dragend", event => {
  clearDragStyles();
  event.target.closest(".site-card")?.classList.remove("dragging");
  draggedSite = null;
});

function dropsBefore(event, card) {
  const rect = card.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2;
}

moduleGrid.addEventListener("dragover", event => {
  const moduleCard = event.target.closest(".module-card");
  if (!moduleCard || !draggedSite) return;
  event.preventDefault();
  clearDragStyles();
  moduleCard.classList.add("drag-target");
  const targetSite = event.target.closest(".site-card");
  if (targetSite && targetSite.dataset.siteId !== draggedSite.siteId) {
    targetSite.classList.add(dropsBefore(event, targetSite) ? "drop-before" : "drop-after");
  }
});

moduleGrid.addEventListener("drop", event => {
  const moduleCard = event.target.closest(".module-card");
  if (!moduleCard || !draggedSite) return;
  event.preventDefault();
  const targetModule = data.modules.find(module => module.id === moduleCard.dataset.moduleId);
  const sourceModule = data.modules.find(module => module.id === draggedSite.fromModuleId);
  const sourceIndex = sourceModule?.sites.findIndex(site => site.id === draggedSite.siteId) ?? -1;
  if (!targetModule || !sourceModule || sourceIndex < 0) return;
  const targetSite = event.target.closest(".site-card");
  const targetSiteId = targetSite?.dataset.siteId;
  if (targetSiteId === draggedSite.siteId) return;
  const [site] = sourceModule.sites.splice(sourceIndex, 1);
  let targetIndex = targetSiteId ? targetModule.sites.findIndex(item => item.id === targetSiteId) : -1;
  if (targetIndex < 0) targetIndex = targetModule.sites.length;
  else if (!dropsBefore(event, targetSite)) targetIndex += 1;
  targetModule.sites.splice(targetIndex, 0, site);
  saveData(sourceModule === targetModule ? "网站顺序已更新" : `已移动到“${targetModule.name}”`);
  clearDragStyles(); draggedSite = null; renderModules();
});

function setupEngines() {
  $("#engineShortcuts").innerHTML = engines.map(engine => `<button class="engine-chip" type="button" data-engine="${engine.id}">${icon(engine.id, "engine-logo")}${engine.name}</button>`).join("");
  chooseEngine(selectedEngine);
}

function chooseEngine(id) {
  const engine = engines.find(item => item.id === id) || engines[0];
  selectedEngine = engine.id;
  localStorage.setItem(ENGINE_KEY, engine.id);
  document.querySelectorAll(".engine-chip").forEach(button => {
    const active = button.dataset.engine === engine.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  $("#searchInput").placeholder = engine.id === "google" ? "搜索网页或收藏的网站" : `使用 ${engine.name} 搜索，或查找收藏`;
}

$("#engineShortcuts").addEventListener("click", event => {
  const button = event.target.closest("[data-engine]");
  if (button) { chooseEngine(button.dataset.engine); $("#searchInput").focus(); }
});

function allSites() { return data.modules.flatMap(module => module.sites.map(site => ({ ...site, moduleName: module.name }))); }
function updateSuggestions() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const panel = $("#suggestions");
  activeSuggestion = -1;
  if (!query) { panel.hidden = true; currentMatches = []; return; }
  const matches = allSites().filter(site => `${site.name} ${domainOf(site.url)} ${descriptionOf(site)}`.toLowerCase().includes(query));
  currentMatches = matches.slice(0, 7);
  if (!currentMatches.length) { panel.hidden = true; return; }
  panel.innerHTML = currentMatches.map((site, index) => `<button class="suggestion" type="button" role="option" data-index="${index}">${logoMarkup(site)}<span class="suggestion-copy"><strong>${escapeHtml(site.name)}</strong><span>${escapeHtml(domainOf(site.url))}</span></span><span class="suggestion-tag">${escapeHtml(site.moduleName)}</span></button>`).join("");
  panel.hidden = false;
}
function openMatch(index) {
  const url = currentMatches[index] && normalizeUrl(currentMatches[index].url);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  $("#suggestions").hidden = true;
  activeSuggestion = -1;
}
$("#searchInput").addEventListener("input", updateSuggestions);
$("#searchInput").addEventListener("keydown", event => {
  if (!currentMatches.length || $("#suggestions").hidden) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeSuggestion = activeSuggestion < 0 ? (direction > 0 ? 0 : currentMatches.length - 1)
      : (activeSuggestion + direction + currentMatches.length) % currentMatches.length;
    document.querySelectorAll(".suggestion").forEach((item,index) => item.classList.toggle("active", index === activeSuggestion));
  }
});
$("#suggestions").addEventListener("click", event => { const option = event.target.closest("[data-index]"); if (option) openMatch(Number(option.dataset.index)); });
$("#searchForm").addEventListener("submit", event => {
  event.preventDefault();
  const query = $("#searchInput").value.trim();
  if (!query) return $("#searchInput").focus();
  if (activeSuggestion >= 0 && !$("#suggestions").hidden) return openMatch(activeSuggestion);
  window.open(engines.find(item => item.id === selectedEngine).url + encodeURIComponent(query),"_blank","noopener");
});
document.addEventListener("click", event => { if (!event.target.closest("#searchWrap")) $("#suggestions").hidden = true; });
document.addEventListener("keydown", event => {
  if (event.isComposing || document.querySelector("dialog[open]")) return;
  const typing = event.target.matches?.("input, textarea, select, [contenteditable]");
  if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    $("#searchInput").focus();
  }
  if (event.key === "Escape") {
    closeTooltip();
    closeMenu(true);
    closeToolbarMenus();
    if (event.target === $("#searchInput")) {
      $("#searchInput").value = "";
      updateSuggestions();
    }
  }
});

function applyTheme(mode) {
  const isDark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.querySelectorAll("[data-theme]").forEach(button => {
    const active = button.dataset.theme === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  const themeIcon = { light: "sun", dark: "moon", system: "monitor" };
  $("#themeMenu summary use").setAttribute("href", `./icons.svg#${themeIcon[mode] ?? "monitor"}`);
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#111114" : "#f5f5f7";
}
let themeMode = localStorage.getItem(THEME_KEY) || "light";
applyTheme(themeMode);
function closeToolbarMenus() {
  $("#layoutMenu").open = false;
  $("#themeMenu").open = false;
}

document.addEventListener("click", event => {
  const active = event.target.closest(".toolbar-menu");
  document.querySelectorAll(".toolbar-menu[open]").forEach(menu => {
    if (menu !== active) menu.open = false;
  });
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-theme]");
  if (!button) return;
  themeMode = button.dataset.theme; localStorage.setItem(THEME_KEY, themeMode); applyTheme(themeMode);
  closeToolbarMenus();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (themeMode === "system") applyTheme("system"); });

$("#layoutMenu").addEventListener("click", event => {
  const button = event.target.closest("[data-layout-choice]");
  if (!button) return;
  data.layout = Number(button.dataset.layoutChoice);
  saveData(`已切换为${["", "一", "两", "三", "四"][data.layout]}列模块布局`);
  applyContent();
  closeToolbarMenus();
});

$("#settingsBtn").addEventListener("click", () => {
  closeTooltip();
  $("#brandIconInput").value = data.brandIcon || defaultData.brandIcon;
  $("#brandNameInput").value = data.brandName || defaultData.brandName;
  setBrandImageDraft(data.brandImage);
  applyWallpaper();
  manageDialog.showModal();
});
$("#closeManageBtn").addEventListener("click", () => manageDialog.close());
manageDialog.addEventListener("close", () => {
  brandImageRequest++;
  $("#brandImageInput").value = "";
});

$(".settings-tabs").addEventListener("click", event => {
  const button = event.target.closest("[data-settings-tab]");
  if (!button) return;
  const target = button.dataset.settingsTab;
  document.querySelectorAll("[data-settings-tab]").forEach(item => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-settings-panel]").forEach(panel => {
    const active = panel.dataset.settingsPanel === target;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
});

function setBrandImageDraft(image) {
  pendingBrandImage = isLocalImage(image) ? image : "";
  $("#removeBrandImageBtn").disabled = !pendingBrandImage;
  $("#saveBrandBtn").disabled = false;
  $("#brandImageHint").textContent = pendingBrandImage
    ? "图片已就绪，点击「保存品牌」应用。"
    : "支持 PNG、JPG、WebP 和 GIF，品牌图片会自动压缩后同步。";
  renderBrandMark($("#brandPreview"), $("#brandIconInput").value.trim(), pendingBrandImage);
}

$("#uploadBrandBtn").addEventListener("click", () => $("#brandImageInput").click());
$("#uploadWallpaperBtn").addEventListener("click", () => $("#wallpaperInput").click());
$("#importBackupBtn").addEventListener("click", () => $("#importInput").click());
$("#brandIconInput").addEventListener("input", event => {
  renderBrandMark($("#brandPreview"), event.target.value.trim(), pendingBrandImage);
});
$("#removeBrandImageBtn").addEventListener("click", () => {
  brandImageRequest++;
  $("#brandImageInput").value = "";
  setBrandImageDraft("");
});
$("#brandImageInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const request = ++brandImageRequest;
  $("#saveBrandBtn").disabled = true;
  $("#brandImageHint").textContent = "正在处理图片…";
  try {
    // Brand marks render at a very small size. Keep them compact so the full
    // appearance snapshot can always fit alongside a custom wallpaper.
    const image = await compressImage(file, { max: 96, type: "image/webp", quality: .65 });
    if (image.length > 70_000) throw new Error("Brand image too large");
    if (request === brandImageRequest) setBrandImageDraft(image);
  } catch {
    if (request !== brandImageRequest) return;
    $("#brandImageHint").textContent = "无法读取这张图片，请换一张再试。";
    $("#saveBrandBtn").disabled = false;
  }
});

$("#saveBrandBtn").addEventListener("click", () => {
  const name = $("#brandNameInput").value.trim();
  const icon = $("#brandIconInput").value.trim() || defaultData.brandIcon;
  if (!name) return $("#brandNameInput").focus();
  const previous = data;
  data = { ...data, brandName: name, brandIcon: icon, brandImage: pendingBrandImage };
  if (!saveData("品牌已更新")) {
    data = previous;
    return;
  }
  $("#brandImageHint").textContent = "品牌已保存。";
  applyContent();
});

async function compressImage(file, { max = 1800, type = "image/jpeg", quality = .8 } = {}) {
  const source = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const image = await new Promise((resolve,reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = source; });
  const scale = Math.min(1, max / Math.max(image.width,image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL(type, quality);
}

$("#wallpaperPresets").innerHTML = Object.entries(wallpaperPresets).map(([id, preset]) =>
  `<button type="button" data-wallpaper-choice="${id}"><span class="wallpaper-swatch" style="--swatch:${preset.background || "var(--wallpaper-default)"}"></span>${preset.name}</button>`
).join("");
$("#wallpaperPresets").addEventListener("click", event => {
  const button = event.target.closest("[data-wallpaper-choice]");
  if (!button) return;
  data.wallpaper = "";
  data.wallpaperPreset = button.dataset.wallpaperChoice;
  saveData("壁纸已更新");
  applyWallpaper();
});
$("#wallpaperInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  showToast("正在处理壁纸…");
  const previous = data.wallpaper;
  try {
    data.wallpaper = await compressImage(file);
    if (!saveData("壁纸已更新")) data.wallpaper = previous;
    applyWallpaper();
  } catch { showToast("无法读取这张图片"); }
  event.target.value = "";
});
$("#removeWallpaperBtn").addEventListener("click", () => {
  data.wallpaper = "";
  data.wallpaperPreset = "default";
  saveData("已恢复默认背景");
  applyWallpaper();
});

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("#exportBtn").addEventListener("click", () => {
  downloadFile(`拾光导航备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
  showToast("备份已导出");
});

function captureBookmarklet() {
  const appUrl = `${location.origin}${location.pathname}`;
  return `javascript:(()=>{const d=document,p=new URL(${JSON.stringify(appUrl)}),i=d.querySelector('link[rel~="icon"]');p.searchParams.set('captureUrl',location.href);p.searchParams.set('captureTitle',d.title||'');p.searchParams.set('captureDescription',d.querySelector('meta[name="description"]')?.content||d.querySelector('meta[property="og:description"]')?.content||'');p.searchParams.set('captureFavicon',i?.href||'');window.open(p.href,'_blank')})()`;
}

$("#copyCaptureBookmarkletBtn").addEventListener("click", async () => {
  const value = captureBookmarklet();
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  $("#captureBookmarkletStatus").textContent = "采集代码已复制。请新建浏览器书签，把地址粘贴为这段代码。";
  showToast("采集书签已复制");
});

function markdownText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]()#|!<>]/g, "\\$&");
}

function feishuMarkdown() {
  const title = markdownText(data.brandName || defaultData.brandName);
  const sections = data.modules.map(module => {
    const lines = [`## ${markdownText(module.name)}`];
    if (!module.sites.length) return [...lines, "", "此模块暂未收藏网站。"].join("\n");
    lines.push("", "| 图标 | 网站 | 网址 | 简介 |", "| --- | --- | --- | --- |");
    for (const site of module.sites) {
      const url = normalizeUrl(site.url);
      if (!url) continue;
      const customLogo = /^https?:\/\//i.test(site.favicon || "") && normalizeUrl(site.favicon);
      const logo = customLogo || new URL("/favicon.ico", url).href;
      const link = url.replaceAll("<", "%3C").replaceAll(">", "%3E").replaceAll("|", "%7C");
      const image = logo.replaceAll("<", "%3C").replaceAll(">", "%3E").replaceAll("|", "%7C");
      lines.push(`| ![](<${image}>) | ${markdownText(site.name)} | <${link}> | ${markdownText(descriptionOf(site)) || "—"} |`);
    }
    return lines.join("\n");
  });
  return [`# ${title} · 网站收藏`, ...sections].join("\n\n") + "\n";
}

$("#exportFeishuBtn").addEventListener("click", () => {
  downloadFile(`拾光导航飞书清单-${new Date().toISOString().slice(0, 10)}.md`, feishuMarkdown(), "text/markdown;charset=utf-8");
  showToast("飞书清单已导出");
});

$("#importInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const valid = Array.isArray(parsed?.modules) && parsed.modules.every(module =>
      typeof module?.id === "string" && typeof module.name === "string" && Array.isArray(module.sites) &&
      module.sites.every(site => typeof site?.id === "string" && typeof site.name === "string" &&
        typeof site.url === "string" && normalizeUrl(site.url))
    );
    if (!valid) throw new Error("invalid backup");
    const previous = data;
    data = { ...clone(defaultData), ...parsed };
    if (!saveData("备份已导入")) {
      data = previous;
      return;
    }
    editingModules.clear();
    applyContent();
    renderModules();
    manageDialog.close();
  } catch { showToast("无法读取这个备份文件"); }
  finally { event.target.value = ""; }
});
$("#resetBtn").addEventListener("click", () => {
  if (!confirm("确定恢复默认导航吗？当前修改会被覆盖。已启用云同步时，默认收藏也会同步到其他设备。")) return;
  data = { ...clone(defaultData), layout: data.layout };
  editingModules.clear();
  saveData("已恢复默认导航"); applyContent(); renderModules(); manageDialog.close();
});

setupEngines();
applyContent();
renderModules();
cloudSync = createCollectionSync({
  getCollection: () => data,
  setCollection(collection) {
    const next = { ...data, ...collection };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { return false; }
    data = next;
    editingModules.clear();
    applyContent();
    renderModules();
    updateSuggestions();
    return true;
  },
  defaultCollection: defaultData,
  isEditing: () => Boolean(draggedSite || document.querySelector("#siteDialog[open],#moduleDialog[open],.module-title input")),
  notify: showToast,
  openSettings() {
    $("#settingsBtn").click();
    $('[data-settings-tab="data"]').click();
  }
});
cloudSync.start();

function openCapturedSite() {
  const params = new URLSearchParams(location.search);
  const url = params.get("captureUrl");
  if (!url) return;
  const title = params.get("captureTitle") || "";
  const description = params.get("captureDescription") || "";
  const favicon = params.get("captureFavicon") || "";
  try { history.replaceState(null, "", `${location.pathname}${location.hash}`); } catch {}
  openSiteDialog(data.modules[0]?.id);
  $("#siteUrl").value = url;
  $("#siteName").value = title.slice(0, 30);
  $("#siteDescription").value = description.slice(0, 80);
  $("#siteFavicon").value = favicon;
  $("#detectStatus").textContent = "已从浏览器采集，可继续修改后保存。";
  updateFaviconPreview();
}

setTimeout(openCapturedSite, 250);
