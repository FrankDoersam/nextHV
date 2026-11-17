import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ContentCard } from "./content-card";

afterEach(cleanup);

it("renders a Nova property section with one card layer and a direct body", () => {
    const { container } = render(
        <ContentCard appearance="single" title="Gebäude & Verwaltung" description="Daten auf einen Blick">
            <dl><dt>Baujahr</dt><dd>2001</dd></dl>
        </ContentCard>,
    );
    const card = container.querySelector('[data-slot="content-card"]');
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("rounded-xl");
    expect(card!.querySelectorAll('[data-slot="card-content"]')).toHaveLength(1);
    expect(card!.querySelector('[data-slot="frame-panel"]')).toBeNull();
    expect(screen.getByText("Baujahr")).toBeVisible();
    expect(screen.getByText("Gebäude & Verwaltung")).toBeVisible();
});

it("keeps the existing REUI Frame rendering for other sections", () => {
    const { container } = render(<ContentCard title="Standard">Inhalt</ContentCard>);
    const card = container.querySelector('[data-slot="content-card"]');
    expect(card).toBeInTheDocument();
    expect(card!.querySelectorAll('[data-slot="frame-panel"]')).toHaveLength(1);
});