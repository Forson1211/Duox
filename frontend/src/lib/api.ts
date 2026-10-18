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
    `${import.meta.env.VITE_API_URL ?? "/api/v1"}${path}`,
    {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options?.headers },
    },
  );
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an unexpected response." }));
  if (!response.ok)
    throw new ApiError(data.error ?? "Something went wrong.", response.status);
  return data as T;
}
export function post<T>(path: string, data: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(data) });
}
