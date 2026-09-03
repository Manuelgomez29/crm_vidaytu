import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const consultar = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return [r.status, await r.text()];
};
const archivo = process.argv[2];
const version = archivo.match(/(\d{14})_(.+)\.sql$/);
console.log('migracion:', ...(await consultar(fs.readFileSync(archivo, 'utf8'))).map((x) => String(x).slice(0, 400)));
console.log('registro:', ...(await consultar(
  `insert into supabase_migrations.schema_migrations (version, name) values ('${version[1]}','${version[2]}') on conflict (version) do nothing;`,
)).map((x) => String(x).slice(0, 200)));
