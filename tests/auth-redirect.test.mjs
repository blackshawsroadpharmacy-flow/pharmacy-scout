import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/auth-redirect.ts", import.meta.url), "utf8");
const body = source
  .replace("export function safeSameOriginPath", "function safeSameOriginPath")
  .replace("value: string | undefined", "value")
  .replace("): string {", ") {")
  .concat("\nreturn safeSameOriginPath;");
const safeSameOriginPath = Function(body)();

test("auth redirects accept only same-origin absolute paths", () => {
  assert.equal(
    safeSameOriginPath("/app/acquisitions?view=mine#top"),
    "/app/acquisitions?view=mine#top",
  );
  assert.equal(safeSameOriginPath("https://evil.example/steal"), "/app");
  assert.equal(safeSameOriginPath("//evil.example/steal"), "/app");
  assert.equal(safeSameOriginPath("/\\evil.example"), "/app");
  assert.equal(safeSameOriginPath(undefined), "/app");
});
