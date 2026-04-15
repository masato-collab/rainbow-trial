/* ==========================================================================
 * Rainbow Trial — js/result-card.js
 * 結果カード生成(Canvas API)とダウンロード機能
 *
 * 仕様:
 *   - 1080 x 1080 px (正方形)
 *   - ダウンロードのみ(SNS シェアなし)
 *   - devicePixelRatio 対応
 *
 * 公開グローバル: window.ResultCard
 * ========================================================================== */

(function (global) {
  'use strict';

  var W = 1080, H = 1080;

  /* --------------------------------------------------------------------------
   * 1. Canvas 生成
   * -------------------------------------------------------------------------- */
  function generate(opts) {
    opts = opts || {};
    var nickname   = opts.nickname   || 'トレーダー';
    var rank       = opts.rank       || { label: '-', color: '#9775FA', icon: '🌱', title: '見習いトレーダー' };
    var stats      = opts.stats      || {};
    var gs         = opts.gs         || {};
    var score      = opts.score      || 0;
    var levelInfo  = opts.levelInfo  || { level: 1, icon: '🌱', title: '見習いトレーダー' };

    var canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    var ctx = canvas.getContext('2d');

    _drawBackground(ctx);
    _drawRainbowBorder(ctx);
    _drawHeader(ctx, nickname);
    _drawRankBadge(ctx, rank);
    _drawStats(ctx, stats, gs, score);
    _drawLevel(ctx, levelInfo);
    _drawGrowthMini(ctx, gs);
    _drawFooter(ctx);

    return canvas;
  }

  /* --------------------------------------------------------------------------
   * 2. 描画パーツ
   * -------------------------------------------------------------------------- */
  function _drawBackground(ctx) {
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#0A0A1A');
    bg.addColorStop(0.5, '#12122E');
    bg.addColorStop(1,   '#0A0A1A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 光彩
    var radial = ctx.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, W * 0.6);
    radial.addColorStop(0,   'rgba(151,117,250,0.12)');
    radial.addColorStop(1,   'rgba(151,117,250,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, W, H);
  }

  function _drawRainbowBorder(ctx) {
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,    '#FF0080');
    grad.addColorStop(0.17, '#FF8C00');
    grad.addColorStop(0.33, '#FFD700');
    grad.addColorStop(0.50, '#00FF87');
    grad.addColorStop(0.67, '#00BFFF');
    grad.addColorStop(0.83, '#7B68EE');
    grad.addColorStop(1,    '#FF0080');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H - 10, W, 10);
  }

  function _drawHeader(ctx, nickname) {
    // ロゴ
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left';
    ctx.fillText('🌈 Rainbow Trial', 80, 90);

    // タイトル
    ctx.font = 'bold 68px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('7日間トライアル 完了！', 80, 185);

    // ユーザー名
    ctx.font = '38px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(_esc(nickname) + ' さん', 80, 250);

    // 区切り線
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 280);
    ctx.lineTo(W - 80, 280);
    ctx.stroke();
  }

  function _drawRankBadge(ctx, rank) {
    var cx = W - 220, cy = 185;

    // 光輪
    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140);
    glow.addColorStop(0,   rank.color + '30');
    glow.addColorStop(1,   'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    ctx.fill();

    // 円
    ctx.beginPath();
    ctx.arc(cx, cy, 110, 0, Math.PI * 2);
    ctx.strokeStyle = rank.color;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    // アイコン
    ctx.font = '68px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rank.icon, cx, cy - 18);

    // ランクラベル
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = rank.color;
    ctx.fillText(rank.label, cx, cy + 45);

    // タイトル
    ctx.font = '22px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(rank.title, cx, cy + 80);
  }

  function _drawStats(ctx, stats, gs, score) {
    var items = [
      { label: 'トレード数',  value: (stats.totalTrades || 0) + '回' },
      { label: '勝敗',        value: (stats.wins || 0) + '勝' + (stats.losses || 0) + '敗' },
      { label: '勝率',        value: (stats.winRate || 0).toFixed(1) + '%' },
      { label: '累計損益',    value: _formatPnl(stats.totalPnL || 0), color: (stats.totalPnL || 0) >= 0 ? '#86EFAC' : '#FCA5A5' },
      { label: '最大連勝',    value: (gs.maxStreak || 0) + '連勝' },
      { label: '判定スコア',  value: Math.round(score) + '点', color: '#9775FA' }
    ];

    var colW = (W - 160) / 3;
    var startX = 80, startY = 330;

    items.forEach(function (item, i) {
      var col = i % 3;
      var row = Math.floor(i / 3);
      var x = startX + col * colW;
      var y = startY + row * 140;

      // カード背景
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      _roundRect(ctx, x, y, colW - 20, 120, 16);
      ctx.fill();

      // ラベル
      ctx.font = '22px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, x + 18, y + 38);

      // 値
      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = item.color || '#FFFFFF';
      ctx.fillText(item.value, x + 18, y + 92);
    });
  }

  function _drawLevel(ctx, levelInfo) {
    var y = 650;
    ctx.fillStyle = 'rgba(151,117,250,0.12)';
    _roundRect(ctx, 80, y, W - 160, 80, 16);
    ctx.fill();

    ctx.font = '42px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(levelInfo.icon, 110, y + 55);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(_esc(levelInfo.title), 170, y + 42);

    ctx.font = '24px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('到達レベル: Lv.' + levelInfo.level, 170, y + 72);
  }

  function _drawGrowthMini(ctx, gs) {
    var history = (gs && gs.capitalHistory) || [];
    if (history.length < 2) return;

    var x0 = 80, y0 = 760, cW = W - 160, cH = 200;
    var initial = 300000;
    var pts = [{ capital: initial }].concat(history.slice(-49));

    var values = pts.map(function (p) { return p.capital; });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    if (maxV === minV) { maxV = minV + 10000; minV = minV - 10000; }
    var range = maxV - minV;
    var padT = 20, padB = 30;
    var gH = cH - padT - padB;

    function xOf(i)  { return x0 + (i / (pts.length - 1)) * cW; }
    function yOf(v)  { return y0 + padT + (1 - (v - minV) / range) * gH; }

    // 背景
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    _roundRect(ctx, x0, y0, cW, cH, 16);
    ctx.fill();

    // ベースライン
    var basY = yOf(initial);
    ctx.beginPath();
    ctx.moveTo(x0, basY);
    ctx.lineTo(x0 + cW, basY);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // 折れ線
    ctx.beginPath();
    pts.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(xOf(i), yOf(p.capital));
      else ctx.lineTo(xOf(i), yOf(p.capital));
    });
    var lineGrad = ctx.createLinearGradient(x0, 0, x0 + cW, 0);
    lineGrad.addColorStop(0, '#9775FA');
    lineGrad.addColorStop(1, '#38BDF8');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ラベル
    ctx.font = '22px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'left';
    ctx.fillText('資金推移', x0 + 14, y0 + 18);

    ctx.textAlign = 'right';
    var lastVal  = values[values.length - 1];
    var finalPnl = lastVal - initial;
    ctx.fillStyle = finalPnl >= 0 ? '#86EFAC' : '#FCA5A5';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(_formatPnl(finalPnl), x0 + cW - 14, y0 + 18);
  }

  function _drawFooter(ctx) {
    ctx.font = '26px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';
    ctx.fillText('Rainbow Trial — 7日間体験プログラム', W / 2, H - 40);
  }

  /* --------------------------------------------------------------------------
   * 3. ユーティリティ
   * -------------------------------------------------------------------------- */
  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function _formatPnl(pnl) {
    var sign = pnl >= 0 ? '+' : '-';
    return sign + '¥' + Math.abs(Math.round(pnl)).toLocaleString('ja-JP');
  }

  function _esc(str) {
    return String(str || '')
      .replace(/</g, '<')
      .replace(/>/g, '>');
  }

  /* --------------------------------------------------------------------------
   * 4. ダウンロード
   * -------------------------------------------------------------------------- */
  function download(opts) {
    var canvas = generate(opts);
    var nickname = opts && opts.nickname ? opts.nickname : 'result';
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var filename = 'rainbow-trial-result-' + nickname + '-' + date + '.png';

    // CTA インタラクション記録
    try {
      global.TrialStore && global.TrialStore.setState({
        ctaInteractions: Object.assign(
          {},
          (global.TrialStore.getState().ctaInteractions || {}),
          { resultCardDownloaded: ((global.TrialStore.getState().ctaInteractions || {}).resultCardDownloaded || 0) + 1 }
        )
      });
    } catch (e) {}

    canvas.toBlob(function (blob) {
      var url  = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
    }, 'image/png');
  }

  /* --------------------------------------------------------------------------
   * 5. 公開 API
   * -------------------------------------------------------------------------- */
  var ResultCard = {
    generate: generate,
    download: download
  };

  global.ResultCard = ResultCard;

})(typeof window !== 'undefined' ? window : this);
