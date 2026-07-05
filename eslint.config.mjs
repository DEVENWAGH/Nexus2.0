import { config as sharedConfig } from "@repo/eslint-config/flat.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...sharedConfig,
    {
        ignores: [
            "**/.next/**",
            "**/dist/**",
            "**/node_modules/**",
            "**/.turbo/**",
        ],
    },
];
