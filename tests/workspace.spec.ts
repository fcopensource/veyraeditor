import { test, expect } from "@playwright/test";
test.beforeEach(async ({page})=>{
  await page.addInitScript(()=>{
    const files: Record<string,string> = {
      "src/App.tsx": 'export const greeting: string = "Hello Veyra";\n',
      "src/theme.css": ':root { color: #bada55; }\n',
      "README.md": '# Example project\nWelcome to Veyra.\n',
      "package.json": '{"name":"studio-project","version":"1.0.0"}\n',
    };
    const directories = new Set(["", "src"]);
    const parent = (path:string) => path.split("/").slice(0,-1).join("/");
    const exists = (path:string) => directories.has(path) || Object.prototype.hasOwnProperty.call(files,path);
    const calls: {cmd:string;args:Record<string,unknown>}[]=[];
    let gitStatus="## main\n M src/App.tsx\n";
    Object.assign(window,{testFiles:files,testDirectories:directories,testCalls:calls,__TAURI_INTERNALS__:{
      transformCallback:()=>1, unregisterCallback:()=>{},
      invoke:async(cmd:string,args:Record<string,any>={})=>{
        calls.push({cmd,args});
        if(cmd==="choose_folder")return "/tmp/studio-project";
        if(cmd==="list_directory"){
          const path=args.path || "";
          if(!directories.has(path))throw "Folder not found";
          return [
            ...Array.from(directories).filter(entry=>entry!=="" && parent(entry)===path).map(entry=>({path:entry,name:entry.split("/").at(-1)!,directory:true})),
            ...Object.keys(files).filter(entry=>parent(entry)===path).map(entry=>({path:entry,name:entry.split("/").at(-1)!,directory:false})),
          ].sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
        }
        if(cmd==="project_files")return Object.keys(files);
        if(cmd==="read_file"){if(!(args.path in files))throw "Not found";return files[args.path];}
        if(cmd==="save_file"){if(files[args.path]!==args.original)throw "File changed on disk";files[args.path]=args.content;return;}
        if(cmd==="create_entry"){
          const path=String(args.path);
          const components=path.split("/");
          if(components.some(component=>!component || component==="." || component===".."))throw "Use a relative path inside the workspace";
          if(exists(path))throw "A file or folder already exists at "+path;
          const parents=components.slice(0,-1).map((_,index)=>components.slice(0,index+1).join("/"));
          if(parents.some(entry=>Object.prototype.hasOwnProperty.call(files,entry)))throw "A parent path is a file";
          parents.forEach(entry=>directories.add(entry));
          if(args.directory)directories.add(path);else files[path]="";
          return;
        }
        if(cmd==="rename_file"){
          const from=String(args.path),to=String(args.next);
          if(exists(to))throw "A file or folder already exists at "+to;
          if(directories.has(from)){
            const movedDirectories=Array.from(directories).filter(entry=>entry===from||entry.startsWith(from+"/"));
            const movedFiles=Object.keys(files).filter(entry=>entry.startsWith(from+"/"));
            movedDirectories.forEach(entry=>directories.delete(entry));
            movedDirectories.forEach(entry=>directories.add(to+entry.slice(from.length)));
            movedFiles.forEach(entry=>{files[to+entry.slice(from.length)]=files[entry];delete files[entry];});
          }else if(Object.prototype.hasOwnProperty.call(files,from)){files[to]=files[from];delete files[from];}
          else throw "Not found";
          return;
        }
        if(cmd==="trash_file"){
          const path=String(args.path);
          directories.delete(path);Array.from(directories).filter(entry=>entry.startsWith(path+"/")).forEach(entry=>directories.delete(entry));
          Object.keys(files).filter(entry=>entry===path||entry.startsWith(path+"/")).forEach(entry=>delete files[entry]);
          return;
        }
        if(cmd==="copy_entry"){
          const from=String(args.path),to=String(args.next);
          if(exists(to))throw "A file or folder already exists at "+to;
          if(directories.has(from)){
            directories.add(to);
            Array.from(directories).filter(entry=>entry.startsWith(from+"/")).forEach(entry=>directories.add(to+entry.slice(from.length)));
            Object.keys(files).filter(entry=>entry.startsWith(from+"/")).forEach(entry=>{files[to+entry.slice(from.length)]=files[entry];});
          }else files[to]=files[from];
          return;
        }
        if(cmd==="duplicate_entry"){
          const from=String(args.path);const dot=from.lastIndexOf('.');const slash=from.lastIndexOf('/');
          const next=dot>slash?from.slice(0,dot)+' copy'+from.slice(dot):from+' copy';
          if(directories.has(from)){directories.add(next);Object.keys(files).filter(entry=>entry.startsWith(from+"/")).forEach(entry=>{files[next+entry.slice(from.length)]=files[entry];});}
          else files[next]=files[from];
          return next;
        }
        if(cmd==="reveal_in_finder")return;
        if(cmd==="search_workspace")return Object.entries(files).flatMap(([path,text])=>text.split("\n").flatMap((line,i)=>line.toLowerCase().includes(args.query.toLowerCase())?[{path,line:i+1,text:line}]:[]));
        if(cmd==="git_status")return gitStatus;
        if(cmd==="git_diff")return "- old\n+ new";
        if(cmd==="git_log")return "abc1234\tVikram\t2 minutes ago\tBuild Veyra";
        if(cmd==="git_graph")return "abc1234\tdef5678\t (HEAD -> main, origin/main)\tVikram\t2 minutes ago\tBuild Veyra";
        if(cmd==="github_info")return {available:true,authenticated:true,login:'vikram',name:'Vikram',avatar:'',repository:'fcopensource/veyraeditor',url:'https://github.com/fcopensource/veyraeditor',visibility:'PUBLIC',default_branch:'main'};
        if(cmd==="git_stage"){gitStatus="## main\nM  src/App.tsx\n";return "";}
        if(cmd==="git_unstage"){gitStatus="## main\n M src/App.tsx\n";return "";}
        if(cmd==="git_commit"){gitStatus="## main\n";return "[main def5678] "+args.message;}
        if(cmd==="ai_complete"){(window as any).completionRequests=((window as any).completionRequests||0)+1;return "return a + b;";}
        if(cmd==="live_start")return {port:5500,url:"http://127.0.0.1:5500/",page:"http://127.0.0.1:5500/"+(args.path||"")};
        if(cmd==="live_stop")return null;
        if(cmd==="plugin:event|listen")return 1;
        return null;
      }
    },__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}}});
  });
});
test("offline editor, tab retention, save, close protection, search and settings",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>{if(e.message!=="Canceled")errors.push(e.message);});
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
  await page.getByRole("textbox",{name:"Search in files"}).fill("Veyra");
  await expect(page.locator(".search-hit")).toHaveCount(2);
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

