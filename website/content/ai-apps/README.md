# AI app profiles

Each `<app>.md` file here is one app on the Veyra AI gateway (`https://api.veyraeditor.com/v1`).
An app uses its profile by sending the file name as the model, for example `model: "veyra-pdf"`.

```
---
name: Veyra PDF                 # shown in /v1/models
description: Help inside the app
provider: anthropic             # openai | anthropic | auto (auto = the server's default)
model: claude-sonnet-5-5        # optional: a specific model of that provider
daily_limit: 2000               # optional: requests per day for this app
---
Instructions and knowledge for this app: who it talks to, what it knows, how it answers.
```

- **Teach an app:** edit its file and push. The gateway picks up changes without a restart.
- **Add an app:** add a new file, named in lowercase with dashes, like `my-new-app.md`.
- If another provider is set up, it answers automatically when the chosen one is down or busy.
- **This repository is public.** Do not put private information here. For private knowledge, keep the
  profiles in a folder on the server and set `VEYRA_AI_APPS_DIR` to that folder.
