#!/usr/bin/env node
/**
 * scripts/respond-issues.ts
 *
 * Reads `command_results.json` and uses the GitHub CLI (`gh`) to comment
 * the feedback message on each command issue and close it.
 * Invoked as a workflow step after `npm run tick` in the tick action.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const commandResultsPath = path.join(moduleDir, '..', 'command_results.json');

interface CommandResult {
  id: number;
  login: string;
  success: boolean;
  message: string;
}

function main(): void {
  if (!existsSync(commandResultsPath)) {
    console.log('No command results file found. Skipping responding.');
    return;
  }

  let results: CommandResult[] = [];
  try {
    results = JSON.parse(readFileSync(commandResultsPath, 'utf-8'));
    if (!Array.isArray(results)) {
      throw new Error('Command results JSON is not an array.');
    }
  } catch (err: any) {
    console.error('Failed to parse command_results.json:', err.message);
    process.exit(1);
  }

  console.log(`Responding to ${results.length} issue(s)...`);

  for (const res of results) {
    const issueNum = String(res.id);
    const body = `@${res.login} ${res.message}`;

    try {
      // Leave comment on issue
      execFileSync('gh', ['issue', 'comment', issueNum, '--body', body], { stdio: 'inherit' });
      console.log(`Commented on issue #${issueNum}`);

      // Close the issue
      execFileSync('gh', ['issue', 'close', issueNum], { stdio: 'inherit' });
      console.log(`Closed issue #${issueNum}`);
    } catch (err: any) {
      console.error(`Failed to respond/close issue #${issueNum}:`, err.message);
    }
  }
}

main();
