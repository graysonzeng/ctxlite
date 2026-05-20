# Implementation: ctxlite MVP

- Date: 2026-05-20
- Design Doc: /Users/sheng/tencent/ctxlite/docs/specs/2026-05-20-ctxlite-mvp-design.md
- Review Doc: /Users/sheng/tencent/ctxlite/docs/plans/2026-05-20-ctxlite-mvp-design-review.md
- Status: Completed

## 1. 评审意见处理摘要
- 采纳 HIGH-1：在设计和实现中增加 `brief.md` 重写前备份机制，写入 `.ctx/.brief.prev.md`；`doctor` 增加当前 brief 与上一版行数对比，并对异常变短给出警告。
- 采纳 HIGH-2：在设计和实现中明确 `inbox.md` 为 `## Pending` / `## Archived` 两段式结构；`update` 会把已处理 pending 内容归档，并保留最近 20 个归档块。
- 采纳 HIGH-3：在设计中补充 Node.js 20+、纯 ESM JavaScript、npm 全局安装的技术栈和分发方式；实现中落地 `package.json`、`bin` 入口和 npm pack 白名单。
- 采纳 MEDIUM 建议的一部分：澄清 `pack` 与 `brief.md` 定位差异；实现 proposal 哈希去重；实现模型环境变量缺失警告；实现最近 5 条 commit 的 git 信号收集。
- 未采纳深度模型抽取和 MCP 集成：它们属于后续增强，不进入当前 MVP。

## 2. 根因前提处理结论（按需）
- 适用性：不适用
- 处理策略：沿用
- 结论：当前实现不依赖故障根因或成因判断；设计评审的根因结论为 `NOT_APPLICABLE`，可直接在修订设计后实现。

### 2.1 消费的根因评审结论
- NOT_APPLICABLE：本项目是新工具 MVP，不是故障、回归或异常修复。

### 2.2 本次修订的前提边界
- 已确认事实：评审指出的三个 HIGH 均为 MVP 进入实现前应补齐的设计细节。
- 未确认假设：真实模型 API 抽取质量和跨客户端行为仍需后续集成验证。
- 对实现的影响：MVP 先实现规则式更新和文件协议，把模型抽取、MCP 和平台深度适配留在后续版本。

## 3. 采纳的设计修订
- 在设计文档 §5.1 增加技术栈和分发方式，明确 Node.js 20+、纯 ESM JavaScript、npm 全局安装。
- 在设计文档 §5.2 澄清 `brief.md` 与 `AGENTS.md` / `CLAUDE.md` 的差异，以及 `pack` 与 `brief.md` 的差异。
- 在设计文档 §5.3 和 §5.5 增加 `brief.md` 写入前备份规则。
- 在设计文档 §5.5 增加 `inbox.md` 两段式结构、归档判定和归档保留策略。
- 在设计文档 §5.5 增加 proposal 状态与哈希去重策略。
- 在设计文档 §5.6 增加 `.brief.prev.md` 回退和 `doctor` 检查说明。
- 在设计文档 §9 记录本次修订。

## 4. 实现摘要
- 新增 npm CLI 包结构：
  - `/Users/sheng/tencent/ctxlite/package.json`
  - `/Users/sheng/tencent/ctxlite/bin/ctxlite.js`
  - `/Users/sheng/tencent/ctxlite/src/cli.js`
  - `/Users/sheng/tencent/ctxlite/README.md`
- 实现 `ctxlite init`：
  - 创建 `.ctx/` 目录。
  - 创建 `config.yaml`、`brief.md`、`project.md`、`decisions.md`、`gotchas.md`、`proposals.md`、`inbox.md`。
  - 创建 `AGENT_CONTEXT.md`。
  - 不覆盖已存在文件。
- 实现 `ctxlite update`：
  - 读取 `.ctx/inbox.md`、`--notes FILE`、`--stdin`、git status、git diff stat 和最近 5 条 commit。
  - 无模型时使用规则式更新。
  - 重写 `.ctx/brief.md` 前备份到 `.ctx/.brief.prev.md`。
  - 将 pending inbox 内容归档到 `## Archived`。
  - 对 proposal 候选计算 SHA-256 哈希并去重。
  - 写入 `.ctx/.last-update.json`。
- 实现 `ctxlite pack`：
  - 支持 `--format markdown` 和 `--format json`。
  - 输出持久 brief、当前 git 信号、pending inbox 和 pending proposal 数量。
