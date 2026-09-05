// ==UserScript==
// @name         夜漫漫画优化（去广告 + 整章连看）
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  夜漫(yueman1)系 + 图蛋(tudanmanhua/tudanmh)系：移除顶部/底部广告与点击劫持，阅读页整话连看(增量懒加载)
// @author       Suave
// @match        http://m.yueman1.cc/*
// @match        https://m.yueman1.cc/*
// @match        http://m.tudanmanhua.cc/*
// @match        https://m.tudanmanhua.cc/*
// @match        http://www.tudanmanhua.cc/*
// @match        http://m.tudanmh.cc/*
// @match        https://m.tudanmh.cc/*
// @match        http://www.tudanmh.cc/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yueman1.cc
// @grant        none
// @run-at       document-start
// ==/UserScript==

// 1.0 初版：合并「夜漫漫画去广告」+「夜漫漫画整章显示」为单脚本（整章连看为增量懒加载）
// 1.1 修复: 点击拦截误伤 javascript: 伪链接（搜索/分享等 onClick 按钮），导致面板打不开并报
//     Uncaught TypeError: Cannot read properties of null (reading 'removeChild');
//     改为仅拦截真正跳转的外站 http(s) 链接，伪链接/锚点/非网页协议一律放行
// 1.2 增强: 后置兜底清理(适配 Userscripts 等晚注入环境: 广告SDK已抢先运行时也清 wap_show 广告位/外域iframe);
//     新增 ?ymdebug=1 屏幕诊断面板(手机端无需控制台即可定位残留广告); loadMore 单张异常隔离
// 1.3 修复: 广告脚本已抢先运行(晚注入)时注入的"整宽横幅"仍在页面顶部/底部显示;
//     新增通用横幅杀手(外站链接+图片的整宽块隐藏) + 白名单补充 baidu/taoman 等(不再误删分享/统计脚本);
//     诊断面板改为自动弹出(发现残留广告即显示), 无需 URL 参数;
//     面板新增"复制页面HTML"按钮(加载5秒后自动尝试), 供把广告真实结构发回分析;
//     诊断面板事件护盾: 捕获阶段拦截指向面板的触摸/点击(防 SDK 残留劫持监听在底部热区误触发)
// 1.4 修复: iPhone 残留"透明点击层"——fixed + z-index 2147483646 的隐形横条(无 opacity 属性,
//     之前按透明度/尺寸过滤漏判), 上下热区拦截触摸导致点击跳广告; 新增按超高 z-index 直删的清理
// 1.5 增强: 透明点击层/广告位清理接入 MutationObserver(DOM 变化即清, 注入后毫秒级移除);
//     "广告跳转回滚"事件写入诊断日志(便于 dump 验证)
// 1.6 扩展: 支持同族镜像域名 图蛋(m.tudanmanhua.cc / m.tudanmh.cc 等): 通用去广告保护全覆盖;
//     整章连看仅在该站阅读页结构同 QTcms(含 qTcms_S_m_murl/#qTcms_pic)时生效
// 1.7 增强: 整章连看图片优先调用站点 f_qTcms_Pic_curUrl_realpic(完整防盗链链), 失败自动换源重试;
//     normalize 兜底补 s1/s2→p8.taoman(/scomic/) 规则(无 lookbehind, 兼容 iOS);
//     透明点击层杀手泛化: div → 所有带内联样式元素(覆盖 llkmdam 等自定义标签);
//     不做第三方镜像池轮换(搬运站资源, 减少维护); 诊断面板默认关闭(#ymdebug 可临时开启)
// 1.8 调整: BUFFER 默认改 1(可视区下方仅预载1张, 最保守防封IP);
//     图片重试每轮刷新站点转换(老源随机镜像, 应对单镜像429);
//     重试去重: 死源(域名注销/DNS失效)立即灰框放弃, 不再重复请求同一地址刷爆 Network
// 1.9 修复: 广告SDK换用"随机自定义标签"(dhnefm/llkmdam 等, 非标准HTML标签)在 body 首部插入
//     定尺寸占位 + 注入伪装成去广告的 <link id=via_inject_css_blocker> 样式表(站点域名提供, 负责把广告画进占位),
//     常规脚本/iframe/图片规则全部漏判; 新增"标准HTML标签白名单"识别并整块移除自定义标签广告,
//     via_inject 伪装样式表一并清除; 接入 MutationObserver(注入即清)+1.5s周期轮询双层清理
//     (注: 杀手先宽后收窄——v1.9.1 起仅删带强广告特征者: fixed/absolute/高z/透明 或 内含外站资源,
//      防误删整页内容; 空占位标签若被css画上外站内容仍会被第②条兜住)
//     (附调试开关: #ymnoexpand 跳过整章连看, #ymnocustom 跳过自定义标签清理, 排查问题用)
// 1.9(整章)修复: 整章连看由"replaceChild 站点单图祖先节点"改为"只追加、不删除"——
//     老模板中该祖先可能是承载整页布局的大节点, 替换会连 share~页脚 之间内容一并带走致整页空白;
//     现仅向单图容器追加长图流, 站点原图保留到首图加载完成(3.5s兜底)再隐藏, 避免首屏"先白后图"

