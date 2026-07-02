/**
 * Divian otthoni tervező – statikus adatok.
 * Cikkszámok forrása: https://divian.hu/data/konyhaarlista.pdf (elemjegyzék, árak nélkül).
 * AI azonosító képek: konyhaarlista-img/ (csak kép, ár/szöveg nélkül — tools/build_konyhaarlista_images.py).
 * Front színek és fogantyú családok: Divian web / kollekciós táblázatok összevetése.
 */
window.DIVIAN_PLANNER_DATA = {
  pdfSource: "https://divian.hu/data/konyhaarlista.pdf",

  /** Szuper matt / fényes / dekorfólia – kód és becsült előnézeti szín */
  fronts: [
    { id: "sm-feher", name: "Szuper matt fehér", hex: "#f4f3ef" },
    { id: "sm-kasmir", name: "Szuper matt kasmír", hex: "#c9bfb2" },
    { id: "sm-provence", name: "Szuper matt Provence", hex: "#a39688" },
    { id: "sm-beige", name: "Szuper matt beige", hex: "#d5cab8" },
    { id: "sm-grafit", name: "Szuper matt grafit", hex: "#4a4e54" },
    { id: "matt-szurke", name: "Matt szürke", hex: "#8a9096" },
    { id: "matt-cappuccino", name: "Matt cappuccino", hex: "#a89282" },
    { id: "fenyes-feher", name: "Fényes fehér", hex: "#ffffff" },
    { id: "fenyes-beige", name: "Fényes beige", hex: "#e9dcc9" },
    { id: "fenyes-cappuccino", name: "Fényes cappuccino", hex: "#c4a892" },
    { id: "fenyes-antracit", name: "Fényes antracit", hex: "#4d5359" },
    { id: "artizan-toergy", name: "Artizán tölgy", hex: "#a88258" },
    { id: "feher-toergy", name: "Fehér tölgy", hex: "#e8dfd2" },
    { id: "beton-feher", name: "Beton fehér", hex: "#e2e4e1" },
    { id: "fjord-zold", name: "Fjord zöld", hex: "#5a6e62" },
    { id: "sonoma", name: "Sonoma tölgy", hex: "#c7a882" },
    { id: "agyagszurke", name: "Agyagszürke", hex: "#9a9690" }
  ],

  /** Fogantyú család + felület (Divian kínálat – típusnevek kollekció szerint) */
  handles: [
    { id: "none", name: "Fogó nélkül / tip-on", metal: "–" },
    { id: "strong-feher", name: "Strong – fehér", metal: "festett" },
    { id: "strong-fekete", name: "Strong – matt fekete", metal: "fém" },
    { id: "strong-krom", name: "Strong – króm", metal: "fém" },
    { id: "strong-arany", name: "Strong – arany", metal: "fém" },
    { id: "silk-fekete", name: "Silk – matt fekete", metal: "fém" },
    { id: "silk-krom", name: "Silk – króm", metal: "fém" },
    { id: "silk-rosegold", name: "Silk – rose gold", metal: "fém" },
    { id: "slim-fekete", name: "Slim – matt fekete", metal: "fém" },
    { id: "slim-krom", name: "Slim – króm", metal: "fém" },
    { id: "lekerekített-fekete", name: "Lekerekített forma – fekete", metal: "fém" },
    { id: "lekerekített-krom", name: "Lekerekített forma – króm", metal: "fém" },
    { id: "szogletes-fekete", name: "Szögletes forma – fekete", metal: "fém" },
    { id: "szogletes-krom", name: "Szögletes forma – króm", metal: "fém" }
  ],

  /**
   * Elemek a konyhaárlista PDF-ből kiolvasott cikkszámokkal.
   * Mélység/magasság tájékoztató; pontos gyártmány a Divian tervezőben egyeztethető.
   */
  modules: [
    { code: "AML25", label: "Alsó elem 25", kind: "lower", w: 25, d: 58, h: 87 },
    { code: "AML30", label: "Alsó elem 30", kind: "lower", w: 30, d: 58, h: 87 },
    { code: "AML35", label: "Alsó elem 35", kind: "lower", w: 35, d: 58, h: 87 },
    { code: "AML40", label: "Alsó elem 40", kind: "lower", w: 40, d: 58, h: 87 },
    { code: "AML45", label: "Alsó elem 45", kind: "lower", w: 45, d: 58, h: 87 },
    { code: "AML50", label: "Alsó elem 50", kind: "lower", w: 50, d: 58, h: 87 },
    { code: "AML60", label: "Alsó elem 60", kind: "lower", w: 60, d: 58, h: 87 },
    { code: "AML80", label: "Alsó elem 80", kind: "lower", w: 80, d: 58, h: 87 },
    { code: "AML90", label: "Alsó elem 90", kind: "lower", w: 90, d: 58, h: 87 },
    { code: "AML100", label: "Alsó elem 100", kind: "lower", w: 100, d: 58, h: 87 },
    { code: "AMO60", label: "Alsó mosogatós 60", kind: "lower", w: 60, d: 58, h: 87 },
    { code: "AMO80", label: "Alsó mosogatós 80", kind: "lower", w: 80, d: 58, h: 87 },
    { code: "AMO90", label: "Alsó mosogatós 90", kind: "lower", w: 90, d: 58, h: 87 },
    { code: "AF45", label: "Alsó fiókos 45", kind: "lower", w: 45, d: 58, h: 87 },
    { code: "AF60", label: "Alsó fiókos 60", kind: "lower", w: 60, d: 58, h: 87 },
    { code: "AF80", label: "Alsó fiókos 80", kind: "lower", w: 80, d: 58, h: 87 },
    { code: "AAFE60", label: "Alsó egyajtós 60", kind: "lower", w: 60, d: 58, h: 87 },
    { code: "AAFE80", label: "Alsó egyajtós 80", kind: "lower", w: 80, d: 58, h: 87 },
    { code: "AKL30", label: "Alsó keskeny 30", kind: "lower", w: 30, d: 58, h: 87 },
    { code: "AKL40", label: "Alsó keskeny 40", kind: "lower", w: 40, d: 58, h: 87 },
    { code: "FMF45", label: "Felső elem 45", kind: "upper", w: 45, d: 35, h: 72 },
    { code: "FMF60", label: "Felső elem 60", kind: "upper", w: 60, d: 35, h: 72 },
    { code: "FMF90", label: "Felső elem 90", kind: "upper", w: 90, d: 35, h: 72 },
    { code: "FFZ60", label: "Felső zárt 60", kind: "upper", w: 60, d: 35, h: 72 },
    { code: "FFZ90", label: "Felső zárt 90", kind: "upper", w: 90, d: 35, h: 72 },
    { code: "FFM60", label: "Felső vitrin 60", kind: "upper", w: 60, d: 35, h: 72 },
    { code: "KMTH60W", label: "Mikrós hely 60", kind: "tall", w: 60, d: 60, h: 220 },
    { code: "AS95", label: "Magas kamraszekrény 95", kind: "tall", w: 95, d: 60, h: 220 },
    { code: "AS110", label: "Magas kamraszekrény 110", kind: "tall", w: 110, d: 60, h: 220 },
    { code: "PLACE-SINK", label: "Mosogató hely (jelölés)", kind: "appliance", w: 80, d: 60, h: 8 },
    { code: "PLACE-HOB", label: "Főzőlap hely (jelölés)", kind: "appliance", w: 60, d: 60, h: 8 },
    { code: "PLACE-FRIDGE", label: "Hűtő hely (jelölés)", kind: "appliance", w: 60, d: 60, h: 200 }
  ]
};
