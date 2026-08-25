const DAY_MS = 86_400_000;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(date, months) {
  const originalDay = date.getUTCDate();
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function addYearsClamped(date, years) {
  return addMonthsClamped(date, years * 12);
}

export function expandRecurringEntries(entries, { from, to }) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const result = [];

  for (const entry of entries) {
    const anchor = new Date(`${entry.date}T00:00:00.000Z`);
    let cursor = anchor;
    let occurrence = 0;
    const recurrenceEnd = entry.recurrenceEnd
      ? new Date(`${entry.recurrenceEnd}T00:00:00.000Z`)
      : toDate;
    const effectiveEnd = recurrenceEnd < toDate ? recurrenceEnd : toDate;

    while (cursor <= effectiveEnd) {
      if (cursor >= fromDate) {
        result.push({
          ...entry,
          occurrenceDate: isoDate(cursor),
          date: isoDate(cursor),
          instanceId: `${entry.id}:${isoDate(cursor)}`,
        });
      }

      switch (entry.recurrence) {
        case 'weekly':
          occurrence += 1;
          cursor = new Date(anchor.valueOf() + occurrence * 7 * DAY_MS);
          break;
        case 'monthly':
          occurrence += 1;
          cursor = addMonthsClamped(anchor, occurrence);
          break;
        case 'yearly':
          occurrence += 1;
          cursor = addYearsClamped(anchor, occurrence);
          break;
        default:
          cursor = new Date(effectiveEnd.valueOf() + DAY_MS);
      }
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}
