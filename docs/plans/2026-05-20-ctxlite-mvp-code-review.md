# Code Review: ctxlite MVP

- Date: 2026-05-20
- Design Input: docs/specs/2026-05-20-ctxlite-mvp-design.md
- Implementation Doc: docs/plans/2026-05-20-ctxlite-mvp-implementation.md
- Design Review: docs/plans/2026-05-20-ctxlite-mvp-design-review.md
- Reviewed Files: `src/cli.js`, `bin/ctxlite.js`, `test/cli.test.js`, `package.json`

## 1. 整体结论

- **PASS_WITH_NOTES**
- 一句话结论：实现与设计高度一致，设计评审 3 个 HIGH 项全部正确采纳，代码质量整洁；主要不足是测试覆盖面偏窄（4 个命令仅 3 个测试，doctor 零覆盖），以及 proposal 去重存在跨日失效风险。

## 2. 根因前提核对

- 设计文档 §3 明确标注"不需要根因分析"，实现文档 §2 结论为 `NOT_APPLICABLE`。
- 核对结果：**一致**。本项目是新工具 MVP，不依赖故障根因或成因判断，无前提失效风险。

## 3. 设计评审采纳核对

### HIGH-1: brief.md 重写前备份

- 设计修订：§5.3、§5.5 增加写入前备份到 `.ctx/.brief.prev.md`。
- 实现：`src/cli.js:155-157`，`copyFile(briefPath, join(ctxDir, ".brief.prev.md"))`。
- 条件守卫：仅在当前 brief 非空且内容变化时备份（避免备份空模板）。
- Doctor 检查：`src/cli.js:231-237`，对比当前与上一版行数，异常变短时警告。
- **核对结果：正确采纳。**

### HIGH-2: inbox.md 两段式结构与归档规则

- 设计修订：§5.5 定义 `## Pending` / `## Archived` 两段式结构。
- 实现：`parseInbox`（line 397）拆分两段，`archiveInbox`（line 419）将 pending 移入归档块，`splitArchiveBlocks`（line 432）按 `### timestamp` 切分，保留最近 20 个归档块（line 427）。
- **核对结果：正确采纳。**

### HIGH-3: Node.js 20+ 技术栈和分发方式

- 设计修订：§5.1 新增技术栈段落。
- 实现：`package.json` — `"type": "module"`（ESM）、`"engines": { "node": ">=20" }`、`"files"` 白名单、零运行时依赖。
- 验证：`npm pack --dry-run` 仅包含 `README.md`、`bin/ctxlite.js`、`package.json`、`src/cli.js`。
- **核对结果：正确采纳。**

### MEDIUM 项采纳

| 建议 | 实现位置 | 状态 |
|------|---------|------|
| 澄清 pack 与 brief.md 定位差异 | pack 输出 brief + git + inbox + proposal count（line 183-188） | 已采纳 |
| Proposal 哈希去重 | `digest()` SHA-256 + `appendDedupedProposals`（line 468-482） | 已采纳 |
| 模型环境变量缺失警告 | `modelEnvWarnings`（line 309-318） | 已采纳 |
| 最近 5 条 commit 信号 | `["log", "-5", "--oneline"]`（line 332） | 已采纳 |

## 4. 设计一致性评估

### 4.1 一致项

- **命令接口**：4 个命令（init/update/pack/doctor）及其参数与设计 §5.4 完全对齐。
- **文件协议**：init 创建的 8 个文件与设计 §5.4 列表完全吻合。
- **不覆盖策略**：init 使用 `existsSync` 跳过已有文件（line 94），与设计 §5.3 "不破坏用户已有文件"一致。
- **写入策略**：自动写入范围严格限于 brief/proposals/inbox，与设计 §5.5 一致。
- **错误处理**：非 git 环境降级（line 321-325）、模型未配置降级（规则式更新）、超长 brief 截断（line 367-374）均与设计 §5.6 对齐。
- **AGENT_CONTEXT.md 策略**：仅在 init 生成、update 不覆盖、doctor 检查存在性，与设计 §5.8 一致。
- **git 信号收集**：使用 `execFileSync` 调用 git CLI，收集 status/diff-stat/log，与设计 §5.2 一致。

### 4.2 偏离项

| 偏离 | 设计要求 | 实现行为 | 判断 |
|------|---------|---------|------|
| 超长 brief 处理 | §5.6 "自动二次压缩" | 直接截断加注释 | 合理简化——MVP 无模型调用，真正的压缩依赖模型 |
| `--no-diff-content` | §5.7 风险缓解提及 | 未实现 | 合理省略——MVP 不发送内容到模型 |
| config.yaml `sources`/`update` 段 | §5.4 配置示例 | 生成但未读取使用 | 见 MEDIUM-2 |