// ==============================================================
// 夜漫漫画优化 = 原「夜漫漫画去广告」+「夜漫漫画整章显示」合并版
//
// 【第一部分 · 去广告】整站生效（document-start，先于站点脚本）：
//   1. 移除 wap_show_1/2.js 广告SDK 及一切外域脚本 —— 透明点击层、点击劫持、
//      上下广告条全部从源头掐断（这两个文件解码后是纯广告代码）
//   2. 拦截广告 WebSocket（SDK 对夸克/UC/MIUI 等国产浏览器走的广告通道）
//   3. window.open / location.assign / location.replace 白名单拦截
//   4. location.href 直改跳转监视回滚（SDK 用这招直接整页跳广告，无法重写故监视回跳）
//   5. 点击劫持拦截：外站 http(s) 链接一律掐断（javascript: 等站点伪链接放行，防误伤 UI）
//   6. 残留清理：万一 SDK 先跑了一步，清掉透明点击层与底部 100px 内边距
//
// 【第二部分 · 整章连看】仅阅读页 /p/xxx/xxx.html 生效，其它页面自动跳过：
//   站点阅读器每话 URL 内嵌整话图片列表 qTcms_S_m_murl（$qingtiandy$ 分隔），
//   却只按 ?p=N 渲染单张。本脚本把整话渲染为长图流，且增量懒加载：
//   始终只保证「可视区内 + 下方 BUFFER 张」已请求，随滚动补充，
//   避免一次性并发请求全部图片被 CDN/风控封 IP。
//
// 【配置项】：
//   - BUFFER（整章连看用）：可视区下方预加载的冗余图片张数，当前 1（最保守），可自行增减
//   - ALLOWED_HOSTS（去广告用）：放行域名白名单，命中白名单的脚本/跳转/WebSocket 不拦截
//   - isAdSdkSrc 正则：命中的脚本路径会被移除（现匹配 g_js/wap_show_*.js）

// ==============================================================

