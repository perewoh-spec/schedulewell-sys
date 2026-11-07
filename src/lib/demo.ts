// Demo mode lets visitors sign in to ready-made accounts to explore each role.
// Turn it on with VITE_DEMO_MODE=true and create the accounts with `npm run seed:demo`.
// These credentials are public by design: only use demo mode with made-up data.

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export const DEMO_PASSWORD = "schedulewell-demo";

export const DEMO_ACCOUNTS = [
  { role: "admin", label: "Admin", name: "Ngozi Eze", email: "demo.admin@example.com", description: "Users, requests, audit logs, reports" },
  { role: "doctor", label: "Doctor", name: "Dr. Amina Yusuf", email: "demo.doctor@example.com", description: "Schedule, patient chat, medical records" },
  { role: "patient", label: "Patient", name: "Chidi Okeke", email: "demo.patient@example.com", description: "Request appointments, chat, view records" },
] as const;

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_ACCOUNTS.some((a) => a.email === email.toLowerCase());
}
