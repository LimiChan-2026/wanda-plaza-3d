/* =============================================================================
 * mall.js —— 万达广场主体建筑
 *   · 购物中心主体（异形八边形体量 + 倒角）
 *   · 首层商业橱窗 / 上部玻璃幕墙 / 铝板腰线 / 女儿墙
 *   · 北侧出挑中庭体量（入口 + LED 大屏 + 「万达广场」发光字 + 采光顶）
 *   · 屋面设备、次入口雨棚、影城标识、夜间轮廓灯
 * ========================================================================== */
(function (global) {
  'use strict';
  const W = (global.WANDA = global.WANDA || {});
  const T = global.THREE;
  const U = W.utils;

  /* ------------------------------ 建筑控制尺寸 ------------------------------ */
  const D = {
    H_STORE: 6.2,      // 首层商业高度
    H_PODIUM: 24.5,    // 裙房总高
    H_PARAPET: 26.0,   // 女儿墙顶
    H_ATRIUM: 26.0,    // 中庭体量高度
    ATRIUM: { x0: -9, x1: 9, z0: 44, z1: 56 },   // 中庭向北出挑 12m
    LED: { w: 11, h: 7.0, y: 13.0 }
  };

  // 主体轮廓（XZ 平面，单位：米）—— 圆角矩形，北侧 z=44 为入口立面
  const POLY = [
    [-58, -46], [58, -46], [66, -32], [66, 30], [54, 44],
    [-54, 44], [-66, 30], [-66, -32]
  ];

  /* -------------------------------- 材质 -------------------------------- */
  function makeMaterials() {
    const M = {};
    // 首层商业橱窗（自发光，夜间点亮）
    const storeTex = U.texStorefront(3);
    M.store = new T.MeshStandardMaterial({
      map: storeTex, roughness: 0.42, metalness: 0.1, envMapIntensity: 0.45,
      emissive: 0xffffff, emissiveMap: storeTex, emissiveIntensity: 0.0
    });
    // 上部玻璃幕墙
    const cwTex = U.texCurtainWall({ cols: 2, rows: 1, px: 256, glass: '#22384c', glass2: '#33526b', spandrel: '#4a545e' });
    M.curtain = new T.MeshStandardMaterial({
      map: cwTex, roughness: 0.38, metalness: 0.2, envMapIntensity: 0.55,
      emissive: 0xffdca8, emissiveMap: cwTex, emissiveIntensity: 0.0
    });
    // 中庭幕墙（更通透）
    const cwTex2 = U.texCurtainWall({ cols: 2, rows: 2, px: 256, glass: '#2a4763', glass2: '#3d6081', spandrel: '#525d69' });
    M.atrium = new T.MeshStandardMaterial({
      map: cwTex2, roughness: 0.3, metalness: 0.22, envMapIntensity: 0.7,
      emissive: 0xffe0b0, emissiveMap: cwTex2, emissiveIntensity: 0.0
    });
    // 石材 / 铝板
    M.conc = new T.MeshStandardMaterial({ map: U.texConcrete('#c2bcb1'), roughness: 0.82, metalness: 0.05, envMapIntensity: 0.6 });
    M.concDark = new T.MeshStandardMaterial({ map: U.texConcrete('#a9a49b'), roughness: 0.84, metalness: 0.05, envMapIntensity: 0.6 });
    // 金属铝板（檐口 / 雨棚）
    M.metal = new T.MeshStandardMaterial({ color: 0x9ba1a7, roughness: 0.45, metalness: 0.8, envMapIntensity: 0.8 });
    M.metalDark = new T.MeshStandardMaterial({ color: 0x474c51, roughness: 0.55, metalness: 0.75, envMapIntensity: 0.7 });
    // 屋面
    M.roof = new T.MeshStandardMaterial({ map: U.texRoof(), roughness: 0.92, metalness: 0.04, envMapIntensity: 0.4 });
    // 玻璃
    M.glass = new T.MeshPhysicalMaterial({
      color: 0x9fc4de, roughness: 0.08, metalness: 0.0, transmission: 0.9,
      transparent: true, opacity: 0.5, side: T.DoubleSide, envMapIntensity: 1.0
    });
    // 采光顶玻璃
    M.skylight = new T.MeshStandardMaterial({
      map: U.texSkylight(), roughness: 0.12, metalness: 0.4, transparent: true,
      opacity: 0.85, side: T.DoubleSide, envMapIntensity: 0.9
    });
    // 白色构件
    M.white = new T.MeshStandardMaterial({ color: 0xe8ebee, roughness: 0.6, metalness: 0.1 });
    return M;
  }

  /* ------------------------------ 中庭体量 ------------------------------ */
  function buildAtrium(M, night) {
    const g = new T.Group();
    g.name = '中庭体量';
    const A = D.ATRIUM;
    const w = A.x1 - A.x0, d = A.z1 - A.z0;
    const cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2;

    // 主体玻璃盒子
    const box = new T.Mesh(new T.BoxGeometry(w, D.H_ATRIUM, d), M.atrium);
    box.position.set(cx, D.H_ATRIUM / 2, cz);
    box.name = '中庭幕墙';
    g.add(box);

    // 四角竖向铝板（收边，增强体量感）
    const cornerMat = M.metal;
    [[A.x0, A.z0], [A.x1, A.z0], [A.x0, A.z1], [A.x1, A.z1]].forEach(([x, z]) => {
      const c = new T.Mesh(new T.BoxGeometry(0.8, D.H_ATRIUM + 0.6, 0.8), cornerMat);
      c.position.set(x, (D.H_ATRIUM + 0.6) / 2, z);
      g.add(c);
    });

    // 顶部檐口
    const cap = new T.Mesh(new T.BoxGeometry(w + 1.6, 1.0, d + 1.6), M.metal);
    cap.position.set(cx, D.H_ATRIUM + 0.45, cz);
    g.add(cap);
    const cap2 = new T.Mesh(new T.BoxGeometry(w + 2.0, 0.3, d + 2.0), M.metalDark);
    cap2.position.set(cx, D.H_ATRIUM - 0.15, cz);
    g.add(cap2);
    // 底部基座
    const base = new T.Mesh(new T.BoxGeometry(w + 1.2, 0.7, d + 1.2), M.concDark);
    base.position.set(cx, 0.35, cz);
    g.add(base);

    /* --------- 采光顶（双坡玻璃 + 骨架） --------- */
    const sky = new T.Group();
    sky.name = '中庭采光顶';
    const ridge = 3.0, halfD = d / 2, segW = 8;
    const slopeLen = Math.hypot(halfD, ridge);
    const ang = Math.atan2(ridge, halfD);
    [1, -1].forEach(dir => {
      const plane = new T.Mesh(new T.PlaneGeometry(w - 1.0, slopeLen, segW, 1), M.skylight);
      plane.rotation.x = dir > 0 ? (-Math.PI / 2 + ang) : (-Math.PI / 2 - ang);
      plane.position.set(cx, D.H_ATRIUM + 1.0 + ridge / 2, cz + dir * halfD / 2);
      plane.name = '采光顶玻璃';
      sky.add(plane);
    });
    for (let i = 0; i <= segW; i++) {
      const x = cx - (w - 1.0) / 2 + i * (w - 1.0) / segW;
      [1, -1].forEach(dir => {
        const rib = new T.Mesh(new T.BoxGeometry(0.2, 0.28, slopeLen), M.metal);
        rib.rotation.x = dir > 0 ? ang : -ang;
        rib.position.set(x, D.H_ATRIUM + 1.2 + ridge / 2, cz + dir * halfD / 2);
        sky.add(rib);
      });
    }
    const ridgeBeam = new T.Mesh(new T.BoxGeometry(w - 0.6, 0.35, 0.45), M.metal);
    ridgeBeam.position.set(cx, D.H_ATRIUM + 1.0 + ridge, cz);
    sky.add(ridgeBeam);
    [1, -1].forEach(s => {
      const gutter = new T.Mesh(new T.BoxGeometry(w, 0.45, 0.55), M.metalDark);
      gutter.position.set(cx, D.H_ATRIUM + 0.9, cz + s * (halfD + 0.2));
      sky.add(gutter);
    });
    g.add(sky);

    /* --------- 入口门厅（北立面 z = A.z1） --------- */
    const ent = new T.Group();
    ent.name = '主入口';
    const fz = A.z1 + 0.06;

    // 雨棚
    const canopy = new T.Mesh(new T.BoxGeometry(w + 4, 0.5, 4.6), M.metal);
    canopy.position.set(cx, 8.4, A.z1 + 2.3);
    ent.add(canopy);
    const canopyEdge = new T.Mesh(new T.BoxGeometry(w + 4.2, 0.5, 0.35), M.metalDark);
    canopyEdge.position.set(cx, 8.1, A.z1 + 4.5);
    ent.add(canopyEdge);
    // 雨棚支柱
    [A.x0 - 1.4, A.x1 + 1.4].forEach(x => {
      const col = new T.Mesh(new T.CylinderGeometry(0.24, 0.24, 8.2, 12), M.metalDark);
      col.position.set(x, 4.1, A.z1 + 4.0);
      ent.add(col);
    });
    // 雨棚下照明
    for (let i = 0; i < 7; i++) {
      const lamp = new T.Mesh(new T.SphereGeometry(0.2, 10, 8),
        new T.MeshBasicMaterial({ color: 0xffe6b8 }));
      lamp.position.set(cx - w / 2 + 0.5 + i * ((w - 1) / 6), 8.0, A.z1 + 2.3);
      ent.add(lamp);
    }

    // 入口玻璃幕（暖光内透）
    const doorGlass = new T.MeshStandardMaterial({
      color: 0x2c4a63, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.1,
      emissive: 0xffe0a8, emissiveIntensity: 0.0
    });
    night.push({ mat: doorGlass, day: 0.0, night: 0.6 });
    const doorW = w - 3.0;
    const doors = new T.Mesh(new T.PlaneGeometry(doorW, 6.8), doorGlass);
    doors.position.set(cx, 3.5, fz);
    ent.add(doors);
    // 门框竖梃
    for (let i = 0; i <= 6; i++) {
      const mull = new T.Mesh(new T.BoxGeometry(0.26, 7.2, 0.3), M.metalDark);
      mull.position.set(cx - doorW / 2 + i * doorW / 6, 3.6, fz + 0.08);
      ent.add(mull);
    }
    // 门头横梁
    const lintel = new T.Mesh(new T.BoxGeometry(doorW + 1.0, 0.7, 0.5), M.metalDark);
    lintel.position.set(cx, 7.2, fz + 0.12);
    ent.add(lintel);
    // 旋转门圆筒
    [cx - 3.4, cx + 3.4].forEach(x => {
      const cyl = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 5.4, 20, 1, true), doorGlass);
      cyl.position.set(x, 2.7, A.z1 + 1.2);
      ent.add(cyl);
      const top = new T.Mesh(new T.CylinderGeometry(1.45, 1.45, 0.28, 20), M.metal);
      top.position.set(x, 5.5, A.z1 + 1.2);
      ent.add(top);
    });
    // 台阶
    for (let i = 0; i < 3; i++) {
      const st = new T.Mesh(new T.BoxGeometry(w + 5 - i * 1.0, 0.18, 0.9), M.conc);
      st.position.set(cx, 0.09 + i * 0.18, A.z1 + 5.0 + i * 0.85);
      ent.add(st);
    }
    g.add(ent);

    /* --------- LED 大屏 --------- */
    const ledMat = new T.MeshBasicMaterial({ map: U.texLED(0), toneMapped: false });
    // 边框必须位于屏幕之后，否则会遮挡屏幕内容
    const frame = new T.Mesh(new T.BoxGeometry(D.LED.w + 0.9, D.LED.h + 0.9, 0.4), M.metalDark);
    frame.position.set(cx, D.LED.y, A.z1 + 0.05);
    g.add(frame);
    const led = new T.Mesh(new T.PlaneGeometry(D.LED.w, D.LED.h), ledMat);
    led.position.set(cx, D.LED.y, A.z1 + 0.30);
    led.name = 'LED大屏';
    led.userData.isLED = true;
    g.add(led);
    night.push({ mat: ledMat, day: 0.92, night: 1.0 });

    /* --------- 「万达广场」发光字 --------- */
    const sign = U.makeGlowSign('万达广场', {
      fontSize: 240, height: 2.9, color: '#ffffff',
      glow: 'rgba(220,240,255,1)', letterSpacing: 20,
      backing: true, backingColor: '#20242a'
    });
    sign.position.set(cx, 23.4, A.z1 + 0.4);
    sign.name = '万达广场招牌';
    g.add(sign);
    // 英文副标
    const sub = U.texText('WANDA PLAZA', {
      fontSize: 60, color: '#cfe6ff', glow: 'rgba(180,220,255,0.9)', pad: 10, letterSpacing: 8
    });
    const subMesh = new T.Mesh(
      new T.PlaneGeometry(6.4, 6.4 * sub.image.height / sub.image.width),
      new T.MeshBasicMaterial({ map: sub, transparent: true, toneMapped: false, depthWrite: false }));
    subMesh.position.set(cx, 20.9, A.z1 + 0.4);
    g.add(subMesh);
    // 洗墙灯带（LED 屏与 LOGO 之间、招牌之上）
    const washMat = new T.MeshBasicMaterial({ color: 0xdff0ff });
    [16.8, 25.2].forEach(y => {
      const wash = new T.Mesh(new T.BoxGeometry(w + 1.0, 0.14, 0.26), washMat);
      wash.position.set(cx, y, A.z1 + 0.46);
      g.add(wash);
    });

    /* --------- 圆形 LOGO 标 --------- */
    const logo = buildLogoDisc(M, night);
    logo.position.set(cx, 18.3, A.z1 + 0.44);
    logo.scale.setScalar(1.3);
    logo.name = 'WANDA标志';
    g.add(logo);

    /* --------- 侧立面竖向遮阳翼（仅两侧，避让中央标识） --------- */
    const finGeo = new T.BoxGeometry(0.28, D.H_ATRIUM - 3.0, 0.7);
    [A.x0 + 1.2, A.x0 + 3.0, A.x1 - 1.2, A.x1 - 3.0].forEach(x => {
      const f = new T.Mesh(finGeo, M.metal);
      f.position.set(x, (D.H_ATRIUM - 3.0) / 2 + 1.4, A.z1 + 0.28);
      g.add(f);
    });

    return g;
  }

  /** 万达圆形标志（发光圆盘 + 抽象风帆图案） */
  function buildLogoDisc(M, night) {
    const g = new T.Group();
    const tex = U.canvasTex(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 12, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 30, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      const sail = (cx, cy, s, rot) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(0, -46 * s);
        ctx.quadraticCurveTo(34 * s, -8 * s, 6 * s, 42 * s);
        ctx.quadraticCurveTo(-6 * s, 10 * s, 0, -46 * s);
        ctx.fill(); ctx.restore();
      };
      sail(w / 2 - 26, h / 2 + 6, 0.62, -0.35);
      sail(w / 2 + 2, h / 2 + 2, 0.78, 0.02);
      sail(w / 2 + 30, h / 2 + 6, 0.62, 0.35);
    }, { repeat: [1, 1] });
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
    g.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
    const back = new T.Mesh(new T.CircleGeometry(1.04, 32),
      new T.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.5, metalness: 0.6 }));
    back.position.z = -0.03;
    g.add(back);
    night.push({ mat, day: 0.95, night: 1.0 });
    return g;
  }

  /* ------------------------------ 屋面设备 ------------------------------ */
  function buildRoofEquipment(M, roofY) {
    const g = new T.Group();
    g.name = '屋面设备';
    const boxMat = new T.MeshStandardMaterial({ color: 0x9298a0, roughness: 0.65, metalness: 0.5 });
    const darkMat = new T.MeshStandardMaterial({ color: 0x646a70, roughness: 0.72, metalness: 0.45 });
    const units = [
      [-40, -20, 7, 3.2, 4], [-26, -24, 6, 3.0, 3.5], [-12, -18, 8, 3.6, 4.5],
      [8, -22, 7, 3.2, 4], [26, -18, 6.5, 3.0, 4], [40, -24, 7, 3.4, 4.2],
      [-34, 10, 6, 3.0, 4], [34, 8, 6.5, 3.2, 4.2], [-8, 16, 5, 2.8, 3.4],
      [18, 18, 5.5, 2.8, 3.6]
    ];
    units.forEach(([x, z, w, h, d]) => {
      const u = new T.Mesh(new T.BoxGeometry(w, h, d), boxMat);
      u.position.set(x, roofY + h / 2, z);
      // 屋面设备不投射阴影：低日照角度下会在广场上形成大片深色斑块，视觉上像污渍
      u.userData.noShadow = true;
      g.add(u);
      for (let i = 0; i < Math.max(1, Math.floor(w / 2.2)); i++) {
        const fan = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.3, 14), darkMat);
        fan.position.set(x - w / 2 + 1.2 + i * 2.2, roofY + h + 0.15, z);
        fan.userData.noShadow = true;
        g.add(fan);
      }
    });
    // 排风管井
    [[-50, 26], [46, 26], [0, -34], [-20, 30]].forEach(([x, z]) => {
      const s = new T.Mesh(new T.BoxGeometry(3.5, 5, 3.5), M.concDark);
      s.position.set(x, roofY + 2.5, z);
      s.userData.noShadow = true;
      g.add(s);
      const cap = new T.Mesh(new T.BoxGeometry(4.1, 0.35, 4.1), darkMat);
      cap.position.set(x, roofY + 5.1, z);
      cap.userData.noShadow = true;
      g.add(cap);
    });
    // 屋顶采光穹顶
    [[-30, -8], [30, -6]].forEach(([x, z]) => {
      const dome = new T.Mesh(new T.SphereGeometry(6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), M.skylight);
      dome.scale.set(1, 0.42, 1);
      dome.position.set(x, roofY, z);
      dome.userData.noShadow = true;
      g.add(dome);
      const ring = new T.Mesh(new T.CylinderGeometry(6.1, 6.1, 0.8, 24, 1, true), M.concDark);
      ring.position.set(x, roofY + 0.4, z);
      g.add(ring);
    });
    return g;
  }

  /* ------------------------------ 主建筑 ------------------------------ */
  function build() {
    const g = new T.Group();
    g.name = '万达广场主体';
    const M = makeMaterials();
    const night = [];
    W.nightTargets = W.nightTargets || [];
    W.nightTargets.push(...night);
    W.mallMaterials = M;

    /* --- 首层商业（0 ~ 6.2m）：贴图 32m x 6.2m，含 4 个 8m 店铺单元 --- */
    const store = new T.Mesh(U.buildWallRing(POLY, 0, D.H_STORE, 32, D.H_STORE), M.store);
    store.name = '首层商业橱窗';
    g.add(store);
    night.push({ mat: M.store, day: 0.0, night: 0.95 });

    /* --- 上部玻璃幕墙（6.2 ~ 24.5m）：贴图 8m x 4m --- */
    const cw = new T.Mesh(U.buildWallRing(POLY, D.H_STORE, D.H_PODIUM, 8, 4), M.curtain);
    cw.name = '玻璃幕墙';
    g.add(cw);
    // 夜间室内透光
    night.push({ mat: M.curtain, day: 0.0, night: 0.5 });
    night.push({ mat: M.atrium, day: 0.0, night: 0.42 });

    /* --- 铝板腰线 --- */
    const band = new T.Mesh(U.buildWallRing(POLY, D.H_STORE - 0.45, D.H_STORE + 0.35, 4, 0.8), M.metal);
    band.name = '铝板腰线';
    g.add(band);

    /* --- 女儿墙 --- */
    const par = new T.Mesh(U.buildWallRing(POLY, D.H_PODIUM, D.H_PARAPET, 4, 1.5), M.concDark);
    par.name = '女儿墙';
    g.add(par);
    const cap = new T.Mesh(U.buildRingSlab(POLY, U.offsetPolygon(POLY, 0.25), D.H_PARAPET, true), M.metal);
    cap.name = '女儿墙压顶';
    g.add(cap);

    /* --- 屋面 --- */
    const roof = new T.Mesh(U.buildSlab(POLY, D.H_PODIUM + 0.02, 8), M.roof);
    roof.name = '屋面';
    g.add(roof);

    /* --- 屋面设备 --- */
    g.add(buildRoofEquipment(M, D.H_PODIUM + 0.05));

    /* --- 中庭体量 --- */
    g.add(buildAtrium(M, night));

    /* --- 影城标识（东立面高处） --- */
    const cinema = U.makeGlowSign('万达影城 IMAX', {
      fontSize: 150, height: 2.2, color: '#ffd9a0', glow: 'rgba(255,190,90,1)',
      letterSpacing: 8, backing: true, backingColor: '#241d14'
    });
    cinema.rotation.y = Math.PI / 2;
    cinema.position.set(66.5, 20.5, 4);
    cinema.name = '影城标识';
    g.add(cinema);

    /* --- 西立面副招牌 --- */
    const sign2 = U.makeGlowSign('万达广场', {
      fontSize: 200, height: 2.4, color: '#ffffff', glow: 'rgba(210,235,255,1)',
      letterSpacing: 18, backing: true, backingColor: '#20242a'
    });
    sign2.rotation.y = -Math.PI / 2;
    sign2.position.set(-66.5, 19.5, -8);
    sign2.name = '西立面招牌';
    g.add(sign2);

    /* --- 南立面副招牌 --- */
    const sign3 = U.makeGlowSign('万达广场', {
      fontSize: 200, height: 2.4, color: '#ffffff', glow: 'rgba(210,235,255,1)',
      letterSpacing: 18, backing: true, backingColor: '#20242a'
    });
    sign3.rotation.y = Math.PI;
    sign3.position.set(-20, 19.5, -46.6);
    sign3.name = '南立面招牌';
    g.add(sign3);

    /* --- 东侧次入口雨棚 --- */
    const canopyE = new T.Mesh(new T.BoxGeometry(3.0, 0.45, 14), M.metal);
    canopyE.position.set(67.5, 6.7, 10);
    g.add(canopyE);
    const canopyE2 = new T.Mesh(new T.BoxGeometry(0.3, 0.45, 14), M.metalDark);
    canopyE2.position.set(68.9, 6.5, 10);
    g.add(canopyE2);

    /* --- 南侧次入口雨棚 --- */
    const canopyS = new T.Mesh(new T.BoxGeometry(16, 0.45, 3.0), M.metal);
    canopyS.position.set(0, 6.7, -47.5);
    g.add(canopyS);

    /* --- 立面色带灯（夜间轮廓） --- */
    const outlineMat = new T.MeshBasicMaterial({ color: 0x86c8ff, transparent: true, opacity: 0.0 });
    const outline = new T.Mesh(U.buildWallRing(POLY, D.H_PODIUM - 0.1, D.H_PODIUM + 0.02, 4, 0.2), outlineMat);
    outline.name = '立面轮廓灯';
    g.add(outline);
    night.push({ mat: outlineMat, day: 0.0, night: 0.85, opacityMode: true });

    W.mallNight = night;
    return g;
  }

  W.mall = { build, D, POLY };
})(window);
