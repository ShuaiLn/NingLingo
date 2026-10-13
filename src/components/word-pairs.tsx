"use client";

import { useState } from "react";
import type { VocabularyEntry, WordPair } from "@/domain/models";
import { LANGUAGES } from "@/domain/languages";
import { useRepositories } from "./app-provider";

export function WordPairs({ entries, pairs }: { entries: VocabularyEntry[]; pairs: WordPair[] }) {
  const repos = useRepositories();
  const [editing, setEditing] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); setEditing(null); setSource(""); setTarget(""); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : "Could not update this word pair."); }
    finally { setBusy(false); }
  }
  const label = (id: string) => { const entry = entries.find(word => word.id === id); return entry ? `${entry.word} (${LANGUAGES[entry.language].name})` : "Unselected word"; };
  const visible = pairs.filter(pair => pair.status !== "deleted" && entries.some(entry => entry.id === pair.sourceWordId) && entries.some(entry => entry.id === pair.targetWordId));
  return <details className="quiz-word-pairs" open><summary>Cross-language word pairs ({visible.length})</summary>
    <p className="muted">Pairs apply to cross-language questions. Suggested pairs use saved English meanings and accepted answers; review ambiguous suggestions before practising.</p>
    {message && <p role="alert" className="notice">{message}</p>}
    {visible.map(pair => <div className="quiz-pair-row" key={pair.id}><div><strong>{label(pair.sourceWordId)} ↔ {label(pair.targetWordId)}</strong><small>{pair.status} · {Math.round(pair.confidence * 100)}% confidence</small>{pair.warning && <p className="notice">{pair.warning} You can continue with this suggestion.</p>}</div><div className="toolbar">
      {pair.status === "suggested" && <button className="button secondary" disabled={busy} onClick={() => void run(() => repos.wordPairs.save({ id: pair.id, sourceWordId: pair.sourceWordId, targetWordId: pair.targetWordId }))}>Confirm pair</button>}
      <button className="button secondary" disabled={busy} onClick={() => { setEditing(pair.id); setSource(pair.sourceWordId); setTarget(pair.targetWordId); }}>Edit pair</button>
      <button className="text-button" disabled={busy} onClick={() => void run(() => repos.wordPairs.remove(pair.id))}>Delete pair</button>
    </div></div>)}
    <form className="quiz-pair-form" onSubmit={event => { event.preventDefault(); void run(() => repos.wordPairs.save({ ...(editing ? { id: editing } : {}), sourceWordId: source, targetWordId: target })); }}>
      <label className="field">Source word<select value={source} onChange={event => setSource(event.target.value)} required><option value="">Choose a word</option>{entries.map(entry => <option key={entry.id} value={entry.id}>{label(entry.id)}</option>)}</select></label>
      <label className="field">Target word<select value={target} onChange={event => setTarget(event.target.value)} required><option value="">Choose another language</option>{entries.filter(entry => entry.language !== entries.find(word => word.id === source)?.language).map(entry => <option key={entry.id} value={entry.id}>{label(entry.id)}</option>)}</select></label>
      <button className="button secondary" disabled={busy || !source || !target}>{editing ? "Save pair" : "Add confirmed pair"}</button>
      {editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setSource(""); setTarget(""); }}>Cancel pair edit</button>}
    </form>
  </details>;
}
