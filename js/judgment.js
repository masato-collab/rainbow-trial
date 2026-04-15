/* ==========================================================================
 * Rainbow Trial — js/judgment.js
 * シグナルの「エントリー条件」判定ロジック + 学習ガイド文生成。
 *
 * 判定ルール(レインボーロード基準):
 *   LONG  : ローソク足がレインボーロードの【上】を走っている
 *             (内部: close > ma20 > ma80)
 *   SHORT : ローソク足がレインボーロードの【下】を走っている
 *             (内部: close < ma20 < ma80)
 *
 * 公開グローバル: window.Judgment
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. 判定
   * -------------------------------------------------------------------------- */
  /**
   * シグナルに対する最新値判定。
   * @param {Object} signal — scenarios.js のエンリッチ済みシグナル
   * @returns {Object} 判定結果
   */
  function judge(signal) {
    if (!signal || !signal.candles || !signal.ma20 || !signal.ma80) {
      return { condition: 'ng', reason: 'invalid_signal', checks: [] };
    }

    const n = signal.candles.length;
    const lastCandle = signal.candles[n - 1];
    const lastClose  = lastCandle.c;
    const lastMa20   = signal.ma20[n - 1];
    const lastMa80   = signal.ma80[n - 1];

    const dir = signal.direction;  // 'long' | 'short'
    const checks = buildChecks(dir, lastClose, lastMa20, lastMa80);
    const allPass = checks.every(function (c) { return c.pass; });

    return {
      condition: allPass ? 'ok' : 'ng',
      rule: dir,
      lastClose: lastClose,
      lastMa20:  lastMa20,
      lastMa80:  lastMa80,
      checks: checks,
      summary: allPass ? '✅ エントリー条件を満たしています' : '⚠️ エントリー条件を満たしていません',
      ngReason: allPass ? null : describeNg(dir, lastClose, lastMa20, lastMa80)
    };
  }

  function buildChecks(direction, close, ma20, ma80) {
    if (direction === 'long') {
      return [
        { label: 'ローソク足がレインボーロードの上にある',  pass: close > ma20, detail: close.toFixed(3) + ' > ' + ma20.toFixed(3) },
        { label: 'レインボーロードが正しい方向に並んでいる', pass: ma20  > ma80, detail: ma20.toFixed(3)  + ' > ' + ma80.toFixed(3) }
      ];
    }
    // short
    return [
      { label: 'ローソク足がレインボーロードの下にある',  pass: close < ma20, detail: close.toFixed(3) + ' < ' + ma20.toFixed(3) },
      { label: 'レインボーロードが正しい方向に並んでいる', pass: ma20  < ma80, detail: ma20.toFixed(3)  + ' < ' + ma80.toFixed(3) }
    ];
  }

  function describeNg(direction, close, ma20, ma80) {
    if (direction === 'long') {
      if (close < ma80 && close < ma20) return 'ローソク足がレインボーロードの下を走っています。';
      if (close < ma20) return 'ローソク足がレインボーロードに絡んでいます(条件NG)。';
      if (ma20 < ma80)  return 'レインボーロードの向きが逆転しています(下落傾向)。';
      return 'レインボーロードの並びがロング条件を満たしていません。';
    }
    // short
    if (close > ma80 && close > ma20) return 'ローソク足がレインボーロードの上を走っています。';
    if (close > ma20) return 'ローソク足がレインボーロードに絡んでいます(条件NG)。';
    if (ma20 > ma80)  return 'レインボーロードの向きが逆転しています(上昇傾向)。';
    return 'レインボーロードの並びがショート条件を満たしていません。';
  }

  /* --------------------------------------------------------------------------
   * 2. ガイド文(シグナル詳細画面上の「💡 エントリー条件」カード)
   * -------------------------------------------------------------------------- */
  function getGuideText(direction) {
    if (direction === 'long') {
      return {
        title: '🌈 レインボーロードを確認',
        lines: [
          'レインボーロードの <strong>上</strong> をローソク足が走っていれば OK。',
          '<span style="font-family:monospace;font-size:0.9em">▮▮▮ ← ローソク足<br>━━━ ← レインボーロード</span>',
          'ローソク足がレインボーロードの上を走っていれば エントリー OK ✅'
        ]
      };
    }
    return {
      title: '🌈 レインボーロードを確認',
      lines: [
        'レインボーロードの <strong>下</strong> をローソク足が走っていれば OK。',
        '<span style="font-family:monospace;font-size:0.9em">━━━ ← レインボーロード<br>▮▮▮ ← ローソク足</span>',
        'ローソク足がレインボーロードの下を走っていれば エントリー OK ✅'
      ]
    };
  }

  /* --------------------------------------------------------------------------
   * 3. 判定ガイド: 現在のチャートに当てはめた簡潔な解釈文
   *    (判定ボタン上に表示する「なぜOK/NGか」の一言)
   * -------------------------------------------------------------------------- */
  function briefHint(judgeResult) {
    if (!judgeResult) return '';
    if (judgeResult.condition === 'ok') {
      return judgeResult.rule === 'long'
        ? 'ローソク足がレインボーロードの上を走っています。ロング条件成立。'
        : 'ローソク足がレインボーロードの下を走っています。ショート条件成立。';
    }
    return judgeResult.ngReason || '条件を満たしていません。';
  }

  /* --------------------------------------------------------------------------
   * 4. 学習モーダル用の詳細解説 HTML(学習リンク「条件の見方を詳しく見る」押下時)
   * -------------------------------------------------------------------------- */
  function getLearningContent() {
    return [
      {
        title: 'レインボーロードとは',
        body:
          'チャート上に表示される <strong>2 本のライン</strong>(短期・中期)の帯のことです。<br>' +
          'ローソク足とこのレインボーロードの位置関係だけで、' +
          'トレンドの方向と勢いを判断するのが Rainbow System の基本です。'
      },
      {
        title: 'ロングのエントリー条件',
        body:
          'ローソク足が<strong>レインボーロードの上</strong>を走っている時。<br>' +
          'レインボーロードが正しい向き(短期ラインが中期ラインより上)に並んでおり、' +
          'かつローソク足がその上にある = 買い方が有利な地合い、と判断します。'
      },
      {
        title: 'ショートのエントリー条件',
        body:
          'ローソク足が<strong>レインボーロードの下</strong>を走っている時。<br>' +
          'ロングとは逆で、レインボーロードが下向きに並んでいる = 売り方が有利な地合いです。'
      },
      {
        title: '見送るべきケース',
        body:
          '・ローソク足がレインボーロードに<strong>絡んでいる</strong>(間にある)<br>' +
          '・レインボーロードの向きが<strong>逆転</strong>している<br>' +
          '・価格がレインボーロードの反対側から戻りかけている<br>' +
          'これらはトレンドが不明瞭 or 逆行の可能性があるため、見送るのが賢明です。'
      },
      {
        title: 'TP / SL の考え方',
        body:
          'TP(利確)と SL(損切)は、シグナル配信時に自動計算されます。<br>' +
          '推奨 <strong>RR 比 = 1 : 1.6 以上</strong> を基準に、勝率を維持しながら期待値をプラスに保つ設計です。'
      }
    ];
  }

  /* --------------------------------------------------------------------------
   * 5. 見送り結果の解釈(結果画面 ⏸️ 用)
   * -------------------------------------------------------------------------- */
  /**
   * 見送りを選んだ時の「もしエントリーしていたら…」文言
   * @param {Object} signal
   * @returns {Object} { title, message, correct }
   *   correct: 見送りの判断が正しかったか(条件NGを見送り=正しい)
   */
  function judgeSkipFeedback(signal) {
    const j = judge(signal);
    const isOkCondition = (j.condition === 'ok');
    const wouldHaveHit = (signal.result === 'tp_hit');

    if (!isOkCondition) {
      // 条件NGを見送り = 賢明
      return {
        title: '賢明な判断でした!',
        message: wouldHaveHit
          ? 'もしエントリーしていたら偶然 TP にヒットしていましたが、条件を満たさないシグナルを見送ったのは正しい判断です。'
          : '条件を満たさないシグナルを見送り、損失を回避できました。',
        correct: true
      };
    }
    // 条件OKを見送り
    return {
      title: '次は判断してみましょう',
      message: wouldHaveHit
        ? 'このシグナルは条件を満たしており、エントリーしていれば TP にヒットしていました。次はチャレンジしてみましょう。'
        : '条件は満たしていましたが SL にヒットしていたため、結果的には見送りが幸運でした。',
      correct: wouldHaveHit ? false : true
    };
  }

  /* --------------------------------------------------------------------------
   * 6. 公開 API
   * -------------------------------------------------------------------------- */
  const Judgment = {
    judge:              judge,
    getGuideText:       getGuideText,
    briefHint:          briefHint,
    getLearningContent: getLearningContent,
    judgeSkipFeedback:  judgeSkipFeedback
  };

  global.Judgment = Judgment;

})(typeof window !== 'undefined' ? window : this);
