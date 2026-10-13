import { expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';

/** Read-only browser verification of the existing Korean publication dataset. */
export async function verifyKoreanBrowser({ browser, base, account, points, check }) {
  const contexts = [];
  const expected = points.filter(point => point.language === 'ko');
  check(expected.length === 60 && expected.every(point => point.status === 'published-ai' && point.reviewer === null), 'The Korean browser fixture must contain exactly sixty AI publications without claimed human review.');
  const login = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contexts.push(context);
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await page.goto(`${base}/ko/grammar`);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    if (new URL(page.url()).pathname !== '/ko/grammar') await page.goto(`${base}/ko/grammar`);
    return page;
  };
  const verifyListing = async page => {
    const cards = page.locator('.lesson-card');
    await expect(cards).toHaveCount(60);
    await expect(page.getByRole('heading', { level: 1, name: 'Grammar', exact: true })).toBeVisible();
    await expect(page.getByText(/AI-authored; not human-reviewed/).first()).toBeVisible();
    await expect(cards.locator('h2')).toHaveText(expected.map(point => point.title));
    const hrefs = await cards.locator('a.button').evaluateAll(links => links.map(link => link.getAttribute('href')));
    check(isDeepStrictEqual(hrefs, expected.map(point => `/ko/grammar/${point.id}`)), 'The sixty Korean lesson links differ from the local dataset order or identities.');
    const records = await cards.locator('small.muted').allTextContents();
    check(records.length === 60 && records.every((record, index) => record.includes('AI-authored; not human-reviewed') && record.includes(`Version ${expected[index].contentVersion}`)), 'The Korean listing omitted AI disclosure or the published content version.');
    check(await cards.filter({ hasText: 'Ready to start' }).count() === 60, 'Read-only Korean smoke account unexpectedly acquired lesson progress.');
  };
  try {
    const page = await login();
    await verifyListing(page);
    for (const index of [0, Math.floor(expected.length / 2), expected.length - 1]) {
      const point = expected[index];
      await page.locator(`.lesson-card a[href="/ko/grammar/${point.id}"]`).click();
      await expect(page).toHaveURL(`${base}/ko/grammar/${point.id}`);
      await expect(page.getByRole('heading', { level: 1, name: point.title, exact: true })).toBeVisible();
      const how = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'How it works', exact: true }) });
      await expect(how.locator('p').first()).toHaveText(point.explanation);
      check(await page.locator('.formation').textContent() === point.formation, `Korean lesson ${point.id} formation differs from the local dataset.`);
      await expect(page.locator('.grammar-example')).toHaveCount(3);
      await expect(page.locator('.grammar-example strong[lang="ko"]')).toHaveText(point.examples.map(example => example.text));
      await expect(page.locator('.grammar-example > p')).toHaveText(point.examples.map(example => example.translation));
      check(point.examples.every(example => /[\uac00-\ud7a3]/u.test(example.text)), `Korean lesson ${point.id} examples lack native Hangul.`);
      await expect(page.locator('.grammar-exercise')).toHaveCount(5);
      await expect(page.locator('.grammar-exercise > legend')).toHaveText(point.exercises.map((exercise, exerciseIndex) => `${exerciseIndex + 1}. ${exercise.prompt}`));
      await expect(page.locator('.grammar-exercise .exercise-choice > span')).toHaveText(point.exercises.flatMap(exercise => exercise.choices));
      await expect(page.getByRole('note')).toContainText('AI-authored; not human-reviewed');
      await expect(page.getByText(/Status: published-ai/)).toContainText('Reviewer: Not yet reviewed');
      check(await page.getByRole('button', { name: 'Check answers', exact: true }).isDisabled(), `Korean lesson ${point.id} practice unexpectedly accepted an empty submission.`);
      await page.locator('a.back-link').click();
      await expect(page).toHaveURL(`${base}/ko/grammar`);
      await expect(page.locator('.lesson-card')).toHaveCount(60);
    }
    await page.reload();
    await verifyListing(page);
    const second = await login();
    await verifyListing(second);
    check(!page.url().includes('/login') && !second.url().includes('/login'), 'Korean publication listing did not persist across two real authenticated browser devices.');
    return { lessons: 60, inspected: [expected[0].id, expected[Math.floor(expected.length / 2)].id, expected.at(-1).id], devices: 2 };
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
  }
}
