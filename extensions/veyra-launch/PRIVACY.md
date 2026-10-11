# Privacy

Veyra Launch 0.1.0 has no analytics, telemetry, accounts, remote AI, or extension-operated network service. It reads package manifests and directory entries, probes installed tool versions, and keeps readiness results in memory and its local VS Code Output channel. It does not read .env secrets.

The optional port checker opens TCP connections only to loopback on the extension host. Error explanations process user-pasted messages locally; the input is not written into the report. Reports include local project paths and project names, so review them before sharing.

Explicitly running an install or project task executes third-party tools/code. Those tools may download dependencies, run lifecycle scripts, or communicate over the network under their own policies. Tool version probes also invoke locally installed executables. Workspace trust is required.
