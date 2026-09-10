/**
 * Tests for the LLM provider resolver.
 */

import { describe, expect, it } from "vitest";

import { resolveProvider } from "./provider";

describe("resolveProvider", () => {
  it("defaults to gemini when the env var is unset", () => {
    expect(resolveProvider(undefined)).toBe("gemini");
  });

  it("defaults to gemini on an empty string", () => {
    expect(resolveProvider("")).toBe("gemini");
  });

  it("selects gemini explicitly", () => {
    expect(resolveProvider("gemini")).toBe("gemini");
  });

  it("selects anthropic explicitly", () => {
    expect(resolveProvider("anthropic")).toBe("anthropic");
  });

  it("falls back to the default on an unrecognized value, rather than throwing", () => {
    expect(resolveProvider("openai")).toBe("gemini");
  });

  it("is case-sensitive - does not accept a differently-cased match", () => {
    expect(resolveProvider("Anthropic")).toBe("gemini");
  });
});
