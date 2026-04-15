/* ==========================================================================
 * Rainbow Trial — js/achievements.js
 * アチーブメント(実績バッジ)システム
 *
 * 依存: window.ACHIEVEMENTS (data/achievements-list.js)
 *       window.TrialStore   (js/storage.js)
 *       window.LevelSystem  (js/level-system.js)
 *       window.SoundSystem  (js/sound.js)
 *
 * 公開グローバル: window.AchievementSystem
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. トースト表示キュー(重複防止・連続解除対応)
   * -------------------------------------------------------------------------- */
  var toastQueue   = [];
  var toastActive  = false;
  var TOAST_DURATION_MS = 5000;

  /* --------------------------------------------------------------------------
   * 2. 実績チェック & 解除
   *    state を渡すと未解除の実績を全件チェックし、
   *    新たに解除された実績配列を返す。
   * -------------------------------------------------------------------------- */
  function checkAll(state) {
    if (!global.ACHIEVEMENTS) return [];
    var unlocked = (state.achievements && state.achievements.unlocked) || [];
    var newly = [];

    for (var i = 0; i < global.ACHIEVEMENTS.length; i++) {
      var ach = global.ACHIEVEMENTS[i];
      if (unlocked.indexOf(ach.id) !== -1) continue; // 既解除スキップ

      try {
        if (ach.condition(state)) {
          newly.push(ach);
        }
      } catch (e) {
        // condition エラーは無視
      }
    }

    if (newly.length === 0) return [];

    // ストレージに保存
    var s = global.TrialStore.getState();
    if (!s.achievements) {
      s.achievements = { unlocked: [], progress: {}, lastUnlockedAt: null };
    }
    var now = new Date().toISOString();
    for (var j = 0; j < newly.length; j++) {
      s.achievements.unlocked.push(newly[j].id);
      s.achievements.lastUnlockedAt = now;

      // XP ボーナス付与
      if (newly[j].xpReward && global.LevelSystem) {
        global.LevelSystem.addXP(newly[j].xpReward);
      }
    }
    global.TrialStore.save(s);

    // トーストを順番に表示
    for (var k = 0; k < newly.length; k++) {
      enqueueToast(newly[k]);
    }

    // SE
    if (global.SoundSystem) {
      global.SoundSystem.play('achievement');
    }

    return newly;
  }

  /* --------------------------------------------------------------------------
   * 3. 進捗更新(progress 型実績の進捗値を localStorage に保存)
   * -------------------------------------------------------------------------- */
  function updateProgress(state) {
    if (!global.ACHIEVEMENTS) return;
    var s = state || global.TrialStore.getState();
    if (!s.achievements) {
      s.achievements = { unlocked: [], progress: {}, lastUnlockedAt: null };
    }

    var changed = false;
    for (var i = 0; i < global.ACHIEVEMENTS.length; i++) {
      var ach = global.ACHIEVEMENTS[i];
      if (typeof ach.progress !== 'function') continue;
      if ((s.achievements.unlocked || []).indexOf(ach.id) !== -1) continue;

      try {
        var val = ach.progress(s);
        if (s.achievements.progress[ach.id] !== val) {
          s.achievements.progress[ach.id] = val;
          changed = true;
        }
      } catch (e) { /* skip */ }
    }

    if (changed) global.TrialStore.save(s);
  }

  /* --------------------------------------------------------------------------
   * 4. トースト表示
   * -------------------------------------------------------------------------- */
  function enqueueToast(ach) {
    toastQueue.push(ach);
    if (!toastActive) showNextToast();
  }

  function showNextToast() {
    if (toastQueue.length === 0) { toastActive = false; return; }
    toastActive = true;
    var ach = toastQueue.shift();

    var el = document.createElement('div');
    el.className = 'achievement-toast';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="achievement-toast__icon">' + ach.icon + '</span>' +
      '<div class="achievement-toast__body">' +
        '<div class="achievement-toast__label">🏆 実績解除!</div>' +
        '<div class="achievement-toast__title">' + ach.title + '</div>' +
        '<div class="achievement-toast__xp">+' + (ach.xpReward || 0) + ' XP</div>' +
      '</div>';

    document.body.appendChild(el);

    // 入場アニメーション
    requestAnimationFrame(function () {
      el.classList.add('achievement-toast--enter');
    });

    // タップで即消し(touchend で 300ms 遅延を回避)
    el.addEventListener('touchend', function (e) { e.preventDefault(); dismissToast(el); }, { passive: false });
    el.addEventListener('click', function () { dismissToast(el); });

    // 自動消滅
    var timer = setTimeout(function () { dismissToast(el); }, TOAST_DURATION_MS);
    el._dismissTimer = timer;
  }

  function dismissToast(el) {
    if (!el || !el.parentNode) { scheduleNext(); return; }
    clearTimeout(el._dismissTimer);
    el.classList.remove('achievement-toast--enter');
    el.classList.add('achievement-toast--leave');
    el.addEventListener('transitionend', function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      scheduleNext();
    }, { once: true });
  }

  function scheduleNext() {
    setTimeout(function () { showNextToast(); }, 400);
  }

  /* --------------------------------------------------------------------------
   * 5. 実績一覧画面用データ取得
   * -------------------------------------------------------------------------- */
  /**
   * 全実績を「解除済み/未解除/進捗」付きで返す。
   * @param {Object} state TrialStore.getState() の結果
   */
  function getDisplayList(state) {
    if (!global.ACHIEVEMENTS) return [];
    var unlocked  = (state.achievements && state.achievements.unlocked)  || [];
    var progress  = (state.achievements && state.achievements.progress)  || {};

    return global.ACHIEVEMENTS.map(function (ach) {
      var isUnlocked = unlocked.indexOf(ach.id) !== -1;
      var progressVal = progress[ach.id] || 0;

      return {
        id:          ach.id,
        icon:        isUnlocked ? ach.icon : (ach.secret ? '???' : ach.icon),
        title:       isUnlocked ? ach.title : (ach.secret ? '???' : ach.title),
        description: isUnlocked ? ach.description : (ach.secret ? 'シークレット実績' : ach.description),
        category:    ach.category,
        xpReward:    ach.xpReward,
        secret:      ach.secret,
        isUnlocked:  isUnlocked,
        progressVal: progressVal,
        progressMax: ach.progressMax || null
      };
    });
  }

  /* --------------------------------------------------------------------------
   * 6. カテゴリラベル
   * -------------------------------------------------------------------------- */
  var CATEGORY_LABELS = {
    beginner: '🥉 初心者',
    streak:   '🔥 連勝・連続',
    skill:    '👁️ 判定スキル',
    rarity:   '✨ レアリティ',
    volume:   '📊 トレード量',
    pair:     '💱 通貨ペア',
    overall:  '🏆 総合'
  };

  /* --------------------------------------------------------------------------
   * 7. 実績一覧画面 HTML 生成
   * -------------------------------------------------------------------------- */
  function renderAchievementsPage(state) {
    var list = getDisplayList(state);
    var unlockedCount = list.filter(function (a) { return a.isUnlocked; }).length;

    // カテゴリ別にグループ化
    var categories = ['beginner', 'streak', 'skill', 'rarity', 'volume', 'pair', 'overall'];
    var html = '<div class="ach-page">';
    html += '<div class="ach-page__header">';
    html += '<div class="ach-page__summary">';
    html += '<span class="ach-page__count">' + unlockedCount + ' / ' + list.length + '</span>';
    html += '<span class="ach-page__label"> 実績解除</span>';
    html += '</div>';
    html += '</div>';

    categories.forEach(function (cat) {
      var items = list.filter(function (a) { return a.category === cat; });
      if (!items.length) return;

      html += '<div class="ach-category">';
      html += '<div class="ach-category__title">' + (CATEGORY_LABELS[cat] || cat) + '</div>';
      html += '<div class="ach-grid">';
      items.forEach(function (item) {
        html += buildAchCard(item);
      });
      html += '</div></div>';
    });

    html += '</div>';
    return html;
  }

  function buildAchCard(item) {
    var cls = 'ach-card' + (item.isUnlocked ? ' ach-card--unlocked' : ' ach-card--locked');
    var progressHTML = '';

    if (!item.isUnlocked && item.progressMax) {
      var pct = Math.min(100, Math.floor(item.progressVal / item.progressMax * 100));
      var filled = Math.round(pct / 10);
      var bar = '━'.repeat(filled) + '░'.repeat(10 - filled);
      progressHTML =
        '<div class="ach-card__progress">' +
          '<span class="ach-card__bar">' + bar + '</span>' +
          '<span class="ach-card__prog-num">' + item.progressVal + '/' + item.progressMax + '</span>' +
        '</div>';
    }

    return (
      '<div class="' + cls + '" data-ach-id="' + item.id + '">' +
        '<div class="ach-card__icon">' + (item.isUnlocked ? item.icon : (item.secret ? '🔒' : item.icon)) + '</div>' +
        '<div class="ach-card__body">' +
          '<div class="ach-card__title">' + item.title + '</div>' +
          '<div class="ach-card__desc">' + item.description + '</div>' +
          (item.isUnlocked ? '<div class="ach-card__xp">+' + item.xpReward + ' XP</div>' : '') +
          progressHTML +
        '</div>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 8. 公開 API
   * -------------------------------------------------------------------------- */
  var AchievementSystem = {
    checkAll:             checkAll,
    updateProgress:       updateProgress,
    getDisplayList:       getDisplayList,
    renderAchievementsPage: renderAchievementsPage,
    CATEGORY_LABELS:      CATEGORY_LABELS
  };

  global.AchievementSystem = AchievementSystem;

})(typeof window !== 'undefined' ? window : this);
