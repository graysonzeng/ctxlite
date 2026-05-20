import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { basename, join } from "node:path";

const CTX_DIR = ".ctx";
const DEFAULT_BRIEF_BUDGET = 2000;

export async function run(argv = process.argv.slice(2), io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const stdin = io.stdin ?? process.stdin;
  const { command, flags, positionals } = parseArgs(argv);

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      stdout.write(helpText());
      return 0;
    case "init":
      return initCommand({ cwd, stdout });
    case "update":
      return updateCommand({ cwd, flags, stdin, stdout, stderr });
    case "pack":
      return packCommand({ cwd, flags, stdout });
    case "doctor":
      return doctorCommand({ cwd, stdout, stderr });
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = new Map();
  const positionals = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags.set(name, inlineValue);
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }

  return { command, flags, positionals };
}

async function initCommand({ cwd, stdout }) {
  const ctxDir = join(cwd, CTX_DIR);
  await mkdir(ctxDir, { recursive: true });

  const projectName = basename(cwd);
  const files = [
    [join(ctxDir, "config.yaml"), configTemplate(projectName)],
    [join(ctxDir, "brief.md"), briefTemplate(projectName)],
    [join(ctxDir, "project.md"), projectTemplate(projectName)],
    [join(ctxDir, "decisions.md"), decisionsTemplate()],
    [join(ctxDir, "gotchas.md"), gotchasTemplate()],
    [join(ctxDir, "proposals.md"), proposalsTemplate()],
    [join(ctxDir, "inbox.md"), inboxTemplate()],
    [join(cwd, "AGENT_CONTEXT.md"), agentContextTemplate()]
  ];

  const created = [];
  const skipped = [];
  for (const [filePath, content] of files) {
    if (existsSync(filePath)) {
      skipped.push(displayPath(cwd, filePath));
      continue;
    }
    await writeFile(filePath, content, "utf8");
    created.push(displayPath(cwd, filePath));
  }

  stdout.write(`ctxlite initialized in ${cwd}\n`);
  if (created.length > 0) {
    stdout.write(`created:\n${created.map((item) => `- ${item}`).join("\n")}\n`);
  }
  if (skipped.length > 0) {
    stdout.write(`skipped existing files:\n${skipped.map((item) => `- ${item}`).join("\n")}\n`);
  }
  return 0;
}

async function updateCommand({ cwd, flags, stdin, stdout, stderr }) {
  await requireCtxDir(cwd);
  const dryRun = flags.has("dry-run");
  const now = new Date().toISOString();
  const ctxDir = join(cwd, CTX_DIR);
  const config = await readOptional(join(ctxDir, "config.yaml"));
  const projectName = readConfigValue(config, "project_name") ?? basename(cwd);
  const briefBudget = Number(readConfigValue(config, "brief_budget_tokens") ?? DEFAULT_BRIEF_BUDGET);
  const envWarnings = modelEnvWarnings(config);
  for (const warning of envWarnings) {
    stderr.write(`warning: ${warning}\n`);
  }

  const notes = await readNotes(cwd, flags, stdin);
  const inboxPath = join(ctxDir, "inbox.md");
  const inbox = parseInbox(await readOptional(inboxPath, inboxTemplate()));
  const pendingItems = [inbox.pending, notes].filter(Boolean).join("\n\n").trim();
  const git = collectGitSignals(cwd);
  const briefPath = join(ctxDir, "brief.md");
  const currentBrief = await readOptional(briefPath, briefTemplate(projectName));
  const nextBrief = enforceLineBudget(buildBrief({ projectName, now, git, pendingItems }), briefBudget);
  const proposalCandidates = buildProposalCandidates(pendingItems, now);
  const proposalsPath = join(ctxDir, "proposals.md");
  const currentProposals = await readOptional(proposalsPath, proposalsTemplate());
  const nextProposals = appendDedupedProposals(currentProposals, proposalCandidates);
  const nextInbox = pendingItems ? archiveInbox(inbox.archived, pendingItems, now) : formatInbox(inbox.pending, inbox.archived);
  const lastUpdate = {
    updatedAt: now,
    git: git.available ? "available" : "unavailable",
    wrote: ["brief.md", "inbox.md", "proposals.md"]
  };

  if (dryRun) {
    stdout.write("# ctxlite update dry run\n\n");
    stdout.write("## Proposed brief.md\n\n");
    stdout.write(nextBrief);
    stdout.write("\n## Proposed proposals.md additions\n\n");
    const added = nextProposals.slice(currentProposals.length).trim();
    stdout.write(added || "No new proposals.\n");
    stdout.write("\n");
    return 0;
  }

  if (currentBrief.trim() && currentBrief !== nextBrief) {
    await copyFile(briefPath, join(ctxDir, ".brief.prev.md"));
  }

  await writeFile(briefPath, nextBrief, "utf8");
  await writeFile(inboxPath, nextInbox, "utf8");
  await writeFile(proposalsPath, nextProposals, "utf8");
  await writeFile(join(ctxDir, ".last-update.json"), `${JSON.stringify(lastUpdate, null, 2)}\n`, "utf8");

  stdout.write("ctxlite update complete\n");
  stdout.write(`brief: ${displayPath(cwd, briefPath)}\n`);
  if (currentBrief.trim() && currentBrief !== nextBrief) {
    stdout.write("backup: .ctx/.brief.prev.md\n");
  }
  if (!git.available) {
    stdout.write("note: git signals unavailable; updated from .ctx and notes only\n");
  }
  return 0;
}

