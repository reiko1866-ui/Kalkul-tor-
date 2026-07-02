# -*- coding: utf-8 -*-
"""Generate divian-extras-kiadvany.js from Hello Budapest catalog (PDF: divian_hello_budapest)."""
import json
from pathlib import Path


def ap(brand, code, name, retail):
    return {"brand": brand, "code": code, "name": name, "retail": int(retail)}


def carry_retail(rows):
    """(code, name, price|None) sorok: None = az előző nem-None ár érvényes (kiadvány táblázat)."""
    out = []
    last = None
    for row in rows:
        code, name, p = row
        if p is not None:
            last = int(p)
        if last is None:
            raise ValueError(f"carry_retail: nincs ár a(z) {code!r} előtt")
        out.append((code, name, last))
    return out


# Hello Budapest PDF (divian_hello_budapest) — Blanco Silgranit mosogatók színei (29–32. o.)
_SILG5 = (("ANTR", "antracit"), ("VULK", "vulkánszürke"), ("FEH", "fehér"), ("TORT", "törtfehér"), ("KAVE", "kávé"))


def blanco_silgranit_tray_5(code_prefix: str, title: str, price: int, feher_note: str = ""):
    rows = []
    for i, (suf, col) in enumerate(_SILG5):
        note = feher_note if col == "fehér" and feher_note else ""
        nm = f"BLANCO {title} — Silgranit, {col}{note}"
        rows.append((f"{code_prefix}-{suf}", nm, price if i == 0 else None))
    return rows


