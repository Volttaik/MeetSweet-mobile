const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Exclude backend_source from Metro's file watcher — it has its own
// node_modules that Metro doesn't need and can't watch safely.
config.resolver = config.resolver ?? {};
config.resolver.blockList = [/backend_source\/.*/, /\.local\/share\/pnpm\/.*/];

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
});
