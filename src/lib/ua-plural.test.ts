import { describe, it, expect } from "vitest";
import { pluralizeTerm, pluralizeCount } from "./ua-plural";

describe("pluralizeTerm", () => {
  it("Майстер → Майстри (викид 'е')", () => {
    expect(pluralizeTerm("Майстер")).toBe("Майстри");
  });
  it("Спеціаліст → Спеціалісти", () => {
    expect(pluralizeTerm("Спеціаліст")).toBe("Спеціалісти");
  });
  it("Барбер → Барбери", () => {
    expect(pluralizeTerm("Барбер")).toBe("Барбери");
  });
  it("Перукар → Перукарі", () => {
    expect(pluralizeTerm("Перукар")).toBe("Перукарі");
  });
  it("порожня/whitespace-only → повертається після trim", () => {
    expect(pluralizeTerm("")).toBe("");
    expect(pluralizeTerm("   ")).toBe("");
  });
});

describe("pluralizeCount", () => {
  const f: [string, string, string] = ["товар", "товари", "товарів"];

  it("0 → товарів", () => expect(pluralizeCount(0, f)).toBe("товарів"));
  it("1 → товар", () => expect(pluralizeCount(1, f)).toBe("товар"));
  it("2-4 → товари", () => {
    expect(pluralizeCount(2, f)).toBe("товари");
    expect(pluralizeCount(3, f)).toBe("товари");
    expect(pluralizeCount(4, f)).toBe("товари");
  });
  it("5-10 → товарів", () => {
    for (let n = 5; n <= 10; n++) expect(pluralizeCount(n, f)).toBe("товарів");
  });
  it("11-14 → товарів (exception)", () => {
    for (let n = 11; n <= 14; n++) expect(pluralizeCount(n, f)).toBe("товарів");
  });
  it("21 → товар (слідує правилу одинки)", () => {
    expect(pluralizeCount(21, f)).toBe("товар");
  });
  it("22-24 → товари", () => {
    expect(pluralizeCount(22, f)).toBe("товари");
  });
  it("111 → товарів (11-14 на сотні)", () => {
    expect(pluralizeCount(111, f)).toBe("товарів");
  });
});
