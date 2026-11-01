// Finds (or creates) the D1 database by NAME and writes its id into wrangler.jsonc for this CI run, so every
// deploy talks to the same database. Never commit the result: the repo keeps the id out so local dev stays local.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Pure: adds `"database_id": id` after the `"database_name": name,` line. Replaces an existing id. */
export function injectDatabaseId(jsonc, name, id) {
  const withoutOld = jsonc.replace(/\s*"database_id":\s*"[^"]*",?/g, '');
  const pattern = new RegExp(`("database_name":\\s*"${name}")(,?)`);
  if (!pattern.test(withoutOld)) throw new Error(`No d1_databases entry named "${name}" in wrangler.jsonc`);
  return withoutOld.replace(pattern, `$1,\n      "database_id": "${id}"$2`);
}

/** Pure: the id of the database called `name` in the JSON that `wrangler d1 list --json` prints, or null. */
export function findDatabaseId(listJson, name) {
  const databases = JSON.parse(listJson);
  const match = databases.find((db) => db.name === name);
  return match ? (match.uuid ?? match.id ?? null) : null;
}

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function main() {
  const name = process.argv[2] ?? 'propwash-fpv';
  const configPath = process.argv[3] ?? 'wrangler.jsonc';
  let id = findDatabaseId(wrangler(['d1', 'list', '--json']), name);
  if (!id) {
    console.log(`Creating D1 database "${name}"...`);
    wrangler(['d1', 'create', name]);
    id = findDatabaseId(wrangler(['d1', 'list', '--json']), name);
  }
  if (!id) throw new Error(`Could not find or create the D1 database "${name}"`);
  writeFileSync(configPath, injectDatabaseId(readFileSync(configPath, 'utf8'), name, id));
  console.log(`Using D1 database "${name}" (${id}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
