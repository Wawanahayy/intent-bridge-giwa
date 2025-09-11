"use client";
export default function IntentError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div className="card">
      <h2>⚠️ Intent Page Error</h2>
      <pre className="mono small" style={{ whiteSpace:"pre-wrap" }}>{String(error.message || error)}</pre>
      <button className="btn" onClick={() => reset()}>Reload</button>
    </div>
  );
}
