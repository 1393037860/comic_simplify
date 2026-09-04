// ==UserScript==
// @name         模拟手机环境(调试用)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  临时调试用：在 PC 上伪造手机环境，配合 devtools 触摸模拟复现移动端广告。调试完可删除。
// @author       Suave
// @match        http://m.yueman1.cc/*
// @match        https://m.yueman1.cc/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";
  // 伪造安卓平台与触摸能力（广告SDK靠 navigator.platform 区分手机/电脑分支）
  try {
    Object.defineProperty(navigator, "platform", {
      get: () => "Linux armv8l",
      configurable: true,
    });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => 5,
      configurable: true,
    });
  } catch (e) {}
})();
