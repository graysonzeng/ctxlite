# ctxlite

Lightweight project context compiler for coding agents.

ctxlite keeps a small, project-local context layer fresh so coding agents spend fewer tokens rediscovering the same repository and more tokens doing useful work.

## Why ctxlite exists

Coding agents are good at understanding projects, but that understanding is often trapped inside a single conversation. The next time an agent starts work, it usually has to scan the same files again: package metadata, folder structure, README, plans, prior decisions, local rules, recent diffs, and the same recurring gotchas.

In real multi-project work, a surprising amount of context can be spent on this repeated onboarding. Sometimes most of the prompt is not about the task at all; it is the agent rebuilding a mental model it already built last time.

The usual answer is to make context cheaper: larger context windows, chat summarizers, repo indexes, or one-off compressed prompts. Those are useful, but they still treat project knowledge as something to repeatedly recover.

ctxlite takes a different bet:

> Actively maintained project documentation saves more context than repeatedly compressing project context.

AI is especially good at this maintenance work. It can extract stable facts, recent decisions, repeated pitfalls, open proposals, and useful handoff notes at the end of each session. ctxlite turns that into a simple habit: initialize once, then ask the agent to update the project context whenever meaningful work finishes.

## Design philosophy

ctxlite is built around a few deliberately boring ideas:

- Project context should live in the project, not only in a chat transcript.
- The best context is short, current, reviewable, and versionable.
- Fast-changing runtime context should be separate from stable human rules.
- Unconfirmed ideas should become proposals, not silent long-term instructions.
- The workflow should be simple enough that an agent can do it at the start and end of normal work.

That is why ctxlite uses plain Markdown files under `.ctx/` instead of a database, daemon, browser extension, or client-specific plugin.

## How it compares

| Approach | What it helps with | Where ctxlite is different |
| --- | --- | --- |
| Larger context windows | Gives the agent more room to read. | ctxlite tries to reduce repeated reading in the first place. |
| Chat summarizers | Compresses the current conversation. | ctxlite maintains project-local knowledge that survives across conversations and tools. |
| Repo indexers / RAG | Finds relevant files and symbols. | ctxlite keeps curated operating context: decisions, gotchas, workflow notes, and current project state. |
| Agent-specific memories or hooks | Can feel automatic inside one client. | ctxlite uses files and a CLI so Claude Code, Codex, CodeBuddy, and other agents can share the same context. |
| Hand-written docs only | Gives humans full control. | ctxlite keeps humans in control, but lets AI do the repetitive upkeep. |

The goal is not to replace good docs. The goal is to make good docs easier to keep alive.

## Workflow

Initialize ctxlite once in a project:

```bash
ctxlite init
```

At the start of non-trivial work, the agent reads:

```text
.ctx/brief.md
```

After meaningful work, the agent updates the project context:

```bash
ctxlite update
```

On a fresh project, `ctxlite update` bootstraps the brief from stable project files such as `README.md`, `package.json`, and Markdown files under `docs/`. You can also pass session notes when the important context only exists in the current conversation:

```bash
ctxlite update --notes notes.md
```

When a one-shot context bundle is useful, generate one:

```bash
ctxlite pack
```

To check whether the context layer is healthy:

```bash
ctxlite doctor
```

## Files

ctxlite keeps the noisy and uncertain parts of project memory away from long-term rules:

- `.ctx/config.yaml`: project-level settings for brief size and future update controls.
- `.ctx/brief.md`: short startup context for agents.
- `.ctx/project.md`, `.ctx/decisions.md`, `.ctx/gotchas.md`: stable docs that are created as reviewable placeholders.
- `.ctx/inbox.md`: raw notes waiting to be processed.
- `.ctx/proposals.md`: suggestions that need human review before becoming durable rules or docs.
- `.ctx/.brief.prev.md`: previous brief backup for recovery and comparison.
- `.ctx/.last-update.json`: metadata from the most recent update.
- `AGENT_CONTEXT.md`: portable instructions that can be copied into `AGENTS.md`, `CLAUDE.md`, or other client rule files.

Stable human-authored rules still belong in files like `AGENTS.md`, `CLAUDE.md`, or project docs. ctxlite is the lightweight maintenance layer around them.

## Install

During development:

```bash
npm link
```

After publishing:

```bash
npm install -g ctxlite
```

## Usage

```bash
ctxlite init
ctxlite update
ctxlite pack
ctxlite doctor
```

## Example

```bash
ctxlite init
ctxlite update --notes notes.md
ctxlite pack --format json
```

The generated brief stays intentionally small:

```markdown
# Project Brief

## Project Snapshot
- README.md: ctxlite - Lightweight project context compiler for coding agents.
- package.json: ctxlite - Lightweight project context compiler for coding agents.
- scripts: test, check

## Reusable Context From Last Update
- Keep public docs generic and reviewable.
```

Pending ideas are written to `.ctx/proposals.md` instead of silently becoming permanent instructions.
