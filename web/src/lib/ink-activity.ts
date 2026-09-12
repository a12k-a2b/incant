// One activity gate shared by canvases and optional background work. It is not
// the durable save queue: authoritative local writes must never wait for idle.
const contacts = new Set<object>();
export function setInkContact(owner: object, active: boolean) {
  if (active) contacts.add(owner);
  else contacts.delete(owner);
}
export function inkIsActive() {
  return contacts.size > 0;
}
export function afterInk(work: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const attempt = () => {
    if (inkIsActive()) timer = setTimeout(attempt, 100);
    else work();
  };
  timer = setTimeout(attempt, 100);
  return () => clearTimeout(timer);
}
