"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function submit() {
    if (!password) {
      setError("Enter the password");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Sign-in failed");
        setSubmitting(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 340, margin: "80px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Packages experiment dashboard</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>Enter the shared password to continue.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Password"
        style={{ width: "100%", padding: "9px 11px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, marginBottom: 10, boxSizing: "border-box" }}
      />
      {error && <p style={{ color: "#b3261e", fontSize: 13, marginBottom: 10 }}>{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        style={{ width: "100%", padding: "9px 11px", fontSize: 14, fontWeight: 500, border: "1px solid #333", borderRadius: 8, background: submitting ? "#eee" : "#fff", cursor: submitting ? "default" : "pointer" }}
      >
        {submitting ? "Checking…" : "Enter"}
      </button>
    </div>
  );
}