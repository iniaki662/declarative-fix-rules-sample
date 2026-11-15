#!/usr/bin/env node
// 验收脚本 3：槽位持有进程失活必须按状态机回收。
//
// 用法：node verify/verify-slot-owner-liveness.mjs <targetDir>

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
  console.log(`FAIL  verify-slot-owner-liveness  目标目录不存在: ${chunkDir}`);
  process.exit(1);
}

const { file, src } = locateByMarks(chunkDir, ['ownerPid', 'livenessProbe', 'slotState']);

assert('定位到槽位注册表目标文件', !!file, { file });

if (file) {
  assert(
    'dead-owner-reclaimed',
    src.includes('task.slotState="reclaimed_dead_owner"'),
    { hits: countOf(src, 'reclaimed_dead_owner') },
  );
  assert(
    'alive-owner-unchanged',
    src.includes('if (owner.livenessProbe.isAlive()) return task.slotState;'),
    { hits: countOf(src, 'if (owner.livenessProbe.isAlive()) return task.slotState;') },
  );
}

process.exit(report(ok, 'verify-slot-owner-liveness', ok) ? 0 : 1);
