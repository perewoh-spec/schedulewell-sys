// Creates (or resets) the demo accounts and their made-up data.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> npm run seed:demo
//
// The secret key is in Supabase -> Project Settings -> API Keys. Never put it in .env or the app.
// Safe to re-run: it resets the demo accounts' passwords and roles and replaces all demo data.
// Demo accounts carry app_metadata.demo = true, and every demo row has is_demo = true; the
// database keeps that data completely separate from real accounts (see the demo isolation migration).

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const PASSWORD = "schedulewell-demo"; // must match DEMO_PASSWORD in src/lib/demo.ts
const ACCOUNTS = [
  { key: "admin", role: "admin", name: "Ngozi Eze", email: "demo.admin@example.com" },
  { key: "doctor", role: "doctor", name: "Dr. Amina Yusuf", email: "demo.doctor@example.com" },
  { key: "patient", role: "patient", name: "Chidi Okeke", email: "demo.patient@example.com" },
];

const headers = { apikey: KEY, "Content-Type": "application/json" };

async function call(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}${path}`, { method, headers: { ...headers, ...extra }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const rest = (method, table, body, query = "") =>
  call(method, `/rest/v1/${table}${query}`, body, { Prefer: "return=representation" });

const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 1. Accounts: create or reset, confirmed so they can sign in straight away.
const { users } = await call("GET", "/auth/v1/admin/users?per_page=1000");
const ids = {};
for (const a of ACCOUNTS) {
  const existing = users.find((u) => u.email === a.email);
  const attrs = { email: a.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: a.name }, app_metadata: { demo: true } };
  const user = existing
    ? await call("PUT", `/auth/v1/admin/users/${existing.id}`, attrs)
    : await call("POST", "/auth/v1/admin/users", attrs);
  ids[a.key] = user.id;
  await rest("PATCH", "profiles", { full_name: a.name }, `?user_id=eq.${user.id}`);
}

// 2. Roles: exactly one role per demo account. Add the new role before removing others
//    so the "last admin" safeguard never trips.
for (const a of ACCOUNTS) {
  await call("POST", "/rest/v1/user_roles?on_conflict=user_id,role", { user_id: ids[a.key], role: a.role },
    { Prefer: "resolution=ignore-duplicates" });
  await rest("DELETE", "user_roles", null, `?user_id=eq.${ids[a.key]}&role=neq.${a.role}`);
}

// 3. Clear previous demo data. Deleting the patients cascades to their appointments,
//    requests, records and messages. Staff accounts don't need patient records.
await rest("DELETE", "patients", null, "?is_demo=eq.true");
await rest("DELETE", "patients", null, `?user_id=in.(${ids.admin},${ids.doctor})`);
await rest("DELETE", "notifications", null, `?user_id=in.(${Object.values(ids).join(",")})`);

// 4. Patients.
const [chidi, fatima, samuel] = await rest("POST", "patients", [
  { user_id: ids.patient, full_name: "Chidi Okeke", email: "demo.patient@example.com", date_of_birth: "1992-04-18",
    gender: "male", blood_type: "O+", genotype: "AA", phone: "+234 803 000 0001", address: "12 Unity Road, Yola",
    emergency_contact: "Ada Okeke", emergency_phone: "+234 803 000 0002", is_demo: true },
  { full_name: "Fatima Bello", email: "fatima.bello@example.com", date_of_birth: "1987-11-02", gender: "female",
    blood_type: "A+", genotype: "AS", phone: "+234 803 000 0003",
    user_id: null, address: null, emergency_contact: null, emergency_phone: null, is_demo: true },
  { full_name: "Samuel Adeyemi", email: "samuel.adeyemi@example.com", date_of_birth: "1975-06-30", gender: "male",
    blood_type: "B+", genotype: "AA", phone: "+234 803 000 0004",
    user_id: null, address: null, emergency_contact: null, emergency_phone: null, is_demo: true },
]);

// 5. Appointments: a past completed visit, today's schedule and an upcoming visit.
const doc = ids.doctor;
const [past, upcoming] = await rest("POST", "appointments", [
  { patient_id: chidi.id, doctor_id: doc, appointment_date: dayOffset(-14), start_time: "09:00", end_time: "09:30",
    status: "completed", reason: "Fever and body aches", created_by: ids.admin },
  { patient_id: chidi.id, doctor_id: doc, appointment_date: dayOffset(1), start_time: "10:00", end_time: "10:30",
    status: "scheduled", reason: "Persistent headaches", created_by: ids.admin },
  { patient_id: fatima.id, doctor_id: doc, appointment_date: dayOffset(0), start_time: "11:00", end_time: "11:30",
    status: "scheduled", reason: "Antenatal check-up", created_by: ids.admin },
  { patient_id: samuel.id, doctor_id: doc, appointment_date: dayOffset(0), start_time: "14:00", end_time: "14:30",
    status: "scheduled", reason: "Blood pressure review", created_by: ids.admin },
]);

// 6. A medical record from the completed visit.
await rest("POST", "medical_records", {
  patient_id: chidi.id, doctor_id: doc, record_date: dayOffset(-14), diagnosis: "Uncomplicated malaria",
  symptoms: "Fever for 3 days, headache, joint pain", treatment: "Artemether-lumefantrine, 3-day course; rest and fluids",
  prescription: "Artemether-lumefantrine 80/480 mg twice daily for 3 days\nParacetamol 1 g every 8 hours as needed",
  notes: "Rapid diagnostic test positive. Return if symptoms persist after treatment.", follow_up_date: dayOffset(1),
});

// 7. Chat about the upcoming visit.
await rest("POST", "messages", [
  { appointment_id: upcoming.id, sender_id: ids.patient, content: "Good morning doctor, the headaches have been worse in the evenings." },
  { appointment_id: upcoming.id, sender_id: doc, content: "Thanks for letting me know. Please keep a note of when they start, and we'll go through it tomorrow." },
]);

// 8. Requests waiting for review (the database notifies admins automatically).
await rest("POST", "appointment_requests", [
  { patient_id: samuel.id, reason: "Chest pain when climbing stairs (urgency: high)",
    notes: "Name: Samuel Adeyemi\nAge: 50\nBlood type: B+\nNotes: Pain eases after resting." },
  { patient_id: chidi.id, reason: "Follow-up on blood test results",
    notes: "Name: Chidi Okeke\nGenotype: AA\nBlood type: O+" },
]);

// 9. A confirmation the demo patient would have received.
await rest("POST", "notifications", {
  user_id: ids.patient, title: "Appointment Confirmed", type: "success",
  message: `Your appointment has been scheduled for ${dayOffset(1)} at 10:00. You can now chat with your doctor.`,
});

console.log("Demo ready. Accounts (password: %s):", PASSWORD);
for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(8)} ${a.email}`);
void past;
