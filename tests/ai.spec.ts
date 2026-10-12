import {test,expect,type Page} from '@playwright/test';
test.beforeEach(async({page},testInfo)=>{
  // Signed in with free requests left, except in the sign-in test, which starts signed out.
  if(!testInfo.title.includes('sign in'))await page.addInitScript(()=>{(window as any).veyraAccount={name:'Ada Lovelace',email:'ada@example.com',used:0,limit:10,available:true};});
  await page.addInitScript(()=>{
    const files:Record<string,string>={'hello.ts':'export const greeting = "hello";\n','README.md':'# Demo\n'};
    const calls:{cmd:string;args:any}[]=[];let pending:((value:string)=>void)|null=null;
    Object.assign(window,{aiCalls:calls,aiFiles:files,delayAI:false,finishAI:()=>pending?.('```typescript\nexport const greeting = "updated";\n```'),__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string,args:any={})=>{
      calls.push({cmd,args});
      const account=(window as any).veyraAccount;
      if(cmd==='veyra_account')return account?{...account}:null;
      if(cmd==='veyra_sign_in'){if(args.password!=='Strong#Pass1')throw 'That email and password do not match.';(window as any).veyraAccount={name:'Ada Lovelace',email:args.email,used:0,limit:10,available:true};return {...(window as any).veyraAccount};}
      if(cmd==='veyra_sign_out'){(window as any).veyraAccount=null;return;}
      if(cmd==='ai_chat'){
        if(account&&account.used>=account.limit)throw 'You have used all 10 free Veyra AI requests for your account.';
        if(account)account.used++;
        if((window as any).delayAI)return new Promise<string>(resolve=>{pending=resolve;});
        return 'Here is the improvement.\n```typescript\nexport const greeting = "updated";\n```';
      }
      if(cmd==='ai_cancel'){pending?.('Stopped');return;}
      if(cmd==='ai_workspace_context')return [{path:'hello.ts',content:files['hello.ts'],score:42},{path:'README.md',content:files['README.md'],score:8}];
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
async function openFile(page:Page){await page.goto('/');await expect(page.locator('.veyra-account')).toContainText('10 of 10 free requests left');await page.getByRole('button',{name:/Open a project/}).click();await page.locator('.tree-row[title="hello.ts"]').click();}
const send=(page:Page)=>page.getByLabel('Ask Veyra AI').press(process.platform==='darwin'?'Meta+Enter':'Control+Enter');

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
test('Veyra AI is the only AI: no providers, models or API keys, and only attached code is sent',async({page})=>{
  await openFile(page);
  for(const label of ['AI provider','AI model','AI API key','Model settings'])await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
  await expect(page.locator('.ai-model-name')).toContainText('Veyra AI · 10 left');
  await page.getByLabel('Ask Veyra AI').fill('Explain functions');await page.getByRole('button',{name:'Send to AI'}).click();await expect(page.locator('.ai-message.assistant')).toBeVisible();
  const chat=await page.evaluate(()=>(window as any).aiCalls.find((c:any)=>c.cmd==='ai_chat').args);
  expect(Object.keys(chat).sort()).toEqual(['id','messages']);
  expect(JSON.stringify(chat.messages)).not.toContain('export const');
  // The allowance shown is refreshed from the server after each answer.
  await expect(page.locator('.veyra-account')).toContainText('9 of 10 free requests left');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toMatch(/veyra\.ai\.settings|vey_/);
});
test('Veyra AI: once the 10 free requests are used, sending explains it instead of failing',async({page})=>{
  await page.addInitScript(()=>{(window as any).veyraAccount.used=9;});
  await page.goto('/');
  await expect(page.locator('.veyra-account')).toContainText('1 of 10 free requests left');
  await page.getByLabel('Ask Veyra AI').fill('One more question');await send(page);
  await expect(page.locator('.ai-message.assistant')).toBeVisible();
  await expect(page.locator('.veyra-account')).toContainText('0 of 10 free requests left');
  await page.getByLabel('Ask Veyra AI').fill('And another');
  await expect(page.getByRole('button',{name:'Send to AI'})).toBeDisabled();
  await expect(page.locator('.ai-transmission')).toContainText("You've used all 10 free Veyra AI requests.");
  await send(page);
  await expect(page.locator('.ai-error')).toContainText("You've used all 10 free Veyra AI requests.");
  expect(await page.evaluate(()=>(window as any).aiCalls.filter((c:any)=>c.cmd==='ai_chat').length)).toBe(1);
});
test('new chat cancels pending request and discards late response; compact panel closes',async({page})=>{
  await openFile(page);await page.evaluate(()=>{(window as any).delayAI=true;});await page.getByLabel('Ask Veyra AI').fill('Explain this');await page.getByRole('button',{name:'Send to AI'}).click();await expect(page.getByRole('button',{name:'Stop AI request'})).toBeVisible();
  await page.getByRole('button',{name:'New AI chat'}).click();await expect(page.locator('.ai-message')).toHaveCount(0);await page.evaluate(()=>(window as any).finishAI());await expect(page.locator('.ai-message')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).aiCalls.some((c:any)=>c.cmd==='ai_cancel'))).toBe(true);
  await page.setViewportSize({width:700,height:500});await page.getByRole('button',{name:'Close AI',exact:true}).click();await expect(page.getByRole('complementary',{name:'AI assistant'})).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(700);
});
test('smart workspace context retrieves relevant files and discloses what is sent',async({page})=>{
  await openFile(page);
  await page.getByLabel('AI attachment').selectOption('workspace');
  await page.getByLabel('Ask Veyra AI').fill('How is the greeting documented?');
  await page.getByRole('button',{name:'Send to AI'}).click();
  await expect(page.locator('.ai-message.user')).toContainText('Smart context · hello.ts, README.md');
  const calls=await page.evaluate(()=>(window as any).aiCalls);
  const contextCall=calls.find((call:any)=>call.cmd==='ai_workspace_context');
  expect(contextCall.args).toEqual({query:'How is the greeting documented?',active:'hello.ts'});
  const sent=JSON.stringify(calls.find((call:any)=>call.cmd==='ai_chat').args.messages);
  expect(sent).toContain('<file path=\\"hello.ts\\">');
  expect(sent).toContain('# Demo');
});

test('Veyra AI: sign in with a Veyra account, chat without an API key, see free requests, sign out',async({page})=>{
  await page.goto('/');
  // Signed-out users are asked to sign in, never for an API key.
  await expect(page.getByRole('button',{name:'Sign in to Veyra AI'})).toBeVisible();
  await expect(page.getByLabel('AI API key')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Send to AI'})).toBeDisabled();
  await page.getByLabel('Veyra account email').fill('ada@example.com');
  await page.getByLabel('Veyra account password').fill('wrong-password');
  await page.getByRole('button',{name:'Sign in to Veyra AI'}).click();
  await expect(page.locator('.ai-error')).toContainText('do not match');
  await page.getByLabel('Veyra account password').fill('Strong#Pass1');
  await page.getByRole('button',{name:'Sign in to Veyra AI'}).click();
  await expect(page.locator('.veyra-account')).toContainText('Ada Lovelace');
  await expect(page.locator('.veyra-account')).toContainText('10 of 10 free requests left');
  await page.getByPlaceholder(/Ask anything/).fill('Hello');
  await send(page);
  await expect(page.locator('.ai-message.assistant')).toContainText('Here is the improvement');
  await expect(page.locator('.veyra-account')).toContainText('9 of 10 free requests left');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('Strong#Pass1');
  await page.getByRole('button',{name:'Sign out of Veyra AI'}).click();
  await expect(page.getByRole('button',{name:'Sign in to Veyra AI'})).toBeVisible();
});
test('Veyra AI: attaching a secrets file needs a second, deliberate Send',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{(window as any).aiFiles['.env']='OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD\n';});
  await page.getByRole('button',{name:/Open a project/}).click();
  await page.locator('.tree-row[title=".env"]').click();
  await expect(page.locator('.veyra-account')).toBeVisible();
  await page.getByRole('button',{name:/Understand this file/}).click();
  await send(page);
  await expect(page.locator('.ai-error')).toContainText('looks like it contains secrets');
  expect(await page.evaluate(()=>(window as any).aiCalls.some((call:any)=>call.cmd==='ai_chat'))).toBe(false);
  // A second Send is the explicit opt-in.
  await send(page);
  await expect(page.locator('.ai-message.assistant')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).aiCalls.some((call:any)=>call.cmd==='ai_chat'))).toBe(true);
});
