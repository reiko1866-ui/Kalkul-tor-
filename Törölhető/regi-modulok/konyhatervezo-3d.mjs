/**
 * 3D nézet – procedural „katalógus-szerű” szekrény: lábazat, lekerekített test,
 * ajtó/fiók felületek (nem egyszerű hasáb). Illusztráció; nem gyártmány-pontos mesh.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const CM = 0.01;

function parseHex(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return 0xc4b8a8;
  return parseInt(h, 16);
}

function darkenColor(hex, factor = 0.82) {
  const c = new THREE.Color(hex);
  c.r *= factor;
  c.g *= factor;
  c.b *= factor;
  return c;
}

function handleAccentColor(id) {
  if (!id || id === "none") return 0x333333;
  if (id.includes("krom")) return 0xc0c8d0;
  if (id.includes("arany") || id.includes("rosegold")) return 0xc9a227;
  if (id.includes("feher")) return 0xeeeeee;
  return 0x2a2a2a;
}

function matPhysical(color, rough = 0.42, metal = 0.08) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: metal,
    clearcoat: 0.15,
    clearcoatRoughness: 0.32
  });
}

function makeWoodTexture(THREE, hexInt) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const c2 = c.getContext("2d");
  const col = new THREE.Color(hexInt);
  c2.fillStyle = `#${col.getHexString()}`;
  c2.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 55; i += 1) {
    c2.strokeStyle = `rgba(45, 32, 20, ${0.04 + Math.random() * 0.08})`;
    c2.lineWidth = 0.5 + Math.random();
    c2.beginPath();
    c2.moveTo(Math.random() * 256, 0);
    c2.bezierCurveTo(
      Math.random() * 256,
      100,
      Math.random() * 256,
      180,
      Math.random() * 256,
      256
    );
    c2.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.2, 1.2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorPlankTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const c2 = c.getContext("2d");
  c2.fillStyle = "#e3d6c4";
  c2.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) {
    c2.fillStyle = `rgba(90, 70, 50, ${0.04 + (y % 64) * 0.0005})`;
    c2.fillRect(0, y, 512, 2);
  }
  for (let i = 0; i < 30; i += 1) {
    c2.strokeStyle = "rgba(120, 100, 80, 0.06)";
    c2.beginPath();
    c2.moveTo(0, i * 17);
    c2.lineTo(512, i * 17 + 9);
    c2.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObject3D(obj) {
  obj.traverse((ch) => {
    if (ch.geometry) ch.geometry.dispose();
    const m = ch.material;
    if (m) {
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

/** Alsó / magas: lábazat magasság */
const PLINTH_H = 0.1;
const EDGE_R = 0.014;

function inferFacade(moduleCode, kind, widthM) {
  const c = String(moduleCode || "").toUpperCase();
  if (kind === "appliance") return "mark";
  if (c.startsWith("AF")) return "drawers";
  if (kind === "tall") return "tallDoors";
  if (kind === "upper") return widthM > 0.62 ? "twoDoors" : "oneDoor";
  if (c.startsWith("AMO")) return "oneDoor";
  if (c.startsWith("AAFE")) return widthM > 0.65 ? "twoDoors" : "oneDoor";
  return widthM > 0.78 ? "twoDoors" : "oneDoor";
}

/**
 * Összeállít egy szekrény csoportot: test + opcionális lábazat + homlokzati panelek + munkalap.
 */
