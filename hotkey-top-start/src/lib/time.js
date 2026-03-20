function getBusinessParts(now = new Date(), timezone = 'Europe/Moscow') {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function isNightMode(now = new Date(), timezone = 'Europe/Moscow') {
  const { hour } = getBusinessParts(now, timezone);
  return hour >= 0 && hour < 6;
}

module.exports = { getBusinessParts, isNightMode };