test("selected folders create nested folders and files without collapsing the explorer",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.getByTitle("New folder",{exact:true}).click();
  await expect(page.locator(".dialog")).toContainText("Create in");
  await expect(page.locator(".dialog")).toContainText("src");
  await page.getByRole("textbox",{name:"New folder",exact:true}).fill("components");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.locator('.tree-row[title="src/components"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testDirectories.has("src/components"))).toBe(true);
  expect(await page.evaluate(()=>(window as any).testFiles["src/components"])).toBeUndefined();

  // A newly created directory is the next creation target; no re-selection needed.
  await page.getByTitle("New file · ⌘N").click();
  await expect(page.locator(".dialog")).toContainText("src/components");
  await page.getByRole("textbox",{name:"New file",exact:true}).fill("Button.tsx");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.getByRole("tab",{name:"Button.tsx"})).toBeVisible();
  await expect(page.locator('.tree-row[title="src/components/Button.tsx"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testFiles["src/components/Button.tsx"])).toBe("");
  expect(await page.evaluate(()=>(window as any).testFiles["Button.tsx"])).toBeUndefined();

  await page.getByTitle("Refresh files",{exact:true}).click();
  await expect(page.locator('.tree-row[title="src/components/Button.tsx"]')).toBeVisible();
  await expect(page.locator('.tree-row[title="src/App.tsx"]')).toBeVisible();
});

test("deep paths create missing parents and opening a file selects its parent",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.getByRole("button",{name:"New file in src",exact:true}).click();
  await page.getByRole("textbox",{name:"New file",exact:true}).fill("components/deep/Card.tsx");
  await page.screenshot({path:"test-results/create-dialog.png"});
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.locator('.tree-row[title="src/components/deep/Card.tsx"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testDirectories.has("src/components/deep"))).toBe(true);

  await page.locator('.tree-row[title="src/App.tsx"]').click();
  await page.getByTitle("New file · ⌘N").click();
  await page.getByRole("textbox",{name:"New file",exact:true}).fill("sibling.ts");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.locator('.tree-row[title="src/sibling.ts"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testFiles["src/sibling.ts"])).toBe("");
  expect(await page.evaluate(()=>(window as any).testFiles["src/components/deep/sibling.ts"])).toBeUndefined();
  await page.locator('.tree-row[title="src/App.tsx"]').click();
  await expect(page.locator(".view-lines").first()).toContainText("Hello Veyra");
  await page.screenshot({path:"test-results/nested-explorer.png"});
});

test("duplicate creation keeps the dialog and input so the name can be corrected",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.getByTitle("New file · ⌘N").click();
  const input=page.getByRole("textbox",{name:"New file",exact:true});
  await input.fill("App.tsx");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText(/already exists/i);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("App.tsx");
  expect(await page.evaluate(()=>(window as any).testFiles["src/App.tsx"])).toContain("Hello Veyra");
  await input.fill("AppCopy.tsx");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator('.tree-row[title="src/AppCopy.tsx"]')).toBeVisible();
});

