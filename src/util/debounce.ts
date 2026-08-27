export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  flush(): void;
  cancel(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const run = (...args: A) => {
    pending = args;
    clear();
    timer = setTimeout(() => {
      timer = undefined;
      const args2 = pending;
      pending = undefined;
      if (args2) {
        fn(...args2);
      }
    }, ms);
  };

  run.flush = () => {
    const args = pending;
    clear();
    pending = undefined;
    if (args) {
      fn(...args);
    }
  };

  run.cancel = () => {
    clear();
    pending = undefined;
  };

  return run;
}
