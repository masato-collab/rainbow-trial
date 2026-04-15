/* ==========================================================================
 * Rainbow Trial — js/notifications.js
 * ハイブリッド配信の通知プレゼンテーション層。
 *
 * Phase 1 では以下のレベルを担当:
 *   Level 1 — 画面内通知バー(滑り込みアニメ、積み重ね表示)
 *   Level 2 — 別タブ時のタブタイトル + ファビコン変更
 *   Level 4 — ホーム画面まとめ表示用データは呼び出し側(app.js)で使用
 *
 * Phase 2 で追加予定:
 *   Level 3 — Web Notification API(ブラウザ通知)
 *   + Service Worker / PWA 化による push
 *
 * 公開グローバル: window.Notifications
 *
 * 設計方針:
 *   - このモジュールは「見た目」だけ担当。状態は GameState / TrialStore に置く
 *   - signals.js がイベント発火時に Notifications.show*() を呼ぶ
 *   - visibilitychange のハンドリングもここに集約
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. 設定
   * -------------------------------------------------------------------------- */
  const CONFIG = {
    baseTitle:      'Rainbow Trial',
    faviconNormal:  'assets/favicon.svg',
    faviconAlert:   'assets/favicon-alert.svg',
    containerId:    'notice-bar',
    cardClass:      'notice-bar__card',
    summaryClass:   'notice-bar__summary',
    animMs:         280,
    maxVisible:     1,       // 常に最新 1 件のみ表示(溜まりはホーム下部セクションへ)
    autoHideMs:     8000     // 一定時間後に自動消滅(0 で無効化)
  };

  /* --------------------------------------------------------------------------
   * 2. 状態
   * -------------------------------------------------------------------------- */
  let originalTitle       = null;
  let currentUnreadCount  = 0;
  let viewHandler         = null;          // 通知クリック時のコールバック(signalId を渡す)
  let dismissHandler      = null;          // 通知を×で消した時のコールバック
  let summaryHandler      = null;          // 「他 N 件」をタップした時のコールバック
  const visibilityHandlers = new Set();
  let initialized         = false;

  /* --------------------------------------------------------------------------
   * 3. 初期化
   * -------------------------------------------------------------------------- */
  function init(options) {
    if (initialized) return;
    Object.assign(CONFIG, options || {});
    originalTitle = (document && document.title) ? document.title : CONFIG.baseTitle;
    ensureContainer();
    ensureFaviconLink();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    initialized = true;
  }

  function ensureContainer() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById(CONFIG.containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = CONFIG.containerId;
      el.className = 'notice-bar';
      // ヘッダーより下、メインより上(CSS で z-index 管理)
      if (document.body) document.body.appendChild(el);
    }
    return el;
  }

  function ensureFaviconLink() {
    if (typeof document === 'undefined') return null;
    let link = document.querySelector('link[rel~="icon"][data-rt-favicon]');
    if (link) return link;
    // 既存のアイコンリンクを拾う
    link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.href = CONFIG.faviconNormal;
      document.head.appendChild(link);
    }
    link.setAttribute('data-rt-favicon', 'true');
    return link;
  }

  /* --------------------------------------------------------------------------
   * 4. Level 1 — 画面内通知バー
   * -------------------------------------------------------------------------- */
  /**
   * シグナル受信時に呼ぶ。既に表示中なら何もしない(idempotent)
   * @param {Object} signal — { id, pair, direction, rarity, number, ... }
   */
  function showInAppNotification(signal) {
    if (!signal || typeof document === 'undefined') return;
    const container = ensureContainer();
    if (!container) return;
    if (container.querySelector('[data-signal-id="' + signal.id + '"]')) return;

    // maxVisible=1 時は既存カードを即座に消してから新しいものを出す
    if (CONFIG.maxVisible <= 1) {
      const existing = container.querySelectorAll('.' + CONFIG.cardClass);
      existing.forEach(function (c) {
        if (c.parentNode) c.parentNode.removeChild(c);
      });
    }

    const card = buildCard(signal);

    // 新しい通知が常に上に積まれるよう先頭に挿入
    if (container.firstChild) {
      container.insertBefore(card, container.firstChild);
    } else {
      container.appendChild(card);
    }

    container.classList.add('is-visible');
    container.setAttribute('data-rarity', signal.rarity || 'normal');

    // 初期位置を上外、次フレームでスライドイン
    card.style.opacity = '0';
    card.style.transform = 'translateY(-16px)';
    requestAnimationFrame(function () {
      card.style.transition = 'opacity ' + CONFIG.animMs + 'ms ease, transform ' + CONFIG.animMs + 'ms ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });

    // 自動非表示: 操作があればキャンセル(ホバー/タッチで長押し視認可)
    if (CONFIG.autoHideMs > 0) {
      const hideTimer = setTimeout(function () {
        removeCard(card);
      }, CONFIG.autoHideMs);
      card._autoHideTimer = hideTimer;
      const cancel = function () {
        if (card._autoHideTimer) { clearTimeout(card._autoHideTimer); card._autoHideTimer = null; }
      };
      card.addEventListener('mouseenter', cancel);
      card.addEventListener('touchstart', cancel, { passive: true });
      card.addEventListener('focusin', cancel);
    }

    // 上限を超えたら古いものを切り詰め(maxVisible=1 なら基本的に該当せず)
    enforceMaxVisible();
    updateSummary();
  }

  /** 表示カードが maxVisible を超えたら古いものから消す(FIFO) */
  function enforceMaxVisible() {
    const container = document.getElementById(CONFIG.containerId);
    if (!container) return;
    const cards = Array.prototype.slice.call(container.querySelectorAll('.' + CONFIG.cardClass));
    if (cards.length <= CONFIG.maxVisible) return;
    // 新しい順(先頭)が優先 → 末尾を削除
    const toRemove = cards.slice(CONFIG.maxVisible);
    toRemove.forEach(function (c) {
      // サマリー行は壊さないよう、直接 DOM から除去(アニメ最小限)
      if (c.parentNode) c.parentNode.removeChild(c);
    });
  }

  /** 「他 N 件」サマリー行(maxVisible=1 時は非表示、ホーム画面下部に集約される) */
  function updateSummary() {
    const container = document.getElementById(CONFIG.containerId);
    if (!container) return;
    // maxVisible が 1 以下なら、溜まり表示はホーム画面に任せてバーには出さない
    if (CONFIG.maxVisible <= 1) {
      const s = container.querySelector('.' + CONFIG.summaryClass);
      if (s) s.remove();
      return;
    }
    const visible = container.querySelectorAll('.' + CONFIG.cardClass).length;
    const totalUnread = (global.TrialStore && typeof global.TrialStore.getUnviewedSignalIds === 'function')
      ? global.TrialStore.getUnviewedSignalIds().length
      : 0;
    const hidden = Math.max(0, totalUnread - visible);

    let summary = container.querySelector('.' + CONFIG.summaryClass);
    if (hidden <= 0) {
      if (summary) { summary.remove(); }
      return;
    }

    if (!summary) {
      summary = document.createElement('div');
      summary.className = CONFIG.summaryClass;
      summary.setAttribute('role', 'button');
      summary.setAttribute('tabindex', '0');
      summary.addEventListener('click', handleSummaryClick);
      summary.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSummaryClick(); }
      });
      container.appendChild(summary);
    } else if (summary.parentNode !== container || summary !== container.lastElementChild) {
      container.appendChild(summary);   // 常に末尾
    }
    summary.innerHTML =
      '<span class="notice-bar__summary-icon">📬</span>' +
      '<span class="notice-bar__summary-text">他 <strong>' + hidden + '</strong> 件の新着シグナル</span>' +
      '<span class="notice-bar__summary-chev">一覧 →</span>';
  }

  function handleSummaryClick() {
    if (summaryHandler) {
      try { summaryHandler(); } catch (e) { console.error('[Notifications] summary handler error', e); }
    }
  }

  function buildCard(signal) {
    const card = document.createElement('div');
    card.className = CONFIG.cardClass;
    card.setAttribute('data-signal-id', signal.id);
    card.setAttribute('data-rarity', signal.rarity || 'normal');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'NEW SIGNAL ' + formatPair(signal.pair) + ' ' + directionJp(signal.direction));

    // フォーマッタが存在すれば GameState のものを使う
    const pairLabel = formatPair(signal.pair);
    const dirJp     = directionJp(signal.direction);
    const rarityUp  = (signal.rarity || 'normal').toUpperCase();

    const icon = global.GameState ? global.GameState.directionIcon(signal.direction) : (signal.direction === 'long' ? '📈' : '📉');

    card.innerHTML =
      '<div class="notice-bar__content">'
        + '<div class="notice-bar__head">'
          + '<span class="notice-bar__label">⚡ NEW SIGNAL</span>'
          + '<span class="rarity rarity--' + (signal.rarity || 'normal') + '">' + rarityUp + '</span>'
        + '</div>'
        + '<div class="notice-bar__detail">'
          + icon + ' ' + pairLabel + ' <span class="notice-bar__dir">' + dirJp + '</span>'
        + '</div>'
      + '</div>'
      + '<div class="notice-bar__buttons">'
        + '<button type="button" class="notice-bar__btn notice-bar__btn--view" aria-label="シグナルを確認">確認 →</button>'
        + '<button type="button" class="notice-bar__btn notice-bar__btn--dismiss" aria-label="通知を閉じる">×</button>'
      + '</div>';

    // 本体クリック or 「確認」→ 詳細を開く
    card.addEventListener('click', function (e) {
      if (e.target.classList.contains('notice-bar__btn--dismiss')) return;
      handleView(signal.id);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleView(signal.id);
      }
    });
    const dismissBtn = card.querySelector('.notice-bar__btn--dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        handleDismiss(signal.id);
      });
    }
    return card;
  }

  function handleView(signalId) {
    hideInAppNotification(signalId);
    if (viewHandler) {
      try { viewHandler(signalId); } catch (e) { console.error('[Notifications] view handler error', e); }
    }
  }

  function handleDismiss(signalId) {
    hideInAppNotification(signalId);
    if (dismissHandler) {
      try { dismissHandler(signalId); } catch (e) { console.error('[Notifications] dismiss handler error', e); }
    }
  }

  /** 指定シグナルの通知を消す(Level 1 バー側の表示のみ) */
  function hideInAppNotification(signalId) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(CONFIG.containerId);
    if (!container) return;
    const card = container.querySelector('[data-signal-id="' + signalId + '"]');
    if (card) removeCard(card);
  }

  function removeCard(card) {
    if (card._autoHideTimer) { clearTimeout(card._autoHideTimer); card._autoHideTimer = null; }
    card.style.transition = 'opacity ' + CONFIG.animMs + 'ms ease, transform ' + CONFIG.animMs + 'ms ease, margin ' + CONFIG.animMs + 'ms ease';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-16px)';
    const h = card.offsetHeight;
    card.style.marginTop = '-' + h + 'px';
    setTimeout(function () {
      if (card.parentNode) card.parentNode.removeChild(card);
      const container = document.getElementById(CONFIG.containerId);
      if (container) {
        // カード以外(サマリー)は除外して判定
        const remainingCards = container.querySelectorAll('.' + CONFIG.cardClass).length;
        if (remainingCards === 0) {
          const s = container.querySelector('.' + CONFIG.summaryClass);
          if (s) s.remove();
          container.classList.remove('is-visible');
          container.removeAttribute('data-rarity');
        } else {
          updateSummary();
        }
      }
    }, CONFIG.animMs);
  }

  /** 全ての通知を消す */
  function clearAllInAppNotifications() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(CONFIG.containerId);
    if (!container) return;
    Array.prototype.slice.call(container.querySelectorAll('.' + CONFIG.cardClass))
      .forEach(removeCard);
  }

  /* --------------------------------------------------------------------------
   * 5. Level 2 — タブタイトル + ファビコン
   * -------------------------------------------------------------------------- */
  function updateTabTitle(unreadCount) {
    if (typeof document === 'undefined') return;
    const n = Math.max(0, unreadCount | 0);
    const base = originalTitle || CONFIG.baseTitle;
    document.title = n > 0 ? '(' + n + ') ' + base : base;
  }

  function updateFavicon(hasAlert) {
    if (typeof document === 'undefined') return;
    const link = ensureFaviconLink();
    if (!link) return;
    const href = hasAlert ? CONFIG.faviconAlert : CONFIG.faviconNormal;
    if (link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
  }

  /* --------------------------------------------------------------------------
   * 6. 未読カウント制御
   *    - 可視状態: Level 2 はオフ(タイトル/ファビコン通常)
   *    - 非可視 : Level 2 オン(タイトル件数付き、ファビコン alert)
   * -------------------------------------------------------------------------- */
  function setUnreadCount(count) {
    currentUnreadCount = Math.max(0, count | 0);
    applyLevel2();
  }

  function incrementUnreadCount() {
    currentUnreadCount++;
    applyLevel2();
  }

  function resetUnreadCount() {
    currentUnreadCount = 0;
    applyLevel2();
  }

  function applyLevel2() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      updateTabTitle(currentUnreadCount);
      updateFavicon(currentUnreadCount > 0);
    } else {
      updateTabTitle(0);
      updateFavicon(false);
    }
  }

  function getUnreadCount() { return currentUnreadCount; }

  /* --------------------------------------------------------------------------
   * 7. 可視性変更
   * -------------------------------------------------------------------------- */
  function handleVisibilityChange() {
    const isVisible = !document.hidden;
    applyLevel2();
    visibilityHandlers.forEach(function (cb) {
      try { cb(isVisible); } catch (e) { console.error('[Notifications] visibility handler error', e); }
    });
  }

  function onVisibilityChange(callback) {
    if (typeof callback !== 'function') return function () {};
    visibilityHandlers.add(callback);
    return function () { visibilityHandlers.delete(callback); };
  }

  /* --------------------------------------------------------------------------
   * 8. ハンドラ設定
   * -------------------------------------------------------------------------- */
  function setViewHandler(fn)    { viewHandler = typeof fn === 'function' ? fn : null; }
  function setDismissHandler(fn) { dismissHandler = typeof fn === 'function' ? fn : null; }
  function setSummaryHandler(fn) { summaryHandler = typeof fn === 'function' ? fn : null; }

  /* --------------------------------------------------------------------------
   * 9. シグナル「表示済み」マーク(通知バー上からの除去 + カウント減算)
   *    永続化側の status 変更は GameState.markViewed() で呼び出し側が行う
   * -------------------------------------------------------------------------- */
  function markSignalsAsViewed(signalIds) {
    const ids = Array.isArray(signalIds) ? signalIds : [signalIds];
    ids.forEach(function (id) {
      hideInAppNotification(id);
    });
    setUnreadCount(Math.max(0, currentUnreadCount - ids.length));
  }

  /* --------------------------------------------------------------------------
   * 10. 小物ユーティリティ(内部用)
   * -------------------------------------------------------------------------- */
  function formatPair(pair) {
    if (global.GameState && global.GameState.formatPair) return global.GameState.formatPair(pair);
    if (pair === 'USDJPY') return 'USD/JPY';
    if (pair === 'BTCUSD') return 'BTC/USD';
    return pair || '';
  }

  function directionJp(direction) {
    return direction === 'long' ? 'ロング' : 'ショート';
  }

  /* --------------------------------------------------------------------------
   * 11. 公開 API
   * -------------------------------------------------------------------------- */
  /* --------------------------------------------------------------------------
   * Level 3 — Web Notification API (Phase 2)
   * -------------------------------------------------------------------------- */

  // レアリティ別の通知挙動デフォルト
  const RARITY_BEHAVIOR = {
    normal:    { browserNotify: false, vibrate: null,           requireInteraction: false },
    good:      { browserNotify: true,  vibrate: null,           requireInteraction: false },
    rare:      { browserNotify: true,  vibrate: [100, 50, 100], requireInteraction: false },
    epic:      { browserNotify: true,  vibrate: [150, 80, 150, 80, 150], requireInteraction: true },
    legendary: { browserNotify: true,  vibrate: [200,100,200,100,200,100,200], requireInteraction: true }
  };

  function getNotificationSettings() {
    const store = global.TrialStore;
    if (!store) return { enabled: false, rarities: {} };
    const s = store.getState() || {};
    const cfg = (s.settings && s.settings.notifications) || {};
    return {
      enabled:  cfg.enabled !== false,   // 既定で ON
      rarities: cfg.rarities || { normal: false, good: true, rare: true, epic: true, legendary: true }
    };
  }

  function updateNotificationSettings(patch) {
    const store = global.TrialStore;
    if (!store) return;
    const s = store.getState();
    const cur = (s.settings && s.settings.notifications) || {};
    const next = Object.assign({}, cur, patch);
    const settings = Object.assign({}, s.settings || {}, { notifications: next });
    store.setState({ settings: settings });
  }

  function getPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;   // 'default' | 'granted' | 'denied'
  }

  async function requestPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try {
      const p = await Notification.requestPermission();
      const store = global.TrialStore;
      if (store) {
        const s = store.getState();
        const settings = Object.assign({}, s.settings || {}, { notificationsGranted: p === 'granted' });
        store.setState({ settings: settings });
      }
      return p;
    } catch (e) {
      console.warn('[Notifications] requestPermission failed', e);
      return 'default';
    }
  }

  function canPushBrowser() {
    return getPermission() === 'granted' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  function rarityAllowed(rarity) {
    const cfg = getNotificationSettings();
    if (!cfg.enabled) return false;
    const key = String(rarity || '').toLowerCase();
    return cfg.rarities[key] !== false && (RARITY_BEHAVIOR[key] || {}).browserNotify !== false;
  }

  /** シグナル受信時のブラウザ通知。失敗しても例外は投げない */
  async function pushBrowserNotification(signal) {
    if (!signal) return false;
    if (!canPushBrowser()) return false;
    const rarity = String(signal.rarity || 'normal').toLowerCase();
    const behavior = RARITY_BEHAVIOR[rarity] || RARITY_BEHAVIOR.normal;
    if (!behavior.browserNotify) return false;
    if (!rarityAllowed(rarity)) return false;

    const dirJp = directionJp(signal.direction);
    const pairJp = formatPair(signal.pair);
    const rarityLabel = rarity === 'legendary' ? 'LEGENDARY シグナル!'
                      : rarity === 'epic'      ? 'EPIC'
                      : rarity === 'rare'      ? 'RARE'
                      : rarity === 'good'      ? 'GOOD'
                      : '';

    const payload = {
      type: 'show-notification',
      title: '🌈 Rainbow Trial',
      body:  pairJp + ' ' + dirJp + 'シグナル受信' + (rarityLabel ? ' (' + rarityLabel + ')' : ''),
      icon:  'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-72.png',
      tag:   'rainbow-signal-' + signal.id,
      data:  { signalId: signal.id, url: 'index.html#signal-' + signal.id },
      vibrate: behavior.vibrate || undefined,
      requireInteraction: behavior.requireInteraction
    };

    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage(payload);
      } else {
        // SW 未アクティブ時のフォールバック
        new Notification(payload.title, payload);
      }
      return true;
    } catch (e) {
      console.warn('[Notifications] browser push failed', e);
      return false;
    }
  }

  /** Service Worker からの notification-click を受け取る入口 */
  function bindServiceWorkerMessages(onSignalOpen) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', function (ev) {
      const d = ev.data || {};
      if (d.type === 'notification-click' && d.signalId != null && typeof onSignalOpen === 'function') {
        onSignalOpen(d.signalId);
      }
    });
  }

  const Notifications = {
    // 初期化
    init: init,

    // Level 1
    showInAppNotification:      showInAppNotification,
    hideInAppNotification:      hideInAppNotification,
    clearAllInAppNotifications: clearAllInAppNotifications,

    // Level 2
    updateTabTitle: updateTabTitle,
    updateFavicon:  updateFavicon,

    // Level 3 (Phase 2)
    getPermission:             getPermission,
    requestPermission:         requestPermission,
    canPushBrowser:            canPushBrowser,
    pushBrowserNotification:   pushBrowserNotification,
    rarityAllowed:             rarityAllowed,
    getNotificationSettings:   getNotificationSettings,
    updateNotificationSettings: updateNotificationSettings,
    bindServiceWorkerMessages: bindServiceWorkerMessages,
    RARITY_BEHAVIOR:           RARITY_BEHAVIOR,

    // 未読カウント
    setUnreadCount:       setUnreadCount,
    incrementUnreadCount: incrementUnreadCount,
    resetUnreadCount:     resetUnreadCount,
    getUnreadCount:       getUnreadCount,

    // 可視性
    onVisibilityChange: onVisibilityChange,
    isHidden: function () {
      return typeof document !== 'undefined' ? document.hidden : false;
    },

    // ハンドラ設定
    setViewHandler:    setViewHandler,
    setDismissHandler: setDismissHandler,
    setSummaryHandler: setSummaryHandler,

    // まとめ操作
    markSignalsAsViewed: markSignalsAsViewed,
    updateSummary:       updateSummary,

    // 設定取得
    getConfig: function () { return Object.assign({}, CONFIG); }
  };

  global.Notifications = Notifications;

})(typeof window !== 'undefined' ? window : this);
