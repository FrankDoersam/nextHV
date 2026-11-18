import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ButtonGroup } from "@/components/ui/button-group";
import { Progress } from "@/components/ui/progress";
import { IconTile } from "@/components/reui/icon-tile";
import { IconPlaceholder } from "@/components/reui/base-icon-placeholder";
import {
    countFilterRules, createFilterGroup, createFilterQuery, createFilterRule,
    flattenFilterConditions,
} from "@/components/reui/filters/filters-query";

afterEach(cleanup);

it("renders reusable Base controls and resolves a Lucide icon", () => {
    const { container } = render(
        <div>
            <ButtonGroup aria-label="Ansichten">
                <button type="button">Alle</button>
                <button type="button">Aktiv</button>
            </ButtonGroup>
            <Progress value={45} aria-label="Fortschritt" />
            <IconTile><IconPlaceholder lucide="CheckIcon" aria-label="Fertig" /></IconTile>
        </div>,
    );
    expect(screen.getByRole("group", { name: "Ansichten" })).toBeVisible();
    expect(container.querySelector('[data-slot="progress-track"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="icon-tile"] svg')).toBeInTheDocument();
});

it("retains nested AND/OR rules and typed filter values", () => {
    const query = createFilterQuery<unknown>([
        createFilterRule({ id: "one", path: ["status"], operator: "is", value: "active" }),
        createFilterGroup<unknown>({
            id: "nested",
            combinator: "or",
            rules: [
                createFilterRule({ id: "two", path: ["channel"], operator: "is", value: "search" }),
                createFilterRule({ id: "three", path: ["spend"], operator: "gte", value: 100 }),
            ],
        }),
    ]);
    expect(countFilterRules(query)).toBe(3);
    expect(flattenFilterConditions(query).map((item) => item.values))
        .toEqual([["active"], ["search"], [100]]);
    expect(query.rules[1]).toMatchObject({ type: "group", combinator: "or" });
});
