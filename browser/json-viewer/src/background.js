// JSON Viewer Veyra: the toolbar button opens the viewer page, to paste JSON or open a file.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/viewer.html') });
});
