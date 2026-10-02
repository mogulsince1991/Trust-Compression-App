export function shouldCloseJourneySession(view: string, saved: boolean, choosingContent: boolean) {
  return saved && view !== "editor" && !(view === "library" && choosingContent);
}
