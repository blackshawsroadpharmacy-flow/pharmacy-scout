import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("pharmacies render as labelled red P markers while retaining evidence states", async () => {
  const source = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(source, /\.pharmacy-pin::before\s*\{\s*content: "P"/);
  assert.match(source, /\.pharmacy-pin\s*\{[\s\S]*?background: #ef1b24/);
  assert.match(source, /\.pharmacy-pin\.approximate\s*\{[\s\S]*?border-style: dashed/);
  assert.match(source, /\.pharmacy-pin\.verified\s*\{[\s\S]*?background: #0f9d8a/);
  assert.match(source, /\.pharmacy-pin\.partial\s*\{[\s\S]*?background: #d97706/);
});
