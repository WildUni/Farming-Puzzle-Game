// ESLint flat config. Formatting is left to Prettier (see .prettierrc).
import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
    { ignores: ["dist/", "node_modules/", "public/", "log.js"] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        // Vite configs run in Node.
        files: ["vite/**/*.mjs"],
        languageOptions: { globals: { process: "readonly" } }
    },
    {
        // src/sim holds the game rules and must stay free of Phaser (see notes/Build Plan.md).
        files: ["src/sim/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                { paths: [{ name: "phaser", message: "src/sim must not import Phaser." }] }
            ]
        }
    }
)
