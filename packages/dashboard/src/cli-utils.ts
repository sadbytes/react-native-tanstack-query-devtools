export function portOption(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function browserHost(host: string) {
  return host === "0.0.0.0" ? "localhost" : host;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
