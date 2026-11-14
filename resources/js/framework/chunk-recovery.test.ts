import { beforeEach, describe, expect, it } from "vitest";
import { isChunkLoadError, shouldReloadAfterChunkError } from "./chunk-recovery";

describe("outdated build chunk recovery", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        window.history.replaceState({}, "", "/contracts?panel=contracts/new");
    });

    it.each([
        "Failed to fetch dynamically imported module: /build/assets/form-layer-old.js",
        "error loading dynamically imported module: /build/assets/page-old.js",
        "Importing a module script failed.",
        "Failed to load module script",
    ])("recognizes dynamic import failures: %s", (message) => {
        expect(isChunkLoadError(new TypeError(message))).toBe(true);
    });

    it("does not reload for unrelated application errors", () => {
        expect(shouldReloadAfterChunkError(new Error("Invalid data"))).toBe(false);
    });

    it("allows a single reload for the same URL and missing asset", () => {
        const error = new TypeError(
            "Failed to fetch dynamically imported module: /build/assets/form-layer-old.js",
        );
        expect(shouldReloadAfterChunkError(error)).toBe(true);
        expect(shouldReloadAfterChunkError(error)).toBe(false);
    });

    it("can recover another chunk version after a new deployment", () => {
        const previous = new TypeError(
            "Failed to fetch dynamically imported module: /build/assets/form-layer-old.js",
        );
        const next = new TypeError(
            "Failed to fetch dynamically imported module: /build/assets/form-layer-new.js",
        );
        expect(shouldReloadAfterChunkError(previous)).toBe(true);
        expect(shouldReloadAfterChunkError(next)).toBe(true);
    });
});