function buildCabinetUnit(it, frontColor, handleColor, options) {
  const { w, h, d, kind } = it;
  const code = it.moduleCode || "";
  const facade = inferFacade(code, kind, w);

  const group = new THREE.Group();
  const frontMat = matPhysical(frontColor, 0.38, 0.06);
  const sideMat = matPhysical(darkenColor(frontColor, 0.88).getHex(), 0.48, 0.04);
  const plinthMat = matPhysical(0x2c2c2c, 0.75, 0.15);

  const hasPlinth =
    kind === "lower" || (kind === "tall" && h > 1.2);
  const kickH = hasPlinth ? PLINTH_H : 0;
  const bodyH = Math.max(0.05, h - kickH);

  if (facade === "mark") {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.025, d),
      matPhysical(0xc6b0d4, 0.55, 0.02)
    );
    plate.material.transparent = true;
    plate.material.opacity = 0.65;
    plate.position.set(0, 0.012, 0);
    group.add(plate);
    return group;
  }

  // Lábazat
  if (kickH > 0) {
    const kick = new THREE.Mesh(
      new RoundedBoxGeometry(
        w - 0.006,
        kickH - 0.01,
        d - 0.02,
        2,
        EDGE_R * 0.6
      ),
      plinthMat
    );
    kick.position.set(0, kickH / 2, 0);
    kick.castShadow = true;
    group.add(kick);
  }

  // Fő test (szekrénydoboz)
  const carcass = new THREE.Mesh(
    new RoundedBoxGeometry(
      w - 0.004,
      bodyH - 0.006,
      d - 0.006,
      3,
      EDGE_R
    ),
    sideMat
  );
  carcass.castShadow = true;
  carcass.receiveShadow = true;
  carcass.position.set(0, kickH + bodyH / 2, 0);
  group.add(carcass);

  const fz = d / 2 - 0.012;
  const fh = bodyH - 0.04;
  const gap = 0.008;

  // Homlokzat panelek (front +Z irány, helyi koordináta a csoportban)
  function addFrontPlane(pw, ph, px, py, mat = frontMat) {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(pw - gap, ph - gap, 0.018, 2, 0.004),
      mat
    );
    m.position.set(px, kickH + bodyH / 2 + py, fz + 0.01);
    group.add(m);
    return m;
  }

  if (facade === "drawers") {
    const rows = 3;
    const rowH = fh / rows;
    for (let i = 0; i < rows; i += 1) {
      const yOff = -fh / 2 + rowH * (i + 0.5);
      addFrontPlane(w, rowH, 0, yOff);
    }
  } else if (facade === "twoDoors" || facade === "tallDoors") {
    const dw = (w - gap * 3) / 2;
    addFrontPlane(dw, fh, -w / 4 - gap / 4, 0);
    addFrontPlane(dw, fh, w / 4 + gap / 4, 0);
  } else {
    addFrontPlane(w, fh, 0, 0);
  }

  if (
    facade !== "mark" &&
    (kind === "lower" || kind === "tall") &&
    options.worktopTex
  ) {
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.01, 0.026, d - 0.01),
      new THREE.MeshStandardMaterial({
        map: options.worktopTex,
        roughness: 0.48,
        metalness: 0.03
      })
    );
    top.position.set(0, kickH + bodyH + 0.015, 0);
    top.castShadow = true;
    group.add(top);
  }

  // Fogantyú sáv (illusztráció)
  if (options.handleId && options.handleId !== "none") {
    const barLen = Math.min(w * 0.55, 0.42);
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, barLen, 16),
      matPhysical(handleColor, 0.28, 0.7)
    );
    bar.rotation.z = Math.PI / 2;
    const hy = kickH + bodyH * (facade === "drawers" ? 0.72 : 0.55);
    bar.position.set(0, hy, fz + 0.035);
    if (facade === "twoDoors" || facade === "tallDoors") {
      bar.scale.set(1, 1, 1);
      const b2 = bar.clone();
      bar.position.set(-w / 5, hy, fz + 0.035);
      b2.position.set(w / 5, hy, fz + 0.035);
      group.add(bar);
      group.add(b2);
    } else {
      group.add(bar);
    }
  }

  try {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(carcass.geometry),
      new THREE.LineBasicMaterial({
        color: 0x1a1a1a,
        transparent: true,
        opacity: 0.11
      })
    );
    edges.position.copy(carcass.position);
    group.add(edges);
  } catch (_e) {
    /* rounded geom edge opcionális */
  }

  const wrapBox = new THREE.Box3().setFromObject(group);
  if (Number.isFinite(wrapBox.min.y) && wrapBox.min.y < -0.001) {
    group.position.y -= wrapBox.min.y;
  }

  return group;
}

