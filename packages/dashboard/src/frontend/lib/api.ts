export async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readApiResponse<T>(response);
}
