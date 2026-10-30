"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export default function AuthEntry({ signup }: { signup: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <form
      className="company-auth"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        const data = new FormData(e.currentTarget);
        try {
          const r = await fetch(
            `/api/auth/${signup ? "sign-up" : "sign-in"}/email`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                email: data.get("email"),
                password: data.get("password"),
                ...(signup ? { name: data.get("name") } : {}),
              }),
            },
          );
          if (!r.ok) {
            setNotice(
              r.status === 429
                ? "Too many attempts. Wait before trying again."
                : signup
                  ? "Account creation failed. Check your details or sign in if you already have an account."
                  : "Sign-in failed. Check your details.",
            );
            return;
          }
          // A new account always starts at onboarding. A returning account goes
          // home, unless it never finished creating its Passport.
          let next = "/onboarding";
          if (!signup) {
            const me = await fetch("/api/account/inspect", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            })
              .then((x) => x.json())
              .catch(() => null);
            next =
              me?.status === "available" && me.data?.passport
                ? "/dashboard"
                : "/onboarding";
          }
          router.replace(next);
          router.refresh();
        } catch {
          setNotice(
            "The service is unavailable. Your browser could not complete the request.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {signup && (
        <label>
          Name
          <input name="name" autoComplete="name" maxLength={100} required />
        </label>
      )}
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      {signup && (
        <label className="company-auth-consent">
          <input type="checkbox" required />{" "}
          <span>
            I have read and accept the <Link href="/terms">service terms</Link>{" "}
            and understand the <Link href="/privacy">privacy notice</Link>.
          </span>
        </label>
      )}
      <button className="company-primary" disabled={busy} type="submit">
        {busy ? "Connecting…" : signup ? "Create account" : "Sign in"}
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <p>
        {signup ? "Already have an account?" : "New to TastePolicy?"}{" "}
        <Link href={signup ? "/login" : "/signup"}>
          {signup ? "Sign in" : "Create an account"}
        </Link>
        .
      </p>
    </form>
  );
}
