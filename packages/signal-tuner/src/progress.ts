import { load, remove, save } from "./storage";
import type { Transmission } from "./transmissions";

export const PROGRESS_KEY = "signal-os-progress";

interface Saved {
  completed: string[];
  // Words found so far in transmissions that aren't finished, as band ids.
  decoded: Record<string, string[]>;
}

// What the player has decoded, kept in localStorage. Saved data is checked
// against the current transmissions, so renamed or removed ones are dropped.
export function createProgress(transmissions: Transmission[]) {
  const bandIds = new Map(
    transmissions.map((t) => [t.id, new Set(t.bands.map((b) => b.id))])
  );
  const raw = load<Partial<Saved> | null>(PROGRESS_KEY, null) ?? {};

  const completed = new Set(
    (Array.isArray(raw.completed) ? raw.completed : []).filter((id) =>
      bandIds.has(id)
    )
  );
  const decoded = new Map<string, string[]>();
  for (const [id, ids] of Object.entries(raw.decoded ?? {})) {
    const valid = bandIds.get(id);
    if (valid == null || completed.has(id) || !Array.isArray(ids)) continue;
    const kept = ids.filter((b) => valid.has(b));
    if (kept.length > 0 && kept.length < valid.size) decoded.set(id, kept);
  }

  const persist = () =>
    save(PROGRESS_KEY, {
      completed: [...completed],
      decoded: Object.fromEntries(decoded),
    });

  return {
    isCompleted: (id: string) => completed.has(id),
    decodedBands: (id: string): string[] => decoded.get(id) ?? [],
    setDecoded(id: string, ids: string[]) {
      decoded.set(id, ids);
      persist();
    },
    complete(id: string) {
      completed.add(id);
      decoded.delete(id);
      persist();
    },
    reset() {
      remove(PROGRESS_KEY);
    },
  };
}
