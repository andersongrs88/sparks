export default function DebugEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Debug Env</h1>

      <p><b>NEXT_PUBLIC_SUPABASE_URL:</b> {url ? "OK" : "VAZIO"}</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{url}</pre>

      <p><b>NEXT_PUBLIC_SUPABASE_ANON_KEY:</b> {key ? "OK" : "VAZIO"}</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {key ? key.slice(0, 20) + "..." + key.slice(-10) : ""}
      </pre>
    </div>
  );
}