async function packCommand({ cwd, flags, stdout }) {
  await requireCtxDir(cwd);
  const format = flags.get("format") ?? "markdown";
  const ctxDir = join(cwd, CTX_DIR);
  const brief = await readOptional(join(ctxDir, "brief.md"));
  const inbox = parseInbox(await readOptional(join(ctxDir, "inbox.md"), inboxTemplate()));
  const proposals = await readOptional(join(ctxDir, "proposals.md"), proposalsTemplate());
  const git = collectGitSignals(cwd);
  const pack = {
    brief: brief.trim(),
    git,
    pendingInbox: inbox.pending.trim(),
    pendingProposalCount: countPendingProposals(proposals)
  };

  if (format === "json") {
    stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
    return 0;
  }
  if (format !== "markdown") {
    throw new Error(`unsupported pack format: ${format}`);
  }

  stdout.write("# ctxlite Context Pack\n\n");
  stdout.write("## Brief\n\n");
  stdout.write(`${pack.brief || "No brief available."}\n\n`);
  stdout.write("## Current Git Signals\n\n");
  stdout.write(formatGitSignals(git));
  stdout.write("\n## Pending Inbox\n\n");
  stdout.write(`${pack.pendingInbox || "No pending inbox items."}\n\n`);
  stdout.write("## Pending Proposals\n\n");
  stdout.write(`${pack.pendingProposalCount} pending proposal(s)\n`);
  return 0;
}

async function doctorCommand({ cwd, stdout, stderr }) {
  await requireCtxDir(cwd);
  const ctxDir = join(cwd, CTX_DIR);
  const checks = [];
  const warnings = [];

  for (const file of ["brief.md", "inbox.md", "proposals.md", "config.yaml"]) {
    const filePath = join(ctxDir, file);
    const label = displayPath(cwd, filePath);
    const exists = existsSync(filePath);
    checks.push(`${exists ? "ok" : "missing"} ${label}`);
    if (!exists) {
      warnings.push(`${label} is missing; run ctxlite init or restore the ctx file.`);
    }
  }

  const agentContextPath = join(cwd, "AGENT_CONTEXT.md");
  if (!existsSync(agentContextPath)) {
    warnings.push("AGENT_CONTEXT.md is missing; run ctxlite init or restore the agent protocol file.");
  }

  const config = await readOptional(join(ctxDir, "config.yaml"));
  warnings.push(...modelEnvWarnings(config));

  const brief = await readOptional(join(ctxDir, "brief.md"));
  const previousBrief = await readOptional(join(ctxDir, ".brief.prev.md"));
  if (brief && previousBrief) {
    const currentLines = lineCount(brief);
    const previousLines = lineCount(previousBrief);
    checks.push(`brief lines: current=${currentLines}, previous=${previousLines}`);
    if (currentLines < Math.ceil(previousLines / 2)) {
      warnings.push("brief.md is less than half the previous version; inspect .ctx/.brief.prev.md before relying on it.");
    }
  }

  const inbox = parseInbox(await readOptional(join(ctxDir, "inbox.md"), inboxTemplate()));
  if (inbox.pending.trim()) {
    warnings.push(".ctx/inbox.md still has pending items; run ctxlite update after meaningful work.");
  }

  const proposals = await readOptional(join(ctxDir, "proposals.md"), proposalsTemplate());
  const pendingProposalCount = countPendingProposals(proposals);
  checks.push(`pending proposals: ${pendingProposalCount}`);

  stdout.write("# ctxlite doctor\n\n");
  stdout.write("## Checks\n");
  stdout.write(`${checks.map((check) => `- ${check}`).join("\n")}\n\n`);
  stdout.write("## Warnings\n");
  stdout.write(`${warnings.length ? warnings.map((warning) => `- ${warning}`).join("\n") : "- none"}\n`);

  for (const warning of warnings) {
    stderr.write(`warning: ${warning}\n`);
  }
  return warnings.length > 0 ? 1 : 0;
}

