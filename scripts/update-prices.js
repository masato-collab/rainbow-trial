#!/usr/bin/env node
/* ==========================================================================
 * Rainbow Trial — scripts/update-prices.js
 * 週次/月次バッチ。現時点の USD/JPY と BTC/USD 価格を取得し、
 * data/price-baselines.json を更新して scenarios.js を再生成する。
 *
 * 使い方:
 *   npm run update-prices
 *
 * エラー方針:
 *   - API 失敗時は前回値を維持して警告表示、exit 0(デプロイは可能)
 *   - ネット不通時は exit 1(デプロイ中止)
 *   - レスポンス形式異常は前回値維持、警告
 * ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regenerate } from './regenerate-scenarios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINES_PATH = resolve(ROOT, 'data/price-baselines.json');

const API = {
  BTCUSD: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
  USDJPY: 'https://open.er-api.com/v6/latest/USD'
};

const TIMEOUT_MS = 10000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBtcUsd() {
  const data = await fetchJson(API.BTCUSD);
  const v = data?.bitcoin?.usd;
  if (typeof v !== 'number') throw new Error('unexpected BTC response');
  return v;
}

async function fetchUsdJpy() {
  const data = await fetchJson(API.USDJPY);
  const v = data?.rates?.JPY;
  if (typeof v !== 'number') throw new Error('unexpected USDJPY response');
  return v;
}

function loadBaselines() {
  if (!existsSync(BASELINES_PATH)) return null;
  try { return JSON.parse(readFileSync(BASELINES_PATH, 'utf8')); }
  catch { return null; }
}

function saveBaselines(b) {
  writeFileSync(BASELINES_PATH, JSON.stringify(b, null, 2) + '\n');
}

function fmt(n, d) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

async function main() {
  const prev = loadBaselines();
  if (!prev) {
    console.error('❌ price-baselines.json が存在しません。Step 4 で初期化してください。');
    process.exit(1);
  }

  const next = JSON.parse(JSON.stringify(prev));
  const warnings = [];

  // BTC/USD
  try {
    const btc = await fetchBtcUsd();
    next.BTCUSD = { current: Math.round(btc * 100) / 100, fetchedAt: new Date().toISOString() };
    console.log(`  BTC/USD: ${fmt(prev.BTCUSD?.current ?? 0, 2)} → ${fmt(next.BTCUSD.current, 2)}`);
  } catch (e) {
    warnings.push(`BTCUSD 取得失敗: ${e.message}(前回値維持)`);
    console.warn(`  ⚠️ BTCUSD: ${e.message}(前回値 ${fmt(prev.BTCUSD?.current ?? 0, 2)} を維持)`);
  }

  // USD/JPY
  try {
    const jpy = await fetchUsdJpy();
    next.USDJPY = { current: Math.round(jpy * 1000) / 1000, fetchedAt: new Date().toISOString() };
    console.log(`  USD/JPY: ${fmt(prev.USDJPY?.current ?? 0, 3)} → ${fmt(next.USDJPY.current, 3)}`);
  } catch (e) {
    warnings.push(`USDJPY 取得失敗: ${e.message}(前回値維持)`);
    console.warn(`  ⚠️ USDJPY: ${e.message}(前回値 ${fmt(prev.USDJPY?.current ?? 0, 3)} を維持)`);
  }

  next.lastUpdated = new Date().toISOString();
  saveBaselines(next);

  // scenarios.js を再生成
  const { count } = regenerate();

  console.log('');
  console.log('✅ 価格更新完了');
  console.log(`   生成シナリオ数: ${count}件`);
  console.log(`   最終更新: ${next.lastUpdated}`);
  if (warnings.length > 0) {
    console.log('');
    console.log('⚠️  警告:');
    warnings.forEach(w => console.log(`   - ${w}`));
  }
}

main().catch(err => {
  console.error('❌ 致命的エラー:', err.message);
  process.exit(1);
});
