import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.turbo/**", "**/coverage/**", "sims/**", "work/**", ".agtx/**", ".egemed-run/**", "playwright-report/**", "test-results/**", "e2e-artifacts/**", ".claude/**", ".agents/**", ".opencode/**", ".codex/**", ".cursor/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "Date.now() yasaktır; now bağımlılığı enjekte edilir (AGENTS.md).",
        },
      ],
    },
  },
);
