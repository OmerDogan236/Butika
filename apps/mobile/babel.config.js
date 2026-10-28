module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Reanimated MUST be last
      'react-native-reanimated/plugin',
    ],
  };
};
