/* =============================================================================
 * site.js —— 场地与城市环境
 *   · 广场铺装 / 道路 / 交通标线 / 停车场 / 绿化 / 水景
 *   · 精神堡垒、地铁出入口、公交站、路灯、护栏、垃圾桶、旗杆
 *   · 车流与人群（程序化配景）
 *   · 周边城市天际线
 * ========================================================================== */
(function (global) {
  'use strict';
  const W = (global.WANDA = global.WANDA || {});
  const T = global.THREE;
  const U = W.utils;

  /* ============================ 基础铺装工具 ============================ */
  function flat(w, d, tex, tile, y, extra) {
    const mat = new T.MeshStandardMaterial(Object.assign({
      map: U.cloneTex(tex, w / tile, d / tile),
      roughness: 0.95, metalness: 0.02, envMapIntensity: 0.35
    }, extra || {}));
    const m = new T.Mesh(new T.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y || 0;
    m.receiveShadow = true;
    return m;
  }

  /* ============================ 道路标线贴图 ============================ */
  // 沿 U 方向（道路长度）重复；V 方向为路宽
  function texMarkings(kind) {
    return U.canvasTex(512, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      if (kind === 'dash') {
        // 边线
        ctx.fillStyle = 'rgba(240,240,235,0.92)';
        ctx.fillRect(0, 4, w, 5);
        ctx.fillRect(0, h - 9, w, 5);
        // 中央虚线
        ctx.fillRect(0, h / 2 - 3, w * 0.5, 6);
      } else if (kind === 'dash2') {
        ctx.fillStyle = 'rgba(240,240,235,0.92)';
        ctx.fillRect(0, 4, w, 5);
        ctx.fillRect(0, h - 9, w, 5);
        // 双黄线
        ctx.fillStyle = 'rgba(235,200,60,0.95)';
        ctx.fillRect(0, h / 2 - 8, w, 5);
        ctx.fillRect(0, h / 2 + 3, w, 5);
      } else if (kind === 'crosswalk') {
        ctx.fillStyle = 'rgba(240,240,235,0.9)';
        for (let i = 0; i < 9; i++) ctx.fillRect(10 + i * 56, 8, 30, h - 16);
      }
    }, { repeat: [1, 1] });
  }

  function roadBand(cx, cz, len, wid, rotY, kind) {
    const g = new T.Group();
    const asphalt = flat(len, wid, U.texAsphalt(false), 10, 0.02);
    asphalt.name = '沥青路面';
    g.add(asphalt);
    const mk = texMarkings(kind || 'dash');
    const mkMat = new T.MeshBasicMaterial({ map: U.cloneTex(mk, len / 26, 1), transparent: true, depthWrite: false });
    const marks = new T.Mesh(new T.PlaneGeometry(len, wid), mkMat);
    marks.rotation.x = -Math.PI / 2;
    marks.position.y = 0.035;
    g.add(marks);
    // 路缘石
    const curbMat = new T.MeshStandardMaterial({ color: 0xbdb9b0, roughness: 0.85 });
    [-1, 1].forEach(s => {
      const curb = new T.Mesh(new T.BoxGeometry(len, 0.3, 0.6), curbMat);
      curb.position.set(0, 0.15, s * (wid / 2 + 0.3));
      g.add(curb);
    });
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY || 0;
    return g;
  }

  /* ============================== 树木绿化 ============================== */
  const FOLIAGE = [0x3f6b2e, 0x4a7a35, 0x35602a, 0x568a3c, 0x2f5a28];
  const CAR_COLORS = [0xd8dde2, 0x2c3038, 0xb4232b, 0x1f4f8b, 0x9aa3ad, 0xe8e9ea, 0x3a6b4a, 0x8b6b1f];
  const CLOTHES = [0x2b4a7a, 0xb03a3a, 0x2f2f33, 0xd8d3c8, 0x3f6b4a, 0x7a4a8b, 0xd98a3a, 0x4a5a6b];
  const SKIN = [0xe8c39a, 0xd9a878, 0xc08a5a, 0xf0d0b0];

  // ---- 共享材质池（避免每个构件都新建材质，显著减小 GLB 体积） ----
  const MAT = {};
  function poolMat(key, factory) {
    if (!MAT[key]) MAT[key] = factory();
    return MAT[key];
  }
  const matTrunk = () => poolMat('trunk', () => new T.MeshStandardMaterial({ color: 0x5b4630, roughness: 0.95 }));
  const matLeaf = (i) => poolMat('leaf' + i, () =>
    new T.MeshStandardMaterial({ color: FOLIAGE[i], roughness: 0.92, flatShading: true }));
  const matCurb = () => poolMat('curb', () => new T.MeshStandardMaterial({ color: 0xc4c0b6, roughness: 0.9 }));
  const matSoil = () => poolMat('soil', () => new T.MeshStandardMaterial({ color: 0x4a3f2e, roughness: 1 }));
  const matPole = () => poolMat('pole', () => new T.MeshStandardMaterial({ color: 0x6f7479, roughness: 0.5, metalness: 0.7 }));
  const matHead = () => poolMat('head', () => new T.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.4, metalness: 0.7 }));
  const matCarBody = (i) => poolMat('car' + i, () =>
    new T.MeshStandardMaterial({ color: CAR_COLORS[i], roughness: 0.35, metalness: 0.55 }));
  const matCarGlass = () => poolMat('carglass', () =>
    new T.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.1, metalness: 0.9 }));
  const matTire = () => poolMat('tire', () => new T.MeshStandardMaterial({ color: 0x16181b, roughness: 0.85 }));
  const matRim = () => poolMat('rim', () => new T.MeshStandardMaterial({ color: 0xa9aeb3, roughness: 0.35, metalness: 0.8 }));
  const matSkin = (i) => poolMat('skin' + i, () =>
    new T.MeshStandardMaterial({ color: SKIN[i], roughness: 0.75 }));
  const matCloth = (i) => poolMat('cloth' + i, () =>
    new T.MeshStandardMaterial({ color: CLOTHES[i], roughness: 0.85 }));
  const matPants = () => poolMat('pants', () => new T.MeshStandardMaterial({ color: 0x33383f, roughness: 0.9 }));

  function makeTree(scale) {
    const g = new T.Group();
    const s = scale || 1;
    const trunk = new T.Mesh(new T.CylinderGeometry(0.16 * s, 0.26 * s, 2.6 * s, 7), matTrunk());
    trunk.position.y = 1.3 * s;
    g.add(trunk);
    const leafMat = matLeaf(U.randInt(0, FOLIAGE.length - 1));
    const n = U.randInt(3, 4);
    for (let i = 0; i < n; i++) {
      const r = (1.5 + U.rand(-0.3, 0.5)) * s;
      const blob = new T.Mesh(new T.IcosahedronGeometry(r, 0), leafMat);
      blob.position.set(U.rand(-0.8, 0.8) * s, (2.9 + i * 0.85 + U.rand(-0.2, 0.2)) * s, U.rand(-0.8, 0.8) * s);
      blob.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
      blob.castShadow = true;
      g.add(blob);
    }
    g.castShadow = true;
    return g;
  }

  function makeShrub(s) {
    const m = new T.Mesh(new T.IcosahedronGeometry(0.75 * (s || 1), 0),
      matLeaf(U.randInt(0, FOLIAGE.length - 1)));
    m.scale.y = 0.72;
    m.position.y = 0.5 * (s || 1);
    m.castShadow = true;
    return m;
  }

  function planterRow(x0, z0, x1, z1, count) {
    const g = new T.Group();
    g.name = '绿化带';
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      // 树池
      const pit = new T.Mesh(new T.BoxGeometry(2.4, 0.32, 2.4), matCurb());
      pit.position.set(x, 0.16, z);
      g.add(pit);
      const soil = new T.Mesh(new T.BoxGeometry(2.0, 0.34, 2.0), matSoil());
      soil.position.set(x, 0.2, z);
      g.add(soil);
      const tree = makeTree(U.rand(0.9, 1.35));
      tree.position.set(x, 0.3, z);
      tree.rotation.y = U.rand(0, 6.28);
      g.add(tree);
      // 灌木
      for (let k = 0; k < 3; k++) {
        const sh = makeShrub(U.rand(0.5, 0.8));
        sh.position.set(x + U.rand(-0.7, 0.7), 0.3, z + U.rand(-0.7, 0.7));
        g.add(sh);
      }
    }
    return g;
  }

  /* ============================== 路灯 ============================== */
  function makeStreetLight(h) {
    const g = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.18, h, 10), matPole());
    pole.position.y = h / 2;
    g.add(pole);
    const arm = new T.Mesh(new T.BoxGeometry(1.8, 0.14, 0.14), matPole());
    arm.position.set(0.9, h - 0.15, 0);
    g.add(arm);
    const head = new T.Mesh(new T.BoxGeometry(1.1, 0.22, 0.55), matHead());
    head.position.set(1.75, h - 0.3, 0);
    g.add(head);
    const glowMat = new T.MeshBasicMaterial({ color: 0xfff0cf, transparent: true, opacity: 0.25 });
    const glow = new T.Mesh(new T.PlaneGeometry(1.0, 0.5), glowMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.set(1.75, h - 0.42, 0);
    g.add(glow);
    g.userData.glow = glowMat;
    return g;
  }

  /* ============================== 车辆 ============================== */
  function makeCar(colorIdx, type) {
    const g = new T.Group();
    const ci = (colorIdx === undefined ? U.randInt(0, CAR_COLORS.length - 1) : colorIdx) % CAR_COLORS.length;
    const bodyMat = matCarBody(ci);
    const glassM = matCarGlass();
    const suv = type === 'suv';
    const L = suv ? 4.9 : 4.6, Wd = suv ? 1.95 : 1.82, H = suv ? 0.95 : 0.72;
    const body = new T.Mesh(new T.BoxGeometry(L, H, Wd), bodyMat);
    body.position.y = 0.62 + H / 2 - 0.36;
    g.add(body);
    const cabinH = suv ? 0.82 : 0.66;
    const cabin = new T.Mesh(new T.BoxGeometry(L * 0.55, cabinH, Wd * 0.94), bodyMat);
    cabin.position.set(-0.15, 0.62 + H - 0.36 + cabinH / 2 - 0.06, 0);
    g.add(cabin);
    const glass = new T.Mesh(new T.BoxGeometry(L * 0.53, cabinH * 0.72, Wd * 0.96), glassM);
    glass.position.copy(cabin.position);
    g.add(glass);
    // 车轮
    [[-L * 0.31, Wd / 2], [L * 0.31, Wd / 2], [-L * 0.31, -Wd / 2], [L * 0.31, -Wd / 2]].forEach(([x, z]) => {
      const wheel = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.24, 14), matTire());
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.34, z);
      g.add(wheel);
      const rim = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.26, 12), matRim());
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, 0.34, z);
      g.add(rim);
    });
    // 车灯
    const head = new T.Mesh(new T.BoxGeometry(0.12, 0.2, Wd * 0.8), poolMat('carhead',
      () => new T.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff0cc, emissiveIntensity: 0.3, roughness: 0.2 })));
    head.position.set(L / 2 - 0.02, 0.62, 0);
    g.add(head);
    const tail = new T.Mesh(new T.BoxGeometry(0.1, 0.18, Wd * 0.8), poolMat('cartail',
      () => new T.MeshStandardMaterial({ color: 0x8b1a1a, emissive: 0xff2200, emissiveIntensity: 0.35, roughness: 0.3 })));
    tail.position.set(-L / 2 + 0.02, 0.68, 0);
    g.add(tail);
    g.castShadow = true;
    g.userData.isCar = true;
    return g;
  }

  /* ============================== 行人 ============================== */
  function makePerson() {
    const g = new T.Group();
    const s = U.rand(0.92, 1.08);
    const body = new T.Mesh(new T.CapsuleGeometry(0.19, 0.52, 4, 8),
      matCloth(U.randInt(0, CLOTHES.length - 1)));
    body.position.y = 1.02;
    g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.13, 12, 10),
      matSkin(U.randInt(0, SKIN.length - 1)));
    head.position.y = 1.5;
    g.add(head);
    const legs = new T.Mesh(new T.BoxGeometry(0.3, 0.72, 0.22), matPants());
    legs.position.y = 0.36;
    g.add(legs);
    g.scale.setScalar(s);
    g.castShadow = true;
    g.userData.isPerson = true;
    return g;
  }

  /* ========================== 精神堡垒（标识塔） ========================== */
  function buildPylon() {
    const g = new T.Group();
    g.name = '精神堡垒';
    const h = 13.5, w = 2.2, d = 1.2;
    const bodyMat = new T.MeshStandardMaterial({ color: 0xd9dde1, roughness: 0.45, metalness: 0.35 });
    const body = new T.Mesh(new T.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2;
    g.add(body);
    // 顶部斜切
    const cap = new T.Mesh(new T.BoxGeometry(w + 0.3, 0.4, d + 0.3),
      new T.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.6 }));
    cap.position.y = h + 0.2;
    g.add(cap);
    // 竖向「万达广场」
    const txt = U.texText('万\n达\n广\n场', { fontSize: 128, color: '#ffffff', glow: 'rgba(180,220,255,0.95)', pad: 14 });
    const mat = new T.MeshBasicMaterial({ map: txt, transparent: true, toneMapped: false, side: T.DoubleSide });
    const sign = new T.Mesh(new T.PlaneGeometry(1.6, 1.6 * txt.image.height / txt.image.width), mat);
    sign.position.set(0, h * 0.72, d / 2 + 0.02);
    g.add(sign);
    const sign2 = sign.clone();
    sign2.position.set(0, h * 0.72, -d / 2 - 0.02);
    sign2.rotation.y = Math.PI;
    g.add(sign2);
    // LED 信息条
    const ledTex = U.texLED(1);
    const ledMat = new T.MeshBasicMaterial({ map: ledTex, toneMapped: false });
    const led = new T.Mesh(new T.PlaneGeometry(w - 0.3, (w - 0.3) * 0.5), ledMat);
    led.position.set(0, h * 0.36, d / 2 + 0.02);
    g.add(led);
    // 基座
    const base = new T.Mesh(new T.BoxGeometry(w + 1.2, 0.6, d + 1.2),
      new T.MeshStandardMaterial({ color: 0x8f9499, roughness: 0.7 }));
    base.position.y = 0.3;
    g.add(base);
    g.userData.ledMat = ledMat;
    return g;
  }

  /* ========================== 地铁出入口 ========================== */
  function buildSubwayEntrance() {
    const g = new T.Group();
    g.name = '地铁出入口';
    const glass = new T.MeshPhysicalMaterial({
      color: 0xa8cbe0, roughness: 0.08, metalness: 0.1, transmission: 0.9,
      transparent: true, opacity: 0.5, side: T.DoubleSide
    });
    const frameMat = new T.MeshStandardMaterial({ color: 0x5a6167, roughness: 0.45, metalness: 0.7 });
    const w = 4.2, d = 9.5, h = 3.0;
    // 玻璃罩
    const body = new T.Mesh(new T.BoxGeometry(w, h, d), glass);
    body.position.y = h / 2 + 0.2;
    g.add(body);
    // 框架
    for (let i = 0; i <= 4; i++) {
      const z = -d / 2 + i * d / 4;
      const rib = new T.Mesh(new T.BoxGeometry(w + 0.16, 0.16, 0.16), frameMat);
      rib.position.set(0, h + 0.28, z);
      g.add(rib);
    }
    [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].forEach(([x, z]) => {
      const post = new T.Mesh(new T.BoxGeometry(0.18, h + 0.4, 0.18), frameMat);
      post.position.set(x, (h + 0.4) / 2 + 0.2, z);
      g.add(post);
    });
    // 站牌
    const signMat = new T.MeshStandardMaterial({ color: 0x0b7a3b, roughness: 0.5, emissive: 0x0b7a3b, emissiveIntensity: 0.25 });
    const signBoard = new T.Mesh(new T.BoxGeometry(w + 0.6, 1.0, 0.2), signMat);
    signBoard.position.set(0, h + 1.0, d / 2 - 0.1);
    g.add(signBoard);
    const t = U.texText('地铁 1 号线', { fontSize: 96, color: '#ffffff', glow: null, pad: 16, bg: null });
    const sm = new T.Mesh(new T.PlaneGeometry((w + 0.6) * 0.9, (w + 0.6) * 0.9 * t.image.height / t.image.width),
      new T.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    sm.position.set(0, h + 1.0, d / 2 + 0.02);
    g.add(sm);
    // 台阶下沉
    for (let i = 0; i < 6; i++) {
      const st = new T.Mesh(new T.BoxGeometry(w - 0.4, 0.2, 0.6),
        new T.MeshStandardMaterial({ color: 0xb9b5ac, roughness: 0.9 }));
      st.position.set(0, -0.1 - i * 0.2, d / 2 + 0.4 + i * 0.6);
      g.add(st);
    }
    return g;
  }

  /* ============================ 公交站台 ============================ */
  function buildBusStop() {
    const g = new T.Group();
    g.name = '公交站台';
    const frameMat = new T.MeshStandardMaterial({ color: 0x62686e, roughness: 0.45, metalness: 0.7 });
    const glass = new T.MeshPhysicalMaterial({
      color: 0xbcd8ea, roughness: 0.1, transmission: 0.85, transparent: true, opacity: 0.42, side: T.DoubleSide
    });
    const w = 9, d = 2.6, h = 2.9;
    const roof = new T.Mesh(new T.BoxGeometry(w, 0.18, d), frameMat);
    roof.position.y = h;
    g.add(roof);
    const back = new T.Mesh(new T.BoxGeometry(w, h - 0.4, 0.1), glass);
    back.position.set(0, (h - 0.4) / 2, -d / 2 + 0.1);
    g.add(back);
    for (let i = 0; i <= 3; i++) {
      const post = new T.Mesh(new T.BoxGeometry(0.16, h, 0.16), frameMat);
      post.position.set(-w / 2 + i * w / 3, h / 2, -d / 2 + 0.1);
      g.add(post);
    }
    const bench = new T.Mesh(new T.BoxGeometry(w * 0.6, 0.12, 0.5), frameMat);
    bench.position.set(0, 0.55, -d / 2 + 0.6);
    g.add(bench);
    const t = U.texText('公交站  万达广场', { fontSize: 90, color: '#ffffff', glow: null, pad: 14, bg: '#1d5c9e' });
    const board = new T.Mesh(new T.BoxGeometry(3.4, 0.9, 0.12), new T.MeshStandardMaterial({ color: 0x1d5c9e, roughness: 0.6 }));
    board.position.set(-w / 2 + 2.0, h + 0.6, 0);
    g.add(board);
    const bm = new T.Mesh(new T.PlaneGeometry(3.3, 0.85),
      new T.MeshBasicMaterial({ map: t, toneMapped: false }));
    bm.position.set(-w / 2 + 2.0, h + 0.6, 0.07);
    g.add(bm);
    return g;
  }

  /* ============================ 护栏 / 隔离柱 ============================ */
  function bollards(x0, z0, x1, z1, n) {
    const g = new T.Group();
    const mat = new T.MeshStandardMaterial({ color: 0x9aa0a5, roughness: 0.4, metalness: 0.8 });
    const geo = new T.CylinderGeometry(0.09, 0.11, 0.9, 10);
    const topGeo = new T.SphereGeometry(0.1, 10, 8);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const b = new T.Mesh(geo, mat);
      b.position.set(x, 0.45, z);
      g.add(b);
      const tp = new T.Mesh(topGeo, mat);
      tp.position.set(x, 0.9, z);
      g.add(tp);
    }
    return g;
  }

  function railings(x0, z0, x1, z1, n) {
    const g = new T.Group();
    const mat = new T.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.5, metalness: 0.6 });
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const rail = new T.Mesh(new T.BoxGeometry(len, 0.08, 0.08), mat);
    rail.position.set((x0 + x1) / 2, 1.05, (z0 + z1) / 2);
    rail.rotation.y = -ang;
    g.add(rail);
    const rail2 = rail.clone(); rail2.position.y = 0.55; g.add(rail2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const p = new T.Mesh(new T.BoxGeometry(0.1, 1.1, 0.1), mat);
      p.position.set(x, 0.55, z);
      g.add(p);
    }
    return g;
  }

  /* ============================== 水景 ============================== */
  function buildFountain(cx, cz) {
    const g = new T.Group();
    g.name = '水景';
    const r = 6.5;
    const rimMat = new T.MeshStandardMaterial({ color: 0xcac6bd, roughness: 0.85 });
    const rim = new T.Mesh(new T.CylinderGeometry(r + 0.5, r + 0.6, 0.6, 40, 1, true), rimMat);
    rim.position.set(cx, 0.3, cz);
    g.add(rim);
    const rimTop = new T.Mesh(new T.RingGeometry(r - 0.1, r + 0.5, 40), rimMat);
    rimTop.rotation.x = -Math.PI / 2;
    rimTop.position.set(cx, 0.6, cz);
    g.add(rimTop);
    const water = new T.Mesh(new T.CircleGeometry(r, 40),
      new T.MeshStandardMaterial({ color: 0x2c6b8f, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.42, cz);
    g.add(water);
    // 中心水柱
    const jet = new T.Mesh(new T.CylinderGeometry(0.16, 0.5, 4.2, 12),
      new T.MeshPhysicalMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.35, roughness: 0.05, transmission: 0.9 }));
    jet.position.set(cx, 2.5, cz);
    g.add(jet);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const j = new T.Mesh(new T.CylinderGeometry(0.08, 0.24, 2.2, 10),
        new T.MeshPhysicalMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.3, roughness: 0.05, transmission: 0.9 }));
      j.position.set(cx + Math.cos(a) * 3.4, 1.6, cz + Math.sin(a) * 3.4);
      j.rotation.z = Math.cos(a) * 0.25;
      j.rotation.x = -Math.sin(a) * 0.25;
      g.add(j);
    }
    return g;
  }

  /* ============================ 周边城市 ============================ */
  function buildSkyline() {
    const g = new T.Group();
    g.name = '周边城市';
    const dayTex = U.texOfficeTower();
    const nightTex = U.texOfficeNight();
    const dayMat = new T.MeshStandardMaterial({ map: dayTex, roughness: 0.35, metalness: 0.5 });
    const nightMat = new T.MeshStandardMaterial({
      map: nightTex, emissive: 0xffffff, emissiveMap: nightTex, emissiveIntensity: 0.0, roughness: 0.6
    });
    W.nightTargets = W.nightTargets || [];
    W.nightTargets.push({ mat: nightMat, day: 0.0, night: 1.0 });
    const concrete = new T.MeshStandardMaterial({ color: 0xb5b0a6, roughness: 0.9 });
    const roofMat = new T.MeshStandardMaterial({ color: 0x8b8880, roughness: 0.95 });

    const R = 262;
    const count = 56;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + U.rand(-0.03, 0.03);
      const rad = R + U.rand(0, 210);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      // 避免压到场地：以场地中心为圆心的安全半径
      if (Math.hypot(x, z) < 250) continue;
      const w = U.rand(16, 42), d = U.rand(16, 40);
      const h = U.rand(14, 58) * (U.rnd() > 0.88 ? 1.7 : 1);
      const tex = U.rnd() > 0.45 ? dayMat : concrete;
      const b = new T.Mesh(new T.BoxGeometry(w, h, d), tex);
      b.position.set(x, h / 2, z);
      b.rotation.y = U.rand(-0.25, 0.25);
      b.castShadow = true;
      g.add(b);
      // 夜景窗光（略大于建筑，作为发光面）
      const glow = new T.Mesh(new T.BoxGeometry(w + 0.3, h - 1, d + 0.3), nightMat);
      glow.position.copy(b.position);
      glow.rotation.copy(b.rotation);
      glow.visible = false;
      glow.userData.isNightGlow = true;
      g.add(glow);
      // 屋顶
      const rf = new T.Mesh(new T.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
      rf.position.set(x, h + 0.3, z);
      rf.rotation.y = b.rotation.y;
      g.add(rf);
      // 顶部机房
      if (U.rnd() > 0.4) {
        const m = new T.Mesh(new T.BoxGeometry(w * 0.3, U.rand(2, 5), d * 0.3), roofMat);
        m.position.set(x + U.rand(-w * 0.2, w * 0.2), h + 2, z + U.rand(-d * 0.2, d * 0.2));
        g.add(m);
      }
      // 部分塔楼加尖顶/天线
      if (U.rnd() > 0.85) {
        const mast = new T.Mesh(new T.CylinderGeometry(0.3, 0.5, U.rand(6, 16), 8),
          new T.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.7 }));
        mast.position.set(x, h + U.rand(3, 8) + 4, z);
        g.add(mast);
      }
    }
    W.skylineGroup = g;
    return g;
  }

  /* ============================== 组装场地 ============================== */
  function build() {
    const g = new T.Group();
    g.name = '场地与城市';
    W.nightTargets = W.nightTargets || [];
    W.nightTargets.push(...(W.mallNight || []));

    /* --- 大地基底 --- */
    const ground = flat(1600, 1600, U.texGrass(), 12, -0.05);
    ground.name = '地面基底';
    g.add(ground);

    /* --- 广场铺装（避开四周道路，防止盖住路面） --- */
    const plaza = new T.Group();
    plaza.name = '广场铺装';
    const pavTex = U.texPlazaPave();
    // 石材外圈：x∈[-112,112]，z∈[-87,75]
    const stoneBand = flat(224, 162, U.texPavement(), 8, 0.04, { roughness: 0.9 });
    stoneBand.position.set(0, 0.04, -6);
    stoneBand.name = '石材铺装';
    plaza.add(stoneBand);
    // 中心广场：x∈[-102,102]，z∈[-79,67]
    const pav = flat(204, 146, pavTex, 8, 0.05, { roughness: 0.88 });
    pav.position.set(0, 0.05, -6);
    pav.name = '中心广场';
    plaza.add(pav);
    g.add(plaza);

    /* --- 道路 --- */
    const roads = new T.Group();
    roads.name = '道路系统';
    roads.add(roadBand(0, -104, 380, 18, 0, 'dash2'));   // 南侧主干道
    roads.add(roadBand(0, 92, 380, 14, 0, 'dash'));      // 北侧道路
    roads.add(roadBand(126, 0, 220, 16, Math.PI / 2, 'dash2')); // 东侧道路
    roads.add(roadBand(-126, 0, 220, 16, Math.PI / 2, 'dash')); // 西侧道路
    g.add(roads);

    /* --- 人行横道 --- */
    const cwMat = new T.MeshBasicMaterial({ map: U.cloneTex(texMarkings('crosswalk'), 1, 1), transparent: true, depthWrite: false });
    [[0, -104, 12, 20], [0, 92, 12, 16]].forEach(([x, z, w, d]) => {
      const cw = new T.Mesh(new T.PlaneGeometry(w, d), cwMat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x, 0.06, z);
      g.add(cw);
    });

    /* --- 停车场（东侧） --- */
    const lot = new T.Group();
    lot.name = '地面停车场';
    const lotFloor = flat(46, 54, U.texParkingLot(), 16, 0.06);
    lotFloor.position.set(148, 0.06, 0);
    lot.add(lotFloor);
    for (let i = 0; i < 14; i++) {
      const car = makeCar(undefined, U.rnd() > 0.6 ? 'suv' : 'car');
      car.position.set(138 + (i % 2) * 20, 0, -21 + Math.floor(i / 2) * 7.5);
      car.rotation.y = (i % 2 === 0 ? 0 : Math.PI);
      lot.add(car);
    }
    g.add(lot);

    /* --- 广场前停车（东北角，避开主入口轴线） --- */
    const lotN = new T.Group();
    lotN.name = '北侧停车场';
    const lotNFloor = flat(36, 20, U.texParkingLot(), 16, 0.06);
    lotNFloor.position.set(96, 0.06, 74);
    lotN.add(lotNFloor);
    for (let i = 0; i < 12; i++) {
      const car = makeCar(undefined, U.rnd() > 0.7 ? 'suv' : 'car');
      car.position.set(82 + (i % 2) * 26, 0, 68 + Math.floor(i / 2) * 4.6);
      car.rotation.y = (i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
      lotN.add(car);
    }
    g.add(lotN);

    /* --- 车流 --- */
    const traffic = new T.Group();
    traffic.name = '车流';
    for (let i = 0; i < 16; i++) {
      const car = makeCar(undefined, U.rnd() > 0.65 ? 'suv' : 'car');
      const dir = i % 2 === 0 ? 1 : -1;
      car.position.set(-170 + (i * 23) % 340, 0, -104 + dir * 4.5);
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      car.userData.lane = { axis: 'x', z: -104 + dir * 4.5, speed: U.rand(6, 12) * dir, min: -180, max: 180 };
      traffic.add(car);
    }
    for (let i = 0; i < 8; i++) {
      const car = makeCar(undefined, U.rnd() > 0.6 ? 'suv' : 'car');
      const dir = i % 2 === 0 ? 1 : -1;
      car.position.set(126 + dir * 4, 0, -90 + (i * 31) % 180);
      car.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      car.userData.lane = { axis: 'z', x: 126 + dir * 4, speed: U.rand(6, 12) * dir, min: -100, max: 100 };
      traffic.add(car);
    }
    W.traffic = traffic;
    g.add(traffic);

    /* --- 绿化 --- */
    const green = new T.Group();
    green.name = '绿化景观';
    green.add(planterRow(-96, 62, -26, 62, 7));
    green.add(planterRow(26, 62, 96, 62, 7));
    green.add(planterRow(-96, -56, -26, -56, 6));
    green.add(planterRow(26, -56, 96, -56, 6));
    green.add(planterRow(-104, -30, -104, 40, 6));
    green.add(planterRow(104, -30, 104, 40, 6));
    // 草坪
    [[-76, 72, 36, 16], [76, 72, 36, 16], [-96, -76, 46, 14], [96, -76, 46, 14]].forEach(([x, z, w, d]) => {
      const lawn = flat(w, d, U.texGrass(), 8, 0.08, { roughness: 1 });
      lawn.position.set(x, 0.08, z);
      green.add(lawn);
      for (let i = 0; i < 8; i++) {
        const sh = makeShrub(U.rand(0.7, 1.2));
        sh.position.set(x + U.rand(-w / 2 + 1, w / 2 - 1), 0.1, z + U.rand(-d / 2 + 1, d / 2 - 1));
        green.add(sh);
      }
    });
    g.add(green);

    /* --- 水景（主入口东侧） --- */
    g.add(buildFountain(-34, 68));

    /* --- 精神堡垒（入口轴线两侧） --- */
    const pylon = buildPylon();
    pylon.position.set(-17, 0, 72);
    g.add(pylon);
    const pylon2 = buildPylon();
    pylon2.position.set(17, 0, 72);
    pylon2.rotation.y = Math.PI;
    g.add(pylon2);

    /* --- 地铁出入口（西侧） --- */
    const sub = buildSubwayEntrance();
    sub.position.set(-52, 0, 70);
    sub.rotation.y = Math.PI;
    g.add(sub);

    /* --- 公交站 --- */
    const bus = buildBusStop();
    bus.position.set(0, 0, -92);
    g.add(bus);

    /* --- 路灯 --- */
    const lights = new T.Group();
    lights.name = '路灯';
    W.streetGlow = [];
    const positions = [];
    for (let i = -4; i <= 4; i++) {
      positions.push([i * 34, -95, 0]);
      positions.push([i * 34, 83, Math.PI]);
    }
    for (let i = -2; i <= 2; i++) {
      positions.push([118, i * 36, Math.PI / 2]);
      positions.push([-118, i * 36, -Math.PI / 2]);
    }
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;                 // 避开主入口轴线
      positions.push([i * 26, 60, Math.PI]);
    }
    positions.forEach(([x, z, r]) => {
      const l = makeStreetLight(U.rand(8.5, 9.5));
      l.position.set(x, 0, z);
      l.rotation.y = r;
      lights.add(l);
      W.streetGlow.push(l.userData.glow);
    });
    g.add(lights);

    /* --- 隔离柱 / 护栏 --- */
    const urban = new T.Group();
    urban.name = '街道家具';
    urban.add(bollards(-11, 63, 11, 63, 9));       // 入口前，避开台阶
    urban.add(bollards(-88, 44, -70, 44, 6));
    urban.add(bollards(70, 44, 88, 44, 6));
    urban.add(railings(-100, -94, -30, -94, 16));
    urban.add(railings(30, -94, 100, -94, 16));
    // 旗杆
    const poleMat = new T.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.35, metalness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const pole = new T.Mesh(new T.CylinderGeometry(0.09, 0.12, 12, 10), poleMat);
      pole.position.set(-70 + i * 4, 6, 66);
      urban.add(pole);
      const flag = new T.Mesh(new T.PlaneGeometry(2.6, 1.7),
        new T.MeshStandardMaterial({ color: i === 1 ? 0xd8232a : 0xf0f0f0, roughness: 0.9, side: T.DoubleSide }));
      flag.position.set(-70 + i * 4 + 1.4, 10.6, 66);
      urban.add(flag);
    }
    // 垃圾桶
    for (let i = 0; i < 8; i++) {
      const bin = new T.Mesh(new T.CylinderGeometry(0.32, 0.28, 0.95, 12),
        new T.MeshStandardMaterial({ color: 0x4a5a4a, roughness: 0.8 }));
      bin.position.set(-63 + i * 18, 0.48, 64);
      urban.add(bin);
    }
    g.add(urban);

    /* --- 人群 --- */
    const crowd = new T.Group();
    crowd.name = '人群';
    for (let i = 0; i < 90; i++) {
      const p = makePerson();
      // 主要分布在北广场与入口（避开中庭体量 z∈[44,56] 与台阶）
      const zone = U.rnd();
      let x, z;
      if (zone < 0.40) { x = U.rand(-90, 90); z = U.rand(60, 80); }
      else if (zone < 0.62) { x = U.rand(-16, 16); z = U.rand(57, 70); }
      else if (zone < 0.80) { x = U.rand(-100, 100); z = U.rand(-62, -50); }
      else if (zone < 0.92) { x = U.rand(-100, 100); z = U.rand(78, 88); }
      else { x = U.rand(20, 60); z = U.rand(40, 60); }
      p.position.set(x, 0.06, z);
      p.rotation.y = U.rand(0, 6.28);
      p.userData.walk = {
        phase: U.rand(0, 6.28), speed: U.rand(0.15, 0.45), dir: U.rand(0, 6.28),
        home: [x, z], range: U.rand(3, 12)
      };
      crowd.add(p);
    }
    W.crowd = crowd;
    g.add(crowd);

    /* --- 周边城市 --- */
    g.add(buildSkyline());

    return g;
  }

  W.site = { build, makeCar, makePerson, makeTree, flat, texMarkings, buildSkyline };
})(window);
