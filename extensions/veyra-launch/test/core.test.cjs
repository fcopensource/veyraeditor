const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chooseManager, versionCheck, scanProject, explainError, portStatus } = require('../dist/core');

test('declared manager wins; mixed lockfiles are flagged', () => {
  assert.deepEqual(chooseManager({packageManager:'pnpm@9.0.0'}, ['package-lock.json']), {manager:'pnpm', ambiguous:true});
  assert.deepEqual(chooseManager({}, ['bun.lock']), {manager:'bun', ambiguous:false});
  assert.deepEqual(chooseManager({}, []), {manager:'npm', ambiguous:false});
  assert.equal(chooseManager({}, ['npm-shrinkwrap.json','package-lock.json']).ambiguous, false);
});
test('Node ranges support alternatives and distinguish unknown from compatible', () => {
  assert.equal(versionCheck('v22.17.0','^20 || >=22').status,'pass');
  assert.equal(versionCheck('v18.0.0','>=20').status,'fail');
  assert.equal(versionCheck(undefined,'>=20').status,'fail');
  assert.equal(versionCheck('v22.17.0',undefined).status,'warn');
  assert.equal(versionCheck('v22.17.0','banana').status,'warn');
});
test('scan detects Next.js, filters invalid scripts and reports missing dependencies', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'veyra-launch-test-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:'demo',engines:{node:'>=20'},dependencies:{next:'15'},scripts:{dev:'next dev',bad:4},packageManager:'pnpm@9.0.0'}));
  const result = await scanProject(dir,{node:'v22.17.0',pnpm:'9.0.0'});
  assert.equal(result.framework,'Next.js'); assert.equal(result.manager,'pnpm');
  assert.deepEqual(result.scripts,{dev:'next dev'});
  assert.ok(result.checks.some(c => c.title === 'Dependencies may need installation'));
  await fs.mkdir(path.join(dir,'node_modules'));
  assert.ok((await scanProject(dir,{})).checks.some(c => c.title === 'Dependency installation marker found'));
  await fs.writeFile(path.join(dir,'package.json'),'null');
  await assert.rejects(scanProject(dir,{}),/JSON object/);
  await fs.writeFile(path.join(dir,'package.json'),'{broken');
  await assert.rejects(scanProject(dir,{}),SyntaxError);
});
test('port probe recognizes real listeners and validates input', async t => {
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.match(await portStatus(server.address().port),/accepts TCP/);
  await assert.rejects(portStatus(0),/1 to 65535/);
});
test('error explanations are specific and unknown failures stay unknown', () => {
  assert.match(explainError('listen EADDRINUSE'),/port/i);
  assert.match(explainError('pnpm: command not found'),/PATH/);
  assert.match(explainError('ERR_MODULE_NOT_FOUND'),/import path/);
  assert.match(explainError('EBADENGINE'),/Node/);
  assert.match(explainError('something else'),/No supported error pattern/);
});
