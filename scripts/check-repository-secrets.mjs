import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const names = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DEEPL_API_KEY', 'DATABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'VERCEL_TOKEN', 'NINGLINGO_ACCOUNT_PASSWORD'];
const secrets = names.map(name => process.env[name]).filter(value => value && value.length > 8);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
function check(contents, file) {
  if (secrets.some(secret => contents.includes(secret)) || /sb_secret_[a-zA-Z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) throw new Error(`Credential detected in ${file}; values withheld.`);
}
for (const file of files) {
  if (/(^|\/)\.env(\.|$)/.test(file) && file !== '.env.example') throw new Error(`Private environment file is not ignored: ${file}`);
  check(await readFile(file, 'utf8'), file);
}
let artifacts = 0;
async function scanServer(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = join(path, item.name);
    if (item.isDirectory()) await scanServer(full);
    else if (/\.(js|json|map|html|rsc|body)$/.test(item.name)) { check(await readFile(full, 'utf8'), full); artifacts++; }
  }
}
await scanServer('.next/server');
console.log(`Secret scan passed: ${files.length} repository files and ${artifacts} server artifacts; no embedded credentials/private environment files.`);
