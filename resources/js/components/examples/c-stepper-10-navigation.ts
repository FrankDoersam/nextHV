"use client";

import { useCallback, useRef, useState } from "react";

/** Shared between the REUI stepper and the Sheet footer. No second step state. */
export type Stepper10Validator = (
    currentStep: number,
    targetStep: number,
) => boolean | Promise<boolean>;

export interface Stepper10NavigationOptions {
    /** Zero-based active step, controlled by the host form. */
    active: number;
    count: number;
    onChange: (step: number) => void;
    /** Called before advancing one step. Return false for invalid form data. */
    validate?: Stepper10Validator;
    canBack?: boolean;
    canNext?: boolean;
    canFinish?: boolean;
    busy?: boolean;
    onValidationError?: (error: unknown) => void;
}

export interface Stepper10Navigation {
    active: number;
    count: number;
    busy: boolean;
    validating: boolean;
    canBack: boolean;
    canNext: boolean;
    canFinish: boolean;
    canSelectStep: (target: number) => boolean;
    selectStep: (target: number) => Promise<boolean>;
    back: () => Promise<boolean>;
    next: () => Promise<boolean>;
}

/**
 * Backward movement never validates. Forward movement (including a click on
 * the immediately following REUI tab) always runs the same validation as the
 * footer's Next button. A synchronous lock prevents double advancement.
 */
export function useCStepper10Navigation({
    active,
    count,
    onChange,
    validate,
    canBack = true,
    canNext = true,
    canFinish = true,
    busy = false,
    onValidationError,
}: Stepper10NavigationOptions): Stepper10Navigation {
    const lock = useRef(false);
    const [validating, setValidating] = useState(false);
    const blocked = busy || validating;
    const backEnabled = count > 0 && active > 0 && canBack && !blocked;
    const nextEnabled = active >= 0 && active < count - 1 && canNext && !blocked;
    const finishEnabled = count > 0 && active === count - 1 && canFinish && !blocked;

    const canSelectStep = useCallback(
        (target: number) => {
            if (!Number.isInteger(target) || target < 0 || target >= count || blocked)
                return false;
            if (target === active) return true;
            if (target < active) return backEnabled;
            // No skipping unvalidated intermediate stages.
            return target === active + 1 && nextEnabled;
        },
        [active, count, blocked, backEnabled, nextEnabled],
    );

    const selectStep = useCallback(
        async (target: number): Promise<boolean> => {
            if (lock.current || !canSelectStep(target)) return false;
            if (target === active) return true;
            if (target < active) {
                onChange(target);
                return true;
            }
            lock.current = true;
            setValidating(true);
            try {
                if (validate && !(await validate(active, target))) return false;
                onChange(target);
                return true;
            } catch (error) {
                onValidationError?.(error);
                return false;
            } finally {
                lock.current = false;
                setValidating(false);
            }
        },
        [active, canSelectStep, onChange, validate, onValidationError],
    );

    return {
        active,
        count,
        busy: blocked,
        validating,
        canBack: backEnabled,
        canNext: nextEnabled,
        canFinish: finishEnabled,
        canSelectStep,
        selectStep,
        back: () => selectStep(active - 1),
        next: () => selectStep(active + 1),
    };
}
