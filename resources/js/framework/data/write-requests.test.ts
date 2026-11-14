import { afterEach, describe, expect, it, vi } from "vitest";
import { dataProvider } from "./provider";
import { ApiError, request } from "./http";

vi.mock("./http", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./http")>()),
    request: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const rows = [{ id: 8, updated_at: "2026-01-01" }];
const challenge = () =>
    new ApiError(
        428,
        "Bestätigung erforderlich",
        {},
        {
            token: "server-token",
            expires_at: "2026-12-01",
        },
    );

describe("write request boundaries", () => {
    it("deletes once with only the selected IDs and returns backend errors without a retry", async () => {
        const error = new ApiError(422, "Aktive Verträge bleiben erhalten.");
        vi.mocked(request).mockRejectedValue(error);
        await expect(dataProvider.destroy("contracts", rows)).rejects.toBe(
            error,
        );
        expect(request).toHaveBeenCalledExactlyOnceWith(
            "/api/v1/contracts",
            { resources: [8] },
            "DELETE",
        );
    });
    it("completes a domain action's signed handshake once without executing its UI action twice", async () => {
        const response = { data: { impacted: 1 } };
        vi.mocked(request)
            .mockRejectedValueOnce(challenge())
            .mockResolvedValueOnce(response);
        await expect(
            dataProvider.action("contracts", "activate", rows, {
                note: "Freigegeben",
            }),
        ).resolves.toEqual(response);
        expect(request).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenLastCalledWith(
            "/api/v1/contracts/actions/activate",
            {
                resources: [8],
                fields: [{ name: "note", value: "Freigegeben" }],
                confirmation: "server-token",
            },
        );
    });
    it("does not repeat a domain action when the signed handshake is rejected", async () => {
        const error = challenge();
        vi.mocked(request).mockRejectedValue(error);
        await expect(
            dataProvider.action("contracts", "activate", rows),
        ).rejects.toBe(error);
        expect(request).toHaveBeenCalledTimes(2);
    });
    it("does not retry domain validation failures", async () => {
        const error = new ApiError(422, "Bitte zuerst einen Mieter zuordnen.");
        vi.mocked(request).mockRejectedValue(error);
        await expect(
            dataProvider.action("contracts", "activate", rows),
        ).rejects.toBe(error);
        expect(request).toHaveBeenCalledTimes(1);
    });
});
