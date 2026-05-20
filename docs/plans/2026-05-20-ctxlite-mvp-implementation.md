# Implementation: ctxlite MVP

- Date: 2026-05-20
- Design Doc: docs/specs/2026-05-20-ctxlite-mvp-design.md
- Review Doc: docs/plans/2026-05-20-ctxlite-mvp-design-review.md
- Status: Completed

## 1. Review Handling Summary

- Accepted HIGH-1: added pre-write backup for `brief.md` using `.ctx/.brief.prev.md`; `doctor` compares current and previous brief length and warns about suspicious shrinkage.
- Accepted HIGH-2: defined `inbox.md` as `## Pending` plus `## Archived`; `update` archives processed pending content and keeps the newest 20 archive blocks.
- Accepted HIGH-3: documented and implemented Node.js 20+, plain ESM JavaScript, npm distribution, `package.json` `bin`, and the npm files allowlist.
- Accepted selected medium items: clarified `pack` versus `brief.md`, implemented proposal hash dedupe, warned about missing model environment variables, and collected the latest five git commits.
- Deferred deep model extraction and MCP integration because they are later-stage enhancements.

## 2. Root Cause Premise

- Applicability: not applicable.
- Strategy: proceed with the design revisions.
- Result: the implementation does not depend on any bug root cause or failure analysis. The design review's `NOT_APPLICABLE` conclusion remains valid.

### 2.1 Consumed Review Result

- `NOT_APPLICABLE`: this project is a new MVP, not a bug fix or regression investigation.

### 2.2 Boundary For This Revision

- Confirmed facts: the three high-priority review items were required before implementation.
- Unconfirmed assumptions: real model extraction quality and cross-client behavior still need later integration testing.
- Implementation impact: the MVP implements rule-based updates and the file protocol first, while model extraction, MCP, and platform adapters remain future work.

## 3. Design Revisions Applied

- Added the Node.js/npm technology stack and distribution plan.
- Clarified the difference between `.ctx/brief.md` and `AGENTS.md` / `CLAUDE.md`.
- Clarified the difference between `ctxlite pack` and `.ctx/brief.md`.
- Added pre-write backup behavior for `.ctx/brief.md`.
- Defined `inbox.md` pending/archive sections and archive retention.
- Added proposal status and hash dedupe behavior.
- Added `.ctx/.brief.prev.md` recovery and `doctor` checks.
- Recorded the design revisions in the design document.

## 4. Implementation Summary

- Added npm CLI package structure:
  - `package.json`
  - `bin/ctxlite.js`
  - `src/cli.js`
  - `README.md`
- Implemented `ctxlite init`:
  - Creates `.ctx/`.
  - Creates `config.yaml`, `brief.md`, `project.md`, `decisions.md`, `gotchas.md`, `proposals.md`, and `inbox.md`.
  - Creates `AGENT_CONTEXT.md`.
  - Does not overwrite existing files.
- Implemented `ctxlite update`:
  - Reads `.ctx/inbox.md`, `--notes FILE`, `--stdin`, git status, git diff stat, and the latest five commits.
  - Uses rule-based updates when no model is configured.
  - Backs up `.ctx/brief.md` to `.ctx/.brief.prev.md` before rewriting.
  - Archives processed inbox content under `## Archived`.
  - Computes stable SHA-256 hashes for proposal candidates and dedupes them.
  - Writes `.ctx/.last-update.json`.
- Implemented `ctxlite pack`:
  - Supports `--format markdown` and `--format json`.
  - Outputs the persisted brief, current git signals, pending inbox content, and pending proposal count.
- Implemented `ctxlite doctor`:
  - Checks key `.ctx/` files.
  - Checks `AGENT_CONTEXT.md`.
  - Checks configured model environment variables.
  - Compares current and previous brief line counts.
  - Reports pending inbox and proposal state.
- Added Node built-in tests in `test/cli.test.js`.

## 5. Verification Results

- `npm run check`: passed.
- `npm test`: passed.
- CLI help: `node bin/ctxlite.js --help` prints the four MVP commands.
- Package dry run: `npm pack --dry-run` passed and includes `LICENSE`, `README.md`, `bin/ctxlite.js`, `package.json`, and `src/cli.js`.
- Functional coverage confirms:
  - `ctxlite init` does not overwrite an existing brief.
  - `ctxlite update` writes `.brief.prev.md`.
  - `ctxlite update` archives pending inbox content.
  - Proposal dedupe is stable across dates.
  - `ctxlite pack --format json` emits parseable JSON.

## 6. Known Limits And Follow-Up Work

- The MVP does not call a real model API; `update` is currently rule-based.
- The MVP does not include an MCP server, Claude Code hooks, Codex skill export, or CodeBuddy adapter.
- `doctor` reports pending proposal count, but proposal status transitions still need later commands.
- Release-readiness dogfood generated a real `.ctx/` layer for this repository.

## 7. Handoff

### 7.1 Continue In The Same Session

Run `$code-review` or `/code-review`.

### 7.2 Resume Prompt

```text
Read docs/specs/2026-05-20-ctxlite-mvp-design.md,
docs/plans/2026-05-20-ctxlite-mvp-implementation.md,
and the current code diff. Review whether the implementation matches
the design revisions and verification evidence.
```

## 8. Fix Implementation Addendum

- Fix date: 2026-05-20
- Review doc: docs/plans/2026-05-20-ctxlite-mvp-code-review.md

### 8.1 Implementation Fixes

- `doctor` now warns and returns a non-zero status when key `.ctx` files are missing.
- Proposal dedupe now uses stable content (`type + body`) instead of date-dependent titles.
- `config.yaml` marks future `update` review controls and `sources` selection as planned but not implemented.
- Markdown `pack` output labels pending proposal count as `N pending proposal(s)`.
- `formatInbox` avoids extra blank lines for an empty Pending section.
- The duplicate unknown-command branch was removed.

### 8.2 Test Additions

- Expanded `test/cli.test.js` from 3 tests to 14 tests.
- Added coverage for `doctor`, dry run, notes files, missing `.ctx`, brief truncation, cross-date proposal dedupe, pack markdown count, unknown commands, planned config comments, and empty inbox formatting.

### 8.3 Latest Verification

- `npm test`: passed, 14 tests.
- `npm run check`: passed.
- `node bin/ctxlite.js --help`: passed.
- `npm pack --dry-run`: passed, with 5 files in the tarball.

### 8.4 Current Status

- The high, medium, and low findings from the code review have been handled.
- Remaining blocking risk: none known.
- Code state: ready for release-readiness review.
