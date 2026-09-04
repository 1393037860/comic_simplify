// ==UserScript==
// @name         百度首页样式调整
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  隐藏百度牛皮癣
// @author       Suave
// @match        https://www.baidu.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=baidu.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

// 1.0 init初版
// 1.1 修复图片过大，加大力度隐藏广告
// 1.2 隐藏广告

(function () {
  "use strict";
  try {
    var CSS_RULES =
      "" +
      "#container { width: calc(100% - 250px) !important; }" +
      "#container #content_right { display: none !important; }\n" +
      "#container #content_left { width: 100% !important; }\n" +
      ".head_wrapper #u { display: none !important; }\n" +
      "#container .result-op { width: 100% !important; }" +
      "#container .result-op .cos-col-3 { max-width: 140px !important; }" +
      "#container .c-container { width: 100% !important; }" +
      "#input-root .panel-list_8jHmm { display: none !important; }" +
      "#s-hotsearch-wrapper { display: none !important; }" +
      ".card-normal_3X7DX .c-span-last { flex: 1 !important; }" +
      ".cosc-card-content .sub-col_5FzGm { width: 200px !important; }" +
      ".wrapper_new .s_form.s_form_fresh { padding-left: 30px !important; }" +
      ".new-pmd #s_tab_inner { padding-left: 150px !important; }" +
      ".page-sample .page-inner_2jZi2 { margin: 0px !important; }";

    /**
     * 通过自定义属性查找匹配的元素
     * @param {Object} opts - 查询选项
     * @param {string} opts.value - 要匹配的属性值
     * @param {string} [opts.attr=mu] - 要查询的属性名，默认 "mu"
     * @returns {Element|null} 匹配的元素，未找到返回 null
     */
    var findMuElement = function (opts) {
      try {
        if (!opts || !opts.value) return null;
        var attr = opts.attr || "mu";
        return document.querySelector("[" + attr + '*="' + opts.value + '"]');
      } catch (e) {}
    };

    /**
     * 通过自定义属性查找所有匹配的元素
     * @param {Object} opts - 查询选项
     * @param {string} opts.value - 要匹配的属性值
     * @param {string} [opts.attr=mu] - 要查询的属性名，默认 "mu"
     * @returns {Element[]} 所有匹配的元素数组，未找到返回空数组
     */
    var findAllMuElements = function (opts) {
      try {
        if (!opts || !opts.value) return [];
        var attr = opts.attr || "mu";
        return document.querySelectorAll(
          "[" + attr + '*="' + opts.value + '"]',
        );
      } catch (e) {
        return [];
      }
    };

    var waitForMuElement = function (opts) {
      try {
        if (!opts || !opts.value)
          return Promise.reject(new Error("opts.value is required"));
        var el = findMuElement(opts);
        return el
          ? Promise.resolve(el)
          : Promise.reject(new Error("not found"));
      } catch (e) {
        return Promise.reject(e);
      }
    };

    /**
     * 注入自定义 CSS 样式到页面（仅注入一次）
     * @returns {void}
     */
    function ensureStyles() {
      try {
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
      } catch (e) {}
    }

    function onReady() {
      try {
        applyAllRules();
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

    function normalizeStyle(str) {
      try {
        return str.replace(/\s/g, "");
      } catch (e) {
        return "";
      }
    }

    /**
     * 以 !important 优先级设置元素的样式属性
     * @param {Element} el - 目标 DOM 元素
     * @param {string} prop - CSS 属性名
     * @param {string} value - CSS 属性值
     * @returns {void}
     */
    function setElStyle(el, prop, value) {
      try {
        el.style.setProperty(prop, value, "important");
      } catch (e) {}
    }

    /**
     * 查找匹配 CSS 选择器且内联样式包含指定规则的元素
     * @param {string} selector - CSS 选择器
     * @param {string[]} styleChecks - 需要匹配的样式规则数组（如 ["width: 25%"]）
     * @returns {Element[]} 符合条件的元素数组
     */
    function findElementsBySelectorAndStyle(selector, styleChecks) {
      try {
        var elements = document.querySelectorAll(selector);
        var result = [];
        var normChecks = [];
        for (var j = 0; j < styleChecks.length; j++) {
          normChecks.push(normalizeStyle(styleChecks[j]));
        }
        for (var i = 0; i < elements.length; i++) {
          var el = elements[i];
          var rawStyle = el.getAttribute("style") || "";
          if (!rawStyle) continue;
          var normStyle = normalizeStyle(rawStyle);
          var matchAll = true;
          for (var j = 0; j < normChecks.length; j++) {
            if (normStyle.indexOf(normChecks[j]) === -1) {
              matchAll = false;
              break;
            }
          }
          if (matchAll) {
            result.push(el);
          }
        }
        return result;
      } catch (e) {
        return [];
      }
    }

    /**
     * 查找匹配 CSS 选择器且内联样式包含指定规则的元素，并对匹配到的元素执行回调
     * @param {Object} opts - 配置选项
     * @param {string} opts.selector - CSS 选择器
     * @param {string[]} opts.styleChecks - 需要匹配的样式规则数组
     * @param {Function} opts.onMatch - 匹配到元素时的回调函数，接收匹配的元素作为参数
     * @returns {void}
     */
    function waitForElementsBySelectorAndStyle(opts) {
      try {
        if (!opts || !opts.selector || !opts.styleChecks) return;
        var matches = findElementsBySelectorAndStyle(
          opts.selector,
          opts.styleChecks,
        );
        for (var i = 0; i < matches.length; i++) {
          try {
            opts.onMatch(matches[i]);
          } catch (e) {}
        }
      } catch (e) {}
    }

    window.findMuElement = findMuElement;
    window.waitForMuElement = waitForMuElement;
    window.setElStyle = setElStyle;
    window.findElementsBySelectorAndStyle = findElementsBySelectorAndStyle;
    window.waitForElementsBySelectorAndStyle =
      waitForElementsBySelectorAndStyle;

    var hideRules = [
      { attr: "mu", value: "https://m.baidu.com/sf/vsearch" },
      { attr: "tpl", value: "short_video" },
      { attr: "tpl", value: "live_converge_san" },
      { attr: "tpl", value: "med_wenzhen_san" },
      { attr: "tpl", value: "ai_ecology" },
      { attr: "tpl", value: "qidian2" },
      { attr: "mu", value: "https://shouyou.3dmgame.com" },
      { attr: "mu", value: "https://app.3dmgame.com" },
      { attr: "mu", value: "https://www.yx007.com" },
      { attr: "mu", value: "https://m.wandoujia.com" },
      { attr: "mu", value: "http://as.baidu.com" },
      { attr: "tpl", value: "guanfanghao_san" },
      { attr: "mu", value: "http://nourl.ubs.baidu.com" },
      { attr: "mu", value: "https://www.bohe.cn" },
      { attr: "mu", value: "https://localsite.baidu.com" },
      { attr: "mu", value: "https://b2b.baidu.com" },
      { attr: "tpl", value: "fw_lawyer_recommend_card_san" },
      { attr: "tpl", value: "app/rs" },
    ];

    var processedParents = new WeakSet();

    /**
     * 应用所有隐藏和布局规则
     * - 注入必要的样式
     * - 遍历 hideRules 隐藏匹配的元素
     * - 调整 .cos-col 元素的宽度布局，首个设为 140px，其余占满剩余空间
     * @returns {void}
     */
    function applyAllRules() {
      ensureStyles();

      hideRules.forEach(function (rule) {
        try {
          var els = findAllMuElements(rule);
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.style.display !== "none") {
              el.style.display = "none";
            }
          }
        } catch (e) {}
      });

      var cosCols = findElementsBySelectorAndStyle(".cos-col", [
        "box-sizing: border-box",
        "width: 25%",
      ]);
      cosCols.forEach(function (el) {
        setElStyle(el, "width", "140px");
        var parent = el.parentElement;
        if (!parent || processedParents.has(parent)) return;
        processedParents.add(parent);
        var children = parent.children;
        for (var i = 0; i < children.length; i++) {
          var sibling = children[i];
          if (sibling !== el && sibling.classList.contains("cos-col")) {
            setElStyle(sibling, "width", "calc(100% - 140px)");
          }
        }
      });
    }

    applyAllRules();

    var applyObserver = new MutationObserver(function () {
      applyAllRules();
    });
    var observeTarget = document.body || document.documentElement;
    if (observeTarget) {
      applyObserver.observe(observeTarget, {
        childList: true,
        subtree: true,
      });
    }
  } catch (e) {}
})();
