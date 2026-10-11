import { execFileSync } from 'node:child_process';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const names = ['SUPABASE_SECRET_KEY','DEEPL_API_KEY','DATABASE_URL','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN','NINGLINGO_ACCOUNT_PASSWORD'];
const secrets = names.map(name => process.env[name]).filter(value => value && value.length > 8);
const files = execFileSync('git', ['diff','--cached','--name-only','--diff-filter=ACM','-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
for (const file of files) {
  if (/(^|\/)\.env(\.|$)/.test(file) && file !== '.env.example') throw new Error(`Secret environment file staged: ${file}`);
  const value = execFileSync('git', ['show',`:${file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  if (secrets.some(secret => value.includes(secret)) || /sb_secret_[a-zA-Z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) throw new Error(`Credential detected in staged file: ${file}`);
}
console.log(`Checked ${files.length} staged files: no configured server credentials or private environment files.`);