export function initKitchen3D(containerEl) {
  if (!containerEl) return;
  if (!window.DivianPlanner) {
    console.warn(
      "[3D] DivianPlanner még nincs – a konyhatervezo.js-nek meg kell előtte futnia."
    );
    return;
  }

  const worktopTex = makeWoodTexture(THREE, 0xc9a778);
  const floorTex = makeFloorPlankTexture(THREE);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f1);
  scene.fog = new THREE.Fog(0xf2f4f1, 12, 42);

  const room = new THREE.Group();
  scene.add(room);

  const ambient = new THREE.HemisphereLight(0xfff8f0, 0xc8d4cc, 0.85);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xfff5ec, 1.05);
  dir.position.set(6, 14, 9);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.bias = -0.00015;
  scene.add(dir);
  const soft = new THREE.DirectionalLight(0xb8ccf8, 0.35);
  soft.position.set(-10, 8, -6);
  scene.add(soft);
  const bounce = new THREE.PointLight(0xffeedd, 0.22, 12);
  bounce.position.set(2, 2.2, 3);
  scene.add(bounce);

  /** 3D panel gyakran display:none-nal tölt be → 0×0 méret; nélküle aspect=0, üres / szürke kép. */
  function readHostSize() {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    const fallbackW = 640;
    const fallbackH = 420;
    return {
      w: w > 8 ? w : fallbackW,
      h: h > 8 ? h : fallbackH
    };
  }

  const { w: initW, h: initH } = readHostSize();
  const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.08, 200);
  camera.position.set(3.4, 2.45, 4.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(initW, initH);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  containerEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(1.6, 0.95, 1.1);
  controls.maxPolarAngle = Math.PI / 2 - 0.06;

  const cabinetsGroup = new THREE.Group();
  room.add(cabinetsGroup);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.88,
      metalness: 0.02,
      color: 0xffffff
    });

  function rebuild() {
    while (cabinetsGroup.children.length) {
      const o = cabinetsGroup.children[0];
      disposeObject3D(o);
      cabinetsGroup.remove(o);
    }

    const st = window.DivianPlanner.getState();
    const data = window.DIVIAN_PLANNER_DATA;
    if (!data || !Array.isArray(data.fronts) || !data.fronts.length) {
      console.warn("[3D] DIVIAN_PLANNER_DATA.fronts hiányzik.");
      return;
    }
    const front = data.fronts.find((f) => f.id === st.frontId) || data.fronts[0];
    const frontColor = parseHex(front.hex);
    const handleColor = handleAccentColor(st.handleId);

    const W1 = st.mainWallCm * CM;
    const W2 = st.returnWallCm * CM;

    const layout = st.layout;
    let maxZ = st.roomDepthCm * CM;
    if (layout === "l") {
      maxZ = Math.max(st.roomDepthCm, st.returnWallCm) * CM;
    }

    const fpW = Math.max(W1, maxZ) + 1.2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fpW, fpW), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.set(W1 / 2, 0, maxZ / 2);
    cabinetsGroup.add(floor);

    const wallMat = matPhysical(0xc8c8c8, 0.78, 0.03);
    const wallT = 0.07;
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(W1 + 0.25, 2.65, wallT),
      wallMat
    );
    backWall.position.set(W1 / 2, 1.33, -wallT / 2);
    backWall.receiveShadow = true;
    backWall.castShadow = true;
    cabinetsGroup.add(backWall);

    if (layout === "l") {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallT, 2.65, W2 + 0.2),
        wallMat
      );
      sideWall.position.set(W1 + wallT / 2, 1.33, W2 / 2);
      cabinetsGroup.add(sideWall);
    }

    for (const it of st.items) {
      const wCm = Number(it.w) || 60;
      const dCm = Number(it.d) || 56;
      const w = wCm * CM;
      const d = dCm * CM;
      const hRaw =
        it.h ||
        (it.kind === "upper" ? 72 : it.kind === "tall" ? 220 : 87);
      const h = Number(hRaw) * CM;

      const itFull = { ...it, moduleCode: it.moduleCode, w, h, d };
      let unit;
      try {
        unit = buildCabinetUnit(itFull, frontColor, handleColor, {
          handleId: st.handleId,
          worktopTex
        });
      } catch (e) {
        console.warn("[3D] Elem kihagyva:", it.moduleCode, e);
        continue;
      }

      const onWall0 = st.layout === "straight" || it.wall === 0;

      let baseY = 0;
      if (it.kind === "upper") {
        baseY = 1.44;
      }

      const tM = Number(it.t) * CM || 0;
      if (onWall0) {
        unit.position.set(tM + w / 2, baseY, d / 2);
      } else {
        unit.position.set(W1 - d / 2, baseY, tM + w / 2);
        unit.rotation.y = -Math.PI / 2;
      }

      cabinetsGroup.add(unit);
    }

    const box = new THREE.Box3().setFromObject(cabinetsGroup);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
        controls.target.copy(center);
      }
    }
  }

  let raf = 0;
  function loop() {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  function onResize() {
    const { w, h } = readHostSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener("resize", onResize);
  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => onResize())
      : null;
  if (ro) ro.observe(containerEl);

  window.DivianPlanner.subscribe(() => rebuild());
  rebuild();
  requestAnimationFrame(() => onResize());

  return {
    dispose() {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      containerEl.innerHTML = "";
    }
  };
}
