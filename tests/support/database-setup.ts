import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { TestProject } from 'vitest/node';

// Solo estas dos operaciones leen el contenedor original: inspect y pg_dump.
// Todas las escrituras apuntan al contenedor aleatorio creado más abajo.
export default async function setup(project: TestProject) {
  const sourceName = process.env.TEST_SOURCE_CONTAINER ?? 'mandril_backend';
  const name = `mandril-product-test-${randomUUID()}`;
  const token = randomUUID();
  const docker = (args: string[], input?: Buffer) =>
    execFileSync('docker', args, { input, timeout: 60_000, maxBuffer: 128 * 1024 * 1024, stdio: 'pipe' });

  const [source] = JSON.parse(docker(['inspect', sourceName]).toString());
  const sourceEnv: string[] = source.Config.Env;
  const sourceUser = sourceEnv.find((entry) => entry.startsWith('POSTGRES_USER='))?.slice(14) ?? 'postgres';
  const sourceDatabase = sourceEnv.find((entry) => entry.startsWith('POSTGRES_DB='))?.slice(12) ?? sourceUser;
  const dump = docker([
    'exec',
    sourceName,
    'pg_dump',
    '-U',
    sourceUser,
    '-d',
    sourceDatabase,
    '-Fc',
    '--no-owner',
    '--no-privileges',
  ]);

  let created = false;
  const cleanup = () => {
    if (!created) return;
    const [target] = JSON.parse(docker(['inspect', name]).toString());
    if (name === sourceName || target.Config.Labels?.['mandril.product-test-token'] !== token) {
      throw new Error('Se rechazó eliminar un contenedor que no pertenece a esta ejecución.');
    }
    docker(['rm', '--force', name]);
    created = false;
  };

  try {
    docker([
      'run',
      '--detach',
      '--name',
      name,
      '--label',
      `mandril.product-test-token=${token}`,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_USER=product_test',
      '--env',
      'POSTGRES_PASSWORD=product_test',
      '--env',
      'POSTGRES_DB=mandril_product_test',
      source.Image,
    ]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'product_test', '-d', 'mandril_product_test']);
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!ready) throw new Error('PostgreSQL de pruebas no inició a tiempo.');
    docker(
      [
        'exec',
        '-i',
        name,
        'pg_restore',
        '-U',
        'product_test',
        '-d',
        'mandril_product_test',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
      ],
      dump,
    );
    docker([
      'exec',
      name,
      'psql',
      '-U',
      'product_test',
      '-d',
      'mandril_product_test',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE SCHEMA product_test_guard; CREATE TABLE product_test_guard.identity (token text PRIMARY KEY); INSERT INTO product_test_guard.identity VALUES ('${token}');`,
    ]);
    const [target] = JSON.parse(docker(['inspect', name]).toString());
    const port = target.NetworkSettings.Ports['5432/tcp'][0].HostPort;
    project.provide('databaseUrl', `postgresql://product_test:product_test@127.0.0.1:${port}/mandril_product_test`);
    project.provide('databaseToken', token);
    console.log(`Copia temporal de PostgreSQL: ${name}`);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
