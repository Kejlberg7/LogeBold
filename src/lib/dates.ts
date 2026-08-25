export const TZ = "Europe/Copenhagen";

const MONTHS_DA = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

const MONTHS_DA_SHORT = [
  "jan.", "feb.", "mar.", "apr.", "maj", "jun.",
  "jul.", "aug.", "sep.", "okt.", "nov.", "dec.",
];

const partsFormatter = new Intl.DateTimeFormat("da-DK", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function parts(date: Date): Parts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
  };
}

/** "2026-09" — måneden kampen blev spillet i, dansk tid. */
export function monthKey(date: Date): string {
  const p = parts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** "september 2026" */
export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS_DA[month - 1]} ${year}`;
}

/** "13. sep." */
export function formatDate(date: Date): string {
  const p = parts(date);
  return `${p.day}. ${MONTHS_DA_SHORT[p.month - 1]}`;
}

/** "13. sep. 2026" */
export function formatDateLong(date: Date): string {
  const p = parts(date);
  return `${p.day}. ${MONTHS_DA_SHORT[p.month - 1]} ${p.year}`;
}

/** "13. sep. 15.00" */
export function formatDateTime(date: Date): string {
  const p = parts(date);
  return `${formatDate(date)} ${String(p.hour).padStart(2, "0")}.${String(p.minute).padStart(2, "0")}`;
}

/** Til <input type="date"> — dansk kalenderdag, ikke UTC-dag. */
export function toDateInputValue(date: Date): string {
  const p = parts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Læser en dato fra <input type="date"> som kl. 12 dansk tid, så måneden altid rammer rigtigt. */
export function fromDateInputValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}
