/* ==========================================================================
 * Rainbow Trial — js/final-screen.js
 * Day 7 フィナーレ — 劇的 6 シーン演出
 *
 * シーン構成:
 *   Scene 1: オープニング(暗転 → 🌈 拡大)
 *   Scene 2: 成績発表(カウントアップ)
 *   Scene 3: ランク発表(ズーム+回転)
 *   Scene 4: 成長グラフ(アニメーション描画)
 *   Scene 5: 実績振り返り
 *   Scene 6: ひかりからの最終メッセージ + LINE CTA + 結果カード保存
 *
 * 依存: window.TrialStore / GameState / JudgmentScore / LevelSystem
 *       window.Effects / SoundSystem / ResultCard / HikariMessage
 *
 * 公開グローバル: window.FinalScreen
 * ========================================================================== */

(function (global) {
  'use strict';

  var LINE_URL = 'https://lin.ee/xGQTHY1';

  /* ランク定義 */
  var RANKS = [
    { label: 'S+', min: 95, color: '#FFD700', icon: '👑', title: '伝説のトレーダー' },
    { label: 'S',  min: 90, color: '#E2E8F0', icon: '🌟', title: 'エキスパートトレーダー' },
    { label: 'A+', min: 85, color: '#A78BFA', icon: '💎', title: 'ハイレベルトレーダー' },
    { label: 'A',  min: 80, color: '#7C3AED', icon: '🏅', title: '上級トレーダー' },
    { label: 'B+', min: 75, color: '#3B82F6', icon: '⭐', title: '中級トレーダー' },
    { label: 'B',  min: 70, color: '#10B981', icon: '✅', title: '安定トレーダー' },
    { label: 'C+', min: 60, color: '#F59E0B', icon: '📈', title: '成長中トレーダー' },
    { label: 'C',  min: 0,  color: '#6B7280', icon: '🌱', title: '見習いトレーダー' }
  ];

  function getRank(score) {
    for (var i = 0; i < RANKS.length; i++) {
      if (score >= RANKS[i].min) return RANKS[i];
    }
    return RANKS[RANKS.length - 1];
  }

  /* --------------------------------------------------------------------------
   * 1. 表示すべきか判定
   * -------------------------------------------------------------------------- */
  function shouldShow() {
    var snap = global.GameState && global.GameState.snapshot();
    if (!snap) return false;
    return snap.currentDay === 'ended' || (snap.displayDay === 7 && !snap.next);
  }

  /* --------------------------------------------------------------------------
   * 2. フィナーレ開始
   * -------------------------------------------------------------------------- */
  function show() {
    var existing = document.getElementById('finale-overlay');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    if (!global.TrialStore) return;

    var state = global.TrialStore.getState();
    var stats = global.TrialStore.computeStats();
    var gs    = (state && state.gameStats) || {};

    var score = 0;
    if (global.JudgmentScore && state) {
      try {
        var computed = global.JudgmentScore.compute(state);
        score = computed ? (computed.score || 0) : (gs.judgmentScore || 0);
      } catch (e) { score = gs.judgmentScore || 0; }
    } else {
      score = gs.judgmentScore || 0;
    }

    var rank = getRank(score);

    var levelInfo = { level: 1, icon: '🌱', title: '見習いトレーダー' };
    if (global.LevelSystem && state && state.user) {
      levelInfo = global.LevelSystem.getLevelInfo(state.user.xp || 0);
    }

    var nickname = (state && state.user && state.user.nickname) || 'トレーダー';

    // Day 7 完了データを保存
    _saveCompletion(state, rank, stats, score);

    // オーバーレイ作成
    var overlay = document.createElement('div');
    overlay.id        = 'finale-overlay';
    overlay.className = 'finale-overlay';
    overlay.setAttribute('role', 'main');
    overlay.setAttribute('aria-label', '7日間トライアル完了画面');

    overlay.innerHTML = _buildAllScenes(state, stats, gs, rank, levelInfo, nickname, score);
    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      overlay.classList.add('finale-overlay--enter');
    });

    if (global.SoundSystem) global.SoundSystem.play('achievement');

    // シーン別の遅延処理
    setTimeout(function () { _revealRankBadge(rank); }, 2800);
    setTimeout(function () { _animateStats(stats, gs, score); }, 1800);
    setTimeout(function () { _drawGrowthChart(gs); }, 3400);
    setTimeout(function () { _animateAchievements(state); }, 4200);
    setTimeout(function () { _playConfetti(); }, 3000);

    // ナビゲーションドット
    _bindNavDots(overlay);
    // ボタン
    _bindActions(overlay, state, stats, gs, rank, levelInfo, nickname, score);
    // スキップボタン
    _bindSkipButtons(overlay);
  }

  /* --------------------------------------------------------------------------
   * 3. 全シーン HTML
   * -------------------------------------------------------------------------- */
  function _buildAllScenes(state, stats, gs, rank, levelInfo, nickname, score) {
    var pnl     = stats.totalPnL || 0;
    var pnlSign = pnl >= 0 ? '+' : '';

    var html = '';

    // ナビゲーションドット
    html += '<div class="finale-nav-dots" aria-hidden="true">';
    for (var i = 0; i < 6; i++) {
      html += '<div class="finale-nav-dot' + (i === 0 ? ' finale-nav-dot--active' : '') + '" data-scene="' + i + '"></div>';
    }
    html += '</div>';

    /* シーン 1: オープニング */
    html += '<section class="finale-scene finale-scene--opening" data-scene-idx="0">';
    html += '<div class="finale-opening__rainbow">🌈</div>';
    html += '<div class="finale-opening__tag">Rainbow Trial</div>';
    html += '<h1 class="finale-opening__title">7 Days Complete!</h1>';
    html += '<p class="finale-opening__days">お疲れ様でした、' + _esc(nickname) + 'さん</p>';
    html += '<button class="finale-opening__skip" type="button" data-skip="0">スキップ →</button>';
    html += '</section>';

    /* シーン 2: 成績発表 */
    html += '<section class="finale-scene" data-scene-idx="1">';
    html += '<div class="finale-stats">';
    html += '<div class="finale-section-title">YOUR RESULTS</div>';
    html += '<div class="finale-stats-grid">';
    html += _statItem('総トレード数', '<span id="fn-trades">--</span>', '回');
    html += _statItem('勝敗', '<span id="fn-wr">--</span>', '');
    html += _statItem('勝率', '<span id="fn-winrate">--</span>', '%');
    html += _statItem('累計損益', '<span id="fn-pnl">' + (Math.abs(pnl) > 0 ? '--' : '±0') + '</span>', '');
    html += '</div>';
    html += '</div>';
    html += '<button class="finale-opening__skip" type="button" data-skip="1">スキップ →</button>';
    html += '</section>';

    /* シーン 3: ランク発表 */
    html += '<section class="finale-scene" data-scene-idx="2">';
    html += '<div class="finale-rank-section">';
    html += '<div class="finale-section-title">YOUR RANK</div>';
    html += '<div class="finale-rank-badge" id="finale-rank-badge" style="border-color:' + rank.color + '">';
    html += '<div class="finale-rank-badge__icon">' + rank.icon + '</div>';
    html += '<div class="finale-rank-badge__label" style="color:' + rank.color + '">' + rank.label + '</div>';
    html += '<div class="finale-rank-badge__title">' + rank.title + '</div>';
    html += '</div>';
    html += '<div class="finale-rank-score">判定スコア: <strong id="fn-score">--</strong> 点</div>';
    html += '</div>';
    html += '<button class="finale-opening__skip" type="button" data-skip="2">スキップ →</button>';
    html += '</section>';

    /* シーン 4: 成長グラフ */
    html += '<section class="finale-scene" data-scene-idx="3">';
    html += '<div class="finale-chart-section">';
    html += '<div class="finale-section-title">YOUR GROWTH</div>';
    html += '<div class="finale-chart-label">📈 7日間の資金推移</div>';
    html += '<div class="finale-chart-wrap">';
    html += '<canvas id="finale-growth-chart"></canvas>';
    html += '</div>';
    html += '</div>';
    html += '<button class="finale-opening__skip" type="button" data-skip="3">スキップ →</button>';
    html += '</section>';

    /* シーン 5: 実績 */
    var unlocked = (state.achievements && state.achievements.unlocked) || [];
    html += '<section class="finale-scene" data-scene-idx="4">';
    html += '<div class="finale-ach-section">';
    html += '<div class="finale-section-title">YOUR ACHIEVEMENTS</div>';
    html += '<p class="finale-ach-summary">';
    html += _esc(nickname) + 'さんは <strong>' + unlocked.length + '個</strong> のバッジを獲得しました';
    html += '</p>';
    html += '<div class="finale-ach-grid" id="finale-ach-grid"></div>';
    html += '</div>';
    html += '<button class="finale-opening__skip" type="button" data-skip="4">スキップ →</button>';
    html += '</section>';

    /* シーン 6: ひかりメッセージ + CTA */
    html += _buildHikariScene(state, stats, gs, rank, levelInfo, nickname, score);

    return html;
  }

  function _statItem(label, valueHTML, unit) {
    return (
      '<div class="finale-stat-item">' +
        '<div class="finale-stat-item__label">' + label + '</div>' +
        '<div class="finale-stat-item__value">' + valueHTML + '<span class="finale-stat-item__unit">' + unit + '</span></div>' +
      '</div>'
    );
  }

  function _buildHikariScene(state, stats, gs, rank, levelInfo, nickname, score) {
    var body = [
      _esc(nickname) + 'さん、7日間お疲れさまでした。',
      '',
      '7日前の' + _esc(nickname) + 'さんを覚えていますか？',
      'あの頃は「条件って何？」って迷っていたかもしれません。',
      '',
      '今では判定スコア' + Math.round(score) + '点。',
      'これは本物のサロンメンバーと同じレベルです。',
      '',
      'でも、本当の旅はここから。',
      '',
      '毎日リアルなシグナルを受け取って、',
      '本物のトレーダーとして成長していく。',
      'そんな次のステップに、もし興味があれば、',
      '',
      '私と直接、話してみませんか？🌈'
    ];

    var bodyHTML = body.map(function (line) {
      return line === '' ? '<p></p>' : '<p>' + line + '</p>';
    }).join('');

    return (
      '<section class="finale-scene" data-scene-idx="5">' +
        '<div class="finale-hikari">' +
          '<div class="finale-hikari__avatar-wrap">' +
            '<div class="finale-hikari__avatar-ring"></div>' +
            '<img src="assets/master/hikari-avatar.svg" class="finale-hikari__avatar" alt="ひかり" width="100" height="100">' +
          '</div>' +
          '<div class="finale-hikari__name">ひかり より</div>' +
          '<div class="finale-hikari__body">' +
            bodyHTML +
            '<div class="finale-hikari__from">— ひかり</div>' +
          '</div>' +
          '<div class="finale-line-cta">' +
            '<a href="' + LINE_URL + '" target="_blank" rel="noopener" class="btn--line-finale" id="finale-line-btn">' +
              '<span class="btn--line-finale__icon">LINE</span>' +
              'ひかりに無料で音声相談する' +
            '</a>' +
          '</div>' +
          '<button class="finale-download-btn" id="finale-dl-btn" type="button">📥 結果カードを保存する</button>' +
          '<button class="finale-home-btn" id="finale-home-btn" type="button">ホームに戻る</button>' +
        '</div>' +
      '</section>'
    );
  }

  /* --------------------------------------------------------------------------
   * 4. シーン別アニメーション処理
   * -------------------------------------------------------------------------- */
  function _animateStats(stats, gs, score) {
    _countUp('fn-trades',  0, stats.totalTrades || 0, 900, false);
    _countUp('fn-winrate', 0, stats.winRate || 0,    1000, false, 1);
    _countUp('fn-score',   0, Math.round(score),     1200, false);

    // 勝敗
    var wEl = document.getElementById('fn-wr');
    if (wEl) wEl.textContent = (stats.wins || 0) + '勝' + (stats.losses || 0) + '敗';

    // 損益
    var pnlEl = document.getElementById('fn-pnl');
    if (pnlEl) {
      var pnl = stats.totalPnL || 0;
      _countUpPnl('fn-pnl', 0, pnl, 1400);
    }
  }

  function _revealRankBadge(rank) {
    var badge = document.getElementById('finale-rank-badge');
    if (badge) {
      badge.classList.add('finale-rank-badge--reveal');
      badge.style.boxShadow = '0 0 60px ' + rank.color + ', 0 0 120px rgba(151,117,250,0.2)';
    }
    // スコアカウントアップ
    var state = global.TrialStore && global.TrialStore.getState();
    var gs    = (state && state.gameStats) || {};
    var score = gs.judgmentScore || 0;
    _countUp('fn-score', 0, Math.round(score), 1000, false);
  }

  function _drawGrowthChart(gs) {
    var canvas = document.getElementById('finale-growth-chart');
    if (!canvas) return;

    var container = canvas.parentElement;
    var W = (container && container.offsetWidth) || 340;
    var H = 160;

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var history = (gs && gs.capitalHistory) || [];
    var initial = 300000;
    var pts;
    if (history.length === 0) {
      // プレースホルダー
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('トレードを完了すると表示されます', W / 2, H / 2);
      return;
    }
    pts = [{ label: 'START', capital: initial }].concat(history.slice(-69));
    if (pts.length < 2) return;

    var values = pts.map(function (p) { return p.capital; });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    if (maxV === minV) { maxV = minV + 10000; minV = minV - 10000; }
    var range = maxV - minV;
    var padT = 20, padB = 20, padL = 10, padR = 10;
    var gW = W - padL - padR, gH = H - padT - padB;

    function xOf(i) { return padL + (i / (pts.length - 1)) * gW; }
    function yOf(v) { return padT + (1 - (v - minV) / range) * gH; }

    // 背景
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(151,117,250,0.12)');
    grad.addColorStop(1, 'rgba(59,130,246,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ベースライン
    var basY = yOf(initial);
    ctx.beginPath();
    ctx.moveTo(padL, basY);
    ctx.lineTo(W - padR, basY);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // 折れ線
    ctx.beginPath();
    pts.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(xOf(i), yOf(p.capital));
      else ctx.lineTo(xOf(i), yOf(p.capital));
    });
    var lineGrad = ctx.createLinearGradient(0, 0, W, 0);
    lineGrad.addColorStop(0, '#9775FA');
    lineGrad.addColorStop(1, '#38BDF8');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 塗りつぶし
    ctx.lineTo(xOf(pts.length - 1), H - padB);
    ctx.lineTo(xOf(0), H - padB);
    ctx.closePath();
    var fillGrad = ctx.createLinearGradient(0, padT, 0, H - padB);
    var lastVal   = values[values.length - 1];
    var fillColor = lastVal >= initial ? 'rgba(151,117,250,' : 'rgba(239,68,68,';
    fillGrad.addColorStop(0, fillColor + '0.3)');
    fillGrad.addColorStop(1, fillColor + '0.0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // 最終点
    var lastX = xOf(pts.length - 1);
    var lastY = yOf(lastVal);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fillStyle = lastVal >= initial ? '#9775FA' : '#EF4444';
    ctx.fill();

    // ラベル
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('START', padL, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText('FINISH', W - padR, H - 4);

    var finalPnl = lastVal - initial;
    var pnlStr = (finalPnl >= 0 ? '+' : '') + Math.round(finalPnl).toLocaleString('ja-JP') + '円';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = finalPnl >= 0 ? '#A3E635' : '#F87171';
    ctx.textAlign = 'right';
    ctx.fillText(pnlStr, W - padR, lastY - 8 > padT ? lastY - 8 : lastY + 16);
  }

  function _animateAchievements(state) {
    var grid = document.getElementById('finale-ach-grid');
    if (!grid) return;
    var unlocked = (state.achievements && state.achievements.unlocked) || [];

    if (unlocked.length === 0) {
      grid.innerHTML = '<p style="font-size:0.85rem;color:rgba(255,255,255,0.4)">実績を解除してチャレンジしてみましょう！</p>';
      return;
    }

    var DATA = global.ACHIEVEMENTS_LIST || [];
    unlocked.forEach(function (id, i) {
      var def = DATA.find ? DATA.find(function (a) { return a.id === id; }) : null;
      var label = def ? (def.icon + ' ' + def.name) : id;
      var el = document.createElement('div');
      el.className = 'finale-ach-badge';
      el.textContent = label;
      el.style.animationDelay = (i * 60) + 'ms';
      grid.appendChild(el);
    });
  }

  function _playConfetti() {
    if (global.Effects && global.Effects.launchConfetti) {
      global.Effects.launchConfetti(5000);
    }
  }

  /* --------------------------------------------------------------------------
   * 5. ナビゲーション & ボタンバインド
   * -------------------------------------------------------------------------- */
  function _bindNavDots(overlay) {
    overlay.querySelectorAll('.finale-nav-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        var idx = parseInt(dot.getAttribute('data-scene'), 10);
        var target = overlay.querySelectorAll('.finale-scene')[idx];
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // スクロール時にアクティブドットを更新
    overlay.addEventListener('scroll', function () {
      var scenes = overlay.querySelectorAll('.finale-scene');
      var scrollY = overlay.scrollTop;
      var winH = overlay.clientHeight;
      var activeIdx = 0;
      scenes.forEach(function (scene, i) {
        if (scene.offsetTop <= scrollY + winH * 0.5) activeIdx = i;
      });
      overlay.querySelectorAll('.finale-nav-dot').forEach(function (dot, i) {
        dot.classList.toggle('finale-nav-dot--active', i === activeIdx);
      });
    }, { passive: true });
  }

  function _bindSkipButtons(overlay) {
    overlay.querySelectorAll('[data-skip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fromIdx = parseInt(btn.getAttribute('data-skip'), 10);
        var nextIdx = fromIdx + 1;
        var scenes = overlay.querySelectorAll('.finale-scene');
        if (nextIdx < scenes.length) {
          scenes[nextIdx].scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  function _bindActions(overlay, state, stats, gs, rank, levelInfo, nickname, score) {
    // LINE ボタン
    var lineBtn = document.getElementById('finale-line-btn');
    if (lineBtn) {
      lineBtn.addEventListener('click', function () {
        _recordLineClick();
      });
    }

    // 結果カードダウンロード
    var dlBtn = document.getElementById('finale-dl-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        dlBtn.disabled = true;
        dlBtn.textContent = '📥 生成中…';
        setTimeout(function () {
          if (global.ResultCard) {
            global.ResultCard.download({
              nickname:  nickname,
              rank:      rank,
              stats:     stats,
              gs:        gs,
              score:     score,
              levelInfo: levelInfo
            });
          }
          dlBtn.disabled = false;
          dlBtn.textContent = '📥 結果カードを保存する';
        }, 100);
      });
    }

    // ホームに戻る
    var homeBtn = document.getElementById('finale-home-btn');
    if (homeBtn) {
      homeBtn.addEventListener('click', function () {
        var el = document.getElementById('finale-overlay');
        if (el) {
          el.classList.add('finale-overlay--exit');
          el.addEventListener('transitionend', function () {
            if (el.parentNode) el.parentNode.removeChild(el);
          }, { once: true });
        }
        if (global.App) global.App.goHome();
      });
    }
  }

  /* --------------------------------------------------------------------------
   * 6. カウントアップアニメーション
   * -------------------------------------------------------------------------- */
  function _countUp(id, from, to, duration, signed, decimals) {
    var el = document.getElementById(id);
    if (!el) return;
    var start = null;
    var dec = decimals || 0;

    function step(ts) {
      if (!start) start = ts;
      var prog = Math.min((ts - start) / duration, 1);
      var cur  = from + (to - from) * _easeOut(prog);
      el.textContent = cur.toFixed(dec);
      if (prog < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function _countUpPnl(id, from, to, duration) {
    var el = document.getElementById(id);
    if (!el) return;
    var start = null;

    function step(ts) {
      if (!start) start = ts;
      var prog = Math.min((ts - start) / duration, 1);
      var cur  = from + (to - from) * _easeOut(prog);
      el.textContent = (cur >= 0 ? '+' : '') + Math.round(cur).toLocaleString('ja-JP') + '円';
      el.style.color = cur >= 0 ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)';
      if (prog < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function _easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* --------------------------------------------------------------------------
   * 7. 完了データ保存 & CTA記録
   * -------------------------------------------------------------------------- */
  function _saveCompletion(state, rank, stats, score) {
    try {
      global.TrialStore.setState({
        day7Completion: {
          isCompleted: true,
          completedAt:  new Date().toISOString(),
          finalRank:    rank.label,
          finalScore:   score,
          finalStats:   { wins: stats.wins, losses: stats.losses, winRate: stats.winRate, totalPnL: stats.totalPnL }
        }
      });
    } catch (e) {}
  }

  function _recordLineClick() {
    try {
      var cur = global.TrialStore.getState();
      var cta = Object.assign({}, cur.ctaInteractions || {});
      cta.lineButtonClicked = (cta.lineButtonClicked || 0) + 1;
      global.TrialStore.setState({ ctaInteractions: cta });
    } catch (e) {}
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
  var FinalScreen = {
    shouldShow: shouldShow,
    show:       show,
    getRank:    getRank
  };

  global.FinalScreen = FinalScreen;

})(typeof window !== 'undefined' ? window : this);
