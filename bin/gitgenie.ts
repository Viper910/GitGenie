#!/usr/bin/env node

import { CommandParser } from '../src/cli/command-parser.js';

// Catch unhandled errors gracefully
process.on('uncaughtException', (err) => {
  console.error('\n[GitGenie Fatal Error]:', err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n[GitGenie Unhandled Rejection]:', reason instanceof Error ? reason.stack || reason.message : reason);
  process.exit(1);
});

async function main() {
  const exitCode = await CommandParser.parseAndRun(process.argv);
  process.exit(exitCode);
}

main();
