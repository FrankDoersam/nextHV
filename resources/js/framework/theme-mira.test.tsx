import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Frame } from "@/components/reui/frame";

afterEach(cleanup);

it("uses the supported REUI base-mira registry style and centralized radius", () => {
    const config = JSON.parse(
        readFileSync(new URL("../../../components.json", import.meta.url), "utf8"),
    ) as { style: string; registries: Record<string, string> };
    const css = readFileSync(new URL("../../css/app.css", import.meta.url), "utf8");
    expect(config.style).toBe("base-mira");
    expect(config.registries["@reui"]).toContain("{style}");
    expect(css).toContain("--radius: 0.5rem");
});

it("renders the compact Mira button, input, card and tab primitives", () => {
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
        .toContain("h-7");
    expect(screen.getByRole("button", { name: "Kompaktaktion" }).className)
        .toContain("h-6");
    expect(screen.getByRole("textbox", { name: "Name" }).className)
        .toContain("h-7");
    expect(screen.getByText("Übersicht", { selector: '[data-slot="card-title"]' }))
        .toHaveClass("text-sm");
    expect(view.container.querySelector('[data-slot="tabs-list"]'))
        .toHaveClass("data-[orientation=horizontal]:h-8");
    expect(screen.getByTestId("reui-frame").className)
        .toContain("[--frame-radius:var(--radius-lg)]");
});
