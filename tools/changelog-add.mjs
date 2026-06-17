#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SECTION_BY_TYPE = {
  added: "Added",
  changed: "Changed",
  deprecated: "Deprecated",
  removed: "Removed",
  fixed: "Fixed",
  security: "Security",
};

function usage() {
  console.error([
    "Usage:",
    "  pnpm changelog:add -- --type fixed --message \"Fix thing\"",
    "",
    `Types: ${Object.keys(SECTION_BY_TYPE).join(", ")}`,
  ].join("\n"));
  process.exit(1);
}

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const type = argValue("type")?.toLowerCase();
const message = argValue("message")?.trim();

if (!type || !message || !SECTION_BY_TYPE[type]) {
  usage();
}

const section = SECTION_BY_TYPE[type];
const changelogPath = resolve("CHANGELOG.md");
let changelog = readFileSync(changelogPath, "utf8");

if (!/^## \[Unreleased\]/m.test(changelog)) {
  changelog = changelog.replace(
    /(\r?\n)(## \[[^\r\n]+\])/,
    `$1## [Unreleased]$1$1$2`,
  );
}

const unreleasedMatch = changelog.match(/^## \[Unreleased\][\s\S]*?(?=^## \[|\z)/m);
if (!unreleasedMatch) {
  throw new Error("Could not find or create an Unreleased section.");
}

const unreleased = unreleasedMatch[0];
const lineEnding = changelog.includes("\r\n") ? "\r\n" : "\n";
const bullet = `- ${message}`;

let nextUnreleased;
const sectionRegex = new RegExp(`(^### ${section}\\s*)([\\s\\S]*?)(?=^### |\\z)`, "m");
const sectionMatch = unreleased.match(sectionRegex);

if (sectionMatch) {
  const body = sectionMatch[2].trimEnd();
  const replacement = `${sectionMatch[1]}${body ? `${body}${lineEnding}` : ""}${bullet}${lineEnding}${lineEnding}`;
  nextUnreleased = unreleased.replace(sectionRegex, replacement);
} else {
  const insert = `${lineEnding}### ${section}${lineEnding}${lineEnding}${bullet}${lineEnding}`;
  nextUnreleased = unreleased.trimEnd() + insert + lineEnding;
}

changelog = changelog.replace(unreleased, nextUnreleased);
writeFileSync(changelogPath, changelog);
