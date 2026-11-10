// Working days in England & Wales: Monday to Friday, not bank holidays. Dates are 'YYYY-MM-DD'.
// Bank holidays from gov.uk. Add the next year's before the end of 2028.
export const BANK_HOLIDAYS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
]);
const asDate = iso => new Date(iso + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
export function isWorkingDay(day) { const w = asDate(day).getUTCDay(); return w !== 0 && w !== 6 && !BANK_HOLIDAYS.has(day); }
// Working days after `from` up to and including `to`
export function workingDaysBetween(from, to) {
  let n = 0; const d = asDate(from); const end = asDate(to);
  while (d < end) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkingDay(iso(d))) n++; }
  return n;
}
// Today's date in the UK
export function ukToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
