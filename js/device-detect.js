/* ==========================================================================
 * Rainbow Trial — js/device-detect.js
 * デバイス / OS / 機能検出ユーティリティ
 *
 * 公開グローバル: window.DeviceDetect
 * ========================================================================== */

(function (global) {
  'use strict';

  var DeviceDetect = {

    isIOS: function () {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) && !global.MSStream;
    },

    isAndroid: function () {
      return /Android/.test(navigator.userAgent);
    },

    isStandalone: function () {
      return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
             global.navigator.standalone === true;
    },

    isIOSSafari: function () {
      var ua = navigator.userAgent;
      return this.isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    },

    getIOSVersion: function () {
      var match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },

    hasNotchOrDynamicIsland: function () {
      return this.isIOS() && (screen.height >= 812 || screen.width >= 812);
    },

    /** デバイス性能が低い可能性があるか(アニメーション削減に使う) */
    isLowEndDevice: function () {
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return true;
      if (this.isIOS()) {
        var v = this.getIOSVersion();
        return v !== null && v < 14;
      }
      return false;
    }
  };

  global.DeviceDetect = DeviceDetect;

})(typeof window !== 'undefined' ? window : this);