def main():
    appliances = []

    W = [
        ("WHP-W6-OS4-4S2-P-BL", "Sütő · W6 OS4 4S2 P BL — elektromos sütő, 73 L, A++, fekete (kifutó)", 266500),
        ("WHP-OMSK58RU1", "Sütő · OMSK58RU1 — elektromos sütő, 71 L, fekete/inox, A+, pirolitikus + hidrolitikus", 134700),
        ("WHP-OMK58HU1B", "Sütő · OMK58HU1B — elektromos sütő, 71 L, fekete, A+, Cook3, gőz", 109700),
        ("WHP-OMK38HU0X", "Sütő · OMK38HU0X — elektromos sütő, 71 L, inox, A, Cook3", 98500),
        ("WHP-WOI78PT1SSGA", "Sütő · WOI78PT1SSGA — elektromos sütő, Stardust grey glossy, 73 L, A+, AirFry", 240200),
        ("WHP-WOI78FPT1SBA", "Sütő · WOI78FPT1SBA — elektromos sütő, fekete, 73 L, A+, AirFry", 210500),
        ("WHP-WOI4S8CM1S", "Sütő · WOI4S8CM1S — elektromos sütő, beige/fehér/fekete/inox, 73 L, A+, katalitikus", 170500),
        ("WHP-WOI5S8PM2SEA", "Sütő · WOI5S8PM2SEA — elektromos sütő, beige/fehér/fekete/inox, 73 L, A, pirolitikus + hidrolitikus, AirFry", 183700),
        ("WHP-WMN14BSG", "Mikró · WMN14BSG — mikrohullámú sütő, szürke/fekete/fehér, 22 L, álló és felső elem", 136000),
        ("WHP-WMD704TB", "Mikró · WMD704TB — mikrohullámú sütő, fekete/szürke, 31 L, csak álló elem", 210500),
        ("WHP-WMD44MX", "Mikró · WMD44MX — mikrohullámú sütő, beige/fehér/fekete/inox, 31 L, álló elem", 181300),
        ("WHP-WMD54MBG", "Mikró · WMD54MBG — mikrohullámú sütő, beige/fehér/fekete/inox, 31 L, álló elem", 199700),
        ("WHP-MBNA910X", "Mikró · MBNA910X — mikrohullámú sütő, fekete/inox, 22 L, csak felső elem", 111700),
        ("WHP-MBNA900B", "Mikró · MBNA900B — mikrohullámú sütő, fekete, 22 L, csak felső elem", 107100),
        ("WHP-AMW-730-SD", "Mikró · AMW 730/SD — mikrohullámú sütő, szatén ezüst/fehér, 31 L, álló elem (kifutó)", 145700),
        ("WHP-WF-S3660-CPNE", "Főzőlap · WF S3660 CPNE — indukciós, fekete, CleanProtect, 7,2 kW", 173500),
        ("WHP-WS-Q7360-NE", "Főzőlap · WS Q7360 NE — indukciós, fekete, érintőgomb, 7,2 kW", 112400),
        ("WHP-WL-S5360-BF-W", "Főzőlap · WL S5360 BF/W — indukciós, fehér, 7,2 kW", 158300),
        ("WHP-WB-B8360-NE", "Főzőlap · WB B8360 NE — indukciós, fekete, érintőszenzor, Booster", 128200),
        ("WHP-AKT-8130", "Főzőlap · AKT 8130 — kerámia főzőlap, inox szegély (LX) vagy szegély nélkül (NE), 6,2 kW", 84500),
        ("WHP-GOWL-628-NB-EE", "Főzőlap · GOWL 628/NB EE — gáz főzőlap, fekete, öntöttvas rács", 97200),
        ("WHP-TKRL-661-NB", "Főzőlap · TKRL 661 NB — gáz főzőlap, fekete, öntöttvas rács", 84500),
        ("WHP-WHVP-62F-LT-SD", "Páraelszívó · WHVP 62F LT SD — kürtős, ezüst, 470 m³/h", 106900),
        ("WHP-WHVA-62F-LM-K", "Páraelszívó · WHVA 62F LM K — kürtős, fekete, 485 m³/h", 124900),
        ("WHP-WHVP-82F-LT-K", "Páraelszívó · WHVP 82F LT K — kürtős, fekete, 650 m³/h", 102800),
        ("WHP-WHVP-65F-LM-K", "Páraelszívó · WHVP 65F LM K — kürtős, fekete, 375 m³/h", 70700),
        ("WHP-AKR-749-1-IX", "Páraelszívó · AKR 749/1 IX — teleszkópos, inox, 371 m³/h", 44400),
        ("WHP-WCTH-63F-LEB-X", "Páraelszívó · WCTH 63F LEB X — teljesen integrált, inox, 730 m³/h", 82700),
        ("WHP-WCT-64-FLY-X", "Páraelszívó · WCT 64 FLY X — teljesen integrált, inox, 224 m³/h", 50400),
        ("WHP-AKR-750-G", "Páraelszívó · AKR 750 G — teleszkópos, szatén ezüst/fekete, 304 m³/h", 56900),
        ("WHP-WL-S2760-BF-S", "Főzőlap · WL S2760 BF/S — indukciós, szatén ezüst, 7,2 kW", 173500),
        ("WHP-WHC18-T573", "Hűtő · WHC18 T573 — beépíthető hűtőszekrény, fehér, 182+68 L, E", 327400),
        ("WHP-WHC20D013D1", "Hűtő · WHC20D013D1 — beépíthető hűtőszekrény, fehér, 221+79 L, E", 297900),
        ("WHP-WHC20-T352", "Hűtő · WHC20 T352 — beépíthető hűtőszekrény, fehér, 212+68 L, E", 298000),
        ("WHP-WHC18D031A1", "Hűtő · WHC18D031A1 — beépíthető hűtőszekrény, fehér, 195+79 L, E", 226300),
        ("WHP-WCIC-3C33-P", "Mosogatógép · WCIC 3C33 P — teljesen integrált, ezüst, 14 teríték (kifutó)", 170900),
        ("WHP-W8I-HT40-T", "Mosogatógép · W8I HT40 T — teljesen integrált, fekete, 14 teríték", 208200),
        ("WHP-WIC-3C26-F", "Mosogatógép · WIC 3C26 F — teljesen integrált, ezüst, 14 teríték", 154100),
        ("WHP-WH6IB10BS7LA0", "Mosogatógép · WH6IB10BS7LA0 — teljesen integrált, ezüst, 10 teríték", 186600),
        ("WHP-WIC-3C34-PFE-S", "Mosogatógép · WIC 3C34 PFE S — teljesen integrált, ezüst, 14 teríték, 45 cm", 169600),
        ("WHP-WSBC-3M27-X", "Mosogatógép · WSBC 3M27 X — félig integrált, fekete/inox, 10 teríték", 141600),
        ("WHP-WBO-3T333-P-65-X", "Mosogatógép · WBO 3T333 P 6.5 X — félig integrált, fekete/inox, 14 teríték", 174900),
        ("WHP-SP40-812-EU-2", "Hűtő · SP40 812 EU 2 — beépíthető hűtőszekrény, fehér, 229+101 L, E", 384700),
    ]
    for code, name, p in W:
        appliances.append(ap("Whirlpool", code, name, p))

    B = [
        ("BOS-PIF651HC1E", "Főzőlap · PIF651HC1E — indukciós, DirectSelect, Smart Hood", 156600),
        ("BOS-DWK65DK60", "Páraelszívó · DWK65DK60 — kürtős, üveg előlap, TouchSelect", 103600),
        ("BOS-POH6B6K30", "Főzőlap · POH6B6K30 — gáz, acél rács", 105100),
        ("BOS-PVQ631HC1E", "Főzőlap · PVQ631HC1E — indukciós, DirectSelect, PerfectFry Plus", 163100),
        ("BOS-HBA372EB4", "Sütő · HBA372EB4 — beépíthető, AirFry, 71 L, hidrolitikus", 212000),
        ("BOS-HBA571BB4", "Sütő · HBA571BB4 — beépíthető, pirolitikus, 71 L", 149900),
        ("BOS-HBA274BB3F", "Sütő · HBA274BB3F — beépíthető, pirolitikus, TouchControl", 185300),
        ("BOS-SMV25AX06E", "Mosogatógép · SMV25AX06E — beépíthető, 60 cm, Infolight", 148100),
        ("BOS-BFL7221B1", "Mikró · BFL7221B1 — beépíthető, TFT, Home Connect, 21 L", 263800),
        ("BOS-PUE611HC1E", "Főzőlap · PUE611HC1E — indukciós, Home Connect, PerfectFry Plus", 131900),
        ("BOS-DWK67FN60", "Páraelszívó · DWK67FN60 — kürtős, EcoSilence, Smart Hood", 179000),
        ("BOS-SMV4EVX08E", "Mosogatógép · SMV4EVX08E — beépíthető, Efficient Dry, 14 teríték", 207900),
        ("BOS-HBG7321B1", "Sütő · HBG7321B1 — TFT, Home Connect, AirFry, katalitikus, 71 L", 229900),
        ("BOS-PVQ61CHB1E", "Főzőlap · PVQ61CHB1E — indukciós, matt fekete, CombiZone, Smart Hood", 179000),
        ("BOS-HQA534EB3", "Sütő · HQA534EB3 — gőz, Hotair steam, 71 L, EcoClean Direct", 136600),
        ("BOS-HBF133BR0", "Sütő · HBF133BR0 — 3D forrólevegő, EcoClean Direct, 66 L", 118900),
        ("BOS-SMV4HVX00E", "Mosogatógép · SMV4HVX00E — beépíthető, Home Connect, 14 teríték", 189200),
        ("BOS-BFL623MB4", "Mikró · BFL623MB4 — Autopilot, 20 L", 100000),
        ("BOS-DWP64BC60", "Páraelszívó · DWP64BC60 — kürtős, LED", 84700),
        ("BOS-SPV2HMX42E", "Mosogatógép · SPV2HMX42E — beépíthető, 45 cm, 10 teríték", 176400),
        ("BOS-KIV865SE0", "Hűtő · KIV865SE0 — beépíthető, 183+84 L", 247400),
        ("BOS-HQG572EB3", "Sütő · HQG572EB3 — elektromos, gőz, pirolitikus, AirFry, 71 L", 202500),
        ("BOS-PUE64KBB5E", "Főzőlap · PUE64KBB5E — indukciós, TouchSelect", 103600),
        ("BOS-PKF631BB2E", "Főzőlap · PKF631BB2E — üvegkerámia, TouchSelect", 80500),
        ("BOS-SPV4EMX24E", "Mosogatógép · SPV4EMX24E — beépíthető, 45 cm, Efficient Dry, 10 teríték (kifutó)", 189200),
    ]
    for code, name, p in B:
        appliances.append(ap("Bosch", code, name, p))

    E = [
        ("EVI-PURE-20", "Víztisztító · EVIDO PURE 2.0", 349900),
        ("EVI-ECO", "Víztisztító · EVIDO ECO", 170900),
        ("EVI-GREEN", "Víztisztító · EVIDO GREEN", 79900),
        ("EVI-TRICOL-50", "Páraelszívó · EVIDO TRICOL — kürtős, 50 cm (inox/fekete/fehér)", 28900),
        ("EVI-TRICOL-60", "Páraelszívó · EVIDO TRICOL — kürtős, 60 cm (inox/fekete/fehér)", 28900),
        ("EVI-ONDA-60-BEZS", "Páraelszívó · EVIDO ONDA — kürtős, 60 cm bézs/bronz", 49900),
        ("EVI-ONDA-60-ANT", "Páraelszívó · EVIDO ONDA — kürtős, 60 cm antracit/bronz", 49900),
        ("EVI-ONDA-60-FK", "Páraelszívó · EVIDO ONDA — kürtős, 60 cm fehér/króm vagy fekete/króm", 49900),
        ("EVI-DAPHNE-60", "Páraelszívó · EVIDO DAPHNE — rusztikus fali kürtős, 60 cm bézs", 89900),
        ("EVI-DAPHNE-90", "Páraelszívó · EVIDO DAPHNE — rusztikus fali kürtős, 90 cm bézs", 89900),
        ("EVI-REFLEX-60-FU", "Páraelszívó · EVIDO REFLEX — design, 60 cm fehér üveg", 49900),
        ("EVI-REFLEX-60-FK", "Páraelszívó · EVIDO REFLEX — design, 60 cm fekete üveg", 49900),
        ("EVI-REFLEX-60-IX", "Páraelszívó · EVIDO REFLEX — design, 60 cm inox/fekete üveg", 49900),
        ("EVI-SKY-60", "Páraelszívó · EVIDO SKY — design, 60 cm fekete üveg front", 49900),
        ("EVI-SKY-PRO-60", "Páraelszívó · EVIDO SKY PRO — design, 60 cm fekete üveg front", 69900),
        ("EVI-SKY-PRO-90-FK", "Páraelszívó · EVIDO SKY PRO — 90 cm fekete üveg front", 69900),
        ("EVI-SKY-PRO-90-FH", "Páraelszívó · EVIDO SKY PRO — 90 cm fehér üveg front", 69900),
        ("EVI-LINE-60", "Páraelszívó · EVIDO LINE — kürtős, 60 cm fekete üveg/inox", 62900),
        ("EVI-LINE-90", "Páraelszívó · EVIDO LINE — kürtős, 90 cm fekete üveg/inox", 68900),
        ("EVI-MOVE", "Páraelszívó · EVIDO MOVE — felsőszekrénybe építhető, 60 cm fekete", 35900),
        ("EVI-FORTE-60", "Páraelszívó · EVIDO FORTE — teleszkópos, 60 cm inox/fehér/fekete", 37900),
        ("EVI-SLIMBOX-50", "Páraelszívó · EVIDO SLIMBOX — teleszkópos, 50 cm inox", 27900),
        ("EVI-SLIMBOX-60", "Páraelszívó · EVIDO SLIMBOX — teleszkópos, 60 cm inox", 27900),
        ("EVI-SLIMLUX-50", "Páraelszívó · EVIDO SLIMLUX — teleszkópos, 50 cm inox", 38900),
        ("EVI-SLIMLUX-60", "Páraelszívó · EVIDO SLIMLUX — teleszkópos, 60 cm inox", 38900),
        ("EVI-SLIMLUX-TC-50", "Páraelszívó · EVIDO SLIMLUX TC — teleszkópos, 50 cm fekete üveg", 45900),
        ("EVI-SLIMLUX-TC-60", "Páraelszívó · EVIDO SLIMLUX TC — teleszkópos, 60 cm fekete üveg", 45900),
        ("EVI-PRIMO-63X", "Sütő · EVIDO PRIMO 63X — légkeveréses, inox/fekete", 86900),
        ("EVI-PRIMO-62X", "Sütő · EVIDO PRIMO 62X — statikus, inox/fekete", 75900),
        ("EVI-LEVEL-60", "Sütő · EVIDO LEVEL 60 — multifunkciós, fehér/fekete/inox", 129900),
        ("EVI-COMFORT-60W", "Sütő · EVIDO COMFORT 60W — multifunkciós, fehér", 99900),
        ("EVI-RUSTIC-O-60A", "Sütő · EVIDO RUSTIC-O 60A — légkeveréses, rusztikus, bézs", 111900),
        ("EVI-RUSTIC-O-60C", "Sütő · EVIDO RUSTIC-O 60C — multifunkciós gőz, rusztikus, bézs/antracit", 129900),
        ("EVI-SUPRA-60B", "Sütő · EVIDO SUPRA 60B — multifunkciós, fekete üveg", 179900),
        ("EVI-RUSTIC-H-60C", "Kombinált · EVIDO RUSTIC-H 60C — gáz + mikró, bézs/antracit", 53900),
        ("EVI-RUSTIC-H-70A-WOK", "Főzőlap · EVIDO RUSTIC-H 70A WOK — gáz, 70 cm, rusztikus", 81900),
        ("EVI-DOMINO-G-32X", "Főzőlap · DOMINO-G 32X — gáz, 30 cm", 36900),
        ("EVI-DOMINO-V-32B", "Főzőlap · DOMINO-V 32B — üvegkerámia, 30 cm", 32900),
        ("EVI-DOMINO-I-3BB", "Főzőlap · DOMINO-I 3BB — indukciós, 30 cm", 39900),
        ("EVI-MURANO-70B", "Főzőlap · EVIDO MURANO 70B — gáz, fekete, 70 cm", 89900),
        ("EVI-MURANO-60W", "Főzőlap · EVIDO MURANO 60W — gáz, fehér, 60 cm", 78900),
        ("EVI-MURANO-60B", "Főzőlap · EVIDO MURANO 60B — gáz, fekete, 60 cm", 78900),
        ("EVI-VALEO-60FX", "Főzőlap · EVIDO VALEO 60FX — gáz, inox", 56900),
        ("EVI-VALEO-60SX", "Főzőlap · EVIDO VALEO 60SX — gáz, inox", 44900),
        ("EVI-VALEO-70X", "Főzőlap · EVIDO VALEO 70X — gáz, inox, 70 cm", 83900),
        ("EVI-COMFORT-45M-FK", "Mikró · EVIDO COMFORT 45M — fekete (25 L), álló elem", 64900),
        ("EVI-COMFORT-45M-FH", "Mikró · EVIDO COMFORT 45M — fehér (20 L), álló elem", 64900),
        ("EVI-COMFORT-45M-IX", "Mikró · EVIDO COMFORT 45M — inox (20 L), álló elem", 64900),
        ("EVI-VETRO-60BB", "Főzőlap · EVIDO VETRO 60BB — indukciós, fekete", 65900),
        ("EVI-VETRO-60CB", "Főzőlap · EVIDO VETRO 60CB — üvegkerámia, fekete", 69900),
        ("EVI-VETRO-60DB", "Főzőlap · EVIDO VETRO 60DB — üvegkerámia/indukció", 67900),
        ("EVI-AQUAPRO-45I", "Mosogatógép · EVIDO AQUAPRO 45I — teljesen integrált, 45 cm", 136900),
        ("EVI-AQUAPRO-60I", "Mosogatógép · EVIDO AQUAPRO 60I — teljesen integrált, 60 cm", 136900),
        ("EVI-IGLOO-332W", "Hűtő · EVIDO IGLOO 332W — beépíthető, 180+63 L, Frost Free", 199900),
        ("EVI-FREE-GE55", "Tűzhely · EVIDO FREE GE55 — szabadonálló, 50×55, bézs/antracit", 115900),
        ("EVI-FREE-GE55A", "Tűzhely · EVIDO FREE GE55A — szabadonálló, 50×55, antracit", 115900),
        ("EVI-SPLASH-60I", "Mosogatógép · EVIDO SPLASH 60I — teljesen integrált, 60 cm", 109900),
        ("EVI-LUNA-320B", "Hűtő · EVIDO LUNA 320B — szabadonálló, fekete üveg, 191+129 L", 279900),
    ]
    for code, name, p in E:
        appliances.append(ap("Evido", code, name, p))

    # Hello Budapest kiadvány 27. o. — Divian mosogatótálcák (listaárak)
    trays_div = [
        ("TDIV-KOR-1M", "Kör egymedencés, beépíthető", 17300),
        ("TDIV-1M-BEEP", "Egymedencés, beépíthető", 17300),
        ("TDIV-LEK-1M-CS", "Lekerekített egymedencés, csepptálcás, beépíthető", 20300),
        ("TDIV-1M-CS-RUL", "Egymedencés, csepptálcás, ráültethető", 27990),
        ("TDIV-SAROK-1M", "Sarok egymedencés, csepptálcás, beépíthető", 29700),
        ("TDIV-2M-RUL", "Kétmedencés, ráültethető", 32990),
        ("TDIV-2M-BEEP", "Kétmedencés, beépíthető", 28300),
        ("TDIV-1M-GY-CS", "Egymedencés, gyümölcsmosós, csepptálcás, beépíthető", 29700),
        ("TDIV-65-IV", "Beépíthető 65-ös íves", 29700),
        ("TDIV-550", "Egymedencés, beépíthető 550-es", 15500),
        ("TDIV-SZ-1M-CS", "Szögletes egymedencés, csepptálcás, beépíthető", 27700),
        ("TDIV-COMP-SZ-1M", "Compact szögletes egymedencés, csepptálcás, beépíthető", 23900),
        ("TDIV-1M-CS-COMP", "Egymedencés, csepegtetős, compact", 38900),
        ("TDIV-GR1M-CS", "Gránit egymedencés, csepptálcás, beépíthető", 54100),
        ("TDIV-GR-KOR-1M", "Gránit, kör egymedencés, beépíthető", 56200),
        ("TDIV-GR1M-BEEP", "Gránit egymedencés, beépíthető", 56200),
        ("TDIV-TORRANO-1M", "Torrano gránit egymedencés, csepegtetős, beépíthető", 59500),
        ("TDIV-TORRANO-1M-F", "Torrano gránit egymedencés, csepegtetős, beépíthető, fehér", 65300),
        ("TDIV-GR2M-BEEP", "Gránit kétmedencés, beépíthető", 69600),
        ("TDIV-SLIM-INOX", "Slim inox egymedencés, csepegtetős, jobbos/balos", 77100),
        ("TDIV-SLIM", "Slim egymedencés, csepegtetős, jobbos/balos", 91300),
    ]

    # Blanco mosogatótálcák — forrás: divian_hello_budapest PDF 29–33. o. (ár + színek egy listaár szerint)
    trays_bl_raw = []
    trays_bl_raw.append(("TBL-ZENAR-45-S", "BLANCO ZENAR 45 S — Silgranit, antracit (45 cm szekrény, kiadvány)", 181900))
    trays_bl_raw += blanco_silgranit_tray_5("TBL-LEGRA-45-S", "LEGRA 45 S", 79900, " * fehér: kifutó, kiadvány")
    trays_bl_raw += blanco_silgranit_tray_5("TBL-LEGRA-6", "LEGRA 6", 99900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-LEGRA-XL-6-S", "LEGRA XL 6 S", 96900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-LEGRA-8", "LEGRA 8", 114900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-40-S", "ZIA 40 S", 111900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-45-S-COMP", "ZIA 45 S Compact", 73900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-45-S", "ZIA 45 S", 92900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-5-S", "ZIA 5 S", 99900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-6-S", "ZIA 6 S", 131900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-XL-6-S-COMP", "ZIA XL 6 S Compact", 99900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-XL-6-S", "ZIA XL 6 S", 133900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-8-S", "ZIA 8 S", 161900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-9", "ZIA 9", 146900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ZIA-9-E", "ZIA 9 E", 157900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-DALAGO-45", "DALAGO 45", 115900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-DALAGO-5", "DALAGO 5", 117900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-DALAGO-6", "DALAGO 6", 102900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-DALAGO-8", "DALAGO 8", 157900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ELON-45-S", "ELON 45 S", 150900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ELON-XL-8-S", "ELON XL 8 S", 170900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ELON-XL-6-S", "ELON XL 6 S", 154900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ADIRA-45-S", "ADIRA 45 S", 163900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ADIRA-6-S", "ADIRA 6 S", 215900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-ADIRA-XL-6-S", "ADIRA XL 6 S", 185900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-NAYA-5", "NAYA 5", 87900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-NAYA-6", "NAYA 6", 96900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-METRA-45-S", "METRA 45 S", 121900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-METRA-45-S-COMP", "METRA 45 S Compact", 125900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-METRA-6-S", "METRA 6 S", 153900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-METRA-5-S", "METRA 5 S", 140900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-METRA-XL-6-S", "METRA XL 6 S", 159900)
    trays_bl_raw += blanco_silgranit_tray_5("TBL-METRA-9", "METRA 9", 171900)
    # Rozsdamentes / inox (PDF 33. o.) — nincs Silgranit színválaszték
    trays_bl_raw.append(("TBL-TIPO-45-S-COMP", "BLANCO TIPO 45 S Compact — rozsdamentes acél, natúr", 31900))
    trays_bl_raw.append(("TBL-TIPO-45", "BLANCO TIPO 45 — rozsdamentes acél, natúr", 33900))
    trays_bl_raw.append(("TBL-TIPO-XL-6-S", "BLANCO TIPO XL 6 S — rozsdamentes acél, natúr", 58900))
    trays_bl_raw.append(("TBL-TIPO-45-S-MINI", "BLANCO TIPO 45 S Mini — rozsdamentes acél, natúr", 28900))
    # DINAS: két listaár a kiadványban (furatolás / változat)
    trays_bl_raw.append(("TBL-DINAS-45-S-V1", "BLANCO DINAS 45 S — fényezett rozsdamentes acél (67.900 Ft, kiadvány)", 67900))
    trays_bl_raw.append(("TBL-DINAS-45-S-V2", "BLANCO DINAS 45 S — fényezett rozsdamentes acél (75.900 Ft, kiadvány)", 75900))
    trays_bl_raw.append(("TBL-DINAS-XL-6-S-COMP-V1", "BLANCO DINAS XL 6 S Compact — fényezett inox (76.900 Ft)", 76900))
    trays_bl_raw.append(("TBL-DINAS-XL-6-S-COMP-V2", "BLANCO DINAS XL 6 S Compact — fényezett inox (84.900 Ft)", 84900))
    trays_bl_raw.append(("TBL-DINAS-XL-6-S-V1", "BLANCO DINAS XL 6 S — fényezett inox (78.900 Ft)", 78900))
    trays_bl_raw.append(("TBL-DINAS-XL-6-S-V2", "BLANCO DINAS XL 6 S — fényezett inox (86.900 Ft)", 86900))
    trays_bl_raw.append(("TBL-DINAS-6-S-V1", "BLANCO DINAS 6 S — fényezett inox (86.900 Ft)", 86900))
    trays_bl_raw.append(("TBL-DINAS-6-S-V2", "BLANCO DINAS 6 S — fényezett inox (96.600 Ft)", 96600))
    trays_bl_raw.append(("TBL-TORRE-KR", "BLANCO TORRE — króm (kis mosogató, PDF 33. o.)", 21900))
    trays_bl_raw += blanco_silgranit_tray_5("TBL-LATO", "LATO", 26900)
    trays_bl_raw.append(("TBL-LATO-KR", "BLANCO LATO — króm", 26900))
    trays_bl_raw.append(("TBL-LATO-MF", "BLANCO LATO — matt fekete", 31900))

    trays_bl = list(carry_retail(trays_bl_raw))

    taps = []
    # Divian csap/csomag árak: üzleti lista (nem a kiadvány PDF alapértelmezettje)
    divian_taps_raw = [
        ("DIV-CSAP-GR-IV-F", "Gránit íves csaptelep, fekete", 30100),
        ("DIV-CSAP-GR-IV-SZ", "Gránit íves csaptelep, szürke", 15900),
        ("DIV-CSAP-FLEX-MERIN", "FlexiMerin flexibilis csaptelep", 16000),
        ("DIV-CSAP-KROM-IV", "Króm íves csaptelep", 35500),
        ("DIV-CSAP-VEGASI-MF", "Vegasi csaptelep, matt fekete", 51200),
        ("DIV-CSAP-SNAKE-KR", "Snake króm zuhanyfejes csaptelep", 51900),
        ("DIV-CSAP-CADOS-KR", "Cados csaptelep, króm", 28800),
        ("DIV-CSAP-CADOS-F", "Cados csaptelep, fekete", None),
        ("DIV-CSAP-ESTELL-MF", "Estell csaptelep, matt fekete", 25900),
        ("DIV-CSAP-LINEA-KR-Z", "Linea króm zuhanyfejes csaptelep", 50400),
        ("DIV-CSAP-LINEA-GR-Z", "Linea gránit, fekete, zuhanyfejes csaptelep", 50400),
        ("DIV-CSAP-SNAKE-GR-Z", "Snake gránit, beige, zuhanyfejes csaptelep", 57700),
        ("DIV-CSAP-GOLD-IV", "Gold íves csaptelep", 39000),
        ("DIV-CSAP-VEGASI-KF", "Vegasi csaptelep, króm-fekete", 51200),
        ("DIV-CSOM-1-TOR-CAD", "Csomag: Torrano fehér mosogatótálca + Cados fehér csaptelep", 72400),
        ("DIV-CSOM-2-GR-VEG", "Csomag: Gránit fekete 1 mély csepp. mosogatótálca + Vegasi matt fekete", 84300),
        ("DIV-CSOM-3-KR-NK", "Csomag: Króm 1 mély szögletes mosogatótálca + Nook króm csaptelep", 42700),
        ("DIV-CSAP-NOOK-GR", "Nook gránit csaptelep", 39900),
        ("DIV-CSAP-NOOK-KR", "Nook króm csaptelep", None),
    ]
    for code, name, p in carry_retail(divian_taps_raw):
        taps.append({"brand": "Divian", "code": code, "name": name, "retail": int(p)})

    taps_bl_raw = [
        ("BL-FONTAS-II-ANTR", "FONTAS II — Silgranit-Look, antracit HD", 151900),
        ("BL-FONTAS-II-VULK", "FONTAS II — Silgranit-Look, vulkánszürke", None),
        ("BL-FONTAS-II-FEH-HD", "FONTAS II — Silgranit-Look, fehér HD", None),
        ("BL-FONTAS-II-TORT-HD", "FONTAS II — Silgranit-Look, törtfehér HD", None),
        ("BL-MILA-KR", "MILA — króm HD", 37900),
        ("BL-MILA-MF", "MILA — matt fekete HD", 52900),
        ("BL-MILA-S-KR", "MILA-S — króm HD", 69900),
        ("BL-MILA-S-MF", "MILA-S — matt fekete HD", 76900),
        ("BL-TRIMA-KR", "TRIMA — víztisztítóhoz csatlakoztatható, króm HD (szűrő nélkül, kiadvány)", 111900),
        ("BL-KANO-MF", "KANO — matt fekete", 92900),
        ("BL-KANO-KR", "KANO — króm", 68900),
        ("BL-KANO-SIL-AK", "KANO — Silgranit-Look kétszínű, antracit/króm HD", 85900),
        ("BL-KANO-SIL-VK", "KANO — Silgranit-Look kétszínű, vulkánszürke/króm HD", None),
        ("BL-KANO-SIL-FK", "KANO — Silgranit-Look kétszínű, fehér/króm HD", None),
        ("BL-KANO-SIL-TK", "KANO — Silgranit-Look kétszínű, törtfehér/króm HD", None),
        ("BL-KANO-S-KR", "KANO-S — króm HD", 79900),
        ("BL-KANO-S-MF", "KANO-S — matt fekete HD", 103900),
        ("BL-KANO-S-SIL-AK", "KANO-S — Silgranit-Look kétszínű, antracit/króm HD", 98900),
        ("BL-KANO-S-SIL-VK", "KANO-S — Silgranit-Look kétszínű, vulkánszürke/króm HD", None),
        ("BL-KANO-S-SIL-FK", "KANO-S — Silgranit-Look kétszínű, fehér/króm HD", None),
        ("BL-KANO-S-SIL-TK", "KANO-S — Silgranit-Look kétszínű, törtfehér/króm HD", None),
        ("BL-MIDA-SIL-ANTR", "MIDA — Silgranit-Look, antracit HD", 48900),
        ("BL-MIDA-SIL-VULK", "MIDA — Silgranit-Look, vulkánszürke HD", None),
        ("BL-MIDA-SIL-FEH", "MIDA — Silgranit-Look, fehér HD", None),
        ("BL-MIDA-SIL-TORT", "MIDA — Silgranit-Look, törtfehér HD", None),
        ("BL-MIDA-SIL-KAVE", "MIDA — Silgranit-Look, kávé HD (kifutó, kiadvány szerint)", None),
        ("BL-MIDA-KR", "MIDA — króm HD", 35900),
        ("BL-MIDA-MF", "MIDA — matt fekete HD", 52900),
        ("BL-MILI-AK", "MILI — Silgranit-Look kétszínű, antracit/króm HD", 46900),
        ("BL-MILI-VK", "MILI — Silgranit-Look kétszínű, vulkánszürke/króm HD", None),
        ("BL-MILI-FK", "MILI — Silgranit-Look kétszínű, fehér/króm HD", None),
        ("BL-MILI-TK", "MILI — Silgranit-Look kétszínű, törtfehér/króm HD", None),
    ]
    for code, name, p in carry_retail(taps_bl_raw):
        taps.append({"brand": "Blanco", "code": code, "name": name, "retail": int(p)})

    bundles = []
    for brand, code, name, retail in [
        (
            "Bosch",
            "BOS-SZETT-1",
            "Bosch #1 — gőz sütő HQA534EB3 + indukció PUE611BB5E + mosogatógép SMV2HVX02E (kiadvány szettár)",
            344100,
        ),
        (
            "Bosch",
            "BOS-SZETT-2",
            "Bosch #2 — sütő HBF133BR0 + főzőlap PKE645BA2E + mosogatógép SMV41D10EU (kiadvány szettár)",
            444600,
        ),
        (
            "Bosch",
            "BOS-SZETT-3",
            "Bosch #3 — főzőlap PKE645BA2E + sütő HBF133BR0 (kiadvány szettár)",
            199600,
        ),
        (
            "Bosch",
            "BOS-SZETT-4",
            "Bosch #4 — gőz sütő HQA534EB3 + indukció PUE611BB5E (kiadvány szettár)",
            268500,
        ),
        ("Evido", "EVI-SZETT-1", "Evido #1 — Murano 60W gáz + Level 60W sütő, fehér (kiadvány)", 202500),
        ("Evido", "EVI-SZETT-2", "Evido #2 — Vetro 60BB indukció + Level 60X sütő, inox (kiadvány)", 181100),
        ("Evido", "EVI-SZETT-3", "Evido #3 — Vetro 60CB üvegkerámia + Level 60X sütő, inox (kiadvány)", 170300),
    ]:
        bundles.append({"brand": brand, "code": code, "name": name, "retail": int(retail)})

    root = Path(__file__).resolve().parent.parent
    out_path = root / "divian-extras-kiadvany.js"
    trays_div_j = [{"code": a, "name": b, "retail": c} for a, b, c in trays_div]
    trays_bl_j = [{"code": a, "name": b, "retail": c} for a, b, c in trays_bl]

    parts = [
        "/**",
        " * Hello Budapest kiadvány (divian_hello_budapest PDF — tálcák 29–33. o., csapok 34. o.).",
        " * Csak a kiadványban szereplő márkák és tételek:",
        " * — Gépek: Whirlpool, Bosch, Evido (tartalomjegyzék szerint).",
        " * — Mosogatótálcák: Divian + Blanco fejezet.",
        " * — Csaptelepek: Divian + Blanco fejezet (Franke/Grohe/stb. nincs a kiadványban).",
        " * — Szettek: külön bundles tömb (minden márka); egy szett egy sor az ajánlatban.",
        " * Az árak a retail mezőben (Ft); forrás: scripts/gen_kiadvany_extras.py + divian_hello_budapest PDF (Blanco tálcák: 5 Silgranit szín soronként; csapok: None = előző ár).",
        " */",
        "window.DIVIAN_EXTRAS_KIADVANY = {",
        "  appliances: " + json.dumps(appliances, ensure_ascii=False, indent=2) + ",",
        "  bundles: " + json.dumps(bundles, ensure_ascii=False, indent=2) + ",",
        "  traysDivian: " + json.dumps(trays_div_j, ensure_ascii=False, indent=2) + ",",
        "  traysBlanco: " + json.dumps(trays_bl_j, ensure_ascii=False, indent=2) + ",",
        "  taps: " + json.dumps(taps, ensure_ascii=False, indent=2),
        "};",
        "",
    ]
    out_path.write_text("\n".join(parts), encoding="utf-8")
    print(
        "Wrote",
        out_path,
        "| appliances",
        len(appliances),
        "traysDivian",
        len(trays_div_j),
        "traysBlanco",
        len(trays_bl_j),
        "taps",
        len(taps),
        "bundles",
        len(bundles),
    )


if __name__ == "__main__":
    main()
