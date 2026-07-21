import { createAuthClient } from "better-auth/react";
import type { SubmitEvent } from "react";
import { useMemo, useState } from "react";

import "../../styles/auth.css";

type LoginAppProps = {
  apiBaseUrl?: string;
  demoMode?: boolean;
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

export function LoginApp({ apiBaseUrl = "", demoMode = false }: LoginAppProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [ssoValue, setSsoValue] = useState("");
  const [ssoLookup, setSsoLookup] = useState<"email" | "provider">("email");
  const [pending, setPending] = useState<"password" | "sso" | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  const authClient = useMemo(
    () =>
      createAuthClient({
        baseURL: apiBaseUrl || undefined,
        basePath: "/api/auth",
      }),
    [apiBaseUrl]
  );

  const callbackURL = () => new URL("/app", window.location.origin).toString();

  const submitPassword = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("password");
    setNotice(null);
    try {
      if (mode === "sign-up") {
        if (!demoMode) {
          setNotice({
            tone: "info",
            text: "Public self-service registration is disabled. Ask an organization owner for an invitation, or use enterprise SSO.",
          });
          return;
        }
        const result = await authClient.signUp.email({
          callbackURL: callbackURL(),
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
        setNotice({
          tone: "success",
          text: "Local demo account created. Opening the control plane…",
        });
        window.location.assign("/app");
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
      window.location.assign("/app");
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
                  : "Create local demo account"}
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
          <button className="auth-submit" type="submit" disabled={pending !== null}>
            {pending === "password"
              ? "Authenticating…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create demo account"}
          </button>
          {demoMode ? (
            <button
              className="auth-mode"
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setNotice(null);
              }}
            >
              {mode === "sign-in" ? "Create a local demo account" : "Return to sign in"}
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
        <a href="/docs">Documentation</a>
        <a href="/enterprise">Enterprise</a>
      </footer>
    </main>
  );
}
