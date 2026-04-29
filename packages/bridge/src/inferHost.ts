/**
 * Extract the hostname from an http(s) URL, ignoring port, path, and query.
 * Supports IPv4, IPv6 (bracket notation), and regular hostnames.
 */
export function getHostFromUrl(url: string): string | undefined {
  return url.match(/^(?:https?:\/\/)?(\[[^\]]+\]|[^/:\s]+)(?::\d+)?(?:[/?#]|$)/)?.[1];
}

function getMetroBundlerHost(): string | undefined {
  try {
    // NativeSourceCode exposes the URL of the JS bundle loaded by Metro.
    // On physical devices this URL contains the dev machine's IP instead of
    // "localhost", allowing automatic host detection without manual config.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native/Libraries/NativeModules/specs/NativeSourceCode");
    const NativeSourceCode = mod?.default ?? mod;
    const scriptURL: unknown = NativeSourceCode?.getConstants?.()?.scriptURL;

    if (typeof scriptURL !== "string") {
      return undefined;
    }

    return getHostFromUrl(scriptURL);
  } catch {
    return undefined;
  }
}

export type InferHostOptions = {
  getMetroHost?: () => string | undefined;
};

export function inferHost(explicitHost?: string, options?: InferHostOptions): string {
  if (explicitHost) {
    return explicitHost;
  }

  try {
    const getHost = options?.getMetroHost ?? getMetroBundlerHost;
    return getHost() ?? "localhost";
  } catch {
    return "localhost";
  }
}
