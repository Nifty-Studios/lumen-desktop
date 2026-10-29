// Create an account or log in. At first launch it stands alone over the sky; later (from the
// sidebar card or Settings) it opens over the app. "Later" keeps Lumen on this device only.

import { useState, type FormEvent } from "react";
import { MIN_PASSWORD } from "@lumen/shared";
import { AccountError } from "@lumen/shared/client";
import { lumen } from "../db/client";
import { Icon } from "./Icon";
import { Segmented, TextInput } from "./ui";

type Mode = "signup" | "login";

interface Props {
  onDone: () => void;
  /** First launch only: carry on without an account. */
  onLater?: () => void;
  /** Opened over the app: closes without signing in. */
  onClose?: () => void;
}

export function AuthScreen({ onDone, onLater, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "signup" && password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "signup") await lumen.account.signUp({ name: name.trim(), email, password });
      else await lumen.account.logIn({ email, password });
      await lumen.connect();
      onDone();
    } catch (err) {
      setError(err instanceof AccountError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const card = (
    <form onSubmit={submit} className="glass animate-pop relative w-[min(400px,92vw)] rounded-[28px] px-8 pt-9 pb-7" onMouseDown={(e) => e.stopPropagation()}>
      {onClose && (
        <button type="button" onClick={onClose} className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Close">
          <Icon name="x" size={18} />
        </button>
      )}
      <div className="mb-1 flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="sun" size={22} />
        </span>
        <h1 className="font-serif text-[34px] leading-none font-semibold tracking-tight">Lumen</h1>
      </div>
      <p className="mb-6 text-[13.5px] leading-relaxed text-muted">
        {mode === "signup" ? "Your notes on every device, and shared with whoever you choose." : "Welcome back. Your notes are waiting."}
      </p>

      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(undefined);
        }}
        options={[
          { value: "signup", label: "Create account" },
          { value: "login", label: "Log in" },
        ]}
      />

      <div className="mt-5 flex flex-col gap-3">
        {mode === "signup" && <TextInput autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}
        <TextInput
          autoFocus={mode === "login"}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <TextInput
          type="password"
          placeholder={mode === "signup" ? `Password (${MIN_PASSWORD}+ characters)` : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-danger">
          <Icon name="triangle-alert" size={15} className="mt-0.5 flex-none" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-medium text-accent-fg transition-all hover:brightness-110 disabled:opacity-60"
      >
        {busy && <Icon name="loader-circle" size={16} className="animate-spin" />}
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
      </button>

      {onLater && (
        <button type="button" onClick={onLater} className="mt-3 w-full rounded-xl py-2 text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg">
          Later · keep my notes on this device for now
        </button>
      )}
    </form>
  );

  if (onClose)
    return (
      <div className="animate-fade fixed inset-0 z-50 grid place-items-center" style={{ background: "var(--scrim)" }} onMouseDown={onClose}>
        {card}
      </div>
    );
  return <div className="relative z-10 grid h-full place-items-center px-6">{card}</div>;
}
