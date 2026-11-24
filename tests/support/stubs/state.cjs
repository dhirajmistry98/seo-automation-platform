/** Shared, resettable fake world the stubs read from (kept on globalThis so every loader sees one copy). */
function fresh() {
  return {
    session: null,                // { user: { id, email, name } } or null (logged out)
    sites: {},                    // domain -> website document
    perms: new Set(),             // permissions the fake user holds on every site
    rate: { allowed: true, retryAfterSeconds: 30 },
    rateCalls: [],
    inserts: [],                  // { name, doc }
    updates: [],                  // { name, filter, update }
    collections: {},              // name -> array returned by find().toArray()
    matched: 1,
    free: {},                     // overrides for the free-research stub
  };
}
function world() { return (globalThis.__t ??= fresh()); }
function reset() { globalThis.__t = fresh(); return globalThis.__t; }
module.exports = { world, reset, fresh };
