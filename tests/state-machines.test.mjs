import test from "node:test";
import assert from "node:assert/strict";
import {
  STATE_MACHINES,
  NOT_STATE_MACHINES,
  canTransition,
  findMachine,
  sourcesOf,
  statesOf,
  transitionFilter,
  assertTransition,
  serviceRequest,
  crawlJob,
} from "../src/lib/state-machines.ts";
import { scanStatusWrites } from "./support/status-writes.mjs";

const FIELDS = [...new Set(STATE_MACHINES.map((item) => item.field))];
const writes = scanStatusWrites(process.cwd(), FIELDS);
const where = (write) => `${write.file}:${write.line}`;

test("state machine definitions are internally consistent", () => {
  const keys = new Set();
  for (const definition of STATE_MACHINES) {
    const key = `${definition.collection}.${definition.field}`;
    assert.ok(!keys.has(key), `${key} is declared twice`);
    keys.add(key);
    const states = new Set(statesOf(definition));
    assert.ok(definition.initial.length > 0, `${key} needs at least one initial state`);
    for (const state of definition.initial) assert.ok(states.has(state), `${key}: initial state ${state} is not declared`);
    for (const [from, targets] of Object.entries(definition.transitions)) {
      for (const to of targets) assert.ok(states.has(to), `${key}: ${from} → ${to} targets an undeclared state`);
    }
    // Every state must be reachable from an initial state.
    const reached = new Set(definition.initial);
    const queue = [...definition.initial];
    while (queue.length) for (const next of definition.transitions[queue.shift()]) if (!reached.has(next)) { reached.add(next); queue.push(next); }
    for (const state of states) assert.ok(reached.has(state), `${key}: state ${state} can never be reached`);
  }
});

test("the scanner finds the status writes it is meant to check", () => {
  assert.ok(writes.length > 100, `expected over 100 status writes, found ${writes.length}`);
  assert.ok(writes.some((write) => write.collection === "seo_crawl_jobs" && write.to.some((to) => to.values.includes("saving"))));
});

test("every status-like write in src/ belongs to a declared state machine", () => {
  const undeclared = writes
    .filter((write) => !findMachine(write.collection, write.field) && !NOT_STATE_MACHINES[`${write.collection}.${write.field}`])
    .map((write) => `${write.collection}.${write.field} at ${where(write)}`);
  assert.deepEqual(undeclared, [], "Declare these in src/lib/state-machines.ts (or list them in NOT_STATE_MACHINES).");
});

test("code only writes declared states and makes declared moves", () => {
  const problems = [];
  for (const write of writes) {
    const definition = findMachine(write.collection, write.field);
    if (!definition) continue;
    const key = `${write.collection}.${write.field}`;
    const states = new Set(statesOf(definition));
    const literalTargets = write.to.filter((to) => to.kind !== "dynamic");
    const fromLiterals = write.from.filter((from) => from.kind === "eq" || from.kind === "in").flatMap((from) => from.values);
    const isInsert = write.from.some((from) => from.kind === "new");

    for (const from of fromLiterals) if (!states.has(from)) problems.push(`${key}: filters on undeclared state "${from}" at ${where(write)}`);
    for (const target of literalTargets) {
      for (const to of target.values) {
        if (!states.has(to)) { problems.push(`${key}: writes undeclared state "${to}" at ${where(write)}`); continue; }
        if (isInsert && !definition.initial.includes(to)) problems.push(`${key}: creates a record in "${to}", which is not an initial state, at ${where(write)}`);
        if (!isInsert && !fromLiterals.length && !sourcesOf(definition, to).length && !definition.initial.includes(to)) {
          problems.push(`${key}: nothing may move to "${to}" (written at ${where(write)})`);
        }
      }
      // Guarded moves: every "from" state named in the filter must be allowed to make the move.
      for (const from of fromLiterals) {
        if (!states.has(from)) continue;
        const allowed = target.kind === "cond"
          ? target.values.some((to) => canTransition(definition, from, to))
          : target.values.every((to) => canTransition(definition, from, to));
        if (!allowed) problems.push(`${key}: ${from} → ${target.values.join(" | ")} is not declared, at ${where(write)}`);
      }
    }
  }
  assert.deepEqual(problems, [], "Update src/lib/state-machines.ts or the code so they agree.");
});

test("transition helpers follow the declared table", () => {
  assert.equal(canTransition(serviceRequest, "open", "accepted"), true);
  assert.equal(canTransition(serviceRequest, "closed", "open"), false);
  assert.deepEqual(transitionFilter(serviceRequest, "cancelled"), { status: { $in: ["accepted"] } });
  assert.deepEqual(sourcesOf(crawlJob, "saving"), ["running"]);
  assert.throws(() => assertTransition(crawlJob, "completed", "running"), /seo_crawl_jobs\.status transition: completed → running/);
});
