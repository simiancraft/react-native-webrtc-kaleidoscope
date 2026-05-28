// Expo + NativeWind v4: jsxImportSource routes JSX through NativeWind so core
// components accept className, and the nativewind/babel preset wires the rest.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
