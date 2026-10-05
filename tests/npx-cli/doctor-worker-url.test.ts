// `npx claude-mem doctor` must probe the worker where every other client
// reaches it: the host and port saved in settings.json (environment overrides
// still win), with an IPv6 host bracketed. It read only env + built-in
// defaults, so a worker on a custom port saved in settings.json was reported
// as "no response", and an IPv6 host built an unparseable URL.
import { describe, expect, it } from 'bun:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function supportsIpv6Loopback(): Promise<boolean> {
  const probe = http.createServer();
  return new Promise((resolve) => {
    probe.once('error', () => {
      probe.close(() => undefined);
      resolve(false);
    });
    probe.listen(0, '::1', () => {
      probe.close(() => resolve(true));
    });
  });
}

const ipv6LoopbackSupported = await supportsIpv6Loopback();

async function doctorAgainst(host: string, listenHost: string, settingsOnly: boolean): Promise<{ stdout: string; urls: string[]; port: number }> {
  const root = mkdtempSync(join(tmpdir(), 'claude-mem-doctor-url-'));
  const urls: string[] = [];
  const server = http.createServer((request, response) => {
    urls.push(request.url ?? '');
    response.setHeader('Content-Type', 'application/json');
    response.end(request.url === '/api/health' ? '{"status":"ok"}' : '{}');
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, listenHost, resolve);
    });
    const port = (server.address() as AddressInfo).port;
    const modulePath = join(import.meta.dir, '../../src/npx-cli/commands/doctor.ts');
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_MEM_DATA_DIR: root, CLAUDE_CONFIG_DIR: root,
      CLAUDE_MEM_TELEMETRY: '0', DO_NOT_TRACK: '1' };
    delete env.CLAUDE_MEM_WORKER_HOST;
    delete env.CLAUDE_MEM_WORKER_PORT;
    if (settingsOnly) {
      writeFileSync(join(root, 'settings.json'), JSON.stringify({
        CLAUDE_MEM_WORKER_HOST: host, CLAUDE_MEM_WORKER_PORT: String(port),
      }));
    } else {
      env.CLAUDE_MEM_WORKER_HOST = host;
      env.CLAUDE_MEM_WORKER_PORT = String(port);
    }
    const child = Bun.spawn({
      cmd: [process.execPath, '-e', `import { runDoctorCommand } from ${JSON.stringify(modulePath)};
        await runDoctorCommand();`],
      cwd: root,
      env,
      stdout: 'pipe', stderr: 'pipe',
    });
    const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { stdout, urls, port };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}

describe('npx doctor worker URL', () => {
  it('probes the worker port saved in settings.json', async () => {
    const { stdout, urls, port } = await doctorAgainst('127.0.0.1', '127.0.0.1', true);
    expect(urls).toContain('/api/health');
    expect(stdout).toContain(`healthy at http://127.0.0.1:${port}`);
  }, 30_000);

  it.skipIf(!ipv6LoopbackSupported)('brackets an IPv6 worker host', async () => {
    const { stdout, urls, port } = await doctorAgainst('::1', '::1', false);
    expect(urls).toContain('/api/health');
    expect(stdout).toContain(`healthy at http://[::1]:${port}`);
  }, 30_000);
});
