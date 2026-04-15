/* ==========================================================================
 * Rainbow Trial — js/app.js
 * メインアプリ。全モジュールの統合と画面遷移を司る。
 *
 * 画面(screen):
 *   'main'     — タブ構成(ホーム / シグナル / 履歴)
 *   'detail'   — シグナル詳細 + チャート + 判定
 *   'position' — ポジション保有中(ライブ)
 *   'result'   — 結果(勝ち/負け/見送り)
 *
 * 依存モジュール:
 *   TrialStore / GameState / ScenarioUtil / Notifications / Signals / Trade
 *   Judgment / RainbowChart
 *
 * 公開: window.App
 * ========================================================================== */

(function (global) {
  'use strict';

  const MAIN_TABS = ['home', 'signals', 'history', 'stats', 'achievements'];
  const HISTORY_FILTERS = [
    { key: 'all',    label: '全て' },
    { key: 'usdjpy', label: 'USDJPY' },
    { key: 'btcusd', label: 'BTCUSD' },
    { key: 'win',    label: '勝ち' },
    { key: 'lose',   label: '負け' },
    { key: 'skip',   label: '見送り' }
  ];

  const App = {
    state: {
      screen: 'main',       // 'main' | 'detail' | 'position' | 'result'
      tab:    'home',       // 'home' | 'signals' | 'history'
      detailSignalId: null,
      resultContext:  null, // { signal, trade, pnl, skipped }
      historyFilter:  'all',
      uiTickTimer:    null
    },
    chart: null,

    /* ======================================================================
     * 初期化
     * ====================================================================== */
    init: function () {
      if (!global.TrialStore || !global.TrialStore.isInitialized()) {
        global.location.replace('welcome.html');
        return;
      }

      global.Notifications.init();
      global.Signals.init();
      global.Trade.init();

      // 起動回数 +1(PWA インストール促進の判定に使う)
      this._bumpLaunchCount();
      // baselines JSON は非同期で取得(失敗しても致命ではない)
      this._loadPriceBaselines();
      // beforeinstallprompt を捕捉(Android Chrome 向け)
      this._captureInstallPrompt();

      this.hookNotifications();
      this.bindGlobalEvents();
      this.subscribeEvents();
      this.renderAll();
      this.startUiTick();

      if (global.Trade.getCurrentPosition()) {
        // 保有中なら直接ポジション画面へ
        this.showScreen('position');
      } else {
        this.showScreen('main');
      }

      // 起動直後の最後アクティブ更新
      global.TrialStore.updateLastActive();

      // プロモバナーの出し入れ判定(非同期で遅延実行)
      const self = this;
      setTimeout(function () {
        self.maybeShowNotifyBanner();
        self.maybeShowInstallBanner();
      }, 2000);
    },

    hookNotifications: function () {
      const self = this;
      global.Notifications.setViewHandler(function (id) { self.openSignalDetail(id); });
      global.Notifications.setDismissHandler(function (id) { global.Signals.markDismissedBar(id); });
      global.Notifications.setSummaryHandler(function () {
        // 通知バーの「他 N 件」→ シグナルタブを開く
        self.setTab('signals');
      });
    },

    bindGlobalEvents: function () {
      const self = this;
      // タブ
      document.querySelectorAll('.tabbar__btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.setTab(btn.getAttribute('data-tab'));
        });
      });

      // 学習モーダル用のクローズ
      const learnOverlay = document.getElementById('overlay-learning');
      if (learnOverlay) {
        learnOverlay.addEventListener('click', function (e) {
          if (e.target === learnOverlay || e.target.classList.contains('overlay-learning__close')) {
            learnOverlay.classList.remove('is-open');
          }
        });
      }

      // 設定 / デバッグの汎用クローズ
      document.querySelectorAll('.overlay [data-close]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const key = btn.getAttribute('data-close');
          const el  = document.getElementById('overlay-' + key);
          if (el) el.classList.remove('is-open');
        });
      });
      ['overlay-settings', 'overlay-debug'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', function (e) {
          if (e.target === el) el.classList.remove('is-open');
        });
      });

      // ヘッダーの ⚙️ 設定ボタン
      const settingsBtn = document.getElementById('header-settings');
      if (settingsBtn) settingsBtn.addEventListener('click', function () { self.openSettings(); });

      // 通知許可バナー
      const notifBar = document.getElementById('promo-notify');
      if (notifBar) {
        notifBar.addEventListener('click', function (e) {
          const act = e.target && e.target.getAttribute('data-act');
          if (act === 'allow')  self.handleAllowNotifications();
          if (act === 'later')  self.dismissNotifyBanner();
        });
      }

      // インストールバナー初期化
      if (global.InstallBanner) global.InstallBanner.init();

      // Service Worker からの通知クリック
      if (global.Notifications && global.Notifications.bindServiceWorkerMessages) {
        global.Notifications.bindServiceWorkerMessages(function (signalId) {
          self.openSignalDetail(signalId);
        });
      }

      // Konami Code(デバッグメニュー)
      this._bindKonami();
    },

    _bindKonami: function () {
      const self = this;
      const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
      let idx = 0;
      document.addEventListener('keydown', function (e) {
        const key = e.code || e.key;
        if (key === seq[idx]) { idx++; if (idx === seq.length) { idx = 0; self.openDebugMenu(); } }
        else { idx = (key === seq[0]) ? 1 : 0; }
      });
      // モバイル用: ヘッダーロゴを 5 回連タップで開く(touchend で 300ms 遅延を回避)
      let tapCount = 0, tapTimer = null;
      const logo = document.querySelector('.app-header__logo');
      if (logo) {
        function _onLogoTap(e) {
          if (e.type === 'touchend') e.preventDefault();
          tapCount++;
          if (tapTimer) clearTimeout(tapTimer);
          tapTimer = setTimeout(function () { tapCount = 0; }, 1500);
          if (tapCount >= 5) { tapCount = 0; self.openDebugMenu(); }
        }
        logo.addEventListener('touchend', _onLogoTap, { passive: false });
        logo.addEventListener('click',    _onLogoTap);
      }
    },

    /* ======================================================================
     * 設定画面
     * ====================================================================== */
    _bumpLaunchCount: function () {
      try {
        const st = global.TrialStore.getState();
        const s  = st.settings || {};
        const nx = Object.assign({}, s, { launchCount: (s.launchCount || 0) + 1 });
        global.TrialStore.setState({ settings: nx });
      } catch (e) {}
    },

    _loadPriceBaselines: function () {
      if (typeof fetch === 'undefined') return;
      fetch('data/price-baselines.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d) global.PRICE_BASELINES = d; })
        .catch(function () {});
    },

    _captureInstallPrompt: function () {
      global.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        if (global.InstallModal) global.InstallModal.setDeferredPrompt(e);
      });
    },

    /* ======================================================================
     * プロモバナー(通知許可 / インストール)
     * ====================================================================== */
    maybeShowNotifyBanner: function () {
      const N = global.Notifications;
      if (!N || !N.getPermission) return;
      if (N.getPermission() !== 'default') return;
      const st = global.TrialStore.getState();
      const lc = (st.settings && st.settings.launchCount) || 0;
      const dismissed = st.settings && st.settings.notifyBannerDismissedAt;
      if (dismissed && Date.now() - new Date(dismissed).getTime() < 3 * 86400 * 1000) return;
      const elapsedMin = global.TrialStore.getElapsedMinutes();
      if (elapsedMin < 60 && lc < 3) return;
      const el = document.getElementById('promo-notify');
      if (el) el.classList.remove('is-hidden');
    },

    dismissNotifyBanner: function () {
      const el = document.getElementById('promo-notify');
      if (el) el.classList.add('is-hidden');
      const st = global.TrialStore.getState();
      const s  = Object.assign({}, st.settings || {}, { notifyBannerDismissedAt: new Date().toISOString() });
      global.TrialStore.setState({ settings: s });
    },

    handleAllowNotifications: async function () {
      const N = global.Notifications;
      if (!N) return;
      const p = await N.requestPermission();
      if (p === 'granted') N.updateNotificationSettings({ enabled: true });
      this.dismissNotifyBanner();
    },


    /* ======================================================================
     * デバッグメニュー (Konami Code または ロゴ 5 連タップで開く)
     * ====================================================================== */
    openDebugMenu: function () {
      const el = document.getElementById('overlay-debug');
      if (!el) return;
      this.renderDebugMenu();
      el.classList.add('is-open');
    },

    renderDebugMenu: function () {
      const body = document.getElementById('debug-body');
      if (!body) return;
      const self = this;
      const st = global.TrialStore.getState();
      const snap = global.GameState.snapshot();
      const baselines = global.PRICE_BASELINES || {};
      const swSupported = 'serviceWorker' in navigator;

      function act(id, label) {
        return '<div class="settings-row"><span class="settings-row__label">' + label + '</span>' +
          '<button class="promo-bar__btn promo-bar__btn--primary" type="button" data-debug="' + id + '">実行</button></div>';
      }

      body.innerHTML =
        '<div class="settings-section">' +
          '<div class="settings-section__title">進行</div>' +
          act('next-signal',    '次のシグナルを今すぐ受信') +
          act('day-plus',       'Day を進める (+1)') +
          act('day-minus',      'Day を戻す (-1)') +
          act('show-master-msg','現在の Day のマスターメッセージを表示') +
          act('show-final',     'Day 7 最終画面を表示') +
        '</div>' +
        '<div class="settings-section">' +
          '<div class="settings-section__title">通知 / PWA</div>' +
          act('test-notif',  'テスト通知を発火') +
          act('sw-check',    'Service Worker 状況確認') +
          act('pwa-check',   'PWA インストール状況確認') +
        '</div>' +
        '<div class="settings-section">' +
          '<div class="settings-section__title">現在値</div>' +
          '<div class="settings-info">' +
            'Day: <strong>' + snap.displayDay + ' / 7</strong><br>' +
            '経過: <strong>' + snap.elapsedMinutes + '分</strong>' +
            (snap.testMode ? ' (テストモード)' : '') + '<br>' +
            'USDJPY: <strong>' + (baselines.USDJPY ? baselines.USDJPY.current : '—') + '</strong>  ' +
            'BTCUSD: <strong>' + (baselines.BTCUSD ? baselines.BTCUSD.current : '—') + '</strong><br>' +
            '残トレード: <strong>' + (st.trades || []).length + '</strong>件<br>' +
            'SW 対応: <strong>' + (swSupported ? 'yes' : 'no') + '</strong>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<div class="settings-section__title">破壊的操作</div>' +
          '<button class="danger-btn" type="button" data-debug="reset-all">全データリセット</button>' +
        '</div>';

      body.querySelectorAll('[data-debug]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.handleDebugAction(btn.getAttribute('data-debug'));
        });
      });
    },

    handleDebugAction: function (action) {
      const self = this;
      switch (action) {
        case 'next-signal': {
          const up = global.GameState.getNextUpcomingSignal();
          if (!up) { alert('これ以上シグナルはありません'); return; }
          const mins = up.minutesUntil;
          global.TrialStore.shiftStartDate(-mins);
          global.Signals.processScheduledSignals('realtime');
          self.renderCurrentScreen();
          self.renderDebugMenu();
          break;
        }
        case 'day-plus': {
          const len = global.GameState.snapshot().dayLengthMinutes;
          global.TrialStore.shiftStartDate(-len);
          self.renderAll();
          self.renderDebugMenu();
          break;
        }
        case 'day-minus': {
          const len = global.GameState.snapshot().dayLengthMinutes;
          global.TrialStore.shiftStartDate(len);
          self.renderAll();
          self.renderDebugMenu();
          break;
        }
        case 'test-notif': {
          const N = global.Notifications;
          if (!N) return;
          if (N.getPermission() !== 'granted') {
            N.requestPermission().then(function (p) {
              if (p === 'granted') self.handleDebugAction('test-notif');
            });
            return;
          }
          N.pushBrowserNotification({
            id: 9999, pair: 'USDJPY', direction: 'long', rarity: 'epic'
          });
          break;
        }
        case 'sw-check': {
          if (!('serviceWorker' in navigator)) { alert('Service Worker 非対応'); return; }
          navigator.serviceWorker.getRegistration().then(function (reg) {
            alert(reg ? 'SW 登録済み\nscope: ' + reg.scope : 'SW 未登録');
          });
          break;
        }
        case 'pwa-check': {
          const standalone = (matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
          alert('standalone: ' + standalone + '\ninstall prompt: ' + (self._installPromptEvent ? 'available' : 'none'));
          break;
        }
        case 'reset-all': {
          if (!confirm('全データを削除します。よろしいですか?')) return;
          global.TrialStore.resetAll();
          location.replace('welcome.html');
          break;
        }
        case 'show-master-msg': {
          var snap2 = global.GameState.snapshot();
          var d2 = snap2.displayDay;
          if (global.MasterMessage && global.getMessageForDay) {
            var m = global.getMessageForDay(d2);
            if (m) { global.MasterMessage.showModal(m); }
            else { alert('現在の Day (' + d2 + ') にはマスターメッセージがありません'); }
          }
          break;
        }
        case 'show-final': {
          if (global.FinalScreen) global.FinalScreen.show();
          break;
        }
      }
    },

    openSettings: function () {
      const el = document.getElementById('overlay-settings');
      if (!el) return;
      this.renderSettings();
      el.classList.add('is-open');
    },

    renderSettings: function () {
      const body = document.getElementById('settings-body');
      if (!body) return;
      const N = global.Notifications;
      const perm = N && N.getPermission ? N.getPermission() : 'unsupported';
      const cfg  = N && N.getNotificationSettings ? N.getNotificationSettings() : { enabled: false, rarities: {} };
      const state = global.TrialStore.getState();
      const baselines = (global.PRICE_BASELINES || {});
      const lastUpdated = (baselines.lastUpdated || '').split('T')[0] || '—';
      const soundCfg = (state.settings && state.settings.sound) || { enabled: true, volume: 0.8, raritySounds: {} };

      function row(label, control, desc) {
        return '<div class="settings-row"><div><div class="settings-row__label">' + label + '</div>' +
          (desc ? '<div class="settings-row__desc">' + desc + '</div>' : '') + '</div>' + control + '</div>';
      }
      function toggle(id, checked) {
        return '<label class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="switch__slider"></span></label>';
      }
      function rarityRow(key, label, color) {
        const on = cfg.rarities[key] !== false;
        return '<div class="settings-row"><span class="rarity-pill rarity-pill--' + key + '">' + label + '</span>' +
          toggle('r-' + key, on) + '</div>';
      }
      function soundRarityRow(key, label) {
        const on = soundCfg.raritySounds ? soundCfg.raritySounds[key] !== false : true;
        return '<div class="settings-row"><span class="rarity-pill rarity-pill--' + key + '">' + label + '</span>' +
          toggle('sr-' + key, on) + '</div>';
      }

      const permText = perm === 'granted' ? '✅ 許可済み'
                     : perm === 'denied'  ? '❌ ブラウザでブロックされています'
                     : perm === 'unsupported' ? 'この環境では利用できません'
                     : '未許可(ONにすると許可を求めます)';

      body.innerHTML =
        '<div class="settings-section">' +
          '<div class="settings-section__title">🔔 ブラウザ通知</div>' +
          row('通知を受け取る', toggle('notif-enabled', cfg.enabled), permText) +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-section__title">レアリティ別の通知</div>' +
          '<div class="rarity-grid">' +
            rarityRow('normal',    'NORMAL') +
            rarityRow('good',      'GOOD') +
            rarityRow('rare',      'RARE') +
            rarityRow('epic',      'EPIC') +
            rarityRow('legendary', 'LEGENDARY') +
          '</div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-section__title">📱 ホーム画面に追加</div>' +
          '<div class="settings-info">' +
          'アプリのように使うには、ブラウザメニューから「ホーム画面に追加」を選択してください。' +
          '</div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-section__title">🔄 価格データ</div>' +
          '<div class="settings-info">最終更新: <strong>' + lastUpdated + '</strong></div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-section__title">🗑️ データリセット</div>' +
          '<button class="danger-btn" id="btn-reset-all" type="button">全データを削除</button>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-section__title">🔊 効果音</div>' +
          row('効果音を再生する', toggle('sound-enabled', soundCfg.enabled)) +
          row('音量', '<input type="range" id="sound-volume" min="0" max="100" value="' + Math.round((soundCfg.volume || 0.8) * 100) + '" style="width:120px">') +
          '<div class="settings-section__title" style="margin-top:12px;font-size:0.8rem">レアリティ別サウンド</div>' +
          '<div class="rarity-grid">' +
            soundRarityRow('normal',    'NORMAL') +
            soundRarityRow('good',      'GOOD') +
            soundRarityRow('rare',      'RARE') +
            soundRarityRow('epic',      'EPIC') +
            soundRarityRow('legendary', 'LEGENDARY') +
          '</div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<div class="settings-section__title">ℹ️ アプリ情報</div>' +
          '<div class="settings-info">バージョン: <strong>5.1.0</strong></div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<button id="settings-install-btn" type="button" style="' +
            'width:100%;padding:12px;border-radius:10px;border:none;cursor:pointer;' +
            'background:linear-gradient(135deg,#9775FA,#4DABF7);' +
            'color:#fff;font-size:0.95rem;font-weight:700;' +
          '">📲 ホーム画面に追加する</button>' +
        '</div>' +

        '<div class="settings-section">' +
          '<a href="https://lin.ee/xGQTHY1" target="_blank" rel="noopener" class="settings-line-link">' +
            'ひかりに相談する' +
          '</a>' +
        '</div>' +

        '<div class="settings-section" style="display:flex;gap:12px;font-size:0.75rem;justify-content:center;opacity:0.4">' +
          '<a href="terms.html" target="_blank" style="color:inherit">利用規約</a>' +
          '<span>|</span>' +
          '<a href="privacy.html" target="_blank" style="color:inherit">プライバシーポリシー</a>' +
        '</div>';

      const self = this;
      // インストールボタン
      const instBtn = document.getElementById('settings-install-btn');
      if (instBtn) {
        instBtn.addEventListener('click', function () {
          document.getElementById('overlay-settings').classList.remove('is-open');
          setTimeout(function () {
            if (global.InstallModal) global.InstallModal.show();
          }, 200);
        });
      }
      // 通知 ON/OFF
      const enBox = document.getElementById('notif-enabled');
      if (enBox) enBox.addEventListener('change', async function () {
        if (enBox.checked && perm !== 'granted') {
          const p = await N.requestPermission();
          if (p !== 'granted') { enBox.checked = false; self.renderSettings(); return; }
        }
        N.updateNotificationSettings({ enabled: enBox.checked });
        self.renderSettings();
      });
      // レアリティ
      ['normal','good','rare','epic','legendary'].forEach(function (key) {
        const box = document.getElementById('r-' + key);
        if (!box) return;
        box.addEventListener('change', function () {
          const cur = N.getNotificationSettings();
          const next = Object.assign({}, cur.rarities, { [key]: box.checked });
          N.updateNotificationSettings({ rarities: next });
        });
      });
      // 効果音 ON/OFF
      const soundBox = document.getElementById('sound-enabled');
      if (soundBox && global.SoundSystem) {
        soundBox.addEventListener('change', function () {
          global.SoundSystem.setEnabled(soundBox.checked);
        });
      }
      // 音量スライダー
      const volSlider = document.getElementById('sound-volume');
      if (volSlider && global.SoundSystem) {
        volSlider.addEventListener('input', function () {
          global.SoundSystem.setVolume(parseInt(volSlider.value, 10) / 100);
        });
      }
      // レアリティ別サウンド
      ['normal','good','rare','epic','legendary'].forEach(function (key) {
        const srBox = document.getElementById('sr-' + key);
        if (!srBox || !global.SoundSystem) return;
        srBox.addEventListener('change', function () {
          global.SoundSystem.setRaritySoundEnabled(key, srBox.checked);
        });
      });

      // リセット
      const rst = document.getElementById('btn-reset-all');
      if (rst) rst.addEventListener('click', function () {
        if (confirm('本当に全データを削除しますか?この操作は取り消せません。')) {
          try {
            if (global.TrialStore && global.TrialStore.resetAll) global.TrialStore.resetAll();
            else localStorage.removeItem('rainbow-trial-v1');
          } catch (e) {}
          location.replace('welcome.html');
        }
      });
    },

    subscribeEvents: function () {
      const self = this;
      global.GameState.subscribe(function (evt) { self.onGameEvent(evt); });
      global.Trade.subscribe(function (evt) { self.onTradeEvent(evt); });
    },

    startUiTick: function () {
      const self = this;
      if (this.state.uiTickTimer) return;
      this.state.uiTickTimer = setInterval(function () {
        self.tickSoftUpdate();
      }, 1000);
    },

    tickSoftUpdate: function () {
      this.updateHeader();
      if (this.state.screen === 'main' && this.state.tab === 'home') {
        this.updateHomeNextSignal();
        this.updateHomePosition();
      }
    },

    /* ======================================================================
     * イベントハンドラ
     * ====================================================================== */
    onGameEvent: function (evt) {
      switch (evt.type) {
        case 'signal_delivered':
        case 'signal_viewed':
        case 'signal_entered':
        case 'signal_skipped':
        case 'signal_completed':
        case 'account_changed':
        case 'trade_recorded':
          this.renderCurrentScreen();
          this.updateHeader();
          break;
      }
    },

    onTradeEvent: function (evt) {
      switch (evt.type) {
        case 'position_opened':
          this.showScreen('position');
          this.renderPosition();
          break;
        case 'price_tick':
          this.updatePositionLive(evt);
          break;
        case 'mode_switched':
          this.renderPosition();
          break;
        case 'position_landed':
          this.handlePositionLanded(evt);
          break;
        case 'position_closed':
          this.state.resultContext = {
            signal:  evt.signal,
            trade:   evt.trade,
            pnl:     evt.pnl,
            skipped: false
          };
          this.showScreen('result');
          this.renderResult();
          break;
        case 'skip_recorded':
          this.state.resultContext = {
            signal:  evt.signal,
            trade:   evt.trade,
            pnl:     0,
            skipped: true
          };
          this.showScreen('result');
          this.renderResult();
          break;
      }
    },

    /**
     * progress=1 到達時のビジュアル反応:
     *  - 操作ボタンを一時的に無効化
     *  - チャート上にライブ価格を最終値で固定
     *  - 「TP HIT!」/「SL HIT」のフラッシュバッジ表示
     */
    handlePositionLanded: function (evt) {
      if (this.state.screen !== 'position') return;
      const root = document.getElementById('screen-position');
      if (!root) return;

      // 操作ボタン無効化
      root.querySelectorAll('.live-actions .btn').forEach(function (b) {
        b.disabled = true;
        b.classList.add('is-disabled');
      });

      // ライブ価格を最終値に固定反映
      const priceEl = root.querySelector('[data-role="live-price"]');
      const signal  = evt.signal;
      if (priceEl && signal) priceEl.textContent = evt.price.toFixed(signal.decimals);
      if (this.chart) this.chart.setLivePrice(evt.price);

      // 結果フラッシュバッジ(フェード消滅は result 遷移で)
      let flash = document.getElementById('pos-flash');
      if (!flash) {
        flash = document.createElement('div');
        flash.id = 'pos-flash';
        flash.className = 'pos-flash';
        root.appendChild(flash);
      }
      const isWin = (evt.result === 'tp_hit');
      flash.classList.remove('pos-flash--lose', 'pos-flash--win');
      flash.classList.add(isWin ? 'pos-flash--win' : 'pos-flash--lose');
      flash.textContent = isWin ? '🏆 TP HIT!' : '📉 SL HIT';
      flash.classList.add('is-visible');
    },

    /* ======================================================================
     * 画面遷移
     * ====================================================================== */
    showScreen: function (name) {
      this.state.screen = name;
      document.querySelectorAll('.screen').forEach(function (el) {
        el.classList.toggle('is-active', el.id === 'screen-' + name);
      });
      const tabbar = document.getElementById('tabbar');
      if (tabbar) tabbar.classList.toggle('hidden', name !== 'main');
      global.scrollTo(0, 0);

      // チャートインスタンスのクリーンアップ(画面離脱時)
      if (name !== 'detail' && name !== 'position' && this.chart) {
        this.chart.destroy();
        this.chart = null;
      }
    },

    setTab: function (tab) {
      if (MAIN_TABS.indexOf(tab) < 0) return;
      this.state.tab = tab;
      document.querySelectorAll('.tabbar__btn').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tab);
      });
      document.querySelectorAll('.panel').forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-panel') === tab);
      });
      this.showScreen('main');
      this.renderTab();
    },

    openSignalDetail: function (signalId) {
      const sig = global.ScenarioUtil.getById(signalId);
      if (!sig) return;
      this.state.detailSignalId = signalId;
      global.Signals.markViewed(signalId);
      this.showScreen('detail');
      this.renderDetail();
    },

    goHome: function () {
      this.state.tab = 'home';
      this.showScreen('main');
      document.querySelectorAll('.tabbar__btn').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-tab') === 'home');
      });
      document.querySelectorAll('.panel').forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-panel') === 'home');
      });
      this.renderHome();
    },

    /* ======================================================================
     * 全体再描画
     * ====================================================================== */
    renderAll: function () {
      this.updateHeader();
      this.renderHome();
      this.renderSignals();
      this.renderHistory();
      // stats / achievements はタブ切替時に描画するため省略
    },

    renderCurrentScreen: function () {
      switch (this.state.screen) {
        case 'main':     this.renderTab(); break;
        case 'detail':   this.renderDetail(); break;
        case 'position': this.renderPosition(); break;
        case 'result':   this.renderResult(); break;
      }
    },

    renderTab: function () {
      switch (this.state.tab) {
        case 'home':         this.renderHome(); break;
        case 'signals':      this.renderSignals(); break;
        case 'history':      this.renderHistory(); break;
        case 'stats':        this.renderStats(); break;
        case 'achievements': this.renderAchievements(); break;
      }
    },

    /* ======================================================================
     * ヘッダー
     * ====================================================================== */
    updateHeader: function () {
      const snap = global.GameState.snapshot();
      const dayEl = document.getElementById('header-day');
      if (dayEl) dayEl.textContent = 'Day ' + snap.displayDay + ' / 7';
    },

    /* ======================================================================
     * ホームタブ
     * ====================================================================== */
    renderHome: function () {
      const root = document.getElementById('panel-home');
      if (!root) return;
      const snap    = global.GameState.snapshot();
      const unviewed = global.Signals.getAllUnviewed();
      const pos      = global.Trade.getCurrentPosition();
      const stats    = snap.stats;
      const state    = global.TrialStore.getState();

      let html = '';

      // 進捗バー
      html += this._renderProgressBar(snap);

      // Phase 3: プロフィールカード (レベル・XP・連勝)
      html += this._renderProfileCard(state);

      // 資金カード
      html += this._renderCapitalCard(snap.account, stats);

      // 戦績ミニ
      html += this._renderStatsMini(stats);

      // 保有ポジション
      if (pos) {
        html += this._renderPositionCard(pos);
      }

      // Phase 3: 今日のミッション
      if (global.MissionSystem) {
        html += global.MissionSystem.renderMissionCard();
      }

      // Phase 3: 判定スキルカード
      if (global.JudgmentScore) {
        html += global.JudgmentScore.renderSkillCard(state);
      }

      // 次のシグナル予測
      html += this._renderNextSignalCard(snap.next);

      // 学習リンク
      html +=
        '<div class="card card--compact" id="learn-link-card" role="button" tabindex="0" style="cursor:pointer; text-align:center; margin: var(--sp-4) 0;">' +
          '<strong>📚 レインボーロードの見方を確認する</strong>' +
        '</div>';

      // Phase 3: 最近の実績(最後に解除した3個)
      html += this._renderRecentAchievements(state);

      // 下部: 未確認シグナル一覧
      if (unviewed.length > 0) {
        html += this._renderUnviewedSection(unviewed);
      }

      root.innerHTML = html;
      this._bindHomeEvents();

      // 連勝バナー更新
      if (global.Effects) {
        const gs = state.gameStats || {};
        global.Effects.updateStreakBanner(gs.currentStreak || 0);
      }
    },

    _renderProfileCard: function (state) {
      const user = state.user || {};
      const xp   = user.xp    || 0;
      const gs   = state.gameStats || {};
      const streak = gs.currentStreak || 0;

      let levelInfo = { level: 1, icon: '🌱', title: '見習いトレーダー', xpInLevel: 0, xpToNext: 100, progressPct: 0, isMaxLevel: false };
      if (global.LevelSystem) {
        levelInfo = global.LevelSystem.getLevelInfo(xp);
      }

      const filled = Math.round(levelInfo.progressPct / 10);
      const bar    = '━'.repeat(filled) + '░'.repeat(10 - filled);
      const xpLine = levelInfo.isMaxLevel
        ? 'MAX LEVEL'
        : (levelInfo.xpInLevel + ' / ' + levelInfo.xpToNext + ' XP');

      let streakHTML = '';
      if (streak >= 2) {
        const fires = streak >= 5 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : '🔥';
        streakHTML = '<div id="streak-banner-container"><div class="streak-banner">' +
          '<span class="streak-banner__fire">' + fires + '</span>' +
          '<div><div class="streak-banner__text">' + streak + '連勝中！</div></div>' +
          '</div></div>';
      } else {
        streakHTML = '<div id="streak-banner-container"></div>';
      }

      return (
        '<div class="profile-card">' +
          '<div class="profile-card__greeting">こんにちは、' + (user.nickname || 'トレーダー') + 'さん</div>' +
          '<div class="profile-card__level-row">' +
            '<span class="profile-card__lv-badge">' + levelInfo.icon + ' Lv.' + levelInfo.level + '</span>' +
            '<span class="profile-card__title">' + levelInfo.title + '</span>' +
          '</div>' +
          '<div class="xp-bar">' +
            '<span class="xp-bar__bar">' + bar + '</span>' +
            '<span class="xp-bar__xp">' + xpLine + '</span>' +
          '</div>' +
          streakHTML +
        '</div>'
      );
    },

    _renderRecentAchievements: function (state) {
      if (!global.AchievementSystem || !global.ACHIEVEMENTS) return '';
      const unlocked = (state.achievements && state.achievements.unlocked) || [];
      if (unlocked.length === 0) return '';

      // 最後に解除した3個(配列末尾から)
      const recent = unlocked.slice(-3).reverse();
      const achMap = {};
      global.ACHIEVEMENTS.forEach(function (a) { achMap[a.id] = a; });

      const cards = recent.map(function (id) {
        const a = achMap[id];
        if (!a) return '';
        return (
          '<div class="recent-ach-item">' +
            '<span class="recent-ach-item__icon">' + a.icon + '</span>' +
            '<span class="recent-ach-item__title">' + a.title + '</span>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="card card--compact" style="margin-top:var(--sp-4)">' +
          '<div class="card__header" style="margin-bottom:8px">' +
            '<div class="card__title">🏆 最近の実績</div>' +
            '<button class="btn btn--ghost btn--sm" id="btn-go-achievements">すべて見る</button>' +
          '</div>' +
          '<div class="recent-ach-list">' + cards + '</div>' +
        '</div>'
      );
    },

    _renderUnviewedSection: function (unviewed) {
      const rows = unviewed.map(function (p) {
        const s = p.signal;
        const rec = p.record;
        const rel = rec.deliveredAt ? global.GameState.formatRelativeTime(rec.deliveredAt) : '';
        return (
          '<div class="signal-item" data-signal-id="' + s.id + '">' +
            '<div class="signal-item__time mono">' + rel + '</div>' +
            '<div class="signal-item__main">' +
              '<div class="signal-item__top">' +
                '<span class="rarity rarity--' + s.rarity + '">' + global.GameState.rarityLabel(s.rarity) + '</span>' +
                '<span class="signal-item__pair">' + global.GameState.formatPair(s.pair) + '</span>' +
                '<span class="badge ' + (s.direction === 'long' ? 'badge--long' : 'badge--short') + '">' +
                  global.GameState.directionLabel(s.direction) + '</span>' +
              '</div>' +
              '<div class="signal-item__status">Signal #' + s.number + '</div>' +
            '</div>' +
            '<div class="signal-item__chev">›</div>' +
          '</div>'
        );
      }).join('');

      return (
        '<section class="card card--rainbow" style="margin-top: var(--sp-6);">' +
          '<div class="card__header">' +
            '<div class="card__title">📬 未確認シグナル</div>' +
            '<div class="rainbow-text mono" style="font-weight:800; font-size:1.2rem;">' + unviewed.length + ' 件</div>' +
          '</div>' +
          '<div class="card__body">' + rows + '</div>' +
          '<div class="card__footer">' +
            '<button class="btn btn--primary btn--block" id="digest-open-first">最新から確認する</button>' +
          '</div>' +
        '</section>'
      );
    },

    _renderProgressBar: function (snap) {
      const pct = (snap.overallProgress * 100).toFixed(1);
      const dayLabel = (snap.currentDay === 'ended') ? 'Phase 1 完了' : ('Day ' + snap.currentDay + ' 進行中');
      return (
        '<div class="progress">' +
          '<div class="progress__meta">' +
            '<span><strong>' + dayLabel + '</strong></span>' +
            '<span>' + snap.displayDay + ' / 7</span>' +
          '</div>' +
          '<div class="progress__track">' +
            '<div class="progress__fill" style="width: ' + pct + '%"></div>' +
          '</div>' +
        '</div>'
      );
    },

    _renderCapitalCard: function (account, stats) {
      const pnl = account.totalPnL;
      const pnlClass = pnl > 0 ? 'capital-card__pnl--positive'
                    : pnl < 0 ? 'capital-card__pnl--negative'
                    : 'capital-card__pnl--zero';
      return (
        '<section class="capital-card">' +
          '<div class="capital-card__label">現在の仮想資金</div>' +
          '<div class="capital-card__amount mono">' + global.GameState.formatCapital(account.currentCapital) + '</div>' +
          '<div class="capital-card__pnl ' + pnlClass + '">' +
            '<span>' + global.GameState.formatSignedCurrency(pnl) + '</span>' +
            '<span class="capital-card__rate mono">' + (stats.capitalRate >= 0 ? '+' : '') + stats.capitalRate + '%</span>' +
          '</div>' +
        '</section>'
      );
    },

    _renderStatsMini: function (stats) {
      return (
        '<section class="stats-mini">' +
          '<div class="stats-mini__item">' +
            '<div class="stats-mini__label">Trades</div>' +
            '<div class="stats-mini__value">' + stats.totalTrades + '</div>' +
          '</div>' +
          '<div class="stats-mini__item">' +
            '<div class="stats-mini__label">W / L</div>' +
            '<div class="stats-mini__value">' + stats.wins + ' / ' + stats.losses + '</div>' +
          '</div>' +
          '<div class="stats-mini__item">' +
            '<div class="stats-mini__label">Win Rate</div>' +
            '<div class="stats-mini__value stats-mini__value--accent">' + (stats.winRate || 0) + '%</div>' +
          '</div>' +
        '</section>'
      );
    },

    _renderPositionCard: function (pos) {
      const signal = global.ScenarioUtil.getById(pos.signalId);
      if (!signal) return '';
      const pnlData = global.Trade.getPositionPnL();
      const pnl = pnlData ? pnlData.pnl : 0;
      const pnlSign = pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : '');
      return (
        '<div class="position-card" id="home-position-card" data-signal-id="' + signal.id + '">' +
          '<span class="position-card__live">LIVE 保有中</span>' +
          '<div class="position-card__row">' +
            '<span class="position-card__pair">' + global.GameState.formatPair(signal.pair) + ' ' +
              '<span class="badge ' + (signal.direction==='long'?'badge--long':'badge--short') + '">' +
                global.GameState.directionLabel(signal.direction) + '</span></span>' +
            '<span class="position-card__pnl ' + pnlSign + '">' + global.GameState.formatSignedCurrency(pnl) + '</span>' +
          '</div>' +
          '<div style="color: var(--text-muted); font-size:.82rem; margin-top:4px;">タップで詳細へ</div>' +
        '</div>'
      );
    },

    _renderNextSignalCard: function (next) {
      if (!next) {
        return (
          '<div class="next-signal">' +
            '<div class="next-signal__icon">🏁</div>' +
            '<div class="next-signal__text">' +
              '<div class="next-signal__label">Next Signal</div>' +
              '<div class="next-signal__value">本日の全シグナル配信終了</div>' +
            '</div>' +
          '</div>'
        );
      }
      const mins = next.minutesUntil;
      const dur = global.GameState.formatDuration(mins);
      const active = mins <= 1;
      return (
        '<div class="next-signal ' + (active ? 'is-active' : '') + '">' +
          '<div class="next-signal__icon">' + (active ? '⚡' : '⏳') + '</div>' +
          '<div class="next-signal__text">' +
            '<div class="next-signal__label">Next Signal</div>' +
            '<div class="next-signal__value">' + (active ? 'まもなく配信!' : ('約 ' + dur + '後')) + '</div>' +
          '</div>' +
        '</div>'
      );
    },

    _bindHomeEvents: function () {
      const self = this;
      // Pending 内の各行
      document.querySelectorAll('#panel-home .signal-item').forEach(function (el) {
        el.addEventListener('click', function () {
          const id = parseInt(el.getAttribute('data-signal-id'), 10);
          self.openSignalDetail(id);
        });
      });
      // 「最新から確認する」
      const openFirst = document.getElementById('digest-open-first');
      if (openFirst) {
        openFirst.addEventListener('click', function () {
          const list = global.Signals.getAllUnviewed();
          if (list.length > 0) self.openSignalDetail(list[0].signal.id);
        });
      }
      // 保有ポジションカード
      const posCard = document.getElementById('home-position-card');
      if (posCard) {
        posCard.addEventListener('click', function () {
          self.showScreen('position');
          self.renderPosition();
        });
      }
      // 学習リンク
      const learn = document.getElementById('learn-link-card');
      if (learn) {
        learn.addEventListener('click', function () { self.openLearningModal(); });
      }
      // Phase 3: 実績一覧へのリンク
      const achBtn = document.getElementById('btn-go-achievements');
      if (achBtn) {
        achBtn.addEventListener('click', function () { self.setTab('achievements'); });
      }
    },

    updateHomeNextSignal: function () {
      // 1秒毎に更新したい次シグナルカードだけ差し替え
      const snap = global.GameState.snapshot();
      const container = document.querySelector('#panel-home .next-signal');
      if (!container) return;
      const next = snap.next;
      let html;
      if (!next) {
        html =
          '<div class="next-signal__icon">🏁</div>' +
          '<div class="next-signal__text">' +
            '<div class="next-signal__label">Next Signal</div>' +
            '<div class="next-signal__value">本日の全シグナル配信終了</div>' +
          '</div>';
        container.classList.remove('is-active');
      } else {
        const active = next.minutesUntil <= 1;
        container.classList.toggle('is-active', active);
        html =
          '<div class="next-signal__icon">' + (active ? '⚡' : '⏳') + '</div>' +
          '<div class="next-signal__text">' +
            '<div class="next-signal__label">Next Signal</div>' +
            '<div class="next-signal__value">' + (active ? 'まもなく配信!' : ('約 ' + global.GameState.formatDuration(next.minutesUntil) + '後')) + '</div>' +
          '</div>';
      }
      container.innerHTML = html;
    },

    updateHomePosition: function () {
      const posCard = document.getElementById('home-position-card');
      if (!posCard) return;
      const pnlData = global.Trade.getPositionPnL();
      if (!pnlData) return;
      const pnlEl = posCard.querySelector('.position-card__pnl');
      if (pnlEl) {
        pnlEl.className = 'position-card__pnl ' +
          (pnlData.pnl > 0 ? 'text-success' : (pnlData.pnl < 0 ? 'text-danger' : ''));
        pnlEl.textContent = global.GameState.formatSignedCurrency(pnlData.pnl);
      }
    },

    /* ======================================================================
     * シグナルタブ
     * ====================================================================== */
    renderSignals: function () {
      const root = document.getElementById('panel-signals');
      if (!root) return;
      const list = global.Signals.getDeliveredSignals();

      if (list.length === 0) {
        root.innerHTML =
          '<div class="empty">' +
            '<div class="empty__icon">📡</div>' +
            '<div class="empty__text">まだシグナルは配信されていません。<br>最初のシグナルまでお待ちください。</div>' +
          '</div>';
        return;
      }

      const items = list.map(function (entry) {
        const s = entry.signal;
        const rec = entry.record;
        const status = rec.status;
        const statusText = App._statusLabel(status);
        const time = rec.deliveredAt ? global.GameState.formatClock(rec.deliveredAt) : '--:--';
        return (
          '<div class="signal-item" data-signal-id="' + s.id + '">' +
            '<div class="signal-item__time mono">' + time + '</div>' +
            '<div class="signal-item__main">' +
              '<div class="signal-item__top">' +
                '<span class="rarity rarity--' + s.rarity + '">' + global.GameState.rarityLabel(s.rarity) + '</span>' +
                '<span class="signal-item__pair">' + global.GameState.formatPair(s.pair) + '</span>' +
                '<span class="badge ' + (s.direction==='long'?'badge--long':'badge--short') + '">' +
                  global.GameState.directionLabel(s.direction) + '</span>' +
              '</div>' +
              '<div class="signal-item__status">#' + s.number + ' · ' + statusText + '</div>' +
            '</div>' +
            '<div class="signal-item__chev">›</div>' +
          '</div>'
        );
      }).join('');

      root.innerHTML = '<div class="section-title">受信シグナル</div>' + items;
      const self = this;
      root.querySelectorAll('.signal-item').forEach(function (el) {
        el.addEventListener('click', function () {
          const id = parseInt(el.getAttribute('data-signal-id'), 10);
          self.openSignalDetail(id);
        });
      });
    },

    _statusLabel: function (s) {
      switch (s) {
        case 'delivered_realtime':
        case 'delivered_pending': return '未確認';
        case 'viewed':             return '確認済み';
        case 'entered':            return 'エントリー中';
        case 'skipped':            return '見送り';
        case 'completed':          return '完了';
        default:                    return '-';
      }
    },

    /* ======================================================================
     * Phase 3: 統計タブ
     * ====================================================================== */
    renderStats: function () {
      const root = document.getElementById('panel-stats');
      if (!root) return;
      if (global.StatsPanel) {
        global.StatsPanel.render(root);
      } else {
        root.innerHTML = '<div class="empty"><div class="empty__icon">📈</div><div class="empty__text">統計を読み込み中...</div></div>';
      }
    },

    /* ======================================================================
     * Phase 3: 実績タブ
     * ====================================================================== */
    renderAchievements: function () {
      const root = document.getElementById('panel-achievements');
      if (!root) return;
      if (global.AchievementSystem) {
        const state = global.TrialStore.getState();
        root.innerHTML = global.AchievementSystem.renderAchievementsPage(state);
      } else {
        root.innerHTML = '<div class="empty"><div class="empty__icon">🏆</div><div class="empty__text">実績を読み込み中...</div></div>';
      }
    },

    /* ======================================================================
     * 履歴タブ
     * ====================================================================== */
    renderHistory: function () {
      const root = document.getElementById('panel-history');
      if (!root) return;

      const stats = global.TrialStore.computeStats();
      const all = global.TrialStore.listTrades();
      const filter = this.state.historyFilter;
      const filtered = all.filter(App._historyMatches.bind(null, filter));

      let html = '';

      // 統計サマリー
      html += (
        '<div class="section-title">戦績サマリー</div>' +
        '<section class="summary">' +
          App._summaryItem('総数', stats.totalTrades) +
          App._summaryItem('勝率', (stats.winRate || 0) + '%') +
          App._summaryItem('累計損益', global.GameState.formatSignedCurrency(stats.totalPnL)) +
          App._summaryItem('最大連勝', stats.maxWinStreak) +
          App._summaryItem('最大連敗', stats.maxLoseStreak) +
        '</section>'
      );

      // フィルタ
      html += '<div class="filter-row">' +
        HISTORY_FILTERS.map(function (f) {
          return '<button class="filter-chip ' + (filter === f.key ? 'is-active' : '') +
            '" data-filter="' + f.key + '">' + f.label + '</button>';
        }).join('') +
      '</div>';

      // 履歴リスト
      if (filtered.length === 0) {
        html += '<div class="empty"><div class="empty__icon">📜</div>' +
          '<div class="empty__text">条件に一致する履歴はありません。</div></div>';
      } else {
        html += filtered.map(App._renderTradeItem).join('');
      }

      root.innerHTML = html;

      const self = this;
      root.querySelectorAll('.filter-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          self.state.historyFilter = chip.getAttribute('data-filter');
          self.renderHistory();
        });
      });
    },

    _summaryItem: function (label, value) {
      return (
        '<div class="summary__item">' +
          '<div class="summary__label">' + label + '</div>' +
          '<div class="summary__value">' + value + '</div>' +
        '</div>'
      );
    },

    _historyMatches: function (filter, t) {
      if (filter === 'all') return true;
      if (filter === 'usdjpy') return t.pair === 'USDJPY';
      if (filter === 'btcusd') return t.pair === 'BTCUSD';
      if (filter === 'win')    return t.type === 'trade' && t.pnl > 0;
      if (filter === 'lose')   return t.type === 'trade' && t.pnl < 0;
      if (filter === 'skip')   return t.type === 'skip';
      return true;
    },

    _renderTradeItem: function (t) {
      let icon, iconClass, pnlClass, pnlText;
      if (t.type === 'skip') {
        icon = '⏸️'; iconClass = 'trade-item__icon--skip';
        pnlClass = 'trade-item__pnl--zero';
        pnlText = '見送り';
      } else if (t.pnl > 0) {
        icon = '✅'; iconClass = 'trade-item__icon--win';
        pnlClass = 'trade-item__pnl--positive';
        pnlText = global.GameState.formatSignedCurrency(t.pnl) + ' / ' + global.GameState.formatSignedPips(t.pnlPips);
      } else {
        icon = '❌'; iconClass = 'trade-item__icon--lose';
        pnlClass = 'trade-item__pnl--negative';
        pnlText = global.GameState.formatSignedCurrency(t.pnl) + ' / ' + global.GameState.formatSignedPips(t.pnlPips);
      }
      const sub = (t.entry != null && t.exit != null)
        ? (t.entry.toFixed(t.pair === 'USDJPY' ? 3 : 1) + ' → ' + t.exit.toFixed(t.pair === 'USDJPY' ? 3 : 1))
        : '—';
      return (
        '<div class="trade-item">' +
          '<div class="trade-item__icon ' + iconClass + '">' + icon + '</div>' +
          '<div class="trade-item__main">' +
            '<div class="trade-item__top">' +
              '<span class="trade-item__pair">' + global.GameState.formatPair(t.pair) + '</span>' +
              (t.direction ?
                '<span class="badge ' + (t.direction==='long'?'badge--long':'badge--short') + '">' +
                  global.GameState.directionLabel(t.direction) + '</span>'
                : '') +
            '</div>' +
            '<div class="trade-item__sub">' + sub + '</div>' +
          '</div>' +
          '<div class="trade-item__pnl ' + pnlClass + '">' + pnlText + '</div>' +
        '</div>'
      );
    },

    /* ======================================================================
     * シグナル詳細画面
     * ====================================================================== */
    renderDetail: function () {
      const root = document.getElementById('screen-detail');
      if (!root) return;
      const id = this.state.detailSignalId;
      const signal = global.ScenarioUtil.getById(id);
      if (!signal) {
        this.goHome();
        return;
      }

      const j = global.Judgment.judge(signal);
      const guide = global.Judgment.getGuideText(signal.direction);
      const pairJp = global.GameState.formatPair(signal.pair);
      const dirLabel = global.GameState.directionLabel(signal.direction);
      const dirIcon = global.GameState.directionIcon(signal.direction);
      const d = signal.decimals;

      root.innerHTML = (
        '<div class="page-header">' +
          '<button class="page-header__back" id="detail-back" aria-label="戻る">←</button>' +
          '<div class="page-header__title">Signal #' + signal.number + '</div>' +
          '<div class="page-header__meta"><span class="rarity rarity--' + signal.rarity + '">' +
            global.GameState.rarityLabel(signal.rarity) + '</span></div>' +
        '</div>' +

        '<section class="signal-info">' +
          '<div class="signal-info__header">🌈 RAINBOW SIGNAL</div>' +
          '<div class="signal-info__body">' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">通貨ペア</div>' +
              '<div class="signal-info__value">' + pairJp + '</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">方向</div>' +
              '<div class="signal-info__value ' + (signal.direction==='long'?'signal-info__value--long':'signal-info__value--short') + '">' +
                dirIcon + ' ' + dirLabel + '</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">Entry</div>' +
              '<div class="signal-info__value signal-info__value--gold">' + signal.entry.toFixed(d) + '</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">RR比</div>' +
              '<div class="signal-info__value">1 : ' + signal.rr + '</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">TP</div>' +
              '<div class="signal-info__value signal-info__value--green">' +
                signal.tp.toFixed(d) + ' (+' + signal.tpPips + 'pips)</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">SL</div>' +
              '<div class="signal-info__value signal-info__value--red">' +
                signal.sl.toFixed(d) + ' (−' + signal.slPips + 'pips)</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">推奨ロット</div>' +
              '<div class="signal-info__value">' + signal.lotSize + '</div>' +
            '</div>' +
            '<div class="signal-info__cell">' +
              '<div class="signal-info__label">想定損益</div>' +
              '<div class="signal-info__value"><span class="text-success">+¥' +
                signal.tpProfit.toLocaleString('ja-JP') + '</span> / <span class="text-danger">−¥' +
                Math.abs(signal.slLoss).toLocaleString('ja-JP') + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="signal-info__footer">' +
            '<span>配信元: Rainbow System Bot</span>' +
            '<span>通算 #' + signal.number + '</span>' +
          '</div>' +
        '</section>' +

        '<div class="chart" id="detail-chart"></div>' +

        '<section class="guide">' +
          '<div class="guide__title">' + guide.title + '</div>' +
          '<div class="guide__text">' + guide.lines.join('<br>') + '</div>' +
          '<div style="margin-top: var(--sp-3); font-size:.88rem;">' +
            '<strong>現在の判定: </strong>' + global.Judgment.briefHint(j) +
          '</div>' +
          '<a href="#" class="guide__link" id="detail-open-learn">🎓 レインボーロードの見方を詳しく見る</a>' +
        '</section>' +

        '<div class="decision">' +
          '<button class="btn btn--long btn--lg" id="detail-enter">✅ エントリー</button>' +
          '<button class="btn btn--secondary btn--lg" id="detail-skip">⏸️ 見送る</button>' +
        '</div>'
      );

      // Chart をマウント
      const chartEl = document.getElementById('detail-chart');
      if (chartEl) {
        if (this.chart) { this.chart.destroy(); this.chart = null; }
        this.chart = new global.RainbowChart(chartEl, signal, {
          liveMode: false, showEntryLines: true
        });
      }

      // Bind
      const self = this;
      const back = document.getElementById('detail-back');
      if (back) back.addEventListener('click', function () { self.goHome(); });
      const enterBtn = document.getElementById('detail-enter');
      if (enterBtn) enterBtn.addEventListener('click', function () { self.onEnterClicked(signal); });
      const skipBtn = document.getElementById('detail-skip');
      if (skipBtn) skipBtn.addEventListener('click', function () { self.onSkipClicked(signal); });
      const learn = document.getElementById('detail-open-learn');
      if (learn) learn.addEventListener('click', function (e) { e.preventDefault(); self.openLearningModal(); });
    },

    onEnterClicked: function (signal) {
      // リアルタイムモードで開始(position 画面で早送りに切替可)
      global.Trade.openPosition(signal.id, 'realtime');
    },

    onSkipClicked: function (signal) {
      global.Trade.skipSignal(signal.id);
    },

    /* ======================================================================
     * ポジション画面
     * ====================================================================== */
    renderPosition: function () {
      const root = document.getElementById('screen-position');
      if (!root) return;
      const pos = global.Trade.getCurrentPosition();
      if (!pos) { this.goHome(); return; }
      const signal = global.ScenarioUtil.getById(pos.signalId);
      if (!signal) { this.goHome(); return; }

      const pnlData = global.Trade.getPositionPnL();
      const d = signal.decimals;
      const pair = global.GameState.formatPair(signal.pair);
      const dirBadge = '<span class="badge ' + (signal.direction==='long'?'badge--long':'badge--short') + '">' +
        global.GameState.directionLabel(signal.direction) + '</span>';

      root.innerHTML = (
        '<div class="page-header">' +
          '<button class="page-header__back" id="pos-back" aria-label="戻る">←</button>' +
          '<div class="page-header__title">ポジション保有中</div>' +
          '<div class="page-header__meta"><span class="badge badge--status-active">' +
            (pos.mode === 'fast' ? 'FAST' : 'REALTIME') + '</span></div>' +
        '</div>' +

        '<section class="live">' +
          '<div class="live-head">' +
            '<div>' +
              '<div class="live__status">LIVE · ' + (pos.mode === 'fast' ? '早送り進行中' : 'リアルタイム進行中') + '</div>' +
              '<div class="live-head__pair">' + pair + ' ' + dirBadge + '</div>' +
              '<div style="color: var(--text-muted); font-size:.82rem; margin-top:4px;">Entry ' + signal.entry.toFixed(d) + '</div>' +
            '</div>' +
            '<div class="live-head__price mono" data-role="live-price">' + (pnlData ? pnlData.price.toFixed(d) : signal.entry.toFixed(d)) + '</div>' +
          '</div>' +

          '<div class="chart chart--compact" id="pos-chart"></div>' +

          '<div class="live-pnl">' +
            '<div class="live-pnl__item">' +
              '<div class="live-pnl__label">pips</div>' +
              '<div class="live-pnl__value" data-role="live-pips">' +
                (pnlData ? global.GameState.formatSignedPips(pnlData.pips) : '0pips') + '</div>' +
            '</div>' +
            '<div class="live-pnl__item">' +
              '<div class="live-pnl__label">損益</div>' +
              '<div class="live-pnl__value" data-role="live-pnl">' +
                (pnlData ? global.GameState.formatSignedCurrency(pnlData.pnl) : '¥0') + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="range-bar">' +
            '<div class="range-bar__ends">' +
              '<span class="sl">SL ' + signal.sl.toFixed(d) + '</span>' +
              '<span class="tp">TP ' + signal.tp.toFixed(d) + '</span>' +
            '</div>' +
            '<div class="range-bar__track">' +
              '<div class="range-bar__center"></div>' +
              '<div class="range-bar__marker" data-role="range-marker" style="left:' + global.Trade.getRangeMarkerPercent() + '%"></div>' +
            '</div>' +
          '</div>' +

          '<div class="live-actions">' +
            (pos.mode === 'fast'
              ? ''
              : '<button class="btn btn--primary btn--lg" id="pos-fast">⏩ 早送りで結果を見る</button>') +
            '<button class="btn btn--secondary btn--lg" id="pos-home">⏰ ホームに戻って待つ</button>' +
          '</div>' +
        '</section>'
      );

      // チャートマウント(コンパクト + liveMode)
      const chartEl = document.getElementById('pos-chart');
      if (chartEl) {
        if (this.chart) { this.chart.destroy(); this.chart = null; }
        this.chart = new global.RainbowChart(chartEl, signal, {
          liveMode: true, showEntryLines: true
        });
        if (pnlData) this.chart.setLivePrice(pnlData.price);
        // 既に保有中のポジションなら、現時点までのライブローソクを即反映
        const liveCs = global.Trade.buildLiveCandles();
        if (liveCs && liveCs.length) this.chart.setLiveCandles(liveCs);
      }

      // Bind
      const self = this;
      const back = document.getElementById('pos-back');
      if (back) back.addEventListener('click', function () { self.goHome(); });
      const fastBtn = document.getElementById('pos-fast');
      if (fastBtn) fastBtn.addEventListener('click', function () {
        global.Trade.switchMode('fast');
      });
      const homeBtn = document.getElementById('pos-home');
      if (homeBtn) homeBtn.addEventListener('click', function () { self.goHome(); });
    },

    updatePositionLive: function (evt) {
      if (this.state.screen !== 'position') {
        if (this.state.screen === 'main' && this.state.tab === 'home') {
          this.updateHomePosition();
        }
        return;
      }
      const root = document.getElementById('screen-position');
      if (!root) return;
      const signal = evt.signal;
      const d = signal.decimals;

      const priceEl  = root.querySelector('[data-role="live-price"]');
      const pipsEl   = root.querySelector('[data-role="live-pips"]');
      const pnlEl    = root.querySelector('[data-role="live-pnl"]');
      const markerEl = root.querySelector('[data-role="range-marker"]');

      if (priceEl) priceEl.textContent = evt.price.toFixed(d);
      if (pipsEl)  pipsEl.textContent  = global.GameState.formatSignedPips(evt.pips);
      if (pnlEl) {
        pnlEl.textContent = global.GameState.formatSignedCurrency(evt.pnl);
        pnlEl.style.color = evt.pnl > 0 ? 'var(--color-success)'
                         : evt.pnl < 0 ? 'var(--color-danger)'
                         : 'var(--text-primary)';
      }
      if (markerEl) {
        markerEl.style.left = global.Trade.getRangeMarkerPercent() + '%';
      }
      if (this.chart) {
        this.chart.setLivePrice(evt.price);
        if (evt.liveCandles) this.chart.setLiveCandles(evt.liveCandles);
      }
    },

    /* ======================================================================
     * 結果画面
     * ====================================================================== */
    renderResult: function () {
      const root = document.getElementById('screen-result');
      if (!root) return;
      const ctx = this.state.resultContext;
      if (!ctx) { this.goHome(); return; }
      const signal = ctx.signal;
      const trade = ctx.trade;
      const d = signal.decimals;

      const snap = global.GameState.snapshot();
      let html = '';

      if (ctx.skipped) {
        const fb = global.Judgment.judgeSkipFeedback(signal);
        html =
          '<section class="result result--skip">' +
            '<div class="result__icon">⏸️</div>' +
            '<h1 class="result__title">シグナルを見送りました</h1>' +
            '<p class="result__message">' + fb.title + '<br><br>' + fb.message + '</p>' +
            '<div class="result__balance">' +
              '<div class="result__balance-label">現在の仮想資金</div>' +
              '<div class="result__balance-value mono">' + global.GameState.formatCapital(snap.account.currentCapital) + '</div>' +
            '</div>' +
            '<div class="result__actions">' +
              '<button class="btn btn--secondary btn--lg" id="result-home">ホームに戻る</button>' +
              '<button class="btn btn--primary btn--lg" id="result-next">次のシグナルを待つ</button>' +
            '</div>' +
          '</section>';
      } else if (trade.pnl > 0) {
        html =
          '<section class="result result--win">' +
            '<div class="result__icon">🏆</div>' +
            '<h1 class="result__title">TP HIT!</h1>' +
            '<div class="result__pips mono text-success">' + global.GameState.formatSignedPips(trade.pnlPips) + '</div>' +
            '<div class="result__amount">獲得: <strong>' + global.GameState.formatSignedCurrency(trade.pnl) + '</strong></div>' +
            '<div class="result__balance">' +
              '<div class="result__balance-label">現在の仮想資金</div>' +
              '<div class="result__balance-value mono">' + global.GameState.formatCapital(snap.account.currentCapital) + '</div>' +
            '</div>' +
            '<p class="result__message">この調子で次もいきましょう!</p>' +
            '<div class="result__actions">' +
              '<button class="btn btn--secondary btn--lg" id="result-home">ホームに戻る</button>' +
              '<button class="btn btn--primary btn--lg" id="result-next">次のシグナルを待つ</button>' +
            '</div>' +
          '</section>';
      } else {
        html =
          '<section class="result result--lose">' +
            '<div class="result__icon">📉</div>' +
            '<h1 class="result__title">SL HIT</h1>' +
            '<div class="result__pips mono text-danger">' + global.GameState.formatSignedPips(trade.pnlPips) + '</div>' +
            '<div class="result__amount">損失: <strong>' + global.GameState.formatSignedCurrency(trade.pnl) + '</strong></div>' +
            '<div class="result__balance">' +
              '<div class="result__balance-label">現在の仮想資金</div>' +
              '<div class="result__balance-value mono">' + global.GameState.formatCapital(snap.account.currentCapital) + '</div>' +
            '</div>' +
            '<p class="result__message">相場に絶対はありません。<br>次のチャンスを待ちましょう。</p>' +
            '<div class="result__actions">' +
              '<button class="btn btn--secondary btn--lg" id="result-home">ホームに戻る</button>' +
              '<button class="btn btn--primary btn--lg" id="result-next">次のシグナルを待つ</button>' +
            '</div>' +
          '</section>';
      }

      root.innerHTML = html;
      const self = this;
      const homeBtn = document.getElementById('result-home');
      if (homeBtn) homeBtn.addEventListener('click', function () { self.goHome(); });
      const nextBtn = document.getElementById('result-next');
      if (nextBtn) nextBtn.addEventListener('click', function () { self.goHome(); });
    },

    /* ======================================================================
     * 学習モーダル
     * ====================================================================== */
    openLearningModal: function () {
      const overlay = document.getElementById('overlay-learning');
      if (!overlay) return;
      const body = overlay.querySelector('.overlay__body');
      if (body) {
        const sections = global.Judgment.getLearningContent();
        body.innerHTML = sections.map(function (s) {
          return (
            '<section style="margin-bottom: var(--sp-5);">' +
              '<h3 style="font-size:1rem; margin-bottom: var(--sp-2);">' + s.title + '</h3>' +
              '<div style="color: var(--text-secondary); line-height:1.8; font-size:.92rem;">' + s.body + '</div>' +
            '</section>'
          );
        }).join('');
      }
      overlay.classList.add('is-open');
    }
  };

  /* ========================================================================
   * Service Worker 登録 (Phase 2)
   * ======================================================================== */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // file:// 環境では SW は動かないのでスキップ
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('./service-worker.js')
      .then(function (reg) {
        // アップデート検知: 新バージョンが来たら次回起動で自動反映
        reg.addEventListener('updatefound', function () {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] new version installed; will activate on next load');
            }
          });
        });
      })
      .catch(function (e) { console.warn('[SW] register failed:', e.message); });
  }

  /* ========================================================================
   * Boot
   * ======================================================================== */
  function boot() {
    registerServiceWorker();
    App.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.App = App;

})(typeof window !== 'undefined' ? window : this);
