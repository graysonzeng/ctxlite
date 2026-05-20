# Design: ctxlite MVP

- Date: 2026-05-20
- Status: Draft
- Scope: M

## 1. 设计目标和范围

### 1.1 要解决的问题
- Claude Code、Codex、CodeBuddy 等代码 agent 在连续任务中会反复重新理解项目结构、约束、踩坑记录和用户偏好，造成上下文浪费、成本上升和执行质量波动。
- 直接做完整路由器、MCP server 或多客户端插件会让 MVP 过重，增加部署和适配成本。
- 需要一个客户端轻依赖、项目内可见、能自动沉淀复用知识的最小工具。

### 1.2 成功标准
- 任意项目执行 `ctxlite init` 后，会生成 `.ctx/` 上下文目录和最小 agent 使用说明。
- 任务完成后执行 `ctxlite update`，工具能基于项目状态和输入笔记更新 `.ctx/brief.md`，并把不宜自动写入长期规则的内容写入 `.ctx/proposals.md`。
- Agent 只需要在任务开始前读取 `.ctx/brief.md`，任务结束后运行 `ctxlite update`，不依赖特定客户端能力。
- MVP 不要求后台服务、数据库、MCP、浏览器插件或 IDE 插件。
- 生成的上下文文档短、稳定、可人工 review，不引入会长期污染 agent 行为的未确认规则。

### 1.3 本次范围
- 设计一个独立 CLI 项目 `ctxlite`。
- 定义项目内 `.ctx/` 文件协议。
- 定义 MVP 命令：`init`、`update`、`pack`、`doctor`。
- 定义自动化策略：以轻规则文件和可选 hook 为主，不绑定 Claude Code、Codex 或 CodeBuddy。
- 定义 LLM 调用边界：优先通过用户已有 proxy 或兼容 OpenAI/Anthropic 的 endpoint 生成摘要和建议；无模型配置时可降级为规则式更新。
- 定义后续扩展方向：MCP server、平台 adapter、skill/rules export、context lint。

### 1.4 非目标
- 不在 MVP 中实现多模型路由 proxy。
- 不在 MVP 中实现完整 MCP server。
- 不在 MVP 中为 Claude Code、Codex、CodeBuddy 分别开发深度插件。
- 不在 MVP 中自动修改 `AGENTS.md`、`CLAUDE.md`、正式 `docs/` 或真实 skill。
- 不在 MVP 中保存完整聊天记录或构建长期向量数据库。

## 2. 背景与约束
- 用户已有反代 proxy，可以通过 API 接入多种模型；但本设计不把模型路由作为第一阶段核心。
- 用户希望各客户端是薄依赖：最好只通过读文件和运行 CLI 参与流程。
- 浪费大头主要来自项目知识重复解释，而不是每轮模型选择或微观 token 裁剪。
- `.ctx/` 目录必须是普通文本文件，方便所有 agent、编辑器和代码审查工具读取。
- 自动化需要谨慎：可以自动沉淀 session brief 和 proposals，但不能轻易写入会长期约束 agent 的正式规则。
- CLI 需要能在空项目中初始化，也能在已有项目中增量更新，不应破坏用户已有文件。

## 3. 根因分析（按需）

### 3.1 是否需要根因分析
- 不需要。
- 理由：当前任务是新工具 MVP 方案设计，不是故障、回归或未知成因问题；方案选择主要由已知产品约束决定，即轻依赖、可迁移、自动化、MVP 简洁。

### 3.2 已确认事实
- 不适用。

### 3.3 未确认假设
- 不适用。

### 3.4 对设计的影响
- 不适用。

## 4. 方案对比

### 4.1 方案 A：文件协议优先的独立 CLI
- 核心思路：`ctxlite` 作为全局 CLI 安装，在每个项目中维护 `.ctx/` Markdown 文件；客户端只需读取 `.ctx/brief.md` 并在任务结束后运行 `ctxlite update`。
- 优点：依赖最薄，跨客户端迁移成本最低；普通文件天然可审查、可提交、可复制；MVP 实现小，验证快。
- 缺点：无法强制每个 agent 调用 CLI；自动化程度依赖规则文件、hook 或用户习惯；对聊天记录的获取需要用户或客户端显式提供。
- 适用前提：用户接受“轻约束 + 可选自动化”的 MVP，先追求可用和可迁移。

