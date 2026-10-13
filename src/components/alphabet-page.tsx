"use client";

import { Suspense, useState } from "react";
import type { LanguageCode } from "@/domain/models";
import { alphabetEntries } from "@/data/alphabet";
import { AudioButton } from "./audio-button";
import { AlphabetQuiz } from "./alphabet-quiz";
import "./content.css";

export function AlphabetPage({ language }: { language: LanguageCode }) {
  return <Suspense fallback={<p role="status">Opening your alphabet…</p>}><AlphabetContent key={language} language={language} /></Suspense>;
}

function AlphabetContent({ language }: { language: LanguageCode }) {
  const entries = alphabetEntries.filter((entry) => entry.language === language);
  const groups = [...new Set(entries.map((entry) => entry.group))];
  const [group, setGroup] = useState("");
  const visible = entries.filter((entry) => !group || entry.group === group);
  return <div className="alphabet-page"><div className="page-heading"><div><span className="eyebrow">Build your sound foundation</span><h1>Alphabet</h1><p className="muted">Listen to a letter, then hear it inside a word.</p></div><span className="badge">{entries.length} symbols</span></div><AlphabetQuiz language={language} itemIds={visible.map(entry => entry.id)} selectionLabel={group || "All groups"} groupPicker={<label className="field">Letter group<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">All groups</option>{groups.map((value) => <option key={value}>{value}</option>)}</select></label>}>
    {language === "ko" && <p className="notice">Hangul has 19 initial consonants and 21 vowels, written in syllable blocks. Start with an initial consonant (silent ㅇ for a vowel), add a vowel to its right or below, and put any final consonant (받침) below. Final sounds may change in connected speech. Consonant audio reads the Korean letter name; vowel audio reads a saved Korean example syllable. Romanization is an answer/display aid. <a href="https://www.korean.go.kr/eng_hangeul/principle/001.html" target="_blank" rel="noreferrer">Hangeul reference</a> · <a href="https://www.korean.go.kr/front_eng/roman/roman_01.do" target="_blank" rel="noreferrer">Romanization reference</a></p>}
    {language === "ja" && <p className="notice">Small ゃ・ゅ・ょ combine with an i-row kana into one beat. A small っ・ッ marks a pause before the next consonant. ー lengthens a vowel in katakana. Pronunciation hints are approximate.</p>}
    {language === "es" && <p className="notice">The Spanish alphabet has 27 letters. Ch and ll are letter combinations. Pronunciation varies by region; audio uses your device’s Spanish voice.</p>}
    {language === "el" && <p className="notice">Modern Greek has 24 letters. Use σ within a word and ς at its end. Accents mark stress; η, ι and υ share the modern ee sound.</p>}
    {groups.filter((value) => !group || value === group).map((value) => <section key={value} style={{ marginTop: 24 }}><div className="section-heading"><h2>{value}</h2><span className="muted">{visible.filter((entry) => entry.group === value).length} entries</span></div><div className="alphabet-grid">{visible.filter((entry) => entry.group === value).map((entry) => <article className="card alphabet-card" key={entry.id}><div className="word-with-audio"><strong className="alphabet-symbol" lang={language}>{entry.symbol}</strong><AudioButton text={entry.audioText || entry.symbol} language={language} label={`Play ${entry.audioKind === "example-syllable" ? "example syllable" : "letter name"} ${entry.name}`} /></div><h3>{entry.name}</h3><p className="muted">{entry.pronunciation}</p>{entry.audioKind && <small className="muted">Audio: {entry.audioKind === "letter-name" ? "Korean letter name" : "Korean example syllable"} · {entry.audioText}</small>}{entry.notes && <p className="mini-note">{entry.notes}</p>}<div className="word-with-audio"><span lang={language}>{entry.example}</span><AudioButton text={entry.example} reading={entry.exampleReading} language={language} /></div><small className="muted">{entry.exampleTranslation}</small></article>)}</div></section>)}
  </AlphabetQuiz></div>;
}
