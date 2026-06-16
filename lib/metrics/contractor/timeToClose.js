const easternFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function timeToClose({ leadCreatedDate, soldDate }) {
  if (!leadCreatedDate || !soldDate) return "";
  const lead = parseDateValue(leadCreatedDate);
  const sold = parseDateValue(soldDate);
  if (!lead || !sold || sold.date < lead.date) return "";

  const milliseconds = sold.date.getTime() - lead.date.getTime();
  if (!lead.hasTime || !sold.hasTime) return `${Math.max(0, Math.ceil(milliseconds / 86400000))} days`;

  const totalMinutes = Math.round(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function timeToCloseDays({ leadCreatedDate, soldDate }) {
  if (!leadCreatedDate || !soldDate) return null;
  const lead = parseDateValue(leadCreatedDate);
  const sold = parseDateValue(soldDate);
  if (!lead || !sold || sold.date < lead.date) return null;
  return (sold.date.getTime() - lead.date.getTime()) / 86400000;
}

export function averageTimeToCloseLabel(days) {
  if (days == null || !Number.isFinite(days)) return "N/A";
  return `${days.toFixed(days >= 10 ? 1 : 2)} days`;
}

export function easternDateTime(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return easternFormatter.format(parsed.date);
}

function parseDateValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const hasTime = /[tT]\d{2}:\d{2}|\d{1,2}:\d{2}/.test(text);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text);
  return Number.isNaN(date.getTime()) ? null : { date, hasTime };
}