test("folder actions, workspace-root reset and compact explorer remain usable",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.getByRole("button",{name:"New folder in src",exact:true}).click();
  await page.getByRole("textbox",{name:"New folder",exact:true}).fill("nested/inside");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.locator('.tree-row[title="src/nested/inside"]')).toBeVisible();

  await page.getByRole("button",{name:"Select workspace root",exact:true}).click();
  await page.getByTitle("New file · ⌘N").click();
  await page.getByRole("textbox",{name:"New file",exact:true}).fill("root-notes.md");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.locator('.tree-row[title="root-notes.md"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testFiles["root-notes.md"])).toBe("");
  expect(await page.evaluate(()=>(window as any).testFiles["src/nested/inside/root-notes.md"])).toBeUndefined();
  await page.getByTitle("Refresh files",{exact:true}).click();
  await expect(page.locator('.tree-row[title="src/nested/inside"]')).toBeVisible();

  await page.setViewportSize({width:700,height:500});
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".monaco-pane")).toBeVisible();
  await expect(page.getByTitle("New file · ⌘N")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(700);
  await page.screenshot({path:"test-results/explorer-compact.png"});
});

test("explorer context menu renames files and folders and offers folder actions",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.locator('.tree-row[title="src/App.tsx"]').click({button:'right'});
  const fileMenu=page.getByRole('menu',{name:'App.tsx actions'});
  await expect(fileMenu).toBeVisible();
  await fileMenu.getByRole('menuitem',{name:/Rename/}).click();
  await page.getByRole('textbox',{name:'Rename file'}).fill('src/Main.tsx');
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(page.locator('.tree-row[title="src/Main.tsx"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testFiles['src/App.tsx'])).toBeUndefined();

  await page.locator('.tree-row[title="src"]').click({button:'right'});
  const folderMenu=page.getByRole('menu',{name:'src actions'});
  await expect(folderMenu.getByRole('menuitem',{name:'New File'})).toBeVisible();
  await expect(folderMenu.getByRole('menuitem',{name:'New Folder'})).toBeVisible();
  await folderMenu.getByRole('menuitem',{name:/Rename/}).click();
  await page.getByRole('textbox',{name:'Rename folder'}).fill('source');
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(page.locator('.tree-row[title="source"]')).toBeVisible();
  await page.locator('.tree-row[title="source"]').click();
  await expect(page.locator('.tree-row[title="source/Main.tsx"]')).toBeVisible();
});

test("explorer pro copies, cuts, pastes, duplicates and reveals entries",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();await page.locator('.tree-row[title="src"]').click();
  await page.locator('.tree-row[title="README.md"]').click({button:'right'});
  await page.getByRole('menu',{name:'README.md actions'}).getByRole('menuitem',{name:/Copy/}).click();
  await page.locator('.tree-row[title="src"]').click({button:'right'});
  await page.getByRole('menu',{name:'src actions'}).getByRole('menuitem',{name:/Paste/}).click();
  await expect(page.locator('.tree-row[title="src/README.md"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testFiles['src/README.md'])).toContain('Example project');

  await page.locator('.tree-row[title="src/theme.css"]').click({button:'right'});
  await page.getByRole('menu',{name:'theme.css actions'}).getByRole('menuitem',{name:/Duplicate/}).click();
  await expect(page.locator('.tree-row[title="src/theme copy.css"]')).toBeVisible();
  await page.locator('.tree-row[title="src/theme copy.css"]').click({button:'right'});
  await page.getByRole('menu',{name:'theme copy.css actions'}).getByRole('menuitem',{name:'Reveal in Finder'}).click();
  expect(await page.evaluate(()=>(window as any).testCalls.some((call:any)=>call.cmd==='reveal_in_finder'&&call.args.path==='src/theme copy.css'))).toBe(true);

  await page.locator('.tree-row[title="src/theme.css"]').click({button:'right'});
  await page.getByRole('menu',{name:'theme.css actions'}).getByRole('menuitem',{name:/Cut/}).click();
  await expect(page.locator('.status-text')).toContainText('Cut theme.css');
});

test("explorer drag and drop moves files into folders",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();await page.locator('.tree-row[title="src"]').click();
  await page.locator('.explorer-entry:has(.tree-row[title="README.md"])').dragTo(page.locator('.explorer-entry:has(.tree-row[title="src"])'));
  await expect(page.locator('.tree-row[title="src/README.md"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).testFiles['README.md'])).toBeUndefined();
  expect(await page.evaluate(()=>(window as any).testFiles['src/README.md'])).toContain('Example project');
});

test("explorer supports multi-selection and bulk trash",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();
  await page.locator('.tree-row[title="README.md"]').click();
  await page.locator('.tree-row[title="package.json"]').click({modifiers:['Meta']});
  await expect(page.locator('.explorer-entry.selected')).toHaveCount(2);
  await page.locator('.tree-row[title="package.json"]').click({button:'right'});
  const menu=page.getByRole('menu',{name:'package.json actions'});
  await expect(menu).toContainText('2 items');
  await menu.getByRole('menuitem',{name:'Move 2 items'}).click();
  await expect(page.getByRole('heading',{name:'Move 2 items to Trash?'})).toBeVisible();
  await page.locator('.dialog').getByRole('button',{name:'Move to Trash',exact:true}).click();
  await expect(page.locator('.tree-row[title="README.md"]')).toHaveCount(0);
  await expect(page.locator('.tree-row[title="package.json"]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).testFiles['README.md'])).toBeUndefined();
  expect(await page.evaluate(()=>(window as any).testFiles['package.json'])).toBeUndefined();
});

test("source control stages changes, commits and shows history",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();
  await page.getByRole('button',{name:'Source control'}).click();
  await expect(page.getByText('src/App.tsx',{exact:true})).toBeVisible();
  await expect(page.getByText('Build Veyra',{exact:true})).toBeVisible();
  await expect(page.getByText('fcopensource/veyraeditor',{exact:true})).toBeVisible();
  await expect(page.getByText('COMMIT GRAPH',{exact:true})).toBeVisible();
  await page.getByTitle('Stage change').click();
  await expect(page.getByText('STAGED CHANGES')).toBeVisible();
  await page.getByRole('textbox',{name:'Commit message'}).fill('Test integrated commit');
  await page.getByRole('button',{name:/Commit 1 staged/}).click();
  await expect(page.getByText('Working tree clean')).toBeVisible();
  const commands=await page.evaluate(()=>(window as any).testCalls.filter((call:any)=>call.cmd.startsWith('git_')).map((call:any)=>call.cmd));
  expect(commands).toContain('git_stage');expect(commands).toContain('git_commit');
});

test("creation rejects traversal without IPC, traps focus and dismisses safely with Escape",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  const originalFiles=await page.evaluate(()=>(window as any).testFiles);
  const originalDirectories=await page.evaluate(()=>Array.from((window as any).testDirectories));
  await page.getByTitle("New file · ⌘N").click();
  const dialog=page.getByRole("dialog",{name:"New file",exact:true});
  const input=page.getByRole("textbox",{name:"New file",exact:true});
  await expect(input).toBeFocused();
  await input.fill("../outside.ts");
  await dialog.getByRole("button",{name:"Create",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("Use a relative name or path");
  await expect(input).toHaveValue("../outside.ts");
  await expect(input).toHaveAttribute("aria-invalid","true");
  expect(await page.evaluate(()=>(window as any).testCalls.filter((call:any)=>call.cmd==="create_entry"))).toEqual([]);

  // Tab and Shift+Tab wrap within the creation dialog instead of reaching the editor.
  await dialog.getByRole("button",{name:"Create",exact:true}).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByTitle("Cancel creation",{exact:true})).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button",{name:"Create",exact:true})).toBeFocused();
  await input.focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).testCalls.filter((call:any)=>["create_entry","save_file","rename_file","trash_file"].includes(call.cmd)))).toEqual([]);
  expect(await page.evaluate(()=>(window as any).testFiles)).toEqual(originalFiles);
  expect(await page.evaluate(()=>Array.from((window as any).testDirectories))).toEqual(originalDirectories);
});

