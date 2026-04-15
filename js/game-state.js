/* ==========================================================================
 * Rainbow Trial — js/game-state.js
 * ゲーム状態の高レベル層。
 * - TrialStore(localStorage) と ScenarioUtil(シナリオ) を束ねる
 * - 経過時間 / Day 進行 / テストモード時間圧縮 を計算
 * - 状態変更の購読(subscribe)を提供
 *
 * 公開グローバル: window.GameState
 *
 * Phase 2 拡張ポイント:
 * - Day4〜Day7 のサポートは calcDay のしきい値のみで拡張
 * - getEffectiveDeliveryMinute にスケジュール戦略を切り替えるフックあり
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. 定数
   * -------------------------------------------------------------------------- */
  const DAY_LENGTH_MIN_NORMAL = 1440;   // 通常モード: 1 Day = 24 時間
  const DAY_LENGTH_MIN_TEST   = 12;     // テストモード: 1 Day = 12 分(10シグナル+バッファ2分)
  const TOTAL_DAYS            = 7;      // 表示上の総日数
  const PHASE1_MAX_DAY        = 7;      // シナリオが用意されている最終 Day

  /* --------------------------------------------------------------------------
   * 2. イベント購読
   * -------------------------------------------------------------------------- */
  const listeners = new Set();

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.add(fn);
    return function unsubscribe() { listeners.delete(fn); };
  }

  function emit(event) {
    listeners.forEach(function (fn) {
      try { fn(event); } catch (e) { console.error('[GameState] listener error', e); }
    });
  }

  /* --------------------------------------------------------------------------
   * 3. モード / 経過時間 / Day 計算
   * -------------------------------------------------------------------------- */
  function getStore() { return global.TrialStore; }
  function getScenario() { return global.ScenarioUtil; }

  function isTestMode() {
    const s = getStore().getState();
    return !!(s && s.user && s.user.testMode);
  }

  function dayLengthMinutes() {
    return isTestMode() ? DAY_LENGTH_MIN_TEST : DAY_LENGTH_MIN_NORMAL;
  }

  function getElapsedMinutes() {
    return getStore().getElapsedMinutes();
  }

  /** 現在の Day(1..PHASE1_MAX_DAY)または 'ended'(Phase 1 で扱える範囲外) */
  function getCurrentDay() {
    const mins = getElapsedMinutes();
    const len = dayLengthMinutes();
    const d = Math.floor(mins / len) + 1;
    if (d > PHASE1_MAX_DAY) return 'ended';
    return d;
  }

  /** 表示用 Day 番号(1..7、ended なら 7 扱い) */
  function getDisplayDay() {
    const d = getCurrentDay();
    if (d === 'ended') return TOTAL_DAYS;
    return Math.min(d, TOTAL_DAYS);
  }

  /** Day 内経過率(0..1) */
  function getDayProgress() {
    const mins = getElapsedMinutes();
    const len = dayLengthMinutes();
    const within = mins % len;
    return clamp01(within / len);
  }

  /** 総合経過率(0..1、TOTAL_DAYS 基準) */
  function getOverallProgress() {
    const mins = getElapsedMinutes();
    const total = dayLengthMinutes() * TOTAL_DAYS;
    return clamp01(mins / total);
  }

  function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  /* --------------------------------------------------------------------------
   * 4. シグナルの実効配信時刻
   *    - 通常: signal.relativeTime をそのまま使用
   *    - テスト: (day-1)*DAY_LENGTH_MIN_TEST + (Day 内の位置 1..10)
   * -------------------------------------------------------------------------- */
  const testMinuteCache = { key: null, map: null };

  function buildTestScheduleMap() {
    const map = new Map();
    for (let d = 1; d <= PHASE1_MAX_DAY; d++) {
      const arr = getScenario().getForDay(d);
      for (let i = 0; i < arr.length; i++) {
        map.set(arr[i].id, (d - 1) * DAY_LENGTH_MIN_TEST + (i + 1));
      }
    }
    return map;
  }

  function getTestScheduleMap() {
    // ScenarioUtil は読み取り専用なので 1 回作って再利用
    if (!testMinuteCache.map) {
      testMinuteCache.map = buildTestScheduleMap();
    }
    return testMinuteCache.map;
  }

  function getEffectiveDeliveryMinute(signal) {
    if (!signal) return Infinity;
    if (isTestMode()) {
      const map = getTestScheduleMap();
      return map.has(signal.id) ? map.get(signal.id) : signal.relativeTime;
    }
    return signal.relativeTime;
  }

  /** 経過分数までに配信時刻を過ぎたシグナル(昇順) */
  function getDueSignals(atMinutes) {
    const mins = typeof atMinutes === 'number' ? atMinutes : getElapsedMinutes();
    return getScenario().getAll()
      .map(function (s) { return { signal: s, due: getEffectiveDeliveryMinute(s) }; })
      .filter(function (x) { return x.due <= mins; })
      .sort(function (a, b) { return a.due - b.due; })
      .map(function (x) { return x.signal; });
  }

  /** 次に配信予定のシグナル */
  function getNextUpcomingSignal() {
    const mins = getElapsedMinutes();
    const upcoming = getScenario().getAll()
      .map(function (s) { return { signal: s, due: getEffectiveDeliveryMinute(s) }; })
      .filter(function (x) { return x.due > mins; })
      .sort(function (a, b) { return a.due - b.due; });
    if (upcoming.length === 0) return null;
    return {
      signal: upcoming[0].signal,
      minutesUntil: upcoming[0].due - mins
    };
  }

  /* --------------------------------------------------------------------------
   * 5. スナップショット(UI 描画用)
   * -------------------------------------------------------------------------- */
  function snapshot() {
    const store = getStore().getState();
    const stats = getStore().computeStats();
    return {
      elapsedMinutes:   getElapsedMinutes(),
      currentDay:       getCurrentDay(),
      displayDay:       getDisplayDay(),
      totalDays:        TOTAL_DAYS,
      dayProgress:      getDayProgress(),
      overallProgress:  getOverallProgress(),
      testMode:         isTestMode(),
      dayLengthMinutes: dayLengthMinutes(),
      user:             store.user,
      account:          store.account,
      currentPosition:  store.currentPosition,
      stats:            stats,
      unviewedIds:      getStore().getUnviewedSignalIds(),
      next:             getNextUpcomingSignal()
    };
  }

  /* --------------------------------------------------------------------------
   * 6. シグナル状態遷移(各状態変更 + emit)
   * -------------------------------------------------------------------------- */
  function markDelivered(signalId, mode) {
    const status = mode === 'realtime' ? 'delivered_realtime' : 'delivered_pending';
    getStore().updateSignal(signalId, {
      status: status,
      deliveredAt: new Date().toISOString()
    });
    emit({ type: 'signal_delivered', signalId: signalId, mode: mode });
  }

  function markViewed(signalId) {
    getStore().updateSignal(signalId, {
      status: 'viewed',
      viewedAt: new Date().toISOString()
    });
    emit({ type: 'signal_viewed', signalId: signalId });
  }

  function markEntered(signalId) {
    getStore().updateSignal(signalId, {
      status: 'entered',
      decidedAt: new Date().toISOString()
    });
    emit({ type: 'signal_entered', signalId: signalId });
  }

  function markSkipped(signalId) {
    getStore().updateSignal(signalId, {
      status: 'skipped',
      decidedAt: new Date().toISOString()
    });
    emit({ type: 'signal_skipped', signalId: signalId });
  }

  function markCompleted(signalId, result) {
    getStore().updateSignal(signalId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: result
    });
    emit({ type: 'signal_completed', signalId: signalId, result: result });
  }

  /* --------------------------------------------------------------------------
   * 7. 資金 / トレード
   * -------------------------------------------------------------------------- */
  function adjustAccount(delta) {
    const acc = getStore().updateAccount(delta);
    emit({ type: 'account_changed', account: acc, delta: delta });
    return acc;
  }

  function recordTrade(trade) {
    const entry = getStore().addTrade(trade);
    emit({ type: 'trade_recorded', trade: entry });
    return entry;
  }

  /* --------------------------------------------------------------------------
   * 8. フォーマッタ(UI 全体で共通利用)
   * -------------------------------------------------------------------------- */
  function formatCapital(value) {
    const v = Math.round(Number(value) || 0);
    return '¥' + v.toLocaleString('ja-JP');
  }

  function formatSignedCurrency(value) {
    const v = Math.round(Number(value) || 0);
    const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
    return sign + '¥' + Math.abs(v).toLocaleString('ja-JP');
  }

  function formatSignedPips(value) {
    const v = Math.round(Number(value) || 0);
    const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
    return sign + Math.abs(v) + 'pips';
  }

  function formatPrice(value, decimals) {
    const n = Number(value) || 0;
    const d = typeof decimals === 'number' ? decimals : 3;
    return n.toFixed(d);
  }

  /** 経過分数を「X時間Y分」または「Y分」に */
  function formatDuration(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m < 60) return m + '分';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (rest === 0) return h + '時間';
    return h + '時間' + rest + '分';
  }

  /** 「◯時間前」「◯分前」「たった今」 */
  function formatRelativeTime(isoOrMs) {
    const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
    if (isNaN(t)) return '';
    const diff = Math.max(0, Date.now() - t);
    const sec = Math.floor(diff / 1000);
    if (sec < 30) return 'たった今';
    if (sec < 60) return sec + '秒前';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + '分前';
    const h = Math.floor(min / 60);
    if (h < 24) return h + '時間前';
    const day = Math.floor(h / 24);
    return day + '日前';
  }

  /** HH:MM 形式(ローカル時刻) */
  function formatClock(isoOrMs) {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
    if (isNaN(d.getTime())) return '--:--';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /** YYYY-MM-DD HH:MM(ローカル) */
  function formatDateTime(isoOrMs) {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
    if (isNaN(d.getTime())) return '';
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* --------------------------------------------------------------------------
   * 9. 通貨ペア / シグナル関連のビュー用ヘルパー
   * -------------------------------------------------------------------------- */
  function formatPair(pair) {
    if (pair === 'USDJPY') return 'USD/JPY';
    if (pair === 'BTCUSD') return 'BTC/USD';
    return pair;
  }

  function directionLabel(direction) {
    return direction === 'long' ? 'LONG' : 'SHORT';
  }

  function directionIcon(direction) {
    return direction === 'long' ? '📈' : '📉';
  }

  function rarityLabel(rarity) {
    switch (rarity) {
      case 'legendary': return 'LEGENDARY';
      case 'epic':      return 'EPIC';
      case 'rare':      return 'RARE';
      case 'good':      return 'GOOD';
      default:          return 'NORMAL';
    }
  }

  /* --------------------------------------------------------------------------
   * 10. デバッグ
   * -------------------------------------------------------------------------- */
  function forceEmit(event) { emit(event || { type: 'manual_refresh' }); }

  function debug() {
    const snap = snapshot();
    console.table({
      elapsed: snap.elapsedMinutes + 'min',
      day: snap.currentDay,
      progress: (snap.overallProgress * 100).toFixed(1) + '%',
      testMode: snap.testMode,
      capital: snap.account.currentCapital,
      next: snap.next ? ('sig#' + snap.next.signal.id + ' in ' + snap.next.minutesUntil + 'min') : 'none',
      unviewed: snap.unviewedIds.length
    });
    return snap;
  }

  /* --------------------------------------------------------------------------
   * 11. 公開 API
   * -------------------------------------------------------------------------- */
  const GameState = {
    // 定数
    DAY_LENGTH_MIN_NORMAL: DAY_LENGTH_MIN_NORMAL,
    DAY_LENGTH_MIN_TEST:   DAY_LENGTH_MIN_TEST,
    TOTAL_DAYS:            TOTAL_DAYS,
    PHASE1_MAX_DAY:        PHASE1_MAX_DAY,

    // 購読
    subscribe: subscribe,
    emit:      emit,
    forceEmit: forceEmit,

    // モード / 時間 / Day
    isTestMode:          isTestMode,
    dayLengthMinutes:    dayLengthMinutes,
    getElapsedMinutes:   getElapsedMinutes,
    getCurrentDay:       getCurrentDay,
    getDisplayDay:       getDisplayDay,
    getDayProgress:      getDayProgress,
    getOverallProgress:  getOverallProgress,

    // シグナル時刻
    getEffectiveDeliveryMinute: getEffectiveDeliveryMinute,
    getDueSignals:              getDueSignals,
    getNextUpcomingSignal:      getNextUpcomingSignal,

    // スナップショット
    snapshot: snapshot,

    // 状態遷移
    markDelivered: markDelivered,
    markViewed:    markViewed,
    markEntered:   markEntered,
    markSkipped:   markSkipped,
    markCompleted: markCompleted,

    // 資金/トレード
    adjustAccount: adjustAccount,
    recordTrade:   recordTrade,

    // フォーマッタ
    formatCapital:         formatCapital,
    formatSignedCurrency:  formatSignedCurrency,
    formatSignedPips:      formatSignedPips,
    formatPrice:           formatPrice,
    formatDuration:        formatDuration,
    formatRelativeTime:    formatRelativeTime,
    formatClock:           formatClock,
    formatDateTime:        formatDateTime,
    formatPair:            formatPair,
    directionLabel:        directionLabel,
    directionIcon:         directionIcon,
    rarityLabel:           rarityLabel,

    // デバッグ
    debug: debug
  };

  global.GameState = GameState;

})(typeof window !== 'undefined' ? window : this);
