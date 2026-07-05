import js from "@eslint/js";
import turbo from "eslint-plugin-turbo";
import onlyWarn from "eslint-plugin-only-warn";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export const config = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            turbo,
            "only-warn": onlyWarn,
        },
        rules: {
            "turbo/no-undeclared-env-vars": "warn",
        },
    },
    eslintConfigPrettier,
    {
        ignores: [
            "**/dist/**",
            "**/node_modules/**",
            "**/.turbo/**",
            "**/.next/**",
        ],
    },
];
