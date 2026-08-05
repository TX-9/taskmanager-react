// Build tooling config. Declares a `@` -> `src` alias (mirrored in
// tsconfig.json's `paths`) available for absolute imports, though this
// codebase uses relative imports throughout for clarity.
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": "/src",
        },
    },
    server: {
        port: 5173,
    },
    test: {
        environment: "jsdom",
        globals: true,
    },
});
