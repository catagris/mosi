/**
 * Production entrypoint: apply migrations, set adapter-node proxy headers
 * when TRUST_PROXY=true, then start the SvelteKit server.
 */
import { spawnSync, spawn } from 'node:child_process';

const migrateResult = spawnSync('node', ['scripts/migrate.mjs'], { stdio: 'inherit' });
if (migrateResult.status !== 0) process.exit(migrateResult.status ?? 1);

const env = { ...process.env };
if (env.TRUST_PROXY === 'true') {
	env.ADDRESS_HEADER ??= 'x-forwarded-for';
	env.PROTOCOL_HEADER ??= 'x-forwarded-proto';
	env.HOST_HEADER ??= 'x-forwarded-host';
	env.XFF_DEPTH ??= '1';
}

const server = spawn('node', ['build'], { stdio: 'inherit', env });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.kill(signal));
}
