import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// MongoDB rejects an update that names the same field in two operators, e.g. `$set: { userId }` with
// `$setOnInsert: { userId }`, with "Updating the path 'userId' would create a conflict at 'userId'".
// This scans every update call in src/ for literal keys repeated across operators.
const OPERATORS = ["$set", "$setOnInsert", "$unset", "$inc", "$mul", "$min", "$max", "$push", "$addToSet", "$pull", "$pullAll", "$pop", "$rename", "$currentDate"];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

function closing(source, start, open, close) {
  let depth = 1;
  let index = start;
  let quote = null;
  while (index < source.length && depth) {
    const char = source[index];
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = null; }
    else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === open) depth += 1;
    else if (char === close) depth -= 1;
    index += 1;
  }
  return index - 1;
}

function topLevelKeys(objectBody) {
  const keys = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  const text = `${objectBody},`;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("{[(".includes(char)) depth += 1;
    else if ("}])".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      const part = text.slice(start, index).trim();
      start = index + 1;
      if (!part || part.startsWith("...")) continue;
      const key = (part.includes(":") ? part.slice(0, part.indexOf(":")) : part).trim().replace(/^["']|["']$/g, "");
      if (/^[\w.$]+$/.test(key)) keys.push(key);
    }
  }
  return keys;
}

test("no MongoDB update names the same field in two operators", () => {
  const conflicts = [];
  let updates = 0;
  for (const path of files(join(process.cwd(), "src"))) {
    const source = readFileSync(path, "utf8");
    for (const call of source.matchAll(/\.(updateOne|updateMany|findOneAndUpdate)\s*\(/g)) {
      updates += 1;
      const start = call.index + call[0].length;
      const body = source.slice(start, closing(source, start, "(", ")"));
      const owners = new Map();
      for (const operator of OPERATORS) {
        for (const match of body.matchAll(new RegExp(`\\${operator}\\s*:\\s*\\{`, "g"))) {
          const objectStart = match.index + match[0].length;
          for (const key of topLevelKeys(body.slice(objectStart, closing(body, objectStart, "{", "}")))) {
            owners.set(key, [...(owners.get(key) || []), operator]);
          }
        }
      }
      for (const [key, operators] of owners) {
        // Same root path in two operators also conflicts, e.g. `a` with `a.b`.
        const related = [...owners.keys()].filter((other) => other !== key && other.startsWith(`${key}.`));
        if (operators.length > 1 || related.length) {
          conflicts.push(`${relative(process.cwd(), path)}:${source.slice(0, call.index).split("\n").length} "${key}" in ${[...operators, ...related.map((other) => `${other} (${owners.get(other).join(", ")})`)].join(" + ")}`);
        }
      }
    }
  }
  assert.ok(updates > 100, `expected to scan over 100 updates, scanned ${updates}`);
  assert.deepEqual(conflicts, []);
});
