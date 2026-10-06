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
