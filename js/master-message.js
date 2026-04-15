/* ==========================================================================
 * Rainbow Trial — js/master-message.js
 * サロンマスター「ひかり」からのメッセージシステム
 *
 * 機能:
 *   - ホーム画面にメッセージプレビューカードを表示
 *   - 全文モーダル表示(NEW アニメーション付き)
 *   - Day ごとのトリガー管理
 *   - 条件発動トリガー(連敗、LEGENDARY、連勝、スコア)
 *   - メッセージ履歴保持
 *
 * 依存: window.HIKARI_MESSAGES / window.getHikariMessageForDay etc. (data/master-messages.js)
 *       window.TrialStore (js/storage.js)
 *       window.GameState  (js/game-state.js)
 *       window.SoundSystem (js/sound.js)
 *
 * 公開グローバル: window.HikariMessage
 * ========================================================================== */

(function (global) {
  'use strict';

  var LINE_URL = 'https://lin.ee/xGQTHY1';

  /* --------------------------------------------------------------------------
   * 1. storage ヘルパー
   *    設定キー: settings.hikari = { shown:{id:isoStr}, unreadIds:[], history:[{id,receivedAt}] }
   * -------------------------------------------------------------------------- */
  function _getHikariState() {
    var s = global.TrialStore.getState();
    var h = (s.settings && s.settings.hikari) || {};
    return {
      shown:     h.shown     || {},
      unreadIds: h.unreadIds || [],
      history:   h.history   || []
    };
  }

  function _saveHikariState(hs) {
    global.TrialStore.setState({ settings: { hikari: hs } });
  }

  function _isShown(id) {
    return !!(_getHikariState().shown[id]);
  }

  function _markShown(id) {
    var hs = _getHikariState();
    hs.shown[id] = new Date().toISOString();
    // 未読リストに追加
    if (hs.unreadIds.indexOf(id) < 0) hs.unreadIds.push(id);
    // 履歴に追加(重複防止)
    var alreadyInHistory = hs.history.some(function (h) { return h.id === id; });
    if (!alreadyInHistory) {
      hs.history.unshift({ id: id, receivedAt: new Date().toISOString() });
      if (hs.history.length > 20) hs.history = hs.history.slice(0, 20);
    }
    _saveHikariState(hs);
  }

  function _markRead(id) {
    var hs = _getHikariState();
    hs.unreadIds = hs.unreadIds.filter(function (x) { return x !== id; });
    _saveHikariState(hs);
  }

  function _getUnreadCount() {
    return _getHikariState().unreadIds.length;
  }

  /* --------------------------------------------------------------------------
   * 2. 変数補間ヘルパー
   * -------------------------------------------------------------------------- */
  function _buildVars(day) {
    var state = global.TrialStore.getState();
    var gs    = state.gameStats || {};
    var snap  = global.GameState && global.GameState.snapshot();

    // Day 1 のトレード数(dailyStats から取得)
    var dailyStats   = gs.dailyStats || {};
    var day1Entries  = (dailyStats['day1'] && dailyStats['day1'].entries) || gs.totalEntries || 0;

    // 現在スコアとランク
    var score = gs.judgmentScore || 0;
    var rank  = '--';
    if (global.FinalScreen && global.FinalScreen.getRank) {
      var ri = global.FinalScreen.getRank(score);
      rank = ri ? ri.label : '--';
    }

    return {
      nickname:    (state.user && state.user.nickname) || 'トレーダー',
      day1_trades: day1Entries,
      score:       score,
      rank:        rank
    };
  }

  /* --------------------------------------------------------------------------
   * 3. Day トリガーチェック
   * -------------------------------------------------------------------------- */
  function checkAndShowDay(day) {
    if (typeof day !== 'number') return;
    var msg = global.getHikariMessageForDay && global.getHikariMessageForDay(day);
    if (!msg) return;
    if (_isShown(msg.id)) return;

    _markShown(msg.id);
    var vars = _buildVars(day);
    var interpolated = global.interpolateHikariMessage
      ? global.interpolateHikariMessage(msg, vars)
      : msg;

    // 少し遅らせてモーダル表示
    setTimeout(function () { showModal(interpolated); }, 1000);
  }

  /* --------------------------------------------------------------------------
   * 4. 条件トリガーチェック
   * -------------------------------------------------------------------------- */
  function checkConditional(trigger) {
    var msg = global.getHikariMessageByTrigger && global.getHikariMessageByTrigger(trigger);
    if (!msg) return;
    if (_isShown(msg.id)) return;

    _markShown(msg.id);
    var vars = _buildVars(null);
    var interpolated = global.interpolateHikariMessage
      ? global.interpolateHikariMessage(msg, vars)
      : msg;

    setTimeout(function () { showModal(interpolated); }, 800);
  }

  /* --------------------------------------------------------------------------
   * 5. ホームカード HTML 生成
   * -------------------------------------------------------------------------- */
  function renderHomeCard(container) {
    if (!container) return;
    var hs = _getHikariState();
    var history = hs.history;

    if (history.length === 0) return; // まだメッセージなし

    // 最新メッセージ
    var latestId  = history[0].id;
    var latestMsg = global.getHikariMessageById && global.getHikariMessageById(latestId);
    if (!latestMsg) return;

    var vars = _buildVars(null);
    var interpolated = global.interpolateHikariMessage
      ? global.interpolateHikariMessage(latestMsg, vars)
      : latestMsg;

    var unreadCount = _getUnreadCount();
    var isUnread    = hs.unreadIds.indexOf(latestId) >= 0;

    // プレビューテキスト(body の最初の非空行)
    var previewLine = '';
    for (var i = 0; i < interpolated.body.length; i++) {
      if (interpolated.body[i].trim()) { previewLine = interpolated.body[i]; break; }
    }
    if (previewLine.length > 40) previewLine = previewLine.slice(0, 40) + '…';

    container.innerHTML =
      '<div class="hikari-card card" id="hikari-home-card">' +
        '<div class="hikari-card__header">' +
          '<span class="hikari-card__icon">💌</span>' +
          '<span class="hikari-card__title">ひかりさんからのメッセージ</span>' +
          (unreadCount > 0
            ? '<span class="hikari-card__badge">' + unreadCount + '</span>'
            : '') +
        '</div>' +
        '<div class="hikari-card__body">' +
          '<div class="hikari-card__avatar-wrap">' +
            '<img src="assets/master/hikari-avatar.svg" class="hikari-card__avatar" alt="ひかり" width="44" height="44">' +
            (isUnread ? '<span class="hikari-card__unread-dot" aria-label="未読"></span>' : '') +
          '</div>' +
          '<div class="hikari-card__text">' +
            '<div class="hikari-card__name">ひかり</div>' +
            '<div class="hikari-card__subject">' + _esc(interpolated.subject) + '</div>' +
            '<div class="hikari-card__preview">' + _esc(previewLine) + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="hikari-card__read-btn" type="button" aria-label="全文を読む">全文を読む →</button>' +
      '</div>';

    var btn = container.querySelector('.hikari-card__read-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        _markRead(latestId);
        showModal(interpolated);
        // バッジを再描画(hooks 側で呼ぶ)
        if (global.HikariMessage && global.HikariMessage._refreshHomeCard) {
          setTimeout(global.HikariMessage._refreshHomeCard, 400);
        }
      });
    }
  }

  /* --------------------------------------------------------------------------
   * 6. 全文モーダル
   * -------------------------------------------------------------------------- */
  function showModal(msg) {
    var existing = document.getElementById('hikari-modal-overlay');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id        = 'hikari-modal-overlay';
    overlay.className = 'hikari-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'hikari-modal-title');

    var bodyHTML = msg.body.map(function (line) {
      return line === '' ? '<br>' : '<p>' + _esc(line) + '</p>';
    }).join('');

    var lineHintHTML = msg.showLineHint
      ? '<div class="hikari-modal__line-hint">' +
          '<a href="' + LINE_URL + '" target="_blank" rel="noopener" class="hikari-modal__line-link">詳しく見る →</a>' +
        '</div>'
      : '';

    overlay.innerHTML =
      '<div class="hikari-overlay__card">' +
        '<div class="hikari-modal__header">' +
          '<div class="hikari-modal__avatar-wrap">' +
            '<img src="assets/master/hikari-avatar.svg" class="hikari-modal__avatar" alt="ひかり" width="64" height="64">' +
          '</div>' +
          '<div class="hikari-modal__meta">' +
            '<div class="hikari-modal__badge">' + _esc(msg.badge || '') + '</div>' +
            '<div class="hikari-modal__name">ひかり</div>' +
          '</div>' +
        '</div>' +
        '<h2 id="hikari-modal-title" class="hikari-modal__subject">' + _esc(msg.subject || '') + '</h2>' +
        '<div class="hikari-modal__body">' + bodyHTML + '</div>' +
        lineHintHTML +
        '<div class="hikari-modal__from">' + _esc(msg.from || '') + '</div>' +
        '<button class="btn btn--primary btn--block hikari-modal__close" type="button">読んだ！</button>' +
      '</div>';

    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      overlay.classList.add('hikari-overlay--enter');
    });

    if (global.SoundSystem) global.SoundSystem.play('notification');

    var closeBtn = overlay.querySelector('.hikari-modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { _closeModal(overlay); });
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeModal(overlay);
    });
  }

  function _closeModal(overlay) {
    overlay.classList.add('hikari-overlay--leave');
    overlay.addEventListener('transitionend', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, { once: true });
  }

  /* --------------------------------------------------------------------------
   * 7. 履歴一覧モーダル
   * -------------------------------------------------------------------------- */
  function showHistory() {
    var hs = _getHikariState();
    var history = hs.history;

    var existing = document.getElementById('hikari-history-overlay');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id        = 'hikari-history-overlay';
    overlay.className = 'hikari-overlay hikari-history-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var listHTML = '';
    if (history.length === 0) {
      listHTML = '<p class="hikari-history__empty">まだメッセージはありません</p>';
    } else {
      history.forEach(function (item) {
        var msg = global.getHikariMessageById && global.getHikariMessageById(item.id);
        if (!msg) return;
        var vars = _buildVars(null);
        var m = global.interpolateHikariMessage ? global.interpolateHikariMessage(msg, vars) : msg;
        var isUnread = hs.unreadIds.indexOf(item.id) >= 0;
        listHTML +=
          '<div class="hikari-history__item' + (isUnread ? ' hikari-history__item--unread' : '') + '" data-id="' + item.id + '">' +
            '<div class="hikari-history__item-badge">' + _esc(m.badge || '') + '</div>' +
            '<div class="hikari-history__item-subject">' + _esc(m.subject) + '</div>' +
            (isUnread ? '<span class="hikari-history__dot"></span>' : '') +
          '</div>';
      });
    }

    overlay.innerHTML =
      '<div class="hikari-overlay__card hikari-overlay__card--history">' +
        '<div class="hikari-history__head">' +
          '<img src="assets/master/hikari-avatar.svg" width="36" height="36" alt="ひかり">' +
          '<span class="hikari-history__title">ひかりからのメッセージ履歴</span>' +
          '<button class="hikari-history__close btn" type="button" aria-label="閉じる">×</button>' +
        '</div>' +
        '<div class="hikari-history__list">' + listHTML + '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('hikari-overlay--enter'); });

    // 各アイテムをクリックで全文表示
    overlay.querySelectorAll('.hikari-history__item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id  = el.getAttribute('data-id');
        var msg = global.getHikariMessageById && global.getHikariMessageById(id);
        if (!msg) return;
        _markRead(id);
        var vars = _buildVars(null);
        var m = global.interpolateHikariMessage ? global.interpolateHikariMessage(msg, vars) : msg;
        _closeModal(overlay);
        setTimeout(function () { showModal(m); }, 200);
      });
    });

    var closeBtn = overlay.querySelector('.hikari-history__close');
    if (closeBtn) closeBtn.addEventListener('click', function () { _closeModal(overlay); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeModal(overlay);
    });
  }

  /* --------------------------------------------------------------------------
   * 8. ユーティリティ
   * -------------------------------------------------------------------------- */
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* --------------------------------------------------------------------------
   * 9. 公開 API
   * -------------------------------------------------------------------------- */
  var HikariMessage = {
    checkAndShowDay:  checkAndShowDay,
    checkConditional: checkConditional,
    showModal:        showModal,
    showHistory:      showHistory,
    renderHomeCard:   renderHomeCard,
    getUnreadCount:   _getUnreadCount,

    // 旧 API 互換(phase4-hooks.js が MasterMessage.checkAndShow を呼ぶ)
    checkAndShow: checkAndShowDay
  };

  global.HikariMessage = HikariMessage;

  // 旧 API 互換(古い phase4-hooks.js が MasterMessage で参照する場合)
  global.MasterMessage = HikariMessage;

})(typeof window !== 'undefined' ? window : this);
