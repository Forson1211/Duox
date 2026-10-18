import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { registerSchema, loginSchema, type Account } from "@duo-clash/shared";
import { post } from "../lib/api";
import { useState } from "react";
const forgotSchema = z.object({ email: z.string().trim().email() });
const resetSchema = z.object({ password: registerSchema.shape.password });
export function AuthPage({
  mode,
  onAuth,
}: {
  mode: "login" | "register" | "forgot-password" | "reset-password";
  onAuth: (user: Account) => void;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const schema =
    mode === "register"
      ? registerSchema
      : mode === "login"
        ? loginSchema
        : mode === "forgot-password"
          ? forgotSchema
          : resetSchema;
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(schema),
  });
  const submit = form.handleSubmit(async (data) => {
    setError("");
    try {
      if (mode === "login" || mode === "register") {
        const result = await post<{ user: Account }>(`/auth/${mode}`, data);
        onAuth(result.user);
        const next = params.get("next");
        navigate(next?.startsWith("/app") ? next : "/app");
      } else {
        const result = await post<{
          message: string;
          developmentResetUrl?: string;
        }>(`/auth/${mode}`, {
          ...data,
          ...(mode === "reset-password"
            ? { token: params.get("token") ?? "" }
            : {}),
        });
        setMessage(result.message);
        setResetUrl(result.developmentResetUrl ?? "");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  });
  const title =
    mode === "register"
      ? "Your next rivalry starts here"
      : mode === "login"
        ? "Welcome back"
        : mode === "forgot-password"
          ? "Forgot your password?"
          : "Choose a new password";
  return (
    <main className="auth-page">
      <Link className="brand" to="/" aria-label="DUO CLASH">
        <Logo height={42} />
      </Link>
      <section className="auth-card">
        <span className="section-kicker">
          A LITTLE COMPETITION. A LOT OF CONNECTION.
        </span>
        <h1>{title}</h1>
        <p className="muted">
          {mode === "register"
            ? "Create an account, invite your people, and make your mark."
            : mode === "login"
              ? "Your people. Your games. Your next win."
              : "We’ll help you get back into the game."}
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label className="field-label">
                Display name
                <input
                  autoFocus
                  autoComplete="nickname"
                  {...form.register("displayName")}
                />
                <span className="field-error">
                  {form.formState.errors.displayName?.message}
                </span>
              </label>
              <label className="field-label">
                Username
                <input autoComplete="username" {...form.register("username")} />
                <span className="field-error">
                  {form.formState.errors.username?.message}
                </span>
              </label>
            </>
          )}
          {mode !== "reset-password" && (
            <label className="field-label">
              Email
              <input
                type="email"
                autoComplete="email"
                {...form.register("email")}
              />
              <span className="field-error">
                {form.formState.errors.email?.message}
              </span>
            </label>
          )}
          {mode !== "forgot-password" && (
            <label className="field-label">
              Password
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                {...form.register("password")}
              />
              <span className="field-error">
                {form.formState.errors.password?.message}
              </span>
            </label>
          )}
          {mode === "register" && (
            <small className="muted">
              At least 10 characters. Use a unique password.
            </small>
          )}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success-box">
              {message}
            </p>
          )}
          {resetUrl && (
            <p className="notice">
              Development email delivery is off.{" "}
              <a href={resetUrl}>Open your local reset link</a>.
            </p>
          )}
          <button
            className="btn btn-primary modal-submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? "Please wait…"
              : mode === "register"
                ? "Create account"
                : mode === "login"
                  ? "Log in"
                  : mode === "forgot-password"
                    ? "Send reset link"
                    : "Update password"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-links">
          <Link to={mode === "register" ? "/login" : "/register"}>
            {mode === "register"
              ? "Already a player? Log in"
              : "New here? Create an account"}
          </Link>
          <Link to={mode === "login" ? "/forgot-password" : "/login"}>
            {mode === "login" ? "Forgot password?" : "Back to login"}
          </Link>
        </div>
      </section>
    </main>
  );
}
