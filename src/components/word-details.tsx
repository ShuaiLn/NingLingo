"use client";

import type { VocabularyEntry, WordCareState, WordProgress } from "@/domain/models";
import { vocabularyExamples } from "@/domain/vocabulary";
import { AudioButton } from "./audio-button";
import { WordCare } from "./word-care";
import { WordText } from "./word-text";
import "./word-details.css";

export function WordDetails({ entry, progress, care, deleted = false }: { entry: VocabularyEntry; progress?: WordProgress; care?: WordCareState; deleted?: boolean }) {
  const examples = vocabularyExamples(entry);
  return <div className="word-details" aria-label={`Full details for ${entry.word}`}>
    <div className="word-with-audio"><h3><WordText entry={entry} /></h3><AudioButton text={entry.word} language={entry.language} /></div>
    {deleted && <p className="notice">Historical word snapshot · this word has been deleted.</p>}
    <dl className="word-detail-fields">
      {entry.translation && <><dt>English meaning</dt><dd>{entry.translation}</dd></>}
      {entry.acceptedAnswers.length > 0 && <><dt>Accepted answers</dt><dd>{entry.acceptedAnswers.map(answer => answer.text).join(" · ")}</dd></>}
      {entry.reading && <><dt>Reading / pronunciation</dt><dd>{entry.reading}</dd></>}
      {entry.type && <><dt>Part of speech</dt><dd>{entry.type}</dd></>}
      {entry.category && <><dt>Category</dt><dd>{entry.category}</dd></>}
      {entry.notes && <><dt>Notes</dt><dd className="word-detail-notes">{entry.notes}</dd></>}
    </dl>
    {examples.length > 0 && <section aria-label="All example sentences"><h4>Examples</h4>{examples.map((example, index) => <div key={example.id} className="word-detail-example"><div className="word-with-audio"><WordText entry={{ word: example.text, reading: example.reading, language: entry.language }} /><AudioButton text={example.text} language={entry.language} label={`Play example ${index + 1} of ${entry.word}`} /></div>{example.translation && <p>{example.translation}</p>}{example.reading && <small className="muted">{example.reading}</small>}</div>)}</section>}
    {(entry.relatedWords?.length ?? 0) > 0 && <section aria-label="All related words"><h4>Related words</h4>{entry.relatedWords!.map(related => <div key={related.id} className="word-detail-example"><span className="badge">{related.relationType.replaceAll("_", " ")}</span><div className="word-with-audio"><WordText entry={{ word: related.word, reading: related.reading, language: entry.language }} /><AudioButton text={related.word} language={entry.language} /></div>{related.translation && <p>{related.translation}</p>}{related.reading && <small className="muted">{related.reading}</small>}</div>)}</section>}
    <WordCare key={entry.id} wordId={entry.id} progress={progress} state={care} deleted={deleted} />
  </div>;
}
