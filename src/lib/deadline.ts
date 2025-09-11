export function createDeadlineGuard(seconds?: number) {
  const t0 = Date.now();
  const ms = (seconds ?? 0) * 1000;
  return () => {
    if (!ms) return;
    if (Date.now() - t0 > ms) {
      throw new Error("Deadline exceeded — intent aborted");
    }
  };
}