### 4.2 方案 B：MCP server 优先
- 核心思路：直接实现 `ctxlite-mcp`，通过 tools/resources/prompts 给 Claude Code、Codex、CodeBuddy 提供计划、压缩、知识查询和更新能力。
- 优点：与支持 MCP 的 agent 集成更自然；后续可以提供结构化资源和工具调用；适合更强的自动上下文治理。
- 缺点：协议和客户端配置成本更高；不能覆盖不稳定或不支持 MCP 的环境；MCP 只能提供工具，不保证 agent 一定调用。
- 适用前提：目标用户已经稳定使用 MCP，并愿意为每个客户端配置 server。

### 4.3 方案 C：平台插件 / hook 优先
- 核心思路：优先为 Claude Code hooks、Codex skill、CodeBuddy rules 等分别开发适配器，在每个平台内自动触发知识整理。
- 优点：单个平台体验最好，能更接近“完全自动”。
- 缺点：维护多个客户端适配面，MVP 很快变重；每个平台能力不同，容易把核心逻辑绑死在宿主实现里。
- 适用前提：已经选定一个主平台，并愿意先牺牲跨平台一致性。

### 4.4 选型结论
- 选择：方案 A，文件协议优先的独立 CLI。
- 理由：它最符合“客户端轻依赖、MVP 简洁、尽量自动化”的约束。MCP 和平台适配保留为后续增强层，不能作为第一版的必需路径。

## 5. 详细方案

### 5.1 技术栈和分发方式
- MVP 采用 Node.js 20+ 和 npm 分发，CLI 入口通过 `package.json` 的 `bin.ctxlite` 暴露。
- 实现语言采用纯 ESM JavaScript，第一版不引入运行时依赖；配置解析、文件读写、子进程调用、测试均使用 Node.js 标准库。
- 分发方式优先支持 `npm install -g ctxlite`；开发期支持在工具仓库内执行 `npm link` 后全局使用。
- 选择理由：目标用户通常已有 Node.js 环境；npm 全局安装门槛低；后续扩展 MCP server、OpenAI-compatible API 调用和跨平台 adapter 时生态成熟；零依赖实现能降低 MVP 供应链和安装风险。

### 5.2 核心思路
- `ctxlite` 是一个独立安装的 CLI，用于把项目执行过程中的可复用知识沉淀为 `.ctx/` 下的短 Markdown 文件。
- `.ctx/brief.md` 是每个 agent 开始任务前的主入口，内容控制在短上下文预算内，只保留当前项目最值得复用的事实、约束和近期状态。
- `.ctx/brief.md` 与 `AGENTS.md` / `CLAUDE.md` 的定位不同：`brief.md` 是自动维护、频繁重写的运行时上下文；`AGENTS.md` / `CLAUDE.md` 是人工维护、相对稳定的项目规则。
- `ctxlite pack` 与 `brief.md` 的定位不同：`brief.md` 是持久化摘要；`pack` 是一次性输出的启动上下文包，可以额外包含当前 git 状态、inbox pending 摘要和 proposals 摘要。
- `.ctx/proposals.md` 是安全缓冲区：当工具发现可能应该升级为 skill、项目文档、规则或 ADR 的内容时，先写 proposal，不直接污染正式规则。
- `ctxlite update` 默认读取低风险项目信号：`git status`、`git diff --stat`、最近提交摘要、`.ctx/inbox.md`、用户传入的 notes 文件或 stdin。
- 最近提交摘要默认读取最近 5 条 commit；后续可通过 `.ctx/.last-update.json` 追踪上次更新时间并收窄范围。
- 如果配置了模型 endpoint，`ctxlite update` 调用模型抽取知识；如果未配置模型，工具使用规则式模板更新 inbox、时间戳和 pack 输出。
- 如果配置中声明了模型环境变量但环境变量缺失，行为等同于无模型配置：走规则式降级路径，并在终端输出警告。

### 5.3 关键数据流 / 控制流
1. 用户在任意项目中运行 `ctxlite init`。
2. CLI 创建 `.ctx/` 目录、默认 Markdown 文件、`.ctx/config.yaml` 和 `AGENT_CONTEXT.md`。
3. Agent 开始任务前按规则读取 `.ctx/brief.md`。
4. 任务过程中，用户或 agent 可把观察写入 `.ctx/inbox.md`，也可以在结束时通过 stdin 传给 `ctxlite update`。
5. 任务结束后运行 `ctxlite update`。
6. CLI 收集项目信号并构建 update prompt。
7. 模型或规则引擎输出结构化建议：brief 更新、proposal 追加、长期文档候选、风险提示。
8. CLI 在重写 `.ctx/brief.md` 前先备份当前版本，然后自动写入 `.ctx/brief.md`、`.ctx/inbox.md` 归档段落和 `.ctx/proposals.md`。
9. 用户或后续 agent review proposals，决定是否升级为正式文档、skill 或项目规则。

