module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: ['transform-remove-strict-mode'],
  env: {
    production: {
      plugins: ['transform-remove-console'],
    },
  },
};