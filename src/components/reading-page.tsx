"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LanguageCode, LookupResult, Reading, ReadingAnnotation, ReadingVersion } from "@/domain/models";
import { tokenizeReading } from "@/domain/reading";
import { useAppData } from "@/components/app-provider";
import { AudioButton, useAudioStopOnChange } from "@/components/audio-button";

type Selection = { readingId: string; bodyVersion: number; start: number; end: number; text: string };
const SOURCE_LABELS = { annotation: "Manual annotation", vocabulary: "Personal vocabulary", cache: "Contextual cache", mock: "Development translation placeholder", deepl: "DeepL machine translation" };

export function ReadingPage({ language }: { language: LanguageCode }) {
  return <ReadingWorkspace key={language} language={language} />;
}

function ReadingWorkspace({ language }: { language: LanguageCode }) {
  const { repos, entries, lists, readings, ready } = useAppData(language);
  const repositoryRevision = useSyncExternalStore(repos.subscribe, repos.getRevision, () => 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Reading["status"]>("unread");
  const [annotations, setAnnotations] = useState<ReadingAnnotation[]>([]);
  const [versions, setVersions] = useState<ReadingVersion[]>([]);
  const [clearAnnotations, setClearAnnotations] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [allowance, setAllowance] = useState("");
  const [translation, setTranslation] = useState("");
  const [readingText, setReadingText] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [listId, setListId] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupGeneration = useRef(0);
  const lookupDraftChanged = useRef(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const selected = readings.find(item => item.id === selectedId) ?? null;
  useAudioStopOnChange(`${selectedId}:${selection?.start}:${selection?.end}`);
  const tokens = useMemo(() => selected ? tokenizeReading(selected.body, language, entries) : [], [selected, language, entries]);
  useEffect(() => {
    if (!repos.reading.getTranslationUsage) return;
    let active = true;
    repos.reading.getTranslationUsage().then(usage => { if (active) setAllowance(usage.limit > 0 ? `DeepL: ${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} characters used.${usage.available ? "" : " Allowance exhausted; manual translation is available."}` : "DeepL is unavailable. Manual translation is available."); }).catch(() => { if (active) setAllowance("DeepL allowance is unavailable. Manual translation is available."); });
    return () => { active = false; };
  }, [repos, lookup]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    Promise.all([repos.reading.getAnnotations(selectedId), repos.reading.getVersions(selectedId)])
      .then(([notes, history]) => { if (!cancelled) { setAnnotations(notes); setVersions(history); } })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load reading metadata."); });
    return () => { cancelled = true; };
  }, [repos, selectedId, selected?.version, repositoryRevision]);

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); lookupGeneration.current++; }, []);

  function resetLookup() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    lookupGeneration.current++; setSelection(null); setLookup(null); setLookupBusy(false);
  }

  function openReading(item: Reading) {
    resetLookup(); setAnnotations([]); setVersions([]); setSelectedId(item.id); setCreating(false); setEditing(false); setError(""); setMessage("");
  }

  function createReading() {
    resetLookup(); setCreating(true); setEditing(false); setTitle(""); setBody(""); setStatus("unread"); setClearAnnotations(false); setError(""); setMessage("");
  }

  function editReading() {
    if (!selected) return;
    resetLookup(); setEditing(true); setEditVersion(selected.version); setTitle(selected.title); setBody(selected.body); setStatus(selected.status); setClearAnnotations(false); setError(""); setMessage("");
  }

  async function saveReading(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await repos.reading.save({ language, title: title.trim(), body, status }, editing ? selectedId ?? undefined : undefined, clearAnnotations, editing ? editVersion ?? undefined : undefined);
      setSelectedId(result.id); setCreating(false); setEditing(false); setMessage("Reading saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save reading."); }
    finally { setBusy(false); }
  }

  async function uploadText(file: File | undefined) {
    if (!file) return;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      setBody(text); if (!title.trim()) setTitle(file.name.replace(/\.txt$/i, "")); setError("");
    } catch { setError("This file is not valid UTF-8 text. Save it as UTF-8 TXT and try again."); }
  }

  async function lookupRange(start: number, end: number) {
    if (!selected || creating || editing) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const text = selected.body.slice(start, end);
    if (!text.trim()) return;
    const generation = ++lookupGeneration.current;
    lookupDraftChanged.current = false;
    setSelection({ readingId: selected.id, bodyVersion: selected.version, start, end, text }); setLookup(null); setTranslation(""); setReadingText(""); setLinkedId(""); setLookupBusy(true); setError(""); setMessage("");
    try {
      const result = await repos.reading.lookup({ readingId: selected.id, bodyVersion: selected.version, start, end });
      if (generation !== lookupGeneration.current) return;
      setLookup(result);
      if (!lookupDraftChanged.current) { setTranslation(result.translation); setReadingText(result.reading); setLinkedId(result.vocabularyEntryId ?? ""); }
    } catch (reason) { if (generation === lookupGeneration.current) setError(reason instanceof Error ? reason.message : "Translation is unavailable. You can still add a manual meaning."); }
    finally { if (generation === lookupGeneration.current) setLookupBusy(false); }
  }

  function scheduleLookup(start: number, end: number) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => { void lookupRange(start, end); }, 350);
  }

  function selectedRange(): Selection | null {
    const selection = window.getSelection();
    const container = readerRef.current;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !container || !selected) return null;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
    const before = range.cloneRange(); before.selectNodeContents(container); before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const text = range.toString();
    return { readingId: selected.id, bodyVersion: selected.version, start, end: start + text.length, text };
  }

  async function saveAnnotation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !selection) return;
    setBusy(true); setError("");
    try {
      await repos.reading.annotate({ readingId: selection.readingId, bodyVersion: selection.bodyVersion, start: selection.start, end: selection.end, text: selection.text, translation: translation.trim(), reading: readingText.trim(), vocabularyEntryId: linkedId || null });
      setAnnotations(await repos.reading.getAnnotations(selected.id));
      setLookup({ text: selection.text, translation: translation.trim(), reading: readingText.trim(), source: "annotation", vocabularyEntryId: linkedId || null });
      setMessage("Manual annotation saved. It takes priority over vocabulary and machine results.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save annotation."); }
    finally { setBusy(false); }
  }

  async function addVocabulary() {
    if (!selection || !translation.trim()) { setError("Enter an English translation before adding this word."); return; }
    setBusy(true); setError("");
    try {
      let destination = listId || lists[0]?.id;
      if (!destination) destination = (await repos.vocabulary.createList(language, "Reading words")).id;
      const result = await repos.vocabulary.saveEntry({ language, listId: destination, word: selection.text, reading: readingText.trim(), translation: translation.trim(), type: "", category: "reading", example: "", notes: "Added from a reading annotation.", acceptedAnswers: [] });
      setLinkedId(result.id); setMessage("Word added to Vocabulary. Save the annotation to link it to this passage.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add vocabulary."); }
    finally { setBusy(false); }
  }

  async function deleteReading() {
    if (!selected) return;
    setBusy(true); setError("");
    try { await repos.reading.delete(selected.id); setSelectedId(null); resetLookup(); setMessage("Reading deleted."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete reading."); }
    finally { setBusy(false); }
  }

  async function changeStatus(value: Reading["status"]) {
    if (!selected) return;
    try { await repos.reading.save({ language, title: selected.title, body: selected.body, status: value }, selected.id, false, selected.version); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update status."); }
  }

  const bodyChanged = editing && selected && body !== selected.body;
  const currentAnnotations = annotations.filter(item => item.bodyVersion === selected?.version);
  const staleSelection = selection !== null && (selection.readingId !== selected?.id || selection.bodyVersion !== selected?.version);

  if (!ready) return <div className="empty-state">Loading your readings…</div>;

  return <div>
    <div className="page-heading"><div><p className="eyebrow">Read in context</p><h1>Reading</h1><p className="muted">Keep useful words close to the stories you find them in.</p></div><button className="button" onClick={createReading}>New reading</button></div>
    {allowance && <p className="mini-note">{allowance}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <div className="reading-layout">
      <aside className="card reading-library" aria-label="Reading library"><div className="section-heading"><h2>Your library</h2><span className="badge">{readings.length}</span></div>
        {readings.length === 0 && <p className="muted">Paste a passage or upload a UTF-8 TXT file to begin.</p>}
        {readings.map(item => <button key={item.id} className={`reading-library-item ${item.id === selectedId && !creating ? "active" : ""}`} onClick={() => openReading(item)}><strong>{item.title}</strong><span className="muted">{item.status} · {item.body.length.toLocaleString()} characters</span></button>)}
      </aside>
      <div className="reading-main">
        {(creating || editing) ? <form className="card" onSubmit={saveReading}><h2>{editing ? "Edit reading" : "Add a reading"}</h2><label className="field">Title<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} /></label>
          <div className="grid-2"><label className="field">Status<select value={status} onChange={event => setStatus(event.target.value as Reading["status"])}><option value="unread">Unread</option><option value="reading">Reading</option><option value="finished">Finished</option></select></label><label className="field">Upload UTF-8 TXT<input type="file" accept=".txt,text/plain" onChange={event => void uploadText(event.target.files?.[0])} /></label></div>
          <label className="field">Text<textarea rows={15} value={body} onChange={event => setBody(event.target.value)} required placeholder="Paste an article, a story, or a few sentences…" /></label>
          {bodyChanged && <div className="notice"><p>Changing the body creates version {(selected?.version ?? 0) + 1}. Positional annotations from the previous body must be cleared to prevent mismatched text.</p>{currentAnnotations.length > 0 && <label><input type="checkbox" checked={clearAnnotations} onChange={event => setClearAnnotations(event.target.checked)} /> Clear {currentAnnotations.length} existing annotation{currentAnnotations.length === 1 ? "" : "s"}</label>}</div>}
          <div className="reading-actions"><button className="button" disabled={busy || Boolean(bodyChanged && currentAnnotations.length && !clearAnnotations)}>Save reading</button><button type="button" className="button secondary" onClick={() => { setCreating(false); setEditing(false); }}>Cancel</button></div>
        </form> : selected ? <>
          <div className="card"><div className="section-heading"><div><p className="eyebrow">Version {selected.version} · {currentAnnotations.length} annotations</p><h2>{selected.title}</h2></div><select aria-label="Reading status" value={selected.status} onChange={event => void changeStatus(event.target.value as Reading["status"])}><option value="unread">Unread</option><option value="reading">Reading</option><option value="finished">Finished</option></select></div>
            <p className="muted reading-help">Hover over a word, focus it with Tab, or click to look up. Select any passage to add your own meaning.</p>
            <div ref={readerRef} className="reading-body" onMouseUp={() => { const range = selectedRange(); if (range) void lookupRange(range.start, range.end); }} onKeyUp={event => { if (event.shiftKey) { const range = selectedRange(); if (range) void lookupRange(range.start, range.end); } }}>
              {tokens.map(token => token.word ? <span key={token.start} className={`reading-token ${currentAnnotations.some(annotation => annotation.start <= token.start && annotation.end >= token.end) ? "annotated" : ""} ${selection?.start === token.start && selection?.end === token.end ? "selected" : ""}`} tabIndex={0} role="button" aria-label={`Look up ${token.text}`} onMouseEnter={() => scheduleLookup(token.start, token.end)} onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }} onFocus={() => void lookupRange(token.start, token.end)} onClick={() => { if (!selectedRange()) void lookupRange(token.start, token.end); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void lookupRange(token.start, token.end); } }}>{token.text}</span> : <span key={token.start}>{token.text}</span>)}
            </div>
            <div className="reading-actions"><button className="button secondary" onClick={editReading}>Edit text</button><details><summary>Version history ({versions.length})</summary><ul>{versions.map(version => <li key={version.id}>Version {version.version} · {new Date(version.createdAt).toLocaleDateString()} · {version.body.length.toLocaleString()} characters</li>)}</ul></details></div>
            <details className="reading-delete"><summary>Manage reading</summary><p>Deleting this reading removes its saved annotations and version history.</p><button className="button secondary" disabled={busy} onClick={() => void deleteReading()}>Delete reading</button></details>
          </div>
          {selection && <form className="card reading-lookup" onSubmit={saveAnnotation}><div className="section-heading"><div><p className="eyebrow">{lookupBusy ? "Looking up…" : lookup ? SOURCE_LABELS[lookup.source] : "Manual lookup"}</p><h2>{selection.text}</h2></div><AudioButton text={language === "ja" && readingText ? readingText : selection.text} language={language} /></div>
            {staleSelection && <p className="notice" role="alert">This reading changed in another tab. Select the text again before saving an annotation.</p>}
            {(lookup?.source === "mock" || (lookup?.source === "cache" && !lookup.translation)) && <p className="notice">The development translation provider supplies a placeholder. Enter an English meaning below. No external translation service is connected.</p>}
            <div className="grid-2"><label className="field">English meaning<input value={translation} onChange={event => { lookupDraftChanged.current = true; setTranslation(event.target.value); }} required placeholder="Your translation" /></label><label className="field">Reading (optional)<input value={readingText} onChange={event => { lookupDraftChanged.current = true; setReadingText(event.target.value); }} placeholder={language === "ja" ? "Kana reading" : "Pronunciation notes"} /></label></div>
            <label className="field">Link to vocabulary<select value={linkedId} onChange={event => { lookupDraftChanged.current = true; const id = event.target.value; setLinkedId(id); const entry = entries.find(item => item.id === id); if (entry) { setTranslation(entry.translation); setReadingText(entry.reading); } }}><option value="">No linked entry</option>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.word} — {entry.translation}</option>)}</select></label>
            <label className="field">Vocabulary list for a new word<select value={listId} onChange={event => setListId(event.target.value)}><option value="">{lists[0]?.name ?? "Create “Reading words” list"}</option>{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
            <div className="reading-actions"><button className="button" disabled={busy || lookupBusy || staleSelection}>Save annotation</button><button type="button" className="button secondary" disabled={busy || lookupBusy || !translation.trim()} onClick={() => void addVocabulary()}>Add to Vocabulary</button><button type="button" className="button secondary" onClick={resetLookup}>Close</button></div>
          </form>}
        </> : <div className="card empty-state"><h2>A small reading habit</h2><p>Choose a saved reading or add a new passage. Your annotations and vocabulary work together.</p><button className="button" onClick={createReading}>Add your first reading</button></div>}
      </div>
    </div>
  </div>;
}
