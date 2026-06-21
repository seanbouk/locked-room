// Player progress: which keys are unlocked and which rooms are cleared.
// Persisted to localStorage so progress survives a reload. Reactive via runes.

import { STARTING_KEYS, LEVELS } from '../engine/levels';

const STORAGE_KEY = 'locked-room/progress/v1';

interface Saved {
  unlockedKeys: string[];
  completed: number[];
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (Array.isArray(s.unlockedKeys) && Array.isArray(s.completed)) return s;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { unlockedKeys: [...STARTING_KEYS], completed: [] };
}

class Progress {
  unlockedKeys = $state<string[]>([...STARTING_KEYS]);
  completed = $state<number[]>([]);

  constructor() {
    const s = load();
    this.unlockedKeys = s.unlockedKeys;
    this.completed = s.completed;
  }

  private save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ unlockedKeys: this.unlockedKeys, completed: this.completed }),
      );
    } catch {
      /* ignore */
    }
  }

  has(keyId: string): boolean {
    return this.unlockedKeys.includes(keyId);
  }

  isComplete(levelId: number): boolean {
    return this.completed.includes(levelId);
  }

  /** A level is playable once the one before it is cleared (level 1 always is). */
  isUnlocked(levelId: number): boolean {
    if (levelId <= 1) return true;
    return this.completed.includes(levelId - 1);
  }

  /** Record a clear. Returns the newly-awarded key id, if this was the first time. */
  complete(levelId: number): string | null {
    const lvl = LEVELS.find((l) => l.id === levelId);
    let awarded: string | null = null;
    if (lvl?.award && !this.unlockedKeys.includes(lvl.award)) {
      this.unlockedKeys = [...this.unlockedKeys, lvl.award];
      awarded = lvl.award;
    }
    if (!this.completed.includes(levelId)) this.completed = [...this.completed, levelId];
    this.save();
    return awarded;
  }

  reset() {
    this.unlockedKeys = [...STARTING_KEYS];
    this.completed = [];
    this.save();
  }
}

export const progress = new Progress();
