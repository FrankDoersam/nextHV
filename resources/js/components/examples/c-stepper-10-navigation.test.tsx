import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CStepper10 } from "./c-stepper-10";
import { useCStepper10Navigation } from "./c-stepper-10-navigation";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("shared ReUI Stepper 10 navigation", () => {
    it("keeps stepper and footer in sync with canBack, canNext, and validation", async () => {
        const validate = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
        function Wizard() {
            const [active, setActive] = useState(0);
            const navigation = useCStepper10Navigation({
                active,
                count: 6,
                onChange: setActive,
                validate,
            });
            return (
                <>
                    <CStepper10
                        steps={Array.from({ length: 6 }, (_, i) => ({
                            id: String(i),
                            label: "Schritt " + (i + 1),
                        }))}
                        active={active}
                        navigation={navigation}
                    >
                        <div>Formular</div>
                    </CStepper10>
                    <button disabled={!navigation.canBack} onClick={() => void navigation.back()}>
                        Zurück
                    </button>
                    <button disabled={!navigation.canNext} onClick={() => void navigation.next()}>
                        Weiter
                    </button>
                    <button disabled={!navigation.canFinish}>Speichern</button>
                </>
            );
        }
        const user = userEvent.setup();
        render(<Wizard />);
        expect(screen.getByRole("button", { name: "Zurück" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
        expect(screen.getByRole("tab", { name: "Schritt 3, Schritt 3" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Weiter" }));
        expect(validate).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("tab", { name: "Schritt 1, Schritt 1" })).toHaveAttribute("aria-selected", "true");

        // Clicking the next REUI tab uses the SAME validation as the footer.
        await user.click(screen.getByRole("tab", { name: "Schritt 2, Schritt 2" }));
        expect(validate).toHaveBeenLastCalledWith(0, 1);
        await waitFor(() => expect(screen.getByRole("button", { name: "Zurück" })).toBeEnabled());
        expect(screen.getByRole("tab", { name: "Schritt 2, Schritt 2" })).toHaveAttribute("aria-selected", "true");

        await user.click(screen.getByRole("button", { name: "Zurück" }));
        expect(validate).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("tab", { name: "Schritt 1, Schritt 1" })).toHaveAttribute("aria-selected", "true");
    });

    it("blocks navigation consistently when canBack/canNext are false", async () => {
        const onChange = vi.fn();
        const validate = vi.fn();
        const { result, rerender } = renderHook(
            ({ active, canBack, canNext, canFinish, busy }) =>
                useCStepper10Navigation({
                    active,
                    count: 3,
                    onChange,
                    validate,
                    canBack,
                    canNext,
                    canFinish,
                    busy,
                }),
            {
                initialProps: {
                    active: 1,
                    canBack: false,
                    canNext: false,
                    canFinish: true,
                    busy: false,
                },
            },
        );
        expect(result.current.canBack).toBe(false);
        expect(result.current.canNext).toBe(false);
        expect(result.current.canSelectStep(0)).toBe(false);
        expect(result.current.canSelectStep(2)).toBe(false);
        await act(async () => {
            expect(await result.current.back()).toBe(false);
            expect(await result.current.next()).toBe(false);
        });
        expect(onChange).not.toHaveBeenCalled();
        expect(validate).not.toHaveBeenCalled();
        rerender({ active: 2, canBack: true, canNext: true, canFinish: false, busy: false });
        expect(result.current.canFinish).toBe(false);
        expect(result.current.canBack).toBe(true);
        expect(result.current.canNext).toBe(false);
        rerender({ active: 2, canBack: true, canNext: true, canFinish: true, busy: true });
        expect(result.current.canBack).toBe(false);
        expect(result.current.canFinish).toBe(false);
    });

    it("prevents skipping steps and double advancement during async server validation", async () => {
        let release!: (value: boolean) => void;
        const validation = vi.fn().mockImplementation(
            () => new Promise<boolean>((resolve) => { release = resolve; }),
        );
        const onChange = vi.fn();
        const { result } = renderHook(() =>
            useCStepper10Navigation({
                active: 0,
                count: 7,
                onChange,
                validate: validation,
            }),
        );
        expect(result.current.canSelectStep(5)).toBe(false);
        await act(async () => {
            expect(await result.current.selectStep(5)).toBe(false);
        });
        let first!: Promise<boolean>;
        let second!: Promise<boolean>;
        act(() => {
            first = result.current.next();
            second = result.current.next();
        });
        expect(result.current.canNext).toBe(false);
        await act(async () => {
            expect(await second).toBe(false);
            release(true);
            expect(await first).toBe(true);
        });
        expect(validation).toHaveBeenCalledExactlyOnceWith(0, 1);
        expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
    });

    it("shares per-step canNavigate restrictions with both buttons and tabs", async () => {
        const onChange = vi.fn();
        const { result, rerender } = renderHook(
            ({ active }) =>
                useCStepper10Navigation({
                    active,
                    count: 6,
                    onChange,
                    canNavigate: (_current, target) => target !== 3,
                }),
            { initialProps: { active: 2 } },
        );
        expect(result.current.canBack).toBe(true);
        expect(result.current.canNext).toBe(false);
        expect(result.current.canSelectStep(0)).toBe(true);
        expect(result.current.canSelectStep(3)).toBe(false);
        await act(async () => {
            expect(await result.current.next()).toBe(false);
        });
        expect(onChange).not.toHaveBeenCalled();
        rerender({ active: 4 });
        expect(result.current.canBack).toBe(false);
        expect(result.current.canNext).toBe(true);
        expect(result.current.canFinish).toBe(false);
    });

    it("reports a validation rejection and keeps the current step", async () => {
        const onChange = vi.fn();
        const onValidationError = vi.fn();
        const error = new Error("Server offline");
        const { result } = renderHook(() =>
            useCStepper10Navigation({
                active: 2,
                count: 5,
                onChange,
                validate: async () => { throw error; },
                onValidationError,
            }),
        );
        await act(async () => {
            expect(await result.current.next()).toBe(false);
        });
        expect(onChange).not.toHaveBeenCalled();
        expect(onValidationError).toHaveBeenCalledExactlyOnceWith(error);
        expect(result.current.canNext).toBe(true);
    });
});
