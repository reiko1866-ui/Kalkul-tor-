/**
 * Divian – lakossági 2D + 3D konyhatervező (Homelux-szerű folyamat, Divian elemek és színek).
 */
(function () {
  const DATA = window.DIVIAN_PLANNER_DATA;
  if (!DATA) {
    console.error("DIVIAN_PLANNER_DATA hiányzik – töltsd be előbb a divian-planner-data.js-t.");
    return;
  }

  let MODULES =
    Array.isArray(window.DIVIAN_PLANNER_MODULES) && window.DIVIAN_PLANNER_MODULES.length > 0
      ? [...window.DIVIAN_PLANNER_MODULES]
      : Array.isArray(DATA.modules)
        ? [...DATA.modules]
        : [];
  const seenCodes = new Set(MODULES.map((m) => m.code));
  for (const x of DATA.modules || []) {
    if (x && x.code && !seenCodes.has(x.code)) {
      MODULES.push(x);
      seenCodes.add(x.code);
    }
  }

  let moduleFilter = "";

  const listeners = [];

  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    if (h.length !== 6) return { r: 200, g: 190, b: 175 };
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    const x = (n) => n.toString(16).padStart(2, "0");
    return `#${x(clampByte(r))}${x(clampByte(g))}${x(clampByte(b))}`;
  }

  function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function blendHex(frontHex, baseHex, t) {
    const a = hexToRgb(frontHex);
    const b = hexToRgb(baseHex);
    return rgbToHex(
      a.r * t + b.r * (1 - t),
      a.g * t + b.g * (1 - t),
      a.b * t + b.b * (1 - t)
    );
  }

  function kindBaseHex(kind) {
    if (kind === "upper") return "#a8c8d8";
    if (kind === "tall") return "#d4c4a8";
    if (kind === "appliance") return "#e2d0ee";
    return "#b8d4a0";
  }

  const COLORS = {
    lowerStroke: "#2a4a22",
    upperStroke: "#2a4f5c",
    tallStroke: "#5c4a30",
    applianceStroke: "#5a3d6b",
    selected: "#d96614",
    wall: "#8e8e8e",
    wallDark: "#6e6e6e",
    floor: "#e8d9c4",
    floorAlt: "#dcc9ae",
    dim: "#222222",
    worktop: "#c4a574"
  };

  /** Fal vastagság a képernyőn (műszaki alaprajz jelleg) */
  const WALL_SCREEN_PX = 14;
  const DIM_GAP = 28;

  const canvas = document.getElementById("planCanvas");
  const ctx = canvas.getContext("2d");

  const defaultFront = DATA.fronts[0]?.id || "sm-feher";
  const defaultHandle = DATA.handles[0]?.id || "none";

  const state = {
    layout: "straight",
    mainWallCm: 360,
    returnWallCm: 240,
    roomDepthCm: 280,
    items: [],
    selectedId: null,
    drag: null,
    frontId: defaultFront,
    handleId: defaultHandle
  };

  let scale = 1;
  const PAD = 64;

  function getFrontHex() {
    const f = DATA.fronts.find((x) => x.id === state.frontId);
    return f?.hex || "#f4f3ef";
  }

  function uid() {
    return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function notify() {
    draw();
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (_e) {
        /* ignore */
      }
    });
  }

  function roomBBoxCm() {
    if (state.layout === "straight") {
      return { W: state.mainWallCm, H: state.roomDepthCm, ox: 0, oy: 0 };
    }
    const W1 = state.mainWallCm;
    const W2 = state.returnWallCm;
    const D = state.roomDepthCm;
    return { W: W1, H: Math.max(D, W2), ox: 0, oy: 0 };
  }

  function worldToCanvas(xCm, yCm, bbox) {
    const x = PAD + xCm * scale;
    const y = PAD + (bbox.H - yCm) * scale;
    return { x, y };
  }

  function canvasToWorld(px, py, bbox) {
    const xCm = (px - PAD) / scale;
    const yCm = bbox.H - (py - PAD) / scale;
    return { xCm, yCm };
  }

  function adjustLum(hex, factor) {
    const rgb = hexToRgb(hex);
    return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
  }

  function woodCabinetFill(ctx, rx, ry, rw, rh, frontHex, kind) {
    const base = blendHex(frontHex, kindBaseHex(kind), 0.66);
    const g = ctx.createLinearGradient(rx, ry, rx + rw * 0.85, ry + rh);
    g.addColorStop(0, adjustLum(base, 1.08));
    g.addColorStop(0.5, base);
    g.addColorStop(1, adjustLum(base, 0.87));
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "rgba(45, 38, 28, 0.14)";
    ctx.lineWidth = 1;
    const n = Math.max(2, 5 + Math.floor(rw / 45));
    for (let i = 0; i < n; i += 1) {
      ctx.beginPath();
      const t = i / (n - 0.01);
      ctx.moveTo(rx + t * rw * 0.92, ry + 2);
      ctx.lineTo(rx + t * rw * 0.92 + rw * 0.06, ry + rh - 2);
      ctx.stroke();
    }
  }

  function drawDimH(ctx, x1, x2, y, label) {
    ctx.strokeStyle = COLORS.dim;
    ctx.fillStyle = COLORS.dim;
    ctx.lineWidth = 1;
    const t = 5;
    ctx.beginPath();
    ctx.moveTo(x1, y - t);
    ctx.lineTo(x1, y + t);
    ctx.moveTo(x2, y - t);
    ctx.lineTo(x2, y + t);
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.font = "600 11px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, (x1 + x2) / 2, y + 16);
  }

  function drawDimV(ctx, yTop, yBot, x, label) {
    ctx.strokeStyle = COLORS.dim;
    ctx.fillStyle = COLORS.dim;
    ctx.lineWidth = 1;
    const t = 5;
    ctx.beginPath();
    ctx.moveTo(x - t, yTop);
    ctx.lineTo(x + t, yTop);
    ctx.moveTo(x - t, yBot);
    ctx.lineTo(x + t, yBot);
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
    ctx.save();
    ctx.translate(x - 16, (yTop + yBot) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = "600 11px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawFloorDimensions(ctx, bbox) {
    const W = bbox.W;
    const D = bbox.H;
    const pBl = worldToCanvas(0, 0, bbox);
    const pBr = worldToCanvas(W, 0, bbox);
    const pTl = worldToCanvas(0, D, bbox);
    const yBelow = pBl.y + WALL_SCREEN_PX / 2 + DIM_GAP;
    drawDimH(ctx, pBl.x, pBr.x, yBelow, `${Math.round(W)} cm`);
    const xLeft = pTl.x - DIM_GAP;
    drawDimV(ctx, pTl.y, pBl.y, xLeft, `${Math.round(D)} cm`);
  }

  function draw() {
    const bbox = roomBBoxCm();
    const parentW = canvas.parentElement
      ? canvas.parentElement.clientWidth
      : window.innerWidth;
    const cw = Math.max(420, (parentW || window.innerWidth) - 32);
    const ch = Math.min(520, Math.max(380, cw * 0.62));
    canvas.width = Math.floor(cw);
    canvas.height = Math.floor(ch);
    scale = Math.min((cw - PAD * 2) / bbox.W, (ch - PAD * 2) / bbox.H);

    ctx.fillStyle = "#cdc9c2";
    ctx.fillRect(0, 0, cw, ch);

    if (state.layout === "straight") {
      drawStraightRoom(bbox);
    } else {
      drawLRoom(bbox);
    }

    for (const it of state.items) {
      drawItem(it, bbox);
    }

    drawFloorDimensions(ctx, bbox);

    ctx.fillStyle = "rgba(35, 42, 38, 0.75)";
    ctx.font = "600 12px Manrope, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      "2D: fentről nézve · műszaki alaprajz (tájékoztató) · Divian front előnézet",
      PAD,
      20
    );
  }

  function drawStraightRoom(bbox) {
    const W = bbox.W;
    const D = bbox.H;
    const p00 = worldToCanvas(0, 0, bbox);
    const pW0 = worldToCanvas(W, 0, bbox);
    const pWD = worldToCanvas(W, D, bbox);
    const p0D = worldToCanvas(0, D, bbox);

    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(pW0.x, pW0.y);
    ctx.lineTo(pWD.x, pWD.y);
    ctx.lineTo(p0D.x, p0D.y);
    ctx.closePath();
    const fg = ctx.createLinearGradient(p0D.x, p0D.y, pWD.x, pWD.y);
    fg.addColorStop(0, COLORS.floor);
    fg.addColorStop(1, COLORS.floorAlt);
    ctx.fillStyle = fg;
    ctx.fill();

    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = WALL_SCREEN_PX;
    ctx.lineJoin = "miter";
    ctx.miterLimit = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(pW0.x, pW0.y);
    ctx.lineTo(pWD.x, pWD.y);
    ctx.lineTo(p0D.x, p0D.y);
    ctx.closePath();
    ctx.strokeStyle = COLORS.wallDark;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawLRoom(bbox) {
    const W1 = state.mainWallCm;
    const W2 = state.returnWallCm;
    const D = state.roomDepthCm;

    function fillWorldRect(x0, y0, x1, y1) {
      const a = worldToCanvas(x0, y0, bbox);
      const b = worldToCanvas(x1, y1, bbox);
      const rx = Math.min(a.x, b.x);
      const ry = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x);
      const rh = Math.abs(b.y - a.y);
      const g = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
      g.addColorStop(0, COLORS.floor);
      g.addColorStop(1, COLORS.floorAlt);
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    }

    fillWorldRect(0, 0, W1, D);
    fillWorldRect(W1 - 95, 0, W1, W2);

    const maxY = Math.max(D, W2);
    const p00 = worldToCanvas(0, 0, bbox);
    const tl = worldToCanvas(0, maxY, bbox);
    const br = worldToCanvas(W1, 0, bbox);
    const rx = Math.min(tl.x, br.x);
    const ry = Math.min(tl.y, br.y);
    const rw = Math.abs(br.x - tl.x);
    const rh = Math.abs(br.y - tl.y);
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = WALL_SCREEN_PX;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.strokeStyle = COLORS.wallDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    const pW10 = worldToCanvas(W1, 0, bbox);
    const pW1W2 = worldToCanvas(W1, W2, bbox);
    ctx.strokeStyle = COLORS.wallDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(pW10.x, pW10.y);
    ctx.lineTo(pW1W2.x, pW1W2.y);
    ctx.stroke();
  }

  function wallGeometry(it) {
    const W1 = state.mainWallCm;
    const W2 = state.returnWallCm;
    if (state.layout === "straight" || it.wall === 0) {
      return { alongMax: W1 - it.w, wall: 0 };
    }
    return { alongMax: W2 - it.w, wall: 1 };
  }

  function drawItemSymbols(ctx, it, rx, ry, rw, rh) {
    const code = (it.moduleCode || "").toUpperCase();
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    ctx.save();
    if (code === "PLACE-SINK" || code.startsWith("AMO")) {
      ctx.strokeStyle = "rgba(70, 90, 120, 0.55)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.ellipse(cx, cy + rh * 0.06, rw * 0.3, rh * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - rh * 0.12, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(120, 130, 140, 0.5)";
      ctx.fill();
    } else if (code === "PLACE-HOB") {
      ctx.fillStyle = "rgba(50, 50, 50, 0.35)";
      const r = Math.min(rw, rh) * 0.1;
      for (let i = 0; i < 2; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          ctx.beginPath();
          ctx.arc(
            rx + rw * (0.28 + i * 0.44),
            ry + rh * (0.3 + j * 0.4),
            r,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    } else if (code === "PLACE-FRIDGE") {
      ctx.strokeStyle = "rgba(60, 60, 60, 0.45)";
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + rw * 0.08, ry + rh * 0.1, rw * 0.35, rh * 0.8);
      ctx.strokeRect(rx + rw * 0.52, ry + rh * 0.1, rw * 0.35, rh * 0.8);
    } else if (code.startsWith("AF")) {
      ctx.strokeStyle = "rgba(40, 40, 40, 0.2)";
      ctx.lineWidth = 1;
      for (let k = 1; k <= 2; k += 1) {
        const yy = ry + (rh * k) / 3;
        ctx.beginPath();
        ctx.moveTo(rx + 4, yy);
        ctx.lineTo(rx + rw - 4, yy);
        ctx.stroke();
      }
    } else if (it.kind === "upper") {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(40, 70, 90, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 3, ry + 3, rw - 6, rh - 6);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawItem(it, bbox) {
    const fh = getFrontHex();
    let stroke = COLORS.lowerStroke;
    if (it.kind === "upper") stroke = COLORS.upperStroke;
    else if (it.kind === "tall") stroke = COLORS.tallStroke;
    else if (it.kind === "appliance") stroke = COLORS.applianceStroke;

    const sel = it.id === state.selectedId;
    if (sel) stroke = COLORS.selected;

    let x0;
    let y0;
    let x1;
    let y1;

    if (state.layout === "straight" || it.wall === 0) {
      const t = it.t;
      const w = it.w;
      const d = it.d;
      x0 = t;
      y0 = 0;
      x1 = t + w;
      y1 = d;
    } else {
      const t = it.t;
      const w = it.w;
      const d = it.d;
      const W1 = state.mainWallCm;
      x0 = W1 - d;
      y0 = t;
      x1 = W1;
      y1 = t + w;
    }

    const c00 = worldToCanvas(x0, y0, bbox);
    const c11 = worldToCanvas(x1, y1, bbox);
    const rx = Math.min(c00.x, c11.x);
    const ry = Math.min(c00.y, c11.y);
    const rw = Math.abs(c11.x - c00.x);
    const rh = Math.abs(c11.y - c00.y);

    if (it.kind === "appliance" && it.moduleCode && it.moduleCode.startsWith("PLACE")) {
      ctx.fillStyle = "rgba(220, 210, 235, 0.55)";
      ctx.fillRect(rx, ry, rw, rh);
    } else {
      woodCabinetFill(ctx, rx, ry, rw, rh, fh, it.kind);
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeRect(rx, ry, rw, rh);

    if (it.kind === "lower" && rw > 55 && !String(it.moduleCode || "").startsWith("PLACE")) {
      ctx.strokeStyle = "rgba(30, 25, 15, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 5, ry + 5, rw / 2 - 7, rh - 10);
      ctx.strokeRect(rx + rw / 2 + 2, ry + 5, rw / 2 - 7, rh - 10);
    }

    drawItemSymbols(ctx, it, rx, ry, rw, rh);

    ctx.fillStyle = "rgba(28, 32, 30, 0.92)";
    ctx.font = "600 10px Manrope, sans-serif";
    ctx.textAlign = "left";
    const label = (it.moduleCode || it.label || "").slice(0, 14);
    ctx.fillText(label, rx + 5, ry + 13);
  }

  function clsForKind(kind) {
    if (kind === "upper") return "pal-upper";
    if (kind === "tall") return "pal-tall";
    if (kind === "appliance") return "pal-appliance";
    return "pal-lower";
  }

  function addFromPalette(code) {
    const def = MODULES.find((m) => m.code === code);
    if (!def) return;

    const id = uid();
    const item = {
      id,
      moduleCode: def.code,
      label: def.label,
      kind: def.kind,
      w: def.w,
      d: def.d,
      h:
        def.h != null
          ? def.h
          : def.kind === "upper"
            ? 72
            : def.kind === "tall"
              ? 210
              : 87,
      wall: 0,
      t: 0
    };

    const geom = wallGeometry(item);
    let t = 0;
    for (const other of state.items) {
      if (other.wall !== item.wall) continue;
      t = Math.max(t, other.t + other.w);
    }
    item.t = clamp(t, 0, Math.max(0, geom.alongMax));

    state.items.push(item);
    state.selectedId = id;
    syncSummary();
    notify();
  }

  function hitTest(mx, my) {
    const bbox = roomBBoxCm();
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const it = state.items[i];
      let x0;
      let y0;
      let x1;
      let y1;
      if (state.layout === "straight" || it.wall === 0) {
        x0 = it.t;
        y0 = 0;
        x1 = it.t + it.w;
        y1 = it.d;
      } else {
        const W1 = state.mainWallCm;
        x0 = W1 - it.d;
        y0 = it.t;
        x1 = W1;
        y1 = it.t + it.w;
      }
      const c00 = worldToCanvas(x0, y0, bbox);
      const c11 = worldToCanvas(x1, y1, bbox);
      const rx = Math.min(c00.x, c11.x);
      const ry = Math.min(c00.y, c11.y);
      const rw = Math.abs(c11.x - c00.x);
      const rh = Math.abs(c11.y - c00.y);
      if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
        return it;
      }
    }
    return null;
  }

  function pickWall(mx, my) {
    const bbox = roomBBoxCm();
    const w = canvasToWorld(mx, my, bbox);
    if (state.layout === "straight") {
      return { wall: 0, t: clamp(w.xCm, 0, state.mainWallCm) };
    }
    const W1 = state.mainWallCm;
    const W2 = state.returnWallCm;
    const D = state.roomDepthCm;
    const dBottom = Math.abs(w.yCm);
    const dRight = Math.abs(w.xCm - W1);
    const inBottomStrip =
      w.xCm >= 0 && w.xCm <= W1 && w.yCm >= 0 && w.yCm <= D + 1;
    const inRightStrip =
      w.yCm >= 0 &&
      w.yCm <= W2 + 1 &&
      w.xCm >= W1 - 110 &&
      w.xCm <= W1 + 1;
    if (inBottomStrip && dBottom <= dRight) {
      return { wall: 0, t: clamp(w.xCm, 0, W1) };
    }
    if (inRightStrip) {
      return { wall: 1, t: clamp(w.yCm, 0, W2) };
    }
    return dBottom <= dRight
      ? { wall: 0, t: clamp(w.xCm, 0, W1) }
      : { wall: 1, t: clamp(w.yCm, 0, W2) };
  }

  function onPointerDown(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const hit = hitTest(mx, my);
    if (hit) {
      state.selectedId = hit.id;
      state.drag = {
        id: hit.id,
        wall: hit.wall,
        offsetAlong: hit.t
      };
    } else {
      state.selectedId = null;
      state.drag = null;
    }
    notify();
    syncSummary();
  }

  function onPointerMove(e) {
    if (!state.drag) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const pick = pickWall(mx, my);
    const it = state.items.find((x) => x.id === state.drag.id);
    if (!it) return;

    it.wall = state.layout === "straight" ? 0 : pick.wall;
    const g = wallGeometry(it);
    const pointer = canvasToWorld(mx, my, roomBBoxCm());
    if (it.wall === 0) {
      it.t = clamp(pointer.xCm - it.w / 2, 0, g.alongMax);
    } else {
      it.t = clamp(pointer.yCm - it.w / 2, 0, g.alongMax);
    }
    notify();
    syncSummary();
  }

  function onPointerUp() {
    state.drag = null;
  }

  function syncSummary() {
    const ul = document.getElementById("summaryUl");
    if (!ul) return;
    ul.innerHTML = "";
    state.items.forEach((it) => {
      const li = document.createElement("li");
      const wallLabel =
        state.layout === "straight"
          ? "fő fal"
          : it.wall === 0
            ? "alsó fal"
            : "merőleges fal";
      const code = it.moduleCode ? ` · ${it.moduleCode}` : "";
      li.innerHTML = `<span>${it.label}${code}</span><span>${it.w}×${it.d} cm · ${wallLabel}</span>`;
      ul.appendChild(li);
    });
    if (!state.items.length) {
      const li = document.createElement("li");
      li.style.color = "var(--muted)";
      li.style.border = "none";
      li.textContent = "Még nincs elem – válassz elemjegyzék típust balra.";
      ul.appendChild(li);
    }
  }

  function collectPayload() {
    const bbox = roomBBoxCm();
    const front = DATA.fronts.find((f) => f.id === state.frontId);
    const handle = DATA.handles.find((h) => h.id === state.handleId);
    const today = new Date().toISOString().slice(0, 10);
    return {
      version: 2,
      product: "Divian lakossági konyhatervező",
      createdAt: new Date().toISOString(),
      divian: {
        elemjegyzekPdf: DATA.pdfSource,
        front: front
          ? { id: front.id, name: front.name, hex: front.hex }
          : null,
        fogantyu: handle
          ? { id: handle.id, name: handle.name, felulet: handle.metal }
          : null
      },
      layout: state.layout,
      room: {
        mainWallCm: state.mainWallCm,
        returnWallCm: state.returnWallCm,
        roomDepthCm: state.roomDepthCm,
        boundingCm: { width: bbox.W, depth: bbox.H }
      },
      items: state.items.map((it) => ({
        moduleCode: it.moduleCode,
        label: it.label,
        kind: it.kind,
        widthCm: it.w,
        depthCm: it.d,
        heightCm: it.h,
        wallIndex: it.wall,
        offsetAlongWallCm: Math.round(it.t * 10) / 10
      })),
      contact: {
        date: document.getElementById("leadDate")?.value || today,
        name: document.getElementById("leadName")?.value?.trim() || "",
        phone: document.getElementById("leadPhone")?.value?.trim() || "",
        email: document.getElementById("leadEmail")?.value?.trim() || "",
        note: document.getElementById("leadNote")?.value?.trim() || ""
      },
      disclaimer:
        "Tájékoztató elrendezés, nem minősül ajánlatnak. Cikkszámok a Divian elemjegyzék PDF-ből – árak nélkül. Végleges ajánlat egyeztetés után."
    };
  }

  function downloadJson() {
    const payload = collectPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `divian-konyha-terv_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function wirePalette() {
    const root = document.getElementById("paletteRoot");
    if (!root) return;
    root.innerHTML = "";

    const groups = [
      { title: "Alsó elemek", kinds: ["lower"] },
      { title: "Felső elemek", kinds: ["upper"] },
      { title: "Magas / kamra", kinds: ["tall"] },
      { title: "Hely kijelölés", kinds: ["appliance"] }
    ];

    function matchesFilter(m) {
      if (!moduleFilter) return true;
      const q = moduleFilter;
      const code = (m.code || "").toLowerCase();
      const lab = (m.label || "").toLowerCase();
      return code.includes(q) || lab.includes(q);
    }

    groups.forEach((g) => {
      const mods = MODULES.filter((m) => g.kinds.includes(m.kind) && matchesFilter(m));
      if (!mods.length) return;
      const h = document.createElement("h4");
      h.className = "palette-group-title";
      h.textContent = g.title;
      root.appendChild(h);
      mods.forEach((m) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = clsForKind(m.kind);
        btn.dataset.code = m.code;
        btn.innerHTML = `<span>${m.label}</span><span class="dim">${m.code} · ${m.w}×${m.d}</span>`;
        btn.addEventListener("click", () => addFromPalette(m.code));
        root.appendChild(btn);
      });
    });

    const hint = document.getElementById("paletteCountHint");
    if (hint) {
      const total = MODULES.filter(matchesFilter).length;
      hint.textContent = total
        ? `${total} elem megjelenítve a szűrő szerint.`
        : "Nincs találat – más keresőszót próbálj.";
    }
  }

  function wireModuleSearch() {
    const inp = document.getElementById("moduleSearch");
    if (!inp) return;
    inp.addEventListener("input", () => {
      moduleFilter = inp.value.trim().toLowerCase();
      wirePalette();
    });
  }

  function wireFronts() {
    const wrap = document.getElementById("frontSwatches");
    if (!wrap) return;
    wrap.innerHTML = "";
    DATA.fronts.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.title = f.name;
      b.style.background = f.hex;
      b.dataset.frontId = f.id;
      if (f.id === state.frontId) b.classList.add("is-active");
      b.addEventListener("click", () => {
        state.frontId = f.id;
        wrap.querySelectorAll(".swatch").forEach((el) => el.classList.remove("is-active"));
        b.classList.add("is-active");
        notify();
      });
      wrap.appendChild(b);
    });
  }

  function wireHandles() {
    const sel = document.getElementById("handleSelect");
    if (!sel) return;
    sel.innerHTML = "";
    DATA.handles.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = `${h.name} (${h.metal})`;
      sel.appendChild(opt);
    });
    sel.value = state.handleId;
    sel.addEventListener("change", () => {
      state.handleId = sel.value;
      notify();
    });
  }

  function wireRoomInputs() {
    const layoutEl = document.getElementById("layoutSelect");
    const mainWallEl = document.getElementById("mainWallCm");
    const returnWallEl = document.getElementById("returnWallCm");
    const depthEl = document.getElementById("roomDepthCm");

    function refreshReturnVisibility() {
      const rw = document.getElementById("returnWallWrap");
      if (rw) rw.style.display = layoutEl.value === "l" ? "block" : "none";
    }

    function applyRoom() {
      state.layout = layoutEl.value === "l" ? "l" : "straight";
      state.mainWallCm = clamp(Number(mainWallEl.value) || 300, 180, 600);
      state.returnWallCm = clamp(Number(returnWallEl.value) || 200, 120, 500);
      state.roomDepthCm = clamp(Number(depthEl.value) || 260, 200, 400);
      mainWallEl.value = String(state.mainWallCm);
      returnWallEl.value = String(state.returnWallCm);
      depthEl.value = String(state.roomDepthCm);
      notify();
    }

    layoutEl.addEventListener("change", () => {
      refreshReturnVisibility();
      applyRoom();
    });
    mainWallEl.addEventListener("change", applyRoom);
    returnWallEl.addEventListener("change", applyRoom);
    depthEl.addEventListener("change", applyRoom);
    refreshReturnVisibility();
    applyRoom();
  }

  function wireViewTabs() {
    const tabs = document.querySelectorAll(".view-tab");
    const p2d = document.getElementById("view2dWrap");
    const p3d = document.getElementById("view3dWrap");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const v = tab.dataset.view;
        tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.view === v));
        if (p2d) p2d.classList.toggle("is-hidden", v !== "2d");
        if (p3d) p3d.classList.toggle("is-hidden", v !== "3d");
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      });
    });
  }

  document.getElementById("btnDelete")?.addEventListener("click", () => {
    if (!state.selectedId) return;
    state.items = state.items.filter((x) => x.id !== state.selectedId);
    state.selectedId = null;
    syncSummary();
    notify();
  });

  document.getElementById("btnClear")?.addEventListener("click", () => {
    state.items = [];
    state.selectedId = null;
    syncSummary();
    notify();
  });

  document.getElementById("btnDownload")?.addEventListener("click", downloadJson);
  const leadDateInput = document.getElementById("leadDate");
  if (leadDateInput) leadDateInput.value = new Date().toISOString().slice(0, 10);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);

  wirePalette();
  wireModuleSearch();
  wireFronts();
  wireHandles();
  wireRoomInputs();
  wireViewTabs();
  syncSummary();
  notify();

  window.addEventListener("resize", () => {
    notify();
  });

  window.DivianPlanner = {
    getState: () => ({
      layout: state.layout,
      mainWallCm: state.mainWallCm,
      returnWallCm: state.returnWallCm,
      roomDepthCm: state.roomDepthCm,
      frontId: state.frontId,
      handleId: state.handleId,
      items: state.items.map((it) => ({ ...it }))
    }),
    subscribe: (fn) => {
      listeners.push(fn);
    }
  };
})();
