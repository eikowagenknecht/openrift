import reactCompiler from "eslint-plugin-react-compiler";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    // `files` below only scopes the React Compiler rule; eslint still walks these
    // generated dirs and flags their eslint-disable comments as unused under --max-warnings=0.
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
    // Scoped to src/: a bundled chunk in the generated dirs above trips the
    // React Compiler rule with hundreds of spurious errors.
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
