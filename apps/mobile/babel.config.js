/**
 * Babel config for the Expo (RN 0.74 / SDK 51) staff app.
 *
 * Why this file exists at all: `react-native-reanimated` 3.x has a babel
 * plugin that rewrites worklet-tagged functions. Without it loaded LAST in
 * the plugin chain, JS bundling fails during EAS's
 * `:app:bundleReleaseJsAndAssets` gradle task — exactly the build phase
 * that broke our first preview build.
 *
 * Keep `react-native-reanimated/plugin` at the end of `plugins[]` for the
 * rest of time.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
