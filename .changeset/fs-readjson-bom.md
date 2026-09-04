---
"@dxgjs/fs": patch
---

Tolerate a UTF-8 BOM in `readJson`: Node's utf8 decoding keeps the BOM character in the string, so `JSON.parse` threw "Unexpected token" on any BOM-prefixed JSON file — a Windows hazard since PowerShell 5.1's `Out-File`/`Set-Content` write BOMs by default. npm itself accepts BOM'd package.json files, so DXG now strips a leading BOM before parsing, matching package-manager tolerance.