test("health monitor scores the editor and git decorates the explorer",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();
  // src contains a modified file, so the collapsed folder shows a change dot and the file an M badge.
  await expect(page.locator('.tree-row[title="src"] .git-dot')).toBeVisible();
  await page.locator('.tree-row[title="src"]').click();
  await expect(page.locator('.tree-row[title="src/App.tsx"] .git-badge')).toHaveText('M');
  await page.getByRole('button',{name:'Health monitor',exact:true}).click();
  await expect(page.getByRole('img',{name:/Health score \d+ of 100/})).toBeVisible();
  await expect(page.getByText('Native backend',{exact:true})).toBeVisible();
  await expect(page.getByText('UI responsiveness',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open health monitor'})).toContainText(/\d+/);
  await page.getByRole('button',{name:'Source control'}).click();
  await page.getByTitle('View diff · src/App.tsx').click();
  await expect(page.locator('.diff-view')).toContainText('HEAD ↔ Working tree');
});

test("command palette 2.0, search options and searchable settings",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();
  // Fuzzy file matching with keyboard navigation.
  await page.keyboard.press('Meta+p');
  const input=page.getByRole('textbox',{name:'Search commands or files'});
  await input.fill('thme');
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('theme.css');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab',{name:'theme.css'})).toBeVisible();
  // ">" switches to commands; arrows move the selection.
  await page.keyboard.press('Meta+p');
  await input.fill('>toggle word');
  await expect(page.getByRole('listbox').getByRole('option',{selected:true})).toContainText('Toggle word wrap');
  await page.keyboard.press('Escape');
  // ":" jumps to a line in the active editor.
  await page.keyboard.press('Meta+p');
  await input.fill(':1');
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Go to line 1');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).toHaveCount(0);
  // Search toggles are sent to the native search.
  await page.getByRole('button',{name:'Search workspace · ⇧⌘F'}).click();
  await page.getByRole('button',{name:'Match case'}).click();
  await page.getByRole('textbox',{name:'Search in files'}).fill('Veyra');
  await expect.poll(()=>page.evaluate(()=>(window as any).testCalls.filter((c:any)=>c.cmd==='search_workspace').at(-1)?.args?.options?.caseSensitive)).toBe(true);
  // Settings can be filtered.
  await page.getByRole('button',{name:'Settings · ⌘,'}).click();
  await page.getByRole('textbox',{name:'Search settings'}).fill('tab size');
  await expect(page.getByRole('spinbutton',{name:'Tab size'})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Minimap'})).toHaveCount(0);
});

test("autocomplete: language snippets and cross-file TypeScript, without AI requests while typing",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open a project',exact:false}).click();
  const editor=page.locator('.monaco-editor textarea').first();
  // 1. Python gets keyword and snippet suggestions.
  await page.getByTitle('New file · ⌘N').click();
  await page.getByRole('textbox',{name:'New file',exact:true}).fill('tool.py');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await editor.focus();await page.keyboard.type('de');await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget .monaco-list-row').filter({hasText:/^def/}).first()).toBeVisible();
  await page.keyboard.press('Escape');
  // 2. A new TypeScript file sees exports and types from src/App.tsx, which is not open.
  await page.getByTitle('New file · ⌘N').click();
  await page.getByRole('textbox',{name:'New file',exact:true}).fill('src/use.ts');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.waitForTimeout(2500); // background project models load
  await editor.focus();await page.keyboard.type('import { greeting } from "./App";\ngreeting.toUpp');
  await page.keyboard.press('Control+Space');
  await expect(page.getByRole('option',{name:/toUpperCase/}).first()).toBeVisible({timeout:15000});
  await page.keyboard.press('Escape');
  // 3. No AI ghost text: Veyra AI's free requests are only spent when you send a message.
  await page.keyboard.press('Meta+End');
  await page.keyboard.type('\nfunction add(a: number, b: number) {\n');
  await page.waitForTimeout(1500);
  await expect(page.locator('.ghost-text-decoration, .ghost-text')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).completionRequests||0)).toBe(0);
});
test("VS Code-style tabs: overflow scrolling, middle-click close and context menu",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>{if(e.message!=="Canceled")errors.push(e.message);});
  await page.goto("/");
  const names=["index.ts","router.ts","store.ts","api.ts","utils.ts","hooks.ts","types.ts","config.ts","server.ts","client.ts","logger.ts","cache.ts"];
  await page.evaluate(names=>{const files=(window as any).testFiles;for(const name of names)files["src/"+name]="export const "+name.replace(".ts","")+" = 1;\n";},names);
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="src"]').click();
  for(const name of names)await page.locator(`.tree-row[title="src/${name}"]`).click();
  await expect(page.getByRole("tab")).toHaveCount(names.length);
  const strip=page.locator(".tabs");
  // Overflowing tabs scroll, the active (last) tab is in view, and the scrollbar is a thin overlay rather than a chunky bar.
  expect(await strip.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await expect(page.getByRole("tab",{name:"cache.ts"})).toBeInViewport();
  expect(await strip.evaluate(el=>el.offsetHeight-el.clientHeight)).toBeLessThanOrEqual(3);
  await expect(page.locator(".tab-bar")).toHaveClass(/shadow-left/);
  await page.screenshot({path:"test-results/tabs-overflow.png",clip:{x:0,y:0,width:1360,height:120}});
  // The mouse wheel scrolls the strip sideways.
  await strip.hover();
  const before=await strip.evaluate(el=>el.scrollLeft);
  await page.mouse.wheel(0,-400);
  await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBeLessThan(before);
  // Middle-click closes a tab.
  await page.getByRole("tab",{name:"router.ts"}).click({button:"middle"});
  await expect(page.getByRole("tab",{name:"router.ts"})).toHaveCount(0);
  // Context menu: Close Others leaves only that tab.
  await page.getByRole("tab",{name:"store.ts"}).click({button:"right"});
  await page.screenshot({path:"test-results/tabs-menu.png",clip:{x:0,y:0,width:1360,height:400}});
  await page.getByRole("menuitem",{name:"Close Others"}).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab",{name:"store.ts"})).toHaveAttribute("aria-selected","true");
  expect(errors).toEqual([]);
});
test("tabs with the same file name show just enough folder path to tell them apart",async({page})=>{
  await page.goto("/");
  await page.evaluate(()=>{
    const w=window as any;
    for(const dir of ["app","app/src","lib","lib/src"])w.testDirectories.add(dir);
    for(const file of ["app/src/index.ts","lib/src/index.ts","src/index.ts"])w.testFiles[file]="export {};\n";
  });
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  for(const row of ["app","app/src","app/src/index.ts","lib","lib/src","lib/src/index.ts","src","src/index.ts"])await page.locator(`.tree-row[title="${row}"]`).click();
  const label=(path:string)=>page.locator(`.tab[title="${path}"] .tab-description`);
  await expect(label("app/src/index.ts")).toHaveText("app/src");
  await expect(label("lib/src/index.ts")).toHaveText("lib/src");
  await expect(label("src/index.ts")).toHaveText("studio-project/src");
  await expect(page.locator('.tab[title="src/App.tsx"] .tab-description')).toHaveCount(0);
  await page.screenshot({path:"test-results/tabs-same-name.png",clip:{x:0,y:0,width:1360,height:110}});
});
test("title-bar button: Sign in, your name once signed in, Update when one is ready, then updating",async({page})=>{
  await page.clock.install();
  await page.addInitScript(()=>{
    const w=window as any;const calls:{cmd:string;args:any}[]=[];
    const original=w.__TAURI_INTERNALS__.invoke;
    w.buttonCalls=calls;
    w.__TAURI_INTERNALS__.invoke=async(cmd:string,args:any={})=>{
      calls.push({cmd,args});
      if(cmd==="veyra_account")return w.account||null;
      if(cmd==="plugin:updater|check")return w.updateReady?{rid:7,currentVersion:"0.5.1",version:"0.6.0",date:"2026-10-10",body:"New extensions",rawJson:{}}:null;
      if(cmd==="plugin:updater|download_and_install")return new Promise(()=>{});
      if(cmd==="plugin:opener|open_url")return null;
      return original(cmd,args);
    };
  });
  await page.goto("/");
  const button=page.locator(".toolbar-actions .account-button");
  await expect(button).toHaveText("Sign in");
  await button.click();
  expect(await page.evaluate(()=>(window as any).buttonCalls.find((c:any)=>c.cmd==="plugin:opener|open_url")?.args.url)).toBe("https://veyraeditor.com/login?next=/dashboard");
  // Signing in (e.g. in the AI panel) shows your name.
  await page.evaluate(()=>{(window as any).account={name:"Ada Lovelace",email:"ada@example.com"};window.dispatchEvent(new Event("veyra-account"));});
  await expect(button).toHaveText(/Ada/);
  // An update turns it into "Update"…
  await page.evaluate(()=>{(window as any).updateReady=true;});
  await page.clock.fastForward(16000);
  await expect(page.getByRole("button",{name:"Update Veyra to 0.6.0"})).toBeVisible();
  await page.screenshot({path:"test-results/update-button.png",clip:{x:900,y:0,width:460,height:60}});
  // …and clicking it installs, showing progress until Veyra restarts on the new version.
  await page.getByRole("button",{name:"Update Veyra to 0.6.0"}).click();
  await expect(button).toHaveText(/Updating 0%/);
  expect(await page.evaluate(()=>(window as any).buttonCalls.some((c:any)=>c.cmd==="plugin:updater|download_and_install"))).toBe(true);
});

