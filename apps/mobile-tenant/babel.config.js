/**
 * Same shape as the staff app: reanimated plugin must run last.
 * See apps/mobile/babel.config.js for the original incident notes.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
