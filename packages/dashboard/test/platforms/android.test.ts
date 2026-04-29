import { describe, expect, it } from "vitest";
import { parseAdbDevices, parseAdbMdnsServices } from "../../src/backend/platforms/android";

describe("parseAdbDevices", () => {
  it("parses standard adb devices -l output", () => {
    const output = [
      "List of devices attached",
      "emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emulator64_arm64 transport_id:1",
      "192.168.1.42:5555      device product:oriole model:Pixel_6 device:oriole transport_id:2",
      "",
    ].join("\n");

    const devices = parseAdbDevices(output);

    expect(devices).toEqual([
      {
        serial: "emulator-5554",
        state: "device",
        details: "product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emulator64_arm64 transport_id:1",
      },
      {
        serial: "192.168.1.42:5555",
        state: "device",
        details: "product:oriole model:Pixel_6 device:oriole transport_id:2",
      },
    ]);
  });

  it("parses devices in various states", () => {
    const output = [
      "List of devices attached",
      "emulator-5554          device",
      "R5CT12345              unauthorized",
      "192.168.1.10:5555      offline",
      "",
    ].join("\n");

    const devices = parseAdbDevices(output);

    expect(devices).toEqual([
      { serial: "emulator-5554", state: "device", details: "" },
      { serial: "R5CT12345", state: "unauthorized", details: "" },
      { serial: "192.168.1.10:5555", state: "offline", details: "" },
    ]);
  });

  it("returns empty array for header-only output", () => {
    const output = "List of devices attached\n\n";
    expect(parseAdbDevices(output)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseAdbDevices("")).toEqual([]);
  });

  it("handles Windows-style line endings", () => {
    const output = "List of devices attached\r\nemulator-5554          device\r\n\r\n";
    const devices = parseAdbDevices(output);
    expect(devices).toHaveLength(1);
    expect(devices[0].serial).toBe("emulator-5554");
  });
});

describe("parseAdbMdnsServices", () => {
  it("parses standard mdns services output", () => {
    const output = [
      "List of discovered mdns services",
      "studio-ABC123 _adb-tls-pairing._tcp 192.168.1.42:37149",
      "adb-R5CT12345 _adb-tls-connect._tcp 192.168.1.42:42365",
      "",
    ].join("\n");

    const services = parseAdbMdnsServices(output);

    expect(services).toEqual([
      {
        instanceName: "studio-ABC123",
        serviceType: "_adb-tls-pairing._tcp",
        address: "192.168.1.42",
        port: 37149,
      },
      {
        instanceName: "adb-R5CT12345",
        serviceType: "_adb-tls-connect._tcp",
        address: "192.168.1.42",
        port: 42365,
      },
    ]);
  });

  it("handles instance names with spaces", () => {
    const output = [
      "List of discovered mdns services",
      "My Device Name _adb-tls-connect._tcp 10.0.0.5:45678",
      "",
    ].join("\n");

    const services = parseAdbMdnsServices(output);

    expect(services).toEqual([
      {
        instanceName: "My Device Name",
        serviceType: "_adb-tls-connect._tcp",
        address: "10.0.0.5",
        port: 45678,
      },
    ]);
  });

  it("returns empty array for header-only output", () => {
    const output = "List of discovered mdns services\n";
    expect(parseAdbMdnsServices(output)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseAdbMdnsServices("")).toEqual([]);
  });

  it("skips malformed lines", () => {
    const output = [
      "List of discovered mdns services",
      "incomplete-line",
      "valid-service _adb-tls-connect._tcp 10.0.0.1:5555",
      "no-port _adb-tls-connect._tcp badaddress",
      "",
    ].join("\n");

    const services = parseAdbMdnsServices(output);

    expect(services).toEqual([
      {
        instanceName: "valid-service",
        serviceType: "_adb-tls-connect._tcp",
        address: "10.0.0.1",
        port: 5555,
      },
    ]);
  });
});
