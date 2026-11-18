import { describe, expect, it } from "vitest";
import { differenceInCalendarDays, format, isWeekend } from "date-fns";
import {
    DEFAULT_TASKS, PROJECT_START, TRADES, endOfProject, ganttData,
    humanFinish, scheduleRenovation,
} from "./plan";

describe("March 2027 apartment renovation schedule", () => {
    const plan = scheduleRenovation(DEFAULT_TASKS);
    const byId = (id: string) => {
        const result = plan.find((task) => task.id === id);
        if (!result) throw new Error("Unknown test task " + id);
        return result;
    };
    it("starts in March 2027 and protects two full workdays for wallpaper", () => {
        expect(PROJECT_START).toBe("2027-03-01");
        expect(format(byId("tapeten").start,"yyyy-MM-dd")).toBe("2027-03-02");
        expect(humanFinish(byId("tapeten"))).toBe("03.03.2027");
        expect(format(byId("estrich-alt").start,"yyyy-MM-dd")).toBe("2027-03-08");
    });
    it("automatically respects finish-to-start dependencies and weekends", () => {
        for(const task of plan) {
            if(task.mode==="arbeitstage") {
                expect(isWeekend(task.start)).toBe(false);
            }
            for (const prev of task.dependsOn) {
                expect(task.start.getTime()).toBeGreaterThanOrEqual(byId(prev).endExclusive.getTime());
            }
        }
    });
    it("schedules FBH plus distributor for two workdays and 21 full drying days", () => {
        expect(byId("fussbodenheizung").duration).toBe(2);
        expect(byId("estrich-trocknung").mode).toBe("kalendertage");
        expect(differenceInCalendarDays(
            byId("estrich-trocknung").endExclusive,byId("estrich-trocknung").start,
        )).toBe(21);
        expect(byId("funktionsheizen").start.getTime()).toBeGreaterThanOrEqual(
            byId("estrich-trocknung").endExclusive.getTime(),
        );
        expect(byId("boden-neu").start.getTime()).toBeGreaterThanOrEqual(byId("belegreife").endExclusive.getTime());
        expect(endOfProject(plan).getTime()).toBeGreaterThan(byId("estrich-neu").endExclusive.getTime());
    });
    it("draws one ReUI Gantt event per task with exact predecessor IDs and trade colors", () => {
        const result = ganttData(plan);
        expect(result.events).toHaveLength(DEFAULT_TASKS.length);
        const floor = result.events.find((e) => e.id==="task-boden-neu")!;
        expect(floor.dependencies).toEqual(["task-belegreife"]);
        expect(floor.color).toBe(TRADES.Ausbau.color);
        expect(floor.readOnly).toBe(false);
        expect(result.events.find(e=>e.id==="task-belegreife")?.readOnly).toBe(true);
        expect(result.resources.some((group) => group.id==="trade-Estrich")).toBe(true);
    });
    it("rejects unknown predecessors, duplicate ids and cycles", () => {
        expect(() => scheduleRenovation([{ ...DEFAULT_TASKS[0], dependsOn:["bad-id"] }])).toThrow(/Unbekannte/);
        expect(() => scheduleRenovation([DEFAULT_TASKS[0],DEFAULT_TASKS[0]])).toThrow(/Doppelte/);
        expect(() => scheduleRenovation(DEFAULT_TASKS.map((task) => task.id==="einrichten"
            ? { ...task, dependsOn:["abnahme"] }:task))).toThrow(/Zyklische/);
    });
    it("respects a manual earliest start without breaking finish-to-start dependencies", () => {
        const changed=DEFAULT_TASKS.map(task=>task.id==="tapeten"
            ? {...task,notBefore:"2027-03-08"}:task);
        const planned=scheduleRenovation(changed);
        expect(format(planned.find(t=>t.id==="tapeten")!.start,"yyyy-MM-dd")).toBe("2027-03-08");
        expect(format(planned.find(t=>t.id==="boden-alt")!.start,"yyyy-MM-dd")).toBe("2027-03-10");
    });
        it("can move the whole plan by changing the start date", () => {
        const moved = scheduleRenovation(DEFAULT_TASKS,"2027-04-01");
        expect(format(moved[0].start,"yyyy-MM-dd")).toBe("2027-04-01");
    });
});
