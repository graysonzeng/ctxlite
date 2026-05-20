# Design: ctxlite MVP

- Date: 2026-05-20
- Status: Draft
- Scope: M

## 1. Goals And Scope

### 1.1 Problem

- Coding agents such as Claude Code, Codex, and CodeBuddy repeatedly rebuild the same project context across sessions: repository structure, constraints, known pitfalls, user preferences, recent plans, and local operating rules.
- Building a full router, MCP server, or deep client-specific plugin first would make the MVP too heavy and would increase deployment and integration cost.
- The first useful product should be a lightweight, project-local tool that can preserve reusable context without binding users to one agent client.

### 1.2 Success Criteria

- Running `ctxlite init` in any project creates a `.ctx/` context directory and a minimal agent usage guide.
- Running `ctxlite update` after meaningful work updates `.ctx/brief.md` from project signals and user notes, and writes long-term-rule candidates to `.ctx/proposals.md`.
- Agents only need two habits: read `.ctx/brief.md` before non-trivial work and run `ctxlite update` after meaningful work.
- The MVP does not require a background service, database, MCP server, browser extension, or IDE plugin.
- Generated context files stay short, stable, reviewable, and do not silently promote unconfirmed ideas into durable agent rules.

### 1.3 In Scope

- Design an independent CLI project named `ctxlite`.
- Define the project-local `.ctx/` file protocol.
- Define the MVP commands: `init`, `update`, `pack`, and `doctor`.
- Prefer simple file-based automation and optional hooks instead of binding the product to Claude Code, Codex, or CodeBuddy.
- Define the LLM boundary: future model extraction may use a user-provided proxy or OpenAI/Anthropic-compatible endpoint, while the MVP must still work with rule-based updates.
- Leave MCP server support, platform adapters, skill/rules export, and context linting as later extensions.

### 1.4 Non-Goals

- Do not implement a multi-model routing proxy in the MVP.
- Do not implement a full MCP server in the MVP.
- Do not build deep plugins for Claude Code, Codex, or CodeBuddy in the MVP.
- Do not automatically edit `AGENTS.md`, `CLAUDE.md`, formal `docs/`, or real skill files in the MVP.
- Do not store complete chat transcripts or build a long-term vector database.

## 2. Background And Constraints

- The user may already have a reverse proxy for model access, but model routing is not the first-stage core problem.
- Client integrations should stay thin: ordinary files and CLI commands should be enough.
- The largest waste comes from repeated project onboarding, not from choosing the perfect model for every turn.
- `.ctx/` must contain plain text files that any agent, editor, or code review tool can read.
- Automation must be careful: the tool may maintain a runtime brief and proposals, but it must not casually edit durable project rules.
- The CLI must work in an empty project and in an existing project without overwriting user-authored files.

## 3. Root Cause Analysis

### 3.1 Is Root Cause Analysis Needed?

- No.
- Reason: this is a new-tool MVP design, not a bug, regression, or unknown failure. The choices follow known product constraints: lightweight client dependency, portability, automation, and MVP simplicity.

### 3.2 Confirmed Facts

- Not applicable.

### 3.3 Unconfirmed Assumptions

- Not applicable.

### 3.4 Design Impact

- Not applicable.

## 4. Options

### 4.1 Option A: File-Protocol-First CLI

- Core idea: install `ctxlite` as a global CLI. Each project owns its `.ctx/` Markdown files. Agents read `.ctx/brief.md` and run `ctxlite update` when work finishes.
- Benefits: thinnest dependency, lowest cross-client migration cost, reviewable files, easy copying, small implementation, and fast validation.
- Costs: the CLI cannot force every agent to run it; automation depends on rules, hooks, or user habits; chat-only context must be passed in explicitly.
- Best fit: users accept a lightweight habit and optional automation in exchange for portability.

### 4.2 Option B: MCP Server First

- Core idea: implement `ctxlite-mcp` with tools, resources, and prompts for planning, compression, project knowledge lookup, and updates.
- Benefits: natural integration with MCP-capable agents and a structured future surface.
- Costs: higher protocol and client configuration cost; weaker coverage for clients without stable MCP support; MCP tools still cannot force agent behavior.
- Best fit: users are already committed to MCP and willing to configure a server per client.

### 4.3 Option C: Platform Plugin Or Hook First

