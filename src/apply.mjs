// 规则应用器：按声明顺序执行规则，逐文件做内容寻址快照，支持逆序回滚。
//
// 快照按内容寻址（sha256），同一份内容只存一份；回滚时按快照内容还原。
// 快照写入 .snapshot/ 目录，与目标分开放置。
//
// 本文件的判定顺序为：迁移 → 已应用标记 → find/replace 变体，
// 以保证幂等：同一规则重复执行不产生重复插入。

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

// find 是否已被 replace 整体吸收（即盘上的 find 全部来自 replace 内部）。
// 判定：replace 必须包含 find，且盘上已存在 replace，且剔除全部 replace 后
// 不再有独立 find —— 此时盘上的 find 只是 replace 内部的正常残留。
function findFullyAbsorbedByReplace(src, find, replace) {
  if (!find || !replace) return false;
  if (!replace.includes(find)) return false;
  if (countOccurrences(src, replace) === 0) return false;
  const rest = src.split(replace).join('');
  return countOccurrences(rest, find) === 0;
}

// 「已应用标记」：标记串全部出现在目标里时，该 edit 视为已应用，直接跳过。
// 标记与顺序无关，故对「后打的规则改写了先打规则产出的文本」这种叠加是稳的。
export function appliedWhenSatisfied(edit, src) {
  const markers = edit.appliedWhen ?? [];
  if (markers.length === 0) return false;
  return markers.every((m) => src.includes(m));
}

// 在目标目录内按 locator 语义定位唯一文件。
export function locate(targetDir, locator) {
  const dir = join(targetDir, locator?.dir ?? '.');
  if (!existsSync(dir)) return { file: null, src: '' };
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    if ((locator?.mustContainAll ?? []).every((m) => src.includes(m))) {
      return { file: join(dir, f), src };
    }
  }
  return { file: null, src: '' };
}

// 演算单条 edits 规则，返回应用后的源码与明细。
export function planEdits(rule, src) {
  let out = src;
  const detail = [];
  let changed = false;

  for (const e of rule.edits ?? []) {
    // 迁移先于「已应用」判定：迁移的目标形态恰好就是 appliedWhen 标记所指
    // 的形态，顺序反了迁移就永远不会执行。
    for (const m of e.migrate ?? []) {
      const c = countOccurrences(out, m.from);
      if (c === 0) continue;
      if (c > 1) throw new Error(`rule ${rule.id} edit ${e.id}: migrate.from 不唯一 (${c})`);
      out = out.replace(m.from, m.to);
      changed = true;
      detail.push({ id: e.id, state: 'migrated' });
    }

    // 已应用标记命中 ⇒ 跳过（幂等）
    if (appliedWhenSatisfied(e, out)) {
      detail.push({ id: e.id, state: 'already-applied' });
      continue;
    }

    const findCount = countOccurrences(out, e.find);
    const replCount = countOccurrences(out, e.replace);

    // find 已消失而 replace 在场 ⇒ 该形态已应用
    if (findCount === 0 && replCount > 0) {
      detail.push({ id: e.id, state: 'already-applied-by-shape' });
      continue;
    }
    // find 被 replace 整体吸收 ⇒ 已应用
    if (replCount > 0 && findFullyAbsorbedByReplace(out, e.find, e.replace)) {
      detail.push({ id: e.id, state: 'already-applied-by-absorption' });
      continue;
    }
    if (findCount === 0) {
      detail.push({ id: e.id, state: 'not-found' });
      continue;
    }
    if (findCount > 1) {
      throw new Error(`rule ${rule.id} edit ${e.id}: find 串不唯一 (${findCount})`);
    }
    if (replCount > 0) {
      throw new Error(`rule ${rule.id} edit ${e.id}: replace 串已与 find 串并存`);
    }
    out = out.split(e.find).join(e.replace);
    changed = true;
    detail.push({ id: e.id, state: 'applied' });
  }

  return { src: out, changed, detail };
}

// 主流程：应用全部规则 → 逐次快照 → 落盘。返回可回滚的快照链。
//
// 快照链写入 .snapshot/chain.json：记录每个被改文件的「原始内容哈希 → 快照路径」。
// 回滚据此还原，不依赖本次运行的内存态 —— 重复执行或进程重启后仍可回滚。
//
// 清单按文件去重，且只保留该文件【最早】的那份快照（它的内容才是原初态）。
// 同一文件被多条规则先后改过时，后写入的快照是中间态，不能用于回滚。
export function applyAll(targetDir, rules, snapshotDir) {
  mkdirSync(snapshotDir, { recursive: true });
  const chain = [];
  const manifestPath = join(snapshotDir, 'chain.json');
  let manifest = { entries: [] };
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      manifest = { entries: [] };
    }
  }

  for (const rule of rules) {
    const { file, src } = locate(targetDir, rule.locator);
    if (!file) {
      console.log(`SKIP    ${rule.id}  未定位到目标文件`);
      continue;
    }
    const { src: next, changed, detail } = planEdits(rule, src);
    if (!changed) {
      console.log(`NOOP    ${rule.id}  ${detail.map((d) => `${d.id}:${d.state}`).join(',')}`);
      continue;
    }
    const hash = sha256(Buffer.from(src, 'utf8'));
    const snap = join(snapshotDir, `${hash}.snap`);
    if (!existsSync(snap)) writeFileSync(snap, src, 'utf8');
    writeFileSync(file, next, 'utf8');
    chain.push({ ruleId: rule.id, file, hash, snapshot: snap });
    // 清单里存相对路径，避免把本机绝对路径写进产物。
    // 同一文件只记最早那份快照（= 原初态）；后写入的是中间态。
    const relFile = relative(targetDir, file);
    if (!manifest.entries.some((e) => e.file === relFile)) {
      manifest.entries.push({
        file: relFile,
        hash,
        snapshot: relative(targetDir, snap),
      });
    }
    console.log(`APPLY   ${rule.id}  ->  ${file}`);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return chain;
}

// 逆序回滚：后进先出，逐个用快照还原。快照链来自磁盘清单，进程重启后仍可回滚。
// targetDir 是被改文件的根目录；清单里的路径相对于它。
export function rollbackAll(snapshotDir, targetDir) {
  const manifestPath = join(snapshotDir, 'chain.json');
  if (!existsSync(manifestPath)) {
    console.log('无快照清单，无需回滚。');
    return [];
  }
  const { entries } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const done = [];
  for (const step of [...entries].reverse()) {
    const snap = resolve(targetDir, step.snapshot);
    if (!existsSync(snap)) continue;
    const src = readFileSync(snap, 'utf8');
    writeFileSync(resolve(targetDir, step.file), src, 'utf8');
    done.push(step);
    console.log(`ROLLBACK ${step.file}`);
  }
  return done;
}

// CLI：node src/apply.mjs [--rollback] <targetDir> [rulesFile]
if (process.argv[1] && process.argv[1].endsWith('apply.mjs')) {
  const raw = process.argv.slice(2);
  const rollback = raw.includes('--rollback');
  const positional = raw.filter((a) => a !== '--rollback');
  const targetDir = resolve(positional[0] ?? join(HERE, '..', 'fixture'));
  const rulesFile = resolve(positional[1] ?? join(HERE, 'rules.json'));
  const snapshotDir = join(targetDir, '.snapshot');
  const { rules } = JSON.parse(readFileSync(rulesFile, 'utf8'));
  const chain = applyAll(targetDir, rules, snapshotDir);
  if (rollback) rollbackAll(snapshotDir, targetDir);
  console.log(`\n应用 ${chain.length} 条规则，快照目录：${snapshotDir}`);
}
