import {expect,test} from '@playwright/test';

test('sustained editing and background disk checks remain responsive',async({page})=>{
  await page.addInitScript(()=>{
    const files:Record<string,string>={'src/main.ts':'export const ready = true;\n'};
    const calls:{cmd:string;at:number}[]=[];
    Object.assign(window,{stabilityCalls:calls,__TAURI_INTERNALS__:{transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string,args:any={})=>{
      calls.push({cmd,at:performance.now()});
      if(cmd==='choose_folder')return '/tmp/stability-project';
      if(cmd==='list_directory')return args.path==='src'?[{path:'src/main.ts',name:'main.ts',directory:false}]:[{path:'src',name:'src',directory:true}];
      if(cmd==='project_files')return Object.keys(files);
      if(cmd==='read_file')return files[args.path];
      if(cmd==='save_file'){files[args.path]=args.content;return;}
      if(cmd==='git_status')return '## main\n';
      if(cmd==='plugin:event|listen')return 1;
      if(cmd==='ai_models')throw new Error('AI disabled in stability test');
      return null;
    }},__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Open a project',exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.locator('.tree-row[title="src/main.ts"]').click();
  const input=page.locator('.monaco-editor textarea').first();
  await input.focus();
  await page.keyboard.press('Meta+End');
  const started=Date.now();
  await page.keyboard.insertText('\n'+Array.from({length:250},(_,index)=>`const value${index} = ${index};`).join('\n'));
  expect(Date.now()-started).toBeLessThan(3000);
  await expect(page.locator('.status-ready')).toContainText('1 unsaved');

  // Allow one complete background-check interval, then verify the UI still reacts.
  await page.waitForTimeout(8500);
  const interaction=Date.now();
  await page.getByRole('button',{name:'Settings · ⌘,'}).click();
  await expect(page.getByRole('heading',{name:'Make it yours'})).toBeVisible();
  expect(Date.now()-interaction).toBeLessThan(1500);
  const reads=await page.evaluate(()=>(window as any).stabilityCalls.filter((call:any)=>call.cmd==='read_file').length);
  expect(reads).toBeLessThanOrEqual(3);
});
