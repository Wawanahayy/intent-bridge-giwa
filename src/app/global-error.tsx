"use client";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <html>
      <body style={{ background:"#0b0b0b", color:"#fff", fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco" }}>
        <div style={{ maxWidth:820, margin:"40px auto", padding:20, border:"1px solid #ffffff22", borderRadius:12 }}>
          <h2 style={{ marginTop:0 }}>⚠️ App Error</h2>
          <pre style={{ whiteSpace:"pre-wrap" }}>{String(error.message || error)}</pre>
          {error.stack ? <details style={{ marginTop:12 }}><summary>Stack</summary><pre>{error.stack}</pre></details> : null}
          <button onClick={() => reset()} style={{ marginTop:16, padding:"8px 12px", borderRadius:8, background:"#1f6feb", border:"none", color:"#fff" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
