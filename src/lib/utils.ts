import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Today's date as YYYY-MM-DD in the user's own timezone (toISOString() would give the UTC date).
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Formats a YYYY-MM-DD date column without shifting it a day in timezones west of UTC.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

// Supabase errors and thrown values both have a message; fall back to a generic one.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Something went wrong";
}
