/* ==========================================================================
 * Rainbow Trial — js/chart.js
 * Canvas API による TradingView 風チャート描画。
 *
 * 使い方:
 *   const chart = new RainbowChart(containerEl, signal, {
 *     liveMode: false,          // true: ライブ価格マーカー描画
 *     showEntryLines: true,     // Entry/TP/SL 水平線
 *     showCrosshair: true
 *   });
 *   chart.setLivePrice(154.350);
 *   chart.fit();
 *   chart.destroy();
 *
 * 描画要素:
 *   - 背景 / グリッド
 *   - ローソク足(陽線=輪郭のみ / 陰線=塗りつぶし)
 *   - MA20 / MA80(滑らかな曲線)
 *   - Entry / TP / SL 水平線(点線)
 *   - 価格軸(右) / 時間軸(下)
 *   - クロスヘア + ツールチップ(hover時)
 *
 * インタラクション:
 *   - ドラッグ: 横スクロール
 *   - ホイール: ズーム(カーソル位置を中心)
 *   - ダブルタップ / ダブルクリック: フィット表示に戻す
 *   - ピンチ: モバイルズーム
 *
 * 公開グローバル: window.RainbowChart
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. 色・レイアウト定数
   * -------------------------------------------------------------------------- */
  // MT4 モバイル風の配色(黒背景、実体塗りローソク、ブライトカラー)
  const COLORS = {
    bg:         '#000000',
    grid:       '#1C1C1C',
    gridStrong: '#2A2A2A',
    candleUp:   '#26C281',   // 陽線: 緑実体
    candleDown: '#E94560',   // 陰線: 赤実体
    ma20:       '#FFD54F',   // Yellow
    ma80:       '#29B6F6',   // LightBlue
    entry:      '#FFFFFF',
    tp:         '#00E676',
    sl:         '#FF5252',
    axis:       '#B0B0B0',
    text:       '#CFCFCF',
    textStrong: '#FFFFFF',
    crosshair:  '#DCDCDC',
    livePrice:  '#FFEB3B'    // Bid/Ask 風ハイライト
  };

  const PAD = {
    right:  68,   // 価格軸の幅(MT4 は広め)
    bottom: 22,   // 時間軸の高さ
    top:    26,   // 上部シンボルバーの分を確保
    left:   4
  };

  const MIN_VISIBLE_BARS = 12;
  const MAX_VISIBLE_BARS = 80;    // 原本 50 + ライブ 10 + 余裕

  /* --------------------------------------------------------------------------
   * 2. ユーティリティ
   * -------------------------------------------------------------------------- */
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** 価格軸の「きれいな」目盛り刻みを求める */
  function niceStep(range, targetLines) {
    const raw = range / targetLines;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const frac = raw / exp;
    let nice;
    if (frac < 1.5)       nice = 1;
    else if (frac < 3)    nice = 2;
    else if (frac < 7.5)  nice = 5;
    else                  nice = 10;
    return nice * exp;
  }

  /* --------------------------------------------------------------------------
   * 3. RainbowChart クラス
   * -------------------------------------------------------------------------- */
  class RainbowChart {
    constructor(container, signal, options) {
      if (!container) throw new Error('[RainbowChart] container required');
      if (!signal || !signal.candles) throw new Error('[RainbowChart] signal with candles required');

      this.container = container;
      this.signal    = signal;
      this.options   = Object.assign({
        liveMode:        false,
        showEntryLines:  true,
        showCrosshair:   true,
        showLegend:      true,
        showPairHeader:  true
      }, options || {});

      this.dpr       = Math.max(1, global.devicePixelRatio || 1);
      this.width     = 0;
      this.height    = 0;

      // ビュー状態(ローソク足インデックス範囲)
      this.liveCandles = [];                // ライブモード時の追加ローソク足
      this.baseTotal   = signal.candles.length;
      this.total       = this.baseTotal;
      this.viewStart   = 0;
      this.viewEnd     = this.total - 1;

      // インタラクション
      this.dragging   = false;
      this.dragOrigin = null;
      this.pinchPrev  = null;
      this.hover      = null; // { x, y }
      this.lastTapTs  = 0;

      // ライブ価格
      this.livePrice = null;

      // レンダリング
      this.needsRender = true;
      this.rafId       = null;

      this._bind();
      this._setupDom();
      this._attachEvents();
      this._fitVertical();
      this._scheduleRender();
    }

    /* ----------------------- setup ----------------------- */
    _bind() {
      [
        'handleResize', 'onPointerDown', 'onPointerMove', 'onPointerUp',
        'onWheel', 'onDblClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd',
        'onMouseLeave', 'renderLoop'
      ].forEach((m) => { this[m] = this[m].bind(this); });
    }

    _setupDom() {
      // コンテナ内の既存要素はそのまま(.chart__canvas / legend / pair header が CSS 前提)
      // canvas を作成 or 流用
      let canvas = this.container.querySelector('.chart__canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'chart__canvas';
        this.container.appendChild(canvas);
      }
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      if (this.options.showLegend)     this._mountLegend();
      if (this.options.showPairHeader) this._mountPairHeader();
      this._mountTooltip();

      this._resize();
    }

    _mountLegend() {
      // MT4 モバイル風: インジケーター名をチャート左上に重ねて表示
      if (this.container.querySelector('.chart__legend')) return;
      const el = document.createElement('div');
      el.className = 'chart__legend chart__legend--mt4';
      el.innerHTML =
        '<div class="chart__legend-row" style="color:#FFD54F">🌈 レインボーロード</div>';
      this.container.appendChild(el);
    }

    _mountPairHeader() {
      // MT4 モバイル風のタイトルバー: 「USDJPY,M15」左寄せ + 右に Bid 価格
      if (this.container.querySelector('.chart__pair')) return;
      const el = document.createElement('div');
      el.className = 'chart__pair chart__pair--mt4';
      const pairRaw = this.signal.pair;
      const tf = 'M15';
      el.innerHTML =
        '<span class="chart__pair-symbol">' + pairRaw + ',' + tf + '</span>' +
        '<span class="chart__pair-price" data-role="price">' + this._fmtPrice(this.signal.entry) + '</span>';
      this.container.appendChild(el);
    }

    _mountTooltip() {
      if (this.container.querySelector('.chart__tooltip')) return;
      const el = document.createElement('div');
      el.className = 'chart__tooltip';
      el.innerHTML =
        '<div class="chart__tooltip-row"><span>O</span><span data-v="o">-</span></div>' +
        '<div class="chart__tooltip-row"><span>H</span><span data-v="h">-</span></div>' +
        '<div class="chart__tooltip-row"><span>L</span><span data-v="l">-</span></div>' +
        '<div class="chart__tooltip-row"><span>C</span><span data-v="c">-</span></div>' +
        '<div class="chart__tooltip-row"><span>Time</span><span data-v="t">-</span></div>';
      this.container.appendChild(el);
      this.tooltip = el;
    }

    _attachEvents() {
      global.addEventListener('resize', this.handleResize);
      this.canvas.addEventListener('mousedown',  this.onPointerDown);
      this.canvas.addEventListener('mousemove',  this.onPointerMove);
      this.canvas.addEventListener('mouseleave', this.onMouseLeave);
      global.addEventListener('mouseup',         this.onPointerUp);
      this.canvas.addEventListener('wheel',      this.onWheel, { passive: false });
      this.canvas.addEventListener('dblclick',   this.onDblClick);
      this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
      this.canvas.addEventListener('touchmove',  this.onTouchMove,  { passive: false });
      this.canvas.addEventListener('touchend',   this.onTouchEnd);
    }

    /* ----------------------- sizing ----------------------- */
    handleResize() {
      this._resize();
      this._scheduleRender();
    }

    _resize() {
      const rect = this.container.getBoundingClientRect();
      this.width = Math.max(100, rect.width);
      this.height = Math.max(100, rect.height);
      this.canvas.style.width  = this.width + 'px';
      this.canvas.style.height = this.height + 'px';
      this.canvas.width  = Math.round(this.width  * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    _plotRect() {
      return {
        x: PAD.left,
        y: PAD.top,
        w: Math.max(20, this.width - PAD.left - PAD.right),
        h: Math.max(20, this.height - PAD.top - PAD.bottom)
      };
    }

    /* ----------------------- coordinate mappers ----------------------- */
    _xForIndex(i, plot) {
      const count = Math.max(1, this.viewEnd - this.viewStart);
      const step = plot.w / count;
      return plot.x + (i - this.viewStart) * step + step * 0.5;
    }
    _yForPrice(price, plot, range) {
      const t = (price - range.min) / (range.max - range.min || 1);
      return plot.y + plot.h * (1 - t);
    }
    _priceForY(y, plot, range) {
      const t = (plot.y + plot.h - y) / plot.h;
      return range.min + (range.max - range.min) * t;
    }
    _indexForX(x, plot) {
      const count = Math.max(1, this.viewEnd - this.viewStart);
      const step = plot.w / count;
      return Math.round(this.viewStart + (x - plot.x - step * 0.5) / step);
    }

    /* ----------------------- candle / MA accessors ----------------------- */
    _getCandle(i) {
      if (i < this.baseTotal) return this.signal.candles[i];
      const liveIdx = i - this.baseTotal;
      return this.liveCandles[liveIdx] || null;
    }
    _getMa20(i) { return (i < this.baseTotal) ? this.signal.ma20[i] : null; }
    _getMa80(i) { return (i < this.baseTotal) ? this.signal.ma80[i] : null; }

    /* ----------------------- value range ----------------------- */
    _fitVertical() {
      let min = Infinity, max = -Infinity;
      for (let i = this.viewStart; i <= this.viewEnd; i++) {
        const c = this._getCandle(i);
        if (!c) continue;
        if (c.l < min) min = c.l;
        if (c.h > max) max = c.h;
        const m20 = this._getMa20(i);
        const m80 = this._getMa80(i);
        if (m20 != null) { if (m20 < min) min = m20; if (m20 > max) max = m20; }
        if (m80 != null) { if (m80 < min) min = m80; if (m80 > max) max = m80; }
      }
      // エントリーライン類も視界に入れる
      if (this.options.showEntryLines) {
        [this.signal.entry, this.signal.tp, this.signal.sl].forEach((v) => {
          if (v < min) min = v;
          if (v > max) max = v;
        });
      }
      if (this.livePrice != null) {
        if (this.livePrice < min) min = this.livePrice;
        if (this.livePrice > max) max = this.livePrice;
      }
      if (min === Infinity) { min = 0; max = 1; }
      const pad = (max - min) * 0.08 || 0.001;
      return { min: min - pad, max: max + pad };
    }

    /* ----------------------- render loop ----------------------- */
    _scheduleRender() {
      this.needsRender = true;
      if (this.rafId) return;
      this.rafId = global.requestAnimationFrame(this.renderLoop);
    }

    renderLoop() {
      this.rafId = null;
      if (!this.needsRender) return;
      this.needsRender = false;
      this._draw();
    }

    /* ----------------------- drawing ----------------------- */
    _draw() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const plot = this._plotRect();
      const range = this._fitVertical();

      // 背景
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      // グリッド(水平)
      this._drawHorizontalGrid(ctx, plot, range);
      // グリッド(垂直)
      this._drawVerticalGrid(ctx, plot);

      // 水平ライン(SL → TP → Entry の順で Entry を最前面に)
      if (this.options.showEntryLines) {
        this._drawHLine(ctx, plot, range, this.signal.sl,    COLORS.sl,    'SL');
        this._drawHLine(ctx, plot, range, this.signal.tp,    COLORS.tp,    'TP');
        this._drawHLine(ctx, plot, range, this.signal.entry, COLORS.entry, 'Entry');
      }

      // MA(80 → 20 の順で 20 が前面)
      this._drawMA(ctx, plot, range, this.signal.ma80, COLORS.ma80);
      this._drawMA(ctx, plot, range, this.signal.ma20, COLORS.ma20);

      // ローソク足
      this._drawCandles(ctx, plot, range);

      // ライブ価格マーカー
      if (this.options.liveMode && this.livePrice != null) {
        this._drawLiveMarker(ctx, plot, range, this.livePrice);
      }

      // 軸
      this._drawPriceAxis(ctx, plot, range);
      this._drawTimeAxis(ctx, plot);

      // クロスヘア + tooltip
      if (this.options.showCrosshair && this.hover) {
        this._drawCrosshair(ctx, plot, range);
      } else if (this.tooltip) {
        this.tooltip.classList.remove('is-visible');
      }

      // 右上の通貨ペアヘッダ内価格を更新
      this._updatePairHeaderPrice();
    }

    _drawHorizontalGrid(ctx, plot, range) {
      // MT4 モバイル風: 点線の薄いグリッド
      const span = range.max - range.min;
      const step = niceStep(span, 6);
      let start = Math.ceil(range.min / step) * step;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.strokeStyle = COLORS.grid;
      for (let p = start; p <= range.max; p += step) {
        const y = Math.round(this._yForPrice(p, plot, range)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.w, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawVerticalGrid(ctx, plot) {
      const count = this.viewEnd - this.viewStart + 1;
      const step = count <= 20 ? 5 : (count <= 35 ? 8 : 10);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.strokeStyle = COLORS.grid;
      for (let i = this.viewStart; i <= this.viewEnd; i++) {
        if (((i - this.viewStart) % step) !== 0) continue;
        const x = Math.round(this._xForIndex(i, plot)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.h);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawHLine(ctx, plot, range, price, color, label) {
      // MT4 風: Entry は実線白、TP/SL は破線(MT4 の水平線オブジェクト風)
      if (price < range.min || price > range.max) return;
      const y = Math.round(this._yForPrice(price, plot, range)) + 0.5;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = label === 'Entry' ? 1 : 1.25;
      ctx.setLineDash(label === 'Entry' ? [] : [5, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      this._drawPriceTag(ctx, plot, y, price, color, label);
      ctx.restore();
    }

    _drawPriceTag(ctx, plot, y, price, bg, label) {
      // MT4 モバイル風: 右端に矩形タグ。黒字のコントラストで読みやすく
      const text = this._fmtPrice(price);
      ctx.font = '700 11px "JetBrains Mono", "Consolas", monospace';
      ctx.textBaseline = 'middle';
      const padX = 6;
      const textW = ctx.measureText(text).width;
      const tagW = Math.min(textW + padX * 2 + (label ? ctx.measureText(label).width + 6 : 0), PAD.right - 2);
      const x = plot.x + plot.w + 2;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y - 9, tagW, 18);
      ctx.fillStyle = '#000000';
      if (label) {
        ctx.textAlign = 'left';
        ctx.fillText(label, x + padX, y);
        ctx.fillText(text, x + padX + ctx.measureText(label).width + 6, y);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(text, x + padX, y);
      }
    }

    _drawMA(ctx, plot, range, arr, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      // MA は原本ローソクの範囲(baseTotal 未満)のみ描画
      const endIdx = Math.min(this.viewEnd, this.baseTotal - 1);
      for (let i = this.viewStart; i <= endIdx; i++) {
        const v = arr[i];
        if (v == null) continue;
        const x = this._xForIndex(i, plot);
        const y = this._yForPrice(v, plot, range);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    _drawCandles(ctx, plot, range) {
      // MT4 モバイル風: 陽線/陰線ともに実体塗りつぶし
      const count = this.viewEnd - this.viewStart + 1;
      const step = plot.w / count;
      const bodyW = Math.max(1.5, Math.min(step * 0.76, 16));
      ctx.lineWidth = 1;
      for (let i = this.viewStart; i <= this.viewEnd; i++) {
        const c = this._getCandle(i);
        if (!c) continue;
        const x = this._xForIndex(i, plot);
        const isUp = c.c >= c.o;
        const color = isUp ? COLORS.candleUp : COLORS.candleDown;
        // ヒゲ
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, this._yForPrice(c.h, plot, range));
        ctx.lineTo(Math.round(x) + 0.5, this._yForPrice(c.l, plot, range));
        ctx.stroke();
        // ボディ(両方向とも塗りつぶし)
        const yOpen  = this._yForPrice(c.o, plot, range);
        const yClose = this._yForPrice(c.c, plot, range);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        const bx = Math.round(x - bodyW / 2) + 0.5;
        ctx.fillStyle = color;
        ctx.fillRect(bx, bodyTop, bodyW, bodyH);

        // 形成中の最終ライブ足: 黄色点線で強調(MT4 の現在足強調風)
        if (c.isForming) {
          ctx.save();
          ctx.strokeStyle = COLORS.livePrice;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 2]);
          ctx.strokeRect(bx - 1, bodyTop - 1, bodyW + 2, bodyH + 2);
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    }

    /* ----------------------- live candles public API ----------------------- */
    setLiveCandles(arr) {
      const list = Array.isArray(arr) ? arr : [];
      const oldTotal = this.total;
      const wasAtEnd = (this.viewEnd >= oldTotal - 1);
      const visibleCount = this.viewEnd - this.viewStart + 1;
      this.liveCandles = list;
      this.total = this.baseTotal + this.liveCandles.length;
      if (wasAtEnd) {
        this.viewEnd = this.total - 1;
        this.viewStart = Math.max(0, this.viewEnd - visibleCount + 1);
      }
      this._scheduleRender();
    }

    _drawLiveMarker(ctx, plot, range, price) {
      const y = this._yForPrice(price, plot, range);
      ctx.save();
      // 横にライブライン
      ctx.strokeStyle = COLORS.livePrice;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // 右端タグ(大きめ、目立つ)
      this._drawPriceTag(ctx, plot, y, price, COLORS.livePrice, '');
      // グロー効果(控えめ)
      ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
      ctx.fillRect(plot.x, y - 1, plot.w, 2);
      ctx.restore();
    }

    _drawPriceAxis(ctx, plot, range) {
      // MT4 モバイル風: 右側に白系の等幅フォントで価格
      const span = range.max - range.min;
      const step = niceStep(span, 6);
      let start = Math.ceil(range.min / step) * step;
      ctx.save();
      ctx.font = '500 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let p = start; p <= range.max; p += step) {
        const y = this._yForPrice(p, plot, range);
        ctx.fillText(this._fmtPrice(p), plot.x + plot.w + 6, y);
      }
      ctx.restore();
    }

    _drawTimeAxis(ctx, plot) {
      const count = this.viewEnd - this.viewStart + 1;
      const step = count <= 20 ? 5 : (count <= 35 ? 8 : 10);
      ctx.save();
      ctx.font = '500 10px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = this.viewStart; i <= this.viewEnd; i++) {
        if (((i - this.viewStart) % step) !== 0) continue;
        const c = this._getCandle(i);
        if (!c) continue;
        const x = this._xForIndex(i, plot);
        const label = c.time || (c.isLive ? 'LIVE' : '');
        ctx.fillText(label, x, plot.y + plot.h + 4);
      }
      ctx.restore();
    }

    _drawCrosshair(ctx, plot, range) {
      const { x, y } = this.hover;
      if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) {
        if (this.tooltip) this.tooltip.classList.remove('is-visible');
        return;
      }
      const idx = clamp(this._indexForX(x, plot), this.viewStart, this.viewEnd);
      const candle = this._getCandle(idx);
      if (!candle) return;
      const cx = this._xForIndex(idx, plot);
      ctx.save();
      ctx.strokeStyle = COLORS.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      // 垂直
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, plot.y);
      ctx.lineTo(Math.round(cx) + 0.5, plot.y + plot.h);
      ctx.stroke();
      // 水平
      ctx.beginPath();
      ctx.moveTo(plot.x, Math.round(y) + 0.5);
      ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      // 価格ラベル(右側) — MT4 風の白背景 + 黒文字
      const price = this._priceForY(y, plot, range);
      this._drawPriceTag(ctx, plot, y, price, '#E0E0E0', '');
      ctx.restore();
      // tooltip 更新
      if (this.tooltip) {
        const set = (k, v) => {
          const el = this.tooltip.querySelector('[data-v="' + k + '"]');
          if (el) el.textContent = v;
        };
        set('o', this._fmtPrice(candle.o));
        set('h', this._fmtPrice(candle.h));
        set('l', this._fmtPrice(candle.l));
        set('c', this._fmtPrice(candle.c));
        set('t', candle.time || '-');
        this.tooltip.classList.add('is-visible');
      }
    }

    _updatePairHeaderPrice() {
      if (!this.options.showPairHeader) return;
      const el = this.container.querySelector('.chart__pair [data-role="price"]');
      if (!el) return;
      const last = this.signal.candles[this.total - 1];
      const price = this.livePrice != null ? this.livePrice : (last ? last.c : this.signal.entry);
      el.textContent = this._fmtPrice(price);
    }

    _fmtPrice(v) {
      const d = this.signal.decimals != null ? this.signal.decimals : (this.signal.pair === 'USDJPY' ? 3 : 1);
      return (Number(v) || 0).toFixed(d);
    }

    /* ----------------------- interactions ----------------------- */
    onPointerDown(e) {
      this.dragging = true;
      this.dragOrigin = {
        x: e.clientX,
        vs: this.viewStart,
        ve: this.viewEnd
      };
      this.canvas.style.cursor = 'grabbing';
    }

    onPointerMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (this.dragging && this.dragOrigin) {
        const plot = this._plotRect();
        const count = this.dragOrigin.ve - this.dragOrigin.vs + 1;
        const step = plot.w / count;
        const dx = e.clientX - this.dragOrigin.x;
        const shift = Math.round(-dx / step);
        this._shiftView(shift, this.dragOrigin.vs, this.dragOrigin.ve);
      }

      this.hover = { x, y };
      this._scheduleRender();
    }

    onPointerUp() {
      this.dragging = false;
      this.dragOrigin = null;
      this.canvas.style.cursor = '';
    }

    onMouseLeave() {
      this.hover = null;
      this._scheduleRender();
    }

    onWheel(e) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const plot = this._plotRect();
      const idx = clamp(this._indexForX(x, plot), 0, this.total - 1);
      const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      this._zoomAroundIndex(idx, factor);
    }

    onDblClick() {
      this.fit();
    }

    onTouchStart(e) {
      if (e.touches.length === 1) {
        this.onPointerDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      } else if (e.touches.length === 2) {
        this.dragging = false;
        this.pinchPrev = this._touchDistance(e.touches);
      }
      // ダブルタップ
      const now = Date.now();
      if (now - this.lastTapTs < 300) this.fit();
      this.lastTapTs = now;
      e.preventDefault();
    }

    onTouchMove(e) {
      if (e.touches.length === 2 && this.pinchPrev) {
        const d = this._touchDistance(e.touches);
        const factor = this.pinchPrev / d;   // 開く=拡大(factor<1)
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const rect = this.canvas.getBoundingClientRect();
        const plot = this._plotRect();
        const idx = clamp(this._indexForX(cx - rect.left, plot), 0, this.total - 1);
        this._zoomAroundIndex(idx, factor);
        this.pinchPrev = d;
      } else if (e.touches.length === 1 && this.dragging) {
        this.onPointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      }
      e.preventDefault();
    }

    onTouchEnd() {
      this.dragging = false;
      this.dragOrigin = null;
      this.pinchPrev = null;
    }

    _touchDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    _shiftView(delta, baseStart, baseEnd) {
      const count = baseEnd - baseStart + 1;
      let ns = baseStart + delta;
      let ne = baseEnd + delta;
      if (ns < 0) { ns = 0; ne = count - 1; }
      if (ne > this.total - 1) { ne = this.total - 1; ns = ne - count + 1; }
      this.viewStart = ns;
      this.viewEnd = ne;
      this._scheduleRender();
    }

    _zoomAroundIndex(idx, factor) {
      const curCount = this.viewEnd - this.viewStart + 1;
      let newCount = Math.round(curCount * factor);
      newCount = clamp(newCount, MIN_VISIBLE_BARS, Math.min(MAX_VISIBLE_BARS, this.total));
      if (newCount === curCount) return;
      // idx を視野中心寄りに保つ
      const ratio = (idx - this.viewStart) / curCount;
      let ns = Math.round(idx - ratio * newCount);
      let ne = ns + newCount - 1;
      if (ns < 0) { ns = 0; ne = newCount - 1; }
      if (ne > this.total - 1) { ne = this.total - 1; ns = ne - newCount + 1; }
      this.viewStart = ns;
      this.viewEnd = ne;
      this._scheduleRender();
    }

    /* ----------------------- public API ----------------------- */
    setLivePrice(price) {
      if (typeof price !== 'number' || isNaN(price)) { this.livePrice = null; }
      else this.livePrice = price;
      this._scheduleRender();
    }

    fit() {
      this.total = this.baseTotal + this.liveCandles.length;
      this.viewStart = 0;
      this.viewEnd = this.total - 1;
      this._scheduleRender();
    }

    setSignal(signal) {
      if (!signal || !signal.candles) return;
      this.signal = signal;
      this.baseTotal = signal.candles.length;
      this.liveCandles = [];
      this.total = this.baseTotal;
      this.fit();
    }

    render() { this._scheduleRender(); }

    destroy() {
      if (this.rafId) { global.cancelAnimationFrame(this.rafId); this.rafId = null; }
      global.removeEventListener('resize', this.handleResize);
      this.canvas.removeEventListener('mousedown',  this.onPointerDown);
      this.canvas.removeEventListener('mousemove',  this.onPointerMove);
      this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
      global.removeEventListener('mouseup',         this.onPointerUp);
      this.canvas.removeEventListener('wheel',      this.onWheel);
      this.canvas.removeEventListener('dblclick',   this.onDblClick);
      this.canvas.removeEventListener('touchstart', this.onTouchStart);
      this.canvas.removeEventListener('touchmove',  this.onTouchMove);
      this.canvas.removeEventListener('touchend',   this.onTouchEnd);
      // DOM クリーンアップ
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      const legend = this.container.querySelector('.chart__legend'); if (legend) legend.remove();
      const pair = this.container.querySelector('.chart__pair');     if (pair) pair.remove();
      if (this.tooltip && this.tooltip.parentNode) this.tooltip.parentNode.removeChild(this.tooltip);
    }
  }

  global.RainbowChart = RainbowChart;

})(typeof window !== 'undefined' ? window : this);
