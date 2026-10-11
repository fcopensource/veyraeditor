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
  await page.getByRole('button',{name:'Install Studio Tools',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Studio Tools installed');
  // The installed extension opens as a page tab with a "Set Colour Theme" action, like VS Code.
  await page.locator('.ext-section').first().getByRole('button',{name:'Studio Tools',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Extension: Studio Tools'})).toBeVisible();
  await page.locator('.ext-page').getByRole('button',{name:'Set Colour Theme'}).click();
  await expect(page.locator('main.app')).toHaveCSS('background-color','rgb(16, 32, 48)');
  await expect(page.locator('.ext-page').getByRole('button',{name:'Colour theme applied'})).toBeDisabled();
  await page.getByRole('button',{name:'Close Extension: Studio Tools'}).click();
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
  await page.reload();await page.getByRole('button',{name:'Extensions',exact:true}).click();
  await expect(page.getByText('1 themes · 1 snippets · Enabled')).toBeVisible();
  await page.getByRole('button',{name:'Disable Studio Tools',exact:true}).click();await expect(page.getByLabel('Extension editor theme')).toHaveCount(0);
  await page.getByRole('button',{name:'Enable Studio Tools',exact:true}).click();await page.getByRole('button',{name:'Uninstall Studio Tools',exact:true}).click();
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
      if(cmd==='lsp_status')return {node:'v22.16.0',npm:true,dir:'C:/tools',tools:['typescript','eslint','prettier','tailwind','emmet','svelte','vue','python'].map(key=>({key,installed:!!installed[key],version:installed[key]||''}))};
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
  const eslintRow=page.locator('.ext-row').filter({hasText:'Integrates ESLint'});
  await expect(eslintRow.getByText('Built into Veyra')).toBeVisible();
  await eslintRow.getByRole('button',{name:'Install ESLint',exact:true}).click();
  await expect(page.locator('.extension-notice')).toContainText('ESLint is built into Veyra: installed ESLint');
  expect(await page.evaluate(()=>(window as any).toolCalls)).toEqual(expect.arrayContaining(['lsp_install:prettier','lsp_install:eslint']));
  await expect(page.locator('.ext-section').first().getByRole('button',{name:'Uninstall ESLint'})).toBeVisible();
});

test('extension pages open as editor tabs with details, features, versions and real icons',async({page})=>{
  await page.addInitScript(()=>Object.assign(window,{__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string)=>{
    if(cmd==='lsp_status')return {node:'v22.16.0',npm:true,dir:'C:/tools',tools:[]};
    if(cmd==='plugin:event|listen')return 1;return null;
  }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}}));
  const icon='https://open-vsx.org/api/test/studio/1.0.0/file/icon.png';
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  await page.route('https://open-vsx.org/api/**',async route=>{
    const url=route.request().url();
    if(url.includes('/-/search'))return route.fulfill({json:{extensions:[{namespace:'test',name:'studio',version:'1.0.0',displayName:'Studio Tools',description:'Themes and snippets',downloadCount:1234567,averageRating:4.5,verified:true,files:{icon}}]}});
    if(url===icon)return route.fulfill({body:png,contentType:'image/png'});
    if(url.endsWith('/README.md'))return route.fulfill({body:'# Studio Tools\n\nMakes [Veyra](https://veyraeditor.com) beautiful.',contentType:'text/markdown'});
    if(url.endsWith('/package.json'))return route.fulfill({json:{publisher:'test',name:'studio',contributes:{themes:[{label:'Studio Mint',uiTheme:'vs-dark',path:'theme.json'}],snippets:[{language:'typescript',path:'snippets.json'}],commands:[{command:'studio.hello',title:'Say hello'}]}}});
    if(url.endsWith('.vsix'))return route.fulfill({body:Buffer.from(packageBytes),contentType:'application/octet-stream'});
    const files={download:'https://open-vsx.org/api/test/studio/package.vsix',icon,readme:'https://open-vsx.org/api/test/studio/1.0.0/file/README.md',manifest:'https://open-vsx.org/api/test/studio/1.0.0/file/package.json'};
    return route.fulfill({json:{namespace:'test',name:'studio',version:'1.0.0',displayName:'Studio Tools',description:'Themes and snippets',verified:true,downloadCount:1234567,averageRating:4.5,reviewCount:8,license:'MIT',categories:['Themes'],timestamp:'2026-10-01T00:00:00Z',files,allVersions:{latest:'x','1.0.0':'x','0.9.0':'x'}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Extensions',exact:true}).click();
  const row=page.locator('.ext-row').filter({hasText:'Themes and snippets'});
  await expect(row.locator('img.ext-icon')).toBeVisible();
  await expect(row).toContainText('1.2M');
  await row.click();
  // The page opens as a tab and shows the README, publisher, downloads and rating.
  await expect(page.getByRole('tab',{name:'Extension: Studio Tools'})).toHaveAttribute('aria-selected','true');
  const extensionPage=page.locator('.ext-page');
  await expect(extensionPage.locator('.ext-hero h1')).toHaveText('Studio Tools');
  await expect(extensionPage.locator('.ext-markdown')).toContainText('Makes Veyra beautiful');
  await expect(extensionPage).toContainText('1.2M downloads');
  await expect(extensionPage.locator('.ext-hero img.ext-icon')).toBeVisible();
  // Features lists what the extension contributes and what works in Veyra.
  await extensionPage.getByRole('tab',{name:'Features'}).click();
  await expect(extensionPage.locator('.ext-features')).toContainText('Colour themes');
  await expect(extensionPage.locator('.ext-features')).toContainText('Say hello');
  // Versions: install an older version, then the page offers the update.
  await extensionPage.getByRole('tab',{name:/Versions/}).click();
  await expect(extensionPage.locator('.ext-version-row')).toHaveCount(2);
  await extensionPage.getByRole('button',{name:'Install',exact:true}).click();
  await expect(extensionPage.getByRole('status')).toContainText('Studio Tools installed');
  await expect(extensionPage.getByRole('button',{name:'Uninstall'})).toBeVisible();
  await expect(extensionPage.getByRole('button',{name:'Reinstall'})).toBeVisible();
  // Opening a file returns to the editor; the page tab stays available.
  await page.getByRole('tab',{name:'Extension: Studio Tools'}).click({button:'middle'});
  await expect(page.getByRole('tab',{name:'Extension: Studio Tools'})).toHaveCount(0);
  await page.screenshot({path:'test-results/extension-page.png'});
});

test('an extension that runs its own code explains itself and offers the built-in alternative instead of failing',async({page})=>{
  await page.addInitScript(()=>Object.assign(window,{__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string)=>{
    if(cmd==='lsp_status')return {node:'v22.16.0',npm:true,dir:'C:/tools',tools:[]};
    if(cmd==='plugin:event|listen')return 1;return null;
  }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}}));
  let vsixRequested=false;
  await page.route('https://open-vsx.org/api/**',async route=>{
    const url=route.request().url();
    if(url.includes('/-/search'))return route.fulfill({json:{extensions:[{namespace:'ms-toolsai',name:'jupyter',version:'2026.1.0',displayName:'Jupyter',description:'Jupyter notebook support for VS Code.',downloadCount:9000000}]}});
    if(url.endsWith('/package.json'))return route.fulfill({json:{publisher:'ms-toolsai',name:'jupyter',main:'./dist/extension.node.js',contributes:{notebooks:[{type:'jupyter-notebook'}]}}});
    if(url.endsWith('.vsix')){vsixRequested=true;return route.abort();}
    return route.fulfill({json:{namespace:'ms-toolsai',name:'jupyter',version:'2026.1.0',displayName:'Jupyter',description:'Jupyter notebooks',files:{manifest:'https://open-vsx.org/api/ms-toolsai/jupyter/2026.1.0/file/package.json',download:'https://open-vsx.org/api/ms-toolsai/jupyter/x.vsix'}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Extensions',exact:true}).click();
  await page.getByRole('button',{name:'Install Jupyter',exact:true}).click();
  // A friendly explanation (not an error), with the Python alternative, and the extension's page opens.
  await expect(page.locator('.extensions-panel .extension-notice')).toContainText("can't be installed yet");
  await expect(page.locator('.extensions-panel .extension-notice')).toContainText('Python (Pyright)');
  await expect(page.locator('.extensions-panel [role=alert]')).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Extension: Jupyter'})).toBeVisible();
  expect(vsixRequested,'nothing was downloaded').toBe(false);
  // The page offers the built-in Python tool, which opens its own page.
  await page.locator('.ext-page').getByRole('button',{name:/built-in Python \(Pyright\) tool/}).click();
  await expect(page.getByRole('tab',{name:'Extension: Python (Pyright)'})).toBeVisible();
});

test('Python Debugger and Claude Code from the marketplace are built into Veyra',async({page})=>{
  await page.addInitScript(()=>Object.assign(window,{dapInstalls:0,__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string)=>{
    if(cmd==='lsp_status')return {node:'v22.16.0',npm:true,dir:'C:/tools',tools:[]};
    if(cmd==='dap_status')return {python:{path:'C:/Python312/python.exe',version:'3.12.10'},debugpy:(window as any).dapInstalls?'1.8.22':''};
    if(cmd==='dap_install'){(window as any).dapInstalls++;return '1.8.22';}
    if(cmd==='claude_code_status')return {installed:false,version:'',path:''};
    if(cmd==='plugin:event|listen')return 1;return null;
  }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}}));
  await page.route('https://open-vsx.org/api/**',route=>route.fulfill({json:{extensions:[
    {namespace:'ms-python',name:'debugpy',version:'2026.6.0',displayName:'Python Debugger',description:'Python debugger (debugpy) extension for VS Code.',downloadCount:61000000},
    {namespace:'anthropic',name:'claude-code',version:'2.1.296',displayName:'Claude Code for VS Code',description:'Harness the power of Claude Code without leaving your IDE',downloadCount:57000000},
  ]}}));
  await page.goto('/');await page.getByRole('button',{name:'Extensions',exact:true}).click();
  const debugRow=page.locator('.ext-row').filter({hasText:'Python debugger (debugpy)'});
  await expect(debugRow.getByText('Built into Veyra')).toBeVisible();
  await debugRow.getByRole('button',{name:'Install Python Debugger',exact:true}).click();
  await expect(page.locator('.extension-notice')).toContainText('Python Debugger is built into Veyra');
  expect(await page.evaluate(()=>(window as any).dapInstalls)).toBe(1);
  const claudeRow=page.locator('.ext-row').filter({hasText:'Harness the power of Claude Code'});
  await expect(claudeRow.getByText('Built into Veyra')).toBeVisible();
  await claudeRow.click();
  await expect(page.getByRole('tab',{name:'Extension: Claude Code for VS Code'})).toBeVisible();
  await page.locator('.ext-page').getByRole('button',{name:'Install Claude Code'}).click();
  await expect(page.getByRole('tab',{name:'Extension: Claude Code',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.ext-page')).toContainText('Claude Pro, Max, Team, Enterprise or Console');
});
