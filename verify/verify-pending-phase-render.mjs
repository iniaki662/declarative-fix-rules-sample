#!/usr/bin/env node
// 验收脚本 1：挂起阶段不得退化成整行空白的死界面。
//
// 判据来源（行为级，非形态比对）：
//   - 挂起状态必须被投影进相位机入参；
//   - 空白行分支必须带「非挂起态」限定；
//   - 挂起态标记必须命中。
//
// 用法：node verify/verify-pending-phase-render.mjs <targetDir>

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
  console.log(`FAIL  verify-pending-phase-render  目标目录不存在: ${chunkDir}`);
  process.exit(1);
}

const { file, src } = locateByMarks(chunkDir, [
  'lastError',
  'hasError',
  'draftInput',
  'runtimeStatus',
]);

assert('定位到渲染面板目标文件', !!file, { file });

if (file) {
  // 行为判据 1：挂起状态必须被投影进相位机入参
  assert(
    'pending-phase-projected',
    src.includes('pendingPhase:this.banner?.task?.status==="pending"'),
    { hits: countOf(src, 'pendingPhase:this.banner?.task?.status==="pending"') },
  );

  // 行为判据 2：空白行分支必须受「非挂起态」限定，不得无条件触发
  assert(
    'blank-row-guarded',
    src.includes('this.state.hasError && !this.state.pendingPhase'),
    { hits: countOf(src, 'this.state.hasError && !this.state.pendingPhase') },
  );

  // 行为判据 3：缺陷形态必须已消失（无条件空白行分支计数归零）
  assert(
    'unguarded-blank-row-cleared',
    countOf(src, 'if (this.state.hasError) return this.renderBlankRow();') === 0,
    { residual: countOf(src, 'if (this.state.hasError) return this.renderBlankRow();') },
  );
}

process.exit(report(ok, 'verify-pending-phase-render', ok) ? 0 : 1);
