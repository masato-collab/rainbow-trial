/* ==========================================================================
 * Rainbow Trial — js/signals.js
 * シグナル配信制御(ハイブリッド配信ロジック)
 *
 * 役割:
 *   1. scenarios.js の配信予定時刻と現在の経過時間を突き合わせ、
 *      各シグナルの状態を遷移させる
 *   2. 「起動時キャッチアップ」と「通常ティック」の 2 モードを区別し、
 *      レベル1(画面内)/ レベル2(タブタイトル)/ レベル4(まとめ)を
 *      適切に発動させる
 *   3. ホーム画面のまとめ表示用データ(Level 4)を供給
 *   4. タブ復帰時の再処理
 *
 * 状態遷移ルール:
 *   scheduled
 *     ├─ 起動時キャッチアップ     → delivered_pending (未確認)
 *     ├─ ティック中(可視)        → delivered_realtime + Level 1 バー
 *     └─ ティック中(非可視タブ)  → delivered_realtime + Level 2(自動)
 *   delivered_*
 *     └─ 詳細閲覧                 → viewed
 *   viewed
 *     ├─ エントリー               → entered → completed
 *     └─ 見送り                   → skipped
 *
 * 公開グローバル: window.Signals
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. 設定
   * -------------------------------------------------------------------------- */
  const TICK_INTERVAL_MS = 5000;   // 本番:5秒ごと
  const TEST_TICK_MS     = 2000;   // テストモード時:2秒ごと(1分=30倍速相当)

  /* --------------------------------------------------------------------------
   * 2. 状態
   * -------------------------------------------------------------------------- */
  let tickTimer        = null;
  let deliveryCallback = null;     // 新規配信時に app.js 側で拾う用
  let inited           = false;

  /* --------------------------------------------------------------------------
   * 3. 依存ヘルパ(ロード順序の都合で関数経由でアクセス)
   * -------------------------------------------------------------------------- */
  function G()  { return global.GameState; }
  function S()  { return global.TrialStore; }
  function N()  { return global.Notifications; }
  function SC() { return global.ScenarioUtil; }

  /* --------------------------------------------------------------------------
   * 4. シグナル records を「scheduled」でプリフィル
   *    scenarios 全件に対して storage 側に最低限のレコードを持たせる
   * -------------------------------------------------------------------------- */
  function ensureSignalRecords() {
    const all = SC().getAll();
    for (let i = 0; i < all.length; i++) {
      const sig = all[i];
      const rec = S().getSignalStatus(sig.id);
      if (!rec) {
        S().updateSignal(sig.id, {
          status: 'scheduled',
          scheduledRelativeMinute: G().getEffectiveDeliveryMinute(sig)
        });
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 5. 配信処理本体
   *    mode: 'startup' = 起動時キャッチアップ(未通知分は delivered_pending)
   *          'tick'    = アクティブ中(新規分は delivered_realtime + Level1)
   * -------------------------------------------------------------------------- */
  function processScheduledSignals(mode) {
    if (!SC() || !G() || !S()) return { realtime: [], pending: [] };

    const elapsed = G().getElapsedMinutes();
    const all     = SC().getAll();
    const realtime = [];
    const pending  = [];

    for (let i = 0; i < all.length; i++) {
      const sig = all[i];
      const eff = G().getEffectiveDeliveryMinute(sig);
      if (eff > elapsed) continue;

      const rec = S().getSignalStatus(sig.id);
      const status = rec && rec.status ? rec.status : 'scheduled';
      if (status !== 'scheduled') continue;

      if (mode === 'startup') {
        G().markDelivered(sig.id, 'pending');
        pending.push(sig);
      } else {
        G().markDelivered(sig.id, 'realtime');
        realtime.push(sig);
        if (N()) {
          N().showInAppNotification(sig);
          // Level 3: ブラウザ通知(許可+設定+レアリティ判定後)
          if (N().pushBrowserNotification) {
            N().pushBrowserNotification(sig);
          }
        }
      }
    }

    // 未読カウントとタブ状態を同期
    syncUnreadCount();
    S().updateLastActive();

    // 呼び出し側への通知
    if (deliveryCallback && (realtime.length || pending.length)) {
      try {
        deliveryCallback({ realtime: realtime, pending: pending, mode: mode });
      } catch (e) {
        console.error('[Signals] delivery callback error:', e);
      }
    }

    return { realtime: realtime, pending: pending };
  }

  /* --------------------------------------------------------------------------
   * 6. 起動時キャッチアップ後のバー復元
   *    「前セッションで realtime 配信を受けたが未閲覧」のカードを復元
   *    (ページリロード時の継続性を保証)
   * -------------------------------------------------------------------------- */
  function restoreUnviewedRealtimeBar() {
    if (!N() || !S()) return;
    const state = S().getState();
    state.signals.forEach(function (rec) {
      if (rec.status === 'delivered_realtime') {
        const sig = SC().getById(rec.signalId);
        if (sig) N().showInAppNotification(sig);
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 7. 未読カウントの同期(Level 2 制御)
   * -------------------------------------------------------------------------- */
  function syncUnreadCount() {
    if (!N() || !S()) return;
    N().setUnreadCount(S().getUnviewedSignalIds().length);
  }

  /* --------------------------------------------------------------------------
   * 8. ティック制御
   * -------------------------------------------------------------------------- */
  function startTicking() {
    if (tickTimer) return;
    const interval = (G() && G().isTestMode()) ? TEST_TICK_MS : TICK_INTERVAL_MS;
    // 即座に1回
    processScheduledSignals('tick');
    tickTimer = setInterval(function () {
      processScheduledSignals('tick');
    }, interval);
  }

  function stopTicking() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  /** テストモード/通常モードの切替で tick 間隔を更新 */
  function restartTicking() {
    stopTicking();
    startTicking();
  }

  /* --------------------------------------------------------------------------
   * 9. タブ復帰時の再処理
   * -------------------------------------------------------------------------- */
  function handleVisibilityReturn() {
    processScheduledSignals('tick');
    syncUnreadCount();
  }

  /* --------------------------------------------------------------------------
   * 10. Level 4 データ供給(ホームのまとめ表示用)
   * -------------------------------------------------------------------------- */
  /**
   * 未確認の delivered_pending シグナル一覧
   * (起動時キャッチアップで溜まった「まとめ」用)
   */
  function getPendingDigest() {
    const state = S().getState();
    const arr = [];
    state.signals.forEach(function (rec) {
      if (rec.status !== 'delivered_pending') return;
      const sig = SC().getById(rec.signalId);
      if (!sig) return;
      arr.push({ signal: sig, record: rec });
    });
    // 配信時刻順(昇順)
    arr.sort(function (a, b) {
      return G().getEffectiveDeliveryMinute(a.signal) - G().getEffectiveDeliveryMinute(b.signal);
    });
    return arr;
  }

  /** Level 4 の件数(ホーム見出し用) */
  function getPendingCount() {
    return getPendingDigest().length;
  }

  /**
   * 未確認(= delivered_pending + delivered_realtime)の全シグナル一覧
   * ホーム画面下部の「未確認シグナル」セクションに使用
   * 配信時刻の新しい順
   */
  function getAllUnviewed() {
    const state = S().getState();
    const arr = [];
    state.signals.forEach(function (rec) {
      if (rec.status !== 'delivered_pending' && rec.status !== 'delivered_realtime') return;
      const sig = SC().getById(rec.signalId);
      if (!sig) return;
      arr.push({ signal: sig, record: rec });
    });
    // deliveredAt があれば新しい順、なければ effectiveMinute で代替(降順)
    arr.sort(function (a, b) {
      const ta = a.record.deliveredAt ? new Date(a.record.deliveredAt).getTime() : 0;
      const tb = b.record.deliveredAt ? new Date(b.record.deliveredAt).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return G().getEffectiveDeliveryMinute(b.signal) - G().getEffectiveDeliveryMinute(a.signal);
    });
    return arr;
  }

  /* --------------------------------------------------------------------------
   * 11. シグナル一覧用(タブ2)
   *    全 scenario を現在の state と組み合わせて返す
   *    配信時刻が未来のものは除外(タブ2は「受信した順」を見せるため)
   * -------------------------------------------------------------------------- */
  function getDeliveredSignals() {
    const elapsed = G().getElapsedMinutes();
    const state = S().getState();
    const statusMap = new Map();
    state.signals.forEach(function (r) { statusMap.set(r.signalId, r); });

    const list = [];
    SC().getAll().forEach(function (sig) {
      const eff = G().getEffectiveDeliveryMinute(sig);
      if (eff > elapsed) return;
      const rec = statusMap.get(sig.id) || { status: 'scheduled', signalId: sig.id };
      list.push({ signal: sig, record: rec, effectiveMinute: eff });
    });
    // 新しい順(受信時刻降順)
    list.sort(function (a, b) { return b.effectiveMinute - a.effectiveMinute; });
    return list;
  }

  /* --------------------------------------------------------------------------
   * 12. 状態遷移のラッパ(UI から呼ばれる)
   * -------------------------------------------------------------------------- */
  function markViewed(signalId) {
    G().markViewed(signalId);
    if (N()) {
      N().hideInAppNotification(signalId);
      syncUnreadCount();
    }
  }

  function markDismissedBar(signalId) {
    // 状態は delivered_* のまま、Level 1 バー表示だけ消す
    if (N()) {
      N().hideInAppNotification(signalId);
      syncUnreadCount();
    }
  }

  function markEntered(signalId) {
    G().markEntered(signalId);
    if (N()) {
      N().hideInAppNotification(signalId);
      syncUnreadCount();
    }
  }

  function markSkipped(signalId) {
    G().markSkipped(signalId);
    if (N()) {
      N().hideInAppNotification(signalId);
      syncUnreadCount();
    }
  }

  function markCompleted(signalId, result) {
    G().markCompleted(signalId, result);
    syncUnreadCount();
  }

  /* --------------------------------------------------------------------------
   * 13. 初期化 / コールバック登録
   * -------------------------------------------------------------------------- */
  function init(options) {
    if (inited) return;
    options = options || {};

    ensureSignalRecords();

    // 起動時キャッチアップ: 未通知分は delivered_pending へ
    const startup = processScheduledSignals('startup');

    // 過去の delivered_realtime 未閲覧カードをバーに復元
    restoreUnviewedRealtimeBar();

    // 未読カウントを Level 2 に反映(非可視なら favicon/title 変更)
    syncUnreadCount();

    // タブ復帰時のフック
    if (N()) {
      N().onVisibilityChange(function (isVisible) {
        if (isVisible) handleVisibilityReturn();
      });
    }

    // ティック開始
    if (options.autoStart !== false) {
      startTicking();
    }

    inited = true;
    return startup; // { realtime: [], pending: [...caught up] }
  }

  function setDeliveryCallback(cb) {
    deliveryCallback = typeof cb === 'function' ? cb : null;
  }

  /* --------------------------------------------------------------------------
   * 14. デバッグ
   * -------------------------------------------------------------------------- */
  function debugState() {
    if (!SC() || !S() || !G()) return null;
    const elapsed = G().getElapsedMinutes();
    const state = S().getState();
    const statusMap = new Map();
    state.signals.forEach(function (r) { statusMap.set(r.signalId, r.status); });

    const rows = SC().getAll().map(function (sig) {
      return {
        id: sig.id,
        day: sig.day,
        pair: sig.pair,
        effMin: G().getEffectiveDeliveryMinute(sig),
        status: statusMap.get(sig.id) || '(none)',
        due: G().getEffectiveDeliveryMinute(sig) <= elapsed
      };
    });
    console.table(rows);
    return { elapsed: elapsed, rows: rows };
  }

  /* --------------------------------------------------------------------------
   * 15. 公開 API
   * -------------------------------------------------------------------------- */
  const Signals = {
    // ライフサイクル
    init:           init,
    startTicking:   startTicking,
    stopTicking:    stopTicking,
    restartTicking: restartTicking,

    // 処理
    processScheduledSignals: processScheduledSignals,
    handleVisibilityReturn:  handleVisibilityReturn,
    ensureSignalRecords:     ensureSignalRecords,
    restoreUnviewedRealtimeBar: restoreUnviewedRealtimeBar,
    syncUnreadCount:         syncUnreadCount,

    // 状態遷移
    markViewed:       markViewed,
    markDismissedBar: markDismissedBar,
    markEntered:      markEntered,
    markSkipped:      markSkipped,
    markCompleted:    markCompleted,

    // データ供給
    getPendingDigest:     getPendingDigest,
    getPendingCount:      getPendingCount,
    getAllUnviewed:       getAllUnviewed,
    getDeliveredSignals:  getDeliveredSignals,

    // コールバック
    setDeliveryCallback: setDeliveryCallback,

    // デバッグ
    debugState: debugState
  };

  global.Signals = Signals;

})(typeof window !== 'undefined' ? window : this);
