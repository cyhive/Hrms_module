/**
 * Default company public holidays (India, 2026 gazetted-style list).
 * Admins can mark any of these as a required working day; that is stored in MongoDB.
 */
export const DEFAULT_PUBLIC_HOLIDAYS: { date: string; name: string }[] = [
  { date: "2026-01-14", name: "Makar Sankranti" },
  { date: "2026-01-26", name: "Republic Day" },
  { date: "2026-03-04", name: "Holi" },
  { date: "2026-03-21", name: "Id-ul-Fitr" },
  { date: "2026-03-26", name: "Ram Navami" },
  { date: "2026-03-31", name: "Mahavir Jayanti" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "Buddha Purnima / Labour Day" },
  { date: "2026-05-27", name: "Id-ul-Zuha (Bakrid)" },
  { date: "2026-06-26", name: "Muharram" },
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-08-26", name: "Id-e-Milad" },
  { date: "2026-09-04", name: "Janmashtami" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2026-10-20", name: "Dussehra" },
  { date: "2026-11-08", name: "Diwali" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas Day" },
];

export const defaultHolidayByDate = new Map(
  DEFAULT_PUBLIC_HOLIDAYS.map((h) => [h.date, h.name]),
);

export function listDefaultHolidaysInMonth(
  year: number,
  monthIndex: number,
): { date: string; name: string }[] {
  const m = String(monthIndex + 1).padStart(2, "0");
  const prefix = `${year}-${m}`;
  return DEFAULT_PUBLIC_HOLIDAYS.filter((h) => h.date.startsWith(prefix)).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function isDefaultPublicHolidayDate(isoDate: string): boolean {
  return defaultHolidayByDate.has(isoDate);
}
