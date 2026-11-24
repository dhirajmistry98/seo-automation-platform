const { world } = require("./state.cjs");
exports.__esModule = true;
exports.consumeRateLimit = async (_db, scope, identity, limit, windowMs) => {
  const t = world();
  t.rateCalls.push({ scope, identity, limit, windowMs });
  return t.rate;
};
