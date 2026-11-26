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
        // Only src/render may use Phaser. src/sim must run in plain Node, and
        // src/render/format.ts and cues.ts stay Phaser-free so they can be unit tested.
        files: ["src/**/*.ts"],
        ignores: ["src/render/**"],
        rules: {
            "no-restricted-imports": [
                "error",
                { paths: [{ name: "phaser", message: "Only src/render may import Phaser." }] }
            ]
        }
    },
    {
        files: ["src/render/format.ts", "src/render/cues.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "phaser",
                            message: "format.ts and cues.ts must stay Phaser-free."
                        }
                    ]
                }
            ]
        }
    }
)
