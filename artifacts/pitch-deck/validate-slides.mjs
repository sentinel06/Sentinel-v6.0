#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, "src", "data", "slides-manifest.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
} catch (e) {
  console.error("ERROR: Could not read slides-manifest.json:", e.message);
  process.exit(1);
}

const errors = [];

const positions = [...manifest].map((s) => s.position).sort((a, b) => a - b);
for (let i = 0; i < positions.length; i++) {
  if (positions[i] !== i + 1) {
    errors.push(`Positions not contiguous: expected ${i + 1}, got ${positions[i]}`);
    break;
  }
}

for (const slide of manifest) {
  const fp = path.join(__dirname, slide.filepath);
  if (!existsSync(fp)) {
    errors.push(`Slide "${slide.title}" (pos ${slide.position}): not found at ${slide.filepath}`);
  }
  if (!slide.id || !slide.title || !slide.filepath) {
    errors.push(`Slide at position ${slide.position} missing required fields`);
  }
}

const ids = manifest.map((s) => s.id);
if (new Set(ids).size !== ids.length) {
  errors.push("Duplicate slide IDs found");
}

if (errors.length > 0) {
  console.error("validate-slides FAILED:");
  errors.forEach((e) => console.error("  -", e));
  process.exit(1);
} else {
  console.log(`validate-slides PASSED: ${manifest.length} slides OK`);
}
