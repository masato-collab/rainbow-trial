/* ==========================================================================
 * Rainbow Trial — js/phase4-hooks.js
 * Phase 4 統合フック
 *
 * 役割:
 *   - App.renderHome をパッチしてひかりメッセージカード・フィードを注入
 *   - Day 遷移を監視してメッセージ配信
 *   - 条件発動(連敗/LEGENDARY/連勝/スコア90+)を監視
 *   - Day 7 完了時に最終画面を自動表示
 *   - URL パラメータ ?debug=true でのみデバッグメニュー有効化
 *
 * 依存: GameState / TrialStore / HikariMessage / SalonFeed / FinalScreen / Effects
 * ========================================================================== */

(function (global) {
  'use strict';

  var _initialized   = false;
  var _pollTimer     = null;
  var _lastPollDay   = -1;
  var _lastStreak    = 0;
  var _lastScore     = 0;
  var _legendaryShown = false;

  /* --------------------------------------------------------------------------
   * 初期化
   * -------------------------------------------------------------------------- */
  function init() {
    if (_initialized) return;
    if (!global.GameState || !global.TrialStore) {
      console.warn('[Phase4Hooks] 依存モジュール未ロード');
      return;
    }
    _initialized = true;

    _patchRenderHome();
    _checkDayTransition();
    _checkFinalScreen();
    _startPoll();
    _applyDebugUrlParam();

    console.log('[Phase4Hooks] 初期化完了');
  }

  /* --------------------------------------------------------------------------
   * 1. App.renderHome パッチ(重複防止)
   * -------------------------------------------------------------------------- */
  function _patchRenderHome() {
    if (!global.App || typeof global.App.renderHome !== 'function') return;
    if (global.App.renderHome.__ph4Patched) return;

    var _orig = global.App.renderHome.bind(global.App);
    global.App.renderHome = function () {
      _orig();
      _injectPhase4Content();
    };
    global.App.renderHome.__ph4Patched = true;

    setTimeout(_injectPhase4Content, 60);
  }

  /* --------------------------------------------------------------------------
   * 2. ホームへの Phase 4 コンテンツ注入
   * -------------------------------------------------------------------------- */
  function _injectPhase4Content() {
    var root = document.getElementById('panel-home');
    if (!root) return;

    // 古い ph4 要素をクリア
    ['ph4-hikari-msg', 'ph4-salon-feed', 'ph4-final-cta', 'ph4-line-banner'].forEach(function (id) {
      var old = document.getElementById(id);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    });

    var snap  = global.GameState && global.GameState.snapshot();
    var state = global.TrialStore.getState();
    var day   = snap ? snap.displayDay : ((state.user && state.user.currentDay) || 1);
    var isEnded = snap && (snap.currentDay === 'ended' || (snap.displayDay === 7 && !snap.next));

    /* ---- Day 7 完了バナー ---- */
    if (isEnded) {
      var ctaEl = document.createElement('div');
      ctaEl.id  = 'ph4-final-cta';
      ctaEl.innerHTML =
        '<div class="final-cta-banner">' +
          '<div class="final-cta-banner__title">🎊 7日間のトライアル完了！</div>' +
          '<div class="final-cta-banner__sub">あなたの7日間の成績を確認しましょう</div>' +
          '<button class="btn btn--primary btn--block" type="button">📊 最終成績を見る</button>' +
        '</div>';
      ctaEl.querySelector('button').addEventListener('click', function () {
        if (global.FinalScreen) global.FinalScreen.show();
      });
      var progressEl = root.querySelector('.progress');
      if (progressEl && progressEl.nextSibling) root.insertBefore(ctaEl, progressEl.nextSibling);
      else if (progressEl) progressEl.parentNode.appendChild(ctaEl);
      else root.insertBefore(ctaEl, root.firstChild);
    }

    /* ---- ひかりメッセージカード ---- */
    if (global.HikariMessage) {
      var hikariEl = document.createElement('div');
      hikariEl.id  = 'ph4-hikari-msg';
      global.HikariMessage.renderHomeCard(hikariEl);
      if (hikariEl.children.length > 0) {
        var profileCard = root.querySelector('.profile-card');
        if (profileCard && profileCard.parentNode) {
          profileCard.parentNode.insertBefore(hikariEl, profileCard);
        } else {
          root.insertBefore(hikariEl, root.firstChild);
        }
      }
      // ホームカードのリフレッシュ関数を登録
      global.HikariMessage._refreshHomeCard = function () {
        if (hikariEl.parentNode) {
          global.HikariMessage.renderHomeCard(hikariEl);
        }
      };
    }

    /* ---- Rainbow Salon フィード ---- */
    var feedEl = document.createElement('div');
    feedEl.id  = 'ph4-salon-feed';
    if (global.SalonFeed) {
      global.SalonFeed.renderFeedCard(feedEl);
      global.SalonFeed.startRefresh();
    }
    var learnCard = root.querySelector('#learn-link-card');
    if (learnCard && learnCard.nextSibling) root.insertBefore(feedEl, learnCard.nextSibling);
    else root.appendChild(feedEl);

    /* ---- Day 6+ の控えめ LINE バナー ---- */
    if (day >= 6 && !isEnded) {
      var s = global.TrialStore.getState();
      var bannerDismissed = s.settings && s.settings._lineBannerDismissed;
      if (!bannerDismissed) {
        var bannerEl = document.createElement('div');
        bannerEl.id  = 'ph4-line-banner';
        bannerEl.innerHTML =
          '<div class="line-soft-banner">' +
            '<span class="line-soft-banner__text">気になったら、ひかりに気軽に話しかけてください🌈</span>' +
            '<div class="line-soft-banner__actions">' +
              '<a href="https://lin.ee/xGQTHY1" target="_blank" rel="noopener" class="line-soft-banner__link">詳しく見る</a>' +
              '<button class="line-soft-banner__dismiss" type="button" aria-label="閉じる">×</button>' +
            '</div>' +
          '</div>';
        bannerEl.querySelector('.line-soft-banner__dismiss').addEventListener('click', function () {
          bannerEl.style.display = 'none';
          global.TrialStore.setState({ settings: { _lineBannerDismissed: true } });
        });
        root.appendChild(bannerEl);
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 3. Day 遷移チェック
   * -------------------------------------------------------------------------- */
  function _checkDayTransition() {
    var snap = global.GameState && global.GameState.snapshot();
    if (!snap) return;

    var day     = snap.displayDay;
    var state   = global.TrialStore.getState();
    var prevDay = (state.settings && state.settings._lastKnownDay) || 0;

    // ひかりメッセージの Day トリガー
    if (global.HikariMessage) {
      global.HikariMessage.checkAndShowDay(day);
    }

    if (day > prevDay) {
      global.TrialStore.setState({ settings: { _lastKnownDay: day } });
      if (prevDay > 0 && global.Effects) {
        setTimeout(function () { global.Effects.flash('purple'); }, 500);
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 4. 条件発動チェック
   * -------------------------------------------------------------------------- */
  function _checkConditionals() {
    if (!global.HikariMessage) return;

    var state = global.TrialStore.getState();
    var gs    = state.gameStats || {};

    // 5連続敗
    var loseStreak = 0;
    var trades = state.trades || [];
    for (var i = trades.length - 1; i >= 0; i--) {
      if (trades[i].type === 'skip') continue;
      if ((trades[i].pnl || 0) < 0) loseStreak++;
      else break;
    }
    if (loseStreak >= 5) {
      global.HikariMessage.checkConditional('consecutive_losses_5');
    }

    // 7連勝
    var curStreak = gs.currentStreak || 0;
    if (curStreak >= 7 && curStreak > _lastStreak) {
      global.HikariMessage.checkConditional('win_streak_7');
    }
    _lastStreak = curStreak;

    // 判定スコア 90 点超
    var score = gs.judgmentScore || 0;
    if (score >= 90 && _lastScore < 90) {
      global.HikariMessage.checkConditional('score_over_90');
    }
    _lastScore = score;
  }

  /* --------------------------------------------------------------------------
   * 5. LEGENDARY シグナル受信フック
   * (phase3-hooks.js からの signal_delivered イベント後に呼ばれる想定)
   * -------------------------------------------------------------------------- */
  function onLegendarySignal() {
    if (_legendaryShown) return;
    if (!global.HikariMessage) return;
    _legendaryShown = true;
    global.HikariMessage.checkConditional('legendary_signal');
  }

  /* --------------------------------------------------------------------------
   * 6. 最終画面チェック
   * -------------------------------------------------------------------------- */
  function _checkFinalScreen() {
    if (!global.FinalScreen) return;

    var state = global.TrialStore.getState();
    var shown = state.settings && state.settings._finalScreenAutoShown;
    if (shown) return;

    if (global.FinalScreen.shouldShow()) {
      setTimeout(function () {
        global.TrialStore.setState({ settings: { _finalScreenAutoShown: true } });
        global.FinalScreen.show();
      }, 2000);
    }
  }

  /* --------------------------------------------------------------------------
   * 7. 定期ポーリング(60秒ごと)
   * -------------------------------------------------------------------------- */
  function _startPoll() {
    if (_pollTimer) return;
    _pollTimer = setInterval(function () {
      var snap = global.GameState && global.GameState.snapshot();
      if (!snap) return;

      var day = snap.displayDay;
      if (day !== _lastPollDay && _lastPollDay !== -1) {
        _checkDayTransition();
        if (global.App && global.App.state &&
            global.App.state.screen === 'main' && global.App.state.tab === 'home') {
          global.App.renderHome();
        }
      }
      _lastPollDay = day;

      _checkConditionals();

      if (global.FinalScreen && global.FinalScreen.shouldShow()) {
        _checkFinalScreen();
      }
    }, 60000);
  }

  /* --------------------------------------------------------------------------
   * 8. ?debug=true でのみデバッグメニューを有効化
   * -------------------------------------------------------------------------- */
  function _applyDebugUrlParam() {
    var params = new URLSearchParams(global.location && global.location.search);
    if (params.get('debug') !== 'true') {
      // デバッグメニューを無効化(ロゴタップ・Konami Code を除去)
      _disableDebugTriggers();
    }
  }

  function _disableDebugTriggers() {
    // App._bindKonami 内のイベントは既にバインド済みなので、
    // openDebugMenu 自体を無効化することで実質的にブロック
    if (global.App) {
      global.App._debugEnabled = false;
      var _origOpen = global.App.openDebugMenu.bind(global.App);
      global.App.openDebugMenu = function () {
        // 本番では ?debug=true がないと開かない
        if (global.App._debugEnabled) _origOpen();
      };
    }
  }

  /* --------------------------------------------------------------------------
   * Boot
   * -------------------------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

  /* --------------------------------------------------------------------------
   * 公開(phase3-hooks.js 等から呼び出し可)
   * -------------------------------------------------------------------------- */
  global.Phase4Hooks = {
    onLegendarySignal: onLegendarySignal
  };

})(typeof window !== 'undefined' ? window : this);
