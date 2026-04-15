/* ==========================================================================
 * Rainbow Trial — data/members-feed.js
 * Rainbow Salon 他メンバーの疑似アクティビティフィードデータ
 *
 * 公開グローバル: window.SALON_FEED_DATA
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. メンバーニックネーム & アバター
   * -------------------------------------------------------------------------- */
  var MEMBER_NAMES = [
    'ゆうき', 'みどり', 'たくま', 'あい', 'けんじ',
    'さくら', 'りょう', 'なつみ', 'だいき', 'ゆりか',
    'しょうた', 'あやか', 'まさる', 'えり', 'じゅん',
    'ともこ', 'ひろし', 'まなみ', 'こうた', 'あきこ'
  ];

  var MEMBER_AVATARS = [
    '🙋‍♀️','🙋‍♂️','👩‍💼','👨‍💼','🧑‍💻',
    '👩‍🎓','👨‍🎓','🧑‍🎨','👩','👨',
    '🧑','👩‍💻','👨‍💻','🧑‍🔬','👩‍🔬',
    '🧑‍🏫','👩‍🏫','👨‍🏫','🧑‍💼','👩‍🎨'
  ];

  /* --------------------------------------------------------------------------
   * 2. 通貨ペア・方向
   * -------------------------------------------------------------------------- */
  var PAIRS = ['USDJPY', 'BTCUSD', 'EURUSD', 'USDJPY', 'USDJPY'];
  var DIRECTIONS = ['ロング', 'ショート'];

  /* --------------------------------------------------------------------------
   * 3. 結果テンプレート(勝ち/負け)
   * -------------------------------------------------------------------------- */
  var WIN_PIPS = [12, 18, 22, 28, 35, 42, 55, 65, 80, 90, 110, 120, 150, 180];
  var LOSE_PIPS = [10, 12, 15, 18, 20, 22, 25];

  /* --------------------------------------------------------------------------
   * 4. 特別メッセージ(オプション)
   * -------------------------------------------------------------------------- */
  var SPECIAL_MSGS = [
    'Rainbow System、今日も最高！',
    '虹の条件ばっちりでした✨',
    '久しぶりの大きな利益😊',
    '判定スコア更新！嬉しい',
    'ひかりさんのシグナル通りでした🌈',
    '今週3連勝！調子いい',
    null, null, null  // null = 特別メッセージなし(比率調整)
  ];

  /* --------------------------------------------------------------------------
   * 5. シード付き疑似乱数
   * -------------------------------------------------------------------------- */
  function seededRand(seed, index) {
    var x = Math.sin(seed * 9301 + index * 49297 + 233) * 29999;
    return x - Math.floor(x);
  }

  /* --------------------------------------------------------------------------
   * 6. フィードアイテム生成
   * -------------------------------------------------------------------------- */
  function generateFeedItems(count, seed) {
    if (seed == null) seed = Math.floor(Date.now() / 300000); // 5分ごとに変化
    var items = [];
    for (var i = 0; i < count; i++) {
      var r0  = seededRand(seed, i * 10 + 0);
      var r1  = seededRand(seed, i * 10 + 1);
      var r2  = seededRand(seed, i * 10 + 2);
      var r3  = seededRand(seed, i * 10 + 3);
      var r4  = seededRand(seed, i * 10 + 4);
      var r5  = seededRand(seed, i * 10 + 5);

      var nameIdx   = Math.floor(r0 * MEMBER_NAMES.length);
      var avatarIdx = Math.floor(r1 * MEMBER_AVATARS.length);
      var pairIdx   = Math.floor(r2 * PAIRS.length);
      var dirIdx    = Math.floor(r3 * DIRECTIONS.length);
      var isWin     = r4 < 0.72; // 勝率 72%
      var pipsArr   = isWin ? WIN_PIPS : LOSE_PIPS;
      var pipsIdx   = Math.floor(r5 * pipsArr.length);
      var pips      = pipsArr[pipsIdx];

      // 時間前(1〜35分前)
      var minutesAgo = 1 + Math.floor(seededRand(seed, i * 10 + 6) * 35);
      var timeAgo    = minutesAgo + '分前';

      var specialIdx = Math.floor(seededRand(seed, i * 10 + 7) * SPECIAL_MSGS.length);
      var special    = SPECIAL_MSGS[specialIdx];

      items.push({
        name:      MEMBER_NAMES[nameIdx],
        avatar:    MEMBER_AVATARS[avatarIdx],
        pair:      PAIRS[pairIdx],
        direction: DIRECTIONS[dirIdx],
        pips:      pips,
        isWin:     isWin,
        timeAgo:   timeAgo,
        special:   special
      });
    }
    return items;
  }

  /**
   * シグナル結果連動フィード生成
   * ユーザーのシグナル結果と同じ内容で他メンバーが結果を出した風に表示
   */
  function generateSignalLinkedItems(signal, userPips, winCount, loseCount) {
    if (!signal) return [];
    var seed = signal.id || Date.now();
    var items = [];
    var total = 3 + Math.floor(seededRand(seed, 0) * 3); // 3〜5件

    for (var i = 0; i < total; i++) {
      var r0 = seededRand(seed, i * 5 + 10);
      var r1 = seededRand(seed, i * 5 + 11);
      var r2 = seededRand(seed, i * 5 + 12);

      var nameIdx = Math.floor(r0 * MEMBER_NAMES.length);
      var avatarIdx = Math.floor(r1 * MEMBER_AVATARS.length);

      // 70%は勝ちと同じ結果
      var isWin    = r2 < 0.70;
      var pips     = isWin ? userPips : Math.floor(seededRand(seed, i * 5 + 13) * 15) + 10;
      var minsAgo  = (i + 1) * 2; // 2分ごとにずらす

      items.push({
        name:      MEMBER_NAMES[nameIdx],
        avatar:    MEMBER_AVATARS[avatarIdx],
        pair:      signal.pair || 'USDJPY',
        direction: signal.direction === 'long' ? 'ロング' : 'ショート',
        pips:      pips,
        isWin:     isWin,
        timeAgo:   minsAgo + '分前',
        special:   null
      });
    }
    return items;
  }

  /* --------------------------------------------------------------------------
   * 7. オンライン人数(時間帯で変動)
   * -------------------------------------------------------------------------- */
  function getOnlineCount() {
    var h = new Date().getHours();
    // 深夜: 60〜90、朝: 80〜120、昼: 110〜140、夜: 120〜150
    var base = h < 6 ? 65 : h < 10 ? 95 : h < 14 ? 120 : h < 18 ? 115 : 135;
    var fluctuation = Math.floor(seededRand(Math.floor(Date.now() / 60000), 0) * 20) - 10;
    return Math.max(60, base + fluctuation);
  }

  /* --------------------------------------------------------------------------
   * 8. 公開
   * -------------------------------------------------------------------------- */
  var SALON_FEED_DATA = {
    generateFeedItems:          generateFeedItems,
    generateSignalLinkedItems:  generateSignalLinkedItems,
    getOnlineCount:             getOnlineCount,
    MEMBER_NAMES:               MEMBER_NAMES,
    MEMBER_AVATARS:             MEMBER_AVATARS
  };

  global.SALON_FEED_DATA = SALON_FEED_DATA;

  // 旧互換(MEMBERS_FEED_DATA でアクセスされる場合のフォールバック)
  global.MEMBERS_FEED_DATA = {
    generateFeed: function(count, seed) { return generateFeedItems(count, seed); }
  };

})(typeof window !== 'undefined' ? window : this);
