# Chrome Web Store listing: what to paste where

Upload `release/json-viewer-veyra-1.0.0.zip` at https://chrome.google.com/webstore/devconsole (one-time developer fee: US$5).

## Store listing tab

**Description**

> Open any JSON in Chrome and read it as a clear, searchable tree.
>
> • A tree you can read: open and close any level, with counts of keys and items. Big files stay fast.
> • Exact numbers: long IDs and values like 19.90 are shown exactly as sent, never rounded.
> • The path of every value: click a value to see $.items[0].price, and copy the path or the value.
> • Search keys and values, and step through the matches.
> • Broken JSON? See the line and column, with the line highlighted and the mistake explained, like an extra comma.
> • Raw view with colours and 2-space, 4-space, tab or one-line formatting, and the original text.
> • Copy or download the JSON or the selected value.
> • Paste JSON or open a file from the toolbar button.
> • Dark, light or automatic theme.
>
> Private: nothing is sent anywhere, and there is no tracking. It only changes pages that are JSON.

**Category:** Developer Tools  **Language:** English

**Graphics** (in `store/`): icon `icons/icon-128.png`; screenshots `1-tree.png`, `2-search.png`, `3-raw.png`, `4-error.png`, `5-light.png` (1280×800); small promo tile `promo-440x280.png`.

**Homepage URL:** https://veyraeditor.com/json-viewer
**Support URL:** https://github.com/fcopensource/veyraeditor/issues

## Privacy practices tab

**Single purpose**

> Show JSON documents as a readable, searchable tree.

**Permission justification**

- `storage`: Remembers the user's chosen view (tree or raw), indentation and theme.
- Host permission (content script on all URLs): JSON can be opened from any website or API, so the content script checks each page's content type and only changes pages that are JSON. It never reads or changes other pages.

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing (it collects no user data), then tick the three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://veyraeditor.com/json-viewer/privacy
