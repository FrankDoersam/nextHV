import { viteStaticCopy } from "vite-plugin-static-copy";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import laravel from "laravel-vite-plugin";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
const pdfRoot = dirname(
    createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
);
export default defineConfig({
    plugins: [
        laravel({ input: ["resources/js/app.tsx"], refresh: true }),
        react(),
        tailwindcss(),
        viteStaticCopy({
            targets: ["cmaps", "wasm", "standard_fonts"].map((folder) => ({
                src: join(pdfRoot, folder, "*"),
                dest: `pdf/${folder}`,
                rename: { stripBase: true },
            })),
        }),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./resources/js", import.meta.url)),
        },
    },
});
