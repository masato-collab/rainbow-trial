/* ==========================================================================
 * Rainbow Trial — scripts/regenerate-scenarios.js
 * scenario-templates.js + price-baselines.json から
 * data/scenarios.js の SIGNAL_META ブロックを生成して差し込む。
 *
 * update-prices.js から呼ばれる。単体でも `node scripts/regenerate-scenarios.js`
 * で再生成のみ実行可能(価格 API は叩かない)。
 * ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PAIR_CONFIG = {
  USDJPY: { pipSize: 0.01, decimals: 3 },
  BTCUSD: { pipSize: 1.0,  decimals: 1 }
};

/** data/scenario-templates.js を vm サンドボックスで評価して TEMPLATES を取り出す
 *  (package.json が "type": "module" のため require() は使えない) */
function loadTemplates() {
  const path = resolve(ROOT, 'data/scenario-templates.js');
  const src = readFileSync(path, 'utf8');
  // IIFE は window/module.exports のどちらかに振り分けるので、
  // module を用意しておけば module.exports 側に格納される
  const sandbox = { module: { exports: {} }, window: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: path });
  const t = sandbox.module.exports?.SCENARIO_TEMPLATES;
  if (!t) throw new Error('SCENARIO_TEMPLATES not exported from templates file');
  return t;
}

function loadBaselines() {
  const json = readFileSync(resolve(ROOT, 'data/price-baselines.json'), 'utf8');
  return JSON.parse(json);
}

function round(v, d) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

/**
 * template + baseline から 1 シグナル分の絶対値オブジェクトを作る
 */
export function materializeSignal(t, baseline, day) {
  const conf = PAIR_CONFIG[t.pair];
  if (!conf) throw new Error('unknown pair: ' + t.pair);
  const dir = t.direction === 'long' ? 1 : -1;

  const entry = round(baseline + t.entryRelative, conf.decimals);
  // SL は direction と逆方向に slPips 分
  const sl = round(entry - dir * t.slPips * conf.pipSize, conf.decimals);
  // TP は RR 1.6 で enrichSignal が最終的に再計算するが、
  // scenarios.js の SIGNAL_META に入れる参考値は slPips × 1.6 で算出
  const tpPips = Math.round(t.slPips * 1.6);
  const tp = round(entry + dir * tpPips * conf.pipSize, conf.decimals);

  return {
    id: t.id,
    day,
    number: t.number,
    relativeTime: t.relativeTime,
    pair: t.pair,
    direction: t.direction,
    entry, tp, sl,
    rarity: t.rarity,
    chartCondition: t.chartCondition,
    result: t.result,
    duration: t.duration
  };
}

/** SIGNAL_META 配列全体を生成 */
export function buildSignalMeta(templates, baselines) {
  const meta = [];
  for (const dayKey of ['day1','day2','day3','day4','day5','day6','day7']) {
    const day = parseInt(dayKey.replace('day', ''), 10);
    const list = templates[dayKey] || [];
    for (const t of list) {
      const base = baselines[t.pair]?.current;
      if (base == null) throw new Error('no baseline for ' + t.pair);
      meta.push(materializeSignal(t, base, day));
    }
  }
  meta.sort((a, b) => a.id - b.id);
  return meta;
}

/** SIGNAL_META を source code 文字列に整形(scenarios.js スタイル) */
export function formatSignalMeta(meta) {
  const lines = ['  const SIGNAL_META = ['];
  const daySeen = new Set();
  for (let i = 0; i < meta.length; i++) {
    const s = meta[i];
    if (!daySeen.has(s.day)) {
      if (daySeen.size > 0) lines.push('');
      lines.push(`    /* ---- Day ${s.day} ---- */`);
      daySeen.add(s.day);
    }
    const entry = s.entry.toFixed(PAIR_CONFIG[s.pair].decimals);
    const tp    = s.tp.toFixed(PAIR_CONFIG[s.pair].decimals);
    const sl    = s.sl.toFixed(PAIR_CONFIG[s.pair].decimals);
    const dirPad = s.direction === 'long' ? 'long, ' : 'short,';
    const comma = i === meta.length - 1 ? '' : ',';
    lines.push(
      `    { id: ${String(s.id).padStart(2)}, day: ${s.day}, number: ${s.number}, relativeTime: ${String(s.relativeTime).padStart(4)},`
    );
    lines.push(
      `      pair: '${s.pair}', direction: '${s.direction}', entry: ${entry}, tp: ${tp}, sl: ${sl},`
    );
    lines.push(
      `      rarity: '${s.rarity}', chartCondition: '${s.chartCondition}', result: '${s.result}', duration: ${s.duration} }${comma}`
    );
  }
  lines.push('  ];');
  return lines.join('\n');
}

/** scenarios.js の SIGNAL_META ブロックを差し替える */
export function injectSignalMeta(scenariosSrc, metaSrc) {
  const re = /\/\* BEGIN:SIGNAL_META[^*]*\*\/[\s\S]*?\/\* END:SIGNAL_META \*\//;
  if (!re.test(scenariosSrc)) {
    throw new Error('SIGNAL_META marker block not found in scenarios.js');
  }
  const block = '/* BEGIN:SIGNAL_META (auto-generated) */\n' + metaSrc + '\n  /* END:SIGNAL_META */';
  return scenariosSrc.replace(re, block);
}

export function regenerate() {
  const templates = loadTemplates();
  const baselines = loadBaselines();
  const meta = buildSignalMeta(templates, baselines);
  const metaSrc = formatSignalMeta(meta);

  const scenariosPath = resolve(ROOT, 'data/scenarios.js');
  const src = readFileSync(scenariosPath, 'utf8');
  const out = injectSignalMeta(src, metaSrc);
  writeFileSync(scenariosPath, out);
  return { count: meta.length, baselines };
}

// 単体実行時
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('regenerate-scenarios.js')) {
  const { count, baselines } = regenerate();
  console.log(`✅ scenarios.js 再生成: ${count} シグナル`);
  for (const [pair, v] of Object.entries(baselines)) {
    if (pair === 'lastUpdated') continue;
    console.log(`   ${pair}: ${v.current}`);
  }
}
