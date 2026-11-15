#!/usr/bin/env node
// 评测可信度披露器 —— 端到端样例。
//
// 演示三件事：
//   1. 众数基线必须与分数同时披露：分数漂亮但只比恒猜众数高一点，
//      仅看 Δ 与 z 会误判「学到了决策」。
//   2. 出处不一致时不测留出集重叠：拿不相干的集合证明「没有重叠」比不报更危险。
//   3. 字段契约校验：缺字段即报，不静默补默认值。
//
// 用法：node criteria/demo.mjs

import {
  DISCLOSURE_IDS,
  DISCLOSURE_FIELDS,
  buildDisclosureReport,
} from './disclosure.mjs';
import {
  EVAL_ROWS,
  TRAIN_PRINTS,
  TOTAL_ACTIONS,
  MODEL_ACCURACY,
  RECORDED_PROVENANCE,
  ACTUAL_PROVENANCE,
  MISMATCHED_ACTUAL_PROVENANCE,
} from './sample-data.mjs';

const ok = [];
function assert(name, cond, extra) {
  ok.push({ name, pass: !!cond, extra });
}

console.log('══ 情形一：出处一致，正常留出集 ══\n');

const normal = buildDisclosureReport({
  evalRows: EVAL_ROWS,
  trainPrints: TRAIN_PRINTS,
  recorded: RECORDED_PROVENANCE,
  actual: ACTUAL_PROVENANCE,
  accuracy: MODEL_ACCURACY,
  totalActions: TOTAL_ACTIONS,
});

for (const id of DISCLOSURE_IDS) {
  const d = normal.disclosures[id];
  console.log(`  ${id}`);
  for (const [k, v] of Object.entries(d)) {
    console.log(`      ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
}
console.log();

// 情形一的判据断言
assert('众数基线份额接近 46.25%',
  Math.abs(normal.disclosures['D4-majority-baseline'].majorityShare - 0.4625) < 0.005,
  { share: normal.disclosures['D4-majority-baseline'].majorityShare });

assert('众数基线动作是 3',
  normal.disclosures['D4-majority-baseline'].majorityAction === 3,
  { action: normal.disclosures['D4-majority-baseline'].majorityAction });

assert('分数比恒猜众数低约 10.4 个百分点',
  Math.abs(normal.disclosures['D4-majority-baseline'].deltaVsMajority + 0.1042) < 0.002,
  { delta: normal.disclosures['D4-majority-baseline'].deltaVsMajority });

assert('但 z 值对随机显著为正 ⇒ 只看 z 会误判',
  normal.disclosures['D4-majority-baseline'].zVsChance > 2,
  { z: normal.disclosures['D4-majority-baseline'].zVsChance });

assert('z 大而 Δ 为负：统计显著 ≠ 策略有效',
  normal.disclosures['D4-majority-baseline'].zVsChance > 2
  && normal.disclosures['D4-majority-baseline'].deltaVsMajority < 0,
  {
    z: normal.disclosures['D4-majority-baseline'].zVsChance,
    delta: normal.disclosures['D4-majority-baseline'].deltaVsMajority,
  });

assert('留出集与训练集不相交',
  normal.disclosures['D2-holdout-disjoint'].measuredOverlapRows === 0,
  { overlap: normal.disclosures['D2-holdout-disjoint'].measuredOverlapRows });

assert('出处核对为 matched',
  normal.disclosures['D1-provenance'].status === 'matched',
  { status: normal.disclosures['D1-provenance'].status });

assert('结论为 clean',
  normal.disclosures['D3-outcome-check'].verdict === 'clean',
  { verdict: normal.disclosures['D3-outcome-check'].verdict });

assert('标签集可学性判为 partially-learnable（来源只覆盖 4/17 类动作）',
  normal.disclosures['D6-label-learnability'].verdict === 'partially-learnable',
  { verdict: normal.disclosures['D6-label-learnability'].verdict });

assert('字段契约全部满足',
  normal.contractSatisfied && normal.missingFields.length === 0,
  { missing: normal.missingFields });

console.log('══ 情形二：出处不一致 ══\n');

const mismatched = buildDisclosureReport({
  evalRows: EVAL_ROWS,
  trainPrints: TRAIN_PRINTS,
  recorded: RECORDED_PROVENANCE,
  actual: MISMATCHED_ACTUAL_PROVENANCE,
  accuracy: MODEL_ACCURACY,
  totalActions: TOTAL_ACTIONS,
});

console.log(`  D1.status: ${mismatched.disclosures['D1-provenance'].status}`);
console.log(`  D1.mismatchedFields: ${JSON.stringify(mismatched.disclosures['D1-provenance'].mismatchedFields)}`);
console.log(`  D2.measuredOverlapRows: ${mismatched.disclosures['D2-holdout-disjoint'].measuredOverlapRows}`);
console.log(`  D2.comparable: ${mismatched.disclosures['D2-holdout-disjoint'].comparable}`);
console.log(`  D3.verdict: ${mismatched.disclosures['D3-outcome-check'].verdict}`);
console.log();

assert('出处核对为 mismatched',
  mismatched.disclosures['D1-provenance'].status === 'mismatched',
  { status: mismatched.disclosures['D1-provenance'].status });

assert('出处不一致时不测重叠（不报假的无重叠）',
  mismatched.disclosures['D2-holdout-disjoint'].measuredOverlapRows === null
  && mismatched.disclosures['D2-holdout-disjoint'].comparable === false,
  { d2: mismatched.disclosures['D2-holdout-disjoint'] });

assert('结论降级为 not-measurable 而非 clean',
  mismatched.disclosures['D3-outcome-check'].verdict === 'not-measurable',
  { verdict: mismatched.disclosures['D3-outcome-check'].verdict });

assert('字段契约仍然满足（缺失用 null 而非缺字段）',
  mismatched.contractSatisfied,
  { missing: mismatched.missingFields });

// ── 汇总 ─────────────────────────────────────────────────────
console.log();
const failed = ok.filter((o) => !o.pass);
if (failed.length === 0) {
  console.log(`PASS  评测可信度披露器  (断言 ${ok.length} 条)`);
  process.exit(0);
}
console.log('FAIL  评测可信度披露器');
for (const f of failed) console.log(`  - ${f.name}  ${JSON.stringify(f.extra ?? {})}`);
console.log(`  失败 ${failed.length}/${ok.length} 条断言`);
process.exit(1);
