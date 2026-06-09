// ==UserScript==
// @name         调整漫画阅读页面样式
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  隐藏特定ID的元素，支持PC端访问
// @author       Suave
// @match        https://www.mqzjw.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mqzjw.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  function setMobileUserAgent() {
    const mobileUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

    Object.defineProperty(navigator, "userAgent", {
      value: mobileUA,
      writable: false,
      configurable: true,
    });
    Object.defineProperty(navigator, "appVersion", {
      value: mobileUA,
      writable: false,
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: "iPhone",
      writable: false,
      configurable: true,
    });
    Object.defineProperty(navigator, "vendor", {
      value: "Apple Computer, Inc.",
      writable: false,
      configurable: true,
    });

    if (navigator.__proto__) {
      Object.defineProperty(navigator.__proto__, "userAgent", {
        get: () => mobileUA,
      });
    }
  }

  setMobileUserAgent();

  function checkForbiddenAndRedirect() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const forbiddenFrame = document.getElementById("mainFrame");
        if (
          forbiddenFrame &&
          forbiddenFrame.src.includes("/custom/forbidden")
        ) {
          resolve(true);
        } else {
          resolve(false);
        }
      }, 200);
    });
  }

  checkForbiddenAndRedirect().then((isForbidden) => {
    if (isForbidden) {
      const overlay = document.createElement("div");
      overlay.id = "mobile-ua-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      const content = document.createElement("div");
      content.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 16px;
        max-width: 420px;
        text-align: center;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
        margin: 20px;
      `;

      content.innerHTML = `
        <div style="width: 80px; height: 80px; margin: 0 auto 20px; background: linear-gradient(135deg, #ff6b6b, #ee5a24); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 40px; height: 40px; color: white;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19V6l8-3v13M12 19c0 1.1-.9 2-2 2s-2-.9-2-2 2-4 2-4 2 2.9 2 4zm-6 0c0 1.1-.9 2-2 2s-2-.9-2-2 2-4 2-4 2 2.9 2 4z"/>
          </svg>
        </div>
        <h2 style="color: #2d3436; margin: 0 0 15px; font-size: 24px;">访问被限制</h2>
        <p style="color: #636e72; margin: 0 0 25px; line-height: 1.6;">该网站检测到您使用PC浏览器访问，请切换到移动端模式</p>
        
        <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 25px; text-align: left;">
          <p style="color: #2d3436; font-weight: 600; margin: 0 0 15px;">解决方案：</p>
          <div style="color: #495057; font-size: 14px; line-height: 2;">
            <div style="margin-bottom: 10px;"><strong>方法一：浏览器扩展</strong><br>安装 User-Agent Switcher 扩展，设置为 iPhone</div>
            <div style="margin-bottom: 10px;"><strong>方法二：开发者工具</strong><br>按 F12 → Ctrl+Shift+M → 选择移动设备</div>
            <div><strong>方法三：刷新重试</strong><br>如果已设置好移动端UA，请刷新页面</div>
          </div>
        </div>
        
        <button onclick="window.location.reload()" 
                style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 16px; font-weight: 600; transition: transform 0.2s, box-shadow 0.2s;"
                onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 5px 20px rgba(102,126,234,0.4)'"
                onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'">
          刷新页面
        </button>
      `;

      overlay.appendChild(content);
      document.documentElement.appendChild(overlay);

      console.warn("检测到PC端访问限制，请使用移动端User Agent");
    }
  });

  function hideElement(options) {
    const selector = options.selector;
    const selectorType = options.selectorType || "class";
    let elements = [];
    if (selectorType === "id") {
      const element = document.getElementById(selector);
      if (element) elements.push(element);
    } else if (selectorType === "class") {
      elements = Array.from(document.getElementsByClassName(selector));
    }

    if (elements.length > 0) {
      elements.forEach(function (element) {
        element.style.display = "none";
      });
    }
  }

  const exactTextsToHide = [
    "投诉邮箱：toushu@qingman.me",
    "下载APP阅读内容更流畅！",
    "请集美集帅们去下载观看吧！",
    "下载APP，免费观看",
  ];

  const elementsToHide = [
    {
      text: "投诉邮箱：toushu@qingman.me",
      stylePatterns: ["position:fixed", "text-align:center", "top:50px"],
    },
    {
      text: "下载APP阅读内容更流畅！",
      stylePatterns: [
        "text-align:center",
        "font-size:16px",
        "font-weight:bold",
        "padding:50px",
      ],
    },
    {
      text: "请集美集帅们去下载观看吧！",
      stylePatterns: [
        "text-align:center",
        "font-size:16px",
        "font-weight:bold",
        "padding:5px",
      ],
    },
    {
      text: "下载APP，免费观看",
      stylePatterns: [
        "background-color:#fdd100",
        "border-radius:30px",
        "box-shadow:",
      ],
    },
  ];

  const parentElementsToHide = [
    { parentSelector: ".pure-menu-item", childText: "APP下载" },
  ];

  function hideElementsByExactText() {
    exactTextsToHide.forEach(function (targetText) {
      const allDivs = document.querySelectorAll("div");
      allDivs.forEach(function (div) {
        const directText = getDirectTextContent(div);
        if (directText.includes(targetText)) {
          div.style.display = "none";
        }
      });
    });
  }

  function getDirectTextContent(element) {
    let text = "";
    element.childNodes.forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      }
    });
    return text.trim();
  }

  function hideTargetElements() {
    elementsToHide.forEach(function (config) {
      const text = config.text;
      const stylePatterns = config.stylePatterns;
      const xpath = `//div[contains(., '${text}')]`;
      const elements = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );

      if (elements.snapshotLength === 0) return;

      for (let i = 0; i < elements.snapshotLength; i++) {
        const element = elements.snapshotItem(i);
        if (element) {
          const style = element.getAttribute("style") || "";
          const allPatternsMatch = stylePatterns.every(function (pattern) {
            return style.includes(pattern);
          });

          if (allPatternsMatch) {
            element.style.display = "none";
          }
        }
      }
    });
  }

  function hideParentByChildText() {
    parentElementsToHide.forEach(function (config) {
      const parentSelector = config.parentSelector;
      const childText = config.childText;
      const parentElements = document.querySelectorAll(parentSelector);

      parentElements.forEach(function (parent) {
        const hasMatchingChild = Array.from(parent.childNodes).some(
          function (child) {
            if (child.nodeType === Node.TEXT_NODE) {
              return child.textContent.trim() === childText;
            }
            if (child.textContent) {
              return child.textContent.trim() === childText;
            }
            return false;
          },
        );

        if (hasMatchingChild) {
          parent.style.display = "none";
        }
      });
    });
  }

  function adjustTitleStyle() {
    const titleElement = document.querySelector(".l-content > .text > .title");
    if (titleElement) {
      titleElement.classList.add("user-style-fixed");
      return true;
    }
    return false;
  }

  function adjustRecommendComicsStyle() {
    const recommendComics = document.querySelector(
      "ul.clearfix.recommend-comics",
    );
    if (recommendComics) {
      recommendComics.style.display = "grid";
      recommendComics.style.gridTemplateColumns = "repeat(3, 1fr)";
      recommendComics.style.gap = "20px";
      return true;
    }
    return false;
  }

  const style = document.createElement("style");
  style.textContent = `.user-style-fixed { width: 100% !important; max-width: none !important; position: static !important; display: block; height: auto !important; }`;

  function initStyles() {
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.head.appendChild(style);
      });
    }
  }

  const UserCSS = (function () {
    const styleSheet = document.createElement("style");
    styleSheet.id = "user-script-future-styles";

    function insertStyleSheet() {
      if (document.head) {
        if (!document.getElementById("user-script-future-styles")) {
          document.head.appendChild(styleSheet);
        }
        return true;
      }
      if (document.documentElement) {
        if (!document.getElementById("user-script-future-styles")) {
          document.documentElement.appendChild(styleSheet);
        }
        return true;
      }
      return false;
    }

    function ensureStyleSheetReady() {
      return new Promise((resolve) => {
        const checkAndInsert = () => {
          const inserted = insertStyleSheet();

          if (inserted) {
            resolve(styleSheet);
          } else {
            setTimeout(checkAndInsert, 30);
          }
        };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", checkAndInsert);
          checkAndInsert();
        } else {
          checkAndInsert();
        }
      });
    }

    async function addRule(selector, declarations) {
      const sheetElement = await ensureStyleSheetReady();

      let declarationString = "";
      for (const [property, value] of Object.entries(declarations)) {
        const cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
        declarationString += `${cssProperty}: ${value} !important; `;
      }

      try {
        const ruleText = `${selector} { ${declarationString} }`;
        sheetElement.innerHTML += ruleText + "\n";

        const domStyleSheet = document.getElementById(
          "user-script-future-styles",
        );
      } catch (e) {
        console.error(`[UserCSS] 添加规则失败: ${selector}`, e);
      }
    }

    function addRules(rules) {
      rules.forEach((rule) => {
        addRule(rule.selector, rule.declarations);
      });
    }

    async function hide(selectors) {
      if (!Array.isArray(selectors)) {
        selectors = [selectors];
      }
      for (const selector of selectors) {
        await addRule(selector, { display: "none" });
      }
    }

    async function removeRule(selector) {
      const sheet = await ensureStyleSheet();

      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
        if (rule.selectorText === selector) {
          sheet.deleteRule(i);
          return;
        }
      }
    }

    async function clearAll() {
      const sheet = await ensureStyleSheet();
      while (sheet.cssRules.length > 0) {
        sheet.deleteRule(0);
      }
    }

    async function getRules() {
      const sheet = await ensureStyleSheet();
      return Array.from(sheet.cssRules).map((rule) => ({
        selector: rule.selectorText,
        cssText: rule.cssText,
      }));
    }

    return {
      addRule,
      addRules,
      hide,
      removeRule,
      clearAll,
      getRules,
    };
  })();

  function amphtmlStyle() {
    const fillContents = document.querySelectorAll(".i-amphtml-fill-content");

    if (fillContents.length === 0) {
      return false;
    }

    fillContents.forEach((element) => {
      element.style.objectFit = "cover";
    });

    return true;
  }

  function runAllFunctions() {
    hideElement({ selector: "xiazai", selectorType: "id" });
    hideElement({ selector: "next_chapter" });
    hideElement({ selector: "footer" });
    hideElement({ selector: "alertBox", selectorType: "id" });
    hideElementsByExactText();
    hideTargetElements();
    hideParentByChildText();
    adjustTitleStyle();
    adjustRecommendComicsStyle();
    amphtmlStyle();
    UserCSS.addRule("img", { objectFit: "cover" });
    UserCSS.addRule(".search-form", {
      backgroundColor: "#fff",
    });
    UserCSS.addRule(".l-content", {
      position: "static",
    });
    UserCSS.addRule(".l-content .l-box", {
      marginBottom: "0",
    });
    UserCSS.addRule(".recommend-comics li", {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    });
    UserCSS.addRule(".recommend-comics li a", {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
    });
    UserCSS.addRule(".recommend-comics li a img", {
      borderRadius: "5px",
    });
    UserCSS.addRule(".comics-detail__info", {
      height: "auto",
    });
    UserCSS.addRule(".pure-g .pure-u-1-1 img", {
      borderRadius: "5px",
    });
    UserCSS.addRule(".mod-filter", {
      padding: "0",
    });
    UserCSS.addRule("#sousuolist", {
      padding: "0px 10px",
    });
    UserCSS.addRule(".mod-filter .list .item a", {
      width: "100%",
      display: "block",
    });
  }

  initStyles();

  document.addEventListener("DOMContentLoaded", () => {
    runAllFunctions();
  });

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    runAllFunctions();
  }

  const observer = new MutationObserver(function (mutations) {
    adjustTitleStyle();
    adjustRecommendComicsStyle();
    hideElementsByExactText();
    hideTargetElements();
    hideParentByChildText();
    amphtmlStyle();
  });

  const observeDOM = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", observeDOM);
    }
  };

  observeDOM();
})();
