import reactCompiler from "eslint-plugin-react-compiler";
// Minimal ESLint config for React Compiler only
// All other linting is handled by oxlint
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // routeTree.gen.ts is generated and carries its own blanket eslint-disable.
    // The generated directories need listing here as well as being excluded by
    // `files` below: `files` only decides which files the React Compiler rule
    // runs on, while eslint still walks everything else and reports the inline
    // eslint-disable comments it finds there as unused directives. Under
    // `--max-warnings=0` that fails `bun lint` on any machine that has run a
    // build or `test:coverage`.
    ignores: [
      "src/routeTree.gen.ts",
      ".output/",
      ".tanstack/",
      ".sonda/",
      ".wrangler/",
      "coverage/",
      "dist/",
      "dist-ssr/",
    ],
  },
  {
    // Scoped to src/ on purpose: a bundled chunk in one of the generated
    // directories above trips the React Compiler rule with hundreds of
    // meaningless errors. Config files at the package root stay out by the
    // same rule.
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    extends: [tseslint.configs.base],
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "error",
    },
  },
);
