"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Theme toggle. Persists the explicit choice in localStorage; when the user has
 * never chosen, the system preference applies (mirrored by the inline script in
 * the root layout so there is no flash).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("vessel-theme", next ? "dark" : "light");
    } catch {
      /* storage may be blocked; the toggle still works for this page view */
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-quiet size-9 rounded-full ${className}`}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme"
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
