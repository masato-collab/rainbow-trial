# 🌈 Rainbow Trial

**Rainbow System を、7日間体験。**

Rainbow Trial は、レインボーサロン(FXサロン)で実際に配信されるトレードシグナルを **7日間疑似体験** できるウェブアプリです。仮想資金 ¥300,000 でスタートし、シグナル受信 → チャート判定 → エントリー/見送り → 結果確認、という本サロンと同じフローを体験できます。

> **これは疑似体験用アプリです。実際の取引は行われません。**

## ✨ 特徴

- 🌈 **半裁量システム**: シグナルが届いたら、あなたがチャートを見て条件を判断
- 📊 **MT4 モバイル風チャート**: 黒背景 + 緑赤実体ローソク、実運用 MT4 と同じ見た目
- 🎯 **1日10シグナル × 7日 = 70 シグナル**: USD/JPY / BTC/USD を中心に配信
- ⚡ **早送り or リアルタイム**: ポジション保有中は好きなモードで進行(RR 1:1.6)
- 💰 **仮想資金管理**: ¥300,000 スタート
- 📱 **PWA 対応**: ホーム画面追加でアプリのように使用、オフラインも動作
- 🔔 **ブラウザ通知**: レアリティ別の通知挙動(GOOD 以上で通知)
- 🔄 **価格自動更新**: 週次/月次でスクリプト実行すれば最新相場に追従

## 🗺️ 画面構成

- **Welcome**: ニックネーム登録とスタート
- **ホーム**: 進捗 / 資金 / 戦績 / 保有ポジション / 次のシグナル予測
- **シグナル一覧**: 受信シグナルの時系列表示
- **シグナル詳細**: 情報カード + チャート + 判定ボタン
- **ポジション管理**: 早送り / リアルタイム
- **結果**: TP HIT / SL HIT / 見送り判定
- **履歴**: フィルタ付きトレード履歴 + 統計サマリー
- **設定** (⚙️): 通知 ON/OFF、レアリティ別設定、データリセット

## 🛠️ 技術スタック

- **Vanilla HTML / CSS / JavaScript**(フレームワーク不使用)
- **Canvas API** による MT4 風チャート描画
- **Service Worker** によるオフライン / キャッシュ戦略
- **Web Notification API** によるブラウザ通知
- **localStorage** (`rainbow-trial-v1`)
- **Node.js** (>=18) — 価格更新スクリプトのみ

## 📁 プロジェクト構造

```
rainbow-trial/
├─ index.html          # メインアプリ
├─ welcome.html        # 初回ウェルカム
├─ offline.html        # オフライン時のフォールバック
├─ 404.html
├─ manifest.json       # PWA マニフェスト
├─ service-worker.js   # Service Worker
├─ package.json        # 価格更新スクリプト用
├─ css/
│  ├─ style.css / components.css / chart.css
├─ js/
│  ├─ app.js / game-state.js / signals.js / trade.js
│  ├─ chart.js / judgment.js / storage.js / notifications.js
├─ data/
│  ├─ scenarios.js            # 自動生成(手編集しない)
│  ├─ scenario-templates.js   # シグナルテンプレート(source of truth)
│  └─ price-baselines.json    # 基準価格(update-prices.js が更新)
├─ scripts/
│  ├─ update-prices.js        # 価格取得 + scenarios.js 再生成
│  ├─ regenerate-scenarios.js # シナリオ再生成(単体でも使える)
│  └─ generate-icons.mjs      # アイコン一括生成
└─ assets/
   ├─ logo.svg / favicon.svg
   └─ icons/          # PWA 各サイズ + iOS splash
```

## 🚀 ローカル起動

```bash
cd rainbow-trial
npm run dev
# → http://localhost:8000/welcome.html
```

## 🔄 価格の週次更新

```bash
# 価格取得 + scenarios.js 再生成
npm run update-prices

# 確認後にデプロイ
npm run deploy
```

または 1 コマンドで:

```bash
npm run update-prices && npm run deploy
```

API 取得失敗時は前回値を維持して警告表示(デプロイは可能)。

## 🗺️ 開発フェーズ

### Phase 1(リリース済み)
コア機能: ウェルカム / ホーム / シグナル配信 / チャート判定 / エントリー / ポジション管理 / 結果 / 履歴 / Day1〜Day7(70 シグナル)

### Phase 2(本バージョン 2.0.0)
- ✅ PWA 化(オフライン完全対応、ホーム画面追加、アイコン各サイズ)
- ✅ ブラウザ通知(Web Notification API、レアリティ別挙動)
- ✅ 通知設定画面(⚙️ から開く)
- ✅ 価格週次バッチ(`npm run update-prices` で CoinGecko + open.er-api.com)
- ✅ デバッグメニュー(Konami Code ↑↑↓↓←→←→BA、モバイルはロゴ 5 連タップ)

### Phase 3(予定)
レベル/XP/アチーブメント / デイリーミッション / 演出強化 / サロンマスターメッセージ / Day7 最終画面 / LINE 誘導

## 🔧 デバッグメニュー

- **PC**: Konami Code(↑↑↓↓←→←→BA)
- **モバイル**: ヘッダーのロゴを 5 回連続タップ

機能:
- 次のシグナルを今すぐ受信 / Day 進行・巻戻し
- テスト通知の発火 / Service Worker 状況確認 / PWA インストール状況
- 価格基準値の表示 / 全データリセット

## 🌈 Rainbow Project シリーズ

- [rainbow-fxkit](https://github.com/masato-collab/rainbow-fxkit) — FX 初心者向けツール配布サイト
- **rainbow-trial**(本アプリ)

## 📜 ライセンス

本アプリは疑似体験用に制作されたものであり、実際の投資判断の代替ではありません。
