import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.turbo/**", "**/coverage/**", "sims/**", "work/**"],
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
