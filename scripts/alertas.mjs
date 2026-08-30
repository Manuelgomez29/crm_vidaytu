/**
 * Lanza el motor de alertas contra el servidor local, como haría el cron.
 *   node --env-file=.env.local scripts/alertas.mjs [puerto]
 */
const puerto = process.argv[2] ?? '3000';
const res = await fetch(`http://localhost:${puerto}/api/tareas-programadas`, {
  method: 'POST',
  headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
});
const cuerpo = await res.json().catch(() => null);
console.log(res.status, JSON.stringify(cuerpo, null, 2));
process.exit(res.ok ? 0 : 1);
