# 声明式修复规则与行为级验收框架（可公开样例）

[![CI](https://github.com/iniaki662/declarative-fix-rules-sample/actions/workflows/ci.yml/badge.svg)](https://github.com/iniaki662/declarative-fix-rules-sample/actions/workflows/ci.yml)

面向**运行时目标**的声明式修复机制，以及配套的离线行为级验收方法。

本仓库是一个**自造样例**：目标代码是本仓库 `fixture-pristine/` 下的原创演示文件，
不含任何第三方发行件的字节、符号名或版本号，可自由公开、修改、再分发。

它的作用是展示一套方法，而非分发某个具体产品的规则集：

> 把故障修复拆成「规则声明 + 离线验收脚本 + 变更记录」三部分。
> 修复前先写能复现该缺陷的离线脚本；脚本通过才判定修复生效。

## 目录结构

```
src/rules.json          示范规则集（3 条）
src/apply.mjs            规则应用器：定位 → 计划 → 快照 → 落盘 → 逆序回滚
src/verify-lib.mjs       验收判据库：已应用形态判定（形态 A / B / C）
verify/*.mjs             行为级验收脚本（4 个）
criteria/                评测可信度披露器样例（6 项披露 + 字段契约）
fixture-pristine/        原初状态（缺陷形态）——演示的起点
fixture/                 演示工作区（由 reset 脚本从 pristine 重建）
demo.sh                  端到端演示脚本
package.json             仅用于 npm run 入口；零第三方依赖
.github/workflows/       CI：跑完 demo.sh 与 criteria/demo.mjs
```

## 一分钟跑通

```bash
npm run demo        # 规则应用 + 验收六段演示（等价于 bash demo.sh）
npm run criteria    # 评测可信度披露器样例
npm test            # 两者都跑
```

也可以直接用 node（无 npm 也可）：

```bash
bash demo.sh            # 规则应用 + 验收六段演示
node criteria/demo.mjs  # 评测可信度披露器样例
```

要求：Node.js ≥ 18。**无任何第三方依赖**，只用 Node 内置模块。

输出依次为六段：

| 步骤 | 期望结果 |
|---|---|
| 0 | 重置到缺陷形态 |
| 1 | **全部验收失败**（缺陷可被离线复现） |
| 2 | 按声明顺序应用 3 条规则 |
| 3 | **全部验收通过**（修复生效） |
| 4 | 幂等复跑，全部 NOOP（不重复插入） |
| 5 | 逆序回滚，按快照清单还原 |
| 6 | **全部验收恢复失败**（回到缺陷形态） |

单独运行：

```bash
node verify/reset-fixture.mjs                 # 重置
node src/apply.mjs fixture src/rules.json     # 应用
node verify/verify-rules-shape.mjs fixture    # 验收（退出码 0 = 通过）
node src/apply.mjs --rollback fixture src/rules.json   # 回滚
```

## 三条设计约束

### 1. 语义定位，不靠文件名

规则用 `locator.mustContainAll` 声明目标文件必须含有的标记串：

```json
"locator": {
  "dir": "chunks",
  "mustContainAll": ["lastError", "hasError", "draftInput", "runtimeStatus"]
}
```

定位靠标记串匹配，不靠路径或文件名。目标被重新分块、改名后规则依然命中。
这是「规则不随版本改名失效」的实现方式。

### 2. find / replace 与 `appliedWhen` 的关系

验收发生在规则**已经落地**之后，因此判据不能写成「find 串还在目标里」——
落地后 find 必然消失。落地后的实际形态有三种：

| 形态 | 条件 | 判据 |
|---|---|---|
| A | `replace` 不含 `find` | `find` 计数归零 **且** `replace` 命中 |
| B | `replace` 以 `find` 为前缀 | `replace` 命中 **且** `appliedWhen` 标记命中 |
| C | edit 声明了 `migrate` | 新形态（`replace`）命中 **且** 旧形态（`migrate.from`）不再命中 |

形态 B 是 `appliedWhen` 存在的唯一理由：`replace` 以 `find` 为前缀时，
盘上的 `find` 是 `replace` 内部的正常残留，不能用计数归零判定。

`appliedWhen` 的语义是**「已应用标记」**，不是应用的前置条件：
标记串全部出现在目标里即视为该 edit 已生效并跳过。标记串必须由**该 edit 自己的
`replace`** 引入——挪用别的 edit 的标记会让本 edit 被误判为「已应用」而跳过。

标记与顺序无关，因此对「后打的规则改写了先打规则产出的文本」这种叠加是稳的。

### 3. 快照按内容寻址，回滚走清单

变更前对目标文件做快照，快照文件名是内容的 sha256——同一份内容只存一份。
快照链写入 `.snapshot/chain.json`，回滚据此还原，**不依赖进程内存态**：
重复执行或进程重启后仍可回滚到任一历史快照。

回滚按逆序执行（后进先出），与规则的声明顺序对应。

## 幂等性

同一条规则重复执行不产生重复插入。判定路径：

1. `migrate` 迁移先行（迁移的目标形态恰好就是 `appliedWhen` 标记所指形态，
   顺序反了迁移永远不会执行）；
2. `appliedWhen` 标记命中 ⇒ 判定已应用，跳过；
3. `find` 消失而 `replace` 在场 ⇒ 已应用；
4. `find` 被 `replace` 整体吸收 ⇒ 已应用；
5. 以上皆否 ⇒ 执行替换。

`find` 串必须规则应用前后逐字节相同，因此 `find` 只能取自目标原始形态。

## 严格性

`find` 串不唯一、或者 `replace` 串已与 `find` 串并存时，**拒绝动手并报错**，
不猜、不猜着改。这类情况意味着目标形态与预期不符，静默跳过会掩盖问题。

## 验收脚本的两种口径

- **行为级**（`verify-pending-phase-render` 等）：断言目标的可观察行为，
  不关心规则的字节形态。例如「挂起态必须被投影进相位机入参」。
- **形态级**（`verify-rules-shape`）：只回答「规则声明的已应用形态是否命中」，
  是行为级判据的基础设施。

两者分开的原因是：形态命中是**必要条件**，行为成立才是**目的**。
只有形态判据时，「规则打上了但行为没变」会漏判。

## 评测可信度披露器（`criteria/`）

给「模型输出是否成立」这个判定，提供一组必须随分数一起报出的披露项。

核心立场：**机会水平不是合理的对照**。留出集分布不均衡时，恒猜众数的准确率
可以远超机会水平，而一个只会输出众数的退化策略照样能拿到漂亮数字。
所以众数基线必须与分数同时披露，Δ 与 z 永远不足以单独支撑「学到了决策」。

6 项披露（封闭集，多一项就要改契约）：

| ID | 披露项 |
|---|---|
| D1 | 数据出处核对：自称的出处 vs 实际文件 |
| D2 | 留出集与训练集是否真的不相交 |
| D3 | 出处核对结论 |
| D4 | 众数基线（恒猜留出集里最常见的那个动作） |
| D5 | 标签来源构成与可达性 |
| D6 | 标签集可学性 |

两条硬约束：

- **出处不一致时不测重叠**。拿不相干的集合证明「没有重叠」比不报更危险，
  此时结论降级为 `not-measurable` 而不是 `clean`。
- **字段契约缺字段即报**，不允许静默补默认值。

样例数据刻意选了刺眼的情形：准确率 35.83%，众数基线 46.25%（比恒猜还低
10.4 个百分点），而对随机机会水平的 z 是 +19.7 —— 只看 z 会把一个劣于恒猜的
退化策略读成「学到了决策」。这正是众数基线必须与 z 同时披露的由来。

## 许可

MIT，见 LICENSE。

`package.json` 里的 `private: true` 只是 npm 的发布保护（阻止 `npm publish`
误把本样例发到公共 registry），与本仓库的公开性无关。
