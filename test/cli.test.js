import { Readable, Writable } from "node:stream";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli.js";

test("init creates ctx files without overwriting existing content", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    const brief = await readFile(join(dir, ".ctx", "brief.md"), "utf8");
    const config = await readFile(join(dir, ".ctx", "config.yaml"), "utf8");
    const agentContext = await readFile(join(dir, "AGENT_CONTEXT.md"), "utf8");

    assert.match(brief, /# Project Brief/);
    assert.match(config, /planned, not yet implemented: update review controls/);
    assert.match(config, /planned, not yet implemented: source selection/);
    assert.match(agentContext, /Before starting non-trivial work/);

    await writeFile(join(dir, ".ctx", "brief.md"), "custom", "utf8");
    await captureRun(["init"], dir);
    assert.equal(await readFile(join(dir, ".ctx", "brief.md"), "utf8"), "custom");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("update backs up brief, archives inbox, and dedupes proposals", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    await writeFile(join(dir, ".ctx", "inbox.md"), `# Inbox

## Pending

Need docs for release flow and a rule about not editing generated files.

## Archived

`, "utf8");

    await captureRun(["update"], dir);
    const backup = await readFile(join(dir, ".ctx", ".brief.prev.md"), "utf8");
    const brief = await readFile(join(dir, ".ctx", "brief.md"), "utf8");
    const inbox = await readFile(join(dir, ".ctx", "inbox.md"), "utf8");
    const proposals = await readFile(join(dir, ".ctx", "proposals.md"), "utf8");

    assert.match(backup, /Last updated: not yet/);
    assert.match(brief, /Need docs for release flow/);
    assert.match(inbox, /## Pending\n\n## Archived/);
    assert.match(inbox, /processed into brief\/proposals candidate set/);
    assert.equal((proposals.match(/ctxlite:proposal-hash=/g) ?? []).length, 1);

    await writeFile(join(dir, ".ctx", "inbox.md"), `# Inbox

## Pending

Need docs for release flow and a rule about not editing generated files.

## Archived

`, "utf8");
    await captureRun(["update"], dir);
    const deduped = await readFile(join(dir, ".ctx", "proposals.md"), "utf8");
    assert.equal((deduped.match(/ctxlite:proposal-hash=/g) ?? []).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pack emits valid json", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    const { stdout } = await captureRun(["pack", "--format", "json"], dir);
    const parsed = JSON.parse(stdout);

    assert.equal(typeof parsed.brief, "string");
    assert.equal(parsed.git.available, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pack markdown labels pending proposal count", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    const { stdout } = await captureRun(["pack"], dir);
    assert.match(stdout, /## Pending Proposals\n\n0 pending proposal\(s\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("update proposal dedupe is stable across dates", async () => {
  const dir = await tempProject();
  const inboxContent = `# Inbox

## Pending

Need docs for release flow and a rule about not editing generated files.

## Archived

`;
  try {
    await captureRun(["init"], dir);
    await writeFile(join(dir, ".ctx", "inbox.md"), inboxContent, "utf8");
    await withFrozenDate("2026-05-20T00:00:00.000Z", async () => {
      await captureRun(["update"], dir);
    });

    await writeFile(join(dir, ".ctx", "inbox.md"), inboxContent, "utf8");
    await withFrozenDate("2026-05-21T00:00:00.000Z", async () => {
      await captureRun(["update"], dir);
    });

    const proposals = await readFile(join(dir, ".ctx", "proposals.md"), "utf8");
    assert.equal((proposals.match(/ctxlite:proposal-hash=/g) ?? []).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("doctor reports healthy ctx and missing critical files", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);

    await withModelEnv(async () => {
      const healthy = await captureRun(["doctor"], dir);
      assert.equal(healthy.code, 0);
      assert.match(healthy.stdout, /- ok \.ctx\/brief\.md/);
      assert.match(healthy.stdout, /## Warnings\n- none/);
      assert.equal(healthy.stderr, "");

      await rm(join(dir, ".ctx", "proposals.md"));
      const missing = await captureRun(["doctor"], dir);
      assert.equal(missing.code, 1);
      assert.match(missing.stdout, /- missing \.ctx\/proposals\.md/);
      assert.match(missing.stderr, /warning: \.ctx\/proposals\.md is missing/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("doctor warns when brief is much shorter than the previous version", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    await writeFile(join(dir, ".ctx", ".brief.prev.md"), numberedLines(80), "utf8");
    await writeFile(join(dir, ".ctx", "brief.md"), numberedLines(10), "utf8");

    await withModelEnv(async () => {
      const { code, stdout, stderr } = await captureRun(["doctor"], dir);
      assert.equal(code, 1);
      assert.match(stdout, /brief lines: current=10, previous=80/);
      assert.match(stderr, /brief\.md is less than half the previous version/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("update dry-run previews changes without writing ctx files", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    await writeFile(join(dir, ".ctx", "inbox.md"), `# Inbox

## Pending

Add a docs rule for release notes.

## Archived

`, "utf8");
    const briefBefore = await readFile(join(dir, ".ctx", "brief.md"), "utf8");
    const inboxBefore = await readFile(join(dir, ".ctx", "inbox.md"), "utf8");
    const proposalsBefore = await readFile(join(dir, ".ctx", "proposals.md"), "utf8");

    await withModelEnv(async () => {
      const { code, stdout } = await captureRun(["update", "--dry-run"], dir);
      assert.equal(code, 0);
      assert.match(stdout, /# ctxlite update dry run/);
      assert.match(stdout, /Add a docs rule for release notes/);
    });

    assert.equal(await readFile(join(dir, ".ctx", "brief.md"), "utf8"), briefBefore);
    assert.equal(await readFile(join(dir, ".ctx", "inbox.md"), "utf8"), inboxBefore);
    assert.equal(await readFile(join(dir, ".ctx", "proposals.md"), "utf8"), proposalsBefore);
    await assert.rejects(() => readFile(join(dir, ".ctx", ".last-update.json"), "utf8"), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("update notes file is folded into the brief and archived", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    await writeFile(join(dir, "notes.md"), "Need docs for onboarding and a rule for generated files.", "utf8");

    await withModelEnv(async () => {
      const { code } = await captureRun(["update", "--notes", "notes.md"], dir);
      assert.equal(code, 0);
    });

    const brief = await readFile(join(dir, ".ctx", "brief.md"), "utf8");
    const inbox = await readFile(join(dir, ".ctx", "inbox.md"), "utf8");
    assert.match(brief, /Need docs for onboarding/);
    assert.match(inbox, /> Need docs for onboarding and a rule for generated files\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("commands that require ctx fail before init", async () => {
  const dir = await tempProject();
  try {
    await assert.rejects(() => captureRun(["update"], dir), /missing \.ctx directory; run ctxlite init first/);
    await assert.rejects(() => captureRun(["pack"], dir), /missing \.ctx directory; run ctxlite init first/);
    await assert.rejects(() => captureRun(["doctor"], dir), /missing \.ctx directory; run ctxlite init first/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unknown command rejects with the command name", async () => {
  await assert.rejects(() => captureRun(["does-not-exist"], process.cwd()), /unknown command: does-not-exist/);
});

test("update truncates an oversized brief according to the configured budget", async () => {
  const dir = await tempProject();
  try {
    await captureRun(["init"], dir);
    await writeFile(join(dir, ".ctx", "config.yaml"), `project_name: ctxlite-test
brief_budget_tokens: 1
`, "utf8");
    const fakeBin = join(dir, "fake-bin");
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, "git"), fakeGitScript(), "utf8");
    await chmod(join(fakeBin, "git"), 0o755);

    await withEnv("PATH", `${fakeBin}:${process.env.PATH ?? ""}`, async () => {
      const { code } = await captureRun(["update"], dir);
      assert.equal(code, 0);
    });

    const brief = await readFile(join(dir, ".ctx", "brief.md"), "utf8");
    assert.match(brief, /\[ctxlite truncated this brief to fit the configured budget\.\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function tempProject() {
  return mkdtemp(join(tmpdir(), "ctxlite-test-"));
}

async function captureRun(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const out = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      callback();
    }
  });
  const err = new Writable({
    write(chunk, _encoding, callback) {
      stderr += chunk.toString();
      callback();
    }
  });
  const stdin = Readable.from([]);
  const code = await run(argv, { cwd, stdout: out, stderr: err, stdin });
  return { code, stdout, stderr };
}

async function withModelEnv(fn) {
  await withEnv("CTXLITE_BASE_URL", "http://example.invalid", async () => {
    await withEnv("CTXLITE_API_KEY", "test-key", fn);
  });
}

async function withEnv(name, value, fn) {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

async function withFrozenDate(isoString, fn) {
  const RealDate = globalThis.Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(isoString);
      } else {
        super(...args);
      }
    }

    static now() {
      return new RealDate(isoString).getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  }

  globalThis.Date = FrozenDate;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

function numberedLines(count) {
  return Array.from({ length: count }, (_item, index) => `line ${index + 1}`).join("\n");
}

function fakeGitScript() {
  return `#!/bin/sh
if [ "$1" = "rev-parse" ]; then
  echo true
  exit 0
fi
if [ "$1" = "status" ]; then
  i=1
  while [ "$i" -le 80 ]; do
    echo " M file-$i.txt"
    i=$((i + 1))
  done
  exit 0
fi
if [ "$1" = "diff" ]; then
  i=1
  while [ "$i" -le 80 ]; do
    echo " file-$i.txt | 1 +"
    i=$((i + 1))
  done
  exit 0
fi
if [ "$1" = "log" ]; then
  echo "abc1234 test commit"
  exit 0
fi
exit 1
`;
}
