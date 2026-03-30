const {
  normalizeTag,
  normalizeTags,
  inferKnowledgePoints,
  pickDuplicateCandidate
} = require("../cleanse");

describe("ETL cleanse helpers", () => {
  test("normalizes tag synonyms and removes duplicates", () => {
    const normalized = normalizeTags([
      " Machine Learning ",
      "machine-learning",
      "CAREERS",
      "soft skills",
      "Soft Skills",
      ""
    ]);

    expect(normalized).toEqual(["ml", "career", "soft-skills"]);
  });

  test("infers knowledge points from keyword heuristics", () => {
    const inferred = inferKnowledgePoints(
      "Need help with SQL query optimization and internship interview prep"
    );

    expect(inferred).toContain("sql");
    expect(inferred).toContain("career-readiness");
  });

  test("dedupe candidate is selected only above threshold", () => {
    const strong = pickDuplicateCandidate(
      [
        { source_id: 20, score: 0.45 },
        { source_id: 10, score: 0.91 }
      ],
      0.78
    );
    const weak = pickDuplicateCandidate([{ source_id: 33, score: 0.5 }], 0.78);

    expect(strong.source_id).toBe(10);
    expect(weak).toBeNull();
  });

  test("single tag normalization lowercases and maps synonyms", () => {
    expect(normalizeTag("Web Dev")).toBe("web-development");
  });
});
