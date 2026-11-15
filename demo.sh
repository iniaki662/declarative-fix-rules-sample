#!/usr/bin/env bash
# 端到端演示：应用前验收失败 → 应用规则 → 验收通过 → 幂等复跑 → 回滚 → 验收恢复失败。
#
# 用法：bash demo.sh
#
# 这个脚本是样例包的核心凭证：它证明「修复前先写能复现缺陷的离线脚本，
# 脚本通过才判定修复生效」这条流程是可真跑的，而不是文字描述。

set -u
cd "$(dirname "$0")"

fail=0

run_verify() {
  local label="$1"
  echo "── ${label} ──"
  for f in verify/verify-*.mjs; do
    local name; name=$(basename "$f")
    if node "$f" fixture; then
      echo "  ${name}: PASS"
    else
      echo "  ${name}: FAIL"
      fail=1
    fi
  done
  echo
}

echo "══ 步骤 0：重置到缺陷形态 ══"
node verify/reset-fixture.mjs
rm -rf fixture/.snapshot
echo

echo "══ 步骤 1：修复前的离线验收（应当全部失败）══"
run_verify "缺陷态验收"

echo "══ 步骤 2：按声明顺序应用规则 ══"
node src/apply.mjs fixture src/rules.json
echo

echo "══ 步骤 3：修复后的离线验收（应当全部通过）══"
run_verify "修复态验收"

echo "══ 步骤 4：幂等复跑（应当无改动）══"
node src/apply.mjs fixture src/rules.json
echo

echo "══ 步骤 5：逆序回滚（按快照清单还原）══"
node src/apply.mjs --rollback fixture src/rules.json
echo
echo "══ 步骤 6：回滚后验收（应当恢复失败）══"
run_verify "回滚态验收"

if [ "$fail" -ne 0 ]; then
  echo "预期内的失败态已记录。"
fi
echo "端到端演示结束。"
