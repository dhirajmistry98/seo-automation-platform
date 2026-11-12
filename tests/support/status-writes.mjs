// Static scan of MongoDB writes: for each `.collection("x").<write>(filter, update)` call it records which
// literal values a status-like field is filtered on (the "from" states) and set to (the "to" states).
// Used by tests/state-machines.test.mjs to keep src/lib/state-machines.ts in sync with the code.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WRITE = /(?:collection(?:<[^>]*>)?\(\s*["'`]([\w-]+)["'`]\s*\)|\b(\w+))\s*\.\s*(updateOne|updateMany|findOneAndUpdate|insertOne|insertMany)\s*\(/g;
const VAR = /(?:const|let)\s+(\w+)\s*=\s*[\w.]+\.collection(?:<[^>]*>)?\(\s*["'`]([\w-]+)/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

function balanced(source, start) {
  let depth = 1;
  let index = start;
  let quote = null;
  while (index < source.length && depth) {
    const char = source[index];
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = null; }
    else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    index += 1;
  }
  return source.slice(start, index - 1);
}

function splitTopLevel(body) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("{[(".includes(char)) depth += 1;
    else if ("}])".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) return [body.slice(0, index), body.slice(index + 1)];
  }
  return [body, ""];
}

/**
 * Positions inside nested data (array elements other than $or/$and/update pipelines, and $elemMatch objects)
 * belong to embedded documents such as milestones, not to the record's own status, so they are skipped.
 */
function nestedDataMask(fragment) {
  const mask = new Uint8Array(fragment.length);
  const stack = [];
  let quote = null;
  for (let index = 0; index < fragment.length; index += 1) {
    const char = fragment[index];
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = null; }
    else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "[" || char === "{") {
      const before = fragment.slice(Math.max(0, index - 20), index);
      const after = fragment.slice(index + 1, index + 12);
      const data = char === "["
        ? !/\$(or|and|nor)\s*:\s*$/.test(before) && !/^\s*\{\s*\$(set|unset|inc|addFields)\b/.test(after)
        : /\$elemMatch\s*:\s*$/.test(before);
      stack.push(data);
    } else if (char === "]" || char === "}") stack.pop();
    if (stack.includes(true)) mask[index] = 1;
  }
  return mask;
}

/** Values a field takes in a fragment: literals, $in/$nin/$ne lists, and $cond literal branches. Non-literals are reported as dynamic. */
function fieldValues(fragment, field) {
  const found = [];
  const mask = nestedDataMask(fragment);
  const pattern = new RegExp(`(?<![\\w.$"])${field}\\s*:\\s*`, "g");
  for (const match of fragment.matchAll(pattern)) {
    if (mask[match.index]) continue;
    const rest = fragment.slice(match.index + match[0].length);
    const literal = rest.match(/^"([a-z_]+)"/);
    if (literal) { found.push({ kind: "eq", values: [literal[1]] }); continue; }
    const op = rest.match(/^\{\s*\$(in|nin|ne)\s*:\s*(\[[^\]]*\]|"[a-z_]+")/);
    if (op) { found.push({ kind: op[1], values: [...op[2].matchAll(/"([a-z_]+)"/g)].map((item) => item[1]) }); continue; }
    if (/^\{\s*\$(exists|lt|lte|gt|gte)\b/.test(rest)) continue;
    const cond = rest.match(/^\{\s*\$cond\s*:\s*\[[\s\S]*?,\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"\s*\]/);
    if (cond) { found.push({ kind: "cond", values: [cond[1], cond[2]] }); continue; }
    const ternary = rest.match(/^[\w.?]+\s*(?:>=|<=|===|!==|>|<)?[^?,}]*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/);
    if (ternary) { found.push({ kind: "cond", values: [ternary[1], ternary[2]] }); continue; }
    found.push({ kind: "dynamic", values: [], expression: rest.match(/^[^,}\n]*/)[0].trim() });
  }
  return found;
}

export function scanStatusWrites(root, fields) {
  const writes = [];
  for (const path of files(join(root, "src"))) {
    const source = readFileSync(path, "utf8");
    const variables = Object.fromEntries([...source.matchAll(VAR)].map((match) => [match[1], match[2]]));
    for (const match of source.matchAll(WRITE)) {
      const collection = match[1] || variables[match[2]];
      if (!collection) continue;
      const body = balanced(source, match.index + match[0].length);
      const insert = match[3].startsWith("insert");
      const [filter, update] = insert ? ["", body] : splitTopLevel(body);
      for (const field of fields) {
        const to = fieldValues(update, field);
        if (!to.length) continue;
        const from = insert ? [{ kind: "new", values: [] }] : fieldValues(filter, field);
        writes.push({ collection, field, file: relative(root, path), line: source.slice(0, match.index).split("\n").length, from, to });
      }
    }
  }
  return writes;
}
