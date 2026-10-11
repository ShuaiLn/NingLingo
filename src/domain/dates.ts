import type { ISODate } from "./models";

export const DEFAULT_TIMEZONE = "America/Tijuana";

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone.length > 0;
  } catch {
    return false;
  }
}

/** A learning day is a civil calendar date in the account's timezone. */
export function learningDate(now: Date | string = new Date(), timezone = DEFAULT_TIMEZONE): ISODate {
  const value = typeof now === "string" ? new Date(now) : now;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Calendar arithmetic avoids DST-dependent 23/25-hour learning days. */
export function addDays(date: ISODate, days: number): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected a YYYY-MM-DD learning date.");
  const value = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date) throw new Error("Invalid learning date.");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function learningStreak(dates: ISODate[], today: ISODate): number {
  const studied = new Set(dates);
  let cursor = studied.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (studied.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}
