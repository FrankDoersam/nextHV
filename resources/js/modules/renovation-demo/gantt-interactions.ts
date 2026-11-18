import { addDays, differenceInCalendarDays, format, isWeekend } from "date-fns";
import type { GanttProposedUpdate } from "@/components/reui/gantt/gantt-types";
import {
    PROJECT_START, scheduleRenovation, type RenovationTask, type ScheduledTask,
} from "@/lib/renovation/plan";

export type ScheduleProposalResult = {
    tasks: RenovationTask[];
    scheduled: ScheduledTask;
};

/**
 * ReUI's onEventUpdate contract: translate a drag/resize proposal to
 * a dependency-aware domain update. All successors recalculate through the DAG.
 * Reject invalid predecessors, weekends, impossible durations and safety gates.
 */
export function applyGanttProposal(
    tasks: RenovationTask[],
    proposal: GanttProposedUpdate,
): ScheduleProposalResult | null {
    const id = String(proposal.event.id).replace(/^task-/, "");
    const task = tasks.find((entry) => entry.id === id);
    if (!task || ["estrich-trocknung", "funktionsheizen", "belegreife"].includes(id)) {
        return null;
    }
    if (!proposal.start || !proposal.end ||
        !Number.isFinite(proposal.start.getTime()) ||
        !Number.isFinite(proposal.end.getTime()) ||
        proposal.end <= proposal.start) {
        return null;
    }
    const date = format(proposal.start, "yyyy-MM-dd");
    if (date < PROJECT_START || (task.mode === "arbeitstage" && isWeekend(proposal.start))) {
        return null;
    }
    let duration = 0;
    if (task.mode === "kalendertage") {
        duration = differenceInCalendarDays(proposal.end, proposal.start);
    } else {
        for (let day = proposal.start; day < proposal.end; day = addDays(day, 1)) {
            if (!isWeekend(day)) duration++;
            if (duration > 365) return null;
        }
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) return null;
    const changed = tasks.map((entry) => entry.id === id
        ? { ...entry, duration, notBefore: date }
        : entry);
    let planned: ScheduledTask[];
    try { planned = scheduleRenovation(changed, PROJECT_START); }
    catch { return null; }
    const scheduled = planned.find((entry) => entry.id === id);
    if (!scheduled || format(scheduled.start, "yyyy-MM-dd") !== date) {
        // A predecessor requires the task to start after the proposed date.
        return null;
    }
    return { tasks: changed, scheduled };
}