test("Live Server: Go Live in the status bar, Open with Live Server on HTML files, and its extension page",async({page})=>{
  await page.addInitScript(()=>{(window as any).testFiles["index.html"]="<h1>Hello</h1>";});
  await page.goto("/");
  await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="index.html"]').click();
  const calls=()=>page.evaluate(()=>(window as any).testCalls.filter((c:any)=>c.cmd.startsWith("live_")||c.cmd==="plugin:opener|open_url").map((c:any)=>[c.cmd,c.args.path??c.args.url??null]));

  await page.getByRole("button",{name:"Go Live"}).click();
  const stop=page.getByRole("button",{name:"Stop Live Server"});
  await expect(stop).toHaveText("Port : 5500");
  expect(await calls()).toEqual([["live_start","index.html"],["plugin:opener|open_url","http://127.0.0.1:5500/index.html"]]);
  await stop.click();
  await expect(page.getByRole("button",{name:"Go Live"})).toBeVisible();
  expect((await calls()).at(-1)).toEqual(["live_stop",null]);

  await page.locator('.tree-row[title="index.html"]').click({button:"right"});
  await page.getByRole("menu",{name:"index.html actions"}).getByRole("menuitem",{name:/Open with Live Server/}).click();
  await expect(page.getByRole("button",{name:"Stop Live Server"})).toBeVisible();
  await page.locator('.tree-row[title="README.md"]').click({button:"right"});
  await expect(page.getByRole("menu",{name:"README.md actions"}).getByRole("menuitem",{name:/Open with Live Server/})).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button",{name:"Extensions",exact:true}).click();
  const row=page.locator(".ext-row").filter({hasText:"live reload"}).first();
  await expect(row.getByText("Port 5500")).toBeVisible();
  await expect(row.getByText("Veyra Live Server",{exact:true})).toBeVisible();
  expect(await row.locator("img.ext-icon").getAttribute("src")).toMatch(/live-server|^data:image\/svg/); // our own icon, not the marketplace one
  await row.getByRole("button",{name:"Stop Veyra Live Server"}).click();
  await expect(row.getByRole("button",{name:"Start Veyra Live Server"})).toBeVisible();
});

