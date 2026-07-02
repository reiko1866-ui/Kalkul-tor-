# Divian Playwright figyelo (bovítmeny/proxy nelkul)

Ez a script egy Chrome ablakot nyit, figyeli a halozati valaszokat, es ha `item-lists` valaszt talal, tovabbitja:

- `http://localhost/sajat_program/api_fogado.php`

## 1) Telepites

PowerShell a projekt mappaban:

```powershell
npm init -y
npm install playwright
```

## 2) Inditas

```powershell
node .\divian-playwright-forwarder.js
```

## 3) Hasznalat

1. A megnyilo Chrome ablakban megnyilik a Cyncly **Új projekt (Draft)** oldal (`.../hu/design/Draft?partnership=divian`). Ha kell, lepj be — a session a `pw-user-data` alatt megmaradhat.
2. Csinaj egy olyan muveletet, ami `item-lists` kérést indit.
3. Terminálban ezt latod:
   - `[Captured] ...`
   - `[Forward OK] ...` vagy `[Forward ERROR] ...`

## 4) Leallitas

- `Ctrl + C` a terminalban.

## Megjegyzes

- A script a `pw-user-data` mappaban tartja a sessiont, igy nem kell minden inditasnal ujra belepni.
