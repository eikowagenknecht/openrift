import reactCompiler from "eslint-plugin-react-compiler";
// Minimal ESLint config for React Compiler only
// All other linting is handled by oxlint
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // routeTree.gen.ts is generated and carries its own blanket eslint-disable.
    ignores: ["src/routeTree.gen.ts"],
  },
  {
    // Scoped to src/ on purpose: apps/web accumulates generated and build-output
    // directories (.output/, .tanstack/, coverage/, .sonda/, .wrangler/), and a
    // bundled chunk trips the React Compiler rule with hundreds of meaningless
    // errors. Matching source only is stabler than chasing artifacts in
    // `ignores`. Config files at the package root stay out by the same rule.
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
