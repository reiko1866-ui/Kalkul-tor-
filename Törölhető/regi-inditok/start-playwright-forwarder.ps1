# Mindig a script mappajabol inditja a forwardert (screenshot API 17321).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Inditas: $PSScriptRoot\divian-playwright-forwarder.js"
Write-Host "Ha mar fut valami a 17321-es porton, allitsd le elobb (Ctrl+C a regi ablakban)."
& node (Join-Path $PSScriptRoot "divian-playwright-forwarder.js")
