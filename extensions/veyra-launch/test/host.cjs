const assert = require('node:assert/strict');
const vscode = require('vscode');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('veyra-local.veyra-launch');
  assert.ok(extension, 'Extension is discoverable');
  await extension.activate();
  assert.ok(extension.isActive, 'Extension activated');
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['scan','run','install','port','explain','report']) assert.ok(commands.includes(`veyraLaunch.${name}`), `${name} registered`);
  await vscode.commands.executeCommand('veyraLaunch.scan');
  await vscode.commands.executeCommand('veyraLaunch.report');
  console.log('VEYRA_HOST_TEST_PASS: activation, six commands, project scan and report');
};
