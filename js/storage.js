/* ==========================================================================
 * Rainbow Trial — js/storage.js
 * localStorage を介したゲーム状態の永続化レイヤ。
 *
 * 公開グローバル:
 *   window.TrialStore
 *
 * 保存キー: rainbow-trial-v1
 *
 * 状態スキーマ(Phase 1):
 *   {
 *     version: 1,
 *     user:    { nickname, startDate, currentDay, agreedTerms, testMode },
 *     account: { initialCapital, currentCapital, totalPnL },
 *     trades:  [ { signalId, type: 'trade'|'skip', ... } ],
 *     signals: [ { signalId,
 *                  status: 'scheduled' | 'delivered_realtime'
 *                        | 'delivered_pending' | 'viewed'
 *                        | 'entered' | 'skipped' | 'completed',
 *                  scheduledTime, deliveredAt, viewedAt, decidedAt } ],
 *     currentPosition: null | { signalId, entryTime, mode: 'fast'|'realtime',
 *                               startAt, endAt, result },
 *     settings: { soundEnabled, notificationsGranted },
 *     lastActiveTime: ISO 文字列(最終ハートビート時刻)
 *   }
 * ========================================================================== */

(function (global) {
  'use strict';

  const KEY = 'rainbow-trial-v1';
  const VERSION = 4;          // Phase 4 で 4 に更新(既存データは migrate() で保持)
  const INITIAL_CAPITAL = 300000;

  /* --------------------------------------------------------------------------
   * 1. localStorage の利用可否判定(プライベートモード等へのフォールバック)
   * -------------------------------------------------------------------------- */
  let backend = null;   // 実際の localStorage か メモリ代替 Object
  let usingMemory = false;

  (function detectBackend() {
    try {
      if (typeof localStorage === 'undefined') throw new Error('no localStorage');
      const probe = '__rt_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      backend = localStorage;
    } catch (e) {
      // メモリ代替(セッション限りでも動くように)
      const mem = {};
      backend = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
      usingMemory = true;
      console.warn('[TrialStore] localStorage 利用不可。メモリ代替を使用します。');
    }
  })();

  /* --------------------------------------------------------------------------
   * 2. 初期状態
   * -------------------------------------------------------------------------- */
  function createInitialState() {
    return {
      version: VERSION,
      user: {
        nickname: '',
        startDate: null,       // ISO文字列
        currentDay: 1,
        agreedTerms: false,
        testMode: false,       // true = シグナル配信間隔 1 分
        // Phase 3 追加
        level: 1,
        xp: 0,
        titleAchieved: '見習いトレーダー'
      },
      account: {
        initialCapital: INITIAL_CAPITAL,
        currentCapital: INITIAL_CAPITAL,
        totalPnL: 0
      },
      trades: [],              // 完了したトレード記録
      signals: [],             // シグナルの配信/決定ステータス
      currentPosition: null,
      // Phase 3 追加: ゲーム統計
      gameStats: {
        totalSignalsReceived: 0,
        totalEntries: 0,
        totalSkips: 0,
        totalTPHits: 0,
        totalSLHits: 0,
        totalOKSignals: 0,     // 条件OKシグナルを受信した回数
        totalNGSignals: 0,     // 条件NGシグナルを受信した回数
        correctEntriesOK: 0,  // 条件OK時の正しいエントリー数
        correctSkipsNG: 0,    // 条件NG時の正しい見送り数
        consecutiveNGSkips: 0,   // 連続NG見送りカウント(実績「ルール守護者」用)
        consecutiveOKEntries: 0, // 連続OK正解エントリーカウント(実績「完璧な判定」用)
        currentStreak: 0,
        maxStreak: 0,
        judgmentScore: 0,
        capitalHistory: [],    // [{ label, capital }] 資金推移グラフ用
        dailyStats: {}         // { day1: { entries, wins, judgmentScore } }
      },
      // Phase 3 追加: 実績
      achievements: {
        unlocked: [],
        progress: {},
        lastUnlockedAt: null
      },
      // Phase 3 追加: デイリーミッション進捗
      missions: {},
      settings: {
        soundEnabled: true,
        notificationsGranted: false,
        // Phase 3 追加: 効果音設定
        sound: {
          enabled: true,
          volume: 0.8,
          raritySounds: {
            normal:    true,
            good:      true,
            rare:      true,
            epic:      true,
            legendary: true
          }
        },
        // Phase 3 追加: アニメーション設定
        animations: {
          reduced: false
        }
      },
      lastActiveTime: null,    // 最終アクティブ時刻(ISO)
      // Phase 4 追加
      masterMessages: {
        shown:     {},   // { id: isoStr }
        unreadIds: [],
        history:   []
      },
      day7Completion: {
        isCompleted: false,
        completedAt: null,
        finalRank:   null,
        finalScore:  null,
        finalStats:  null
      },
      ctaInteractions: {
        lineButtonClicked:     0,
        resultCardDownloaded:  0
      }
    };
  }

  /* --------------------------------------------------------------------------
   * 3. マイグレーション(既存データを保持しつつ新規フィールドを補完)
   * -------------------------------------------------------------------------- */
  function migrate(data) {
    if (!data || typeof data !== 'object') return createInitialState();

    const init   = createInitialState();
    const merged = Object.assign({}, init, data);

    // user: 既存フィールドを保持しつつ Phase 3 追加フィールドを補完
    merged.user = Object.assign({}, init.user, data.user || {});
    if (merged.user.level         == null) merged.user.level         = 1;
    if (merged.user.xp            == null) merged.user.xp            = 0;
    if (merged.user.titleAchieved == null) merged.user.titleAchieved = '見習いトレーダー';

    // account
    merged.account = Object.assign({}, init.account, data.account || {});

    // settings: ネストを深くマージ(Phase 3 の sound / animations を補完)
    const oldSettings = data.settings || {};
    merged.settings = Object.assign({}, init.settings, oldSettings);
    merged.settings.sound = Object.assign({}, init.settings.sound, oldSettings.sound || {});
    merged.settings.sound.raritySounds = Object.assign(
      {}, init.settings.sound.raritySounds,
      (oldSettings.sound && oldSettings.sound.raritySounds) || {}
    );
    merged.settings.animations = Object.assign({}, init.settings.animations, oldSettings.animations || {});

    // Phase 3 新規フィールド: gameStats
    merged.gameStats = Object.assign({}, init.gameStats, data.gameStats || {});

    // Phase 3 新規フィールド: achievements
    const oldAch = data.achievements || {};
    merged.achievements = {
      unlocked:       Array.isArray(oldAch.unlocked) ? oldAch.unlocked.slice() : [],
      progress:       Object.assign({}, oldAch.progress || {}),
      lastUnlockedAt: oldAch.lastUnlockedAt || null
    };

    // Phase 3 新規フィールド: missions
    merged.missions = Object.assign({}, data.missions || {});

    // Phase 4: 設定フィールド保持
    var oldS = data.settings || {};
    if (oldS._lastKnownDay)         merged.settings._lastKnownDay         = oldS._lastKnownDay;
    if (oldS._finalScreenAutoShown) merged.settings._finalScreenAutoShown = oldS._finalScreenAutoShown;
    if (oldS._lineBannerDismissed)  merged.settings._lineBannerDismissed  = oldS._lineBannerDismissed;
    // 旧 masterMessageShown → 新 hikari.shown へ移行
    if (oldS.masterMessageShown) {
      merged.settings.hikari = merged.settings.hikari || { shown: {}, unreadIds: [], history: [] };
      Object.keys(oldS.masterMessageShown).forEach(function (k) {
        merged.settings.hikari.shown[k] = merged.settings.hikari.shown[k] || new Date().toISOString();
      });
    }
    // 新形式の hikari 設定を保持
    if (oldS.hikari) {
      merged.settings.hikari = {
        shown:     Object.assign({}, (merged.settings.hikari && merged.settings.hikari.shown) || {}, oldS.hikari.shown || {}),
        unreadIds: oldS.hikari.unreadIds || [],
        history:   oldS.hikari.history   || []
      };
    }

    // Phase 4: day7Completion / ctaInteractions 保持
    merged.day7Completion   = Object.assign({}, init.day7Completion,   data.day7Completion   || {});
    merged.ctaInteractions  = Object.assign({}, init.ctaInteractions,  data.ctaInteractions  || {});
    merged.masterMessages   = Object.assign({}, init.masterMessages,   data.masterMessages   || {});

    merged.trades         = Array.isArray(data.trades)  ? data.trades.slice()  : [];
    merged.signals        = Array.isArray(data.signals) ? data.signals.slice() : [];
    merged.currentPosition = data.currentPosition || null;
    merged.lastActiveTime  = data.lastActiveTime  || null;
    merged.version         = VERSION;

    return merged;
  }

  /* --------------------------------------------------------------------------
   * 4. 読み書き基本関数
   * -------------------------------------------------------------------------- */
  function save(state) {
    try {
      backend.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('[TrialStore] save failed:', e);
      return false;
    }
  }

  function load() {
    try {
      const raw = backend.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return migrate(data);
    } catch (e) {
      console.warn('[TrialStore] load failed:', e);
      return null;
    }
  }

  /** 必ず有効な state を返す(未作成なら初期状態) */
  function getState() {
    return load() || createInitialState();
  }

  /**
   * 部分マージで更新。
   * settings は深くマージ(既存の sound/animations 等が上書きされないように)
   */
  function setState(partial) {
    const cur = getState();
    const next = Object.assign({}, cur, partial);
    if (partial && partial.settings) {
      next.settings = Object.assign({}, cur.settings || {}, partial.settings);
    }
    save(next);
    return next;
  }

  /* --------------------------------------------------------------------------
   * 5. ユーザー関連
   * -------------------------------------------------------------------------- */
  /** ウェルカム画面から初期化 */
  function initUser(nickname, agreedTerms, testMode) {
    const state = createInitialState();
    const now = new Date().toISOString();
    state.user.nickname = String(nickname || '').trim();
    state.user.startDate = now;
    state.user.currentDay = 1;
    state.user.agreedTerms = !!agreedTerms;
    state.user.testMode = !!testMode;
    state.lastActiveTime = now;
    save(state);
    return state;
  }

  /** ニックネーム登録済みかつ startDate がある = 初回起動済み */
  function isInitialized() {
    const s = load();
    return !!(s && s.user && s.user.nickname && s.user.startDate);
  }

  /** 起動から経過した分数 */
  function getElapsedMinutes() {
    const s = load();
    if (!s || !s.user || !s.user.startDate) return 0;
    const start = new Date(s.user.startDate).getTime();
    if (isNaN(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 60000));
  }

  /* --------------------------------------------------------------------------
   * 6. 資金 / トレード
   * -------------------------------------------------------------------------- */
  /** 資金残高を delta(+/-)で更新。totalPnL にも加算 */
  function updateAccount(delta) {
    const s = getState();
    const d = Number(delta) || 0;
    s.account.currentCapital = Math.round((s.account.currentCapital + d) * 100) / 100;
    s.account.totalPnL = Math.round((s.account.totalPnL + d) * 100) / 100;
    save(s);
    return s.account;
  }

  /** トレード(または見送り)を履歴に追加 */
  function addTrade(trade) {
    const s = getState();
    const entry = Object.assign({
      id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      recordedAt: new Date().toISOString()
    }, trade);
    s.trades.push(entry);
    save(s);
    return entry;
  }

  /** 履歴一覧(新しい順) */
  function listTrades() {
    const s = getState();
    return s.trades.slice().reverse();
  }

  /* --------------------------------------------------------------------------
   * 7. シグナルステータス管理
   * -------------------------------------------------------------------------- */
  /** シグナルの配信/決定状態を更新(upsert) */
  function updateSignal(signalId, updates) {
    const s = getState();
    const idx = s.signals.findIndex(function (x) { return x.signalId === signalId; });
    const now = new Date().toISOString();
    if (idx >= 0) {
      s.signals[idx] = Object.assign({}, s.signals[idx], updates, { updatedAt: now });
    } else {
      s.signals.push(Object.assign({
        signalId: signalId,
        status: 'received',
        receivedAt: now,
        updatedAt: now
      }, updates));
    }
    save(s);
  }

  function getSignalStatus(signalId) {
    const s = load();
    if (!s) return null;
    return s.signals.find(function (x) { return x.signalId === signalId; }) || null;
  }

  /** 配信済みかつ未確認のシグナルID一覧(ホーム画面の「新着」表示用) */
  function getUnviewedSignalIds() {
    const s = getState();
    return s.signals
      .filter(function (x) {
        return x.status === 'delivered_realtime' || x.status === 'delivered_pending';
      })
      .map(function (x) { return x.signalId; });
  }

  /** タブ復帰時・起動時に呼ぶ最終アクティブ時刻の更新 */
  function updateLastActive() {
    const s = getState();
    s.lastActiveTime = new Date().toISOString();
    save(s);
    return s.lastActiveTime;
  }

  /** 前回アクティブ時刻から現在までの経過ミリ秒(起動時の差分判定用) */
  function getMillisSinceLastActive() {
    const s = load();
    if (!s || !s.lastActiveTime) return 0;
    const t = new Date(s.lastActiveTime).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Date.now() - t);
  }

  /* --------------------------------------------------------------------------
   * 8. 保有ポジション
   * -------------------------------------------------------------------------- */
  function setCurrentPosition(position) {
    const s = getState();
    s.currentPosition = position ? Object.assign({}, position) : null;
    save(s);
    return s.currentPosition;
  }

  function getCurrentPosition() {
    const s = load();
    return s ? s.currentPosition : null;
  }

  function clearCurrentPosition() {
    const s = getState();
    s.currentPosition = null;
    save(s);
  }

  /* --------------------------------------------------------------------------
   * 9. 集計
   * -------------------------------------------------------------------------- */
  /** 基本戦績 */
  function computeStats() {
    const s = getState();
    const realTrades = s.trades.filter(function (t) { return t.type !== 'skip'; });
    const wins = realTrades.filter(function (t) { return (t.pnl || 0) > 0; }).length;
    const losses = realTrades.filter(function (t) { return (t.pnl || 0) < 0; }).length;

    // 連勝/連敗
    let curStreak = 0;
    let maxWinStreak = 0;
    let maxLoseStreak = 0;
    for (let i = 0; i < realTrades.length; i++) {
      const pnl = realTrades[i].pnl || 0;
      if (pnl > 0) {
        curStreak = curStreak > 0 ? curStreak + 1 : 1;
      } else if (pnl < 0) {
        curStreak = curStreak < 0 ? curStreak - 1 : -1;
      } else {
        curStreak = 0;
      }
      if (curStreak > maxWinStreak) maxWinStreak = curStreak;
      if (-curStreak > maxLoseStreak) maxLoseStreak = -curStreak;
    }

    return {
      totalTrades: realTrades.length,
      skipCount: s.trades.length - realTrades.length,
      wins: wins,
      losses: losses,
      winRate: realTrades.length > 0 ? +(wins / realTrades.length * 100).toFixed(1) : 0,
      totalPnL: s.account.totalPnL,
      currentCapital: s.account.currentCapital,
      initialCapital: s.account.initialCapital,
      capitalRate: s.account.initialCapital > 0
        ? +((s.account.currentCapital / s.account.initialCapital - 1) * 100).toFixed(2)
        : 0,
      maxWinStreak: maxWinStreak,
      maxLoseStreak: maxLoseStreak
    };
  }

  /* --------------------------------------------------------------------------
   * 9b. Phase 3: gameStats 更新
   * -------------------------------------------------------------------------- */
  /**
   * gameStats の指定フィールドを増分更新。
   * @param {Object} patch — { totalEntries: 1, totalTPHits: 1, ... } など
   */
  function incrementGameStats(patch) {
    const s = getState();
    if (!s.gameStats) s.gameStats = {};
    Object.keys(patch).forEach(function (key) {
      const val = patch[key];
      if (typeof val === 'number') {
        s.gameStats[key] = (s.gameStats[key] || 0) + val;
      }
    });
    save(s);
    return s.gameStats;
  }

  /** gameStats フィールドを直接セット(streak リセット等) */
  function setGameStats(patch) {
    const s = getState();
    if (!s.gameStats) s.gameStats = {};
    Object.assign(s.gameStats, patch);
    save(s);
    return s.gameStats;
  }

  /** 資金推移履歴に1点追加 */
  function pushCapitalHistory(label, capital) {
    const s = getState();
    if (!s.gameStats) s.gameStats = {};
    if (!Array.isArray(s.gameStats.capitalHistory)) s.gameStats.capitalHistory = [];
    s.gameStats.capitalHistory.push({ label: label, capital: capital });
    // 最大 200 件まで保持
    if (s.gameStats.capitalHistory.length > 200) {
      s.gameStats.capitalHistory = s.gameStats.capitalHistory.slice(-200);
    }
    save(s);
  }

  /* --------------------------------------------------------------------------
   * 10. デバッグ / リセット
   * -------------------------------------------------------------------------- */
  /** 全削除(デバッグ用) */
  function resetAll() {
    try {
      backend.removeItem(KEY);
      return true;
    } catch (e) {
      console.warn('[TrialStore] reset failed:', e);
      return false;
    }
  }

  /**
   * startDate をずらすデバッグ機能(Phase 2 の早送り時刻移動に備えた入口)
   * @param {number} minutesOffset 経過時間を minutesOffset 分だけ進める(+ で進む)
   */
  function shiftStartDate(minutesOffset) {
    const s = getState();
    if (!s.user.startDate) return;
    const cur = new Date(s.user.startDate).getTime();
    const next = new Date(cur - minutesOffset * 60000);
    s.user.startDate = next.toISOString();
    save(s);
  }

  /* --------------------------------------------------------------------------
   * 11. 設定
   * -------------------------------------------------------------------------- */
  function updateSettings(patch) {
    const s = getState();
    s.settings = Object.assign({}, s.settings, patch || {});
    save(s);
    return s.settings;
  }

  /* --------------------------------------------------------------------------
   * 12. 公開 API
   * -------------------------------------------------------------------------- */
  const TrialStore = {
    KEY: KEY,
    VERSION: VERSION,
    INITIAL_CAPITAL: INITIAL_CAPITAL,

    // 基本
    createInitialState: createInitialState,
    load: load,
    save: save,
    getState: getState,
    setState: setState,

    // ユーザー
    initUser: initUser,
    isInitialized: isInitialized,
    getElapsedMinutes: getElapsedMinutes,

    // 資金 / トレード
    updateAccount: updateAccount,
    addTrade: addTrade,
    listTrades: listTrades,

    // シグナル
    updateSignal: updateSignal,
    getSignalStatus: getSignalStatus,
    getUnviewedSignalIds: getUnviewedSignalIds,

    // 最終アクティブ時刻
    updateLastActive: updateLastActive,
    getMillisSinceLastActive: getMillisSinceLastActive,

    // ポジション
    setCurrentPosition: setCurrentPosition,
    getCurrentPosition: getCurrentPosition,
    clearCurrentPosition: clearCurrentPosition,

    // 集計
    computeStats: computeStats,

    // Phase 3: gameStats
    incrementGameStats:  incrementGameStats,
    setGameStats:        setGameStats,
    pushCapitalHistory:  pushCapitalHistory,

    // 設定
    updateSettings: updateSettings,

    // デバッグ
    resetAll: resetAll,
    shiftStartDate: shiftStartDate,
    isUsingMemoryFallback: function () { return usingMemory; }
  };

  global.TrialStore = TrialStore;

})(typeof window !== 'undefined' ? window : this);
