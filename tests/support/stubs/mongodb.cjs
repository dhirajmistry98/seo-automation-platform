const { world } = require("./state.cjs");
function collection(name) {
  const w = () => world();
  const cursor = (rows) => { const c = { sort: () => c, limit: () => c, project: () => c, toArray: async () => rows }; return c; };
  return {
    insertOne: async (doc) => { w().inserts.push({ name, doc }); return { insertedId: "id-" + w().inserts.length }; },
    updateOne: async (filter, update) => { w().updates.push({ name, filter, update }); return { matchedCount: w().matched, modifiedCount: w().matched }; },
    find: () => cursor(w().collections[name] ?? []),
    findOne: async () => (w().collections[name] ?? [])[0] ?? null,
    createIndex: async () => "idx",
    countDocuments: async () => (w().collections[name] ?? []).length,
  };
}
const db = { collection };
exports.__esModule = true;
exports.default = Promise.resolve({ db: () => db });
