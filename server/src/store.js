const events = [];

export function addEvent(event) {
  const saved = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  events.unshift(saved);
  return saved;
}

export function getEvents() {
  return events.slice(0, 25);
}