- Core idea: build adapters for Claude Code hooks, Codex skills, CodeBuddy rules, and similar platform-specific mechanisms.
- Benefits: best experience inside one platform and a path toward more automatic behavior.
- Costs: many integration surfaces, higher maintenance cost, and a high risk that core logic becomes host-specific.
- Best fit: a single primary platform has already been chosen and cross-client portability is less important.

### 4.4 Decision

- Choose Option A: an independent CLI and file protocol.
- Rationale: it best matches the MVP constraints of thin client dependency, simplicity, portability, and reviewable project-local state. MCP and platform adapters remain extension layers.

## 5. Detailed Design

### 5.1 Technology Stack And Distribution

- Use Node.js 20+ and npm distribution.
- Expose the CLI through `package.json` `bin.ctxlite`.
- Implement the MVP in plain ESM JavaScript with no runtime dependencies.
- Use Node.js standard library APIs for configuration parsing, file I/O, subprocesses, and tests.
- Support development usage through `npm link` and future user installation through `npm install -g ctxlite`.
- Rationale: the target audience usually has Node.js available, npm global installation is familiar, and the ecosystem is suitable for later MCP and OpenAI-compatible API integration.

### 5.2 Core Model

- `ctxlite` maintains reusable project context as short Markdown files under `.ctx/`.
- `.ctx/brief.md` is the startup context for agents. It should fit a small context budget and keep only the most reusable project facts, constraints, and current state.
- `.ctx/brief.md` differs from `AGENTS.md` and `CLAUDE.md`: the brief is auto-maintained runtime context, while agent rule files are stable human-authored instructions.
- `ctxlite pack` differs from `brief.md`: the brief is a persisted summary, while `pack` is a one-shot bundle that may include current git state, pending inbox items, and proposal counts.
- `.ctx/proposals.md` is a safety buffer for possible durable rules, docs, ADRs, or skill candidates. The MVP writes proposals, not accepted rules.
- `ctxlite update` reads low-risk project signals by default: `git status`, `git diff --stat`, the last five commit summaries, `.ctx/inbox.md`, `--notes`, and `--stdin`.
- A later model-backed updater may use a configured endpoint. Without model configuration, the MVP uses rule-based updates.
- If model environment variables are configured but missing, the command should warn and fall back to rule-based updates.

### 5.3 Control Flow

1. A user runs `ctxlite init` in a project.
2. The CLI creates `.ctx/`, default Markdown files, `.ctx/config.yaml`, and `AGENT_CONTEXT.md`.
3. An agent reads `.ctx/brief.md` before non-trivial work.
4. During work, the user or agent may add observations to `.ctx/inbox.md` or pass notes to `ctxlite update`.
5. After meaningful work, the user or agent runs `ctxlite update`.
6. The CLI collects project signals and builds an update candidate.
7. The rule engine or a future model creates a brief update and proposal candidates.
8. Before rewriting `.ctx/brief.md`, the CLI backs up the previous version to `.ctx/.brief.prev.md`.
9. The CLI writes `.ctx/brief.md`, archives processed inbox content, and appends deduped proposals.
10. The user or a later agent reviews proposals and decides whether to promote them into durable docs, rules, or skills.

### 5.4 Interface And Files

CLI commands:

- `ctxlite init`: initialize `.ctx/` and `AGENT_CONTEXT.md`.
- `ctxlite update [--notes FILE] [--stdin] [--dry-run]`: update context files.
- `ctxlite pack [--format markdown|json]`: output a compact agent context bundle.
- `ctxlite doctor`: check configuration, file health, and potential context issues.

Project files:

- `.ctx/config.yaml`: project settings such as brief budget and future update controls.
- `.ctx/brief.md`: agent startup context.
- `.ctx/project.md`: stable project structure notes; created as a placeholder in the MVP.
- `.ctx/decisions.md`: durable decisions; created as a placeholder in the MVP.
- `.ctx/gotchas.md`: repeated pitfalls; created as a placeholder in the MVP.
- `.ctx/proposals.md`: pending suggestions for docs, rules, skills, or ADRs.
- `.ctx/inbox.md`: raw observations and temporary notes.
- `.ctx/.brief.prev.md`: previous brief backup.
- `.ctx/.last-update.json`: metadata for the latest update.
- `AGENT_CONTEXT.md`: portable instructions that can be copied into agent rule files.

Example configuration:

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

### 5.5 Write Policy

Automatic writes:

