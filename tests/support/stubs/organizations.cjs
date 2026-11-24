const { world } = require("./state.cjs");
exports.__esModule = true;
/** The fake user holds exactly the permissions in world().perms on every site that exists. */
exports.findAccessibleWebsite = async (_db, _userId, domain, permission) => {
  const t = world();
  const website = t.sites[domain];
  if (!website || !t.perms.has(permission)) return { website: null, membership: null };
  return { website, membership: { role: "owner" } };
};
