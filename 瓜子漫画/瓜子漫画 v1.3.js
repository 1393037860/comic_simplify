// ==UserScript==
// @name         瓜子漫画
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  隐藏指定元素并按需注入自定义样式，适配瓜子漫画(guazimanhua.com)
// @author       Suave
// @match        https://www.guazimanhua.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=guazimanhua.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

// 1.0 脚本初始化
// 1.1 增加广告跳转拦截（window.open / location 跳转 / 点击劫持）
// 1.2 增加广告诊断工具（红色标记可疑遮罩层 + 点击位置元素栈 + 拦截调用栈）
// 1.3 移除广告SDK脚本（mobile-bottom-ad/mobile-top-static-ad）+ location.href 跳转兜底回滚
(function () {
  "use strict";

  // ===== 全局状态变量 =====
  let styleElement = null; // 基础样式 <style> 元素（#user-script-styles）
  let userCssElement = null; // 自定义样式 <style> 元素（#user-script-future-styles，内容为 CSS_RULES）
  let observer = null; // MutationObserver 实例（监听 DOM 变化）
  let initCalled = false; // 是否已初始化过（防止重复初始化）

  // ===== 广告跳转拦截（document-start 即生效，先于页面广告脚本）=====
  // 白名单：只允许跳转到瓜子漫画自己的域名，其余一律拦截
  const ALLOWED_HOSTS = ["guazimanhua.com", "guazicdn.com", "guaziapp.com"];

  const isAllowedUrl = (url) => {
    try {
      const u = new URL(String(url || ""), location.href);
      return ALLOWED_HOSTS.some(
        (h) => u.hostname === h || u.hostname.endsWith("." + h),
      );
    } catch (e) {
      return false;
    }
  };

  // 1) 拦截 window.open（广告最常用的新标签页打开方式）
  const _originalOpen = window.open;
  window.open = function (url) {
    try {
      if (url && !isAllowedUrl(String(url))) {
        console.warn(
          "[漫画脚本] 已拦截广告新窗口: " +
            String(url) +
            (DEBUG_ADS ? " \n调用栈: " + new Error().stack : ""),
        );
        scanOverlays();
        return null;
      }
    } catch (e) {}
    return _originalOpen.apply(this, arguments);
  };

  // 2) 拦截同页跳转 location.assign / location.replace
  try {
    const _assign = window.location.assign;
    window.location.assign = function (url) {
      if (isAllowedUrl(String(url))) {
        return _assign.call(window.location, url);
      }
      console.warn(
        "[漫画脚本] 已拦截广告跳转: " +
          String(url) +
          (DEBUG_ADS ? " \n调用栈: " + new Error().stack : ""),
      );
      scanOverlays();
    };
  } catch (e) {}
  try {
    const _replace = window.location.replace;
    window.location.replace = function (url) {
      if (isAllowedUrl(String(url))) {
        return _replace.call(window.location, url);
      }
      console.warn(
        "[漫画脚本] 已拦截广告跳转: " +
          String(url) +
          (DEBUG_ADS ? " \n调用栈: " + new Error().stack : ""),
      );
      scanOverlays();
    };
  } catch (e) {}

  // 3) 捕获阶段拦截点击：外部链接点击、广告容器内的点击（先于页面其他监听执行）
  const blockAdClick = (event) => {
    try {
      const target = event.target;
      if (DEBUG_ADS && typeof document.elementsFromPoint === "function") {
        const atPoint = document.elementsFromPoint(event.clientX, event.clientY);
        console.log(
          "[漫画脚本][诊断] 点击: " +
            describeEl(target) +
            " @(" +
            Math.round(event.clientX) +
            "," +
            Math.round(event.clientY) +
            ") | 该位置元素: " +
            atPoint.slice(0, 6).map(describeEl).join(" → "),
        );
        for (const el of atPoint.slice(0, 6)) {
          if (isOverlayLike(el)) markOverlay(el);
        }
      }
      if (!target || typeof target.closest !== "function") return;
      const anchor = target.closest("a[href]");
      if (anchor) {
        const href = anchor.getAttribute("href") || "";
        if (!isAllowedUrl(href)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          console.warn(
            "[漫画脚本] 已拦截外部链接点击: " +
              href +
              (DEBUG_ADS ? " \n调用栈: " + new Error().stack : ""),
          );
          scanOverlays();
          return;
        }
      }
      if (
        target.closest(
          '[aria-label="广告"], [aria-label="推广"], [class*="-ad"], [class*="_ad"], [class*="ad-"]',
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    } catch (e) {}
  };
  document.addEventListener("click", blockAdClick, true);
  document.addEventListener("auxclick", blockAdClick, true);

  // ===== 广告 SDK 脚本拦截：移除 mobile 底部/顶部广告脚本，点击劫持即失效 =====
  const blockAdScripts = () => {
    try {
      const bad = document.querySelectorAll(
        'script[data-guazi-mobile-bottom-ad], script[data-guazi-mobile-top-static-ad]',
      );
      for (const s of bad) {
        if (s.dataset.dshAdBlocked === "1") continue;
        s.dataset.dshAdBlocked = "1";
        const src =
          s.getAttribute("src") ||
          s.getAttribute("data-guazi-mobile-bottom-ad") ||
          s.getAttribute("data-guazi-mobile-top-static-ad");
        s.remove(); // 下载完成前移除，阻止执行
        console.warn("[漫画脚本] 已移除广告SDK脚本: " + src);
      }
    } catch (e) {}
  };

  // 动态注入的外部域名脚本一律移除（广告 SDK 常动态加载后续脚本）
  const adScriptObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (!n || n.tagName !== "SCRIPT") continue;
        const src = n.getAttribute && n.getAttribute("src");
        if (src && !isAllowedUrl(src)) {
          n.remove();
          console.warn("[漫画脚本] 已移除外部广告脚本: " + src);
        }
      }
    }
    blockAdScripts();
  });
  const startAdScriptObserver = () => {
    if (!document.documentElement) {
      setTimeout(startAdScriptObserver, 10);
      return;
    }
    adScriptObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };
  startAdScriptObserver();
  blockAdScripts();

  // ===== location.href 跳转兜底：监视地址变化，非白名单立即跳回原页面 =====
  let lastKnownUrl = location.href;
  setInterval(() => {
    try {
      if (location.href !== lastKnownUrl) {
        if (isAllowedUrl(location.href)) {
          lastKnownUrl = location.href; // 正常跳转（章节切换等），更新基准
        } else {
          console.warn("[漫画脚本] 检测到广告跳转，已跳回: " + location.href);
          location.href = lastKnownUrl; // 回滚到原页面
        }
      }
    } catch (e) {}
  }, 80);

  // ===== 广告诊断工具（DEBUG_ADS = true 时启用：红色标记可疑遮罩层 + 打印点击位置元素栈）=====
  const DEBUG_ADS = true;

  const describeEl = (el) => {
    try {
      if (!el) return "null";
      const parts = [];
      if (el.id) parts.push("#" + el.id);
      if (
        el.className &&
        typeof el.className === "string" &&
        el.className.trim()
      ) {
        parts.push("." + el.className.trim().split(/\s+/).join("."));
      }
      return (
        (el.tagName || "").toLowerCase() +
        (parts.length ? "[" + parts.join(" ") + "]" : "")
      );
    } catch (e) {
      return String((el && el.tagName) || "?");
    }
  };

  const ancestorPath = (el, depth) => {
    try {
      const path = [];
      let n = el;
      for (let i = 0; i < (depth || 5) && n && n !== document.body; i++) {
        path.push(describeEl(n));
        n = n.parentElement;
      }
      return path.join(" < ");
    } catch (e) {
      return "";
    }
  };

  // 可疑遮罩判定：fixed/absolute + 超高 z-index（广告 SDK 特征是 2147483646）
  const isOverlayLike = (el) => {
    try {
      if (!el || el === document.body || el === document.documentElement)
        return false;
      const cs = window.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return false;
      const z = parseInt(cs.zIndex, 10) || 0;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      const coverRatio = (r.width * r.height) / (vw * vh);
      return (z >= 1000000 && coverRatio > 0.1) || (z >= 1000 && coverRatio > 0.6);
    } catch (e) {
      return false;
    }
  };

  // 给可疑元素画红框标记，并打印位置/尺寸/祖先链（透明遮罩也看得见）
  const markOverlay = (el) => {
    try {
      if (!el || !el.style || el.dataset.dshAdMarked === "1") return;
      el.dataset.dshAdMarked = "1";
      el.style.setProperty("outline", "3px solid red", "important");
      el.style.setProperty("outline-offset", "-2px", "important");
      el.style.setProperty("background", "rgba(255, 0, 0, 0.12)", "important");
      const r = el.getBoundingClientRect();
      console.warn(
        "[漫画脚本][诊断] 疑似广告遮罩: " +
          describeEl(el) +
          " | z-index:" +
          window.getComputedStyle(el).zIndex +
          " | 位置:" +
          Math.round(r.left) +
          "," +
          Math.round(r.top) +
          " | 尺寸:" +
          Math.round(r.width) +
          "x" +
          Math.round(r.height) +
          " | 祖先: " +
          ancestorPath(el, 4),
      );
    } catch (e) {}
  };

  // 扫描页面找可疑遮罩（每 1.5 秒一次；拦截到广告时也会立即触发）
  const scanOverlays = () => {
    try {
      if (!document.body || typeof document.body.querySelectorAll !== "function")
        return;
      const els = document.body.querySelectorAll("*");
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const inline = el.getAttribute && el.getAttribute("style");
        const cls = typeof el.className === "string" ? el.className : "";
        if (
          !(inline && /position|z-index/i.test(inline)) &&
          !/ad/i.test(cls + (el.id || ""))
        )
          continue;
        if (isOverlayLike(el)) markOverlay(el);
      }
    } catch (e) {}
  };

  setInterval(scanOverlays, 1500);

  /**
   * 函数防抖：把高频触发的调用合并成一次，delay 毫秒内没有新触发才真正执行 fn
   * @param {Function} fn - 要防抖的函数
   * @param {number} delay - 延迟毫秒数
   * @returns {Function} 防抖后的函数
   */
  const debounce = (fn, delay) => {
    // 每个防抖实例使用独立计时器，互不干扰
    let timer = null;
    return function () {
      const args = arguments;
      const context = this;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        fn.apply(context, args);
      }, delay);
    };
  };

  /**
   * 隐藏元素：按 id / class / CSS 选择器 找到元素并设置 display:none
   * @param {{selector: string, selectorType?: 'id'|'class'|'css'}} options
   *   selector     - id 值、class 名，或任意 CSS 选择器（selectorType 为 "css" 时）
   *   selectorType - 选择器类型，默认 "class"；"id" 按 id 查找；"css" 用 querySelectorAll 匹配
   */
  const hideElement = (options) => {
    const selector = options.selector;
    const selectorType = options.selectorType || "class";
    let elements = [];
    if (selectorType === "id") {
      const element = document.getElementById(selector);
      if (element) elements.push(element);
    } else if (selectorType === "css") {
      elements = Array.prototype.slice.call(
        document.querySelectorAll(selector),
      );
    } else {
      elements = Array.prototype.slice.call(
        document.getElementsByClassName(selector),
      );
    }

    if (elements.length > 0) {
      for (let i = 0; i < elements.length; i++) {
        elements[i].style.display = "none";
      }
    }
  };

  // ===== 配置区：要隐藏的元素（按 id/class/css 选择器），可自行增删 =====
  const selectorsToHide = [
    { selector: "footer" },
    { selector: '[aria-label="推广"]', selectorType: "css" }, // 隐藏页面中全部推广广告
    { selector: '[aria-label="广告"]', selectorType: "css" }, // 隐藏页面中全部 aria-label="广告" 的广告块（如详情页顶部移动端广告）
    { selector: '[alt="广告"]', selectorType: "css" }, // 隐藏页面中全部 alt="广告" 的图片
  ];

  // ===== 配置区：自定义注入样式（CSS_RULES），可自行增删规则 =====
  // 隐藏外部域名的 iframe（广告 SDK 常用透明 iframe 劫持点击）；如影响正常功能可删除该规则
  const CSS_RULES =
    'iframe[src^="http"]:not([src*="guazimanhua.com"]):not([src*="guazicdn.com"]):not([src*="guaziapp.com"]) { display: none !important; }';

  /**
   * 注入基础样式：创建 #user-script-styles 并写入 .user-style-fixed 规则
   * （只创建一次，已存在则跳过）
   */
  const ensureStyleElement = () => {
    if (styleElement && document.getElementById("user-script-styles")) {
      return;
    }
    styleElement = document.createElement("style");
    styleElement.id = "user-script-styles";
    styleElement.textContent =
      ".user-style-fixed { width: 100% !important; max-width: none !important; position: static !important; display: block; height: auto !important; }";
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleElement);
    }
  };

  /**
   * 注入自定义样式：创建 #user-script-future-styles 并把 CSS_RULES 的内容写入
   * （只创建一次，已存在则跳过；修改 CSS_RULES 后刷新页面即可生效）
   */
  const ensureUserCssElement = () => {
    if (
      userCssElement &&
      document.getElementById("user-script-future-styles")
    ) {
      return;
    }
    userCssElement = document.createElement("style");
    userCssElement.id = "user-script-future-styles";
    userCssElement.textContent = CSS_RULES;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(userCssElement);
    }
  };

  /**
   * 总入口：每次运行执行一遍
   *   1. 注入基础样式
   *   2. 遍历 selectorsToHide，逐个隐藏元素
   *   3. 注入自定义样式 CSS_RULES
   * 会被 init / MutationObserver / history 拦截反复调用
   */
  const runAllFunctions = () => {
    try {
      ensureStyleElement();
    } catch (e) {}

    for (let i = 0; i < selectorsToHide.length; i++) {
      try {
        hideElement(selectorsToHide[i]);
      } catch (e) {}
    }

    try {
      ensureUserCssElement();
    } catch (e) {}
  };

  /**
   * 页面导航回调：SPA 内部跳转（pushState/replaceState/popstate/hashchange）后
   * 重新注入样式并执行隐藏逻辑（新页面的元素需要重新处理）
   */
  const onNavigation = () => {
    try {
      ensureStyleElement();
      ensureUserCssElement();
      runAllFunctions();
    } catch (e) {}
  };

  // 防抖后的导航回调：300ms 内的连续导航只执行一次
  const debouncedOnNavigation = debounce(onNavigation, 300);

  /**
   * 拦截 history API：监听 pushState / replaceState / popstate / hashchange，
   * 触发页面跳转后自动重新执行隐藏与样式注入（无需刷新页面）
   */
  const interceptHistoryAPI = () => {
    try {
      const _pushState = history.pushState;
      const _replaceState = history.replaceState;

      if (_pushState) {
        history.pushState = function () {
          const result = _pushState.apply(this, arguments);
          debouncedOnNavigation();
          return result;
        };
      }

      if (_replaceState) {
        history.replaceState = function () {
          const result = _replaceState.apply(this, arguments);
          debouncedOnNavigation();
          return result;
        };
      }

      window.addEventListener("popstate", () => {
        debouncedOnNavigation();
      });

      window.addEventListener("hashchange", () => {
        debouncedOnNavigation();
      });
    } catch (e) {}
  };

  interceptHistoryAPI(); // 脚本启动时立即安装 history 拦截

  /**
   * 设置 MutationObserver：监听 DOM 变化（新增节点等），
   * 防抖 200ms 后自动重新执行隐藏逻辑，保证后插入的广告/元素也能被隐藏；
   * 不支持 MutationObserver 的旧浏览器退化为每 1.5 秒轮询一次
   */
  const setupMutationObserver = () => {
    if (typeof MutationObserver === "undefined") {
      setInterval(() => {
        runAllFunctions();
      }, 1500);
      return;
    }

    const debouncedRunAll = debounce(runAllFunctions, 200);

    observer = new MutationObserver(() => {
      debouncedRunAll();
    });

    const observeTarget = document.body || document.documentElement;
    if (observeTarget) {
      observer.observe(observeTarget, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  };

  /**
   * 初始化入口：整个脚本只执行一次
   * 注入基础样式 → 执行隐藏逻辑 → 启动 DOM 监听
   */
  const init = () => {
    if (initCalled) {
      console.log("[漫画脚本] init 已执行过，跳过重复初始化");
      return;
    }
    initCalled = true;
    console.log("[漫画脚本] 初始化开始");
    ensureStyleElement();
    runAllFunctions();
    setupMutationObserver();
    console.log("[漫画脚本] 初始化完成");
  };

  // ===== 根据页面加载状态择机初始化（尽早执行，避免元素先出现再被隐藏）=====
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", () => {
      if (
        document.readyState === "interactive" ||
        document.readyState === "complete"
      ) {
        init();
      }
    });
  }
})();
