const { world } = require("./state.cjs");
exports.__esModule = true;
exports.auth = async () => world().session;
