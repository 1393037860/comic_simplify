// ==UserScript==
// @name         调整漫画阅读页面样式
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  隐藏特定影响阅读的广告元素，支持PC端访问
// @author       Suave
// @match        https://www.mqzjw.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mqzjw.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

// 1.0 初始化
// 1.1 优化样式
// 1.2 兼容pc端访问
// 1.3 修复pc端样式
// 1.4 修复via 浏览器支持
// 1.5 继续优化样式
// 1.6 继续优化样式
(function () {
  "use strict";

  var debounceTimer = null;
  var styleElement = null;
  var userCssElement = null;
  var observer = null;

  function debounce(fn, delay) {
    return function () {
      var args = arguments;
      var context = this;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  function setMobileUserAgent() {
    var mobileUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

    try {
      Object.defineProperty(navigator, "userAgent", {
        value: mobileUA,
        writable: false,
        configurable: true,
      });
    } catch (e) {}

    try {
      Object.defineProperty(navigator, "appVersion", {
        value: mobileUA,
        writable: false,
        configurable: true,
      });
    } catch (e) {}

    try {
      Object.defineProperty(navigator, "platform", {
        value: "iPhone",
        writable: false,
        configurable: true,
      });
    } catch (e) {}

    try {
      Object.defineProperty(navigator, "vendor", {
        value: "Apple Computer, Inc.",
        writable: false,
        configurable: true,
      });
    } catch (e) {}

    try {
      if (navigator.__proto__) {
        Object.defineProperty(navigator.__proto__, "userAgent", {
          get: function () {
            return mobileUA;
          },
        });
      }
    } catch (e) {}
  }

  setMobileUserAgent();

  function checkForbiddenAndRedirect() {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var forbiddenFrame = document.getElementById("mainFrame");
        if (
          forbiddenFrame &&
          forbiddenFrame.src &&
          forbiddenFrame.src.indexOf("/custom/forbidden") !== -1
        ) {
          resolve(true);
        } else {
          resolve(false);
        }
      }, 200);
    });
  }

  function showForbiddenOverlay() {
    checkForbiddenAndRedirect().then(function (isForbidden) {
      if (isForbidden) {
        var overlay = document.createElement("div");
        overlay.id = "mobile-ua-overlay";
        overlay.style.cssText =
          "position:fixed;top:0;left:0;width:100%;height:100%;" +
          "background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);" +
          "z-index:9999999;display:flex;flex-direction:column;" +
          "justify-content:center;align-items:center;" +
          "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

        var content = document.createElement("div");
        content.style.cssText =
          "background:white;padding:40px;border-radius:16px;" +
          "max-width:420px;text-align:center;" +
          "box-shadow:0 25px 80px rgba(0,0,0,0.3);margin:20px;";

        content.innerHTML =
          '<div style="width:80px;height:80px;margin:0 auto 20px;' +
          "background:linear-gradient(135deg,#ff6b6b,#ee5a24);" +
          'border-radius:50%;display:flex;align-items:center;justify-content:center;">' +
          '<svg style="width:40px;height:40px;color:white;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M12 19V6l8-3v13M12 19c0 1.1-.9 2-2 2s-2-.9-2-2 2-4 2-4 2 2.9 2 4zm-6 0c0 1.1-.9 2-2 2s-2-.9-2-2 2-4 2-4 2 2.9 2 4z"/>' +
          "</svg></div>" +
          '<h2 style="color:#2d3436;margin:0 0 15px;font-size:24px;">访问被限制</h2>' +
          '<p style="color:#636e72;margin:0 0 25px;line-height:1.6;">该网站检测到您使用PC浏览器访问，请切换到移动端模式</p>' +
          '<div style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:25px;text-align:left;">' +
          '<p style="color:#2d3436;font-weight:600;margin:0 0 15px;">解决方案：</p>' +
          '<div style="color:#495057;font-size:14px;line-height:2;">' +
          '<div style="margin-bottom:10px;"><strong>方法一：浏览器扩展</strong><br>安装 User-Agent Switcher 扩展，设置为 iPhone</div>' +
          '<div style="margin-bottom:10px;"><strong>方法二：开发者工具</strong><br>按 F12 → Ctrl+Shift+M → 选择移动设备</div>' +
          "<div><strong>方法三：刷新重试</strong><br>如果已设置好移动端UA，请刷新页面</div>" +
          "</div></div>" +
          '<button onclick="window.location.reload()" ' +
          'style="width:100%;padding:14px;background:linear-gradient(135deg,#667eea,#764ba2);' +
          "color:white;border:none;border-radius:10px;cursor:pointer;font-size:16px;font-weight:600;" +
          'transition:transform 0.2s,box-shadow 0.2s;" ' +
          "onmouseover=\"this.style.transform='scale(1.02)';this.style.boxShadow='0 5px 20px rgba(102,126,234,0.4)'\" " +
          "onmouseout=\"this.style.transform='scale(1)';this.style.boxShadow='none'\">" +
          "刷新页面</button>";

        overlay.appendChild(content);
        (document.documentElement || document.body).appendChild(overlay);

        console.warn("检测到PC端访问限制，请使用移动端User Agent");
      }
    });
  }

  function hideElement(options) {
    var selector = options.selector;
    var selectorType = options.selectorType || "class";
    var elements = [];
    if (selectorType === "id") {
      var element = document.getElementById(selector);
      if (element) elements.push(element);
    } else if (selectorType === "class") {
      elements = Array.prototype.slice.call(
        document.getElementsByClassName(selector),
      );
    }

    if (elements.length > 0) {
      for (var i = 0; i < elements.length; i++) {
        elements[i].style.display = "none";
      }
    }
  }

  var exactTextsToHide = [
    "投诉邮箱：toushu@qingman.me",
    "下载APP阅读内容更流畅！",
    "请集美集帅们去下载观看吧！",
    "下载APP，免费观看",
  ];

  var elementsToHide = [
    // {
    //   text: "投诉邮箱：toushu@qingman.me",
    //   stylePatterns: ["position:fixed", "text-align:center", "top:50px"],
    // },
    // {
    //   text: "下载APP阅读内容更流畅！",
    //   stylePatterns: [
    //     "text-align:center",
    //     "font-size:16px",
    //     "font-weight:bold",
    //     "padding:50px",
    //   ],
    // },
    // {
    //   text: "请集美集帅们去下载观看吧！",
    //   stylePatterns: [
    //     "text-align:center",
    //     "font-size:16px",
    //     "font-weight:bold",
    //     "padding:5px",
    //   ],
    // },
    {
      text: "下载APP，免费观看",
      stylePatterns: [
        "background-color:#fdd100",
        "border-radius:30px",
        "box-shadow:",
      ],
    },
  ];

  var parentElementsToHide = [
    { parentSelector: ".pure-menu-item", childText: "APP下载" },
  ];

  function hideElementsByExactText() {
    for (var t = 0; t < exactTextsToHide.length; t++) {
      var targetText = exactTextsToHide[t];
      var allDivs = document.querySelectorAll("div");
      for (var i = 0; i < allDivs.length; i++) {
        var directText = getDirectTextContent(allDivs[i]);
        if (directText.indexOf(targetText) !== -1) {
          allDivs[i].style.display = "none";
        }
      }
    }
  }

  function getDirectTextContent(element) {
    var text = "";
    var children = element.childNodes;
    for (var i = 0; i < children.length; i++) {
      if (children[i].nodeType === Node.TEXT_NODE) {
        text += children[i].textContent;
      }
    }
    return text.trim();
  }

  function hideTargetElements() {
    for (var c = 0; c < elementsToHide.length; c++) {
      var config = elementsToHide[c];
      var text = config.text;
      var stylePatterns = config.stylePatterns;
      var xpath = "//div[contains(., '" + text + "')]";
      var elements;
      try {
        elements = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
      } catch (e) {
        continue;
      }

      if (elements.snapshotLength === 0) continue;

      for (var i = 0; i < elements.snapshotLength; i++) {
        var element = elements.snapshotItem(i);
        if (element) {
          var style = element.getAttribute("style") || "";
          var allPatternsMatch = true;
          for (var p = 0; p < stylePatterns.length; p++) {
            if (style.indexOf(stylePatterns[p]) === -1) {
              allPatternsMatch = false;
              break;
            }
          }
          if (allPatternsMatch) {
            element.style.display = "none";
          }
        }
      }
    }
  }

  function hideParentByChildText() {
    for (var c = 0; c < parentElementsToHide.length; c++) {
      var config = parentElementsToHide[c];
      var parentSelector = config.parentSelector;
      var childText = config.childText;
      var parentElements = document.querySelectorAll(parentSelector);

      for (var i = 0; i < parentElements.length; i++) {
        var parent = parentElements[i];
        var hasMatchingChild = false;
        var childNodes = parent.childNodes;
        for (var j = 0; j < childNodes.length; j++) {
          var child = childNodes[j];
          if (child.nodeType === Node.TEXT_NODE) {
            if (child.textContent.trim() === childText) {
              hasMatchingChild = true;
              break;
            }
          }
          if (child.textContent) {
            if (child.textContent.trim() === childText) {
              hasMatchingChild = true;
              break;
            }
          }
        }

        if (hasMatchingChild) {
          parent.style.display = "none";
        }
      }
    }
  }

  function findElementByText(parentSelector, tagName, targetText) {
    var elements = [];
    var parentElements = document.querySelectorAll(parentSelector);
    for (var i = 0; i < parentElements.length; i++) {
      var tagElements = parentElements[i].querySelectorAll(tagName);
      for (var j = 0; j < tagElements.length; j++) {
        if (tagElements[j].textContent.trim() === targetText) {
          elements.push(tagElements[j]);
        }
      }
    }
    return elements;
  }

  function adjustTitleStyle() {
    var titleElement = document.querySelector(".l-content > .text > .title");
    if (titleElement) {
      titleElement.classList.add("user-style-fixed");
      return true;
    }
    return false;
  }

  const MAX_WIDTH = "1200px";
  const GREY_COLOR = "#dcdfe6";
  const SMALL_SCREEN = "max-width: 768px";
  var CSS_RULES =
    "" +
    "* { box-sizing: border-box !important; }" +
    "img { object-fit: cover !important; }\n" +
    ".search-form { background-color: transparent !important; padding: 0 !important }\n" +
    ".l-content { position: static !important; width: 100% !important; max-width: 100% !important; }\n" +
    ".l-content .l-box { margin-bottom: 0 !important; }\n" +
    `.recommend-comics { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 20px !important;}\n` +
    `.recommend-comics li { display: flex !important; flex-direction: column !important; align-items: center !important; border: 1px solid ${GREY_COLOR}; border-radius: 4px; padding: 10px; min-width:0px;}\n` +
    `.recommend-comics li:hover { border-color: var(--link-hover-color);}\n` +
    ".recommend-comics li a { width: 100% !important; display: flex !important; flex-direction: column !important; align-items: center !important; gap: 10px !important; }\n" +
    ".recommend-comics li a img { border-radius: 5px !important; }\n" +
    `@media (${SMALL_SCREEN}) {.recommend-comics li a img { width: 100% !important; }}\n` +
    ".comics-detail__info { height: auto !important; }\n" +
    ".pure-g { background-color: #fff !important; display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(100% / 6), 1fr)) !important; gap: 10px !important; padding: 10px !important; border-radius: 4px !important; }\n" +
    `@media (${SMALL_SCREEN}) {.pure-g { grid-template-columns: repeat(3, 1fr) !important; display: grid; }}\n` +
    `@media (${SMALL_SCREEN}) {.pure-g .comics-card { width: 100% !important; min-width: 0 !important; }}\n` +
    ".pure-g .comics-card { background-color: #fff !important; border: 1px solid transparent !important; border-radius: 4px !important; width: 100% !important; }\n" +
    `.pure-g .comics-card:hover { border-color: var(--link-hover-color) !important; }\n` +
    ".pure-g .pure-u-1-1 img { border-radius: 5px !important; }\n" +
    ".mod-filter { padding: 0 !important; }\n" +
    "#sousuolist { padding: 0px 10px !important; }\n" +
    ".mod-filter .list .item a { width: 100% !important; display: block !important; }" +
    `@media (${SMALL_SCREEN}) {.xianshi { width: 100% !important; height: 60vh !important; position: relative; }}\n` +
    ".xianshi .desc { height: 48px !important; display: flex; justify-content: space-between; box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.06); }" +
    ".xianshi .desc span { height: 100% !important; position: static !important; margin: 0px !important; border-radius: 4px !important; display: flex !important; justify-content: center !important; align-items: center !important; }" +
    ".catalog-head a { height: 26px !important; position: static !important; border-radius: 4px !important; display: flex !important; justify-content: center !important; align-items: center !important; background-color: #fff !important; }" +
    ".catalog-head catalog-title { font-size: 20px !important; }" +
    ".switch-books::-webkit-scrollbar { width: 0px !important; height: 0px !important;}" +
    "#__nuxt { min-height: 100vh !important;}" +
    `#layout { max-width: ${MAX_WIDTH}; min-width: 50%; margin:0 auto; }` +
    `.pure-menu-fixed { max-width: ${MAX_WIDTH}; min-width: 50%; margin: 0 auto; left: 50%; transform: translateX(-50%); }` +
    `.pure-menu-fixed .l-content { width: 100%; max-width: ${MAX_WIDTH}; }` +
    `.mt-5 { width: 100%;  }` +
    `.mt-5 .l-content { width: 100%; max-width: 100%; }` +
    `#chapter-items .comics-chapters { width: 100%; min-width: 0; }` +
    `#chapter-items1 .comics-chapters { width: 100%; min-width: 0; }` +
    `#chapter-items2 .comics-chapters { width: 100%; min-width: 0; }` +
    `@media (${SMALL_SCREEN}) {#chapter-items { grid-template-columns: repeat(2, 1fr) !important; }}\n` +
    `@media (${SMALL_SCREEN}) {#chapter-items1 { grid-template-columns: repeat(2, 1fr) !important; }}\n` +
    `@media (${SMALL_SCREEN}) {#chapter-items2 { grid-template-columns: repeat(2, 1fr) !important; }}\n` +
    `@media (${SMALL_SCREEN}) {#chapter-items .comics-chapters { width:50% !important; }}\n` +
    `@media (${SMALL_SCREEN}) {#chapter-items1 .comics-chapters { width:50% !important; }}\n` +
    `@media (${SMALL_SCREEN}) {#chapter-items2 .comics-chapters { width:50% !important; }}\n` +
    `@media (${SMALL_SCREEN}) {.xianshi #chapter-items .comics-chapters { width:100% !important; }}\n` +
    `@media (${SMALL_SCREEN}) {.xianshi #chapter-items1 .comics-chapters { width:100% !important; }}\n` +
    `@media (${SMALL_SCREEN}) {.xianshi #chapter-items2 .comics-chapters { width:100% !important; }}\n` +
    `.de-info__bg { background: transparent !important; }` +
    `.de-info__overlay { background: transparent !important; }` +
    `.de-info__box { display: flex !important; padding: 20px !important; height: 300px !important; gap: 20px;}` +
    `.de-info__box > div { height: 100% !important;}` +
    `.de-info__box .pure-u-1-1 img { height: 100% !important; width: 100% !important;}` +
    `.de-info__box .pure-u-md-1-6 { height: 100% !important; flex-shrink: 0; width: 200px;}` +
    `.de-info__box .pure-u-md-3-4 { height: 100% !important; flex: 1;}` +
    `@media (${SMALL_SCREEN}) {.de-info__box { display: block !important; height: auto !important; }}\n` +
    `@media (${SMALL_SCREEN}) {.de-info__box .pure-u-md-1-6 { width: 100% !important; height: 250px !important; display: flex; justify-content: center; }}\n` +
    `@media (${SMALL_SCREEN}) {.de-info__box .pure-u-md-1-6 img { width: auto !important;  }}\n` +
    `.comics-detail__title a { box-shadow: unset !important;}`;
  function ensureStyleElement() {
    if (styleElement && document.getElementById("user-script-styles")) {
      return;
    }
    styleElement = document.createElement("style");
    styleElement.id = "user-script-styles";
    styleElement.textContent =
      ".user-style-fixed { width: 100% !important; max-width: none !important; position: static !important; display: block; height: auto !important; }";
    var target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleElement);
    }
  }

  function ensureUserCssElement() {
    if (
      userCssElement &&
      document.getElementById("user-script-future-styles")
    ) {
      return;
    }
    userCssElement = document.createElement("style");
    userCssElement.id = "user-script-future-styles";
    userCssElement.textContent = CSS_RULES;
    var target = document.head || document.documentElement;
    if (target) {
      target.appendChild(userCssElement);
    }
  }

  function amphtmlStyle() {
    var fillContents = document.querySelectorAll(".i-amphtml-fill-content");
    if (fillContents.length === 0) {
      return false;
    }
    for (var i = 0; i < fillContents.length; i++) {
      fillContents[i].style.objectFit = "cover";
    }
    return true;
  }

  function runAllFunctions() {
    try {
      ensureStyleElement();
    } catch (e) {}

    try {
      hideElement({ selector: "xiazai", selectorType: "id" });
    } catch (e) {}
    try {
      hideElement({ selector: "next_chapter" });
    } catch (e) {}
    try {
      hideElement({ selector: "footer" });
    } catch (e) {}
    try {
      hideElement({ selector: "alertBox", selectorType: "id" });
    } catch (e) {}
    try {
      hideElementsByExactText();
    } catch (e) {}
    try {
      hideTargetElements();
    } catch (e) {}
    try {
      hideParentByChildText();
    } catch (e) {}
    try {
      var spans = findElementByText(".l-box", "span", "查看更多章节");
      for (var k = 0; k < spans.length; k++) {
        spans[k].style.boxShadow = "unset";
      }
    } catch (e) {}
    try {
      adjustTitleStyle();
    } catch (e) {}
    try {
      amphtmlStyle();
    } catch (e) {}

    try {
      ensureUserCssElement();
    } catch (e) {}
  }

  function onNavigation() {
    ensureStyleElement();
    ensureUserCssElement();
    runAllFunctions();
    showForbiddenOverlay();
  }

  var debouncedOnNavigation = debounce(onNavigation, 300);

  function interceptHistoryAPI() {
    var _pushState = history.pushState;
    var _replaceState = history.replaceState;

    if (_pushState) {
      history.pushState = function () {
        var result = _pushState.apply(this, arguments);
        debouncedOnNavigation();
        return result;
      };
    }

    if (_replaceState) {
      history.replaceState = function () {
        var result = _replaceState.apply(this, arguments);
        debouncedOnNavigation();
        return result;
      };
    }

    window.addEventListener("popstate", function () {
      debouncedOnNavigation();
    });

    window.addEventListener("hashchange", function () {
      debouncedOnNavigation();
    });
  }

  interceptHistoryAPI();

  function setupMutationObserver() {
    if (typeof MutationObserver === "undefined") {
      setInterval(function () {
        runAllFunctions();
      }, 1500);
      return;
    }

    var debouncedRunAll = debounce(runAllFunctions, 200);

    observer = new MutationObserver(function () {
      debouncedRunAll();
    });

    var observeTarget = document.body || document.documentElement;
    if (observeTarget) {
      observer.observe(observeTarget, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  function init() {
    ensureStyleElement();
    showForbiddenOverlay();
    runAllFunctions();
    setupMutationObserver();
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", function () {
      if (
        document.readyState === "interactive" ||
        document.readyState === "complete"
      ) {
        init();
      }
    });
  }
})();
