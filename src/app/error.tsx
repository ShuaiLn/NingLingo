"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="standalone"><h1>Something interrupted this page.</h1><p>Your saved local data is still available. Try loading the page again.</p><button className="button" onClick={reset}>Try again</button></main>; }
