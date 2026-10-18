import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthPage } from "../components/Auth";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("account forms", () => {
  it("validates registration before sending credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthPage mode="register" onAuth={() => {}} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(
        screen.getAllByText(/at least|invalid|required/i).length,
      ).toBeGreaterThan(0),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the real API and displays rejected login errors", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid email or password." }), {
          status: 401,
        }),
      );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthPage mode="login" onAuth={() => {}} />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Email"), "player@example.test");
    await user.type(screen.getByLabelText("Password"), "incorrect-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Invalid email or password.",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
  it("does not report successful login when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network unavailable"),
    );
    const onAuth = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthPage mode="login" onAuth={onAuth} />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Email"), "player@example.test");
    await user.type(screen.getByLabelText("Password"), "any-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Network unavailable",
    );
    expect(onAuth).not.toHaveBeenCalled();
  });
});
