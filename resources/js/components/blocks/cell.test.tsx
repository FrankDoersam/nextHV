import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Cell } from "./cell";

afterEach(cleanup);

it("keeps explicit cell links available for deliberate navigation", () => {
    render(
        <MemoryRouter>
            <Cell to="/units/42">Wohnung 42</Cell>
        </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Wohnung 42" });
    expect(link).toHaveAttribute("href", "/units/42");
    expect(link).toHaveClass("text-foreground", "hover:underline");
    expect(link).not.toHaveClass("text-primary");
});

it("uses a button for in-place record actions", async () => {
    const onClick = vi.fn();
    render(<Cell onClick={onClick}>Datensatz öffnen</Cell>);

    const button = screen.getByRole("button", { name: "Datensatz öffnen" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("text-foreground");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
});
