import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';

/** Real public registration, with a separate admin-generated confirmation token
 * for an undeliverable disposable inbox. SMTP rejection is reported, never
 * relabeled as successful public signup. No real account is altered. */
export async function verifyPublicSignup({ admin, browser, base, check, register }) {
  const email = `ninglingo-signup-${randomUUID()}@example.com`;
  const password = randomBytes(30).toString('base64url');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const context = await browser.newContext();
  const page = await context.newPage();
  const issues = [];
  const externalConditions = [];
  try {
    await page.goto(`${base}/login`);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await page.waitForURL(/\/signup/);
    await page.getByRole('heading', { name: 'Start learning.' }).waitFor();
    check(true, 'Public signup page is unavailable');
    await page.getByLabel('Email', { exact: true }).fill('invalid-email');
    await page.getByLabel('Password', { exact: true }).fill('short');
    check(!(await page.locator('form').evaluate(form => form.checkValidity())), 'Signup did not validate invalid email/password');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill('mismatched-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.locator('.login-card [role="alert"]').filter({ hasText: 'Passwords do not match.' }).waitFor();
    check(true, 'Signup password mismatch state');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    check(await page.getByLabel('Email', { exact: true }).inputValue() === email && await page.getByLabel('Password', { exact: true }).inputValue() === password && await page.getByLabel('Confirm password', { exact: true }).inputValue() === password, 'Signup fixture credentials were reset before submission');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByTestId('signup-message').filter({ hasText: 'Passwords do not match.' }).waitFor({ state: 'hidden' });
    await page.getByTestId('signup-message').waitFor({ timeout: 45000 });
    const failure = (await page.getByTestId('signup-message').getAttribute('role')) === 'alert' ? await page.getByTestId('signup-message').textContent() : null;
    if (failure) {
      // Keep the remaining persistence/security checks running with a clearly
      // identified confirmation fixture. This is NOT a public-signup success.
      const code = await page.getByTestId('signup-message').getAttribute('data-error-code');
      const status = await page.getByTestId('signup-message').getAttribute('data-error-status');
      if (code === 'over_email_send_rate_limit' && status === '429') {
        externalConditions.push('Supabase built-in sender returned 429 over_email_send_rate_limit. Custom SMTP is required before public signup release; inbox delivery has not been verified.');
        console.log('Cloud public registration: external email-delivery limit (429 over_email_send_rate_limit).');
      } else {
        issues.push(`Public signup failed: ${failure}`);
        console.log(`Cloud public registration: HTTP ${status ?? 'unknown'} / ${code ?? 'unknown'}: ${failure}`);
      }
      check(true, 'Signup exposes a graceful failure state');
    } else {
      check(await page.locator('.login-card [role="status"]').isVisible(), 'Signup confirmation/success state is absent');
    }
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw new Error('Could not inspect the disposable signup account.');
    const created = users.data.users.find(user => user.email === email);
    if (created) register(created.id);
    if (!failure) check(Boolean(created), 'Public signup did not create the new Auth account');
    const generated = await admin.auth.admin.generateLink({ type: 'signup', email, password });
    if (generated.error || !generated.data.user || !generated.data.properties?.hashed_token) throw new Error('Disposable signup confirmation-token generation failed.');
    const id = generated.data.user.id;
    if (!created) register(id);
    check(!created || id === created.id, 'Confirmation unexpectedly created a second account');
    const profile = await admin.from('profiles').select('*').eq('user_id', id).single();
    check(!profile.error && profile.data.timezone === 'America/Tijuana' && profile.data.language_preferences.join(',') === 'ja,es,el' && profile.data.display_name === 'Ning', 'New-user profile/settings bootstrap failed');
    const unconfirmed = await client.auth.signInWithPassword({ email, password });
    check(unconfirmed.error?.code === 'email_not_confirmed', 'An unconfirmed account could sign in');
    await page.goto(`${base}/ja`);
    check(page.url().includes('/login'), 'Unconfirmed signup gained protected access');
    const token = generated.data.properties.hashed_token;
    await page.goto(`${base}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=signup&next=/el`);
    await page.getByRole('heading', { name: 'Your account is ready.' }).waitFor();
    check(true, 'Signup email confirmation did not issue a cookie session');
    await page.getByRole('link', { name: 'Continue to workspace' }).click();
    await page.waitForURL(/\/el$/);
    await page.reload();
    check(!page.url().includes('/login'), 'Confirmed signup session did not persist after navigation/reload');
    const authenticated = await context.request.post(`${base}/api/repository`, { data: { operation: 'settings.profile', args: {} } });
    check(authenticated.status() === 200 && (await authenticated.json()).data.id === id, 'Signup cookie session could not access its own profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(/\/login/);
    const replay = await context.request.get(`${base}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=signup`, { maxRedirects: 0 });
    check(replay.headers().location?.includes('error=confirmation'), 'Confirmation token could be reused');
    await page.goto(`${base}/signup?error=confirmation`);
    await page.locator('.login-card [role="alert"]').waitFor();
    check(await page.locator('.login-card [role="alert"]').isVisible(), 'Expired confirmation link has no clear UI state');
    // Confirm-email projects may intentionally return an obfuscated duplicate
    // success. Both provider behaviors must retain safe, usable UI messaging.
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByTestId('signup-message').filter({ hasText: /already|too many/i }).waitFor({ timeout: 45000 });
    check(true, 'Duplicate/rate-limited signup does not provide a safe sign-in/retry state');
    const login = await client.auth.signInWithPassword({ email, password });
    check(!login.error, 'Confirmed new account could not sign in with its email/password');
    console.log(`Cloud signup: provisioning, confirmation, cookie persistence, validation and duplicate/rate-limit UI handling passed${issues.length || externalConditions.length ? '; actual registration/email delivery is unavailable (reported separately)' : '; actual public registration passed'}.`);
    return { account: { email, password, id, client }, issues, externalConditions };
  } finally { await context.close(); }
}
