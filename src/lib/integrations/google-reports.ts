const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidReportDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addReportDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function defaultReportRange(days: number, lagDays = 1) {
  const endDate = addReportDays(new Date().toISOString().slice(0, 10), -lagDays);
  return { startDate: addReportDays(endDate, -(days - 1)), endDate };
}

export function previousReportRange(startDate: string, endDate: string) {
  const days = Math.round((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
  const previousEndDate = addReportDays(startDate, -1);
  return { startDate: addReportDays(previousEndDate, -(days - 1)), endDate: previousEndDate };
}

export function reportRangeIsValid(startDate: string, endDate: string, maxDays = 366) {
  if (!isValidReportDate(startDate) || !isValidReportDate(endDate) || startDate > endDate) return false;
  const days = Math.round((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
  return days > 0 && days <= maxDays;
}

export function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10_000) / 100;
}
