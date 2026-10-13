"use client";

import { useState } from "react";
import type { WordCareState, WordProgress } from "@/domain/models";
import { applyWordCareAction, wordCareStatus } from "@/domain/word-care";
import { useRepositories } from "./app-provider";
import "./word-details.css";

/** The same owner operation is used by vocabulary, details, feedback and summary. */
export function WordCare({ wordId, progress, state, deleted = false }: { wordId: string; progress?: WordProgress; state?: WordCareState; deleted?: boolean }) {
  const repos = useRepositories();
  const [pending, setPending] = useState<WordCareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = pending?.wordId === wordId && (!state || pending.updatedAt > state.updatedAt) ? pending : state;
  const status = wordCareStatus(progress, current);
  async function update(action: "add" | "remove") {
    if (busy || deleted) return;
    const before = current;
    const base = before ?? { wordId, userId: "", manualCare: false, automaticSuppressed: false, updatedAt: "" };
    setPending(applyWordCareAction(base, action, new Date().toISOString()));
    setBusy(true); setMessage("");
    try {
      const saved = await repos.care.setManual(wordId, action);
      setMessage(action === "add" ? "Added to Words that need care." : "Removed. Automatic reminders are suppressed until a new incorrect answer.");
      setPending(saved);
    } catch (failure) {
      setPending(before ?? null);
      setMessage(failure instanceof Error ? failure.message : "Could not update care. Please try again.");
    } finally { setBusy(false); }
  }
  return <div className="word-care" aria-label="Words that need care">
    <span className="badge">{status.active ? `Needs care · ${status.source}` : status.suppressed ? "Automatic care suppressed" : "No care marker"}</span>
    <div className="toolbar">
      <button type="button" className="button secondary" aria-label={`Add ${wordId} to Words that need care`} disabled={deleted || busy || status.manual} onClick={() => void update("add")}>Add</button>
      <button type="button" className="button secondary" aria-label={`Remove ${wordId} from Words that need care`} disabled={deleted || busy || (!status.active && status.suppressed)} onClick={() => void update("remove")}>Remove</button>
    </div>
    {deleted && <small className="muted">This word was deleted. Historical details are preserved.</small>}
    {message && <small role="status">{message}</small>}
  </div>;
}
