import { createAuthClient } from "better-auth/react";
import type { SubmitEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import "../../styles/auth.css";

type LoginAppProps = {
  apiBaseUrl?: string;
  demoMode?: boolean;
  signupsEnabled?: boolean;
};

type AuthNotice = {
  tone: "error" | "success" | "info";
  text: string;
};

type SsoResponse = {
  redirect?: boolean;
  url?: string;
};

const readableError = (value: unknown, fallback: string) => {
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = Reflect.get(value, "message");
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const safeReturnPath = (value: string | null, origin: string) => {
  if (!value) return null;
  try {
    const candidate = new URL(value, origin);
    if (candidate.origin !== origin) return null;
    if (!/^\/oauth\/[^/]+\/authorize$/.test(candidate.pathname)) return null;
    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return null;
  }
};

export function LoginApp({
  apiBaseUrl = "",
  demoMode = false,
  signupsEnabled = false,
}: LoginAppProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot" | "reset">(
    "sign-in"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [ssoValue, setSsoValue] = useState("");
  const [ssoLookup, setSsoLookup] = useState<"email" | "provider">("email");
  const [pending, setPending] = useState<"password" | "sso" | "invitation" | null>(
    null
  );
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const autoAcceptanceStarted = useRef(false);
  const registrationEnabled = demoMode || signupsEnabled;

  const authClient = useMemo(
    () =>
      createAuthClient({
        baseURL: apiBaseUrl || undefined,
        basePath: "/api/auth",
      }),
    [apiBaseUrl]
  );

  const callbackURL = () => {
    if (!invitationId) {
      return new URL(returnTo ?? "/app", window.location.origin).toString();
    }
    const callback = new URL("/login", window.location.origin);
    callback.searchParams.set("invitationId", invitationId);
    if (returnTo) callback.searchParams.set("returnTo", returnTo);
    return callback.toString();
  };

  const verificationCallbackURL = () => {
    if (invitationId) return callbackURL();
    const callback = new URL("/login", window.location.origin);
    callback.searchParams.set("verified", "1");
    if (returnTo) callback.searchParams.set("returnTo", returnTo);
    return callback.toString();
  };

  const postAuthDestination = () => returnTo ?? "/app";

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const requestedReturnTo = safeReturnPath(
      search.get("returnTo"),
      window.location.origin
    );
    setReturnTo(requestedReturnTo);
    const passwordResetToken = search.get("token");
    if (passwordResetToken) {
      setResetToken(passwordResetToken);
      setMode("reset");
    } else if (search.get("error") === "INVALID_TOKEN") {
      setNotice({
        tone: "error",
        text: "That password-reset link is invalid or expired. Request a new one.",
      });
      setMode("forgot");
    }
    const currentInvitationId = search.get("invitationId");
    if (search.get("verified") === "1") {
      setNotice({
        tone: "success",
        text: "Email verified. Sign in to continue to the control plane.",
      });
    }
    if (!currentInvitationId) return;
    setInvitationId(currentInvitationId);
    if (autoAcceptanceStarted.current) return;
    autoAcceptanceStarted.current = true;

    void (async () => {
      const session = await authClient.getSession();
      if (!session.data) {
        setNotice({
          tone: "info",
          text: "Sign in with the invited email address to join the organization.",
        });
        return;
      }
      setPending("invitation");
      const result = await authClient.$fetch("/organization/accept-invitation", {
        method: "POST",
        body: { invitationId: currentInvitationId },
      });
      if (result.error) {
        setPending(null);
        setNotice({
          tone: "error",
          text: readableError(result.error, "The invitation could not be accepted."),
        });
        return;
      }
      window.location.replace(requestedReturnTo ?? "/app");
    })().catch((cause: unknown) => {
      setPending(null);
      setNotice({
        tone: "error",
        text: readableError(cause, "The invitation could not be accepted."),
      });
    });
  }, [authClient]);

  const ensureActiveOrganization = async () => {
    const session = await authClient.getSession();
    const activeOrganizationId = (
      session.data as { session?: { activeOrganizationId?: unknown } } | null
    )?.session?.activeOrganizationId;
    if (typeof activeOrganizationId === "string") return;
    if (!registrationEnabled) return;
    const localPart = email.trim().split("@")[0] || "workspace";
    const baseSlug =
      localPart
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "workspace";
    const result = await authClient.$fetch("/organization/create", {
      method: "POST",
      body: {
        name: name.trim() || `${localPart} workspace`,
        slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
      },
    });
    if (result.error) {
      throw new Error(
        readableError(result.error, "Your first organization could not be created.")
      );
    }
  };

  const submitPassword = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("password");
    setNotice(null);
    try {
      if (mode === "forgot") {
        const redirectTo = new URL("/login", window.location.origin).toString();
        const result = await authClient.$fetch("/request-password-reset", {
          method: "POST",
          body: { email: email.trim(), redirectTo },
        });
        if (result.error) {
          setNotice({
            tone: "error",
            text: readableError(result.error, "Password reset could not be requested."),
          });
          return;
        }
        setNotice({
          tone: "success",
          text: "If that account exists, a password-reset link is on its way.",
        });
        return;
      }
      if (mode === "reset") {
        if (!resetToken) {
          setNotice({ tone: "error", text: "The password-reset token is missing." });
          return;
        }
        const result = await authClient.$fetch("/reset-password", {
          method: "POST",
          body: { newPassword: password, token: resetToken },
        });
        if (result.error) {
          setNotice({
            tone: "error",
            text: readableError(result.error, "The password could not be reset."),
          });
          return;
        }
        setResetToken(null);
        setMode("sign-in");
        setPassword("");
        setNotice({
          tone: "success",
          text: "Password reset complete. Sign in with your new password.",
        });
        return;
      }
      if (mode === "sign-up") {
        if (!registrationEnabled) {
          setNotice({
            tone: "info",
            text: "Self-service registration is currently disabled. Ask an organization owner for an invitation, or use enterprise SSO.",
          });
          return;
        }
        const result = await authClient.signUp.email({
          callbackURL: verificationCallbackURL(),
          email: email.trim(),
          name: name.trim(),
          password,
        });
        if (result.error) {
          setNotice({
            tone: "error",
            text: readableError(result.error, "Account creation failed."),
          });
          return;
        }
        if (demoMode) {
          setNotice({
            tone: "success",
            text: "Local demo account created. Opening the control plane…",
          });
          window.location.assign(postAuthDestination());
          return;
        }
        setMode("sign-in");
        setNotice({
          tone: "success",
          text: "Account created. Check your inbox and verify your email before signing in.",
        });
        return;
      }

      const result = await authClient.signIn.email({
        callbackURL: callbackURL(),
        email: email.trim(),
        password,
      });
      if (result.error) {
        setNotice({
          tone: "error",
          text: readableError(result.error, "Sign in failed."),
        });
        return;
      }
      if (invitationId) {
        setPending("invitation");
        const invitationResult = await authClient.$fetch(
          "/organization/accept-invitation",
          {
            method: "POST",
            body: { invitationId },
          }
        );
        if (invitationResult.error) {
          setNotice({
            tone: "error",
            text: readableError(
              invitationResult.error,
              "Signed in, but the invitation could not be accepted."
            ),
          });
          return;
        }
      } else {
        await ensureActiveOrganization();
      }
      window.location.assign(postAuthDestination());
    } catch (cause) {
      setNotice({
        tone: "error",
        text: readableError(cause, "The authentication service could not be reached."),
      });
    } finally {
      setPending(null);
    }
  };

  const submitSso = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("sso");
    setNotice(null);
    try {
      const lookup = ssoValue.trim();
      const result = await authClient.$fetch<SsoResponse>("/sign-in/sso", {
        body: {
          callbackURL: callbackURL(),
          ...(ssoLookup === "email" ? { email: lookup } : { providerId: lookup }),
        },
        method: "POST",
      });
      if (result.error) {
        setNotice({
          tone: "error",
          text: readableError(result.error, "No matching SSO provider was found."),
        });
        return;
      }
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      setNotice({
        tone: "error",
        text: "The identity provider did not return a redirect URL.",
      });
    } catch (cause) {
      setNotice({
        tone: "error",
        text: readableError(cause, "The SSO service could not be reached."),
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="auth-shell">
      <a className="auth-wordmark" href="/" aria-label="LiteMCP Composer home">
        <span>Lite</span>
        <strong>MCP</strong>
        <span className="auth-wordmark__suffix">Composer</span>
      </a>

      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-card__header">
          <span>Identity plane</span>
          <h1 id="auth-title">Access the control plane</h1>
          <p>
            Use your managed organization identity or a password account issued for this
            environment.
          </p>
        </header>

        {notice ? (
          <div className={`auth-notice auth-notice--${notice.tone}`} role="status">
            {notice.text}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={submitSso}>
          <div className="auth-form__heading">
            <div>
              <span>Enterprise</span>
              <strong>Single sign-on</strong>
            </div>
            <span className="auth-protocols">OIDC · SAML 2.0</span>
          </div>
          <fieldset className="auth-segment" aria-label="SSO lookup method">
            <button
              type="button"
              className={ssoLookup === "email" ? "is-active" : undefined}
              onClick={() => setSsoLookup("email")}
            >
              Work email
            </button>
            <button
              type="button"
              className={ssoLookup === "provider" ? "is-active" : undefined}
              onClick={() => setSsoLookup("provider")}
            >
              Provider ID
            </button>
          </fieldset>
          <label>
            <span>{ssoLookup === "email" ? "Work email" : "Provider ID"}</span>
            <input
              required
              autoComplete={ssoLookup === "email" ? "email" : "off"}
              type={ssoLookup === "email" ? "email" : "text"}
              value={ssoValue}
              onChange={(event) => setSsoValue(event.target.value)}
              placeholder={
                ssoLookup === "email" ? "you@company.com" : "company-production"
              }
            />
          </label>
          <button
            className="auth-submit auth-submit--primary"
            type="submit"
            disabled={pending !== null}
          >
            {pending === "sso" ? "Locating provider…" : "Continue with SSO"}
          </button>
          <small>
            Your email is used only to discover the identity provider configured for its
            verified domain.
          </small>
        </form>

        <div className="auth-divider">
          <span>or use a password</span>
        </div>

        <form className="auth-form" onSubmit={submitPassword}>
          <div className="auth-form__heading">
            <div>
              <span>Account</span>
              <strong>
                {mode === "sign-in"
                  ? "Email and password"
                  : demoMode
                    ? "Create local demo account"
                    : "Create account"}
              </strong>
            </div>
          </div>
          {mode === "sign-up" ? (
            <label>
              <span>Name</span>
              <input
                required
                minLength={2}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          {mode !== "reset" ? (
            <label>
              <span>Email</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </label>
          ) : null}
          {mode !== "forgot" ? (
            <label>
              <span>Password</span>
              <input
                required
                minLength={12}
                maxLength={128}
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <small>12–128 characters.</small>
            </label>
          ) : null}
          <button className="auth-submit" type="submit" disabled={pending !== null}>
            {pending === "password"
              ? "Authenticating…"
              : mode === "sign-in"
                ? "Sign in"
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "reset"
                    ? "Set new password"
                    : demoMode
                      ? "Create demo account"
                      : "Create account"}
          </button>
          {mode === "sign-in" && !demoMode ? (
            <button
              className="auth-mode"
              type="button"
              onClick={() => {
                setMode("forgot");
                setNotice(null);
              }}
            >
              Forgot your password?
            </button>
          ) : null}
          {mode === "forgot" || mode === "reset" ? (
            <button
              className="auth-mode"
              type="button"
              onClick={() => {
                setMode("sign-in");
                setNotice(null);
              }}
            >
              Return to sign in
            </button>
          ) : null}
          {registrationEnabled ? (
            <button
              className="auth-mode"
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setNotice(null);
              }}
            >
              {mode === "sign-in"
                ? demoMode
                  ? "Create a local demo account"
                  : "Create an account"
                : mode === "sign-up"
                  ? "Return to sign in"
                  : "Create an account"}
            </button>
          ) : (
            <p className="auth-invite-note">
              Password accounts are provisioned by invitation in managed environments.
            </p>
          )}
        </form>
      </section>

      {demoMode ? (
        <aside className="auth-demo" aria-label="Demo access">
          <div>
            <span>Explicit development path</span>
            <strong>Explore without pretending to authenticate.</strong>
            <p>
              The demo console sends fixed tenant and role headers. It is clearly
              isolated from Better Auth sessions and must remain disabled in production.
            </p>
          </div>
          <a href="/app?demo=1">Open demo console →</a>
        </aside>
      ) : null}

      <footer className="auth-footer">
        <a href="/security">Security</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/docs">Documentation</a>
        <a href="/enterprise">Enterprise</a>
      </footer>
    </main>
  );
}
