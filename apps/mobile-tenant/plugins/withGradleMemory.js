/**
 * Bump the Gradle daemon's JVM memory so KSP (expo-updates) + CMake native
 * compilation don't run out of Metaspace during release builds. The Expo
 * template's default (-Xmx2g / MaxMetaspaceSize 512m) is too small for this
 * app's native module set and OOMs the build ("Metaspace").
 */
const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const set = (key, value) => {
      const existing = props.find((p) => p.type === 'property' && p.key === key);
      if (existing) existing.value = value;
      else props.push({ type: 'property', key, value });
    };
    set('org.gradle.jvmargs', '-Xmx6144m -XX:MaxMetaspaceSize=2048m -Dfile.encoding=UTF-8');
    return cfg;
  });
};
