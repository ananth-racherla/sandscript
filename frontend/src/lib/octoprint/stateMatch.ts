/** OctoPrint has several state strings for "not connected to the board"
 * (Offline, Offline after error, Closed, Closed with error), so match by
 * prefix rather than a fixed exact-match list. */
export function isDisconnectedState(state: string): boolean {
  return state.startsWith('Offline') || state.startsWith('Closed');
}

export function stateColor(state: string): string {
  if (state === 'Operational') return '#4a8';
  if (state === 'Printing') return '#c8a06a';
  if (state === 'Paused') return '#f4a';
  if (state === 'Cancelling') return '#c66';
  if (state.toLowerCase().includes('error')) return '#c00';
  if (isDisconnectedState(state)) return '#e08a30';
  return '#ccc';
}