(function () {
  "use strict";

  // 诊断日志：记录本脚本移除过的广告脚本/元素（供 ?ymdebug=1 屏幕面板展示）
  let removedLog = [];
  const tsNow = () => {
    try {
      return new Date().toTimeString().split(" ")[0];
    } catch (e) {
      return "";
    }
  };
  const logPush = (m) => {
    removedLog.push("[" + tsNow() + "] " + m);
  };

  // ============================================================
  // ================ 第一部分 · 去广告（整站生效） ================
  // ============================================================

  // ----- 白名单：脚本/跳转/WebSocket 只放行这些域名（图片域名 gugu6 也放行）-----
  const ALLOWED_HOSTS = [
    "yueman1.cc",
    "gugu6.com",
    "gugu5.com",
    "qtcms.com",
    "taoman.cc",
    "baidu.com",
    "bdimg.com",
    "bdstatic.com",
    "reman.cc",
    "pgu.cc",
    "sfacg.com",
    "tudanmanhua.cc",
    "tudanmh.cc",
    "tudan.cc",
    "ac.qq.com",
  ];

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
    logPush("移除脚本: " + src);
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
      // DOM 一变就顺手清透明点击层：广告注入后毫秒级移除，几乎不给显示/点击机会
      if (typeof killInvisibleLayers === "function") killInvisibleLayers();
      if (typeof killWapShowSlots === "function") killWapShowSlots();
      if (typeof killCustomAds === "function") killCustomAds();
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
          logPush("检测到广告跳转并回滚: " + location.href);
          console.warn("[夜漫去广告] 检测到广告跳转，已跳回: " + location.href);
          location.href = lastUrl;
        }
      }
    } catch (e) {}
  }, 80);

  // ----- 5) 点击劫持拦截：外部链接一律掐断（广告链接点击无效）-----
  // 捕获阶段(document, capture=true)先于页面所有监听执行。
  // 注意：仅拦截真正会跳转的 http(s) 外站链接；
  // javascript: / # / mailto: 等伪链接是站点自己的 UI 占位(搜索/分享/展开面板)，
  // 不能拦，否则会误伤页面功能（如搜索图标 onClick 无法执行）。
  const blockAdClick = (event) => {
    try {
      const t = event.target;
      if (!t || typeof t.closest !== "function") return;
      const a = t.closest("a[href]");
      if (a) {
        const href = (a.getAttribute("href") || "").trim();
        // 伪链接 / 占位 / 站内锚点 / 非网页协议：放行给站点自己处理
        if (
          !href ||
          href.charAt(0) === "#" ||
          /^javascript:/i.test(href) ||
          /^(mailto|tel|data|blob|about):/i.test(href)
        ) {
          return;
        }
        // 真正会导航的外站 http(s) 链接才拦截
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

  // 5b) 诊断面板事件护盾
  // iPhone 晚注入场景：wap_show 已抢先执行，其 document 级 touchend/click 劫持监听
  // 不会因删除脚本标签而消失；面板贴在屏幕底部(劫持热区)，直接点面板可能触发广告。
  // 处理：捕获阶段拦截一切指向 #ym-dbg-panel 的事件，不让它到达 SDK 监听；
  // 复制/关闭按钮由护盾自行处理（面板保留长期使用，不影响正文操作）。
  const shieldPanel = (event) => {
    try {
      const t = event.target;
      if (!t || typeof t.closest !== "function") return;
      if (!t.closest("#ym-dbg-panel")) return; // 只保护面板区域，正文点击不受影响
      if (event.type === "click") {
        if (t.closest("#ym-dbg-copy")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (typeof window.__ymCopyHtml === "function") window.__ymCopyHtml();
          return;
        }
        if (t.closest("#ym-dbg-close")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const p = document.getElementById("ym-dbg-panel");
          if (p) p.style.display = "none";
          return;
        }
      }
      // 面板上的其它触摸/点击：只阻断传播(保留面板自身滚动等默认行为)
      event.stopImmediatePropagation();
    } catch (e) {}
  };
  ["touchstart", "touchend", "mousedown", "pointerdown", "pointerup", "click", "auxclick"].forEach(
    (et) => document.addEventListener(et, shieldPanel, true),
  );

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

  // 透明点击层杀手：广告SDK(如 hongosi/mvp1p 等)注入的"隐形横条"通常没有 opacity 属性
  // (默认透明背景即可隐形)，特征 = fixed + z-index 高达 2147483xxx(2147483646 常见) + 无可视内容。
  // 它们拦截屏幕上下区域的触摸用于点击劫持；之前按 opacity/尺寸过滤会漏掉，这里按 z-index 直接清。
  const killInvisibleLayers = () => {
    try {
      if (!document.body) return;
      // 不限 div：广告容器会用随机命名的"自定义标签"(如 llkmdam / QcFkBh 等)包装
      const styled = document.body.querySelectorAll("[style]");
      for (const el of styled) {
        const tag = el.tagName ? el.tagName.toLowerCase() : "";
        if (tag === "style" || tag === "link" || tag === "script") continue;
        if (el.id === "ym-dbg-panel") continue; // 保留我们自己的诊断面板
        const st = el.getAttribute("style") || "";
        if (!/position\s*:\s*fixed/i.test(st)) continue;
        if (!/z-?\s*index\s*:\s*2147483\d{3}/i.test(st)) continue;
        // 无可视内容(文本/图/媒体)的固定层 = 透明点击层
        const hasVisible = el.textContent && el.textContent.trim();
        const hasMedia = el.querySelector("img, iframe, video, canvas");
        if (hasVisible && !hasMedia) continue;
        logPush("移除透明点击层: <" + tag + (el.id ? "#" + el.id : "") + ">");
        el.remove();
      }
    } catch (e) {}
  };
  setInterval(() => {
    try {
      killInvisibleLayers();
    } catch (e) {}
  }, 1000);

  // 随机自定义标签广告杀手（dhnefm / llkmdam 等）：
  // 广告SDK会在 body 最前插入"空占位自定义标签"(内联 style 定尺寸, 如 height:131px)，
  // 或注入伪装成去广告的 <link id=via_inject_css_blocker> 样式表(由站点域名提供, 把广告画进占位)。
  // 标准 HTML 标签清单用于识别"非标准=注入的自定义标签"
  const STANDARD_TAGS =
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption " +
    "cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption " +
    "figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend " +
    "li link main map mark menu meta meter nav noscript object ol optgroup option output p param picture pre " +
    "progress q rp rt ruby s samp script section select slot small source span strong style sub summary sup " +
    "table tbody td template textarea tfoot th thead time title tr track u ul var video wbr".split(" ");

  const killCustomAds = () => {
    // 二分调试开关：#ymnocustom 时跳过本清理(排查整页被清空问题用)
    if (/(?:^|[&#])ymnocustom(?:$|[&#])/.test(location.hash)) return;
    try {
      if (!document.body) return;
      const stTags = new Set(STANDARD_TAGS);
      const all = document.body.querySelectorAll("*");
      for (const el of all) {
        if (el.id === "ym-dbg-panel") continue;
        if (el.closest && el.closest("#ym-all-pics")) continue; // 跳过整章长图
        if (el.tagName === "LINK") {
          // 注入的"去广告伪装"样式表(实为广告渲染源)
          const href = el.getAttribute("href") || "";
          const id = el.id || "";
          if (/via_inject/i.test(href + " " + id)) {
            logPush("移除注入样式link: " + href);
            el.remove();
          }
          continue;
        }
        const tag = el.tagName ? el.tagName.toLowerCase() : "";
        if (!tag || stTags.has(tag)) continue; // 标准标签交给其它规则处理
        // 非标准自定义标签：仅当带"强广告特征"才删，宁可漏不可误杀(避免误删页面内容)
        const inline = el.getAttribute("style") || "";
        const strongStyle =
          /position\s*:\s*(fixed|absolute)/i.test(inline) ||
          /z-?\s*index\s*:\s*\d{3,}/i.test(inline) ||
          /opacity\s*:\s*0/i.test(inline);
        // 内含外站链接/图片/iframe(已填充的广告内容)
        let hasForeign = false;
        const child = el.querySelector && el.querySelector("a[href], img[src], iframe[src], ins");
        if (child) {
          const url = child.getAttribute("href") || child.getAttribute("src") || "";
          try {
            hasForeign = !isAllowedHost(new URL(url, location.href).hostname);
          } catch (e) {}
        }
        if (!strongStyle && !hasForeign) continue; // 无强特征: 保留(可能是页面合法内容)
        logPush(
          "移除自定义标签广告 <" +
            tag +
            (el.id ? "#" + el.id : "") +
            (inline ? " 样式:" + inline.slice(0, 80) : ""),
        );
        el.remove();
      }
    } catch (e) {}
  };

  // ----- 7) 增强兜底清理（兼容 Userscripts 等"晚注入"：广告SDK可能已抢先执行）-----
  // 场景：iOS Safari + Userscripts 的 document-start 时机不可靠，wap_show_1/2.js
  // 可能已运行并往广告位(.img_001)注入内容。这里不管它跑没跑，都做二次清理：
  //   a) 移除 wap_show 脚本标签（即使已执行，标签仍留在 DOM 里可定位）；
  //   b) 隐藏其广告位容器（阅读页两个 .img_001 广告槽：内容一旦注入就连容器一起藏掉）；
  //   c) 移除广告联盟注入的外域 iframe（本站正常页面没有任何 iframe）。
  const killWapShowSlots = () => {
    try {
      if (!document.body) return;
      // 0) 预防性隐藏阅读页的广告位容器(#currentCache/.view-imgBox 里的 .img_001)：
      //    这两个槽位只用于放 wap_show 广告，无论 SDK 有没有抢先注入，都直接藏掉，
      //    即使晚注入环境(SDK已运行)也看不到广告内容。
      const slotTargets = document.querySelectorAll(
        "#currentCache .img_001, .view-imgBox .img_001",
      );
      for (const slot of slotTargets) {
        slot.style.setProperty("display", "none", "important");
      }
      const scs = document.querySelectorAll("script[src]");
      for (const s of scs) {
        if (!isAdSdkSrc(s.getAttribute("src") || "")) continue;
        if (s.dataset.ymAdBlocked !== "1") {
          logPush("兜底移除: " + s.getAttribute("src"));
        }
        let p = s.parentElement;
        if (p) {
          const cls = typeof p.className === "string" ? p.className : "";
          if (cls.indexOf("img_001") !== -1 || p.children.length <= 1) {
            p.style.setProperty("display", "none", "important"); // 连容器带内容一起藏
          }
        }
        s.remove();
      }
      const frs = document.querySelectorAll("iframe[src]");
      for (const f of frs) {
        let h = "";
        try {
          h = new URL(f.getAttribute("src"), location.href).hostname;
        } catch (e) {}
        if (h && !isAllowedHost(h)) {
          logPush("移除外域iframe: " + f.getAttribute("src"));
          f.remove();
        }
      }
    } catch (e) {}
  };
  // 通用横幅杀手：广告脚本(如 hhvcxhs d/4389)会往页面顶部/底部注入"外站链接+图片"的
  // 整宽横幅，这类横幅是随文档流的(非 fixed、不在 .img_001 槽内)，前面清理抓不到。
  // 这里针对"包含非白名单外链 + 图片、宽度占屏、高度适中的容器块"隐藏它。
  const killBannerBlocks = () => {
    try {
      if (!document.body) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const anchors = document.body.querySelectorAll("a[href]");
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!/^https?:/i.test(href)) continue;
        let host = "";
        try {
          host = new URL(href, location.href).hostname;
        } catch (e) {}
        if (!host || isAllowedHost(host)) continue; // 站内/白名单外链不处理
        // 向上找承载它的"横幅块"
        let node = a;
        for (let up = 0; up < 6 && node && node !== document.body; up++) {
          node = node.parentElement;
          if (!node) break;
          const id = node.id || "";
          const cls = typeof node.className === "string" ? node.className : "";
          if (/ym-all-pics|qTcms_pic|reader-images|mh_box|commicBox|currentCache|read_Shar|m_r_title|m_r_bottom|layer|show\b/.test(id + " " + cls)) break; // 保护阅读区/站点UI
          const r = node.getBoundingClientRect();
          if (r.width < vw * 0.6 || r.height < 20 || r.height > 320) continue;
          const inline = node.getAttribute("style") || "";
          const hasImg = !!node.querySelector("img");
          if (!hasImg && !/position|z-index|background|padding/i.test(inline)) continue;
          // 命中横幅：隐藏并记录
          node.style.setProperty("display", "none", "important");
          logPush(
            "隐藏广告横幅: " +
              node.tagName.toLowerCase() +
              "." +
              (cls.split(/\s+/)[0] || "-") +
              " 外链=" +
              host,
          );
          break;
        }
      }
    } catch (e) {}
  };
  setInterval(() => {
    try {
      scanAdScripts(); // 外域动态脚本再扫一轮
      killWapShowSlots(); // wap_show 广告位兜底清理
      killBannerBlocks(); // 注入的整宽横幅杀手
      killCustomAds(); // 随机自定义标签/伪装样式表
    } catch (e) {}
  }, 1500);

  // ----- 8) 屏幕诊断（iPhone 无法开控制台时的定位手段，默认关闭）-----
  // 平时完全不启用，不影响页面与性能。需要排查广告时二选一开启：
  //   a) 网址后加 #ymdebug（hash 不发给服务器，不会被 404 拦截）；
  //   b) 手动改下面 DEBUG_UI 为 true 后刷新（长期开启排查）。
  // 开启后：检测到残留广告会自动弹出面板/描红框，并提供"复制页面HTML(发回分析)"按钮。
  // 默认关闭；排查时在网址后加 #ymdebug（hash 不发给服务器）即可临时开启。
  const DEBUG_UI = /(?:^|[&#])ymdebug(?:=1)?(?:$|[&#])/.test(location.hash);
  if (DEBUG_UI) {
    // 仅 #ymdebug 时面板常显；否则只在发现残留广告/移除记录时自动弹出
    const WANT = /(?:^|[&#])ymdebug(?:=1)?(?:$|[&#])/.test(location.hash);
    let panel = null;
    let preEl = null;
    let emptyRounds = 0;
    let statusEl = null; // 复制按钮的状态提示行

    const ensurePanel = () => {
      if (panel) return panel;
      panel = document.createElement("div");
      panel.id = "ym-dbg-panel";
      panel.style.cssText =
        "position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;" +
        "max-height:45%;overflow:auto;background:rgba(20,20,30,.95);color:#ffe;" +
        "font:11px/1.5 monospace;padding:6px;border-radius:8px;";
      const close = document.createElement("span");
      close.id = "ym-dbg-close";
      close.textContent = "✕ 关闭诊断";
      close.style.cssText =
        "position:sticky;top:0;display:block;text-align:right;color:#f88;" +
        "font:12px/1 sans-serif;cursor:pointer;";
      close.onclick = () => {
        panel.style.display = "none";
      };
      preEl = document.createElement("pre");
      preEl.style.cssText =
        "margin:0;white-space:pre-wrap;word-break:break-all;";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "ym-dbg-copy";
      btn.textContent = "📋 复制页面HTML(发回分析)";
      btn.style.cssText =
        "width:100%;margin:6px 0 2px;padding:10px;border:0;border-radius:6px;" +
        "background:#2d6cdf;color:#fff;font:15px/1 sans-serif;";
      btn.onclick = () => {
        copyHtml();
      };
      statusEl = document.createElement("div");
      statusEl.id = "ym-dbg-status";
      statusEl.style.cssText =
        "color:#9f9;font:12px/1.6 sans-serif;min-height:16px;";
      panel.appendChild(close);
      panel.appendChild(preEl);
      panel.appendChild(btn);
      panel.appendChild(statusEl);
      return panel;
    };

    // 排除站点自身 UI / 我们自己的元素
    const knownUi =
      /m_r_title|m_r_bottom|action-list|HotTag|hotTit|messagSjr|read_Shar|img_001|ym-all-pics/;
    const findSuspects = () => {
      const out = [];
      try {
        if (!document.body) return out;
        // 候选：内联 z-index/position、广告类标签与命名、外链 sponsor 链接等
        const cands = document.body.querySelectorAll(
          'ins, iframe[src], [style*="z-index"], [style*="position:fixed"],' +
            '[class*="ad"], [class*="banner"], [id*="ad"], [id*="banner"],' +
            '[class*="gg_"], div[style*="bottom:0"], div[style*="top:0"]',
        );
        for (const el of cands) {
          if (panel && (el === panel || panel.contains(el))) continue; // 跳过诊断面板自身
          if (el.closest && el.closest("#ym-all-pics")) continue; // 跳过整章长图
          const cs = window.getComputedStyle(el);
          if (cs.position !== "fixed" && cs.position !== "absolute") continue;
          const z = parseInt(cs.zIndex, 10) || 0;
          if (z < 100) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 20 || r.height > window.innerHeight * 0.6) continue;
          const id = el.id || "";
          const cls = typeof el.className === "string" ? el.className : "";
          if (knownUi.test(id + " " + cls)) continue;
          out.push(el);
          if (out.length >= 10) break;
        }
      } catch (e) {}
      return out;
    };

    // ---- 复制页面 HTML（把广告真实结构发回来分析）----
    // iOS 限制：http 页面没有用户手势不能写剪贴板。先自动试一次(https 环境可成功)，
    // 失败则提示点击面板上的复制按钮(点击=手势，execCommand 可复制)。
    const getPageHtml = () => {
      try {
        const clone = document.documentElement.cloneNode(true);
        // 移除本脚本产物，避免体积过大且干扰分析
        const own = clone.querySelectorAll("#ym-all-pics, #ym-dbg-panel");
        for (const el of Array.from(own)) el.remove();
        // 去掉脚本/样式内容(体积大户，结构分析用不到)
        const scripts = clone.querySelectorAll("script, style, link");
        for (const el of Array.from(scripts)) el.remove();
        // 头部注释内嵌诊断信息：时间/网址/脚本清理记录，便于判断广告何时出现/被清
        const meta =
          "<!-- YM-DEBUG\n" +
          "时间: " +
          new Date().toLocaleString() +
          "\nURL: " +
          location.href +
          "\n屏幕: " +
          window.innerWidth +
          "x" +
          window.innerHeight +
          "\n清理记录(" +
          removedLog.length +
          "条):\n" +
          (removedLog.length ? removedLog.join("\n") : "(无)") +
          "\n-->\n";
        return meta + clone.outerHTML.replace(/[ \t]{2,}/g, " ");
      } catch (e) {
        return "提取失败: " + e.message;
      }
    };
    const copyToClipboard = (text) => {
      return new Promise((resolve) => {
        try {
          if (
            navigator.clipboard &&
            navigator.clipboard.writeText &&
            window.isSecureContext
          ) {
            navigator.clipboard
              .writeText(text)
              .then(() => resolve(true))
              .catch(() => resolve(false));
            return;
          }
        } catch (e) {}
        try {
          // http 兜底：隐藏 textarea + execCommand（需要点击手势）
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;top:-100px;left:0;opacity:0;";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, text.length);
          let ok = false;
          try {
            ok = document.execCommand("copy");
          } catch (e) {
            ok = false;
          }
          document.body.removeChild(ta);
          resolve(ok);
        } catch (e) {
          resolve(false);
        }
      });
    };
    const copyHtml = async () => {
      if (!statusEl) return;
      statusEl.textContent = "提取HTML中…";
      const html = getPageHtml();
      if (html.length > 300000) {
        statusEl.textContent = "HTML过大(" + html.length + "字符)，请先开 #ymdebug";
        return;
      }
      const ok = await copyToClipboard(html);
      statusEl.textContent = ok
        ? "✅ 已复制 " + html.length + " 字符，去聊天框粘贴即可"
        : "❌ 复制被拒：请再点一次复制按钮(iOS需点击手势)";
    };
    // 暴露给"面板事件护盾"(第1部分)在捕获阶段调用
    window.__ymCopyHtml = copyHtml;
    // 加载完约 5 秒后自动尝试一次（https 环境会直接成功；http 需靠上面的按钮）
    setTimeout(() => {
      try {
        if (!window.__ymHtmlCopied && document.body && statusEl) {
          copyHtml();
          window.__ymHtmlCopied = true;
        }
      } catch (e) {}
    }, 5000);

    const upd = () => {
      try {
        const sups = findSuspects();
        const has = sups.length > 0 || removedLog.length > 0;
        if (!has && !WANT) {
          emptyRounds++;
          if (emptyRounds > 2 && panel) panel.style.display = "none";
          return; // 页面干净，不打扰
        }
        emptyRounds = 0;
        const p = ensurePanel();
        p.style.display = "block";
        if (!p.isConnected && (document.body || document.documentElement)) {
          (document.body || document.documentElement).appendChild(p);
        }
        const lines = [];
        lines.push("【夜漫优化·诊断】移除记录(" + removedLog.length + "):");
        lines.push(removedLog.length ? removedLog.slice(-12).join("\n") : "(无)");
        lines.push("【疑似广告元素(已描红框)】");
        if (sups.length) {
          for (const el of sups) {
            el.style.outline = "2px solid red";
            const r = el.getBoundingClientRect();
            const cls = typeof el.className === "string" ? el.className : "";
            lines.push(
              "#" +
                el.tagName.toLowerCase() +
                "." +
                (cls.split(/\s+/)[0] || "-") +
                (el.id ? " id=" + el.id : "") +
                " z=" +
                window.getComputedStyle(el).zIndex +
                " 顶=" +
                Math.round(r.top) +
                " 高=" +
                Math.round(r.height) +
                " 宽=" +
                Math.round(r.width),
            );
          }
          lines.push("(红框元素即被标记的可疑广告，把这一屏截图发回即可)");
        } else {
          lines.push("(当前未发现可疑悬浮元素)");
        }
        preEl.textContent = lines.join("\n");
      } catch (e) {}
    };
    upd();
    setInterval(upd, 2000);
  }

  // ============================================================
  // =============== 第二部分 · 整章连看（仅阅读页生效） ================
  // ============================================================
  // 非阅读页没有 qTcms_S_m_murl / #qTcms_pic，tryExpand 会自动跳过，不影响其它页面。

  // 可视区下方预加载的冗余图片张数（防一次性大量请求，可按需改 0~3；1=最保守）
  const BUFFER = 1;

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
    // s1/s2 CDN 的 /scomic/ 图源一律走 p8.taoman 代理（防盗链，原域名直连打不开）
    v = v.replace(/https:\/\/s[12]\.[^/]+(\/scomic\/)/g, "https://p8.taoman.cc$1");
    return v;
  };

  // ----- 整话长图流：增量懒加载状态 -----
  let wrapper = null; // 长图容器（替换站点的单图表格）
  let pending = []; // 待加载图片 URL 队列
  let stopped = false; // 队列已全部加载完成
  let rafPending = false; // requestAnimationFrame 节流标志
  let intervalId = null; // 800ms 兜底轮询句柄

  // 图片地址统一转换：优先用站点自己的 f_qTcms_Pic_curUrl_realpic（含完整防盗链链，
  // 覆盖各图源分支），保证与不开脚本时完全一致；站点函数不可用时才退回 normalize。
  const toRealPic = (url) => {
    try {
      if (
        typeof window.f_qTcms_Pic_curUrl_realpic === "function"
      ) {
        return window.f_qTcms_Pic_curUrl_realpic(String(url));
      }
    } catch (e) {}
    return normalize(url);
  };

  // 不做第三方镜像池轮换：本站为搬运站，额外枚举他人 CDN 绕防盗链既不合适也难维护；
  // 与网站自身加载行为保持一致，个别镜像整体失效时该图灰框占位即可(记录供查)。

  // 图片创建/重试的最大次数
  const MAX_IMG_ATTEMPTS = 5;

  // 创建单张图片元素；失败时自动按候选源序列重试(动态换源)，全部失败才标记占位
  const makeImg = (rawUrl, idx) => {
    const img = document.createElement("img");
    const pick = (n) => {
      if (n === 0) return rawUrl;
      // 每轮重新调用站点转换函数：其内部对 manhuaju 等老源会随机挑镜像，
      // 多试几轮可命中未被限流的镜像(属站点自身机制, 不额外枚举第三方CDN)
      try {
        if (typeof window.f_qTcms_Pic_curUrl_realpic === "function") {
          return window.f_qTcms_Pic_curUrl_realpic(String(rawUrl));
        }
      } catch (e) {}
      return toRealPic(rawUrl);
    };
    let attempt = 0;
    let lastSrc = pick(0);
    img.src = lastSrc;
    img.alt = "第" + (idx + 1) + "页";
    img.style.cssText =
      "display:block;width:100%;height:auto;margin:0 auto;border:0;";
    img.setAttribute("decoding", "async");
    img.addEventListener("load", scheduleLoad);
    img.addEventListener("error", () => {
      attempt++;
      if (attempt >= MAX_IMG_ATTEMPTS) {
        failImg();
        return;
      }
      const next = pick(attempt);
      // 与上次相同/无新候选：死源(如 DNS 已注销)重试无意义，立即放弃，避免重复请求刷爆 Network
      if (!next || next === lastSrc) {
        failImg();
        return;
      }
      lastSrc = next;
      img.src = next; // 换新候选源
    });
    // 最终失败：标记占位并记录(便于后续排查)
    const failImg = () => {
      img.style.outline = "1px dashed #999";
      img.style.minHeight = "40px";
      logPush(
        "图片全部源失败(试" + attempt + "次): " + String(rawUrl).slice(0, 110),
      );
    };
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
        // 单张 try：某张异常只跳过这一张，不中断整批补图
        try {
          const img = makeImg(pending.shift(), imgs.length);
          wrapper.appendChild(img); // 每补一张都会开始加载
          extra++;
        } catch (err) {
          console.warn(
            "[夜漫整章] 单张图片插入异常，已跳过: " + (err && err.message),
          );
          if (!pending.length) break; // 队列已空则退出，避免空转
        }
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
      // 二分调试开关：#ymnoexpand 时跳过整章连看(排查页面被清空是否与本模块相关)
      if (/(?:^|[&#])ymnoexpand(?:$|[&#])/.test(location.hash)) return;
      // "外链话"(qTcms_dongman 非空) 是跳外链/APP 的章节，非本页内联图，无法展开，跳过
      const dg = window.qTcms_dongman;
      if (typeof dg === "string" && dg) return;
      const q = window.qTcms_S_m_murl; // 站点已解码的整话图片列表
      if (typeof q !== "string" || !q) return; // 非阅读页或数据未就绪
      const urls = q
        .split("$qingtiandy$")
        .filter((x) => x && x.indexOf("http") === 0);
      if (urls.length <= 1) return; // 整话只有 1 张，无需处理

      const picImg = document.getElementById("qTcms_pic");
      if (!picImg) return;

      // 页面已显示多张图（该漫画本来就整章显示）→ 跳过，避免重复渲染
      const shownCount = document.querySelectorAll(
        "#commicBox img, .mh_box img, .view-imgBox img",
      ).length;
      if (shownCount > 1) return;

      // 只追加、不删除：向单图所在容器追加整话长图流，站点单图暂不隐藏。
      // (之前 replaceChild 站点"祖先表格"会把整页布局节点带走→清屏; 立即隐藏单图则首屏空白)
      const singleImgParent = picImg.parentElement;
      if (!singleImgParent) return;
      wrapper = document.createElement("div");
      wrapper.id = "ym-all-pics";
      wrapper.style.cssText = "width:100%;margin:0 auto;";
      singleImgParent.appendChild(wrapper); // 不动站点任何既有节点

      // 我们的第一张图加载完成(或 3.5s 兜底)后才隐藏站点原图，避免首屏空白/双图闪烁
      let siteImgHidden = false;
      const hideSiteImg = () => {
        if (siteImgHidden) return;
        siteImgHidden = true;
        if (picImg && picImg.isConnected) {
          picImg.style.setProperty("display", "none", "important");
        }
      };
      wrapper.addEventListener("load", hideSiteImg, true); // 捕获任何子图加载
      setTimeout(hideSiteImg, 3500); // 兜底：即使图源慢也最终隐藏，防止长期双图

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
  // 入口包 try：它是 DOMContentLoaded/readystatechange 的直接回调，防止意外异常外抛
  const tryExpand = () => {
    try {
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
    } catch (e) {
      console.warn("[夜漫整章] tryExpand 异常: " + e.message);
    }
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
