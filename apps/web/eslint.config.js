import reactCompiler from "eslint-plugin-react-compiler";
// Minimal ESLint config for React Compiler only
// All other linting is handled by oxlint
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", "*.config.js", "*.config.ts"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [tseslint.configs.base],
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "error",
    },
  },
);
