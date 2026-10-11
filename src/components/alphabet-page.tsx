"use client";

import { useState } from "react";
import type { LanguageCode } from "@/domain/models";
import { alphabetEntries } from "@/data/alphabet";
import { AudioButton } from "./audio-button";
import "./content.css";

export function AlphabetPage({ language }: { language: LanguageCode }) {
  const entries = alphabetEntries.filter((entry) => entry.language === language);
  const groups = [...new Set(entries.map((entry) => entry.group))];
  const [group, setGroup] = useState("");
  const visible = entries.filter((entry) => !group || entry.group === group);
  return <div className="alphabet-page"><div className="page-heading"><div><span className="eyebrow">Build your sound foundation</span><h1>Alphabet</h1><p className="muted">Listen to a letter, then hear it inside a word.</p></div><span className="badge">{entries.length} symbols</span></div><div className="toolbar"><label className="field">Letter group<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">All groups</option>{groups.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    {language === "ja" && <p className="notice">Small ゃ・ゅ・ょ combine with an i-row kana into one beat. A small っ・ッ marks a pause before the next consonant. ー lengthens a vowel in katakana. Pronunciation hints are approximate.</p>}
    {language === "es" && <p className="notice">The Spanish alphabet has 27 letters. Ch and ll are letter combinations. Pronunciation varies by region; audio uses your device’s Spanish voice.</p>}
    {language === "el" && <p className="notice">Modern Greek has 24 letters. Use σ within a word and ς at its end. Accents mark stress; η, ι and υ share the modern ee sound.</p>}
    {groups.filter((value) => !group || value === group).map((value) => <section key={value} style={{ marginTop: 24 }}><div className="section-heading"><h2>{value}</h2><span className="muted">{visible.filter((entry) => entry.group === value).length} entries</span></div><div className="alphabet-grid">{visible.filter((entry) => entry.group === value).map((entry) => <article className="card alphabet-card" key={entry.id}><div className="word-with-audio"><strong className="alphabet-symbol" lang={language}>{entry.symbol}</strong><AudioButton text={entry.audioText || entry.symbol} language={language} label={`Play letter name ${entry.name}`} /></div><h3>{entry.name}</h3><p className="muted">{entry.pronunciation}</p><div className="word-with-audio"><span lang={language}>{entry.example}</span><AudioButton text={entry.example} reading={entry.exampleReading} language={language} /></div><small className="muted">{entry.exampleTranslation}</small></article>)}</div></section>)}
  </div>;
}
