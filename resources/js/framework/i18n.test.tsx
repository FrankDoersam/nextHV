import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { I18nProvider, createTranslator, useI18n } from "./i18n";
afterEach(() => {
    cleanup();
    localStorage.clear();
});
it("falls back without exposing keys and interpolates plural messages", () => {
    const t = createTranslator("en", {
        de: { title: "Titel" },
        en: { count: { one: "{count} record", other: "{count} records" } },
    });
    expect(t("title")).toBe("Titel");
    expect(t("internal.missing", {}, "Feld")).toBe("Feld");
    expect(t("internal.missing")).toBe("—");
    expect(t("count", { count: 1 })).toBe("1 record");
    expect(t("count", { count: 2 })).toBe("2 records");
});
it("changes language and formatting without remounting unsaved inputs", () => {
    function Demo() {
        const { t, money, locale, setLocale } = useI18n();
        return (
            <>
                <input aria-label="Name" defaultValue="" />
                <button onClick={() => setLocale("en")}>Switch</button>
                <span>{locale}</span>
                <output>
                    {t("save")} {money(1234.5)}
                </output>
            </>
        );
    }
    render(
        <I18nProvider>
            <Demo />
        </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Nicht verlieren" },
    });
    fireEvent.click(screen.getByText("Switch"));
    expect(screen.getByRole("textbox")).toHaveValue("Nicht verlieren");
    expect(screen.getByRole("status")).toHaveTextContent("Save €1,234.50");
    expect(localStorage.getItem("nexthv:locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
});
it("allows module catalogs and an external translator to override core defaults", () => {
    const t = createTranslator("de", { de: { save: "Übernehmen" } }, "de", {
        translate: (key) => (key === "custom" ? "Hallo {name}" : undefined),
    });
    expect(t("save")).toBe("Übernehmen");
    expect(t("custom", { name: "Anna" })).toBe("Hallo Anna");
});
