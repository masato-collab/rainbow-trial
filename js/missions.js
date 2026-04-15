/* ==========================================================================
 * Rainbow Trial — js/missions.js
 * デイリーミッションシステム
 *
 * 依存: window.DAILY_MISSIONS / window.getMissionsForDay (data/missions-list.js)
 *       window.TrialStore   (js/storage.js)
 *       window.LevelSystem  (js/level-system.js)
 *       window.SoundSystem  (js/sound.js)
 *
 * 公開グローバル: window.MissionSystem
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. 現在 Day のミッション定義を取得
   * -------------------------------------------------------------------------- */
  function getTodayMissions() {
    var s   = global.TrialStore.getState();
    var day = (s.user && s.user.currentDay) || 1;
    return global.getMissionsForDay ? global.getMissionsForDay(day) : [];
  }

  /* --------------------------------------------------------------------------
   * 2. 現在 Day の進捗オブジェクトを取得(なければ初期化)
   * -------------------------------------------------------------------------- */
  function getTodayProgress() {
    var s    = global.TrialStore.getState();
    var day  = (s.user && s.user.currentDay) || 1;
    var key  = 'day' + day;

    if (!s.missions) s.missions = {};
    if (!s.missions[key]) {
      // 初期化: 全ミッションを { count: 0, done: false } で生成
      var defs = global.getMissionsForDay ? global.getMissionsForDay(day) : [];
      s.missions[key] = {};
      defs.forEach(function (m) {
        s.missions[key][m.id] = { count: 0, done: false };
      });
      global.TrialStore.save(s);
    }

    return s.missions[key];
  }

  /* --------------------------------------------------------------------------
   * 3. ミッション進捗を更新するメインAPI
   *    type: 'signal_view' | 'entry' | 'entry_pair' | 'tp_hit' |
   *          'skip' | 'skip_ng' | 'entry_ok' | 'streak' | 'rarity_win' | 'any_trade'
   *    opts: { pair, rarity, streak, condition }
   *
   *    returns: 新たに完了したミッション配列
   * -------------------------------------------------------------------------- */
  function recordEvent(type, opts) {
    opts = opts || {};
    var missions = getTodayMissions();
    if (!missions || !missions.length) return [];

    var s    = global.TrialStore.getState();
    var day  = (s.user && s.user.currentDay) || 1;
    var key  = 'day' + day;

    if (!s.missions)       s.missions = {};
    if (!s.missions[key])  s.missions[key] = {};

    var prog    = s.missions[key];
    var newly   = [];
    var changed = false;

    missions.forEach(function (m) {
      if (!prog[m.id]) prog[m.id] = { count: 0, done: false };
      if (prog[m.id].done) return; // 完了済みスキップ

      var hit = false;

      switch (m.type) {
        case 'signal_view':
          hit = (type === 'signal_view');
          break;

        case 'entry':
          hit = (type === 'entry');
          break;

        case 'entry_pair':
          hit = (type === 'entry') && (opts.pair === m.pair);
          break;

        case 'tp_hit':
          hit = (type === 'tp_hit');
          break;

        case 'skip':
          hit = (type === 'skip');
          break;

        case 'skip_ng':
          // 条件 NG の正しい見送り
          hit = (type === 'skip_ng');
          break;

        case 'entry_ok':
          // 条件 OK の正しいエントリー
          hit = (type === 'entry_ok');
          break;

        case 'streak':
          // 連勝が target 以上になった瞬間に完了(countは使わず streak 値で判定)
          if (type === 'streak_update' && opts.streak >= m.target) {
            prog[m.id].done = true;
            newly.push(m);
            changed = true;
          }
          return; // switch の外 return

        case 'rarity_win':
          // 指定レアリティ以上の TP 到達
          if (type === 'tp_hit' && opts.rarity) {
            hit = _rarityMeetsMin(opts.rarity, m.rarity);
          }
          break;

        case 'any_trade':
          hit = (type === 'entry' || type === 'skip' || type === 'skip_ng' || type === 'entry_ok');
          break;

        default:
          break;
      }

      if (hit) {
        prog[m.id].count = (prog[m.id].count || 0) + 1;
        changed = true;

        if (prog[m.id].count >= m.target) {
          prog[m.id].done = true;
          newly.push(m);
        }
      }
    });

    if (changed) {
      global.TrialStore.save(s);
    }

    // 新規完了ミッションに XP 付与 + SE
    if (newly.length > 0) {
      newly.forEach(function (m) {
        if (m.xp && global.LevelSystem) {
          global.LevelSystem.addXP(m.xp);
        }
      });
      if (global.SoundSystem) {
        global.SoundSystem.play('mission_complete');
      }

      // 全ミッション達成チェック
      _checkDailyComplete(s, day);
    }

    return newly;
  }

  /* --------------------------------------------------------------------------
   * 3a. レアリティ比較ヘルパー
   *     対象 rarity が min_rarity 以上かどうか
   * -------------------------------------------------------------------------- */
  var RARITY_ORDER = ['normal', 'good', 'rare', 'epic', 'legendary'];

  function _rarityMeetsMin(rarity, minRarity) {
    var ri  = RARITY_ORDER.indexOf(rarity);
    var mi  = RARITY_ORDER.indexOf(minRarity);
    if (ri < 0 || mi < 0) return false;
    return ri >= mi;
  }

  /* --------------------------------------------------------------------------
   * 3b. デイリーコンプ(全ミッション達成)チェック
   * -------------------------------------------------------------------------- */
  function _checkDailyComplete(s, day) {
    var key  = 'day' + day;
    var prog = (s.missions && s.missions[key]) || {};
    var defs = global.getMissionsForDay ? global.getMissionsForDay(day) : [];
    if (!defs.length) return;

    var allDone = defs.every(function (m) {
      return prog[m.id] && prog[m.id].done;
    });

    if (allDone) {
      // デイリーコンプ XP ボーナス(1日1回)
      var compKey = 'day_complete_bonus_day' + day;
      if (!s.gameStats) s.gameStats = {};
      if (!s.gameStats[compKey]) {
        s.gameStats[compKey] = true;
        global.TrialStore.save(s);
        if (global.LevelSystem) {
          global.LevelSystem.addXP(global.LevelSystem.XP_RULES.daily_mission);
        }
        _showDailyCompleteModal(day);
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 3c. デイリーコンプモーダル表示
   * -------------------------------------------------------------------------- */
  function _showDailyCompleteModal(day) {
    var modal = document.createElement('div');
    modal.className = 'overlay is-active daily-complete-overlay';
    modal.innerHTML =
      '<div class="overlay__card daily-complete-card">' +
        '<div class="daily-complete-card__emoji">📅</div>' +
        '<div class="daily-complete-card__title">デイリーコンプ達成!</div>' +
        '<div class="daily-complete-card__body">Day ' + day + ' の全ミッションを達成しました！<br>+' + ((global.LevelSystem && global.LevelSystem.XP_RULES && global.LevelSystem.XP_RULES.daily_mission) || 50) + ' XP ボーナス</div>' +
        '<button class="btn btn--primary daily-complete-card__btn">閉じる</button>' +
      '</div>';

    document.body.appendChild(modal);
    modal.querySelector('button').addEventListener('click', function () {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
  }

  /* --------------------------------------------------------------------------
   * 4. 今日のミッション表示データを返す
   * -------------------------------------------------------------------------- */
  function getTodayDisplayData() {
    var missions = getTodayMissions();
    var prog     = getTodayProgress();
    var totalXP  = 0;
    var doneXP   = 0;

    var items = missions.map(function (m) {
      var p       = prog[m.id] || { count: 0, done: false };
      var isDone  = p.done;
      var count   = Math.min(p.count || 0, m.target);
      totalXP += m.xp;
      if (isDone) doneXP += m.xp;

      return {
        id:      m.id,
        title:   m.title,
        xp:      m.xp,
        target:  m.target,
        count:   count,
        done:    isDone
      };
    });

    return {
      items:      items,
      totalXP:    totalXP,
      doneXP:     doneXP,
      allComplete: items.length > 0 && items.every(function (i) { return i.done; })
    };
  }

  /* --------------------------------------------------------------------------
   * 5. ミッションカード HTML 生成(ホーム画面埋め込み用)
   * -------------------------------------------------------------------------- */
  function renderMissionCard() {
    var data = getTodayDisplayData();

    var html = '<div class="mission-card card">';
    html += '<div class="mission-card__header">';
    html += '<span class="mission-card__icon">📅</span>';
    html += '<span class="mission-card__title">今日のミッション</span>';
    if (data.allComplete) {
      html += '<span class="mission-card__complete-badge">✅ 全達成!</span>';
    }
    html += '</div>';

    html += '<div class="mission-card__list">';
    data.items.forEach(function (item) {
      var icon = item.done ? '✅' : '⬜';
      var cls  = item.done ? 'mission-item mission-item--done' : 'mission-item';
      html += '<div class="' + cls + '">';
      html += '<span class="mission-item__icon">' + icon + '</span>';
      html += '<span class="mission-item__title">' + item.title + '</span>';
      if (!item.done && item.target > 1) {
        html += '<span class="mission-item__prog">[' + item.count + '/' + item.target + ']</span>';
      }
      html += '<span class="mission-item__xp">+' + item.xp + ' XP</span>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="mission-card__footer">';
    html += '達成時報酬: <strong>+' + data.totalXP + ' XP</strong>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  /* --------------------------------------------------------------------------
   * 6. 新しい Day に切り替わった時の初期化
   * -------------------------------------------------------------------------- */
  function initDay(day) {
    var s   = global.TrialStore.getState();
    var key = 'day' + day;
    if (!s.missions) s.missions = {};
    if (s.missions[key]) return; // 既に初期化済み

    var defs = global.getMissionsForDay ? global.getMissionsForDay(day) : [];
    s.missions[key] = {};
    defs.forEach(function (m) {
      s.missions[key][m.id] = { count: 0, done: false };
    });
    global.TrialStore.save(s);
  }

  /* --------------------------------------------------------------------------
   * 7. 公開 API
   * -------------------------------------------------------------------------- */
  var MissionSystem = {
    getTodayMissions:    getTodayMissions,
    getTodayProgress:    getTodayProgress,
    getTodayDisplayData: getTodayDisplayData,
    recordEvent:         recordEvent,
    renderMissionCard:   renderMissionCard,
    initDay:             initDay
  };

  global.MissionSystem = MissionSystem;

})(typeof window !== 'undefined' ? window : this);