- `.ctx/brief.md`: rewrite as a compact agent-ready project brief. Back up the prior version first.
- `.ctx/proposals.md`: append pending proposals with status, type, source, and content hash. Deduplicate by stable hash.
- `.ctx/inbox.md`: maintain a fixed `## Pending` / `## Archived` structure.

Careful writes:

- `.ctx/project.md`, `.ctx/decisions.md`, and `.ctx/gotchas.md` are placeholders in the MVP. Later commands may promote reviewed proposals into them.

Never auto-write in the MVP:

- `AGENTS.md`, `CLAUDE.md`, formal `docs/`, or real skill files.

Inbox archive policy:

- New observations go under `## Pending`.
- When pending content has been absorbed into the brief or proposals, `ctxlite update` moves it into `## Archived`.
- Archived entries include the processing time and result.
- The MVP keeps the newest 20 archive blocks.

Proposal lifecycle:

- Status values are `pending`, `adopted`, `rejected`, and `expired`.
- The MVP only appends `pending` proposals.
- `doctor` should later warn about stale pending proposals.

### 5.6 Error Handling And Recovery

- Outside a git repository, `ctxlite update` still works from `.ctx/`, notes, and stdin, and reports that git signals are unavailable.
- Without model configuration, update succeeds through rule-based behavior.
- If a configured model endpoint fails in a future implementation, the CLI must preserve existing files and report the failure.
- If candidate output exceeds `brief_budget_tokens`, the MVP truncates with a visible note; a future model-backed version may compress more intelligently.
- `.ctx/.brief.prev.md` provides recovery from low-quality generated briefs.
- `doctor` reports current and previous brief line counts and warns if the current brief is suspiciously shorter.

### 5.7 Risks And Mitigations

- Risk: incorrect knowledge pollutes future agent behavior.
  - Mitigation: auto-write only the brief, inbox archive, and pending proposals. Durable rules remain human-reviewed.
- Risk: agents do not reliably run the CLI.
  - Mitigation: generate `AGENT_CONTEXT.md` and later provide optional hooks or script examples.
- Risk: `.ctx/brief.md` grows without bound.
  - Mitigation: rewrite the brief and enforce a configured budget.
- Risk: sensitive project details are sent to a future model endpoint.
  - Mitigation: default to low-risk signals, support excludes and dry-run previews, and avoid diff content in the MVP.
- Risk: future model output has unstable structure.
  - Mitigation: use structured output and refuse writes when parsing fails.

### 5.8 `AGENT_CONTEXT.md` Policy

- `AGENT_CONTEXT.md` is generated only by `ctxlite init`.
- `ctxlite update` does not overwrite it.
- Users may copy its rules into `AGENTS.md`, `CLAUDE.md`, or other client rule files.
- `ctxlite doctor` checks whether `AGENT_CONTEXT.md` exists.

## 6. Verification Plan

- Initialization: run `ctxlite init` in an empty directory and verify `.ctx/` files plus `AGENT_CONTEXT.md`.
- Update: prepare simulated git and inbox notes, run `ctxlite update --dry-run`, and verify the proposed brief and proposals.
- Degraded mode: run `ctxlite update` without model configuration and verify success through rule-based behavior.
- Safety: force an oversized brief candidate and verify budget handling.
- Idempotency: run `ctxlite update` twice and verify duplicate proposals are not appended.
- Cross-client: have multiple agent clients read `.ctx/brief.md` and perform the same small task; compare whether they reuse the recorded project context.

## 7. Key Decisions

- The MVP uses an independent CLI and `.ctx/` Markdown protocol before MCP.
- Agent participation is intentionally simple: read `.ctx/brief.md` before work and run `ctxlite update` after meaningful work.
- Automatic writes are limited to `.ctx/brief.md`, `.ctx/proposals.md`, and `.ctx/inbox.md`.
- Skill export, MCP, platform hooks, and formal doc promotion are later layers.
- Model integration is optional and must have a no-model fallback.

## 8. Handoff

### 8.1 Continue In The Same Session

Run `$design-review` or `/design-review`.

### 8.2 Resume Prompt

```text
Read docs/specs/2026-05-20-ctxlite-mvp-design.md and run a design review.
If the document includes root cause analysis, review the root-cause judgment,
evidence, and design consistency as well.
```

## 9. Revision Log

- 2026-05-20: Incorporated design review high-priority items: brief backup, inbox archive semantics, Node.js/npm stack, pack positioning, proposal dedupe, and model environment warning behavior.
- 2026-05-20: Converted project documentation to English-only.