async function requireCtxDir(cwd) {
  const ctxDir = join(cwd, CTX_DIR);
  if (!existsSync(ctxDir)) {
    throw new Error("missing .ctx directory; run ctxlite init first");
  }
}

async function readNotes(cwd, flags, stdin) {
  const chunks = [];
  const notesFile = flags.get("notes");
  if (typeof notesFile === "string") {
    chunks.push(await readFile(join(cwd, notesFile), "utf8"));
  }
  if (flags.has("stdin")) {
    chunks.push(await readStream(stdin));
  }
  return chunks.filter(Boolean).join("\n\n").trim();
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.setEncoding?.("utf8");
    stream.on("data", (chunk) => {
      data += chunk;
    });
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
    stream.resume?.();
  });
}

async function readOptional(filePath, fallback = "") {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function readConfigValue(config, key) {
  const match = config.match(new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1].replace(/^["']|["']$/g, "") : undefined;
}

function modelEnvWarnings(config) {
  const warnings = [];
  for (const key of ["base_url_env", "api_key_env"]) {
    const envName = readConfigValue(config, key);
    if (envName && !process.env[envName]) {
      warnings.push(`${envName} is not set; model calls are disabled and ctxlite will use rule-based updates.`);
    }
  }
  return warnings;
}

function collectGitSignals(cwd) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: "ignore" });
  } catch {
    return { available: false, status: "", diffStat: "", recentCommits: "" };
  }

  return {
    available: true,
    status: gitOutput(cwd, ["status", "--short"]),
    diffStat: gitOutput(cwd, ["diff", "--stat"]),
    recentCommits: gitOutput(cwd, ["log", "-5", "--oneline"])
  };
}

function gitOutput(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function buildBrief({ projectName, now, git, pendingItems }) {
  const pendingSummary = summarizeBlock(pendingItems, 12) || "No reusable inbox notes were pending at the last update.";
  return `# Project Brief

- Project: ${projectName}
- Last updated: ${now}
- Managed by: ctxlite

## Agent Protocol
- Read this file before non-trivial work.
- After meaningful work, run \`ctxlite update\`.
- Treat \`.ctx/proposals.md\` as suggestions, not accepted project rules.

## Current Signals
${formatGitSignals(git)}
## Reusable Context From Last Update
${pendingSummary}

## Notes
- \`AGENTS.md\` / \`CLAUDE.md\` remain the source for stable hand-written rules.
- This brief is an auto-maintained runtime summary and may be replaced on each update.
`;
}

function enforceLineBudget(content, budget) {
  const maxLines = Math.max(40, Math.floor(Number.isFinite(budget) ? budget / 20 : DEFAULT_BRIEF_BUDGET / 20));
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return content.endsWith("\n") ? content : `${content}\n`;
  }
  return `${lines.slice(0, maxLines - 2).join("\n")}\n\n[ctxlite truncated this brief to fit the configured budget.]\n`;
}

function summarizeBlock(text, maxLines) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  return lines.map((line) => `- ${line.replace(/^[-*]\s*/, "")}`).join("\n");
}

function formatGitSignals(git) {
  if (!git.available) {
    return "- Git: unavailable\n";
  }
  return [
    `- Git: available`,
    `- Status: ${git.status || "clean"}`,
    `- Diff stat: ${git.diffStat || "none"}`,
    `- Recent commits: ${git.recentCommits || "none"}`
  ].join("\n") + "\n";
}

function parseInbox(content) {
  const pending = sectionContent(content, "Pending");
  const archived = sectionContent(content, "Archived");
  return { pending, archived };
}

