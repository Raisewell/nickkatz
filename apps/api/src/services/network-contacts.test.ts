import { describe, it, expect, vi } from "vitest";
import { importNetworkContactsCsv } from "./network-contacts.js";

function fakePrisma() {
  return { networkContact: { createMany: vi.fn() } };
}

describe("importNetworkContactsCsv", () => {
  it("parses a LinkedIn export and stores a recency signal from Connected On", async () => {
    const prisma = fakePrisma();
    const raw = [
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Sam,Chen,https://www.linkedin.com/in/samchen,sam@example.com,Acme,Partner,1 Jan 2024",
    ].join("\n");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await importNetworkContactsCsv(prisma as any, "ws_1", raw);

    expect(result).toEqual({ detectedFormat: "linkedin_import", rowsParsed: 1, contactsCreated: 1 });
    expect(prisma.networkContact.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: "ws_1",
          name: "Sam Chen",
          email: "sam@example.com",
          source: "LINKEDIN_IMPORT",
          connectedAt: new Date("1 Jan 2024"),
        }),
      ],
    });
  });

  it("leaves connectedAt null when there's no parseable date hint", async () => {
    const prisma = fakePrisma();
    const raw = ["Full Name,Email", "Jordan Lee,jordan@vc.com"].join("\n");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await importNetworkContactsCsv(prisma as any, "ws_1", raw);

    expect(prisma.networkContact.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ connectedAt: null, source: "CSV_IMPORT" })],
    });
  });

  it("is a no-op for an empty CSV", async () => {
    const prisma = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await importNetworkContactsCsv(prisma as any, "ws_1", "name,email\n");
    expect(result.contactsCreated).toBe(0);
    expect(prisma.networkContact.createMany).not.toHaveBeenCalled();
  });
});
