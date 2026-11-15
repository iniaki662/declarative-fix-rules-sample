#!/usr/bin/env node
// 重置 fixture 到「缺陷形态」原初状态，并清空快照目录。
//
// demo 需要可重复：每次演示都从同一原初状态出发，才能对照
// 「应用前验收失败 → 应用后验收通过 → 回滚后验收恢复失败」。
//
// 用法：node verify/reset-fixture.mjs

import { copyFileSync, rmSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '..');
const pristine = join(KIT, 'fixture-pristine');
const target = join(KIT, 'fixture');

if (!existsSync(pristine)) {
  console.error(`缺少原初状态目录: ${pristine}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, 'chunks'), { recursive: true });

// 复制原初状态下的全部目标文件（目录结构原样保留）。
for (const f of readdirSync(join(pristine, 'chunks'))) {
  if (!f.endsWith('.js')) continue;
  copyFileSync(join(pristine, 'chunks', f), join(target, 'chunks', f));
}

console.log('fixture 已重置到缺陷形态原初状态。');
