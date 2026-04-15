/* ==========================================================================
 * Rainbow Trial — js/home-install.js
 * ホーム画面のインストール促進セクション
 *
 * renderHTML()  : セクションの HTML 文字列を返す(app.js の renderHome から呼ぶ)
 * init()        : イベントバインド + 表示/非表示判定(_bindHomeEvents から呼ぶ)
 * dismiss()     : 「今は表示しない」ボタンから呼ぶ
 *
 * 依存: window.DeviceDetect, window.InstallHandler
 * 公開グローバル: window.HomeInstallSection
 * ========================================================================== */

(function (global) {
  'use strict';

  var DISMISS_KEY      = 'home-install-section-dismissed';
  var DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7日間

  var HomeInstallSection = {

    /* --- 表示判定 ---- */

    isInstalled: function () {
      var dd = global.DeviceDetect;
      if (dd && dd.isStandalone && dd.isStandalone()) return true;
      return localStorage.getItem('user_installed') === 'true';
    },

    isDismissed: function () {
      var at = localStorage.getItem(DISMISS_KEY);
      if (!at) return false;
      return (Date.now() - parseInt(at, 10)) < DISMISS_DURATION;
    },

    shouldShow: function () {
      return !this.isInstalled() && !this.isDismissed();
    },

    /* --- HTML 生成(renderHome から呼ばれる) ---- */

    renderHTML: function () {
      // インストール済み(スタンドアロン or フラグ)の場合は完全に非表示
      if (this.isInstalled()) return '';

      // ボタン文言をデバイス/プロンプト状態に応じて決定
      var btnLabel = '📲 ホーム画面に追加する';
      var dd = global.DeviceDetect;
      var ih = global.InstallHandler;
      if (dd && dd.isIOS && dd.isIOS()) {
        btnLabel = '📲 ホーム画面への追加方法';
      } else if (ih && ih.deferredPrompt) {
        btnLabel = '📲 1タップでインストール';
      }

      return (
        '<section class="home-install-section" id="home-install-section" data-install-ui>' +
          '<div class="home-install-header">' +
            '<span class="home-install-icon">📲</span>' +
            '<div class="home-install-title">' +
              '<h3>アプリとして使う</h3>' +
              '<p class="home-install-subtitle">ホーム画面に追加してもっと便利に</p>' +
            '</div>' +
          '</div>' +
          '<div class="home-install-benefits">' +
            '<div class="home-benefit-row">' +
              '<span class="benefit-check">✓</span>' +
              '<span>シグナル受信を通知でお知らせ</span>' +
            '</div>' +
            '<div class="home-benefit-row">' +
              '<span class="benefit-check">✓</span>' +
              '<span>ホーム画面から1タップで起動</span>' +
            '</div>' +
            '<div class="home-benefit-row">' +
              '<span class="benefit-check">✓</span>' +
              '<span>オフラインでも使える</span>' +
            '</div>' +
          '</div>' +
          '<button class="home-install-btn-primary" data-install-btn id="home-install-main-btn" type="button">' +
            btnLabel +
          '</button>' +
          '<button class="home-install-btn-skip" id="home-install-skip-btn" type="button">' +
            '今は表示しない' +
          '</button>' +
        '</section>'
      );
    },

    /* --- イベントバインド(_bindHomeEvents から呼ばれる) ---- */

    init: function () {
      var self    = this;
      var section = document.getElementById('home-install-section');
      if (!section) return;

      // 一時的に非表示にしている場合は非表示にする(DOM には存在する)
      if (this.isDismissed()) {
        section.style.display = 'none';
        return;
      }

      section.style.display = '';

      var mainBtn = document.getElementById('home-install-main-btn');
      if (mainBtn) {
        mainBtn.addEventListener('click', function () {
          if (global.InstallHandler) global.InstallHandler.install();
        });
      }

      var skipBtn = document.getElementById('home-install-skip-btn');
      if (skipBtn) {
        skipBtn.addEventListener('click', function () {
          self.dismiss();
        });
      }
    },

    /* --- 非表示処理 ---- */

    dismiss: function () {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      var section = document.getElementById('home-install-section');
      if (!section) return;
      section.style.transition = 'opacity 0.3s ease, max-height 0.4s ease';
      section.style.opacity    = '0';
      section.style.maxHeight  = '0';
      section.style.overflow   = 'hidden';
      setTimeout(function () {
        if (section.parentNode) section.style.display = 'none';
      }, 400);
    }
  };

  global.HomeInstallSection = HomeInstallSection;

})(typeof window !== 'undefined' ? window : this);
