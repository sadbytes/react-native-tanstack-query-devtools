import { describe, expect, it, vi } from "vitest";
import { inferHost, getHostFromUrl } from "../src/inferHost";

describe("getHostFromUrl", () => {
  it("extracts host from http URL with port and path", () => {
    expect(getHostFromUrl("http://192.168.1.42:8081/index.bundle")).toBe("192.168.1.42");
  });

  it("extracts localhost", () => {
    expect(getHostFromUrl("http://localhost:8081/bundle")).toBe("localhost");
  });

  it("extracts host from https URL", () => {
    expect(getHostFromUrl("https://example.com/path")).toBe("example.com");
  });

  it("extracts IPv6 host in brackets", () => {
    expect(getHostFromUrl("http://[::1]:8081/bundle")).toBe("[::1]");
  });

  it("extracts host from full Metro bundler URL", () => {
    expect(
      getHostFromUrl(
        "http://192.168.1.141:8081/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&lazy=true"
      )
    ).toBe("192.168.1.141");
  });

  it("returns undefined for empty string", () => {
    expect(getHostFromUrl("")).toBeUndefined();
  });
});

describe("inferHost", () => {
  it("prefers explicit host over Metro bundler host", () => {
    const getMetroHost = vi.fn(() => "192.168.1.42");
    expect(inferHost("10.0.0.1", { getMetroHost })).toBe("10.0.0.1");
    expect(getMetroHost).not.toHaveBeenCalled();
  });

  it("uses Metro bundler host when no explicit host is given", () => {
    const getMetroHost = vi.fn(() => "192.168.1.42");
    expect(inferHost(undefined, { getMetroHost })).toBe("192.168.1.42");
    expect(getMetroHost).toHaveBeenCalled();
  });

  it("falls back to localhost when Metro host is undefined", () => {
    const getMetroHost = vi.fn(() => undefined);
    expect(inferHost(undefined, { getMetroHost })).toBe("localhost");
  });

  it("falls back to localhost when getMetroHost throws", () => {
    const getMetroHost = vi.fn(() => {
      throw new Error("not available");
    });
    expect(inferHost(undefined, { getMetroHost })).toBe("localhost");
  });
});
