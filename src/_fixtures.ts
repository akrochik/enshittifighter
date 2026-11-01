// Test-only helper (like _testkit.ts): finds the Phase-0 fixtures and skips — rather than errors —
// the tests that need one that isn't on disk. Not imported by any runtime module.
//
// fixtures/*.json are real captured Facebook responses, gitignored on purpose (private session
// data), so a fresh clone doesn't have them. A suite or test declares the fixture files it reads;
// if any is missing it is reported as skipped, with a console notice saying why, and everything
// else still runs. With the files present nothing is skipped — so a skipped count on a machine
// that HAS the fixtures means a file was deleted or a filename in one of these calls is mistyped.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'vitest';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** The names in `files` that are not present in `dir`. */
export function missingFixtures(files: readonly string[], dir: string = FIX): string[] {
  return files.filter((f) => !existsSync(join(dir, f)));
}

/** Reads a fixture's text. Only call it from inside a test or a hook, never straight in a suite body. */
export const readFixture = (file: string): string => readFileSync(join(FIX, file), 'utf8');

function warnSkipped(what: string, missing: readonly string[]): void {
  console.warn(
    `[fixtures] skipping "${what}": ${missing.map((f) => `fixtures/${f}`).join(', ')} not found ` +
      '(private capture, gitignored — absent on a fresh clone)',
  );
}

/**
 * `describe`, but skipped if any of `files` is missing from fixtures/.
 *
 * Vitest still RUNS the body of a skipped suite (that is how it finds the tests to mark as
 * skipped), so the body must not read a fixture itself: do that in a `beforeAll` or in the tests.
 */
export function describeWithFixtures(files: readonly string[], title: string, body: () => void): void {
  const missing = missingFixtures(files);
  if (missing.length > 0) warnSkipped(title, missing);
  describe.skipIf(missing.length > 0)(title, body);
}

/** `it`, but skipped if any of `files` is missing from fixtures/. */
export function itWithFixtures(files: readonly string[], title: string, fn: () => void | Promise<void>): void {
  const missing = missingFixtures(files);
  if (missing.length > 0) warnSkipped(title, missing);
  it.skipIf(missing.length > 0)(title, fn);
}
