#!/usr/bin/env node
/* ==========================================================================
 * Rainbow Trial — scripts/generate-icons.mjs
 * assets/icons/icon-source.svg から PWA 用の各サイズ PNG を生成する。
 *   - 通常アイコン 8 サイズ(72..512)
 *   - maskable アイコン 2 サイズ(192, 512)
 *   - apple-touch-icon-180
 *   - iOS スプラッシュスクリーン 6 サイズ
 * ========================================================================== */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC  = resolve(ROOT, 'assets/icons/icon-source.svg');
const DIR  = resolve(ROOT, 'assets/icons');
const SPLASH = resolve(DIR, 'splash');

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
if (!existsSync(SPLASH)) mkdirSync(SPLASH, { recursive: true });

const BG = '#0F1419';  // --bg-primary

const REGULAR = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE = [192, 512];

/* maskable アイコンは中央 80% に収める必要がある(セーフエリア) */
async function renderMaskable(size, outPath) {
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  const iconSvg = readFileSync(SRC, 'utf8');
  const icon = await sharp(Buffer.from(iconSvg)).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG
    }
  })
    .composite([{ input: icon, top: offset, left: offset }])
    .png()
    .toFile(outPath);
}

async function renderRegular(size, outPath) {
  const svg = readFileSync(SRC, 'utf8');
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(outPath);
}

/* iOS スプラッシュ: 中央にロゴ、上下は背景色 */
async function renderSplash(w, h, outPath) {
  const logoSize = Math.min(w, h) * 0.45;
  const svg = readFileSync(SRC, 'utf8');
  const logo = await sharp(Buffer.from(svg))
    .resize(Math.round(logoSize), Math.round(logoSize))
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: BG
    }
  })
    .composite([{
      input: logo,
      top: Math.round((h - logoSize) / 2),
      left: Math.round((w - logoSize) / 2)
    }])
    .png()
    .toFile(outPath);
}

const SPLASHES = [
  [2048, 2732],  // iPad Pro 12.9
  [1668, 2388],  // iPad Pro 11
  [1536, 2048],  // iPad
  [1125, 2436],  // iPhone X/XS/11 Pro
  [ 828, 1792],  // iPhone XR/11
  [ 750, 1334]   // iPhone 6/7/8
];

async function main() {
  const tasks = [];

  for (const s of REGULAR) {
    tasks.push(renderRegular(s, resolve(DIR, `icon-${s}.png`)).then(() => `icon-${s}.png`));
  }
  for (const s of MASKABLE) {
    tasks.push(renderMaskable(s, resolve(DIR, `icon-maskable-${s}.png`)).then(() => `icon-maskable-${s}.png`));
  }
  tasks.push(renderRegular(180, resolve(DIR, 'apple-touch-icon-180.png')).then(() => 'apple-touch-icon-180.png'));

  for (const [w, h] of SPLASHES) {
    tasks.push(renderSplash(w, h, resolve(SPLASH, `splash-${w}x${h}.png`)).then(() => `splash/splash-${w}x${h}.png`));
  }

  const results = await Promise.all(tasks);
  console.log(`✅ 生成完了: ${results.length} ファイル`);
  results.forEach(f => console.log(`   - assets/icons/${f}`));
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