### 5.4 接口 / 配置 / 数据结构变更
- CLI 命令：
  - `ctxlite init`：初始化 `.ctx/` 和 `AGENT_CONTEXT.md`。
  - `ctxlite update [--notes FILE] [--stdin] [--dry-run]`：更新上下文文件。
  - `ctxlite pack [--format markdown|json]`：输出给 agent 使用的精简上下文包。
  - `ctxlite doctor`：检查配置、模型 endpoint、文件长度和潜在上下文污染。
- 项目文件：
  - `.ctx/config.yaml`：项目级配置。
  - `.ctx/brief.md`：agent 起步上下文。
  - `.ctx/project.md`：项目结构和关键模块说明，MVP 中只创建骨架，不默认频繁改写。
  - `.ctx/decisions.md`：重要决策候选，MVP 中谨慎追加。
  - `.ctx/gotchas.md`：反复踩坑记录，MVP 中谨慎追加。
  - `.ctx/proposals.md`：待确认的文档、skill、规则、ADR 建议。
  - `.ctx/inbox.md`：原始观察和临时笔记。
  - `AGENT_CONTEXT.md`：跨客户端使用说明，可被复制进 `AGENTS.md`、`CLAUDE.md` 或 CodeBuddy rules。
  - `.ctx/.brief.prev.md`：`ctxlite update` 重写 brief 前保存的上一版 brief。
  - `.ctx/.last-update.json`：记录最近一次 update 的时间、来源摘要和写入文件。
- 配置示例：

```yaml
project_name: ctxlite
brief_budget_tokens: 2000
model:
  provider: openai-compatible
  base_url_env: CTXLITE_BASE_URL
  api_key_env: CTXLITE_API_KEY
  name: ctx-auto
update:
  auto_write:
    - brief
    - proposals
  require_review:
    - project
    - decisions
    - gotchas
sources:
  include:
    - README.md
    - package.json
    - AGENTS.md
    - CLAUDE.md
    - docs/**
  exclude:
    - node_modules/**
    - dist/**
    - build/**
```

### 5.5 文档写入策略
- 自动写入：
  - `.ctx/brief.md`：重写为短、干净、可直接给 agent 读的项目 brief；写入前把当前版本复制到 `.ctx/.brief.prev.md`。
  - `.ctx/proposals.md`：追加带来源、理由、状态和内容哈希的建议；写入前按哈希去重，重复 proposal 跳过。
  - `.ctx/inbox.md`：维护固定结构，包含 `## Pending` 和 `## Archived` 两段。
- 谨慎写入：
  - `.ctx/project.md`、`.ctx/decisions.md`、`.ctx/gotchas.md` 默认只在高置信度时追加，或在 `--apply-proposals` 后写入。
- 不自动写入：
  - `AGENTS.md`、`CLAUDE.md`、正式 `docs/`、真实 skill 文件。
- `inbox.md` 归档规则：
  - 用户或 agent 新增观察写入 `## Pending`。
  - 当某条 pending 内容已经被 brief 吸收，或已经被 proposals 引用，`ctxlite update` 将其移动到 `## Archived`。
  - 归档条目保留来源时间、处理时间和处理结果。
  - MVP 默认保留最近 20 条归档；超过数量的旧归档不删除到其他文件，而是在后续 `doctor` 中提示清理。
- proposal 生命周期：
  - 状态为 `pending`、`adopted`、`rejected` 或 `expired`。
  - MVP 只自动追加 `pending` proposal，不自动改为 adopted/rejected。
  - `doctor` 检查超过 30 天仍为 pending 的 proposal，并提示用户处理。

