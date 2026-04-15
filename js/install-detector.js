/* ==========================================================================
 * Rainbow Trial — js/install-detector.js
 * PWA インストール状態の検知
 * 公開グローバル: window.InstallDetector
 * ========================================================================== */

(function (global) {
  'use strict';

  var INSTALLED_KEY = 'user_installed';

  var InstallDetector = {
    /** スタンドアローン(インストール済みアプリ)として起動中か */
    isStandalone: function () {
      return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
             global.navigator.standalone === true ||
             (document.referrer && document.referrer.includes('android-app://'));
    },

    /** インストール済みと判断できるか */
    isInstalled: function () {
      // standalone 起動中かフラグが立っている場合のみ true
      if (this.isStandalone()) return true;
      return localStorage.getItem(INSTALLED_KEY) === 'true';
    },

    /** インストール完了イベントを購読してフラグを立てる */
    onInstallSuccess: function (callback) {
      global.addEventListener('appinstalled', function () {
        localStorage.setItem(INSTALLED_KEY, 'true');
        if (typeof callback === 'function') callback();
      });
    }
  };

  global.InstallDetector = InstallDetector;

})(typeof window !== 'undefined' ? window : this);
