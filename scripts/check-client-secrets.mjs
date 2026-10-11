import nextEnv from '@next/env';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const names = ['SUPABASE_SECRET_KEY', 'DEEPL_API_KEY', 'DATABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'VERCEL_TOKEN'];
const secrets = names.map(name => process.env[name]).filter(value => value && value.length > 8);
async function scan(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = join(path, item.name);
    if (item.isDirectory()) await scan(full);
    else if (/\.(js|json|map|html)$/.test(item.name)) {
      const contents = await readFile(full, 'utf8');
      if (secrets.some(secret => contents.includes(secret))) throw new Error(`Server credential found in client artifact: ${full}`);
    }
  }
}
await scan('.next/static');
console.log('Client artifacts contain no configured server credential values.');
