/* ==========================================================================
 * Rainbow Trial — js/install-handler.js
 * PWA インストール統合ハンドラー
 *
 * 全インストール UI は [data-install-btn] / [data-install-ui] 属性で管理。
 * DeviceDetect で OS を判定し、Android/PC は自動プロンプト、iOS は手順ガイド。
 *
 * 依存: window.DeviceDetect (js/device-detect.js)
 * 公開グローバル: window.InstallHandler
 * ========================================================================== */

(function (global) {
  'use strict';

  /* ---- ユーティリティ ---- */
  function removeById(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ---- iOS ガイドモーダル HTML ---- */
  function _buildIOSGuideHTML() {
    return (
      '<div class="install-modal">' +
        '<button class="install-modal__close" type="button" aria-label="閉じる">×</button>' +
        '<h2 class="install-modal__title">📲 ホーム画面に追加</h2>' +
        '<p class="install-modal__sub">かんたん3ステップで完了します</p>' +

        '<div class="ios-step">' +
          '<div class="ios-step__num">1</div>' +
          '<div class="ios-step__body">' +
            '<p>画面下の <strong>【共有ボタン ⬆】</strong> をタップ</p>' +
            '<div class="ios-step__hint">' +
              '<svg viewBox="0 0 40 40" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<circle cx="20" cy="20" r="20" fill="#007AFF"/>' +
                '<path d="M20 8l-5 5h3v8h4v-8h3l-5-5z M10 28v4h20v-4H10z" fill="white"/>' +
              '</svg>' +
              '<span>Safari 下部のボタン</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="ios-step">' +
          '<div class="ios-step__num">2</div>' +
          '<div class="ios-step__body">' +
            '<p>メニューから <strong>【ホーム画面に追加】</strong> を選択</p>' +
            '<div class="ios-step__menu-mock">' +
              '<span class="ios-step__menu-icon">➕</span>' +
              '<span>ホーム画面に追加</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="ios-step">' +
          '<div class="ios-step__num">3</div>' +
          '<div class="ios-step__body">' +
            '<p>右上の <strong>【追加】</strong> をタップして完了 ✅</p>' +
          '</div>' +
        '</div>' +

        '<button class="install-modal__done" type="button" id="_ios-done-btn">' +
          '✅ ホーム画面に追加しました' +
        '</button>' +
        '<p class="install-modal__note">追加後、ホーム画面のアイコンから起動してください</p>' +
      '</div>'
    );
  }

  /* ---- Android 手順ガイド ---- */
  function _buildAndroidGuideHTML() {
    return (
      '<div class="install-modal">' +
        '<button class="install-modal__close" type="button" aria-label="閉じる">×</button>' +
        '<h2 class="install-modal__title">📲 ホーム画面に追加</h2>' +
        '<ol class="install-modal__steps">' +
          '<li>Chrome 右上の <strong>「⋮」メニュー</strong> をタップ</li>' +
          '<li><strong>「ホーム画面に追加」</strong> を選択</li>' +
          '<li><strong>「追加」</strong> をタップして完了 ✅</li>' +
        '</ol>' +
        '<p class="install-modal__note">※ Chrome ブラウザからのみ追加できます</p>' +
        '<button class="install-modal__done" type="button" id="_android-done-btn">✅ 追加しました</button>' +
      '</div>'
    );
  }

  /* ---- PC 手順ガイド ---- */
  function _buildPCGuideHTML() {
    return (
      '<div class="install-modal">' +
        '<button class="install-modal__close" type="button" aria-label="閉じる">×</button>' +
        '<h2 class="install-modal__title">💻 アプリとしてインストール</h2>' +
        '<ol class="install-modal__steps">' +
          '<li>アドレスバー右端の <strong>「⊕」アイコン</strong> をクリック</li>' +
          '<li>「<strong>インストール</strong>」をクリックして完了 ✅</li>' +
        '</ol>' +
        '<p class="install-modal__note">※ Chrome / Edge からのみインストールできます</p>' +
        '<button class="install-modal__done" type="button" id="_pc-done-btn">✅ インストールしました</button>' +
      '</div>'
    );
  }

  /* ---- 成功モーダル + 紙吹雪 ---- */
  function _buildSuccessHTML() {
    return (
      '<div class="install-modal install-modal--success">' +
        '<div class="install-modal__success-icon">🎉</div>' +
        '<h2 class="install-modal__title">インストール完了!</h2>' +
        '<p class="install-modal__sub">Rainbow Trial がアプリとして使えるようになりました🌈</p>' +
        '<ul class="install-modal__benefits">' +
          '<li>✓ 通知でシグナルを見逃さない</li>' +
          '<li>✓ 1タップで起動</li>' +
          '<li>✓ オフラインでも使える</li>' +
        '</ul>' +
        '<button class="install-modal__done" type="button" id="_success-close-btn">続ける</button>' +
      '</div>'
    );
  }

  /* ---- 紙吹雪 ---- */
  function _launchConfetti() {
    var container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    var colors = ['#FF6B6B','#FFD93D','#6BCB77','#4DABF7','#A855F7','#FF9F43'];
    for (var i = 0; i < 60; i++) {
      (function () {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.cssText = [
          'left:' + (Math.random() * 100) + 'vw',
          'background:' + colors[Math.floor(Math.random() * colors.length)],
          'width:'  + (6 + Math.random() * 8) + 'px',
          'height:' + (6 + Math.random() * 8) + 'px',
          'animation-delay:' + (Math.random() * 1.2) + 's',
          'animation-duration:' + (2 + Math.random() * 2) + 's',
          'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px')
        ].join(';');
        container.appendChild(piece);
      })();
    }
    setTimeout(function () {
      if (container.parentNode) container.parentNode.removeChild(container);
    }, 4500);
  }

  /* ---- ガイドオーバーレイ共通表示 ---- */
  function _showOverlay(id, innerHTML, onDoneId, onDoneCallback) {
    removeById(id);
    var overlay = document.createElement('div');
    overlay.id        = id;
    overlay.className = 'install-modal-overlay';
    overlay.innerHTML = innerHTML;
    document.body.appendChild(overlay);

    requestAnimationFrame(function () { overlay.classList.add('is-open'); });

    // 閉じるボタン
    var closeBtn = overlay.querySelector('.install-modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        overlay.classList.remove('is-open');
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 280);
      });
    }

    // 完了ボタン
    var doneBtn = overlay.querySelector('#' + onDoneId);
    if (doneBtn) {
      doneBtn.addEventListener('click', function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onDoneCallback) onDoneCallback();
      });
    }

    // 背景クリックで閉じる
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.classList.remove('is-open');
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 280);
      }
    });
  }

  /* ---- ボタン文言を更新 ---- */
  function _updateButtonLabels(canAutoInstall) {
    var label = canAutoInstall ? '📲 1タップでインストール' : '📲 ホーム画面に追加する';
    document.querySelectorAll('[data-install-btn]').forEach(function (el) {
      el.textContent = label;
    });
  }

  /* ========================================================================
   * 公開 API
   * ======================================================================== */
  var InstallHandler = {
    deferredPrompt: null,
    isInstalled: false,
    _initDone: false,

    init: function () {
      var self = this;

      // インストール済みチェック
      var dd = global.DeviceDetect || {};
      if ((dd.isStandalone && dd.isStandalone()) ||
          localStorage.getItem('user_installed') === 'true') {
        self.isInstalled = true;
        self._hideAllInstallUI();
        return;
      }

      // <head> 早期キャプチャ済みプロンプトを引き継ぐ
      if (global._deferredInstallPrompt) {
        self.deferredPrompt = global._deferredInstallPrompt;
        global._deferredInstallPrompt = null;
        _updateButtonLabels(true);
      }

      if (!this._initDone) {
        this._initDone = true;

        global.addEventListener('beforeinstallprompt', function (e) {
          e.preventDefault();
          self.deferredPrompt = e;
          _updateButtonLabels(true);
          console.log('[Install] beforeinstallprompt received');
        });

        global.addEventListener('appinstalled', function () {
          self.markInstalled();
        });
      }

      // 初期ボタン表示を更新
      _updateButtonLabels(!!self.deferredPrompt);
    },

    /** 全インストールボタンから呼ばれるメイン関数 */
    install: function () {
      var self = this;
      var dd = global.DeviceDetect || {};

      if (self.isInstalled) {
        alert('すでにアプリとしてインストール済みです🌈\nホーム画面のアイコンから起動してください。');
        return;
      }

      // iOS
      if (dd.isIOS && dd.isIOS()) {
        if (dd.isIOSSafari && !dd.isIOSSafari()) {
          alert('iPhone では Safari ブラウザでアクセスしてください。\n他のブラウザではホーム画面に追加できません。');
          return;
        }
        self.showIOSGuide();
        return;
      }

      // Android / PC: 自動プロンプト
      if (self.deferredPrompt) {
        var p = self.deferredPrompt;
        self.deferredPrompt = null;
        p.prompt();
        p.userChoice.then(function (result) {
          if (result.outcome === 'accepted') {
            self.markInstalled();
          } else {
            _updateButtonLabels(false);
          }
        }).catch(function () { _updateButtonLabels(false); });
        return;
      }

      // フォールバック: 手動ガイド
      if (dd.isAndroid && dd.isAndroid()) {
        self.showAndroidGuide();
      } else {
        self.showPCGuide();
      }
    },

    /** インストール完了処理(iOS 自己申告 / Android appinstalled 両方から呼ばれる) */
    markInstalled: function () {
      this.isInstalled = true;
      this.deferredPrompt = null;
      localStorage.setItem('user_installed', 'true');
      this._hideAllInstallUI();
      this.showSuccessModal();
      if (global.SoundSystem) global.SoundSystem.play('achievement');
    },

    /** iOS ガイドの「完了しました」ボタンから呼ばれる */
    markIOSInstalled: function () {
      this.markInstalled();
    },

    _hideAllInstallUI: function () {
      document.querySelectorAll('[data-install-ui], .install-banner, .install-section, #install-banner').forEach(function (el) {
        el.style.display = 'none';
      });
    },

    showIOSGuide: function () {
      var self = this;
      _showOverlay('ios-install-guide', _buildIOSGuideHTML(), '_ios-done-btn', function () {
        self.markIOSInstalled();
      });
    },

    showAndroidGuide: function () {
      var self = this;
      _showOverlay('android-install-guide', _buildAndroidGuideHTML(), '_android-done-btn', function () {
        self.markInstalled();
      });
    },

    showPCGuide: function () {
      var self = this;
      _showOverlay('pc-install-guide', _buildPCGuideHTML(), '_pc-done-btn', function () {
        self.markInstalled();
      });
    },

    showSuccessModal: function () {
      removeById('install-success-overlay');
      var overlay = document.createElement('div');
      overlay.id        = 'install-success-overlay';
      overlay.className = 'install-modal-overlay';
      overlay.innerHTML = _buildSuccessHTML();
      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('is-open'); });

      _launchConfetti();

      var btn = overlay.querySelector('#_success-close-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });
      }
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
    }
  };

  global.InstallHandler = InstallHandler;

  // 旧 API 互換
  global.InstallModal = {
    setDeferredPrompt: function (e) { InstallHandler.deferredPrompt = e; },
    show: function () { InstallHandler.install(); },
    hide: function () {}
  };

})(typeof window !== 'undefined' ? window : this);
