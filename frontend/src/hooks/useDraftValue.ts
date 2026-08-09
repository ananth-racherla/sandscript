import { useState } from 'react';

/** Local draft state that resets to match `value` whenever `value` changes
 * elsewhere (e.g. restored from localStorage, or committed by another
 * control), without fighting in-progress typing in between. Uses React's
 * "adjust state during render" pattern — a guarded setState call in the
 * render body — instead of useEffect, so the reset doesn't cost an extra
 * render pass and never risks a setState-in-effect cascade. */
export function useDraftValue<T>(value: T): [T, (v: T) => void] {
  const [prevValue, setPrevValue] = useState(value);
  const [draft, setDraft] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  return [draft, setDraft];
}
