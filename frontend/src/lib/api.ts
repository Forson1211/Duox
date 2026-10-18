export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(
    `${(import.meta.env.VITE_API_URL?.trim() || "/api/v1").replace(/\/+$/, "")}${path}`,
    {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...options?.headers },
    },
  );
  const unavailable =
    "The game service is temporarily unavailable. Please try again shortly.";
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(unavailable, response.ok ? 503 : response.status);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ApiError(unavailable, response.ok ? 503 : response.status);
  if (!response.ok)
    throw new ApiError(
      "error" in data && typeof data.error === "string"
        ? data.error
        : unavailable,
      response.status,
    );
  return data as T;
}
export function post<T>(path: string, data: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(data) });
}
