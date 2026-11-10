import { describe, expect, it } from "vitest";
import { maskCard, maskEmail, maskName } from "./mask";

describe("mask", () => {
  it("masks names to first name and last initial", () => {
    expect(maskName("Olivia Martin")).toBe("Olivia M.");
    expect(maskName("Mary Ann  Lee")).toBe("Mary L.");
    expect(maskName("Cher")).toBe("Cher");
  });

  it("masks email and card", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j*******@example.com");
    expect(maskCard("4242")).toBe("•••• 4242");
  });
});
