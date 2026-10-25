import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initTheme } from '@earendil-works/pi-coding-agent';
import extension from '../index.ts';
import { isolateConfig } from './isolated-config.mjs';

const dir = isolateConfig();
initTheme('dark');
const models = [{ provider: 'p', id: 'big' }, { provider: 'p', id: 'light' }];
const saved = () => JSON.parse(readFileSync(join(dir, 'pi-tab-title.json'), 'utf8'));

function setup(t, ui) {
  const hooks = {}, commands = {};
  extension({
    on: (name, fn) => (hooks[name] ??= []).push(fn),
    registerCommand: (name, spec) => commands[name] = spec,
    registerTool() {}, appendEntry() {}, getSessionName: () => undefined, setSessionName() {},
  });
  const modelRegistry = {
    getAvailable: () => models,
    find: (provider, id) => models.find(m => m.provider === provider && m.id === id),
    getError: () => undefined,
    refresh: async () => ({}),
  };
  const ctx = { mode: 'tui', sessionManager: { getEntries: () => [], getBranch: () => [] }, modelRegistry, ui: { setTitle() {}, notify() {}, ...ui } };
  const emit = async (name) => { for (const fn of hooks[name] ?? []) await fn({}, ctx); };
  t.after(() => emit('session_shutdown'));
  return { start: () => emit('session_start'), choose: () => commands.tabmodel.handler('', ctx) };
}

test('/tabmodel uses the native model selector in the TUI and saves the choice', async t => {
  let rendered = '';
  const h = setup(t, {
    select: () => assert.fail('plain list must not be used'),
    custom: factory => new Promise(resolve => {
      const component = factory({ requestRender() {} }, { fg: (_c, text) => text }, {}, resolve);
      rendered = component.render(80).join('\n');
      component.dispose?.();
      resolve('p/light');
    }),
  });
  await h.start(); await h.choose();
  assert.match(rendered, /light/);
  assert.match(rendered, /命名模型/);
  assert.doesNotMatch(rendered, /\/login/);
  assert.deepEqual(saved(), { version: 1, provider: 'p', model: 'light' });
});

test('/tabmodel falls back to the plain list when the selector cannot be built', async t => {
  let options;
  const h = setup(t, {
    select: async (_title, choices) => { options = choices; return 'p/big'; },
    // A broken tui object makes the selector constructor throw, as an incompatible Pi version would.
    custom: factory => new Promise(resolve => { factory(null, { fg: (_c, text) => text }, {}, resolve); }),
  });
  await h.start(); await h.choose();
  assert.deepEqual(options, ['p/big', 'p/light']);
  assert.deepEqual(saved(), { version: 1, provider: 'p', model: 'big' });
});

test('/tabmodel falls back to the plain list when custom UI rejects', async t => {
  const h = setup(t, { select: async () => 'p/light', custom: async () => { throw Error('no overlay'); } });
  await h.start(); await h.choose();
  assert.deepEqual(saved(), { version: 1, provider: 'p', model: 'light' });
});
