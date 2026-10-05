// The npx runtime commands hand the child's exit status straight to
// process.exit. A child killed by a signal closes with code === null, and
// `exitCode ?? 0` turned that into success: `npx claude-mem start` reported
// exit 0 after its worker was OOM-killed or terminated.
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as spawnModule from '../../src/shared/spawn.js';
import * as workerUtils from '../../src/shared/worker-utils.js';
import * as setupRuntime from '../../src/npx-cli/install/setup-runtime.js';
import { runStartCommand, runStatusCommand } from '../../src/npx-cli/commands/runtime.js';

describe('npx runtime commands: child exit status', () => {
  const spies: Array<{ mockRestore(): void }> = [];
  let pluginRoot: string | undefined;

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    if (pluginRoot) rmSync(pluginRoot, { recursive: true, force: true });
    pluginRoot = undefined;
  });

  function setup(): { child: EventEmitter; exits: Array<number | undefined> } {
    pluginRoot = mkdtempSync(join(tmpdir(), 'claude-mem-plugin-root-'));
    mkdirSync(join(pluginRoot, 'scripts'));
    writeFileSync(join(pluginRoot, 'scripts', 'worker-service.cjs'), '');
    const child = new EventEmitter();
    const exits: Array<number | undefined> = [];
    spies.push(
      spyOn(workerUtils, 'resolvePluginRoot').mockReturnValue({
        root: pluginRoot,
        version: 'test',
        missingDependencies: [],
      } as unknown as ReturnType<typeof workerUtils.resolvePluginRoot>),
      spyOn(setupRuntime, 'getBunPath').mockReturnValue('/usr/local/bin/bun'),
      spyOn(spawnModule, 'spawnHidden').mockImplementation(
        (() => child) as unknown as typeof spawnModule.spawnHidden,
      ),
      spyOn(process, 'exit').mockImplementation(((code?: number) => {
        exits.push(code);
      }) as unknown as typeof process.exit),
    );
    return { child, exits };
  }

  it('exits non-zero when the worker child is killed by a signal', () => {
    const { child, exits } = setup();
    runStatusCommand();
    child.emit('close', null, 'SIGTERM');
    expect(exits).toEqual([143]);
  });

  it('reports SIGKILL (an OOM kill) as 137', () => {
    const { child, exits } = setup();
    runStartCommand();
    child.emit('close', null, 'SIGKILL');
    expect(exits).toEqual([137]);
  });

  it('still forwards an ordinary exit code unchanged', () => {
    const { child, exits } = setup();
    runStatusCommand();
    child.emit('close', 3, null);
    expect(exits).toEqual([3]);
  });
});
