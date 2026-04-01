"use client";

import { useState } from "react";

const API_BASE = "https://api.coderhelm.com";

export function WaitlistForm({ className = "" }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/auth/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "You're on the list!");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className={`text-center ${className}`}>
        <p className="text-lg font-semibold text-emerald-400">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="flex flex-col gap-3 w-full sm:flex-row sm:justify-center">
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus("idle"); setMessage(""); }}
          required
          className="w-full sm:w-80 rounded-xl border border-surface-border bg-surface-elevated px-5 py-3.5 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={status === "loading" || !email.trim()}
          className="w-full sm:w-auto rounded-xl bg-blue-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Joining..." : "Get early access"}
        </button>
      </div>
      <textarea
        placeholder="What would you use Coderhelm for? (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={2}
        className="w-full sm:w-[29rem] rounded-xl border border-surface-border bg-surface-elevated px-5 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-blue-500 resize-none"
      />
      {status === "error" && <p className="text-sm text-red-400">{message}</p>}
    </form>
  );
}