### 5.6 错误处理与回退策略
- 如果当前目录不是 git 仓库，`ctxlite update` 仍可基于 `.ctx/inbox.md`、notes 和现有 `.ctx/` 文件运行，并提示缺少 git 信号。
- 如果模型 endpoint 未配置，`ctxlite update` 不失败，改为生成规则式 update summary，并提示配置模型可获得更高质量提炼。
- 如果模型调用失败，CLI 保留原文件不变，把失败信息写入终端输出，并建议使用 `--dry-run` 重试。
- 如果生成内容超过 `brief_budget_tokens`，CLI 自动二次压缩；压缩仍超限时拒绝写入 brief，并把候选内容写入 `.ctx/proposals.md`。
- 如果模型调用成功但输出质量存在人工不可见风险，用户可以通过 `.ctx/.brief.prev.md` 找回上一版；`ctxlite doctor` 会显示 brief 与上一版的行数差异和是否存在异常变短。
- 如果目标文件存在用户未提交改动，CLI 先生成 patch 预览；除 `.ctx/brief.md` 和 `.ctx/proposals.md` 外，不静默覆盖。

### 5.7 风险与缓解
- 风险：错误知识被写入长期上下文，污染后续 agent。
  - 缓解：MVP 只自动写 brief 和 proposals，正式规则与 docs 需要人工或后续命令确认。
- 风险：CLI 没有被 agent 稳定调用，自动化不足。
  - 缓解：生成 `AGENT_CONTEXT.md`，并提供可选 git hook、Claude Code hook 和 npm script 示例作为后续增强。
- 风险：`.ctx/brief.md` 越写越长。
  - 缓解：配置 `brief_budget_tokens`，每次 update 都重写 brief 而不是无限追加。
- 风险：项目隐私或敏感信息被发送到模型 endpoint。
  - 缓解：默认只收集摘要信号；支持 `sources.exclude`、`--no-diff-content` 和 dry-run 预览。
- 风险：模型输出格式不稳定。
  - 缓解：使用结构化 JSON schema 接收更新建议，失败时不写文件。

### 5.8 AGENT_CONTEXT.md 更新策略
- `AGENT_CONTEXT.md` 仅在 `ctxlite init` 时生成，不在 `ctxlite update` 中自动覆盖。
- 用户可以把其中规则复制到 `AGENTS.md`、`CLAUDE.md` 或 CodeBuddy rules。
- `ctxlite doctor` 检查 `AGENT_CONTEXT.md` 是否存在，并提示其是否可能与当前 `.ctx/` 文件结构不一致。

## 6. 验证计划
- 初始化验证：在空目录运行 `ctxlite init`，确认 `.ctx/` 文件和 `AGENT_CONTEXT.md` 创建成功。
- 更新验证：准备一组模拟 git diff 和 inbox notes，运行 `ctxlite update --dry-run`，确认输出包含 brief 更新和 proposals。
- 降级验证：不配置模型 endpoint 运行 `ctxlite update`，确认命令成功并给出规则式结果。
- 安全验证：制造超长 brief 候选，确认 CLI 会压缩或拒绝写入。
- 幂等验证：连续运行两次 `ctxlite update`，确认不会重复追加相同 proposal。
- 跨客户端验证：分别让 Claude Code、Codex、CodeBuddy 读取 `.ctx/brief.md` 并执行同一小任务，比较是否能正确复用项目知识。

## 7. 关键决策摘要
- MVP 选择独立 CLI + `.ctx/` Markdown 文件协议，不先做 MCP server。
- 客户端依赖控制为两条规则：任务前读 `.ctx/brief.md`，任务后运行 `ctxlite update`。
- 自动写入只覆盖 `.ctx/brief.md`、`.ctx/proposals.md` 和 `.ctx/inbox.md` 的安全范围。
- `skill`、MCP、平台 hook、正式项目文档都作为后续导出或增强能力，不进入 MVP 必需路径。
- 模型调用通过用户已有 proxy 或兼容 endpoint 接入，但工具必须支持无模型降级。

## 8. Handoff

### 8.1 同会话继续
`直接执行 $design-review 或 /design-review`

### 8.2 新会话恢复 prompt
```text
请阅读设计文档 /Users/sheng/tencent/ctxlite/docs/superpowers/specs/2026-05-20-ctxlite-mvp-design.md，
使用 $design-review（或 /design-review）对该方案进行评审；若文档包含根因分析，
请一并分析根因判断、证据与设计方案是否正确、合理，以及两者是否一致。
```

## 9. 修订记录

- 2026-05-20：吸收设计评审 HIGH 项，补充 `brief.md` 备份机制、`inbox.md` 结构与归档规则、Node.js/npm 技术栈和分发方式；同时澄清 `pack` 与 `brief.md` 定位、proposal 去重和模型环境变量缺失行为。
