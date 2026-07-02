# Divian mitmproxy beallitas

Ez a megoldas nem Chrome bovitmeny. A bongeszo forgalmat egy lokalis proxy figyeli.

## 1) Telepites (PowerShell)

```powershell
py -m pip install mitmproxy
```

## 2) Script futtatasa

Abban a mappaban, ahol a `divian-mitm-forwarder.py` van:

```powershell
mitmdump -s .\divian-mitm-forwarder.py
```

Ha minden jo, itt fogsz latni logot:
- `[Forward OK] ...`
- vagy hiba eseten `[Forward ERROR] ...`

## 3) Chrome proxy beallitas

Allitsd a Chromet erre a proxyra:
- Host: `127.0.0.1`
- Port: `8080`

Windows szinten legegyszerubben:
1. Windows Settings -> Network & Internet -> Proxy
2. Manual proxy setup -> On
3. Address: `127.0.0.1`
4. Port: `8080`

## 4) Mitm tanusitvany (fontos)

Elso inditas utan nyisd meg Chrome-ban:
- `http://mitm.it`

Toltsd le es telepitsd a Windows certificate-et, kulonben HTTPS forgalom nem lesz olvashato.

## 5) Ellenorzes

Nyisd meg a Cyncly oldalt. Ha jon `item-lists` valasz, a script tovabbit:
- `http://localhost/sajat_program/api_fogado.php`

## 6) Leallitas

- `Ctrl + C` a `mitmdump` terminalban
- proxy kikapcsolasa Windowsban