## 5. 主要发现

### CRITICAL
（无）

### HIGH

### [HIGH] 测试覆盖: doctor 命令零覆盖，多个设计验证场景缺失

**文件**: `test/cli.test.js`（全文）

**问题**: 当前仅 3 个测试覆盖 init、update、pack。设计文档 §6 验证计划列出 6 个验证维度，其中 doctor 命令完全无测试，`--dry-run`、`--notes`、错误路径（缺少 `.ctx/`）、brief 截断（`enforceLineBudget`）、非 git 环境降级等场景均未覆盖。

**影响**: doctor 是 MVP 四命令之一，承担配置健康检查和 brief 异常检测职责；零覆盖意味着后续修改可能悄然破坏其行为，且设计中承诺的"安全验证"和"降级验证"缺乏自动化保障。

**建议**: 补充以下测试：
1. `doctor` 基础检查（正常 `.ctx/` 目录、缺少关键文件、brief 异常变短警告）。
2. `update --dry-run` 不写文件。
3. `update --notes FILE` 读取外部笔记。
4. 缺少 `.ctx/` 时 update/pack/doctor 抛出错误。
5. `enforceLineBudget` 截断超长 brief。

---

### MEDIUM

### [MEDIUM] 幂等性: proposal 去重哈希包含日期，跨日同内容产生重复

**文件**: `src/cli.js:453-465`

**问题**: `buildProposalCandidates` 生成的 proposal title 包含 `now.slice(0, 10)`（当天日期），而哈希基于 `title + body` 计算。相同 inbox 内容在不同日期运行 `ctxlite update` 会生成不同哈希，导致重复 proposal。测试仅验证了同次执行内的去重。

**影响**: 用户若连续多天未清理 inbox 并多次运行 update，proposals.md 会积累内容相同但 ID 不同的 proposal，违背设计 §6 "幂等验证"的意图。

**建议**: 将哈希计算改为仅基于 `body` 内容，不含日期变量部分；或在 title 中使用固定前缀而非日期。

---

### [MEDIUM] 用户预期: config.yaml 生成了 `sources` 和 `update` 段但未使用

**文件**: `src/cli.js:528-555`（`configTemplate`）

**问题**: `ctxlite init` 生成的 `config.yaml` 包含 `sources.include`、`sources.exclude`、`update.auto_write`、`update.require_review` 配置段，但代码中没有任何逻辑读取或使用这些配置。用户看到这些配置会合理预期它们生效。

**影响**: 用户修改 `sources.exclude` 期望排除敏感文件但实际不生效，可能产生安全误解；或修改 `update.require_review` 期望保护文件但实际无效。

**建议**: 在 config 模板中为未实现段落添加注释标注 `# (planned, not yet implemented)`；或在 `ctxlite doctor` 中检测并提示这些配置当前不生效。

### LOW

### [LOW] 死逻辑: switch default 两分支抛出相同错误

**文件**: `src/cli.js:37-42`

**问题**:
```javascript
default:
  if (positionals.length > 0) {
    throw new Error(`unknown command: ${command}`);
  }
  throw new Error(`unknown command: ${command}`);
```
`if` 条件无论真假都执行相同的 `throw`，`positionals` 判断无意义。

**影响**: 无功能影响，但降低代码可读性。

**建议**: 移除 `if` 分支，保留单行 `throw new Error(\`unknown command: ${command}\`)`。

---

### [LOW] 输出格式: pack markdown 中 proposal 计数为裸数字

**文件**: `src/cli.js:206`

**问题**: `stdout.write(\`${pack.pendingProposalCount}\n\`)` 在 markdown 模式下输出裸数字（如 `0`），缺少上下文说明。

**影响**: markdown 输出的可读性轻微下降。

**建议**: 改为 `${pack.pendingProposalCount} pending proposal(s)` 或类似表述。

---

### [LOW] 健壮性: formatInbox 空 pending 产生多余空行

**文件**: `src/cli.js:438-451`

**问题**: 当 `pending` 为空字符串时，`${pending.trim()}` 输出空字符串，导致 `## Pending` 和 `## Archived` 之间出现连续空行。

**影响**: 无功能影响，文件格式略不整洁。

**建议**: 可不修复；若需整洁，在模板中条件控制空行数量。

