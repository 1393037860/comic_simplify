// ==UserScript==
// @name         夜漫漫画优化（去广告 + 整章连看）
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  夜漫(m.yueman1.cc)整合脚本：①移除顶部/底部广告与点击劫持(wap_show广告SDK) ②阅读页整话连看(增量懒加载，防封IP)
// @author       Suave
// @match        http://m.yueman1.cc/*
// @match        https://m.yueman1.cc/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yueman1.cc
// @grant        none
// @run-at       document-start
// ==/UserScript==

// ==============================================================
// 夜漫漫画优化 = 原「夜漫漫画去广告」+「夜漫漫画整章显示」合并版
//
// 【第一部分 · 去广告】整站生效（document-start，先于站点脚本）：
//   1. 移除 wap_show_1/2.js 广告SDK 及一切外域脚本 —— 透明点击层、点击劫持、
//      上下广告条全部从源头掐断（这两个文件解码后是纯广告代码）
//   2. 拦截广告 WebSocket（SDK 对夸克/UC/MIUI 等国产浏览器走的广告通道）
//   3. window.open / location.assign / location.replace 白名单拦截
//   4. location.href 直改跳转监视回滚（SDK 用这招直接整页跳广告，无法重写故监视回跳）
//   5. 点击劫持拦截：外部链接一律掐断
//   6. 残留清理：万一 SDK 先跑了一步，清掉透明点击层与底部 100px 内边距
//
// 【第二部分 · 整章连看】仅阅读页 /p/xxx/xxx.html 生效，其它页面自动跳过：
//   站点阅读器每话 URL 内嵌整话图片列表 qTcms_S_m_murl（$qingtiandy$ 分隔），
//   却只按 ?p=N 渲染单张。本脚本把整话渲染为长图流，且增量懒加载：
//   始终只保证「可视区内 + 下方 BUFFER 张」已请求，随滚动补充，
//   避免一次性并发请求全部图片被 CDN/风控封 IP。
//
// 【配置项】：
//   - BUFFER（整章连看用）：可视区下方预加载的冗余图片张数，默认 5，可自行增减
//   - ALLOWED_HOSTS（去广告用）：放行域名白名单，命中白名单的脚本/跳转/WebSocket 不拦截
//   - isAdSdkSrc 正则：命中的脚本路径会被移除（现匹配 g_js/wap_show_*.js）
//
// 【安装提示】：启用本脚本后，请在油猴里停用/删除旧的
//   「夜漫漫画去广告」与「夜漫漫画整章显示」两个脚本，避免重复执行。
// ==============================================================

