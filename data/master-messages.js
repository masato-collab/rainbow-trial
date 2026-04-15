/* ==========================================================================
 * Rainbow Trial — data/master-messages.js
 * サロンマスター「ひかり」からのメッセージデータ定義
 *
 * 公開グローバル:
 *   window.HIKARI_MESSAGES
 *   window.getHikariMessageById(id)
 *   window.getHikariMessageForDay(day)
 *   window.getHikariMessageByTrigger(trigger)
 *   window.interpolateHikariMessage(msg, vars)
 *   window.getMessageForDay(day)  ← 旧 API 互換
 * ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * メッセージ定義
   * placeholders: {nickname}, {day1_trades}, {score}, {rank}
   * -------------------------------------------------------------------------- */
  var HIKARI_MESSAGES = [

    /* ---- Day 1: 初回起動 ---- */
    {
      id:      'day1_welcome',
      day:     1,
      trigger: 'day_start',
      badge:   '🌈 DAY 1',
      subject: 'ようこそ、Rainbow Trial へ！',
      body: [
        'ようこそ、{nickname}さん！',
        '私はひかりです。Rainbow Salon の運営をしています。',
        '',
        'これから7日間、Rainbow System を一緒に体験していきましょう。',
        '',
        '最初は「条件って何？」「どこを見ればいいの？」って迷うかもしれません。でも大丈夫です。少しずつ慣れていけばいいんです。',
        '',
        '焦らず、自分のペースで進んでいきましょう🌈',
        'いつでも応援しています。'
      ],
      from: '— ひかり より'
    },

    /* ---- Day 2: 2日目の朝 ---- */
    {
      id:      'day2_morning',
      day:     2,
      trigger: 'day_start',
      badge:   '🌤 DAY 2',
      subject: '昨日のトレード、振り返ってみて',
      body: [
        '{nickname}さん、おかえりなさい！',
        '',
        '昨日は{day1_trades}回トレードされましたね。',
        '',
        '今日は「見送る勇気」を意識してみてください。',
        '',
        '全部のシグナルに乗る必要はないんです。条件が揃っていないと感じたなら、見送るのも立派な判断。',
        '',
        'Rainbow System の勝率が高いのは、条件を厳選しているから。',
        '今日も無理せず、楽しんでいきましょう😊'
      ],
      from: '— ひかり より'
    },

    /* ---- Day 3: 3日目 ---- */
    {
      id:      'day3_morning',
      day:     3,
      trigger: 'day_start',
      badge:   '☀️ DAY 3',
      subject: 'チャート判定、慣れてきた頃ですね',
      body: [
        '{nickname}さん、3日目に入りましたね。',
        '',
        'そろそろチャート判定にも慣れてきた頃でしょうか？',
        '',
        'Rainbow System の真髄は「レインボーロードを見て、進むべき道を選ぶ」こと。',
        '全部取ろうとしないことが、実は一番の近道なんです。',
        '',
        'チャートを見るとき、この3つを確認してみてください：',
        '① ローソク足の形は条件を満たしているか',
        '② トレンドの方向と一致しているか',
        '③ 直近の高値・安値との位置関係は？',
        '',
        'あなたの判定力、信じてます💪'
      ],
      from: '— ひかり より'
    },

    /* ---- Day 4: 折り返し ---- */
    {
      id:      'day4_midpoint',
      day:     4,
      trigger: 'day_start',
      badge:   '🌈 DAY 4',
      subject: 'ついに折り返し！',
      body: [
        '{nickname}さん、ついに折り返しです！',
        '',
        'ここまでの判定スコア：{score}点（{rank}）',
        '',
        'この数字、{nickname}さんの「本物の判定力」です。',
        '',
        'ここからの3日間が、実は一番大切。',
        'Day 4〜7 のシグナルは少し難しくなっているかもしれません。',
        'でも難しいほど、成長のチャンスでもあります。',
        '',
        '焦らず、自分のペースで進んでいきましょう。',
        '残り4日間も、一緒に頑張りましょうね🌈'
      ],
      from: '— ひかり より'
    },

    /* ---- Day 5: 試練の日 ---- */
    {
      id:      'day5_trial',
      day:     5,
      trigger: 'day_start',
      badge:   '⚡ DAY 5',
      subject: '今日は試練の日かもしれません',
      body: [
        '{nickname}さん、調子はどうですか？',
        '',
        '5日目は「難しいな…」と感じる日かもしれません。',
        'もし思うようにいかなくても、落ち込まないでくださいね。',
        '',
        'プロのトレーダーも、相場で大切にしているのは「勝ち続けること」ではなく「淡々と続けること」なんです。',
        '',
        '1日2〜3回のトレードでも、判定が正確なら十分。',
        '量より質を意識してみてください。',
        '',
        'あなたが今感じている「難しさ」こそが、成長の証拠です。'
      ],
      from: '— ひかり より'
    },

    /* ---- Day 6: ラスト前 ---- */
    {
      id:           'day6_finale',
      day:          6,
      trigger:      'day_start',
      badge:        '🌟 DAY 6',
      subject:      'もう少しで7日間が終わりますね',
      body: [
        '{nickname}さん、6日目です。',
        '',
        'もう少しで、この7日間体験が終わりますね。',
        '',
        '「もう少し続けたい」「本物のサロンって、どんな感じだろう？」',
        'そう思ってくれていたら嬉しいです。',
        '',
        '明日の最終日、{nickname}さんの7日間の総まとめを見せてあげます。',
        '少し楽しみにしていてください🌈',
        '',
        'もし体験が終わった後に「続きが気になる」と思ったら、いつでも声をかけてください。'
      ],
      from:         '— ひかり より',
      showLineHint: true
    },

    /* ---- Day 7: 最終日 ---- */
    {
      id:      'day7_last',
      day:     7,
      trigger: 'day_start',
      badge:   '🏆 FINAL DAY',
      subject: 'ついに最終日！7日間の集大成',
      body: [
        '{nickname}さん、ついに最終日です。',
        '',
        'ここまで本当によく頑張りました。',
        '',
        '7日前の{nickname}さんを覚えていますか？',
        'あの頃から比べると、今のあなたは確実に成長しています。',
        '',
        '今日は最後のシグナル、思い切ってトレードしてみてください。',
        '条件を確認して、自分の判断を信じて。',
        '',
        'そして7日間の成長を、自分の目で確かめてみてください。',
        '最後に特別な画面をお見せしますね🌈'
      ],
      from: '— ひかり より'
    },

    /* ---- 条件: 5連続敗 ---- */
    {
      id:      'conditional_5losses',
      day:     null,
      trigger: 'consecutive_losses_5',
      badge:   '💌 ひかりより',
      subject: '大丈夫？連敗が続いているようで…',
      body: [
        '{nickname}さん、大丈夫ですか？',
        '',
        '連敗が続くと、焦りますよね。私もそうでした。',
        '',
        'でも、少し落ち着いて考えてみてください。',
        '相場は明日も来週も続きます。今すぐ挽回しようとするほど、判断が狂っていくんです。',
        '',
        'こんな時は深呼吸して、一度休んでみてもいいんですよ。',
        '今日はもうトレードしなくていい。',
        '',
        '明日また、冷静な頭でチャートを見てみましょう。',
        'そのほうが、きっといい結果が出るはずです。'
      ],
      from: '— ひかり より'
    },

    /* ---- 条件: LEGENDARY シグナル獲得 ---- */
    {
      id:      'conditional_legendary',
      day:     null,
      trigger: 'legendary_signal',
      badge:   '🌈 LEGENDARY',
      subject: 'LEGENDARY シグナル、おめでとうございます！',
      body: [
        '{nickname}さん、LEGENDARY シグナル獲得おめでとうございます！🌈',
        '',
        '虹色のシグナル、受け取りましたね。',
        '',
        'こういう瞬間のために、Rainbow System は存在します。',
        '条件が完全に揃った、最高の状態です。',
        '',
        '{nickname}さんが正確に判定できたこと、',
        'すでに本物のトレーダーとしての感覚を持ち始めている証拠です。',
        '',
        'この感覚、大切にしてくださいね✨'
      ],
      from: '— ひかり より'
    },

    /* ---- 条件: 7連勝達成 ---- */
    {
      id:      'conditional_7streak',
      day:     null,
      trigger: 'win_streak_7',
      badge:   '🔥 7連勝',
      subject: '7連勝！すごい！でも注意も大切',
      body: [
        '{nickname}さん、7連勝！すごい！',
        '',
        'こういう波に乗っている時こそ、気をつけてほしいことがあります。',
        '',
        '「負けない気がする」「今なら大きく張れる」',
        'そんな感覚が出てきたら、要注意のサインです。',
        '',
        '本物のプロは、好調な時こそ丁寧に、慎重に。',
        '利益を守る意識を、絶対に忘れないでください。',
        '',
        '勝ちを積み重ねることより、',
        '勝ちを守ることが本当の上達につながります。',
        '',
        '引き続き、着実に進んでいきましょう🌈'
      ],
      from: '— ひかり より'
    },

    /* ---- 条件: 判定スコア 90点超 ---- */
    {
      id:           'conditional_score90',
      day:          null,
      trigger:      'score_over_90',
      badge:        '💎 スコア90+',
      subject:      '判定スコア90点超！マスター級の判定力です',
      body: [
        '{nickname}さん、判定スコア90点超！',
        '',
        'これはマスター級の判定力です。',
        '',
        '本物のサロンメンバーでも、なかなか到達できないレベルですよ。',
        '',
        '{nickname}さんが7日間で積み重ねてきた判定の正確さが、',
        'この数字に表れています。',
        '',
        '「条件を見極める目」が、確実に育っています。',
        '',
        'この力をもって、次のステップに進む準備はできています。',
        'もし興味があれば、ぜひ相談してくださいね🌈'
      ],
      from:         '— ひかり より',
      showLineHint: true
    }

  ];

  /* --------------------------------------------------------------------------
   * ヘルパー
   * -------------------------------------------------------------------------- */
  function getHikariMessageById(id) {
    for (var i = 0; i < HIKARI_MESSAGES.length; i++) {
      if (HIKARI_MESSAGES[i].id === id) return HIKARI_MESSAGES[i];
    }
    return null;
  }

  function getHikariMessageForDay(day) {
    for (var i = 0; i < HIKARI_MESSAGES.length; i++) {
      var m = HIKARI_MESSAGES[i];
      if (m.trigger === 'day_start' && m.day === day) return m;
    }
    return null;
  }

  function getHikariMessageByTrigger(trigger) {
    for (var i = 0; i < HIKARI_MESSAGES.length; i++) {
      if (HIKARI_MESSAGES[i].trigger === trigger) return HIKARI_MESSAGES[i];
    }
    return null;
  }

  /**
   * メッセージ本文に実データを差し込む
   * vars: { nickname, day1_trades, score, rank }
   */
  function interpolateHikariMessage(msg, vars) {
    if (!msg) return msg;
    vars = vars || {};
    function rep(str) {
      return str
        .replace(/\{nickname\}/g,    vars.nickname    || 'トレーダー')
        .replace(/\{day1_trades\}/g, vars.day1_trades != null ? String(vars.day1_trades) : '?')
        .replace(/\{score\}/g,       vars.score       != null ? String(Math.round(vars.score)) : '--')
        .replace(/\{rank\}/g,        vars.rank        || '--');
    }
    var out = Object.assign({}, msg);
    out.body    = msg.body.map(rep);
    out.subject = rep(msg.subject || '');
    out.badge   = rep(msg.badge   || '');
    return out;
  }

  /* --------------------------------------------------------------------------
   * 公開
   * -------------------------------------------------------------------------- */
  global.HIKARI_MESSAGES            = HIKARI_MESSAGES;
  global.getHikariMessageById       = getHikariMessageById;
  global.getHikariMessageForDay     = getHikariMessageForDay;
  global.getHikariMessageByTrigger  = getHikariMessageByTrigger;
  global.interpolateHikariMessage   = interpolateHikariMessage;

  // 旧 API 互換
  global.getMessageForDay = getHikariMessageForDay;

})(typeof window !== 'undefined' ? window : this);
