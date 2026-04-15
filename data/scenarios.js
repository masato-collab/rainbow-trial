/* ==========================================================================
 * Rainbow Trial — data/scenarios.js
 * Day1〜Day3 の30シグナル分のシナリオデータ。
 * メタ情報(直接記述)+ チャートデータ(自動生成)で構築される。
 *
 * 公開グローバル:
 *   window.SCENARIOS         — { day1: [...], day2: [...], day3: [...] }
 *   window.ScenarioUtil      — 便利関数群
 *   window.PAIR_CONFIG       — 通貨ペア別設定
 *
 * シグナル分布(30件):
 *   - USD/JPY 15 / BTC/USD 15
 *   - 条件OK 18件(勝率約89%) / 条件NG 12件(勝率約42%)
 *   - レアリティ:
 *       Day1: normal 7 / good 2 / rare 1
 *       Day2: normal 6 / good 3 / rare 1
 *       Day3: normal 5 / good 3 / rare 1 / epic 1
 *
 * 配信時刻スケジュール(各Day共通、起動からの相対分数):
 *   1, 2.5, 4, 5.5, 7, 8.5, 10, 11.5, 13, 14.5 時間後
 *   = 60, 150, 240, 330, 420, 510, 600, 690, 780, 870 分後
 *
 * テストモード時は signals.js 側で 1 分間隔に圧縮される(データは本番値を保持)
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 0. 通貨ペア別の設定
   * -------------------------------------------------------------------------- */
  // pipSize   : 1pip(または1ポイント)に相当する価格幅
  // pipValue  : 1pipあたりの損益(JPY、当該ロット想定)
  // lotSize   : 推奨ロット(疑似表示用)
  // decimals  : 価格の小数点以下桁数
  // volatility: チャート生成時の 1 本あたりの揺らぎ基準(価格単位)
  const PAIR_CONFIG = {
    USDJPY: {
      pipSize: 0.01,
      pipValue: 300,      // 0.3 lot 想定: 0.01 × 30,000 = 300 JPY/pip
      lotSize: 0.3,
      decimals: 3,
      volatility: 0.065,
      candleMinutes: 15,  // 1本 = 15分
      labelStart: [8, 0]  // 最初のローソクを 08:00 起点として表示
    },
    BTCUSD: {
      pipSize: 1.0,       // 1 pip = $1
      pipValue: 45,       // 0.3 BTC × $1 × 150 JPY/USD ≈ 45 JPY/pip
      lotSize: 0.3,       // USDJPY と同スケール(0.3 BTC ≒ $19,500 notional)
      decimals: 1,
      volatility: 95,
      candleMinutes: 15,
      labelStart: [8, 0]
    }
  };

  /* --------------------------------------------------------------------------
   * 1. シード付き PRNG (mulberry32)
   *    各シグナルが常に同じチャートを生成するための決定論的乱数生成器
   * -------------------------------------------------------------------------- */
  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------------------------
   * 2. 時刻ラベル生成
   * -------------------------------------------------------------------------- */
  function formatTimeLabel(index, pair) {
    const conf = PAIR_CONFIG[pair];
    const [sh, sm] = conf.labelStart;
    const total = sh * 60 + sm + index * conf.candleMinutes;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /* --------------------------------------------------------------------------
   * 3. チャートデータ自動生成
   *    - 130 本を内部生成して末尾 50 本を表示(MA80 のウォームアップ用)
   *    - 条件 (ok/ng) と方向 (long/short) に応じて MA 配置を整える
   * -------------------------------------------------------------------------- */
  function generateChart(meta) {
    const conf = PAIR_CONFIG[meta.pair];
    const rng = mulberry32(meta.id * 9973 + 1);
    const total = 130;
    const show = 50;
    const isOk = meta.chartCondition === 'ok';
    const isLong = meta.direction === 'long';

    // トレンド方向(OK時は方向に強い傾斜、NG時は弱い/ランダム)
    const trendSign = isOk ? (isLong ? 1 : -1) : (rng() - 0.5 > 0 ? 1 : -1);
    const trendStrength = isOk ? conf.volatility * 0.11 : conf.volatility * 0.035;

    // 末尾を meta.entry に合わせるため、起点をバックキャストで算出
    const totalDrift = total * trendSign * trendStrength;
    let price = meta.entry - totalDrift;

    const closes = new Array(total);
    const opens = new Array(total);
    const highs = new Array(total);
    const lows = new Array(total);

    for (let i = 0; i < total; i++) {
      const drift = trendSign * trendStrength;
      const noise = (rng() - 0.5) * conf.volatility * 1.9;
      const o = price;
      let c = o + drift + noise;

      // 終端に近いローソクは entry に収束するよう補正
      if (i >= total - 6) {
        const pull = (total - 1 - i) / 6;     // 0..1
        c = c * pull + meta.entry * (1 - pull);
      }
      const h = Math.max(o, c) + rng() * conf.volatility * 0.65;
      const l = Math.min(o, c) - rng() * conf.volatility * 0.65;

      opens[i] = o;
      closes[i] = c;
      highs[i] = h;
      lows[i] = l;
      price = c;
    }

    // 最終バーの close を entry ピッタリに調整
    const lastIdx = total - 1;
    closes[lastIdx] = meta.entry;
    highs[lastIdx] = Math.max(highs[lastIdx], meta.entry);
    lows[lastIdx] = Math.min(lows[lastIdx], meta.entry);

    // 移動平均の計算 (単純移動平均)
    const ma20 = new Array(total);
    const ma80 = new Array(total);
    for (let i = 0; i < total; i++) {
      ma20[i] = sma(closes, i, 20);
      ma80[i] = sma(closes, i, 80);
    }

    // 末尾の MA 位置を「条件を満たす/満たさない」よう最終調整
    const gap = conf.volatility * (meta.pair === 'USDJPY' ? 3.5 : 2.8);
    const lastClose = closes[lastIdx];
    if (isOk) {
      if (isLong) {
        // ロング条件: close > MA20 > MA80(すべて close 以下)
        ma20[lastIdx] = Math.min(ma20[lastIdx], lastClose - gap);
        ma80[lastIdx] = Math.min(ma80[lastIdx], ma20[lastIdx] - gap);
      } else {
        // ショート条件: close < MA20 < MA80(すべて close 以上)
        ma20[lastIdx] = Math.max(ma20[lastIdx], lastClose + gap);
        ma80[lastIdx] = Math.max(ma80[lastIdx], ma20[lastIdx] + gap);
      }
    } else {
      // NG: 3パターンのうちシグナル ID に応じて選択
      const scenario = meta.id % 3;
      if (scenario === 0) {
        // MA20 が close の上、MA80 が close の下(挟まれる)
        ma20[lastIdx] = lastClose + gap;
        ma80[lastIdx] = lastClose - gap;
      } else if (scenario === 1) {
        // 両MAとも方向と逆側に位置
        if (isLong) {
          ma20[lastIdx] = lastClose + gap;
          ma80[lastIdx] = lastClose + gap * 2;
        } else {
          ma20[lastIdx] = lastClose - gap;
          ma80[lastIdx] = lastClose - gap * 2;
        }
      } else {
        // MA20 / MA80 の順序が逆(MA80 が上、MA20 が下 など)
        if (isLong) {
          ma80[lastIdx] = lastClose - gap * 0.4;
          ma20[lastIdx] = lastClose - gap * 2.2;
        } else {
          ma80[lastIdx] = lastClose + gap * 0.4;
          ma20[lastIdx] = lastClose + gap * 2.2;
        }
      }
    }

    // 手前数本を滑らかにブレンド
    for (let k = 1; k <= 6; k++) {
      const idx = lastIdx - k;
      if (idx < 0) break;
      const t = k / 7;
      ma20[idx] = ma20[idx] * t + ma20[lastIdx] * (1 - t);
      ma80[idx] = ma80[idx] * t + ma80[lastIdx] * (1 - t);
    }

    // 表示範囲(末尾 50 本)を切り出し + 桁丸め
    const d = conf.decimals;
    const out = {
      candles: [],
      ma20: [],
      ma80: []
    };
    const startShow = total - show;
    for (let i = startShow; i < total; i++) {
      const idx = i - startShow;
      out.candles.push({
        time: formatTimeLabel(idx, meta.pair),
        o: round(opens[i], d),
        h: round(highs[i], d),
        l: round(lows[i], d),
        c: round(closes[i], d)
      });
      out.ma20.push(round(ma20[i], d));
      out.ma80.push(round(ma80[i], d));
    }
    return out;
  }

  function sma(arr, upto, period) {
    const start = Math.max(0, upto - period + 1);
    let sum = 0;
    let count = 0;
    for (let k = start; k <= upto; k++) {
      sum += arr[k];
      count++;
    }
    return sum / count;
  }

  function round(v, d) {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  /* --------------------------------------------------------------------------
   * 4. シグナルメタデータ(70件、scripts/update-prices.js が自動再生成)
   *    relativeTime は起動からの経過分(Day1 0:00 起点)
   *    手編集せず、相対値は data/scenario-templates.js を編集してから
   *    `npm run update-prices` を実行してください。
   * -------------------------------------------------------------------------- */
  /* BEGIN:SIGNAL_META (auto-generated) */
  const SIGNAL_META = [
    /* ---- Day 1 ---- */
    { id:  1, day: 1, number: 1247, relativeTime:   60,
      pair: 'USDJPY', direction: 'long', entry: 158.116, tp: 158.356, sl: 157.966,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id:  2, day: 1, number: 1248, relativeTime:  150,
      pair: 'BTCUSD', direction: 'short', entry: 73767.0, tp: 73527.0, sl: 73917.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6000 },
    { id:  3, day: 1, number: 1249, relativeTime:  240,
      pair: 'USDJPY', direction: 'short', entry: 161.306, tp: 161.066, sl: 161.456,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id:  4, day: 1, number: 1250, relativeTime:  330,
      pair: 'BTCUSD', direction: 'long', entry: 72177.0, tp: 72497.0, sl: 71977.0,
      rarity: 'normal', chartCondition: 'ng', result: 'tp_hit', duration: 7800 },
    { id:  5, day: 1, number: 1251, relativeTime:  420,
      pair: 'USDJPY', direction: 'long', entry: 159.716, tp: 159.956, sl: 159.566,
      rarity: 'normal', chartCondition: 'ok', result: 'sl_hit', duration: 6600 },
    { id:  6, day: 1, number: 1252, relativeTime:  510,
      pair: 'BTCUSD', direction: 'long', entry: 74267.0, tp: 74507.0, sl: 74117.0,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id:  7, day: 1, number: 1253, relativeTime:  600,
      pair: 'USDJPY', direction: 'short', entry: 160.096, tp: 159.836, sl: 160.256,
      rarity: 'normal', chartCondition: 'ng', result: 'tp_hit', duration: 6000 },
    { id:  8, day: 1, number: 1254, relativeTime:  690,
      pair: 'BTCUSD', direction: 'short', entry: 71757.0, tp: 71517.0, sl: 71907.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id:  9, day: 1, number: 1255, relativeTime:  780,
      pair: 'USDJPY', direction: 'long', entry: 157.666, tp: 157.926, sl: 157.506,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 10, day: 1, number: 1256, relativeTime:  870,
      pair: 'BTCUSD', direction: 'long', entry: 73087.0, tp: 73375.0, sl: 72907.0,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },

    /* ---- Day 2 ---- */
    { id: 11, day: 2, number: 1257, relativeTime: 1500,
      pair: 'USDJPY', direction: 'long', entry: 160.226, tp: 160.496, sl: 160.056,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 12, day: 2, number: 1258, relativeTime: 1590,
      pair: 'BTCUSD', direction: 'long', entry: 75157.0, tp: 75413.0, sl: 74997.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 13, day: 2, number: 1259, relativeTime: 1680,
      pair: 'USDJPY', direction: 'short', entry: 159.796, tp: 159.556, sl: 159.946,
      rarity: 'good', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },
    { id: 14, day: 2, number: 1260, relativeTime: 1770,
      pair: 'BTCUSD', direction: 'short', entry: 74407.0, tp: 74087.0, sl: 74607.0,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 8400 },
    { id: 15, day: 2, number: 1261, relativeTime: 1860,
      pair: 'USDJPY', direction: 'long', entry: 158.566, tp: 158.826, sl: 158.406,
      rarity: 'normal', chartCondition: 'ng', result: 'tp_hit', duration: 6600 },
    { id: 16, day: 2, number: 1262, relativeTime: 1950,
      pair: 'BTCUSD', direction: 'short', entry: 73857.0, tp: 73601.0, sl: 74017.0,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },
    { id: 17, day: 2, number: 1263, relativeTime: 2040,
      pair: 'USDJPY', direction: 'short', entry: 162.006, tp: 161.736, sl: 162.176,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 18, day: 2, number: 1264, relativeTime: 2130,
      pair: 'BTCUSD', direction: 'long', entry: 72667.0, tp: 73019.0, sl: 72447.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 19, day: 2, number: 1265, relativeTime: 2220,
      pair: 'USDJPY', direction: 'long', entry: 157.306, tp: 157.566, sl: 157.146,
      rarity: 'rare', chartCondition: 'ng', result: 'tp_hit', duration: 6000 },
    { id: 20, day: 2, number: 1266, relativeTime: 2310,
      pair: 'BTCUSD', direction: 'long', entry: 75857.0, tp: 76145.0, sl: 75677.0,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },

    /* ---- Day 3 ---- */
    { id: 21, day: 3, number: 1267, relativeTime: 2940,
      pair: 'USDJPY', direction: 'short', entry: 161.526, tp: 161.266, sl: 161.686,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 22, day: 3, number: 1268, relativeTime: 3030,
      pair: 'BTCUSD', direction: 'long', entry: 71167.0, tp: 71487.0, sl: 70967.0,
      rarity: 'good', chartCondition: 'ng', result: 'sl_hit', duration: 6600 },
    { id: 23, day: 3, number: 1269, relativeTime: 3120,
      pair: 'USDJPY', direction: 'short', entry: 160.386, tp: 160.066, sl: 160.586,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },
    { id: 24, day: 3, number: 1270, relativeTime: 3210,
      pair: 'BTCUSD', direction: 'short', entry: 76057.0, tp: 75785.0, sl: 76227.0,
      rarity: 'good', chartCondition: 'ok', result: 'sl_hit', duration: 7800 },
    { id: 25, day: 3, number: 1271, relativeTime: 3300,
      pair: 'USDJPY', direction: 'long', entry: 158.806, tp: 159.066, sl: 158.646,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6600 },
    { id: 26, day: 3, number: 1272, relativeTime: 3390,
      pair: 'BTCUSD', direction: 'long', entry: 74567.0, tp: 74999.0, sl: 74297.0,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 27, day: 3, number: 1273, relativeTime: 3480,
      pair: 'USDJPY', direction: 'long', entry: 160.916, tp: 161.216, sl: 160.726,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 28, day: 3, number: 1274, relativeTime: 3570,
      pair: 'BTCUSD', direction: 'short', entry: 73267.0, tp: 72995.0, sl: 73437.0,
      rarity: 'normal', chartCondition: 'ng', result: 'tp_hit', duration: 6000 },
    { id: 29, day: 3, number: 1275, relativeTime: 3660,
      pair: 'USDJPY', direction: 'short', entry: 163.126, tp: 162.826, sl: 163.316,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 30, day: 3, number: 1276, relativeTime: 3750,
      pair: 'BTCUSD', direction: 'long', entry: 72757.0, tp: 73541.0, sl: 72267.0,
      rarity: 'epic', chartCondition: 'ok', result: 'tp_hit', duration: 9000 },

    /* ---- Day 4 ---- */
    { id: 31, day: 4, number: 1277, relativeTime: 4380,
      pair: 'USDJPY', direction: 'long', entry: 159.306, tp: 159.546, sl: 159.156,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 32, day: 4, number: 1278, relativeTime: 4470,
      pair: 'BTCUSD', direction: 'short', entry: 74267.0, tp: 74027.0, sl: 74417.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 33, day: 4, number: 1279, relativeTime: 4560,
      pair: 'USDJPY', direction: 'short', entry: 162.496, tp: 162.286, sl: 162.626,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 34, day: 4, number: 1280, relativeTime: 4650,
      pair: 'BTCUSD', direction: 'long', entry: 73457.0, tp: 73697.0, sl: 73307.0,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 35, day: 4, number: 1281, relativeTime: 4740,
      pair: 'USDJPY', direction: 'long', entry: 160.606, tp: 160.846, sl: 160.456,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 36, day: 4, number: 1282, relativeTime: 4830,
      pair: 'BTCUSD', direction: 'short', entry: 75687.0, tp: 75415.0, sl: 75857.0,
      rarity: 'good', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },
    { id: 37, day: 4, number: 1283, relativeTime: 4920,
      pair: 'USDJPY', direction: 'short', entry: 158.696, tp: 158.506, sl: 158.816,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 38, day: 4, number: 1284, relativeTime: 5010,
      pair: 'BTCUSD', direction: 'long', entry: 72367.0, tp: 72623.0, sl: 72207.0,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 39, day: 4, number: 1285, relativeTime: 5100,
      pair: 'USDJPY', direction: 'long', entry: 161.806, tp: 162.026, sl: 161.666,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 40, day: 4, number: 1286, relativeTime: 5190,
      pair: 'BTCUSD', direction: 'long', entry: 76167.0, tp: 76439.0, sl: 75997.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },

    /* ---- Day 5 ---- */
    { id: 41, day: 5, number: 1287, relativeTime: 5820,
      pair: 'USDJPY', direction: 'short', entry: 163.266, tp: 163.056, sl: 163.396,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 42, day: 5, number: 1288, relativeTime: 5910,
      pair: 'BTCUSD', direction: 'long', entry: 71767.0, tp: 72023.0, sl: 71607.0,
      rarity: 'good', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },
    { id: 43, day: 5, number: 1289, relativeTime: 6000,
      pair: 'USDJPY', direction: 'long', entry: 157.506, tp: 157.746, sl: 157.356,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 44, day: 5, number: 1290, relativeTime: 6090,
      pair: 'BTCUSD', direction: 'short', entry: 73767.0, tp: 73495.0, sl: 73937.0,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 45, day: 5, number: 1291, relativeTime: 6180,
      pair: 'USDJPY', direction: 'short', entry: 159.126, tp: 158.916, sl: 159.256,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 46, day: 5, number: 1292, relativeTime: 6270,
      pair: 'BTCUSD', direction: 'long', entry: 74867.0, tp: 75123.0, sl: 74707.0,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 47, day: 5, number: 1293, relativeTime: 6360,
      pair: 'USDJPY', direction: 'long', entry: 160.396, tp: 160.636, sl: 160.246,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 48, day: 5, number: 1294, relativeTime: 6450,
      pair: 'BTCUSD', direction: 'short', entry: 72157.0, tp: 71869.0, sl: 72337.0,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 49, day: 5, number: 1295, relativeTime: 6540,
      pair: 'USDJPY', direction: 'short', entry: 162.706, tp: 162.486, sl: 162.846,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 50, day: 5, number: 1296, relativeTime: 6630,
      pair: 'BTCUSD', direction: 'long', entry: 73277.0, tp: 73533.0, sl: 73117.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },

    /* ---- Day 6 ---- */
    { id: 51, day: 6, number: 1297, relativeTime: 7260,
      pair: 'USDJPY', direction: 'long', entry: 158.006, tp: 158.266, sl: 157.846,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 52, day: 6, number: 1298, relativeTime: 7350,
      pair: 'BTCUSD', direction: 'short', entry: 75457.0, tp: 75185.0, sl: 75627.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 53, day: 6, number: 1299, relativeTime: 7440,
      pair: 'USDJPY', direction: 'short', entry: 161.106, tp: 160.886, sl: 161.246,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 54, day: 6, number: 1300, relativeTime: 7530,
      pair: 'BTCUSD', direction: 'long', entry: 72867.0, tp: 73123.0, sl: 72707.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 55, day: 6, number: 1301, relativeTime: 7620,
      pair: 'USDJPY', direction: 'long', entry: 160.716, tp: 160.956, sl: 160.566,
      rarity: 'good', chartCondition: 'ng', result: 'sl_hit', duration: 7200 },
    { id: 56, day: 6, number: 1302, relativeTime: 7710,
      pair: 'BTCUSD', direction: 'short', entry: 74367.0, tp: 74079.0, sl: 74547.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 57, day: 6, number: 1303, relativeTime: 7800,
      pair: 'USDJPY', direction: 'short', entry: 163.506, tp: 163.286, sl: 163.646,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 58, day: 6, number: 1304, relativeTime: 7890,
      pair: 'BTCUSD', direction: 'long', entry: 71567.0, tp: 71839.0, sl: 71397.0,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 59, day: 6, number: 1305, relativeTime: 7980,
      pair: 'USDJPY', direction: 'long', entry: 159.396, tp: 159.636, sl: 159.246,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 60, day: 6, number: 1306, relativeTime: 8070,
      pair: 'BTCUSD', direction: 'short', entry: 75857.0, tp: 75569.0, sl: 76037.0,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },

    /* ---- Day 7 ---- */
    { id: 61, day: 7, number: 1307, relativeTime: 8700,
      pair: 'USDJPY', direction: 'long', entry: 161.306, tp: 161.546, sl: 161.156,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 62, day: 7, number: 1308, relativeTime: 8790,
      pair: 'BTCUSD', direction: 'long', entry: 74167.0, tp: 74455.0, sl: 73987.0,
      rarity: 'rare', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 63, day: 7, number: 1309, relativeTime: 8880,
      pair: 'USDJPY', direction: 'short', entry: 158.216, tp: 158.006, sl: 158.346,
      rarity: 'normal', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 64, day: 7, number: 1310, relativeTime: 8970,
      pair: 'BTCUSD', direction: 'short', entry: 76267.0, tp: 75979.0, sl: 76447.0,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 65, day: 7, number: 1311, relativeTime: 9060,
      pair: 'USDJPY', direction: 'long', entry: 162.006, tp: 162.246, sl: 161.856,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 6600 },
    { id: 66, day: 7, number: 1312, relativeTime: 9150,
      pair: 'BTCUSD', direction: 'long', entry: 73067.0, tp: 73323.0, sl: 72907.0,
      rarity: 'epic', chartCondition: 'ok', result: 'tp_hit', duration: 8400 },
    { id: 67, day: 7, number: 1313, relativeTime: 9240,
      pair: 'USDJPY', direction: 'short', entry: 160.806, tp: 160.586, sl: 160.946,
      rarity: 'normal', chartCondition: 'ok', result: 'tp_hit', duration: 7200 },
    { id: 68, day: 7, number: 1314, relativeTime: 9330,
      pair: 'BTCUSD', direction: 'short', entry: 72767.0, tp: 72479.0, sl: 72947.0,
      rarity: 'good', chartCondition: 'ng', result: 'sl_hit', duration: 6000 },
    { id: 69, day: 7, number: 1315, relativeTime: 9420,
      pair: 'USDJPY', direction: 'long', entry: 159.606, tp: 159.846, sl: 159.456,
      rarity: 'good', chartCondition: 'ok', result: 'tp_hit', duration: 7800 },
    { id: 70, day: 7, number: 1316, relativeTime: 9510,
      pair: 'BTCUSD', direction: 'long', entry: 74767.0, tp: 75519.0, sl: 74297.0,
      rarity: 'legendary', chartCondition: 'ok', result: 'tp_hit', duration: 9000 }
  ];
  /* END:SIGNAL_META */

  /* --------------------------------------------------------------------------
   * 5. シグナルのエンリッチ(pips / 損益 / RR比 / チャート)
   * -------------------------------------------------------------------------- */
  // 全シグナル共通の目標リスクリワード比(1 : TARGET_RR)
  const TARGET_RR = 1.6;

  function enrichSignal(meta) {
    const conf = PAIR_CONFIG[meta.pair];
    const dir = meta.direction === 'long' ? 1 : -1;

    // SL はシナリオ定義どおり尊重、TP は SL 距離 × TARGET_RR で再計算
    const slPips = Math.abs(Math.round(((meta.entry - meta.sl) * dir) / conf.pipSize));
    const tpPips = Math.round(slPips * TARGET_RR);
    const tp = round(meta.entry + dir * tpPips * conf.pipSize, conf.decimals);

    const tpProfit = tpPips * conf.pipValue;
    const slLoss = -slPips * conf.pipValue;
    const rr = slPips > 0 ? +(tpPips / slPips).toFixed(2) : 0;

    const chart = generateChart(meta);

    return Object.assign({}, meta, {
      tp: tp,
      pipSize: conf.pipSize,
      pipValue: conf.pipValue,
      lotSize: conf.lotSize,
      decimals: conf.decimals,
      tpPips: tpPips,
      slPips: slPips,
      tpProfit: tpProfit,
      slLoss: slLoss,
      rr: rr,
      candles: chart.candles,
      ma20: chart.ma20,
      ma80: chart.ma80
    });
  }

  /* --------------------------------------------------------------------------
   * 6. SCENARIOS を組み立て
   * -------------------------------------------------------------------------- */
  const SCENARIOS = { day1: [], day2: [], day3: [], day4: [], day5: [], day6: [], day7: [] };
  for (let i = 0; i < SIGNAL_META.length; i++) {
    const signal = enrichSignal(SIGNAL_META[i]);
    SCENARIOS['day' + signal.day].push(signal);
  }

  /* --------------------------------------------------------------------------
   * 7. ユーティリティ
   * -------------------------------------------------------------------------- */
  const ALL_SIGNALS = SCENARIOS.day1.concat(
    SCENARIOS.day2, SCENARIOS.day3, SCENARIOS.day4,
    SCENARIOS.day5, SCENARIOS.day6, SCENARIOS.day7
  );

  const ScenarioUtil = {
    totalDays: 7,
    totalSignals: ALL_SIGNALS.length,

    /** ID からシグナル取得 */
    getById: function (id) {
      for (let i = 0; i < ALL_SIGNALS.length; i++) {
        if (ALL_SIGNALS[i].id === id) return ALL_SIGNALS[i];
      }
      return null;
    },

    /** 指定 Day のシグナル一覧 */
    getForDay: function (day) {
      return SCENARIOS['day' + day] || [];
    },

    /** 全シグナル(時系列昇順) */
    getAll: function () {
      return ALL_SIGNALS.slice();
    },

    /**
     * 経過分数(Day1 0:00起点)から、その時点までに配信されたシグナルを返す
     */
    getUntil: function (elapsedMinutes) {
      return ALL_SIGNALS.filter(function (s) {
        return s.relativeTime <= elapsedMinutes;
      });
    },

    /**
     * 次にトリガーされるシグナルを返す(まだ配信されていないもののうち最も早いもの)
     * @param {number} elapsedMinutes 経過分数
     * @returns シグナル or null
     */
    getNext: function (elapsedMinutes) {
      for (let i = 0; i < ALL_SIGNALS.length; i++) {
        if (ALL_SIGNALS[i].relativeTime > elapsedMinutes) return ALL_SIGNALS[i];
      }
      return null;
    },

    /** 経過分数から Day を計算 (1〜3 or 'ended') */
    calcDay: function (elapsedMinutes) {
      if (elapsedMinutes < 1440) return 1;
      if (elapsedMinutes < 2880) return 2;
      if (elapsedMinutes < 4320) return 3;
      return 'ended'; // Phase1 では Day3 まで。以降は拡張予定
    }
  };

  /* --------------------------------------------------------------------------
   * 8. エクスポート
   * -------------------------------------------------------------------------- */
  global.SCENARIOS = SCENARIOS;
  global.ScenarioUtil = ScenarioUtil;
  global.PAIR_CONFIG = PAIR_CONFIG;

})(typeof window !== 'undefined' ? window : this);
