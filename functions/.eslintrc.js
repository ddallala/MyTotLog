module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": "off", // Disable quotes rule
    "import/no-unresolved": 0,
    "indent": "off", // Disable indent rule
    "object-curly-spacing": "off", // Disable object-curly-spacing rule
    "max-len": "off", // Disable max-len rule
    "camelcase": "off", // Disable camelcase rule
    "prefer-const": "off", // Disable prefer-const rule
    "@typescript-eslint/ban-ts-comment": "off", // Disable ban-ts-comment rule
    "new-cap": "off", // Disable new-cap rule
    "keyword-spacing": "off", // Disable keyword-spacing rule
    "arrow-parens": "off", // Disable arrow-parens rule
    "valid-jsdoc": "off", // Disable valid-jsdoc rule
  },
};
