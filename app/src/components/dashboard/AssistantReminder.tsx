"use client";

import { useState } from "react";
import { useAssistantStore } from "@/store/assistantStore";
import { Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function AssistantReminder() {
  const { customized, isLoading } = useAssistantStore();
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  if (isLoading || customized || dismissed) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.1) 100%)",
      border: "1px solid rgba(99,102,241,0.3)",
      borderRadius: "var(--r-xl)",
      padding: "16px 20px",
      marginBottom: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", background: "var(--accent)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <Sparkles size={16} />
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0, paddingBottom: 2 }}>
            ✨ Your creative sidekick needs a name!
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            Rumi is ready to help with your prompts and videos. Give your companion a name of its own.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)",
            padding: "8px 12px", borderRadius: "var(--r-md)", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}
        >
          Maybe later
        </button>
        <button
          onClick={() => router.push("/settings?tab=companion")}
          style={{
            background: "var(--accent)", border: "none", color: "#fff",
            padding: "8px 12px", borderRadius: "var(--r-md)", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}
        >
          Choose a name
        </button>
      </div>
    </div>
  );
}
