import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { Label } from "@/components/ui/label";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Frame } from "@/components/reui/frame";

afterEach(cleanup);

it("uses the supported REUI base-nova registry style and centralized radius", () => {
    const config = JSON.parse(
        readFileSync(join(process.cwd(), "components.json"), "utf8"),
    ) as { style: string; registries: Record<string, string> };
    const css = readFileSync(join(process.cwd(), "resources/css/app.css"), "utf8");
    expect(config.style).toBe("base-nova");
    expect(config.registries["@reui"]).toContain("{style}");
    expect(css).toContain("--radius: 0.625rem");
    expect(css).toContain("--radius-4xl: calc(var(--radius) + 18px)");
    expect(css).toContain("--control-height: 2rem");
    expect(css).toContain("--control-height-lg: 2.25rem");
    expect(css).toContain("--control-height-field: 2rem");
    expect(css).toContain('[data-slot="field-control"]');
    // Nova action sizes follow the reference; collection toolbars retain their 40px scope.
    expect(css).toMatch(/\[data-slot="collection-toolbar"\]\s*\{\s*--control-height: 2\.5rem;/);
});

it("renders the compact Nova button, input, card and tab primitives", () => {
    const view = render(
        <div>
            <Button>Standardaktion</Button>
            <Button size="sm">Kompaktaktion</Button>
            <Input aria-label="Name" />
            <Label htmlFor="name">Name</Label>
            <Card><CardTitle>Übersicht</CardTitle></Card>
            <Tabs defaultValue="overview">
                <TabsList><TabsTrigger value="overview">Übersicht</TabsTrigger></TabsList>
            </Tabs>
            <Frame data-testid="reui-frame">Frame</Frame>
        </div>,
    );
    expect(screen.getByRole("button", { name: "Standardaktion" }).className)
        .toContain("h-(--control-height)");
    expect(screen.getByRole("button", { name: "Standardaktion" }).className)
        .toContain("rounded-lg");
    expect(screen.getByRole("button", { name: "Kompaktaktion" }).className)
        .toContain("h-7");
    expect(screen.getByRole("textbox", { name: "Name" }).className)
        .toContain("h-(--control-height)");
    expect(screen.getByRole("textbox", { name: "Name" }).className)
        .toContain("rounded-lg");
    expect(screen.getByText("Übersicht", { selector: '[data-slot="card-title"]' }))
        .toHaveClass("text-base");
    expect(view.container.querySelector('[data-slot="card"]')).toHaveClass("rounded-xl");
    expect(view.container.querySelector('[data-slot="tabs-list"]'))
        .toHaveClass("data-[orientation=horizontal]:h-9");
    expect(view.container.querySelector('[data-slot="tabs-list"]')).toHaveClass("rounded-lg");
    expect(screen.getByTestId("reui-frame").className)
        .toContain("[--frame-radius:var(--radius-xl)]");
});

it("uses registry sizing for Nova Select and control-height tokens for other action primitives", () => {
    const view = render(
        <div data-slot="collection-toolbar">
            <Input aria-label="Suche" />
            <InputGroup data-testid="combined-input" />
            <Select defaultValue="a">
                <SelectTrigger aria-label="Native Auswahl">
                    <SelectValue />
                </SelectTrigger>
            </Select>
            <ChoicePicker
                value={null}
                onChange={() => {}}
                options={[{ value: "a", label: "A" }]}
                aria-label="Filter"
                presentation="menu"
            />
            <ChoicePicker
                value={null}
                onChange={() => {}}
                options={[{ value: "a", label: "A" }]}
                aria-label="Relation"
                presentation="input"
            />
            <Button>Neu</Button>
            <Button size="icon-lg" aria-label="Aktualisieren">+</Button>
        </div>,
    );
    // The upstream ReUI Base Nova select uses registry-defined 32px/28px sizes.
    // Other form controls use NextHV's configurable control-height tokens.
    const selectTrigger = view.container.querySelector('[data-slot="select-trigger"]');
    expect(selectTrigger).toHaveAttribute("data-size", "default");
    expect(selectTrigger?.className).toContain("cn-select-trigger");
    const novaStyles = readFileSync(join(process.cwd(), "resources/css/reui-base-nova.css"), "utf8");
    expect(novaStyles).toContain("data-[size=default]:h-8");
    expect(screen.getByRole("combobox", { name: "Filter" }).className)
        .toContain("h-(--control-height)");
    expect(screen.getByRole("combobox", { name: "Relation" })
        .closest('[data-slot="input-group"]')?.className)
        .toContain("h-(--control-height)");
    expect(screen.getByRole("button", { name: "Neu" }).className)
        .toContain("h-(--control-height)");
    expect(screen.getByRole("textbox", { name: "Suche" }).className)
        .toContain("h-(--control-height)");
    expect(screen.getByTestId("combined-input").className)
        .toContain("h-(--control-height)");
    expect(screen.getByRole("button", { name: "Aktualisieren" }).className)
        .toContain("size-(--control-height-lg)");
});
