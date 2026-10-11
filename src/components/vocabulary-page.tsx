"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { LanguageCode, VocabularyEntry, VocabularyInput } from "@/domain/models";
import { kanaDisplay } from "@/domain/languages";
import { exportCsv, previewCsv } from "@/domain/csv";
import type { CsvPreview } from "@/domain/csv";
import { useAppData } from "./app-provider";
import { AudioButton } from "./audio-button";
import { WordText } from "./word-text";
import "./content.css";

type WordForm = Omit<VocabularyInput, "acceptedAnswers" | "language"> & { answersText: string };
function blankForm(): WordForm { return { listId: "", word: "", reading: "", translation: "", type: "", category: "", example: "", notes: "", answersText: "" }; }
function downloadCsv(entries: VocabularyEntry[], language: LanguageCode) {
  const url = URL.createObjectURL(new Blob([exportCsv(entries)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ninglingo-${language}-vocabulary.csv`; anchor.click(); URL.revokeObjectURL(url);
}

export function VocabularyPage({ language }: { language: LanguageCode }) {
  const { repos, entries, lists, ready, error } = useAppData(language);
  const [query, setQuery] = useState(""), [category, setCategory] = useState(""), [listId, setListId] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [mode, setMode] = useState<"hiragana" | "katakana">("katakana");
  const [form, setForm] = useState<WordForm | null>(null), [editingId, setEditingId] = useState<string | undefined>();
  const [listName, setListName] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CsvPreview | null>(null), [importList, setImportList] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const categories = [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort();
  const searchValue = (value: string) => (language === "ja" ? kanaDisplay(value.normalize("NFC"), "hiragana") : value.normalize("NFC")).toLocaleLowerCase();
  const normalizedQuery = searchValue(query);
  const visible = entries.filter((entry) => (!listId || entry.listId === listId) && (!category || entry.category === category) && [entry.word, entry.reading, entry.translation, entry.notes, entry.category].some((value) => searchValue(value).includes(normalizedQuery)));
  const selectedEntries = entries.filter((entry) => selected.includes(entry.id));
  const currentList = lists.find((list) => list.id === listId);
  const defaultList = listId || lists[0]?.id || "";

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (failure: unknown) { setMessage(failure instanceof Error ? failure.message : "Could not save your changes."); }
    finally { setBusy(false); }
  }
  function edit(entry: VocabularyEntry) {
    setEditingId(entry.id); setForm({ listId: entry.listId, word: entry.word, reading: entry.reading, translation: entry.translation, type: entry.type, category: entry.category, example: entry.example, notes: entry.notes, answersText: entry.acceptedAnswers.map((answer) => answer.text).join("\n") });
  }
  async function saveWord(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    const { answersText, ...values } = form;
    await run(async () => {
      const answers = [...new Set(answersText.split(/\r?\n/).map((text) => text.trim()).filter(Boolean))];
      const existing = entries.find((entry) => entry.id === editingId);
      await repos.vocabulary.saveEntry({ ...values, listId: values.listId || defaultList, language, acceptedAnswers: answers.map((text) => ({ id: existing?.acceptedAnswers.find((answer) => answer.text === text)?.id ?? crypto.randomUUID(), text })) }, editingId);
      setForm(null); setEditingId(undefined); setMessage(editingId ? "Word updated." : "Word added.");
    });
  }
  async function readCsv(file: File) {
    await run(async () => {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const targetList = importList || defaultList;
      if (!targetList) throw new Error("Create a vocabulary list before importing.");
      setImportList(targetList); setPreview(previewCsv(source, entries, language, targetList));
    });
  }
  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);

  return <div className="vocabulary-page">
    <div className="page-heading"><div><span className="eyebrow">Your personal word collection</span><h1>Vocabulary</h1><p className="muted">Keep useful words, their meanings, and the answers you want to practice.</p></div><button className="button" disabled={!ready || !lists.length || busy} onClick={() => { setEditingId(undefined); setForm({ ...blankForm(), listId: defaultList }); }}>+ Add word</button></div>
    {(message || error) && <p className="notice" role="status">{message || error}</p>}
    <section className="card" style={{ marginBottom: 20 }} aria-label="Vocabulary lists">
      <div className="section-heading"><h2>Your lists</h2><span className="muted">{entries.length} words · {lists.length} lists</span></div>
      <div className="toolbar"><label className="field">List<select value={listId} onChange={(event) => { setListId(event.target.value); setSelected([]); }}><option value="">All lists</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { const list = await repos.vocabulary.createList(language, listName.trim()); setListId(list.id); setListName(""); setMessage("List created."); }); }}><label className="field">New list<input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="e.g. Travel phrases" required /></label><button className="button secondary" disabled={busy || !listName.trim()}>Create list</button></form>
        {currentList && <><button className="button secondary" disabled={busy} onClick={() => { const name = window.prompt("Rename this list", currentList.name); if (name?.trim()) void run(async () => { await repos.vocabulary.renameList(currentList.id, name.trim()); setMessage("List renamed."); }); }}>Rename</button><button className="button secondary" disabled={busy} onClick={() => { if (window.confirm(`Delete “${currentList.name}” and all words in it? This cannot be undone.`)) void run(async () => { await repos.vocabulary.deleteList(currentList.id); setListId(""); setSelected([]); setMessage("List deleted."); }); }}>Delete list</button></>}
      </div>
    </section>
    {form && <section className="card" style={{ marginBottom: 20 }}><div className="section-heading"><h2>{editingId ? "Edit word" : "Add a word"}</h2><button className="button secondary" onClick={() => setForm(null)}>Cancel</button></div><form onSubmit={(event) => void saveWord(event)}>
      <div className="grid-2"><label className="field">Word *<input lang={language} required value={form.word} onChange={(event) => setForm({ ...form, word: event.target.value })} /></label><label className="field">English meaning *<input required value={form.translation} onChange={(event) => setForm({ ...form, translation: event.target.value })} /></label>
        <label className="field">Reading{language === "ja" && " (existing kana only)"}<input value={form.reading} onChange={(event) => setForm({ ...form, reading: event.target.value })} /><span className="muted">Readings are saved as entered; kanji readings are never inferred.</span></label><label className="field">List<select required value={form.listId || defaultList} onChange={(event) => setForm({ ...form, listId: event.target.value })}>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label>
        <label className="field">Part of speech<input value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="noun, verb, adjective…" /></label><label className="field">Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} list="vocabulary-categories" /><datalist id="vocabulary-categories">{categories.map((value) => <option value={value} key={value} />)}</datalist></label>
      </div><label className="field">Example<textarea value={form.example} onChange={(event) => setForm({ ...form, example: event.target.value })} rows={2} /></label><label className="field">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} /></label><label className="field">Additional accepted English answers<textarea value={form.answersText} onChange={(event) => setForm({ ...form, answersText: event.target.value })} rows={3} placeholder={"One answer per line\ne.g. large"} /><span className="muted">The main English meaning is always accepted. Only these explicit additional answers count as synonyms.</span></label><button className="button" disabled={busy || !form.word.trim() || !form.translation.trim()}>Save word</button>
    </form></section>}
    <section className="card">
      <div className="toolbar"><label className="field" style={{ flex: 1 }}>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search words, readings, meanings…" /></label><label className="field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>{language === "ja" && <label className="field">Kana display<select value={mode} onChange={(event) => setMode(event.target.value as "hiragana" | "katakana")}><option value="katakana">Katakana</option><option value="hiragana">Hiragana</option></select></label>}</div>
      <div className="toolbar"><span className="muted">{visible.length} shown · {selectedEntries.length} selected</span><button className="button secondary" disabled={!visible.length} onClick={() => setSelected(visible.every((entry) => selected.includes(entry.id)) ? selected.filter((id) => !visible.some((entry) => entry.id === id)) : [...new Set([...selected, ...visible.map((entry) => entry.id)])])}>{visible.length > 0 && visible.every((entry) => selected.includes(entry.id)) ? "Deselect shown" : "Select shown"}</button><button className="button secondary" disabled={!selectedEntries.length && !visible.length} onClick={() => downloadCsv(selectedEntries.length ? selectedEntries : visible, language)}>Export {selectedEntries.length ? "selected" : "shown"} CSV</button><button className="button secondary" disabled={!lists.length || busy} onClick={() => fileInput.current?.click()}>Import CSV</button><input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload UTF-8 CSV" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readCsv(file); event.target.value = ""; }} />
        {selectedEntries.length > 0 && <><Link className="button" href={`/${language}/quiz?words=${selectedEntries.map((entry) => encodeURIComponent(entry.id)).join(",")}`}>Quiz selected</Link><button className="button secondary" disabled={busy} onClick={() => { if (window.confirm(`Delete ${selectedEntries.length} selected words?`)) void run(async () => { await repos.vocabulary.deleteEntries(selectedEntries.map((entry) => entry.id)); setSelected([]); setMessage("Words deleted."); }); }}>Delete selected</button></>}
      </div>
      {!ready ? <p role="status">Loading your vocabulary…</p> : !visible.length ? <div className="empty-state"><h3>{entries.length ? "No matching words" : "Your collection starts here"}</h3><p>Add a word or import a UTF-8 CSV file to get started.</p></div> : <div className="table-scroll"><table className="vocabulary-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Word</th><th>Meaning</th><th>Category / list</th><th>Example</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id}><td><input aria-label={`Select ${entry.word}`} type="checkbox" checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} /></td><td><div className="word-with-audio"><strong className="vocabulary-word"><WordText entry={entry} mode={mode} /></strong><AudioButton text={entry.word} reading={entry.reading} language={language} /></div><span className="muted">{entry.type}</span></td><td>{entry.translation}{entry.acceptedAnswers.length > 0 && <small className="muted" style={{ display: "block" }}>Also: {entry.acceptedAnswers.map((answer) => answer.text).join(", ")}</small>}</td><td>{entry.category && <span className="badge">{entry.category}</span>}<small className="muted" style={{ display: "block" }}>{lists.find((list) => list.id === entry.listId)?.name}</small></td><td><span lang={language}>{entry.example}</span>{entry.notes && <details><summary className="muted">Notes</summary>{entry.notes}</details>}</td><td><button className="button secondary" onClick={() => edit(entry)}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>
    {preview && <section className="card" style={{ marginTop: 20 }}><div className="section-heading"><h2>CSV import preview</h2><button className="button secondary" onClick={() => setPreview(null)}>Close preview</button></div><p className="muted">Required: word, translation. Optional: reading, type, category, example, notes. Exact word + reading + meaning duplicates are skipped.</p><label className="field">Import into<select value={importList} onChange={(event) => setImportList(event.target.value)}>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><div className="toolbar"><span className="badge">{preview.valid.length} valid</span><span className="badge">{preview.duplicates.length} duplicates</span><span className="badge">{preview.invalid.length} invalid</span></div>{preview.headerErrors.map((reason) => <p key={reason} className="notice">{reason}</p>)}<div className="table-scroll"><table><thead><tr><th>Line</th><th>Word</th><th>Meaning</th><th>Status / reason</th></tr></thead><tbody>{[...preview.valid.map((row) => ({ ...row, status: "Valid" })), ...preview.duplicates.map((row) => ({ ...row, status: "Duplicate — skipped" })), ...preview.invalid.map((row) => ({ ...row, status: "Invalid" }))].sort((a, b) => a.line - b.line).map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.input.word}</td><td>{row.input.translation}</td><td>{row.errors.length ? row.errors.join(" ") : row.status}</td></tr>)}</tbody></table></div><button className="button" style={{ marginTop: 16 }} disabled={busy || !preview.valid.length || preview.headerErrors.length > 0 || !importList} onClick={() => void run(async () => { const result = await repos.vocabulary.importEntries(preview.valid.map((row) => ({ ...row.input, listId: importList }))); setPreview(null); setMessage(`Imported ${result.imported} words. ${result.duplicates} additional duplicates skipped.`); })}>Confirm import of {preview.valid.length} valid rows</button></section>}
  </div>;
}
