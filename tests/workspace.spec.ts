import { test, expect } from "@playwright/test";
test.beforeEach(async ({page})=>{
  await page.addInitScript(()=>{
    const files: Record<string,string> = {
      "src/App.tsx": 'export const greeting: string = "Hello Veyra";\n',
      "src/theme.css": ':root { color: #bada55; }\n',
      "README.md": '# Example project\nWelcome to Veyra.\n',
      "package.json": '{"name":"studio-project","version":"1.0.0"}\n',
    };
    const calls: {cmd:string;args:Record<string,unknown>}[]=[];
    Object.assign(window,{testFiles:files,testCalls:calls,__TAURI_INTERNALS__:{
      transformCallback:()=>1, unregisterCallback:()=>{},
      invoke:async(cmd:string,args:Record<string,any>={})=>{
        calls.push({cmd,args});
        if(cmd==="choose_folder")return "/tmp/studio-project";
        if(cmd==="list_directory")return args.path==="src"?[
          {path:"src/App.tsx",name:"App.tsx",directory:false},{path:"src/theme.css",name:"theme.css",directory:false}
        ]: [{path:"src",name:"src",directory:true},...Object.keys(files).filter(p=>!p.includes("/")).map(path=>({path,name:path,directory:false}))];
        if(cmd==="project_files")return Object.keys(files);
        if(cmd==="read_file"){if(!(args.path in files))throw "Not found";return files[args.path];}
        if(cmd==="save_file"){if(files[args.path]!==args.original)throw "File changed on disk";files[args.path]=args.content;return;}
        if(cmd==="create_entry"){if(files[args.path])throw "Already exists";files[args.path]="";return;}
        if(cmd==="search_workspace")return Object.entries(files).flatMap(([path,text])=>text.split("\n").flatMap((line,i)=>line.toLowerCase().includes(args.query.toLowerCase())?[{path,line:i+1,text:line}]:[]));
        if(cmd==="git_status")return "## main\n M src/App.tsx\n";
        if(cmd==="git_diff")return "- old\n+ new";
        if(cmd==="plugin:event|listen")return 1;
        return null;
      }
    },__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}});
  });
});
test("offline editor, tab retention, save, close protection, search and settings",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Room to create."})).toBeVisible();
  await page.screenshot({path:"test-results/welcome.png"});
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.locator('.tree-row[title="src/App.tsx"]').click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await page.locator(".monaco-editor textarea").first().focus();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("\n// retained edit");
  await expect(page.locator(".status-ready")).toContainText("1 unsaved");
  await page.locator('.tree-row[title="README.md"]').click();
  await page.getByRole("tab",{name:"App.tsx"}).click();
  await expect(page.locator(".view-lines").first()).toContainText("retained edit");
  await page.keyboard.press("Meta+s");
  await expect(page.locator(".status-ready")).toContainText("All saved");
  expect(await page.evaluate(()=>(window as any).testFiles["src/App.tsx"])).toContain("retained edit");
  await page.locator(".monaco-editor textarea").first().focus();
  await page.keyboard.type(" unsaved");
  await page.getByRole("button",{name:"Close src/App.tsx",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Close App.tsx?"})).toBeVisible();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("button",{name:"Search workspace · ⇧⌘F"}).click();
  await page.getByPlaceholder("Search in files…").fill("Veyra");
  await expect(page.locator(".search-results button")).toHaveCount(2);
  await page.getByRole("button",{name:"Settings · ⌘,"}).click();
  await page.getByRole("button",{name:"Appearance",exact:true}).click();
  await expect(page.locator(".app")).toHaveClass(/light/);
  await page.getByRole("button",{name:"Appearance",exact:true}).click();
  await page.getByRole("button",{name:"Explorer",exact:true}).click();
  await page.screenshot({path:"test-results/editor.png"});
  expect(errors).toEqual([]);
});
test("file creation, command palette and responsive layout",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.getByTitle("New file · ⌘N").click();
  await page.getByRole("textbox",{name:"New file",exact:true}).fill("notes.md");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.getByRole("tab",{name:"notes.md"})).toBeVisible();
  await page.keyboard.press("Meta+p");
  await page.getByRole("textbox",{name:"Search commands or files"}).fill("README");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab",{name:"README.md"})).toBeVisible();
  await page.setViewportSize({width:700,height:500});
  await page.screenshot({path:"test-results/compact.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(700);
  await expect(page.locator(".monaco-pane")).toBeVisible();
  await page.keyboard.press("Meta+b");
  await expect(page.locator(".sidebar")).toHaveCount(0);
});
