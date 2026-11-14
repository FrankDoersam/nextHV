import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Cell } from "./cell";

afterEach(cleanup);

it("keeps explicit navigation links neutral, focused and isolated from row double clicks", () => {
    const onDoubleClick = vi.fn();
    render(
        <MemoryRouter>
            <div onDoubleClick={onDoubleClick}>
                <Cell to="/units/42" onDoubleClick={(event) => event.stopPropagation()}>
                    Wohnung 42
                </Cell>
            </div>
        </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Wohnung 42" });

    expect(link).toHaveAttribute("href", "/units/42");
    expect(link).toHaveClass("text-foreground", "hover:underline");
    expect(link).toHaveClass("focus-visible:ring-2");
    expect(link).not.toHaveClass("text-primary");
    fireEvent.doubleClick(link);
    expect(onDoubleClick).not.toHaveBeenCalled();
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
