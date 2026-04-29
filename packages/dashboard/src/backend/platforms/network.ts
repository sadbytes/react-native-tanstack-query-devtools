import os from "node:os";

function isUsableIPv4(address: string) {
  return !(
    address === "127.0.0.1" ||
    address.startsWith("169.254.") ||
    address.startsWith("0.") ||
    address === "0.0.0.0"
  );
}

export function getLanIPv4Candidates() {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || /^lo/i.test(name)) {
      continue;
    }

    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal || !isUsableIPv4(entry.address)) {
        continue;
      }
      candidates.push(entry.address);
    }
  }

  return [...new Set(candidates)].sort();
}
