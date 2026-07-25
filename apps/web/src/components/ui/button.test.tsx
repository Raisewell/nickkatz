import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Run search</Button>);
    expect(screen.getByRole("button", { name: "Run search" })).toBeInTheDocument();
  });
});
