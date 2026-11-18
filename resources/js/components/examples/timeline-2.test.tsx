import "@testing-library/jest-dom/vitest";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ReuiTimelineDemo } from "./timeline-2";

Element.prototype.getAnimations = () => [];
afterEach(cleanup);

it("keeps the reference events in order with attachments and rating on the matching event", () => {
    render(<ReuiTimelineDemo />);

    const events = within(
        screen.getByRole("list", { name: "Activity timeline" }),
    ).getAllByRole("listitem");
    expect(events).toHaveLength(4);
    expect(events[0]).toHaveTextContent("Completed Renewal Workspace Handoff");
    expect(events[1]).toHaveTextContent("Verified SSO And SCIM Sync");
    expect(events[2]).toHaveTextContent("Approved Usage-Based Billing Limits");
    expect(events[3]).toHaveTextContent("Imported Production Customer Records");
    expect(within(events[0]).getByText("May 06, 2026")).toHaveAttribute(
        "datetime",
        "2026-05-06",
    );
    expect(within(events[0]).getByText("4.8")).toBeVisible();
    expect(
        within(events[0]).getByRole("button", { name: /^Handoff\.pdf/ }),
    ).toHaveTextContent("(1.8 MB)");
    expect(
        within(events[1]).getByRole("button", { name: /^SSO-map\.csv/ }),
    ).toHaveTextContent("(84 KB)");
    expect(within(events[2]).queryByRole("button")).not.toBeInTheDocument();
    expect(
        within(events[3]).getByRole("button", { name: /^Import-log\.txt/ }),
    ).toHaveTextContent("(26 KB)");
});

it("opens the selected demo attachment and returns focus when its preview closes", async () => {
    render(<ReuiTimelineDemo />);
    const user = userEvent.setup();
    const handoff = screen.getByRole("button", { name: /^Handoff\.pdf/ });

    await user.click(handoff);

    const pdfPreview = await screen.findByRole("dialog", {
        name: "Handoff.pdf",
    });
    expect(pdfPreview).toHaveAccessibleDescription(
        /Demo-Vorschau mit fiktiven Daten/,
    );
    expect(
        within(pdfPreview).getByText("Renewal Workspace Handoff", {
            exact: false,
        }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(handoff).toHaveFocus());

    const mapping = screen.getByRole("button", { name: /^SSO-map\.csv/ });
    await user.click(mapping);
    const csvPreview = await screen.findByRole("dialog", {
        name: "SSO-map.csv",
    });
    expect(csvPreview).toHaveTextContent(
        "directory_group,workspace_role,sync_status",
    );
    expect(csvPreview).toHaveTextContent("account-admins,Admin,Verified");
    expect(csvPreview).not.toHaveTextContent("Renewal Workspace Handoff");
    await user.click(
        within(csvPreview).getByRole("button", {
            name: "Schließen",
        }),
    );
    await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(mapping).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /^Import-log\.txt/ }));
    const logPreview = await screen.findByRole("dialog", {
        name: "Import-log.txt",
    });
    expect(logPreview).toHaveTextContent("Production Customer Records");
    expect(logPreview).toHaveTextContent("Validated rows: 18400");
    expect(logPreview).not.toHaveTextContent(
        "directory_group,workspace_role,sync_status",
    );
});
