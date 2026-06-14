// ==UserScript==
// @name         百度首页样式调整
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  隐藏百度首页 #container 下的 #content_right 等元素（支持 SPA 导航）
// @author       Suave
// @match        https://www.baidu.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=baidu.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  var CSS_RULES =
    "" +
    "#container { width: calc(100% - 250px) !important; }" +
    "#container #content_right { display: none !important; }\n" +
    "#container #content_left { width: 100% !important; }\n" +
    ".head_wrapper #u { display: none !important; }\n" +
    "#container .result-molecule #rs_new { display: none !important; }\n" +
    "#container .result-op { width: 100% !important; }" +
    "#container .result-op .cos-col-3 { max-width: 140px !important; }" +
    "#container .c-container { width: 100% !important; }" +
    "#input-root .panel-list_8jHmm { display: none !important; }" +
    "#s-hotsearch-wrapper { display: none !important; }" +
    ".head_wrapper .s_form{ width: 100% !important; }" +
    ".head_wrapper #main-wrapper{ width: 90% !important; }";

  function ensureStyles() {
    if (document.getElementById("baidu-user-styles")) {
      return;
    }
    var styleElement = document.createElement("style");
    styleElement.id = "baidu-user-styles";
    styleElement.textContent = CSS_RULES;
    var target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleElement);
    }
  }

  function setupObserver() {
    var observer = new MutationObserver(function () {
      ensureStyles();
    });
    var target = document.head || document.documentElement;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  function onReady() {
    try {
      ensureStyles();
      setupObserver();
      console.log("==>🚀✅", "百度首页样式调整脚本运行...");
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  if (document.head) {
    onReady();
  }
})();