function sectionContent(content, title) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start === -1) {
    return "";
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

function archiveInbox(existingArchived, pendingItems, now) {
  const blocks = splitArchiveBlocks(existingArchived);
  const block = [
    `### ${now}`,
    "- Result: processed into brief/proposals candidate set",
    "",
    ...pendingItems.split(/\r?\n/).map((line) => `> ${line}`)
  ].join("\n");
  const nextBlocks = [block, ...blocks].slice(0, 20);
  return formatInbox("", nextBlocks.join("\n\n"));
}

function splitArchiveBlocks(archived) {
  return archived
    .split(/(?=^### )/m)
    .map((block) => block.trim())
    .filter(Boolean);
}

function formatInbox(pending, archived) {
  const lines = [
    "# Inbox",
    "",
    "Add raw observations under Pending. `ctxlite update` moves processed entries to Archived.",
    "",
    "## Pending",
    ""
  ];
  const pendingText = pending.trim();
  const archivedText = archived.trim();
  if (pendingText) {
    lines.push(pendingText, "");
  }
  lines.push("## Archived", "");
  if (archivedText) {
    lines.push(archivedText);
  }
  return `${lines.join("\n")}\n`;
}

function buildProposalCandidates(text, now) {
  if (!text.trim()) {
    return [];
  }
  const proposalPattern = /(skill|doc|docs|documentation|rule|rules|adr|runbook|gotcha|decision|文档|规则|决策|坑|流程)/i;
  if (!proposalPattern.test(text)) {
    return [];
  }
  const body = summarizeBlock(text, 10);
  const type = /skill/i.test(text) ? "skill" : /rule|规则/i.test(text) ? "rule" : "docs";
  const title = `Review ${type} candidate from ${now.slice(0, 10)} update`;
  const hash = digest(`${type}\n${body}`);
  return [{ title, type, body, hash, now }];
}

function appendDedupedProposals(current, candidates) {
  const existing = new Set([...current.matchAll(/ctxlite:proposal-hash=([a-f0-9]+)/g)].map((match) => match[1]));
  const additions = [];
  for (const candidate of candidates) {
    if (existing.has(candidate.hash)) {
      continue;
    }
    additions.push(formatProposal(candidate));
    existing.add(candidate.hash);
  }
  if (additions.length === 0) {
    return current.endsWith("\n") ? current : `${current}\n`;
  }
  return `${current.trimEnd()}\n\n${additions.join("\n\n")}\n`;
}

function formatProposal(candidate) {
  return `## P-${candidate.now.slice(0, 10)}-${candidate.hash.slice(0, 8)} - ${candidate.title}

- Status: pending
- Type: ${candidate.type}
- Source: inbox/update
- Hash: \`${candidate.hash}\`
<!-- ctxlite:proposal-hash=${candidate.hash} -->

${candidate.body}
`;
}

function countPendingProposals(content) {
  return [...content.matchAll(/^- Status:\s*pending\s*$/gm)].length;
}

function digest(input) {
  return createHash("sha256").update(input.trim()).digest("hex");
}

function lineCount(content) {
  return content.split(/\r?\n/).filter(Boolean).length;
}

function displayPath(cwd, filePath) {
  return filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function helpText() {
  return `ctxlite

Usage:
  ctxlite init
  ctxlite update [--notes FILE] [--stdin] [--dry-run]
  ctxlite pack [--format markdown|json]
  ctxlite doctor
`;
}

function configTemplate(projectName) {
  return `project_name: ${projectName}
brief_budget_tokens: 2000
model:
  provider: openai-compatible
  base_url_env: CTXLITE_BASE_URL
  api_key_env: CTXLITE_API_KEY
  name: ctx-auto
update:
  # planned, not yet implemented: update review controls
  auto_write:
    - brief
    - proposals
  require_review:
    - project
    - decisions
    - gotchas
sources:
  # planned, not yet implemented: source selection
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
`;
}

function briefTemplate(projectName) {
  return `# Project Brief

- Project: ${projectName}
- Last updated: not yet
- Managed by: ctxlite

## Agent Protocol
- Read this file before non-trivial work.
- After meaningful work, run \`ctxlite update\`.

## Current Signals
- No update has been run yet.

## Reusable Context From Last Update
- No reusable context has been captured yet.
`;
}

function projectTemplate(projectName) {
  return `# Project

- Name: ${projectName}

## Structure

Record stable project structure here after review.
`;
}

function decisionsTemplate() {
  return `# Decisions

Record durable decisions here after review.
`;
}

function gotchasTemplate() {
  return `# Gotchas

Record repeated pitfalls here after review.
`;
}

function proposalsTemplate() {
  return `# Proposals

Proposal statuses: pending, adopted, rejected, expired.
`;
}

function inboxTemplate() {
  return `# Inbox

Add raw observations under Pending. \`ctxlite update\` moves processed entries to Archived.

## Pending


## Archived

`;
}

function agentContextTemplate() {
  return `# Agent Context Protocol

Before starting non-trivial work:
- Read \`.ctx/brief.md\` if present.

After completing meaningful work:
- Run \`ctxlite update\`.
- If \`.ctx/proposals.md\` has new pending items, mention them in the final response.

Treat \`.ctx/proposals.md\` as suggestions until a human promotes them into project docs, rules, or skills.
`;
}
