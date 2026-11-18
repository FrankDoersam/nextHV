import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
    buildEnterprisePage,
    selectEnterpriseRows,
} from "@/framework/tables/enterprise-model";
import { demoQuery } from "./demo-shared";
import { propertiesDemoConfig } from "./properties-demo";

afterEach(cleanup);

describe("property master data", () => {
    it("shows one flat record per property with the initial address chip empty", () => {
        const rows = selectEnterpriseRows(
            propertiesDemoConfig.rows,
            propertiesDemoConfig,
            {
                search: "",
                query: propertiesDemoConfig.defaultQuery!,
                sorting: propertiesDemoConfig.defaultSorting!,
            },
        );

        const page = buildEnterprisePage(
            rows,
            propertiesDemoConfig.groups.find(
                (group) => group.id === propertiesDemoConfig.defaultGroupBy,
            ),
            { pageIndex: 0, pageSize: 10 },
            new Set(),
        );

        expect(page.recordCount).toBe(6);
        expect(page.displayRows.map((row) => row.id)).toEqual([
            "record:OBJ-001",
            "record:OBJ-002",
            "record:OBJ-003",
            "record:OBJ-004",
            "record:OBJ-005",
            "record:OBJ-006",
        ]);
    });

    it.each([
        ["address", "contains", "muster", ["OBJ-002", "OBJ-005"]],
        ["address", "contains", "Lindenhof", ["OBJ-001"]],
        ["number", "is", "OBJ-006", ["OBJ-006"]],
        ["city", "is", "Köln", ["OBJ-005"]],
        ["manager", "is", "Nora Beispiel", ["OBJ-001", "OBJ-003"]],
        ["yearBuilt", "gte", 2015, ["OBJ-002", "OBJ-006"]],
    ])(
        "filters properties by %s %s %s",
        (field, operator, value, expectedIds) => {
            const rows = selectEnterpriseRows(
                propertiesDemoConfig.rows,
                propertiesDemoConfig,
                {
                    search: "",
                    query: demoQuery(field, operator, value),
                    sorting: propertiesDemoConfig.defaultSorting!,
                },
            );

            expect(rows.map((row) => row.id)).toEqual(expectedIds);
        },
    );

    it("shows the street and city next to the property name in the primary cell", () => {
        const property = propertiesDemoConfig.rows[0];
        const primary = propertiesDemoConfig.columns.find(
            (column) => column.primary,
        )!;

        render(primary.render(property));

        expect(screen.getByText("Lindenhof")).toBeVisible();
        expect(screen.getByText("Beispielallee 8, Berlin")).toBeVisible();
    });

    it("opens property master data and its manager without rental or financial details", () => {
        render(propertiesDemoConfig.renderDetail(propertiesDemoConfig.rows[0]));

        expect(
            screen
                .getAllByRole("heading")
                .map((heading) => heading.textContent),
        ).toEqual(["Objektstammdaten", "Betreuung"]);
        expect(screen.getByText("OBJ-001")).toBeVisible();
        expect(screen.getByText("Lindenhof")).toBeVisible();
        expect(screen.getByText("Beispielallee 8")).toBeVisible();
        expect(screen.getByText("Berlin")).toBeVisible();
        expect(screen.getByText("2004")).toBeVisible();
        expect(screen.getByText("Nora Beispiel")).toBeVisible();
        expect(
            screen.queryByText(/Miete|Mietpartei|Vermietung|Einheitsnummer/),
        ).not.toBeInTheDocument();
    });
});