test("typing in sidebar text boxes never triggers file shortcuts like Delete or Ctrl/Cmd+A (#2)",async({page})=>{
  await page.route('https://open-vsx.org/api/**',route=>route.fulfill({json:{extensions:[]}}));
  await page.goto("/");await page.getByRole("button",{name:"Open a project",exact:false}).click();
  await page.locator('.tree-row[title="README.md"]').click(); // a file is selected in the Explorer
  const fileActions=()=>page.evaluate(()=>(window as any).testCalls.filter((c:any)=>["trash_file","copy_entry","duplicate_entry","rename_file"].includes(c.cmd)).length);
  // Extensions search: Backspace, Delete and select-all edit the text, not the selected file.
  await page.getByRole("button",{name:"Extensions",exact:true}).click();
  const search=page.getByLabel("Search extensions");
  await search.fill("prettier");await search.press("Backspace");
  await expect(search).toHaveValue("prettie");
  await search.press("ControlOrMeta+a");await search.press("Delete");
  await expect(search).toHaveValue("");
  // Commit message: same.
  await page.getByRole("button",{name:"Source control",exact:true}).click();
  const message=page.getByLabel("Commit message");
  await message.fill("Fix typo");await message.press("Backspace");await message.press("ControlOrMeta+d");
  await expect(message).toHaveValue("Fix typ");
  await expect(page.getByRole("heading",{name:/to Trash\?/})).toHaveCount(0);
  expect(await fileActions()).toBe(0);
  expect(await page.evaluate(()=>(window as any).testFiles["README.md"])).toBeDefined();
  // In the file tree itself, Delete still offers to move the selected file to the Trash.
  await page.getByRole("button",{name:"Explorer",exact:true}).click();
  await page.locator('.tree-row[title="README.md"]').click();await page.keyboard.press("Delete");
  await expect(page.getByRole("heading",{name:/to Trash\?/})).toBeVisible();
});
