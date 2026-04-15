/* ==========================================================================
 * Rainbow Trial — js/stats.js
 * Phase 3 統計画面 — Canvas グラフ + サマリー
 *
 * 依存: window.TrialStore      (js/storage.js)
 *       window.JudgmentScore   (js/judgment-score.js)
 *       window.AchievementSystem (js/achievements.js)
 *
 * 公開グローバル: window.StatsPanel
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. レアリティ別カラー
   * -------------------------------------------------------------------------- */
  var RARITY_COLORS = {
    normal:    '#78909C',
    good:      '#42A5F5',
    rare:      '#AB47BC',
    epic:      '#FF7043',
    legendary: '#FFD700'
  };

  var RARITY_LABELS = {
    normal:    'NORMAL',
    good:      'GOOD',
    rare:      'RARE',
    epic:      'EPIC',
    legendary: 'LEGENDARY'
  };

  /* --------------------------------------------------------------------------
   * 2. メインレンダリング
   * -------------------------------------------------------------------------- */
  function render(container) {
    if (!container) return;
    var state = global.TrialStore.getState();
    var trades = state.trades || [];
    var gs     = state.gameStats || {};

    var html = '<div class="stats-page">';
    html += _renderSummary(state, trades, gs);
    html += _renderRarityStats(trades);
    html += _renderPairStats(trades);
    html += _renderJudgmentSection(state);
    html += '</div>';

    container.innerHTML = html;

    // Canvas グラフ描画(DOM挿入後に実行)
    requestAnimationFrame(function () {
      _drawCapitalChart(state, trades);
      _drawWinRateChart(trades);
    });
  }

  /* --------------------------------------------------------------------------
   * 3. サマリーセクション
   * -------------------------------------------------------------------------- */
  function _renderSummary(state, trades, gs) {
    var realTrades = trades.filter(function (t) { return t.type !== 'skip'; });
    var wins       = realTrades.filter(function (t) { return t.result === 'tp_hit'; }).length;
    var losses     = realTrades.filter(function (t) { return t.result === 'sl_hit'; }).length;
    var skips      = trades.filter(function (t) { return t.type === 'skip'; }).length;
    var winRate    = realTrades.length > 0 ? (wins / realTrades.length * 100).toFixed(1) : '--';
    var capital    = state.account ? state.account.currentCapital : 300000;
    var totalPnL   = state.account ? state.account.totalPnL : 0;
    var pnlSign    = totalPnL >= 0 ? '+' : '';
    var pnlClass   = totalPnL >= 0 ? 'color-win' : 'color-lose';
    var maxWin     = gs.maxStreak    || 0;
    var maxLose    = gs.maxLoseStreak || 0;

    var html = '<div class="stats-section">';
    html += '<div class="stats-section__title">📊 サマリー</div>';
    html += '<div class="stats-summary-grid">';

    html += _summaryCard('総トレード数', realTrades.length + '回', '');
    html += _summaryCard('勝率', winRate + '%', winRate !== '--' && parseFloat(winRate) >= 50 ? 'color-win' : 'color-lose');
    html += _summaryCard('勝ち / 負け', wins + ' / ' + losses, '');
    html += _summaryCard('見送り', skips + '回', '');
    html += _summaryCard('仮想資金', '¥' + capital.toLocaleString(), '');
    html += _summaryCard('累計損益', pnlSign + '¥' + Math.abs(totalPnL).toLocaleString(), pnlClass);
    html += _summaryCard('最大連勝', maxWin + '連勝', maxWin >= 3 ? 'color-win' : '');
    html += _summaryCard('最大連敗', maxLose + '連敗', maxLose >= 3 ? 'color-lose' : '');

    html += '</div></div>';
    return html;
  }

  function _summaryCard(label, value, cls) {
    return (
      '<div class="stats-card">' +
        '<div class="stats-card__label">' + label + '</div>' +
        '<div class="stats-card__value ' + (cls || '') + '">' + value + '</div>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 4. 資金推移グラフ (Canvas)
   * -------------------------------------------------------------------------- */
  function _renderCapitalChart() {
    return (
      '<div class="stats-section">' +
        '<div class="stats-section__title">💰 資金推移</div>' +
        '<div class="stats-chart-wrap">' +
          '<canvas id="capital-chart" height="160"></canvas>' +
        '</div>' +
      '</div>'
    );
  }

  function _drawCapitalChart(state, trades) {
    var canvas = document.getElementById('capital-chart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth || (canvas.parentElement && canvas.parentElement.offsetWidth) || 340;

    // データ構築: 初期値 → 各トレード後の残高
    var points = [{ label: 'START', capital: 300000 }];
    var capital = 300000;

    var realTrades = trades.filter(function (t) { return t.type !== 'skip'; });
    realTrades.forEach(function (t, i) {
      capital += (t.pnl || 0);
      points.push({ label: '#' + (i + 1), capital: Math.round(capital) });
    });

    // capitalHistory がある場合はそちらを優先
    var gs = state.gameStats || {};
    if (gs.capitalHistory && gs.capitalHistory.length > 1) {
      points = gs.capitalHistory;
    }

    if (points.length < 2) {
      ctx.fillStyle = '#555';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('トレードデータがありません', canvas.width / 2, 80);
      return;
    }

    _drawLineChart(ctx, canvas.width, canvas.height || 160, points, function (p) { return p.capital; }, {
      baselineValue: 300000,
      colorAbove:    '#4CAF50',
      colorBelow:    '#F44336',
      baseColor:     'rgba(255,255,255,0.1)',
      labelColor:    '#888',
      gridColor:     'rgba(255,255,255,0.06)'
    });
  }

  /* --------------------------------------------------------------------------
   * 5. 勝率推移グラフ (Canvas)
   * -------------------------------------------------------------------------- */
  function _renderWinRateChart() {
    return (
      '<div class="stats-section">' +
        '<div class="stats-section__title">📈 勝率推移</div>' +
        '<div class="stats-chart-wrap">' +
          '<canvas id="winrate-chart" height="140"></canvas>' +
        '</div>' +
      '</div>'
    );
  }

  function _drawWinRateChart(trades) {
    var canvas = document.getElementById('winrate-chart');
    if (!canvas) return;
    var ctx    = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || (canvas.parentElement && canvas.parentElement.offsetWidth) || 340;

    var realTrades = trades.filter(function (t) { return t.type !== 'skip'; });
    if (realTrades.length < 3) {
      ctx.fillStyle = '#555';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3トレード以上で表示されます', canvas.width / 2, 70);
      return;
    }

    // 累積勝率を各トレードで算出
    var points = [];
    var wins   = 0;
    realTrades.forEach(function (t, i) {
      if (t.result === 'tp_hit') wins++;
      points.push({ label: '#' + (i + 1), capital: wins / (i + 1) * 100 });
    });

    _drawLineChart(ctx, canvas.width, canvas.height || 140, points, function (p) { return p.capital; }, {
      baselineValue: 50,
      colorAbove:    '#4CAF50',
      colorBelow:    '#F44336',
      baseColor:     'rgba(255,255,255,0.1)',
      labelColor:    '#888',
      gridColor:     'rgba(255,255,255,0.06)',
      yMin:          0,
      yMax:          100,
      yUnit:         '%'
    });
  }

  /* --------------------------------------------------------------------------
   * 6. 汎用折れ線グラフ描画ユーティリティ
   * -------------------------------------------------------------------------- */
  function _drawLineChart(ctx, w, h, points, getValue, opts) {
    opts = opts || {};
    var pad   = { top: 16, right: 16, bottom: 28, left: 52 };
    var cw    = w - pad.left - pad.right;
    var ch    = h - pad.top  - pad.bottom;

    var values   = points.map(getValue);
    var rawMin   = Math.min.apply(null, values);
    var rawMax   = Math.max.apply(null, values);
    var baseline = opts.baselineValue != null ? opts.baselineValue : rawMin;

    var yMin = opts.yMin != null ? opts.yMin : Math.min(rawMin, baseline) * 0.97;
    var yMax = opts.yMax != null ? opts.yMax : Math.max(rawMax, baseline) * 1.03;
    if (yMax === yMin) { yMax = yMin + 1; }

    var yUnit = opts.yUnit || '';

    function toX(i)   { return pad.left + (i / (points.length - 1)) * cw; }
    function toY(val) { return pad.top  + ch - ((val - yMin) / (yMax - yMin)) * ch; }

    // 背景グリッド
    ctx.strokeStyle = opts.gridColor || 'rgba(255,255,255,0.07)';
    ctx.lineWidth   = 1;
    for (var gi = 0; gi <= 4; gi++) {
      var gy = pad.top + (ch / 4) * gi;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(pad.left + cw, gy);
      ctx.stroke();

      // Y軸ラベル
      var yVal = yMax - (yMax - yMin) * (gi / 4);
      ctx.fillStyle = opts.labelColor || '#888';
      ctx.font      = '10px monospace';
      ctx.textAlign = 'right';
      if (yUnit === '%') {
        ctx.fillText(yVal.toFixed(0) + '%', pad.left - 4, gy + 4);
      } else {
        ctx.fillText((yVal >= 10000 ? (yVal / 10000).toFixed(0) + '万' : yVal.toFixed(0)), pad.left - 4, gy + 4);
      }
    }

    // ベースライン
    if (opts.baselineValue != null) {
      var by = toY(baseline);
      ctx.strokeStyle = opts.baseColor || 'rgba(255,255,255,0.2)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, by);
      ctx.lineTo(pad.left + cw, by);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 折れ線(上下で色分け)
    if (points.length >= 2) {
      for (var i = 0; i < points.length - 1; i++) {
        var x1 = toX(i),     y1 = toY(getValue(points[i]));
        var x2 = toX(i + 1), y2 = toY(getValue(points[i + 1]));
        var isAbove = getValue(points[i]) >= baseline;
        ctx.strokeStyle = isAbove ? (opts.colorAbove || '#4CAF50') : (opts.colorBelow || '#F44336');
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // ドット
    ctx.lineWidth = 1;
    for (var j = 0; j < points.length; j++) {
      var dx = toX(j), dy = toY(getValue(points[j]));
      var isUp = getValue(points[j]) >= baseline;
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fillStyle = isUp ? (opts.colorAbove || '#4CAF50') : (opts.colorBelow || '#F44336');
      ctx.fill();
    }

    // X軸ラベル(最初・最後・中間)
    ctx.fillStyle = opts.labelColor || '#888';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    var labelIdx  = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    labelIdx.forEach(function (idx) {
      if (idx < points.length) {
        ctx.fillText(points[idx].label || '', toX(idx), h - 4);
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 7. レアリティ別成績
   * -------------------------------------------------------------------------- */
  function _renderRarityStats(trades) {
    var rarities = ['normal', 'good', 'rare', 'epic', 'legendary'];
    var html = '<div class="stats-section">';
    html += '<div class="stats-section__title">✨ レアリティ別成績</div>';
    html += '<div class="stats-rarity-list">';

    rarities.forEach(function (r) {
      var rTrades = trades.filter(function (t) { return t.rarity === r; });
      var entries = rTrades.filter(function (t) { return t.type !== 'skip'; });
      var wins    = entries.filter(function (t) { return t.result === 'tp_hit'; }).length;
      var pnl     = entries.reduce(function (s, t) { return s + (t.pnl || 0); }, 0);
      var rate    = entries.length > 0 ? Math.round(wins / entries.length * 100) : null;
      var color   = RARITY_COLORS[r] || '#888';

      html += '<div class="stats-rarity-row">';
      html += '<span class="stats-rarity-row__name" style="color:' + color + '">' + (RARITY_LABELS[r] || r) + '</span>';
      html += '<span class="stats-rarity-row__count">' + rTrades.length + '件</span>';
      html += '<span class="stats-rarity-row__entry">' + entries.length + 'エントリー</span>';
      html += '<span class="stats-rarity-row__rate ' + (rate !== null && rate >= 50 ? 'color-win' : 'color-lose') + '">';
      html += rate !== null ? rate + '%' : '--';
      html += '</span>';
      html += '<span class="stats-rarity-row__pnl ' + (pnl >= 0 ? 'color-win' : 'color-lose') + '">';
      html += (pnl >= 0 ? '+' : '') + '¥' + Math.abs(pnl).toLocaleString();
      html += '</span>';
      html += _barHTML(rate !== null ? rate : 0, color);
      html += '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function _barHTML(pct, color) {
    var filled = Math.round(Math.max(0, Math.min(100, pct)) / 10);
    var bar    = '━'.repeat(filled) + '░'.repeat(10 - filled);
    return '<span class="stats-bar" style="color:' + color + '">' + bar + '</span>';
  }

  /* --------------------------------------------------------------------------
   * 8. 通貨ペア別成績
   * -------------------------------------------------------------------------- */
  function _renderPairStats(trades) {
    var pairs = ['USDJPY', 'BTCUSD'];
    var html  = '<div class="stats-section">';
    html += '<div class="stats-section__title">💱 通貨ペア別成績</div>';
    html += '<div class="stats-pair-grid">';

    pairs.forEach(function (pair) {
      var pTrades = trades.filter(function (t) { return t.pair === pair; });
      var entries = pTrades.filter(function (t) { return t.type !== 'skip'; });
      var wins    = entries.filter(function (t) { return t.result === 'tp_hit'; }).length;
      var pnl     = entries.reduce(function (s, t) { return s + (t.pnl || 0); }, 0);
      var rate    = entries.length > 0 ? Math.round(wins / entries.length * 100) : null;
      var pnlSign = pnl >= 0 ? '+' : '';

      html += '<div class="stats-pair-card card">';
      html += '<div class="stats-pair-card__name">' + pair + '</div>';
      html += '<div class="stats-pair-card__row"><span>エントリー</span><strong>' + entries.length + '回</strong></div>';
      html += '<div class="stats-pair-card__row"><span>勝率</span><strong class="' + (rate !== null && rate >= 50 ? 'color-win' : 'color-lose') + '">' + (rate !== null ? rate + '%' : '--') + '</strong></div>';
      html += '<div class="stats-pair-card__row"><span>損益</span><strong class="' + (pnl >= 0 ? 'color-win' : 'color-lose') + '">' + pnlSign + '¥' + Math.abs(pnl).toLocaleString() + '</strong></div>';
      html += '</div>';
    });

    html += '</div></div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * 9. 判定スコアセクション
   * -------------------------------------------------------------------------- */
  function _renderJudgmentSection(state) {
    if (!global.JudgmentScore) return '';
    return (
      '<div class="stats-section">' +
        global.JudgmentScore.renderScoreDetail(state) +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 10. 全体 HTML の組み立て(chart セクションも含む)
   * -------------------------------------------------------------------------- */
  function _buildFullHTML(state, trades, gs) {
    var html = '<div class="stats-page">';
    html += _renderSummary(state, trades, gs);
    html += _renderCapitalChart();
    html += _renderWinRateChart();
    html += _renderRarityStats(trades);
    html += _renderPairStats(trades);
    html += _renderJudgmentSection(state);
    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * 11. 公開 render をオーバーライドして chart も含める
   * -------------------------------------------------------------------------- */
  function render(container) {
    if (!container) return;
    var state  = global.TrialStore.getState();
    var trades = state.trades || [];
    var gs     = state.gameStats || {};

    container.innerHTML = _buildFullHTML(state, trades, gs);

    requestAnimationFrame(function () {
      _drawCapitalChart(state, trades);
      _drawWinRateChart(trades);
    });
  }

  /* --------------------------------------------------------------------------
   * 12. 公開 API
   * -------------------------------------------------------------------------- */
  var StatsPanel = {
    render: render
  };

  global.StatsPanel = StatsPanel;

})(typeof window !== 'undefined' ? window : this);
