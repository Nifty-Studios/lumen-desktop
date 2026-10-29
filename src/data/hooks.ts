import { useEffect, useState } from "react";
import { account, onChange } from "./workspace";

/** Runs `load` now and again after every write and whenever the account or its access changes. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let current = true;
    const run = () => load().then((v) => current && setValue(v), console.error);
    run();
    const offData = onChange(run);
    const offAccount = account.onChange(run);
    return () => {
      current = false;
      offData();
      offAccount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** The signed-in account (or undefined), kept current. */
export function useAccount() {
  const [, render] = useState(0);
  useEffect(() => account.onChange(() => render((n) => n + 1)), []);
  return { user: account.current?.user, access: account.access, reminderDue: account.reminderDue(), available: account.available };
}

export function useColorScheme(): "light" | "dark" {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return dark ? "dark" : "light";
}
