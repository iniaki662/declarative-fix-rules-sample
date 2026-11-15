#!/usr/bin/env node
// 验收脚本 2：外部调用超时不得静默丢弃该轮。
//
// 判据来源：
//   - 超时分支必须返回带 outcome 的可判读数；
//   - 静默返回 null 的缺陷形态必须清零。
//
// 用法：node verify/verify-remote-call-timeout-readout.mjs <targetDir>

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { locateByMarks, countOf, report } from '../src/verify-lib.mjs';

const targetDir = resolve(process.argv[2] ?? 'fixture');
const ok = [];

function assert(name, cond, extra) {
  ok.push({ name, pass: !!cond, extra });
}

const chunkDir = join(targetDir, 'chunks');
if (!existsSync(chunkDir)) {
  console.log(`FAIL  verify-remote-call-timeout-readout  目标目录不存在: ${chunkDir}`);
  process.exit(1);
}

const { file, src } = locateByMarks(chunkDir, ['callTimeout', 'abortSignal', 'callOutcome']);

assert('定位到外部调用目标文件', !!file, { file });

if (file) {
  assert(
    'timeout-outcome-declared',
    src.includes('outcome:"remote_timeout"'),
    { hits: countOf(src, 'outcome:"remote_timeout"') },
  );
  assert(
    'timeout-observable-flag',
    src.includes('observable:true'),
    { hits: countOf(src, 'observable:true') },
  );
  assert(
    'silent-null-cleared',
    countOf(src, 'if (signal.aborted) return null;') === 0,
    { residual: countOf(src, 'if (signal.aborted) return null;') },
  );
}

process.exit(report(ok, 'verify-remote-call-timeout-readout', ok) ? 0 : 1);
