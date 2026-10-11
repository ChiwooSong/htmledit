export interface History<T> {
  present: T;
  past: T[];
  future: T[];
}
export const createHistory = <T>(present: T): History<T> => ({ present, past: [], future: [] });
export function commit<T>(history: History<T>, next: T): History<T> {
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return { present: next, past: [...history.past.slice(-49), history.present], future: [] };
}
export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    present: history.past.at(-1)!,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  };
}
export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    present: history.future[0],
    past: [...history.past, history.present],
    future: history.future.slice(1),
  };
}
