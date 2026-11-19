const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('dbc')) {
  config.resolver.assetExts.push('dbc');
}

module.exports = config;
