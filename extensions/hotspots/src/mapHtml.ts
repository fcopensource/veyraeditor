// The Hotspot Map page around bundle/map.js. Kept apart from the extension so it can be rendered outside VS Code.

export function mapHtml(script: string, nonce: string, csp: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'nonce-${nonce}'; script-src 'nonce-${nonce}' ${csp};">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;height:100vh;display:flex;flex-direction:column;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);overflow:hidden}
  header{display:flex;align-items:center;gap:14px;padding:12px 16px 10px;flex-wrap:wrap;border-bottom:1px solid var(--vscode-panel-border,#8883)}
  h1{margin:0;font-size:15px;font-weight:650} #sub{opacity:.72;font-size:12px;margin-top:2px}
  .grow{flex:1}
  #modes{display:flex;border:1px solid var(--vscode-panel-border,#8885);border-radius:6px;overflow:hidden}
  #modes button{border:0;border-radius:0;background:transparent;color:inherit;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer;opacity:.8}
  #modes button.on{background:var(--vscode-button-background);color:var(--vscode-button-foreground);opacity:1}
  #modes button:not(.on):hover{background:var(--vscode-toolbar-hoverBackground,#8882)}
  button.b{font:inherit;font-size:12px;border:0;border-radius:4px;padding:5px 10px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#8883);color:var(--vscode-button-secondaryForeground,inherit)}
  input{font:inherit;font-size:12px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#8884);border-radius:4px;padding:5px 8px;width:170px}
  .bar2{display:flex;align-items:center;gap:12px;padding:6px 16px;font-size:12px;flex-wrap:wrap}
  #crumbs a{cursor:pointer;color:var(--vscode-textLink-foreground)} #crumbs span{opacity:.5;margin:0 6px}
  #legend{display:flex;align-items:center;gap:8px;margin-left:auto} .ramp{display:inline-block;width:120px;height:9px;border-radius:5px;background:linear-gradient(90deg,#26344a,#2f5a7a,#7a5aa8,#ff7a3d,#ff3d62)}
  .dim{opacity:.6}
  main{flex:1;display:flex;min-height:0}
  #wrap{flex:1;position:relative;min-width:0;margin:0 0 10px 16px}
  canvas{display:block;border-radius:6px}
  #tip{position:absolute;pointer-events:none;display:none;z-index:2;max-width:340px;padding:8px 10px;border-radius:6px;font-size:12px;line-height:1.55;background:var(--vscode-editorHoverWidget-background,#252526);color:var(--vscode-editorHoverWidget-foreground,inherit);border:1px solid var(--vscode-editorHoverWidget-border,#454545);box-shadow:0 6px 20px #0006}
  aside{width:300px;flex:none;overflow:auto;padding:4px 16px 16px}
  aside h2{font-size:14px;margin:6px 0 2px;word-break:break-all} aside h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin:18px 0 8px}
  .path{opacity:.65;font-size:11.5px;margin:0 0 10px;word-break:break-all}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#111}
  .lv-critical{background:#ff3d62;color:#fff}.lv-high{background:#ff7a3d}.lv-medium{background:#a77ad8}.lv-low{background:#2f5a7a;color:#fff}.lv-none{background:#555;color:#ddd}
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
  .stats div{background:var(--vscode-editorWidget-background,#8881);border-radius:6px;padding:8px 10px} .stats b{font-size:17px;display:block} .stats small{opacity:.65}
  .warn{background:#ff3d6222;border-left:3px solid #ff3d62;padding:8px 10px;border-radius:4px;font-size:12px;line-height:1.5}
  .bar{display:grid;grid-template-columns:1fr 90px 36px;align-items:center;gap:8px;margin:5px 0;font-size:12px}
  .bar i{display:block;height:7px;border-radius:4px;background:linear-gradient(90deg,var(--vscode-button-background) var(--w),#8883 var(--w))}
  .bar small{text-align:right;opacity:.7}
  a.link{display:flex;justify-content:space-between;gap:8px;padding:5px 0;cursor:pointer;color:var(--vscode-textLink-foreground);font-size:12.5px}
  a.link small{color:var(--vscode-foreground);opacity:.6}
  a.row{display:grid;grid-template-columns:24px 1fr 12px;gap:8px;align-items:center;padding:6px 6px;border-radius:5px;cursor:pointer;color:inherit;text-decoration:none}
  a.row:hover{background:var(--vscode-list-hoverBackground)}
  .rank{font-weight:700;opacity:.6;text-align:right} .name{min-width:0} .name b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .name small{display:block;opacity:.55;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .heat{width:10px;height:10px;border-radius:3px;display:block}
  .actions{display:flex;gap:8px;margin-top:18px} .actions button{font:inherit;font-size:12px;border:0;border-radius:4px;padding:6px 12px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#8883);color:var(--vscode-button-secondaryForeground,inherit)}
  .actions .primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  .back{background:none;border:0;color:var(--vscode-textLink-foreground);cursor:pointer;padding:0;font:inherit;font-size:12px;margin:6px 0 8px}
  @media (max-width:760px){aside{display:none}}
</style></head><body>
<header>
  <div><h1 id="title">Hotspots</h1><div id="sub">Reading your git history…</div></div>
  <div class="grow"></div>
  <div id="modes"></div>
  <input id="search" placeholder="Filter files  ( / )" aria-label="Filter files">
  <button class="b" id="period">Period…</button><button class="b" id="report">Copy report</button>
</header>
<div class="bar2"><div id="crumbs"></div><div id="legend"></div></div>
<main><div id="wrap"><canvas id="map"></canvas><div id="tip"></div></div><aside id="side"></aside></main>
<script nonce="${nonce}" src="${script}"></script>
</body></html>`;
}
