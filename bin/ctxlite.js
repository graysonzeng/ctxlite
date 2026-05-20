#!/usr/bin/env node
import { run } from "../src/cli.js";

run().then((code) => {
  if (typeof code === "number") {
    process.exitCode = code;
  }
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ctxlite: ${message}\n`);
  process.exitCode = 1;
});
