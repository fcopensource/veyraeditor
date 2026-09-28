import {test,expect,type Page} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const files:Record<string,string>={'hello.ts':'export const greeting = "hello";\n','README.md':'# Demo\n'};
    const calls:{cmd:string;args:any}[]=[];let pending:((value:string)=>void)|null=null;
    Object.assign(window,{aiCalls:calls,aiFiles:files,delayAI:false,finishAI:()=>pending?.('```typescript\nexport const greeting = "updated";\n```'),__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string,args:any={})=>{
      calls.push({cmd,args});
      if(cmd==='ai_models')return args.config.kind==='ollama'?['qwen2.5-coder:3b','local-second:1b']:['provider/chat-model'];
      if(cmd==='ai_chat'){if((window as any).delayAI)return new Promise<string>(resolve=>{pending=resolve;});return 'Here is the improvement.\n```typescript\nexport const greeting = "updated";\n```';}
      if(cmd==='ai_cancel'){pending?.('Stopped');return;}
      if(cmd==='choose_folder')return '/tmp/ai-test';
      if(cmd==='list_directory')return Object.keys(files).map(path=>({path,name:path,directory:false}));
      if(cmd==='project_files')return Object.keys(files);
      if(cmd==='read_file')return files[args.path];
      if(cmd==='save_file'){files[args.path]=args.content;return;}
      if(cmd==='git_status')return '## main';
      if(cmd==='plugin:event|listen')return 1;
      return null;
    }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}});
  });
});
async function openFile(page:Page){await page.goto('/');await expect(page.getByLabel('AI model',{exact:true})).toHaveValue('qwen2.5-coder:3b');await page.getByRole('button',{name:/Open a project/}).click();await page.locator('.tree-row[title="hello.ts"]').click();}
test('AI edits require review, apply only to buffer, and undo works',async({page})=>{
  await openFile(page);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('AI attachment').selectOption('file');
  await page.getByLabel('Ask Veyra AI').fill('Update the greeting');await page.getByRole('button',{name:'Send to AI'}).click();
  await page.getByRole('button',{name:'Review proposed edit'}).click();
  await expect(page.getByRole('dialog',{name:'Review AI edit'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).aiFiles['hello.ts'])).toContain('"hello"');
  await page.getByRole('button',{name:'Apply edit',exact:true}).click();
  await expect(page.locator('.monaco-pane .view-lines')).toContainText('updated');await expect(page.locator('.status-ready')).toContainText('1 unsaved');
  expect(await page.evaluate(()=>(window as any).aiFiles['hello.ts'])).toContain('"hello"');
  await page.screenshot({path:'test-results/ai-studio.png'});
  await page.locator('.monaco-pane textarea').focus();await page.keyboard.press('Meta+z');await expect(page.locator('.monaco-pane .view-lines')).toContainText('"hello"');
});
test('stale AI proposal cannot replace newer user edits',async({page})=>{
  await openFile(page);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('AI attachment').selectOption('file');await page.getByLabel('Ask Veyra AI').fill('Update the greeting');await page.getByRole('button',{name:'Send to AI'}).click();await expect(page.getByRole('button',{name:'Review proposed edit'})).toBeVisible();
  await page.locator('.monaco-pane textarea').focus();await page.keyboard.press('Meta+End');await page.keyboard.type('// my work');
  await page.getByRole('button',{name:'Review proposed edit'}).click();await page.getByRole('button',{name:'Apply edit',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed after this request');
  await page.getByRole('button',{name:'Discard',exact:true}).click();await expect(page.locator('.monaco-pane .view-lines')).toContainText('my work');
});
test('provider switching clears chat and API keys never enter local storage',async({page})=>{
  await openFile(page);await page.getByLabel('Ask Veyra AI').fill('Explain functions');await page.getByRole('button',{name:'Send to AI'}).click();await expect(page.locator('.ai-message.assistant')).toBeVisible();
  const content=await page.evaluate(()=>(window as any).aiCalls.find((c:any)=>c.cmd==='ai_chat').args.messages);expect(JSON.stringify(content)).not.toContain('export const');
  await page.getByLabel('AI provider').selectOption('openai');await expect(page.locator('.ai-message')).toHaveCount(0);
  await page.getByLabel('AI API key').fill('test-session-secret');await page.getByRole('button',{name:'Connect provider'}).click();await expect(page.getByLabel('AI API key')).toHaveValue('');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-session-secret');
  await page.getByLabel('AI model',{exact:true}).selectOption('provider/chat-model');await page.getByLabel('Ask Veyra AI').fill('Hello');await page.getByRole('button',{name:'Send to AI'}).click();await expect(page.locator('.ai-message.assistant')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).aiCalls.filter((c:any)=>c.cmd==='ai_chat').at(-1).args.config.kind)).toBe('openai');
});
test('new chat cancels pending request and discards late response; compact panel closes',async({page})=>{
  await openFile(page);await page.evaluate(()=>{(window as any).delayAI=true;});await page.getByLabel('Ask Veyra AI').fill('Explain this');await page.getByRole('button',{name:'Send to AI'}).click();await expect(page.getByRole('button',{name:'Stop AI request'})).toBeVisible();
  await page.getByRole('button',{name:'New AI chat'}).click();await expect(page.locator('.ai-message')).toHaveCount(0);await page.evaluate(()=>(window as any).finishAI());await expect(page.locator('.ai-message')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).aiCalls.some((c:any)=>c.cmd==='ai_cancel'))).toBe(true);
  await page.setViewportSize({width:700,height:500});await page.getByRole('button',{name:'Close AI',exact:true}).click();await expect(page.getByRole('complementary',{name:'AI assistant'})).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(700);
});
