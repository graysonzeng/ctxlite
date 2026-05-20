# Design Review: ctxlite MVP

- Date: 2026-05-20
- Reviewed Design: docs/specs/2026-05-20-ctxlite-mvp-design.md
- Review Scope: Full MVP review, including root-cause applicability, option comparison, detailed design, and verification plan.

## 1. Overall Result

- **NEEDS_REVISION**
- Summary: the direction and core architecture are right, but the design needed three high-priority fixes before implementation: protect `brief.md` rewrites, define `inbox.md` archive semantics, and specify the CLI technology stack and distribution path.

## 2. Root Cause Review

- Applicability: **not applicable**
- Result: **NOT_APPLICABLE**
- Reason: this was a new-tool MVP design, not a bug, regression, or unknown failure. The option choice was driven by known product constraints: thin client dependency, portability, automation, and MVP simplicity.

### 2.1 Evidence Check

- Not applicable.

### 2.2 Fact And Assumption Boundary

- Not applicable.

### 2.3 Design Impact

- Not applicable.

## 3. Design Assessment

### 3.1 Requirements And Direction

- The design targets the right problem: agents waste context repeatedly rediscovering project knowledge across sessions.
- The success criteria are concrete enough to verify.
- The non-goals correctly exclude a full MCP server, deep plugins, and a vector database from the MVP.
- The file-protocol-first CLI is the best first option under the MVP constraints.
- The design should explicitly explain how `.ctx/brief.md` differs from `AGENTS.md` and `CLAUDE.md`.

### 3.2 Architecture Fit

- The three-layer architecture of `.ctx/` files, CLI commands, and optional future model extraction is simple and extensible.
- The write policy is safe: brief, proposals, and inbox are automatic; durable project docs and agent rules require review.
- The fallback story is mostly complete: no-model operation, model failure preservation, and oversized brief handling are all considered.
- The main gaps are listed in section 4.

### 3.3 Implementation Feasibility

- Scope M is reasonable for the four MVP commands.
- External dependencies are limited to git and an optional model endpoint.
- The verification plan covers initialization, update behavior, degraded mode, safety, idempotency, and cross-client usage.
- The largest pre-implementation feasibility gap is the missing technology stack and distribution decision.

### 3.4 Documentation Quality

- The structure is complete, from problem statement through options, detailed design, verification, and handoff.
- No major internal contradictions were found.
- Ambiguous areas: `inbox.md` archive behavior, `pack` versus `brief.md`, and `AGENT_CONTEXT.md` update policy.

## 4. Findings

### Critical

- None.

### High

#### HIGH-1: `brief.md` Rewrite Lacks Version Protection

- Location: design sections 5.1, 5.4, and 5.5.
- Problem: `ctxlite update` rewrites `.ctx/brief.md`, but the original design only preserved files on model-call failure. A successful but poor-quality output could overwrite valuable accumulated context.
- Impact: one bad update could pollute or erase the project brief and users might only notice in a later agent session.
- Recommendation: back up the current brief to `.ctx/.brief.prev.md` before every meaningful rewrite and have `doctor` report suspicious brief shrinkage. A future `--diff` mode would also help.

#### HIGH-2: `inbox.md` Archive Semantics Are Underspecified

- Location: design sections 5.2 and 5.4.
- Problem: the design said processed items should move to an archive, but did not define the archive section, processed criteria, or retention behavior.
- Impact: implementations could diverge, `inbox.md` could grow without bound, or useful raw notes could disappear too early.
- Recommendation: define a two-section file structure with `## Pending` and `## Archived`, move items after they are absorbed into the brief or proposals, and keep a bounded archive.

#### HIGH-3: CLI Technology Stack And Distribution Are Missing

- Location: design section 5.
- Problem: the design defined commands and files but did not choose a language/runtime or distribution channel.
- Impact: the stack affects installation friction, cross-platform behavior, API integration, schema validation, and test strategy.
- Recommendation: use Node.js 20+, ESM JavaScript, and npm global installation for the MVP.

### Medium

#### MEDIUM-1: `pack` And `brief.md` Need Clear Positioning

- Problem: both are described as agent startup context, but their roles differ.
- Recommendation: define `brief.md` as persisted project context and `pack` as a one-shot bundle that may include current git signals and pending counts.

#### MEDIUM-2: Proposal Idempotency Needs A Mechanism

- Problem: the verification plan expects duplicate proposals to be avoided, but the design did not define how.
- Recommendation: compute a stable content hash for each proposal and skip already-known hashes.

#### MEDIUM-3: Proposal Lifecycle Needs Status Values

- Problem: proposals can be created and reviewed, but the design did not define how accepted, rejected, or stale items are represented.
- Recommendation: use `pending`, `adopted`, `rejected`, and `expired`; have `doctor` warn about stale pending proposals later.

#### MEDIUM-4: Model Environment Variables Need Defined Behavior

- Problem: the configuration refers to environment variable names, but the original design did not define behavior when those variables are missing.
- Recommendation: missing model variables should be treated like no model configuration, with a warning and rule-based fallback.

#### MEDIUM-5: Git Signal Range Needs A Default

- Problem: the design mentioned recent commit summaries without defining "recent".
- Recommendation: use the latest five commits in the MVP and later consider tracking the previous update timestamp.

### Low

#### LOW-1: Cross-Client Verification Needs Observable Criteria

- Recommendation: compare whether agents cite key brief constraints, avoid recorded pitfalls, and show project understanding earlier.

#### LOW-2: `AGENT_CONTEXT.md` Update Policy Needs Clarity

- Recommendation: generate it on `init`, never rewrite it during `update`, and have `doctor` check whether it exists.

## 5. Recommended Revisions

1. Add `brief.md` backup behavior before rewrite.
2. Define `inbox.md` sections, processed criteria, and archive retention.
3. Add the Node.js/npm technology stack and distribution decision.
4. Clarify `pack` versus `brief.md`.
5. Define proposal dedupe and lifecycle.
6. Define model environment fallback and git signal range.

## 6. Next Step

- Move into design implementation.
- Reason: the direction is sound and the high-priority items are design-detail gaps, not architecture blockers.

## 7. Handoff

### 7.1 Continue In The Same Session

Run `$design-implement` or `/design-implement`.

### 7.2 Resume Prompt

```text
Read docs/specs/2026-05-20-ctxlite-mvp-design.md and
docs/plans/2026-05-20-ctxlite-mvp-design-review.md.
Apply the high-priority design revisions and implement the MVP.
Focus on brief backup, inbox archive semantics, and the CLI technology stack.
```
