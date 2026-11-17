import { describe, expect, it } from "vitest";
import { addDays, format, parseISO } from "date-fns";
import type { GanttProposedUpdate } from "@/components/reui/gantt/gantt-types";
import { DEFAULT_TASKS, ganttData, scheduleRenovation } from "@/lib/renovation/plan";
import { applyGanttProposal } from "./gantt-interactions";

const proposal = (id: string, date: string, days: number) => {
    const plan = scheduleRenovation(DEFAULT_TASKS);
    const event = ganttData(plan).events.find(bar => bar.id === "task-" + id)!;
    const start = parseISO(date);
    return {
        event, occurrence:null, start,
        end:addDays(start,days), allDay:true,
        resourceId:id, source:"drag",
    } as GanttProposedUpdate;
};

describe("dependency-safe ReUI Gantt drag and resize", () => {
    it("moves a task and automatically reschedules its successors", () => {
        const result = applyGanttProposal(DEFAULT_TASKS,proposal("tapeten","2027-03-08",2));
        expect(result).not.toBeNull();
        expect(result!.scheduled.duration).toBe(2);
        expect(format(result!.scheduled.start,"yyyy-MM-dd")).toBe("2027-03-08");
        const follow = scheduleRenovation(result!.tasks).find(t=>t.id==="boden-alt")!;
        expect(format(follow.start,"yyyy-MM-dd")).toBe("2027-03-10");
    });
    it("preserves predecessor finish constraints", () => {
        expect(applyGanttProposal(DEFAULT_TASKS,proposal("tapeten","2027-03-01",2))).toBeNull();
    });
    it("rejects weekends and safety-critical release gates", () => {
        expect(applyGanttProposal(DEFAULT_TASKS,proposal("tapeten","2027-03-06",2))).toBeNull();
        expect(applyGanttProposal(DEFAULT_TASKS,proposal("belegreife","2027-04-12",1))).toBeNull();
        expect(applyGanttProposal(DEFAULT_TASKS,proposal("estrich-trocknung","2027-04-12",21))).toBeNull();
    });
    it("changes working-day duration without double-counting weekends", () => {
        const result = applyGanttProposal(DEFAULT_TASKS,proposal("tapeten","2027-03-08",3));
        expect(result?.scheduled.duration).toBe(3);
        expect(format(result!.scheduled.endExclusive,"yyyy-MM-dd")).toBe("2027-03-11");
    });
});
