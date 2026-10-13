import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

/** Browser flows against the production Next server and disposable cloud users. */
export async function verifyExtensionBrowser({ a, b, browser, base, check, lesson }) {
  const contexts = [];
  const context = async () => {
    const result = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    result.setDefaultTimeout(30_000);
    contexts.push(result);
    return result;
  };
  const api = async (client, operation, args = {}, status = 200) => {
    const response = await client.request.post(`${base}/api/repository`, { headers: { Origin: base }, data: { operation, args } });
    check(response.status() === status, `Production browser API ${operation} returned an unexpected status.`);
    const result = await response.json();
    return status === 200 ? result.data : result;
  };
  const login = async (client, account) => {
    const page = await client.newPage();
    await page.goto(`${base}/ko/quiz`);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    return page;
  };
  const responseTo = (page, operation) => page.waitForResponse(response => {
    if (!response.url().endsWith('/api/repository') || response.request().method() !== 'POST') return false;
    try { return response.request().postDataJSON()?.operation === operation; } catch { return false; }
  });
  const perform = async (page, operation, action) => {
    const pending = responseTo(page, operation);
    await action();
    const response = await pending;
    check(response.status() === 200, `Production UI ${operation} did not persist successfully.`);
    return (await response.json()).data;
  };
  const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  try {
    const first = await context(), second = await context(), foreign = await context();
    const page = await login(first, a), device = await login(second, a);
    await login(foreign, b);
    check(!page.url().includes('/login') && !device.url().includes('/login'), 'Two independent browser devices did not authenticate the temporary account.');
    await api(first, 'settings.updateQuizPreferences', { vocabularyAutoAudio: false, alphabetAutoAudio: false });

    // The caller provides an isolated temporary AI lesson and deletes it later.
    await page.goto(`${base}/ko/grammar/${lesson.id}`);
    await expect(page.getByRole('heading', { level: 1, name: lesson.title, exact: true })).toBeVisible();
    await expect(page.getByText(/AI-authored; not human-reviewed/).first()).toBeVisible();
    await expect(page.locator('.grammar-example')).toHaveCount(3);
    await expect(page.locator('.grammar-exercise')).toHaveCount(5);
    check(await page.locator('.grammar-example [lang="ko"]').count() === 3, 'Production Korean AI lesson omitted its three native-script examples.');
    for (let index = 0; index < lesson.exercises.length; index++) {
      await page.locator('.grammar-exercise').nth(index).getByRole('radio').nth(lesson.exercises[index].correctIndex).check();
    }
    const grammarProgress = await perform(page, 'grammar.submit', () => page.getByRole('button', { name: 'Check answers', exact: true }).click());
    await expect(page.getByText(/5 \/ 5 correct/)).toBeVisible();
    check(grammarProgress.completed && grammarProgress.correct === 5 && grammarProgress.contentVersion === lesson.contentVersion, 'Actual Korean AI exercise UI did not persist correct versioned progress.');
    await page.reload();
    await expect(page.locator('.page-heading').getByText('Completed', { exact: true })).toBeVisible();
    await device.goto(`${base}/ko/grammar/${lesson.id}`);
    await expect(device.locator('.page-heading').getByText('Completed', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    check(await noOverflow(page), 'Production Korean grammar page overflowed a mobile viewport.');
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${base}/ko/alphabet`);
    await expect(page.locator('.alphabet-card')).toHaveCount(40);
    await expect(page.getByText('40 symbols', { exact: true })).toBeVisible();
    await page.getByLabel('Alphabet question type', { exact: true }).selectOption('mcq');
    await page.getByLabel('Alphabet direction', { exact: true }).selectOption('character-to-pronunciation');
    const alphabet = await perform(page, 'alphabetQuiz.create', () => page.getByRole('button', { name: 'Start alphabet quiz', exact: true }).click());
    await expect(page.locator('.alphabet-mcq-option')).toHaveCount(4);
    const frozenOptions = await page.locator('.alphabet-mcq-option').allTextContents();
    check(alphabet.configuration.mode === 'mcq' && alphabet.items.length === 40 && new Set(alphabet.currentQuestion.options.map(option => option.id)).size === 4, 'Production Alphabet MCQ UI did not freeze four options from forty Korean characters.');
    const savedAlphabet = await perform(page, 'alphabetQuiz.save', () => page.getByRole('button', { name: 'Save & exit', exact: true }).click());
    check(savedAlphabet.status === 'saved', 'Production Alphabet save UI did not persist a saved session.');
    await device.goto(`${base}/ko/alphabet?session=${alphabet.id}`);
    await expect(device.locator('.alphabet-mcq-option')).toHaveCount(4);
    check(isDeepStrictEqual(await device.locator('.alphabet-mcq-option').allTextContents(), frozenOptions), 'Second browser regenerated or reordered Alphabet MCQ options on resume.');
    await perform(device, 'alphabetQuiz.end', () => device.getByRole('button', { name: 'End alphabet quiz', exact: true }).click());

    // Create one isolated word through the actual authenticated HTTP API, then
    // answer, retry, aggregate, change care and reopen history through the UI.
    const list = await api(first, 'vocabulary.createList', { language: 'ko', name: 'Disposable browser verification' });
    const word = await api(first, 'vocabulary.save', { input: { language: 'ko', listId: list.id, word: '검증', reading: 'geomjeung', translation: 'browser verification', type: 'noun', category: 'temporary verification', example: '', notes: 'Full browser Summary details', acceptedAnswers: [{ id: randomUUID(), text: 'browser check' }], examples: [{ id: randomUUID(), text: '검증합니다.', reading: 'geomjeunghamnida', translation: 'We verify.' }], relatedWords: [{ id: randomUUID(), word: '검사', reading: 'geomsa', translation: 'inspection', relationType: 'related' }] } });
    const quiz = await api(first, 'quiz.create', { language: 'ko', wordIds: [word.id], type: 'typing', presentation: 'never', randomSeed: 11 });
    await page.goto(`${base}/ko/quiz?session=${quiz.id}`);
    const meaning = page.getByRole('textbox', { name: 'English meaning', exact: true });
    await meaning.fill('deliberately incorrect browser answer');
    const wrong = await perform(page, 'quiz.answer', () => page.getByRole('button', { name: 'Check answer', exact: true }).click());
    await expect(page.getByText('Try this one again', { exact: true })).toBeVisible();
    check(wrong.presentation === 'never' && wrong.attempts.length === 1 && !wrong.attempts[0].correct && await page.locator('.quiz-feedback').count() === 0, 'Never-show UI failed to advance a wrong answer directly into its retry.');
    await meaning.fill('browser verification');
    const completed = await perform(page, 'quiz.answer', () => page.getByRole('button', { name: 'Check answer', exact: true }).click());
    const summary = page.getByRole('region', { name: 'Quiz Summary', exact: true });
    await expect(summary).toBeVisible();
    await expect(summary.locator('.quiz-summary-attempts > li')).toHaveCount(2);
    await expect(summary.getByText('Initial: Incorrect', { exact: true })).toBeVisible();
    await expect(summary.getByText('Final: Correct', { exact: true })).toBeVisible();
    await expect(summary.getByText('Full browser Summary details', { exact: true })).toBeVisible();
    await expect(summary.getByRole('region', { name: 'All example sentences', exact: true })).toBeVisible();
    await expect(summary.getByRole('region', { name: 'All related words', exact: true })).toBeVisible();
    check(completed.status === 'completed' && completed.attempts.length === 2 && completed.attempts.map(attempt => attempt.correct).join(',') === 'false,true', 'Actual browser retry did not retain separate initial and final results.');
    const addedCare = await perform(page, 'care.setManual', () => summary.getByRole('button', { name: `Add ${word.id} to Words that need care`, exact: true }).click());
    check(addedCare.manualCare, 'Summary Add button did not persist manual care.');
    const removedCare = await perform(page, 'care.setManual', () => summary.getByRole('button', { name: `Remove ${word.id} from Words that need care`, exact: true }).click());
    check(!removedCare.manualCare && removedCare.automaticSuppressed, 'Summary Remove button did not persist automatic suppression.');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Quiz Summary', exact: true }).locator('.quiz-summary-attempts > li')).toHaveCount(2);
    await device.goto(`${base}/ko/quiz?session=${quiz.id}`);
    await expect(device.getByRole('region', { name: 'Quiz Summary', exact: true }).locator('.quiz-summary-attempts > li')).toHaveCount(2);
    await expect(device.getByText('Initial: Incorrect', { exact: true })).toBeVisible();
    await expect(device.getByText('Final: Correct', { exact: true })).toBeVisible();
    const reopened = await api(second, 'quiz.session', { id: quiz.id });
    check(reopened.presentation === 'never' && isDeepStrictEqual(reopened.attempts, completed.attempts), 'Second browser history lost full attempts or its saved presentation preference.');
    await page.goto(`${base}/ko/quiz`);
    const history = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Practice history', exact: true }) });
    await history.locator('.quiz-resume-row').first().getByRole('button', { name: 'Open Summary', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Quiz Summary', exact: true }).locator('.quiz-summary-attempts > li')).toHaveCount(2);
    await expect(page.getByText('Full browser Summary details', { exact: true })).toBeVisible();
    check(await page.getByText('Final: Correct', { exact: true }).isVisible(), 'Practice history Open Summary did not reopen the completed browser session.');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await noOverflow(page), 'Production full Quiz Summary overflowed a mobile viewport.');
    await page.setViewportSize({ width: 1280, height: 900 });

    const zero = await api(first, 'quiz.create', { language: 'ko', wordIds: [word.id], type: 'typing', presentation: 'never' });
    await page.goto(`${base}/ko/quiz?session=${zero.id}`);
    await expect(page.getByRole('button', { name: 'End practice', exact: true })).toBeVisible();
    const ended = await perform(page, 'quiz.end', () => page.getByRole('button', { name: 'End practice', exact: true }).click());
    await expect(page.getByText(/No questions answered\. 0\/0/)).toBeVisible();
    check(ended.status === 'ended' && ended.attempts.length === 0 && await page.locator('.quiz-summary-word').count() === 0, 'Zero-answer ended quiz failed to render its empty Summary.');

    const hiddenQuiz = await api(foreign, 'quiz.session', { id: quiz.id }, 400);
    const hiddenAlphabet = await api(foreign, 'alphabetQuiz.session', { id: alphabet.id }, 400);
    await api(foreign, 'care.setManual', { wordId: word.id, action: 'add' }, 400);
    const foreignEntries = await api(foreign, 'vocabulary.entries', { language: 'ko' });
    check(Boolean(hiddenQuiz.error) && !hiddenQuiz.data && Boolean(hiddenAlphabet.error) && !hiddenAlphabet.data && !foreignEntries.some(entry => entry.id === word.id), 'Production HTTP API exposed another account session or vocabulary.');
    return { groups: ['two real cookie-authenticated devices', 'AI Korean grammar and versioned progress', 'mobile grammar/Summary', 'forty Korean alphabet cards', 'frozen Alphabet MCQ UI/save/resume', 'Never-show retry and full historical Summary', 'manual care/suppression UI', 'zero-answer ended Summary', 'cross-account HTTP isolation'] };
  } finally {
    await Promise.allSettled(contexts.map(client => client.close()));
  }
}
