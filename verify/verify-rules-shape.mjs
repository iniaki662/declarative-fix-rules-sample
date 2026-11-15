#!/usr/bin/env node
// 通用形态验收：按规则集逐条判定「该规则是否已生效」。
//
// 这是 verify-lib 判据 A/B/C 的直接使用方 —— 行为级脚本针对具体缺陷，
// 本脚本只回答「规则声明的已应用形态是否在目标里命中」。
//
// 用法：node verify/verify-rules-shape.mjs <targetDir> [rulesFile]

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateByMarks, assertRuleShape, report } from '../src/verify-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const targetDir = resolve(process.argv[2] ?? 'fixture');
const rulesFile = resolve(process.argv[3] ?? join(HERE, '..', 'src', 'rules.json'));

const ok = [];
function assert(name, cond, extra) {
  ok.push({ name, pass: !!cond, extra });
}

if (!existsSync(rulesFile)) {
  console.log(`FAIL  verify-rules-shape  规则文件不存在: ${rulesFile}`);
  process.exit(1);
}

const { rules } = JSON.parse(readFileSync(rulesFile, 'utf8'));

for (const rule of rules) {
  const { file, src } = locateByMarks(join(targetDir, rule.locator?.dir ?? 'chunks'), rule.locator?.mustContainAll);
  assert(`定位:${rule.id}`, !!file, { file });
  if (file) {
    assertRuleShape(rule, src, (name, cond, extra) => assert(`${rule.id}/${name}`, cond, extra));
  }
}

process.exit(report(ok, 'verify-rules-shape', ok) ? 0 : 1);