## 6. 验证结果核对

| 实现文档声称 | 审查核实 |
|-------------|---------|
| `npm run check` 通过 | 审查中实际运行，通过 |
| `npm test` 3 个测试全部 pass | 审查中实际运行，通过 |
| `npm pack --dry-run` 仅含 4 文件 | 实现文档记录一致 |
| init 不覆盖已有 brief | 测试用例验证（test line 19-21） |
| update 生成 `.brief.prev.md` | 测试用例验证（test line 42） |
| update 归档 pending inbox | 测试用例验证（test line 49-50） |
| update 按 hash 去重 proposal | 测试用例验证（test line 51, 64） |
| pack JSON 可解析 | 测试用例验证（test line 75-76） |

## 7. Handoff

### 7.1 同会话继续
`直接执行 $fix-implement 或 /fix-implement`

### 7.2 新会话恢复 prompt
```text
请阅读实现文档 /Users/sheng/tencent/ctxlite/docs/plans/2026-05-20-ctxlite-mvp-implementation.md、
审查文档 /Users/sheng/tencent/ctxlite/docs/plans/2026-05-20-ctxlite-mvp-code-review.md，
以及本次代码变更，
使用 $fix-implement（或 /fix-implement）进行方案修复及代码实现。
重点修复 HIGH-1：doctor 命令零测试覆盖，补充 doctor、dry-run、notes、错误路径和 brief 截断测试。
```

## 8. 修复记录

- 修复日期：2026-05-20
- 修复结论：本轮已关闭审查文档中的 HIGH、MEDIUM、LOW 项；代码已可合并，无需额外 handoff。

### 8.1 HIGH-1 测试覆盖修复

- 在 `test/cli.test.js` 中将测试从 3 个扩展到 12 个，补齐 doctor、dry-run、notes、错误路径和 brief 截断覆盖。
- 新增 doctor 覆盖：
  - 正常 `.ctx/` 目录在模型环境变量存在时返回 `0`，且无 warning。
  - 缺少关键 `.ctx` 文件时输出 `missing` check、stderr warning，并返回 `1`。
  - 当前 `brief.md` 少于 `.brief.prev.md` 一半时输出行数对比和异常变短 warning。
- 新增 update 覆盖：
  - `update --dry-run` 只输出预览，不写 `brief.md`、`inbox.md`、`proposals.md` 或 `.last-update.json`。
  - `update --notes FILE` 会读取外部 notes，写入 brief 并归档到 inbox。
  - 缺少 `.ctx/` 时 `update`、`pack`、`doctor` 均抛出 `missing .ctx directory; run ctxlite init first`。
  - 通过 fake git 输出制造超长信号，验证 `brief_budget_tokens` 触发 brief 截断注记。
- 配套实现修复：`src/cli.js` 的 doctor 现在会把缺少关键 `.ctx` 文件升级为 warning，并通过非零退出码暴露健康检查失败。

### 8.2 MEDIUM / LOW 修复

- MEDIUM：proposal 去重哈希改为基于 `type + body`，不再包含日期标题；新增跨日重复 update 测试，确认相同内容不会生成重复 proposal。
- MEDIUM：`config.yaml` 模板为 `update` review controls 与 `sources` selection 增加 `planned, not yet implemented` 注释，降低用户误解风险。
- LOW：移除 unknown command 分支中的重复死逻辑，并新增 unknown command 错误测试。
- LOW：`pack` markdown 的 pending proposal 计数改为 `N pending proposal(s)`，新增 markdown 输出测试。
- LOW：`formatInbox` 对空 Pending 做条件化输出，避免 `## Pending` 与 `## Archived` 之间出现多余空行；现有归档测试改为精确断言格式。

### 8.3 验证结果

- `npm test`：通过，12 个测试全部 pass。
- `npm run check`：通过，`node --check bin/ctxlite.js && node --check src/cli.js` 无语法错误。
- `node /Users/sheng/tencent/ctxlite/bin/ctxlite.js --help`：通过，仍输出 `init`、`update`、`pack`、`doctor` 四个 MVP 命令。
- `npm pack --dry-run`：通过，tarball 仍仅包含 `README.md`、`bin/ctxlite.js`、`package.json`、`src/cli.js` 共 4 个文件。

### 8.4 剩余风险与状态

- 剩余阻断风险：无。
- 建议下一轮检查范围：无强制复审项；如继续演进，可单独评审真实模型接入、MCP server 和配置读取语义。
- 代码状态：已可合并，无需额外 handoff。
