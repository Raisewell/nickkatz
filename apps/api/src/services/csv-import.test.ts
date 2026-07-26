import { describe, it, expect } from "vitest";
import { parseExclusionCsv } from "./csv-import.js";

describe("parseExclusionCsv", () => {
  it("parses a LinkedIn Connections.csv export, skipping the notes preamble", () => {
    const raw = [
      "Notes:",
      '"When exporting your connection data, you may notice that some of your connections are missing."',
      "",
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Sam,Chen,https://www.linkedin.com/in/samchen,sam@example.com,Acme,Partner,1 Jan 2024",
      "Robin,Doe,https://www.linkedin.com/in/robindoe,,Beta Capital,Principal,2 Feb 2024",
    ].join("\n");

    const { rows, detectedFormat } = parseExclusionCsv(raw);

    expect(detectedFormat).toBe("linkedin_import");
    expect(rows).toEqual([
      { name: "Sam Chen", email: "sam@example.com", linkedinUrl: "https://www.linkedin.com/in/samchen" },
      { name: "Robin Doe", linkedinUrl: "https://www.linkedin.com/in/robindoe" },
    ]);
  });

  it("parses a generic CSV with flexible column names", () => {
    const raw = ["Full Name,Email,LinkedIn URL", "Jordan Lee,jordan@vc.com,https://linkedin.com/in/jordanlee"].join(
      "\n"
    );

    const { rows, detectedFormat } = parseExclusionCsv(raw);

    expect(detectedFormat).toBe("csv");
    expect(rows).toEqual([
      { name: "Jordan Lee", email: "jordan@vc.com", linkedinUrl: "https://linkedin.com/in/jordanlee" },
    ]);
  });

  it("drops rows with no identifying fields", () => {
    const raw = ["name,email,linkedinUrl", ",,", "Casey,,"].join("\n");
    const { rows } = parseExclusionCsv(raw);
    expect(rows).toEqual([{ name: "Casey" }]);
  });
});
