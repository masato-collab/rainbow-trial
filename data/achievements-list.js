/* ==========================================================================
 * Rainbow Trial — data/achievements-list.js
 * アチーブメント(実績バッジ)定義 — 全25個
 *
 * condition(state) は storage.js の getState() が返す state オブジェクトを受け取り、
 * boolean を返す。進捗型は progress(state) が現在値を返す。
 *
 * 公開グローバル: window.ACHIEVEMENTS (配列)
 * ========================================================================== */

(function (global) {
  'use strict';

  var ACHIEVEMENTS = [

    /* -----------------------------------------------------------------------
     * カテゴリ: beginner — トレード初心者
     * ----------------------------------------------------------------------- */
    {
      id: 'first_signal',
      icon: '🥉',
      title: 'はじめの一歩',
      description: '初めてシグナルを受信する',
      category: 'beginner',
      xpReward: 20,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalSignalsReceived >= 1);
      }
    },
    {
      id: 'first_entry',
      icon: '⚡',
      title: '初エントリー',
      description: '初めてエントリーを実行する',
      category: 'beginner',
      xpReward: 20,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalEntries >= 1);
      }
    },
    {
      id: 'first_win',
      icon: '🎯',
      title: '初勝利',
      description: '初めてTPに到達する',
      category: 'beginner',
      xpReward: 30,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalTPHits >= 1);
      }
    },
    {
      id: 'first_loss',
      icon: '💧',
      title: '初敗北',
      description: '初めてSLにヒットする(凹まないで)',
      category: 'beginner',
      xpReward: 15,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalSLHits >= 1);
      }
    },
    {
      id: 'first_skip',
      icon: '🤝',
      title: '初見送り',
      description: '初めてシグナルを見送る',
      category: 'beginner',
      xpReward: 15,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalSkips >= 1);
      }
    },

    /* -----------------------------------------------------------------------
     * カテゴリ: streak — 連勝・連続
     * ----------------------------------------------------------------------- */
    {
      id: 'streak_3',
      icon: '🔥',
      title: '3連勝の達人',
      description: '3連勝を達成する',
      category: 'streak',
      xpReward: 50,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.maxStreak >= 3);
      }
    },
    {
      id: 'streak_5',
      icon: '🔥🔥',
      title: '5連勝の覇者',
      description: '5連勝を達成する',
      category: 'streak',
      xpReward: 80,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.maxStreak >= 5);
      }
    },
    {
      id: 'streak_7',
      icon: '🔥🔥🔥',
      title: '7連勝の伝説',
      description: '7連勝を達成する',
      category: 'streak',
      xpReward: 150,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.maxStreak >= 7);
      }
    },
    {
      id: 'daily_complete',
      icon: '📅',
      title: 'デイリーコンプ',
      description: '1日のミッションをすべて達成する',
      category: 'streak',
      xpReward: 60,
      secret: false,
      condition: function (state) {
        if (!state.missions) return false;
        var days = Object.keys(state.missions);
        for (var i = 0; i < days.length; i++) {
          var day = state.missions[days[i]];
          var mIds = Object.keys(day);
          if (mIds.length > 0 && mIds.every(function (k) { return day[k]; })) return true;
        }
        return false;
      }
    },
    {
      id: 'seven_days',
      icon: '📅📅',
      title: '7日完走',
      description: '7日間すべてアプリを開く',
      category: 'streak',
      xpReward: 200,
      secret: false,
      condition: function (state) {
        return (state.user && state.user.currentDay >= 7 && state.gameStats && state.gameStats.totalSignalsReceived >= 1);
      }
    },

    /* -----------------------------------------------------------------------
     * カテゴリ: skill — 判定スキル
     * ----------------------------------------------------------------------- */
    {
      id: 'ng_guard',
      icon: '👁️',
      title: 'ルール守護者',
      description: 'レインボーロードを見て条件NGを5回連続見送る',
      category: 'skill',
      xpReward: 70,
      secret: false,
      progressMax: 5,
      progress: function (state) {
        return (state.gameStats && state.gameStats.consecutiveNGSkips) || 0;
      },
      condition: function (state) {
        return (state.gameStats && (state.gameStats.consecutiveNGSkips || 0) >= 5);
      }
    },
    {
      id: 'ok_master',
      icon: '🎯',
      title: '完璧な判定',
      description: 'レインボーロードの条件OKシグナルに10回連続正しくエントリーする',
      category: 'skill',
      xpReward: 100,
      secret: false,
      progressMax: 10,
      progress: function (state) {
        return (state.gameStats && state.gameStats.consecutiveOKEntries) || 0;
      },
      condition: function (state) {
        return (state.gameStats && (state.gameStats.consecutiveOKEntries || 0) >= 10);
      }
    },
    {
      id: 'wise_eye',
      icon: '🧠',
      title: '賢者の眼',
      description: '判定スコア80点以上を達成する',
      category: 'skill',
      xpReward: 80,
      secret: false,
      condition: function (state) {
        return (state.gameStats && state.gameStats.judgmentScore >= 80);
      }
    },
    {
      id: 'master_judge',
      icon: '🏆',
      title: 'マスター判定',
      description: '判定スコア95点以上を達成する',
      category: 'skill',
      xpReward: 150,
      secret: true,
      condition: function (state) {
        return (state.gameStats && state.gameStats.judgmentScore >= 95);
      }
    },

    /* -----------------------------------------------------------------------
     * カテゴリ: rarity — レアリティハンター
     * ----------------------------------------------------------------------- */
    {
      id: 'rare_hunter',
      icon: '🟣',
      title: 'RAREハンター',
      description: 'RAREシグナルでTPに到達する',
      category: 'rarity',
      xpReward: 60,
      secret: false,
      condition: function (state) {
        if (!state.trades) return false;
        return state.trades.some(function (t) {
          return t.rarity === 'rare' && t.result === 'tp_hit';
        });
      }
    },
    {
      id: 'epic_hunter',
      icon: '🟠',
      title: 'EPICハンター',
      description: 'EPICシグナルでTPに到達する',
      category: 'rarity',
      xpReward: 100,
      secret: false,
      condition: function (state) {
        if (!state.trades) return false;
        return state.trades.some(function (t) {
          return t.rarity === 'epic' && t.result === 'tp_hit';
        });
      }
    },
    {
      id: 'legendary_hunter',
      icon: '🌈',
      title: 'LEGENDARYハンター',
      description: 'LEGENDARYシグナルでTPに到達する',
      category: 'rarity',
      xpReward: 200,
      secret: true,
      condition: function (state) {
        if (!state.trades) return false;
        return state.trades.some(function (t) {
          return t.rarity === 'legendary' && t.result === 'tp_hit';
        });
      }
    },
    {
      id: 'rarity_complete',
      icon: '✨',
      title: 'レアリティコンプ',
      description: '全レアリティでTPに到達する',
      category: 'rarity',
      xpReward: 250,
      secret: true,
      condition: function (state) {
        if (!state.trades) return false;
        var rarities = ['normal', 'good', 'rare', 'epic', 'legendary'];
        return rarities.every(function (r) {
          return state.trades.some(function (t) {
            return t.rarity === r && t.result === 'tp_hit';
          });
        });
      }
    },

    /* -----------------------------------------------------------------------
     * カテゴリ: volume — トレード量
     * ----------------------------------------------------------------------- */
    {
      id: 'trader_10',
      icon: '📊',
      title: '10戦士',
      description: '10回エントリーする',
      category: 'volume',
      xpReward: 40,
      secret: false,
      progressMax: 10,
      progress: function (state) {
        return (state.gameStats && state.gameStats.totalEntries) || 0;
      },
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalEntries >= 10);
      }
    },
    {
      id: 'trader_30',
      icon: '📊',
      title: '30戦士',
      description: '30回エントリーする',
      category: 'volume',
      xpReward: 80,
      secret: false,
      progressMax: 30,
      progress: function (state) {
        return (state.gameStats && state.gameStats.totalEntries) || 0;
      },
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalEntries >= 30);
      }
    },
    {
      id: 'trader_50',
      icon: '📊',
      title: '50戦士',
      description: '50回エントリーする',
      category: 'volume',
      xpReward: 120,
      secret: false,
      progressMax: 50,
      progress: function (state) {
        return (state.gameStats && state.gameStats.totalEntries) || 0;
      },
      condition: function (state) {
        return (state.gameStats && state.gameStats.totalEntries >= 50);
      }
    },

    /* -----------------------------------------------------------------------
     * カテゴリ: pair — 通貨ペア
     * ----------------------------------------------------------------------- */
    {
      id: 'usdjpy_master',
      icon: '💴',
      title: '円トレーダー',
      description: 'USDJPYで10勝する',
      category: 'pair',
      xpReward: 100,
      secret: false,
      progressMax: 10,
      progress: function (state) {
        if (!state.trades) return 0;
        return state.trades.filter(function (t) {
          return t.pair === 'USDJPY' && t.result === 'tp_hit';
        }).length;
      },
      condition: function (state) {
        if (!state.trades) return false;
        return state.trades.filter(function (t) {
          return t.pair === 'USDJPY' && t.result === 'tp_hit';
        }).length >= 10;
      }
    },
    {
      id: 'btcusd_master',
      icon: '₿',
      title: 'ビットコイントレーダー',
      description: 'BTCUSDで10勝する',
      category: 'pair',
      xpReward: 100,
      secret: false,
      progressMax: 10,
      progress: function (state) {
        if (!state.trades) return 0;
        return state.trades.filter(function (t) {
          return t.pair === 'BTCUSD' && t.result === 'tp_hit';
        }).length;
      },
      condition: function (state) {
        if (!state.trades) return false;
        return state.trades.filter(function (t) {
          return t.pair === 'BTCUSD' && t.result === 'tp_hit';
        }).length >= 10;
      }
    },

    /* -----------------------------------------------------------------------
     * カテゴリ: overall — 総合
     * ----------------------------------------------------------------------- */
    {
      id: 'double_capital',
      icon: '💰',
      title: '資金倍増',
      description: '仮想資金 ¥600,000 を達成する',
      category: 'overall',
      xpReward: 300,
      secret: false,
      condition: function (state) {
        return (state.account && state.account.currentCapital >= 600000);
      }
    },
    {
      id: 'rainbow_master',
      icon: '🌈',
      title: 'Rainbow Master',
      description: '7日間体験完了 + 累計勝率70%以上',
      category: 'overall',
      xpReward: 500,
      secret: false,
      condition: function (state) {
        if (!state.user || state.user.currentDay < 7) return false;
        var stats = state.gameStats;
        if (!stats) return false;
        var total = stats.totalEntries || 0;
        var wins = stats.totalTPHits || 0;
        if (total < 1) return false;
        return (wins / total) >= 0.7;
      }
    }

  ];

  global.ACHIEVEMENTS = ACHIEVEMENTS;

})(typeof window !== 'undefined' ? window : this);
