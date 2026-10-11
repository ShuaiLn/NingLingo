import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
nextEnv.loadEnvConfig(process.cwd());
const terminal = createInterface({ input: stdin, output: stdout });
const ask = prompt => new Promise(resolve => terminal.question(prompt, resolve));
const email = process.env.NINGLINGO_ACCOUNT_EMAIL ?? (await ask('Personal account email: ')).trim();
terminal.close();
async function hiddenPassword() {
  if (process.env.NINGLINGO_ACCOUNT_PASSWORD) return process.env.NINGLINGO_ACCOUNT_PASSWORD;
  if (!stdin.isTTY) throw new Error('Use an interactive terminal to enter a password.');
  stdout.write('Password (at least 12 characters): ');
  emitKeypressEvents(stdin); stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const listener = (text, key) => {
      if (key?.name === 'return' || (key?.ctrl && key.name === 'c')) {
        stdin.off('keypress', listener); stdin.setRawMode(false); stdin.pause(); stdout.write('\n');
        if (key.ctrl) reject(new Error('Cancelled.')); else resolve(value);
      } else if (key?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key?.ctrl) value += text;
    };
    stdin.on('keypress', listener);
  });
}
try {
  const password = await hiddenPassword();
  if (!email.includes('@') || password.length < 12) throw new Error('A valid email and password of at least 12 characters are required.');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Ning' } });
  if (error) throw new Error('Account creation failed. Check whether the email already has an account; existing passwords were not changed.');
  console.log('Personal account created. No email was sent and no password was printed.');
} catch (error) { console.error(error instanceof Error ? error.message : 'Account creation failed.'); process.exitCode = 1; }
