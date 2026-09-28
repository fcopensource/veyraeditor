import {test,expect} from '@playwright/test';
test('real Open VSX package downloads and imports',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {fetchExtension}=await import('/src/extensions.ts' /* @vite-ignore */);
    const extension=await fetchExtension({namespace:'dracula-theme',name:'theme-dracula',version:'2.25.1'});
    return {id:extension.id,names:extension.themes.map(t=>t.name)};
  });
  expect(result.id).toBe('dracula-theme.theme-dracula');expect(result.names.length).toBeGreaterThan(0);
});
