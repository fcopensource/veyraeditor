import {test,expect} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';

const packageBytes=zipSync({
  'extension/package.json':strToU8(JSON.stringify({publisher:'test',name:'studio',version:'1.0.0',displayName:'Studio Tools',contributes:{themes:[{label:'Studio Mint',uiTheme:'vs-dark',path:'theme.json'}],snippets:[{language:'typescript',path:'snippets.json'}]}})),
  'extension/theme.json':strToU8('{"colors":{"editor.background":"#102030"},"tokenColors":[]}'),
  'extension/snippets.json':strToU8(JSON.stringify({Greeting:{prefix:'greet',body:'console.log("${1:hello}");',description:'Greeting snippet'}})),
});
test('download, activate, persist, disable and uninstall an extension',async({page})=>{
  await page.addInitScript(()=>Object.assign(window,{__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string)=>{
    if(cmd==='choose_folder')return '/tmp/theme-test';
    if(cmd==='list_directory')return [{path:'sample.ts',name:'sample.ts',directory:false}];
    if(cmd==='project_files')return ['sample.ts'];
    if(cmd==='read_file')return 'const hello = "world";';
    if(cmd==='git_status')return '';
    if(cmd==='plugin:event|listen')return 1;return null;
  }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}}));
  await page.route('https://open-vsx.org/api/**',async route=>{
    const url=route.request().url();
    if(url.includes('/-/search'))return route.fulfill({json:{extensions:[{namespace:'test',name:'studio',version:'1.0.0',displayName:'Studio Tools',downloadCount:42}]}});
    if(url.endsWith('.vsix'))return route.fulfill({body:Buffer.from(packageBytes),contentType:'application/octet-stream'});
    return route.fulfill({json:{files:{download:'https://open-vsx.org/api/test/studio/package.vsix'}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Extensions',exact:true}).click();
  await page.getByRole('button',{name:'Install',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Studio Tools installed');
  await page.getByRole('button',{name:/Installed 1/}).click();
  await page.getByRole('button',{name:'Apply Studio Mint',exact:true}).click();
  await expect(page.locator('main.app')).toHaveCSS('background-color','rgb(16, 32, 48)');
  await expect(page.getByRole('button',{name:'Applied Studio Mint',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Extension editor theme')).toHaveValue('ext-746573742e73747564696f-0');
  await page.getByRole('button',{name:/Open a project/}).click();
  await page.getByRole('button',{name:'Explorer',exact:true}).click();
  await page.getByRole('button',{name:'TS sample.ts',exact:true}).click();
  await expect(page.locator('.monaco-pane .monaco-editor').first()).toHaveCSS('background-color','rgb(16, 32, 48)');
  await page.evaluate(async()=>{
    const {monaco}=await import('/src/editor.ts' /* @vite-ignore */);
    const host=document.createElement('div');host.id='snippet-test';host.style.cssText='position:fixed;right:0;top:100px;width:700px;height:400px;z-index:100';document.body.appendChild(host);
    const model=monaco.editor.createModel('gre','typescript');
    const editor=monaco.editor.create(host,{model,theme:'ext-746573742e73747564696f-0'});
    editor.setPosition({lineNumber:1,column:4});
    editor.focus();
    editor.trigger('test','editor.action.triggerSuggest',{});
    Object.assign(window,{snippetTestEditor:editor});
  });
  // On a cold start Monaco's TypeScript worker may still be loading, leaving the first suggest list on "Loading…"; ask again until it answers.
  await expect(async()=>{
    await page.evaluate(()=>{const editor=(window as any).snippetTestEditor;editor.trigger('test','hideSuggestWidget',{});editor.focus();editor.trigger('test','editor.action.triggerSuggest',{});});
    await expect(page.locator('#snippet-test .suggest-widget')).toContainText('greet',{timeout:3000});
  }).toPass({timeout:30000});
  await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>(window as any).snippetTestEditor.getValue())).toBe('console.log("hello");');
  await expect(page.locator('#snippet-test .monaco-editor').first()).toHaveCSS('background-color','rgb(16, 32, 48)');
  await page.reload();await page.getByRole('button',{name:'Extensions',exact:true}).click();await page.getByRole('button',{name:/Installed 1/}).click();
  await expect(page.getByText('1 themes · 1 snippets · Enabled')).toBeVisible();
  await page.getByRole('button',{name:'Disable',exact:true}).click();await expect(page.getByLabel('Extension editor theme')).toHaveValue('');
  await page.getByRole('button',{name:'Enable',exact:true}).click();await page.getByRole('button',{name:'Uninstall',exact:true}).click();
  await expect(page.getByText('Your installed extensions will appear here.')).toBeVisible();
});
test('VSIX import accepts snippets and rejects unsupported packages without persisting them',async({page})=>{
  await page.route('https://open-vsx.org/api/**',route=>route.fulfill({json:{extensions:[]}}));
  await page.goto('/');await page.getByRole('button',{name:'Extensions',exact:true}).click();
  const unsupported=zipSync({'extension/package.json':strToU8(JSON.stringify({publisher:'test',name:'runtime',version:'1',main:'index.js'}))});
  await page.locator('input[type=file]').setInputFiles({name:'unsupported.vsix',mimeType:'application/octet-stream',buffer:Buffer.from(unsupported)});
  await expect(page.locator('.extensions-panel').getByRole('alert')).toContainText('needs the VS Code extension host');
  await page.locator('input[type=file]').setInputFiles({name:'studio.vsix',mimeType:'application/octet-stream',buffer:Buffer.from(packageBytes)});
  await expect(page.getByText('1 themes · 1 snippets · Enabled')).toBeVisible();
  await page.setViewportSize({width:700,height:500});await page.screenshot({path:'test-results/extensions-compact.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('web development tools install in one click and stand in for their VS Code extensions',async({page})=>{
  await page.addInitScript(()=>{
    const installed:Record<string,string>={};const calls:string[]=[];
    Object.assign(window,{toolCalls:calls,__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string,args:any={})=>{
      calls.push(cmd+(args.key?':'+args.key:''));
      if(cmd==='lsp_status')return {node:'v22.16.0',npm:true,dir:'C:/tools',tools:['typescript','eslint','prettier','tailwind','emmet','svelte','vue'].map(key=>({key,installed:!!installed[key],version:installed[key]||''}))};
      if(cmd==='lsp_install'){installed[args.key]='1.0.0';return '1.0.0';}
      if(cmd==='plugin:event|listen')return 1;return null;
    }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}});
  });
  await page.route('https://open-vsx.org/api/**',route=>route.fulfill({json:{extensions:[{namespace:'dbaeumer',name:'vscode-eslint',version:'3.0.10',displayName:'ESLint',description:'Integrates ESLint',downloadCount:1000}]}}));
  await page.goto('/');await page.getByRole('button',{name:'Extensions',exact:true}).click();
  await expect(page.getByText('TypeScript & JavaScript (Node.js)')).toBeVisible();
  await expect(page.getByText(/Runs on your Node.js v22/)).toBeVisible();
  // One-click install of a web tool.
  await page.getByRole('button',{name:'Install Prettier',exact:true}).click();
  await expect(page.locator('.extension-notice')).toContainText('Prettier installed');
  await expect(page.getByRole('button',{name:'Disable Prettier'})).toBeVisible();
  // A VS Code extension Veyra has built in installs the equivalent tool.
  await expect(page.locator('.extension-card').filter({hasText:'Integrates ESLint'}).getByText('Built into Veyra')).toBeVisible();
  await page.locator('.extension-card').filter({hasText:'Integrates ESLint'}).getByRole('button',{name:'Install',exact:true}).click();
  await expect(page.locator('.extension-notice')).toContainText('ESLint is built into Veyra: installed ESLint');
  expect(await page.evaluate(()=>(window as any).toolCalls)).toEqual(expect.arrayContaining(['lsp_install:prettier','lsp_install:eslint']));
  await page.getByRole('button',{name:/Installed 2/}).click();
  await expect(page.getByRole('button',{name:'Uninstall ESLint'})).toBeVisible();
});
