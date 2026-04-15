import { describe, expect, it } from "vitest";
import { parseArgs, flagString, flagList } from "../src/util/args.js";

describe("parseArgs", () => {
  it("treats repeated flags as an array", () => {
    const { flags } = parseArgs(["--model", "a", "--model", "b"]);
    expect(flags["model"]).toEqual(["a", "b"]);
  });

  it("single flag stays a string", () => {
    const { flags } = parseArgs(["--model", "a"]);
    expect(flags["model"]).toBe("a");
  });

  it("--flag=value and bool flags still work", () => {
    const { flags } = parseArgs(["--dry-run", "--spec=./a.yaml"]);
    expect(flags["dry-run"]).toBe(true);
    expect(flags["spec"]).toBe("./a.yaml");
  });

  it("mixed = and positional forms accumulate", () => {
    const { flags } = parseArgs(["--grant=fs.read:/tmp/**", "--grant", "model:claude-*"]);
    expect(flags["grant"]).toEqual(["fs.read:/tmp/**", "model:claude-*"]);
  });
});

describe("flagList", () => {
  it("returns [] when missing", () => {
    const { flags } = parseArgs([]);
    expect(flagList(flags, "grant")).toEqual([]);
  });

  it("merges repeated flags with comma-separated values", () => {
    const { flags } = parseArgs([
      "--grant", "a,b",
      "--grant", "c",
    ]);
    expect(flagList(flags, "grant")).toEqual(["a", "b", "c"]);
  });
});

describe("flagString", () => {
  it("returns the last value when repeated (back-compat for single-value callers)", () => {
    const { flags } = parseArgs(["--session", "one", "--session", "two"]);
    expect(flagString(flags, "session")).toBe("two");
  });
});