- 实现 `ctxlite doctor`：
  - 检查关键 `.ctx/` 文件存在性。
  - 检查 `AGENT_CONTEXT.md`。
  - 检查模型环境变量缺失。
  - 对比当前 brief 和上一版 brief 行数。
  - 报告 pending inbox 和 pending proposals。
- 新增 Node 内置测试：
  - `/Users/sheng/tencent/ctxlite/test/cli.test.js`
  - 覆盖 init、update、backup、archive、proposal dedupe 和 pack JSON。

## 5. 验证结果
- 语法检查：`npm run check`，通过。
- 测试：`npm test`，通过；3 个测试全部 pass。
- CLI 帮助验证：`node /Users/sheng/tencent/ctxlite/bin/ctxlite.js --help`，通过，输出四个 MVP 命令。
- 构建 / 分发预检：`npm pack --dry-run`，通过；tarball 仅包含 `README.md`、`bin/ctxlite.js`、`package.json`、`src/cli.js`。
- 功能验证：测试中确认 `ctxlite init` 不覆盖已有 brief；`ctxlite update` 会生成 `.ctx/.brief.prev.md`、归档 pending inbox、按 hash 去重 proposal；`ctxlite pack --format json` 输出可解析 JSON。

## 6. 已知限制与后续建议
- MVP 尚未调用真实模型 API；当前 `update` 是规则式知识整理，模型抽取可在后续版本通过用户 proxy 接入。
- MVP 尚未实现 MCP server、Claude Code hooks、Codex skill export 或 CodeBuddy adapter。
- `doctor` 已能提示 pending proposal 数量，但 proposal 的 adopted/rejected/expired 状态流转仍需后续命令支持。
- 当前目录不是 git 仓库，因此未记录真实 `git status` 变更；验证主要依赖测试和 npm 命令结果。

## 7. Handoff

### 7.1 同会话继续
`直接执行 $code-review 或 /code-review`

### 7.2 新会话恢复 prompt
```text
请阅读设计输入 /Users/sheng/tencent/ctxlite/docs/specs/2026-05-20-ctxlite-mvp-design.md、
实现文档 /Users/sheng/tencent/ctxlite/docs/plans/2026-05-20-ctxlite-mvp-implementation.md，
以及本次提交的代码变更，
重点核对根因前提（如有）、设计修订、实现结果与验证证据是否一致，
使用 $code-review（或 /code-review）进行方案重审及代码审查。
```

## 8. 修复实现补充

- 修复日期：2026-05-20
- 对应审查文档：/Users/sheng/tencent/ctxlite/docs/plans/2026-05-20-ctxlite-mvp-code-review.md

### 8.1 实现补充

- `doctor` 对缺失的关键 `.ctx` 文件输出 warning，并返回非零状态，避免健康检查只显示 `missing` 但仍成功退出。
- proposal 去重哈希改为基于稳定内容（`type + body`），避免同一内容跨日期 update 生成重复 proposal。
- `config.yaml` 模板对尚未实现的 `update` review controls 与 `sources` selection 增加 planned 注释。
- `pack` markdown 输出将 pending proposal 计数从裸数字改为 `N pending proposal(s)`。
- `formatInbox` 对空 Pending 做条件化输出，减少多余空行。
- unknown command 分支移除重复死逻辑。

### 8.2 测试补充

- `test/cli.test.js` 从 3 个测试扩展到 12 个测试。
- 新增覆盖：doctor 正常/缺文件/brief 异常变短、update dry-run、notes 文件、缺 `.ctx` 错误路径、brief 截断、proposal 跨日去重、pack markdown 计数、unknown command、配置 planned 注释与 inbox 空段格式。

### 8.3 最新验证结果

- `npm test`：通过，12 个测试全部 pass。
- `npm run check`：通过。
- `node /Users/sheng/tencent/ctxlite/bin/ctxlite.js --help`：通过。
- `npm pack --dry-run`：通过，tarball 仍仅包含 `README.md`、`bin/ctxlite.js`、`package.json`、`src/cli.js` 共 4 个文件。

### 8.4 当前状态

- 审查文档列出的 HIGH、MEDIUM、LOW 项均已处理。
- 剩余阻断风险：无。
- 代码状态：已可合并，无需额外 handoff。
