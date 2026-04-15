/* ==========================================================================
 * Rainbow Trial — js/members-feed.js
 * Rainbow Salon ライブフィード表示
 *
 * 依存: window.SALON_FEED_DATA (data/members-feed.js)
 *       window.TrialStore      (js/storage.js)
 *
 * 公開グローバル: window.SalonFeed
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. フィードカード HTML 生成
   * -------------------------------------------------------------------------- */
  function renderFeedCard(container) {
    if (!container) return;
    if (!global.SALON_FEED_DATA) return;

    var items = global.SALON_FEED_DATA.generateFeedItems(5);
    var onlineCount = global.SALON_FEED_DATA.getOnlineCount();

    var html = '';
    html += '<div class="salon-feed-card card">';
    html += '<div class="salon-feed__header">';
    html += '<span class="salon-feed__icon">📡</span>';
    html += '<span class="salon-feed__title">Rainbow Salon ライブフィード</span>';
    html += '<span class="salon-feed__live">● LIVE</span>';
    html += '</div>';
    html += '<div class="salon-feed__list" id="salon-feed-list">';
    items.forEach(function (item) {
      html += _buildFeedItem(item);
    });
    html += '</div>';
    html += '<div class="salon-feed__footer">';
    html += '<span class="salon-feed__online">👥 オンライン: <strong id="salon-online-count">' + onlineCount + '</strong>名</span>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
  }

  function _buildFeedItem(item) {
    var sign  = item.isWin ? '+' : '-';
    var cls   = 'salon-feed__item ' + (item.isWin ? 'salon-feed__item--win' : 'salon-feed__item--lose');
    var pnlCls = item.isWin ? 'salon-feed__pips--win' : 'salon-feed__pips--lose';

    return (
      '<div class="' + cls + '">' +
        '<div class="salon-feed__avatar">' + item.avatar + '</div>' +
        '<div class="salon-feed__body">' +
          '<div class="salon-feed__member">' +
            '<span class="salon-feed__name">' + _esc(item.name) + 'さん</span>' +
            '<span class="' + pnlCls + '">' + sign + item.pips + 'pips</span>' +
          '</div>' +
          '<div class="salon-feed__detail">' +
            item.pair + ' ' + item.direction +
            (item.special ? ' — ' + _esc(item.special) : '') +
          '</div>' +
        '</div>' +
        '<div class="salon-feed__time">' + item.timeAgo + '</div>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 2. シグナル連動フィード挿入
   * (ユーザーがトレード完了した直後に呼ぶ)
   * -------------------------------------------------------------------------- */
  function injectSignalLinkedItems(signal, userPips) {
    if (!global.SALON_FEED_DATA) return;
    var list = document.getElementById('salon-feed-list');
    if (!list) return;

    var items = global.SALON_FEED_DATA.generateSignalLinkedItems(signal, userPips);
    items.forEach(function (item, i) {
      setTimeout(function () {
        var el = document.createElement('div');
        el.innerHTML = _buildFeedItem(item);
        var node = el.firstChild;
        if (!node) return;
        node.classList.add('salon-feed__item--new');
        list.insertBefore(node, list.firstChild);
        requestAnimationFrame(function () {
          node.classList.add('salon-feed__item--enter');
        });
        // 最大 8 件
        var children = list.querySelectorAll('.salon-feed__item');
        for (var j = 8; j < children.length; j++) {
          children[j].parentNode.removeChild(children[j]);
        }
      }, i * 1500);
    });
  }

  /* --------------------------------------------------------------------------
   * 3. 定期リフレッシュ(45秒ごとに 1 件追加、オンライン人数も更新)
   * -------------------------------------------------------------------------- */
  var _refreshTimer  = null;
  var _onlineTimer   = null;

  function startRefresh() {
    stopRefresh(); // 二重タイマー防止

    _refreshTimer = setInterval(function () {
      var list = document.getElementById('salon-feed-list');
      if (!list) { stopRefresh(); return; }
      if (!global.SALON_FEED_DATA) return;

      var newItems = global.SALON_FEED_DATA.generateFeedItems(1, Date.now());
      var item = newItems[0];
      if (!item) return;

      var el = document.createElement('div');
      el.innerHTML = _buildFeedItem(item);
      var node = el.firstChild;
      if (!node) return;

      node.classList.add('salon-feed__item--new');
      list.insertBefore(node, list.firstChild);

      // 最大 8 件
      var children = list.querySelectorAll('.salon-feed__item');
      for (var i = 8; i < children.length; i++) {
        children[i].parentNode.removeChild(children[i]);
      }

      requestAnimationFrame(function () {
        node.classList.add('salon-feed__item--enter');
      });
    }, 45000);

    // オンライン人数を 60 秒ごとに更新
    _onlineTimer = setInterval(function () {
      var el = document.getElementById('salon-online-count');
      if (el && global.SALON_FEED_DATA) {
        el.textContent = global.SALON_FEED_DATA.getOnlineCount();
      }
    }, 60000);
  }

  function stopRefresh() {
    if (_refreshTimer)  { clearInterval(_refreshTimer);  _refreshTimer  = null; }
    if (_onlineTimer)   { clearInterval(_onlineTimer);   _onlineTimer   = null; }
  }

  /* --------------------------------------------------------------------------
   * 4. ユーティリティ
   * -------------------------------------------------------------------------- */
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* --------------------------------------------------------------------------
   * 5. 公開 API
   * -------------------------------------------------------------------------- */
  var SalonFeed = {
    renderFeedCard:           renderFeedCard,
    injectSignalLinkedItems:  injectSignalLinkedItems,
    startRefresh:             startRefresh,
    stopRefresh:              stopRefresh
  };

  global.SalonFeed  = SalonFeed;

  // 旧互換
  global.MembersFeed = {
    renderFeedCard:  renderFeedCard,
    startRefresh:    startRefresh,
    stopRefresh:     stopRefresh,
    buildFeedItem:   _buildFeedItem
  };

})(typeof window !== 'undefined' ? window : this);
