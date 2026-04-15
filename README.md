# 🌈 Rainbow Trial

**Rainbow System を、7日間体験。**

Rainbow Trial は、レインボーサロン(FXサロン)で実際に配信されるトレードシグナルを **7日間疑似体験** できるウェブアプリです。仮想資金 ¥300,000 でスタートし、シグナル受信 → チャート判定 → エントリー/見送り → 結果確認、という本サロンと同じフローを体験できます。

> **これは疑似体験用アプリです。実際の取引は行われません。**

## ✨ 特徴

- 🌈 **半裁量システム**: シグナルが届いたら、あなたがチャートを見て条件を判断
- 📊 **本格チャート**: TradingView 風の Canvas チャート(ローソク足 + MA20/MA80)
- 🎯 **1日10シグナル**: USD/JPY と BTC/USD を中心に配信
- ⚡ **早送り or リアルタイム**: ポジション保有中は好きなモードで進行
- 💰 **仮想資金管理**: ¥300,000 スタートで損益をリアルに体感
- 📱 **スマホファースト**: レスポンシブ対応、どの端末でも快適に

## 🗺️ 画面構成

- **Welcome**: ニックネーム登録とスタート
- **ホーム**: 進捗 / 資金 / 戦績 / 保有ポジション / 次のシグナル予測
- **シグナル一覧**: 受信シグナルの時系列表示
- **シグナル詳細**: 情報カード + 本格チャート + 判定ボタン
- **ポジション管理**: 早送り / リアルタイム
- **結果**: TP HIT / SL HIT / 見送り判定
- **履歴**: フィルタ付きトレード履歴 + 統計サマリー

## 🛠️ 技術スタック

- **Vanilla HTML / CSS / JavaScript**(フレームワーク不使用)
- **Canvas API** による自前チャート描画
- **localStorage** によるデータ永続化(キー: `rainbow-trial-v1`)
- **Google Fonts**(Inter / Noto Sans JP / JetBrains Mono)のみ外部依存

## 📁 プロジェクト構造

```
rainbow-trial/
├─ index.html          # メインアプリ
├─ welcome.html        # 初回ウェルカム
├─ 404.html
├─ css/
│  ├─ style.css        # 共通スタイル
│  ├─ components.css   # ボタン・カード等
│  └─ chart.css        # チャート専用
├─ js/
│  ├─ app.js           # メインロジック・ルーター
│  ├─ game-state.js    # ゲーム状態管理
│  ├─ signals.js       # シグナル配信制御
│  ├─ trade.js         # トレード処理
│  ├─ chart.js         # Canvas チャート描画
│  ├─ judgment.js      # 条件判定ロジック
│  └─ storage.js       # localStorage 管理
├─ data/
│  └─ scenarios.js     # シナリオデータ
└─ assets/
   ├─ logo.svg
   ├─ favicon.svg
   └─ og-image.svg
```

## 🚀 ローカル起動

```bash
cd rainbow-trial
python3 -m http.server 8000
# → http://localhost:8000/welcome.html
```

## 🗺️ 開発フェーズ

### Phase 1(本リリース)
コア機能: ウェルカム / ホーム / シグナル配信 / チャート判定 / エントリー / ポジション管理 / 結果 / 履歴 / Day1〜Day7(70シグナル)

### Phase 2(予定)
レベル・XP・アチーブメント / デイリーミッション / 演出強化 / サロンマスターメッセージ / PWA化 / Day7 最終画面 / LINE 誘導

## 🌈 Rainbow Project シリーズ

Rainbow Trial は Rainbow Project シリーズの一員です。
- [rainbow-fxkit](https://github.com/) — FX初心者向けツール配布サイト
- **rainbow-trial**(本アプリ)

## 📜 ライセンス

本アプリは疑似体験用に制作されたものであり、実際の投資判断の代替ではありません。
