"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { RELATION_TYPES, type LanguageCode, type RelatedWord, type RelationType, type VocabularyEntry, type VocabularyExample, type VocabularyInput } from "@/domain/models";
import { kanaDisplay } from "@/domain/languages";
import { classifyCsvRows, exportCsv, previewCsv, vocabularyCsvTemplate } from "@/domain/csv";
import type { CsvPreview } from "@/domain/csv";
import { applyCsvTranslations, editCsvTranslation, normalizedCsvWord, unresolvedCsvQueries } from "@/domain/csv-preview";
import { normalizeVocabularyDetails, vocabularyExamples } from "@/domain/vocabulary";
import { useAppData } from "./app-provider";
import { AudioButton } from "./audio-button";
import { WordText } from "./word-text";
import "./content.css";

type WordForm = Omit<VocabularyInput, "acceptedAnswers" | "language" | "examples" | "relatedWords"> & { answersText: string; examples: VocabularyExample[]; relatedWords: RelatedWord[] };
function blankForm(): WordForm { return { listId: "", word: "", reading: "", translation: "", type: "", category: "", example: "", examples: [], relatedWords: [], notes: "", answersText: "" }; }
const relationLabel = (type: RelationType) => type.replaceAll("_", " ");
function downloadCsv(entries: VocabularyEntry[], language: LanguageCode) {
  const url = URL.createObjectURL(new Blob([exportCsv(entries)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ninglingo-${language}-vocabulary.csv`; anchor.click(); URL.revokeObjectURL(url);
}
function downloadCsvTemplate() {
  const url = URL.createObjectURL(new Blob([vocabularyCsvTemplate()], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "ninglingo-vocabulary-template.csv"; anchor.click(); URL.revokeObjectURL(url);
}

export function VocabularyPage({ language }: { language: LanguageCode }) {
  const { repos, entries, lists, ready, error } = useAppData(language);
  const [query, setQuery] = useState(""), [category, setCategory] = useState(""), [listId, setListId] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [mode, setMode] = useState<"hiragana" | "katakana">("katakana");
  const [form, setForm] = useState<WordForm | null>(null), [editingId, setEditingId] = useState<string | undefined>();
  const [firstListName, setFirstListName] = useState("My vocabulary");
  const [listName, setListName] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [previewState, setPreview] = useState<CsvPreview | null>(null), [importList, setImportList] = useState("");
  const previewGeneration = useRef(0);
  const preview = previewState?.language === language ? classifyCsvRows(previewState.rows, entries, language, previewState.headerErrors, previewState.generation) : null;
  useEffect(() => () => { previewGeneration.current++; }, [language]);
  const fileInput = useRef<HTMLInputElement>(null);
  const categories = [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort();
  const searchValue = (value: string) => (language === "ja" ? kanaDisplay(value.normalize("NFC"), "hiragana") : value.normalize("NFC")).toLocaleLowerCase();
  const normalizedQuery = searchValue(query);
  const visible = entries.filter((entry) => (!listId || entry.listId === listId) && (!category || entry.category === category) && [entry.word, entry.reading, entry.translation, entry.notes, entry.category, entry.type, ...vocabularyExamples(entry).flatMap(example => [example.text, example.reading, example.translation]), ...(entry.relatedWords ?? []).flatMap(related => [related.word, related.reading, related.translation])].some((value) => searchValue(value).includes(normalizedQuery)));
  const selectedEntries = entries.filter((entry) => selected.includes(entry.id));
  const currentList = lists.find((list) => list.id === listId);
  const defaultList = listId || lists[0]?.id || "";

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (failure: unknown) { setMessage(failure instanceof Error ? failure.message : "Could not save your changes."); }
    finally { setBusy(false); }
  }
  function edit(entry: VocabularyEntry) {
    setEditingId(entry.id); setForm({ listId: entry.listId, word: entry.word, reading: entry.reading, translation: entry.translation, type: entry.type, category: entry.category, example: entry.example, examples: vocabularyExamples(entry), relatedWords: structuredClone(entry.relatedWords ?? []), notes: entry.notes, answersText: entry.acceptedAnswers.map((answer) => answer.text).join("\n") });
  }
  async function saveWord(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    const { answersText, ...values } = form;
    await run(async () => {
      const details = normalizeVocabularyDetails(values);
      const answers = [...new Set(answersText.split(/\r?\n/).map((text) => text.trim()).filter(Boolean))];
      const existing = entries.find((entry) => entry.id === editingId);
      let targetList = values.listId || defaultList;
      if (!targetList) {
        const list = await repos.vocabulary.createList(language, firstListName.trim());
        targetList = list.id;
        setListId(list.id);
        setForm(current => current ? { ...current, listId: list.id } : null);
      }
      await repos.vocabulary.saveEntry({ ...values, ...details, listId: targetList, language, acceptedAnswers: answers.map((text) => ({ id: existing?.acceptedAnswers.find((answer) => answer.text === text)?.id ?? crypto.randomUUID(), text })) }, editingId);
      setForm(null); setEditingId(undefined); setMessage(editingId ? "Word updated." : "Word added.");
    });
  }
  async function readCsv(file: File) {
    const generation = ++previewGeneration.current;
    setPreview(null);
    await run(async () => {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const targetList = importList || defaultList;
      if (!targetList) throw new Error("Create a vocabulary list before importing.");
      if (generation !== previewGeneration.current) return;
      const next = { ...previewCsv(source, entries, language, targetList), generation };
      setImportList(targetList); setPreview(next);
      void resolveMissingTranslations(next);
    });
  }
  async function resolveMissingTranslations(current: CsvPreview) {
    const generation = current.generation;
    const queries = unresolvedCsvQueries(current);
    if (!queries.length || current.headerErrors.length) return;
    const words = new Set(queries.map(row => row.word));
    const editRevisions = new Map(current.unresolved.map(row => [row.line, row.editRevision]));
    setPreview(latest => latest?.generation === generation ? classifyCsvRows(latest.rows.map(row => !row.errors.length && !row.input.translation.trim() && words.has(normalizedCsvWord(row.input.word)) ? { ...row, resolving: true, translationError: "" } : row), entries, language, latest.headerErrors, generation) : latest);
    for (let start = 0; start < queries.length; start += 25) {
      if (generation !== previewGeneration.current) return;
      const batch = queries.slice(start, start + 25);
      try {
        const results = await repos.vocabulary.resolveTranslations({ language, rows: batch });
        if (generation !== previewGeneration.current) return;
        setPreview(latest => latest ? applyCsvTranslations(latest, results, generation, editRevisions, entries) : latest);
      } catch (failure: unknown) {
        const reason = failure instanceof Error ? failure.message : "Translation failed. Enter an English meaning manually or retry.";
        const results = batch.map(row => ({ ...row, translation: "", source: null, error: reason }));
        if (generation !== previewGeneration.current) return;
        setPreview(latest => latest ? applyCsvTranslations(latest, results, generation, editRevisions, entries) : latest);
      }
    }
  }
  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);

  return <div className="vocabulary-page">
    <div className="page-heading"><div><span className="eyebrow">Your personal word collection</span><h1>Vocabulary</h1><p className="muted">Keep useful words, their meanings, and the answers you want to practice.</p></div><button className="button" disabled={!ready || busy} onClick={() => { setEditingId(undefined); setFirstListName("My vocabulary"); setForm({ ...blankForm(), listId: defaultList }); }}>+ Add word</button></div>
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
        <label className="field">{language === "ja" ? "Reading (existing kana only)" : "Reading / pronunciation"}<input aria-label={language === "ja" ? "Reading (existing kana only)" : "Reading / pronunciation"} aria-describedby="vocabulary-reading-help" value={form.reading} onChange={(event) => setForm({ ...form, reading: event.target.value })} /><span id="vocabulary-reading-help" className="muted">Readings are saved as entered; no pronunciation is inferred.</span></label>{lists.length ? <label className="field">List<select required value={form.listId || defaultList} onChange={(event) => setForm({ ...form, listId: event.target.value })}>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label> : <label className="field">First list name<input required maxLength={200} value={firstListName} onChange={event => setFirstListName(event.target.value)} /><span className="muted">Your first list will be created when you save this word.</span></label>}
        <label className="field">Part of speech<input value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="noun, verb, adjective…" /></label><label className="field">Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} list="vocabulary-categories" /><datalist id="vocabulary-categories">{categories.map((value) => <option value={value} key={value} />)}</datalist></label>
      </div>
      <div className="section-heading"><h3>Example sentences</h3><button type="button" className="button secondary" onClick={() => setForm({ ...form, examples: [...form.examples, { id: crypto.randomUUID(), text: "", reading: "", translation: "" }] })}>Add example</button></div>
      <p className="muted">Add English translations and optional pronunciation. The first sentence remains the backward-compatible CSV example.</p>
      {form.examples.map((example, index) => <fieldset key={example.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 16, margin: "14px 0", minWidth: 0 }}><legend>Example {index + 1}</legend>
        <label className="field">Sentence {index + 1}<textarea lang={language} required value={example.text} rows={2} onChange={event => setForm({ ...form, examples: form.examples.map((row, rowIndex) => rowIndex === index ? { ...row, text: event.target.value } : row) })} /></label>
        <div className="grid-2"><label className="field">Example {index + 1} English translation<input value={example.translation} placeholder="Add the English translation" onChange={event => setForm({ ...form, examples: form.examples.map((row, rowIndex) => rowIndex === index ? { ...row, translation: event.target.value } : row) })} /></label>
          <label className="field">Example {index + 1} reading / pronunciation<input value={example.reading} onChange={event => setForm({ ...form, examples: form.examples.map((row, rowIndex) => rowIndex === index ? { ...row, reading: event.target.value } : row) })} /></label></div>
        {!example.translation.trim() && <p className="muted">English translation not added. Imported CSV sentences may need a manual translation.</p>}
        <button type="button" className="button secondary" onClick={() => setForm({ ...form, examples: form.examples.filter((_, rowIndex) => rowIndex !== index) })}>Remove example {index + 1}</button>
      </fieldset>)}
      <div className="section-heading"><h3>Related / derived words</h3><button type="button" className="button secondary" onClick={() => setForm({ ...form, relatedWords: [...form.relatedWords, { id: crypto.randomUUID(), word: "", reading: "", translation: "", relationType: "related" }] })}>Add related word</button></div>
      <p className="muted">Save explicit forms or relationships from your sources. Forms and readings are never generated automatically.</p>
      {form.relatedWords.map((related, index) => <fieldset key={related.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 16, margin: "14px 0", minWidth: 0 }}><legend>Related word {index + 1}</legend><div className="grid-2">
        <label className="field">Related word {index + 1}<input lang={language} required value={related.word} onChange={event => setForm({ ...form, relatedWords: form.relatedWords.map((row, rowIndex) => rowIndex === index ? { ...row, word: event.target.value } : row) })} /></label>
        <label className="field">Related word {index + 1} relation<select value={related.relationType} onChange={event => setForm({ ...form, relatedWords: form.relatedWords.map((row, rowIndex) => rowIndex === index ? { ...row, relationType: event.target.value as RelationType } : row) })}>{RELATION_TYPES.map(type => <option key={type} value={type}>{relationLabel(type)}</option>)}</select></label>
        <label className="field">Related word {index + 1} English translation<input value={related.translation} onChange={event => setForm({ ...form, relatedWords: form.relatedWords.map((row, rowIndex) => rowIndex === index ? { ...row, translation: event.target.value } : row) })} /></label>
        <label className="field">Related word {index + 1} reading / pronunciation<input value={related.reading} onChange={event => setForm({ ...form, relatedWords: form.relatedWords.map((row, rowIndex) => rowIndex === index ? { ...row, reading: event.target.value } : row) })} /></label>
      </div><button type="button" className="button secondary" onClick={() => setForm({ ...form, relatedWords: form.relatedWords.filter((_, rowIndex) => rowIndex !== index) })}>Remove related word {index + 1}</button></fieldset>)}
      <label className="field">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} /></label><label className="field">Additional accepted English answers<textarea value={form.answersText} onChange={(event) => setForm({ ...form, answersText: event.target.value })} rows={3} placeholder={"One answer per line\ne.g. large"} /><span className="muted">The main English meaning is always accepted. Only these explicit additional answers count as synonyms.</span></label><button className="button" disabled={busy || !form.word.trim() || !form.translation.trim() || (!lists.length && !firstListName.trim())}>Save word</button>
    </form></section>}
    <section className="card">
      <div className="toolbar"><label className="field" style={{ flex: 1 }}>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search words, readings, meanings…" /></label><label className="field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>{language === "ja" && <label className="field">Kana display<select value={mode} onChange={(event) => setMode(event.target.value as "hiragana" | "katakana")}><option value="katakana">Katakana</option><option value="hiragana">Hiragana</option></select></label>}</div>
      <div className="toolbar"><span className="muted">{visible.length} shown · {selectedEntries.length} selected</span><button className="button secondary" disabled={!visible.length} onClick={() => setSelected(visible.every((entry) => selected.includes(entry.id)) ? selected.filter((id) => !visible.some((entry) => entry.id === id)) : [...new Set([...selected, ...visible.map((entry) => entry.id)])])}>{visible.length > 0 && visible.every((entry) => selected.includes(entry.id)) ? "Deselect shown" : "Select shown"}</button><button className="button secondary" disabled={!selectedEntries.length && !visible.length} onClick={() => downloadCsv(selectedEntries.length ? selectedEntries : visible, language)}>Export {selectedEntries.length ? "selected" : "shown"} CSV</button><button className="button secondary" onClick={downloadCsvTemplate}>Download CSV template</button><button className="button secondary" disabled={!lists.length || busy} onClick={() => fileInput.current?.click()}>Import CSV</button><input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload UTF-8 CSV" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readCsv(file); event.target.value = ""; }} />
        {selectedEntries.length > 0 && <><Link className="button" href={`/${language}/quiz?words=${selectedEntries.map((entry) => encodeURIComponent(entry.id)).join(",")}`}>Quiz selected</Link><button className="button secondary" disabled={busy} onClick={() => { if (window.confirm(`Delete ${selectedEntries.length} selected words?`)) void run(async () => { await repos.vocabulary.deleteEntries(selectedEntries.map((entry) => entry.id)); setSelected([]); setMessage("Words deleted."); }); }}>Delete selected</button></>}
      </div>
      {!ready ? <p role="status">Loading your vocabulary…</p> : !visible.length ? <div className="empty-state"><h3>{entries.length ? "No matching words" : "Your collection starts here"}</h3><p>{lists.length ? "Add a word or import a UTF-8 CSV file to get started." : "Add your first word to create a list, or create a list above before importing a UTF-8 CSV file."}</p></div> : <div className="table-scroll"><table className="vocabulary-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Word / pronunciation</th><th>English meaning</th><th>Category / list</th><th>Examples / related words / notes</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id}>
        <td><input aria-label={`Select ${entry.word}`} type="checkbox" checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} /></td>
        <td><div className="word-with-audio"><strong className="vocabulary-word"><WordText entry={entry} mode={mode} /></strong><AudioButton text={entry.word} reading={entry.reading} language={language} /></div>
          <small className="muted" style={{ display: "block" }}>{language === "ja" ? "Reading" : "Pronunciation"}: {entry.reading ? (language === "ja" ? kanaDisplay(entry.reading, mode) : entry.reading) : "Not added"}</small><span className="muted">{entry.type || "Part of speech not added"}</span></td>
        <td>{entry.translation}{entry.acceptedAnswers.length > 0 && <small className="muted" style={{ display: "block" }}>Also: {entry.acceptedAnswers.map((answer) => answer.text).join(", ")}</small>}</td>
        <td>{entry.category && <span className="badge">{entry.category}</span>}<small className="muted" style={{ display: "block" }}>{lists.find((list) => list.id === entry.listId)?.name}</small></td>
        <td>{vocabularyExamples(entry).map((example, index) => <div key={example.id} className="vocabulary-example" style={{ marginBottom: 12 }}>
          <div className="word-with-audio"><WordText entry={{ word: example.text, reading: example.reading, language }} mode={mode} /><AudioButton text={example.text} reading={example.reading} language={language} label={`Play example ${index + 1} of ${entry.word}`} /></div>
          <small className="muted" style={{ display: "block" }}>{example.translation || "English translation not added"}</small>
          {language !== "ja" && example.reading && <small className="muted" style={{ display: "block" }}>Pronunciation: {example.reading}</small>}
        </div>)}
          {(entry.relatedWords?.length ?? 0) > 0 && <details><summary className="muted">Related words ({entry.relatedWords!.length})</summary>{entry.relatedWords!.map(related => <div key={related.id} style={{ margin: "8px 0" }}><span className="badge">{relationLabel(related.relationType)}</span><div className="word-with-audio"><WordText entry={{ word: related.word, reading: related.reading, language }} mode={mode} /><AudioButton text={related.word} reading={related.reading} language={language} /></div>{related.translation && <small className="muted" style={{ display: "block" }}>{related.translation}</small>}{language !== "ja" && related.reading && <small className="muted" style={{ display: "block" }}>Pronunciation: {related.reading}</small>}</div>)}</details>}
          {entry.notes && <details><summary className="muted">Notes</summary><p>{entry.notes}</p></details>}</td>
        <td><button className="button secondary" onClick={() => edit(entry)}>Edit</button></td>
      </tr>)}</tbody></table></div>}
    </section>
    {preview && <section className="card" style={{ marginTop: 20 }} aria-label="CSV import preview"><div className="section-heading"><h2>CSV import preview</h2><button className="button secondary" disabled={busy} onClick={() => { previewGeneration.current++; setPreview(null); }}>Close preview</button></div>
      <p className="muted">Required: word. Missing English translations are looked up automatically. Optional: translation, reading, type, category, example, notes. Edit any English meaning before importing; exact word + reading + meaning duplicates are skipped.</p>
      <label className="field">Import into<select disabled={busy} value={importList} onChange={(event) => setImportList(event.target.value)}>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
      <div className="toolbar"><span className="badge">{preview.valid.length} valid</span><span className="badge">{preview.duplicates.length} duplicates</span><span className="badge">{preview.unresolved.length} unresolved</span><span className="badge">{preview.invalid.length} invalid</span><button className="button secondary" disabled={busy || !preview.unresolved.some(row => !row.resolving) || preview.headerErrors.length > 0} onClick={() => void resolveMissingTranslations(preview)}>Retry missing translations</button></div>
      {preview.headerErrors.map(reason => <p key={reason} className="notice">{reason}</p>)}
      <div className="table-scroll"><table><thead><tr><th>Line</th><th>Word</th><th>English meaning</th><th>Status / reason</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.line}><td>{row.line}</td><td>{row.input.word}</td><td><label className="field"><span className="sr-only">English meaning for CSV line {row.line}</span><input disabled={busy} value={row.input.translation} onChange={event => { const translation = event.target.value; setPreview(latest => latest ? editCsvTranslation(latest, row.line, translation, entries) : latest); }} /></label>{row.translationSource && <small className="muted">{row.translationSource === "csv" ? "Provided in CSV" : row.translationSource === "manual" ? "Edited manually" : row.translationSource === "cache" ? "Machine translation (cached)" : "Machine translation (" + row.translationSource + ")"}</small>}</td><td>{row.errors.length ? row.errors.join(" ") : row.resolving ? "Translating..." : row.translationError || (preview.unresolved.includes(row) ? "English meaning required. Enter one manually or retry." : preview.duplicates.includes(row) ? "Duplicate: skipped" : "Valid")}</td></tr>)}</tbody></table></div>
      <button className="button" style={{ marginTop: 16 }} disabled={busy || !preview.valid.length || preview.headerErrors.length > 0 || !importList} onClick={() => void run(async () => {
        const confirmed = classifyCsvRows(preview.rows, entries, language, preview.headerErrors, preview.generation);
        const result = await repos.vocabulary.importEntries(confirmed.valid.map(row => ({ ...row.input, translation: row.input.translation.trim(), listId: importList })));
        const processedLines = new Set([...confirmed.valid, ...confirmed.duplicates].map(row => row.line));
        // Only a successful atomic import removes resolved rows; failures retain the entire preview.
        setPreview(latest => {
          if (!latest || latest.generation !== confirmed.generation) return latest;
          const remaining = latest.rows.filter(row => !processedLines.has(row.line));
          return remaining.length ? classifyCsvRows(remaining, entries, language, latest.headerErrors, latest.generation) : null;
        });
        setMessage("Imported " + result.imported + " words. " + result.duplicates + " additional duplicates skipped. Unresolved rows remain in the preview.");
      })}>Confirm import of {preview.valid.length} valid rows</button>
    </section>}
  </div>;
}
