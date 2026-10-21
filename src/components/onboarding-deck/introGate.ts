// Which cards have had their explainer video watched this session.
//
// The card opens AS the video the first time it is reached (Marcus, 8 Sep:
// "the card is the video; when it finishes it switches to the action").
// Remembering that per deck and per card in sessionStorage means Previous,
// the sandbox Reset and a reload do not replay it mid-session; a fresh
// session plays it again, and the replay button on the card always works.

import { useCallback, useEffect, useState } from "react";

const storageKey = (deckId: string) => `onboarding-intro-seen:${deckId}`;

function readSeen(deckId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey(deckId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Forget every watched explainer for a deck (the sandboxes' Reset). */
export function clearIntroGate(deckId: string) {
  try {
    sessionStorage.removeItem(storageKey(deckId));
  } catch {
    /* ignore */
  }
}

/** Forget the watched explainer for some cards only (a sandbox reset to a card). */
export function forgetIntro(deckId: string, keys: string[]) {
  try {
    const remaining = [...readSeen(deckId)].filter((k) => !keys.includes(k));
    sessionStorage.setItem(storageKey(deckId), JSON.stringify(remaining));
  } catch {
    /* ignore */
  }
}

export function useIntroGate(deckId: string, epoch = 0) {
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(deckId));
  useEffect(() => {
    setSeen(readSeen(deckId));
  }, [deckId, epoch]);
  const markSeen = useCallback(
    (key: string) => {
      setSeen((prev) => {
        const next = new Set(prev);
        next.add(key);
        try {
          sessionStorage.setItem(storageKey(deckId), JSON.stringify([...next]));
        } catch {
          /* private mode, ignore */
        }
        return next;
      });
    },
    [deckId],
  );
  const reset = useCallback(() => {
    setSeen(new Set());
    clearIntroGate(deckId);
  }, [deckId]);
  return { hasSeen: (key: string) => seen.has(key), markSeen, reset };
}