(function () {
  "use strict";

  // ============================================================
  // ================ 第一部分 · 去广告（整站生效） ================
  // ============================================================

  // ----- 白名单：脚本/跳转/WebSocket 只放行这些域名（图片域名 gugu6 也放行）-----
  const ALLOWED_HOSTS = ["yueman1.cc", "gugu6.com", "qtcms.com", "bdimg.com", "bdstatic.com"];

  const isAllowedHost = (hostname) =>
    ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));

  const isAllowedUrl = (url) => {
    try {
      return isAllowedHost(new URL(String(url || ""), location.href).hostname);
    } catch (e) {
      return false;
    }
  };

  // ----- 1) 广告 SDK 脚本拦截 -----
  // wap_show_1.js = 顶部广告 + 顶部透明点击层/劫持；wap_show_2.js = 底部同款。
  // 两者解码后是纯广告代码，直接删除标签即可在下载完成前阻止执行。
  const isAdSdkSrc = (src) => /g_js\/wap_show_\d+\.js/.test(src || "");

  const neutralizeScript = (s) => {
    if (s.dataset.ymAdBlocked === "1") return; // 已处理过则跳过（防重复日志）
    s.dataset.ymAdBlocked = "1";
    const src = s.getAttribute("src") || "(inline)";
    s.remove(); // 下载完成前移除，阻止执行
    console.warn("[夜漫去广告] 已移除广告脚本: " + src);
  };

  // 扫描当前所有 <script src>：命中广告 SDK 路径或外域脚本一律移除
  const scanAdScripts = () => {
    try {
      const list = document.querySelectorAll("script[src]");
      for (const s of list) {
        const src = s.getAttribute("src") || "";
        let host = "";
        try {
          host = new URL(src, location.href).hostname;
        } catch (e) {}
        if (isAdSdkSrc(src) || (host && !isAllowedHost(host))) {
          neutralizeScript(s);
        }
      }
    } catch (e) {}
  };

  // MutationObserver：后续动态插入的广告脚本也随手删掉
  const scriptObserver = new MutationObserver(() => {
    try {
      scanAdScripts();
    } catch (e) {}
  });
  const startScriptObserver = () => {
    if (!document.documentElement) {
      setTimeout(startScriptObserver, 10); // document-start 极早期兜底
      return;
    }
    scriptObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };
  startScriptObserver();
  scanAdScripts(); // 立即扫一次（先于站点脚本执行）

  // ----- 2) WebSocket 拦截 -----
  // 广告SDK对夸克/UC/MIUI 等国产浏览器走 wss://... 广告通道，命中白名单外一律给空壳
  try {
    const _WS = window.WebSocket;
    if (_WS) {
      window.WebSocket = function (url, protocols) {
        try {
          if (!isAllowedUrl(String(url))) {
            console.warn("[夜漫去广告] 已拦截广告WebSocket: " + String(url));
            // 返回永不连接的空壳，避免 SDK 因异常报错中断
            return {
              readyState: 3, // CLOSED
              send() {},
              close() {},
              addEventListener() {},
              removeEventListener() {},
            };
          }
        } catch (e) {}
        return protocols ? new _WS(url, protocols) : new _WS(url);
      };
      // 补全静态常量与原型，防止页面其它代码判断出错
      window.WebSocket.prototype = _WS.prototype;
      window.WebSocket.CONNECTING = _WS.CONNECTING;
      window.WebSocket.OPEN = _WS.OPEN;
      window.WebSocket.CLOSING = _WS.CLOSING;
      window.WebSocket.CLOSED = _WS.CLOSED;
    }
  } catch (e) {}

  // ----- 3) 广告跳转拦截：window.open / location.assign / location.replace -----
  const _open = window.open;
  window.open = function (url) {
    try {
      if (url && !isAllowedUrl(String(url))) {
        console.warn("[夜漫去广告] 已拦截广告新窗口: " + String(url));
        return null;
      }
    } catch (e) {}
    return _open.apply(this, arguments);
  };

  try {
    const _assign = window.location.assign;
    window.location.assign = function (url) {
      if (isAllowedUrl(String(url))) {
        return _assign.call(window.location, url);
      }
      console.warn("[夜漫去广告] 已拦截广告跳转: " + String(url));
    };
  } catch (e) {}
  try {
    const _replace = window.location.replace;
    window.location.replace = function (url) {
      if (isAllowedUrl(String(url))) {
        return _replace.call(window.location, url);
      }
      console.warn("[夜漫去广告] 已拦截广告跳转: " + String(url));
    };
  } catch (e) {}

  // ----- 4) location.href 跳转回滚（兜底）-----
  // SDK 用 window.location.href = 广告地址 整页跳转，这种赋值无法被 JS 重写，
  // 只能每 80ms 监视地址栏，一旦离开白名单立即跳回原页面。
  let lastUrl = location.href;
  setInterval(() => {
    try {
      if (location.href !== lastUrl) {
        if (isAllowedUrl(location.href)) {
          lastUrl = location.href; // 正常跳转（翻页/章节），更新基准
        } else {
          console.warn("[夜漫去广告] 检测到广告跳转，已跳回: " + location.href);
          location.href = lastUrl;
        }
      }
    } catch (e) {}
  }, 80);

  // ----- 5) 点击劫持拦截：外部链接一律掐断（广告链接点击无效）-----
  // 捕获阶段(document, capture=true)先于页面所有监听执行
  const blockAdClick = (event) => {
    try {
      const t = event.target;
      if (!t || typeof t.closest !== "function") return;
      const a = t.closest("a[href]");
      if (a) {
        const href = a.getAttribute("href") || "";
        if (!isAllowedUrl(href)) {
          event.preventDefault();
          event.stopImmediatePropagation(); // 阻止默认行为 + 阻止站点后续监听
          console.warn("[夜漫去广告] 已拦截外部链接点击: " + href);
          return;
        }
      }
    } catch (e) {}
  };
  document.addEventListener("click", blockAdClick, true);
  document.addEventListener("auxclick", blockAdClick, true); // 中键

  // ----- 6) 残留清理 -----
  // 若广告SDK在拦截前已经跑过（缓存/时序竞态），周期性清掉：
  // 透明 fixed 点击层(opacity≈0.01) 与 SDK 注入的 body 底部内边距样式
  setInterval(() => {
    try {
      if (!document.body) return;
      const divs = document.body.querySelectorAll("div[style]");
      for (const el of divs) {
        const st = el.getAttribute("style") || "";
        if (/position:\s*fixed/i.test(st) && /opacity:\s*0\.0\d/i.test(st)) {
          el.remove();
        }
      }
      const s1 = document.getElementById("sbewjpnb_style_id");
      const s2 = document.getElementById("ngyvlnpz_style_id");
      if (s1) s1.remove();
      if (s2) s2.remove();
    } catch (e) {}
  }, 1000);

  // ============================================================
  // =============== 第二部分 · 整章连看（仅阅读页生效） ================
  // ============================================================
  // 非阅读页没有 qTcms_S_m_murl / #qTcms_pic，tryExpand 会自动跳过，不影响其它页面。

  // 可视区下方预加载的冗余图片张数（防一次性大量请求，可按需改 3~8）
  const BUFFER = 5;

  // ----- 图片地址规整 -----
  // 复刻站点 f_qTcms_Pic_curUrl_realpic 的主要防盗链替换，把各类图源直链化
  const normalize = (url) => {
    let v = String(url || "");
    const reps = [
      ["http://cartoon.jide123.cc/", "http://cartoon.akshk.com/"],
      ["http://cartoon.youzu88.com/", "http://cartoon.akshk.com/"],
      ["http://tupianku.fufuqiqi.com/", "http://images.720rs.com/"],
      ["http://mhpic", "http://t2.taoman.cc/t.php?url=http://mhpic"],
      ["http://t1.taoman.cc/pic/", "https://p8.taoman.cc/qTcms_Cache/picls/"],
      ["http://t1.taoman.cc/picls/", "https://p8.taoman.cc/qTcms_Cache/picls/"],
      ["http://t1.reman.cc/pic/", "https://p8.taoman.cc/qTcms_Cache/picls/"],
      ["https://t40-1-4.g-mh.online", "https://t2.taoman.cc"],
      ["https://c-nd3-1.6wm.top", "https://t2.taoman.cc"],
      ["http://f2-img.534zm.com", "https://t2.taoman.cc"],
    ];
    for (const [a, b] of reps) v = v.split(a).join(b);
    return v;
  };

  // ----- 整话长图流：增量懒加载状态 -----
  let wrapper = null; // 长图容器（替换站点的单图表格）
  let pending = []; // 待加载图片 URL 队列
  let stopped = false; // 队列已全部加载完成
  let rafPending = false; // requestAnimationFrame 节流标志
  let intervalId = null; // 800ms 兜底轮询句柄

  // 创建单张图片元素；load 后触发补位检查，error 时标记占位不中断
  const makeImg = (url, idx) => {
    const img = document.createElement("img");
    img.src = normalize(url);
    img.alt = "第" + (idx + 1) + "页";
    img.style.cssText =
      "display:block;width:100%;height:auto;margin:0 auto;border:0;";
    img.setAttribute("decoding", "async");
    img.addEventListener("load", scheduleLoad);
    img.addEventListener("error", () => {
      img.style.outline = "1px dashed #999";
      img.style.minHeight = "40px";
    });
    return img;
  };

  // 滚动/图片加载完成后触发补充加载（rAF 节流，避免高频触发）
  const scheduleLoad = () => {
    if (stopped || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      loadMore();
    });
  };

  // 核心：保证「可视区内 + 下方 BUFFER 张」已请求，不足则从队列补齐
  const loadMore = () => {
    try {
      if (stopped || !wrapper || !wrapper.isConnected) return;
      if (!pending.length) {
        // 队列耗尽：停止监听与轮询
        stopped = true;
        window.removeEventListener("scroll", scheduleLoad, { passive: true });
        window.removeEventListener("resize", scheduleLoad, { passive: true });
        return;
      }
      const fold = window.scrollY + window.innerHeight; // 视口下边缘
      const imgs = wrapper.children;
      let extra = 0; // 已加载且在视口下方的张数
      for (let i = imgs.length - 1; i >= 0; i--) {
        const r = imgs[i].getBoundingClientRect();
        if (r.height === 0) continue; // 尚未完成布局/加载的跳过
        if (r.top + window.scrollY > fold + 1) extra++;
        else break; // 碰到可视区内的图片即停止计数
      }
      while (pending.length && extra < BUFFER) {
        const img = makeImg(pending.shift(), imgs.length);
        wrapper.appendChild(img); // 每补一张都会开始加载
        extra++;
      }
      if (!pending.length) {
        stopped = true;
        window.removeEventListener("scroll", scheduleLoad, { passive: true });
        window.removeEventListener("resize", scheduleLoad, { passive: true });
      }
    } catch (e) {
      console.warn("[夜漫整章] 增量加载异常: " + e.message);
    }
  };

  // 出错时清理监听与轮询
  const cleanup = () => {
    window.removeEventListener("scroll", scheduleLoad, { passive: true });
    window.removeEventListener("resize", scheduleLoad, { passive: true });
    if (intervalId) clearInterval(intervalId);
  };

  // 主流程：把站点的单张翻页阅读器替换为整话长图流
  const expandChapter = () => {
    try {
      const q = window.qTcms_S_m_murl; // 站点已解码的整话图片列表
      if (typeof q !== "string" || !q) return; // 非阅读页或数据未就绪
      const urls = q.split("$qingtiandy$").filter((x) => x && x.indexOf("http") === 0);
      if (urls.length <= 1) return; // 整话只有 1 张，无需处理

      const picImg = document.getElementById("qTcms_pic");
      if (!picImg) return;

      // 页面已显示多张图（该漫画本来就整章显示）→ 跳过，避免重复渲染
      const shownCount = document.querySelectorAll(
        "#commicBox img, .mh_box img, .view-imgBox img",
      ).length;
      if (shownCount > 1) return;

      // 建空容器替换站点的单图表格
      const holder = picImg.closest("table") || picImg.parentElement;
      if (!holder) return;
      wrapper = document.createElement("div");
      wrapper.id = "ym-all-pics";
      wrapper.style.cssText = "width:100%;margin:0 auto;";
      holder.parentNode.replaceChild(wrapper, holder);

      // 队列 = 整话全部图片
      pending = urls.slice();

      // 标题栏改为整章提示
      const kTotal = document.getElementById("k_total");
      if (kTotal) kTotal.textContent = urls.length + " (整章)";
      const kPage = document.getElementById("k_page");
      if (kPage) kPage.textContent = "1";

      // 禁用页内翻页：点图 / 键盘←→ / 上一页下一页按钮（保留上一章/下一章链接）
      try {
        window.a_f_qTcms_Pic_nextUrl_Href = function () {
          return false;
        };
        window.a_f_qTcms_Pic_backUrl_Href = function () {
          return false;
        };
      } catch (e) {}
      const nav = document.querySelectorAll("#action a, #m_r_bottom a");
      for (const a of nav) {
        const href = a.getAttribute("href") || "";
        if (href.indexOf("javascript:a_f_qTcms_Pic") !== -1) {
          a.setAttribute("href", "javascript:void(0)");
          a.style.opacity = "0.35";
          a.style.pointerEvents = "none";
        }
      }

      // 滚动/resize 补图 + 800ms 兜底轮询（图片加载改变高度可能不触发 scroll）
      window.addEventListener("scroll", scheduleLoad, { passive: true });
      window.addEventListener("resize", scheduleLoad, { passive: true });
      intervalId = setInterval(() => {
        if (stopped) {
          clearInterval(intervalId);
        } else {
          scheduleLoad();
        }
      }, 800);

      // 回到顶部从第 1 页开始，先加载首批（可视区 + 冗余 BUFFER 张）
      window.scrollTo(0, 0);
      loadMore();

      window.__ymExpanded = true; // 防重复展开（若旧版整章脚本仍开着也只会执行一次）
      console.log(
        "[夜漫整章] 整话共 " +
          urls.length +
          " 张，按需增量加载中(缓冲 " +
          BUFFER +
          " 张)",
      );
    } catch (e) {
      console.warn("[夜漫整章] 展开失败: " + e.message);
      cleanup();
    }
  };

  // 等待站点脚本把 qTcms_S_m_murl 解码完成后再展开（最长约 12 秒重试窗口）
  const tryExpand = () => {
    if (window.__ymExpanded) return;
    if (!document.body) return;
    if (
      typeof window.qTcms_S_m_murl === "string" &&
      window.qTcms_S_m_murl &&
      document.getElementById("qTcms_pic")
    ) {
      setTimeout(expandChapter, 400); // 留时间给站点渲染第一张
      return;
    }
    let retries = 0;
    const iv = setInterval(() => {
      retries++;
      if (
        window.__ymExpanded ||
        (typeof window.qTcms_S_m_murl === "string" &&
          window.qTcms_S_m_murl &&
          document.getElementById("qTcms_pic"))
      ) {
        clearInterval(iv);
        if (!window.__ymExpanded) setTimeout(expandChapter, 400);
      } else if (retries > 60) {
        clearInterval(iv); // 超时放弃（非阅读页）
      }
    }, 200);
  };

  // 按页面加载状态尽早触发（第二部分对非阅读页是无害的空转）
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    tryExpand();
  } else {
    document.addEventListener("DOMContentLoaded", tryExpand);
    document.addEventListener("readystatechange", () => {
      if (
        document.readyState === "interactive" ||
        document.readyState === "complete"
      ) {
        tryExpand();
      }
    });
  }
})();
