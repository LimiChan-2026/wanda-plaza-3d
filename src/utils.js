/* =============================================================================
 * utils.js —— 程序化贴图 / 材质 / 几何工具库
 * 所有贴图均由 Canvas 实时绘制，不依赖任何外部图片资源（离线可用）。
 * ========================================================================== */
(function (global) {
  'use strict';
  const W = (global.WANDA = global.WANDA || {});
  const T = global.THREE;

  /* ------------------------------ 随机数 ------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20240816);
  const rand = (a, b) => a + rnd() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  /* --------------------------- Canvas 贴图工厂 --------------------------- */
  const texCache = new Map();

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /**
   * 创建 CanvasTexture
   * @param {number} w 宽
   * @param {number} h 高
   * @param {Function} draw 绘制回调 (ctx, w, h)
   * @param {Object} opt {repeat:[x,y], srgb:true, aniso:8, key}
   */
  function canvasTex(w, h, draw, opt) {
    opt = opt || {};
    if (opt.key && texCache.has(opt.key)) {
      const t = texCache.get(opt.key).clone();
      t.needsUpdate = true;
      applyTexOpt(t, opt);
      return t;
    }
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const tex = new T.CanvasTexture(c);
    applyTexOpt(tex, opt);
    if (opt.key) texCache.set(opt.key, tex);
    return tex;
  }

  function applyTexOpt(tex, opt) {
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    if (opt.repeat) tex.repeat.set(opt.repeat[0], opt.repeat[1]);
    if (opt.srgb !== false) tex.encoding = T.sRGBEncoding;
    tex.anisotropy = opt.aniso || 8;
    tex.needsUpdate = true;
  }

  function cloneTex(tex, rx, ry) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }

  function noise(ctx, w, h, amount, alpha) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
      if (alpha !== undefined) d[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ============================ 1. 幕墙玻璃 ============================ */
  // 一个 tile = 4m x 4m（一层高 ≈ 4m，柱距 ≈ 4m）
  function texCurtainWall(opt) {
    opt = Object.assign({
      cols: 2, rows: 1,           // tile 内 2 个开间 x 1 层
      glass: '#2b3f52', glass2: '#3c566e',
      frame: '#b9c0c6', spandrel: '#59636d',
      px: 256, spandrelRatio: 0.26
    }, opt || {});
    const px = opt.px;
    const w = px * opt.cols, h = px * opt.rows;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = opt.frame; ctx.fillRect(0, 0, w, h);
      const cw = w / opt.cols, ch = h / opt.rows;
      const mull = Math.max(2, px * 0.022);
      for (let r = 0; r < opt.rows; r++) {
        for (let c = 0; c < opt.cols; c++) {
          const x = c * cw + mull, y = r * ch + mull;
          const gw = cw - mull * 2, gh = ch - mull * 2;
          // 玻璃渐变（上暗下亮，模拟天空反射）
          const g = ctx.createLinearGradient(x, y, x + gw * 0.35, y + gh);
          const t = rnd();
          g.addColorStop(0, t > 0.72 ? opt.glass2 : opt.glass);
          g.addColorStop(0.55, opt.glass);
          g.addColorStop(1, t > 0.5 ? '#48627c' : '#2f4356');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, gw, gh);
          // 竖向反射条纹
          ctx.globalAlpha = 0.10;
          ctx.fillStyle = '#cfe4f5';
          ctx.fillRect(x + gw * (0.1 + rnd() * 0.5), y, gw * 0.09, gh);
          ctx.globalAlpha = 1;
          // 楼层遮挡板（spandrel）
          ctx.fillStyle = opt.spandrel;
          ctx.fillRect(x, y + gh * (1 - opt.spandrelRatio), gw, gh * opt.spandrelRatio);
          // 玻璃分隔线
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y + gh * 0.5); ctx.lineTo(x + gw, y + gh * 0.5);
          ctx.stroke();
        }
      }
      // 横向楼层线（略深）
      ctx.fillStyle = 'rgba(20,28,36,0.55)';
      for (let r = 1; r < opt.rows; r++) ctx.fillRect(0, r * ch - mull * 0.6, w, mull * 1.2);
      noise(ctx, w, h, 12);
    }, { repeat: opt.repeat || [1, 1], key: 'cw' + JSON.stringify(opt) });
  }

  /* ========================= 2. 首层商业橱窗 ========================= */
  const BRANDS = ['STARBUCKS', 'UNIQLO', 'H&M', 'NIKE', 'ADIDAS', 'SEPHORA', 'WATSONS',
    'MIXUE', 'LUCKIN', 'HUAWEI', 'XIAOMI', 'ANT A', 'CHOW TAI FOOK', 'LAO XIANG JI',
    'PIZZA HUT', 'KFC', 'MCD', 'MINISO', 'POP MART', 'SUNING', 'WANDA CINEMA'];
  const BRAND_COLORS = ['#e2231a', '#0a4d8c', '#111111', '#f5a623', '#e6007e', '#00a651',
    '#7b2d8e', '#0084c7', '#d40000', '#1b1b1b'];

  // tile = 32m 宽 x 6.2m 高（首层通高，含 4 个 8m 店铺单元）
  function texStorefront(seed) {
    const w = 2048, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(0, 0, w, h);
      // 檐口/梁带
      ctx.fillStyle = '#2a2f35'; ctx.fillRect(0, 0, w, h * 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, h * 0.15, w, 4);
      // 4 个店铺单元
      const units = 4, uw = w / units;
      for (let i = 0; i < units; i++) {
        const x = i * uw;
        const brand = BRANDS[(seed * 7 + i * 5) % BRANDS.length];
        const bcol = BRAND_COLORS[(seed * 3 + i * 7) % BRAND_COLORS.length];
        // 店铺内暖光（每个单元亮度略有差异，降低重复感）
        const warm = 0.92 + ((seed * 13 + i * 29) % 7) * 0.025;
        const g = ctx.createLinearGradient(x, h * 0.16, x, h);
        g.addColorStop(0, `rgb(${Math.floor(255 * warm)},${Math.floor(243 * warm)},${Math.floor(214 * warm)})`);
        g.addColorStop(0.5, `rgb(${Math.floor(246 * warm)},${Math.floor(226 * warm)},${Math.floor(187 * warm)})`);
        g.addColorStop(1, `rgb(${Math.floor(217 * warm)},${Math.floor(189 * warm)},${Math.floor(140 * warm)})`);
        ctx.fillStyle = g;
        ctx.fillRect(x + 10, h * 0.17, uw - 20, h * 0.81);
        // 内部货架/人影剪影
        ctx.fillStyle = 'rgba(120,95,60,0.35)';
        for (let k = 0; k < 9; k++) {
          ctx.fillRect(x + 20 + rnd() * (uw - 70), h * (0.45 + rnd() * 0.3), 10 + rnd() * 26, h * (0.15 + rnd() * 0.3));
        }
        ctx.fillStyle = 'rgba(60,45,30,0.45)';
        for (let k = 0; k < 3; k++) {
          const px2 = x + 30 + rnd() * (uw - 70);
          ctx.beginPath(); ctx.arc(px2, h * 0.62, 7, 0, 6.29); ctx.fill();
          ctx.fillRect(px2 - 8, h * 0.66, 16, h * 0.22);
        }
        // 店招灯箱
        ctx.fillStyle = bcol;
        ctx.fillRect(x + 12, h * 0.16, uw - 24, h * 0.13);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `bold ${Math.floor(h * 0.072)}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(brand, x + uw / 2, h * 0.226);
        // 玻璃门
        ctx.fillStyle = 'rgba(180,205,225,0.5)';
        ctx.fillRect(x + uw * 0.38, h * 0.55, uw * 0.24, h * 0.43);
        ctx.strokeStyle = '#8d9aa6'; ctx.lineWidth = 3;
        ctx.strokeRect(x + uw * 0.38, h * 0.55, uw * 0.24, h * 0.43);
        // 竖向框料
        ctx.fillStyle = '#20252b';
        ctx.fillRect(x, 0, 10, h); ctx.fillRect(x + uw - 10, 0, 10, h);
        // 玻璃反光
        ctx.globalAlpha = 0.13; ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x + uw * 0.1, h); ctx.lineTo(x + uw * 0.3, h * 0.15);
        ctx.lineTo(x + uw * 0.42, h * 0.15); ctx.lineTo(x + uw * 0.22, h);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      }
      noise(ctx, w, h, 8);
    }, { repeat: [1, 1] });
  }

  /* ============================ 3. 地面铺装 ============================ */
  // tile = 8m x 8m
  function texPavement() {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#a8a299'; ctx.fillRect(0, 0, w, h);
      const n = 4, s = w / n; // 2m 一块
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const v = 0.86 + rnd() * 0.22;
          ctx.fillStyle = `rgb(${Math.floor(170 * v)},${Math.floor(165 * v)},${Math.floor(156 * v)})`;
          ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
          // 石材纹理
          ctx.globalAlpha = 0.06;
          for (let k = 0; k < 5; k++) {
            ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#6d6659';
            ctx.fillRect(i * s + rnd() * s, j * s + rnd() * s, s * 0.4, 2 + rnd() * 5);
          }
          ctx.globalAlpha = 1;
        }
      }
      // 深色分隔带
      ctx.strokeStyle = 'rgba(90,86,78,0.85)'; ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,115,105,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
      ctx.stroke();
      noise(ctx, w, h, 16);
    }, { repeat: [1, 1], key: 'pave' });
  }

  function texPlazaPave() {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      // 暖灰色广场砖 + 拼花
      ctx.fillStyle = '#b4ada0'; ctx.fillRect(0, 0, w, h);
      const n = 8, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 0.9 + rnd() * 0.16;
        ctx.fillStyle = `rgb(${Math.floor(180 * v)},${Math.floor(174 * v)},${Math.floor(161 * v)})`;
        ctx.fillRect(i * s, j * s, s - 2, s - 2);
      }
      // 深色装饰条
      ctx.strokeStyle = 'rgba(120,110,96,0.55)'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, s * 2); ctx.lineTo(w, s * 2);
      ctx.moveTo(0, s * 6); ctx.lineTo(w, s * 6);
      ctx.moveTo(s * 4, 0); ctx.lineTo(s * 4, h);
      ctx.stroke();
      noise(ctx, w, h, 12);
    }, { repeat: [1, 1], key: 'plazapave' });
  }

  /* ============================== 4. 沥青 ============================== */
  function texAsphalt(light) {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = light ? '#54565a' : '#3e4044'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = `rgba(${120 + rnd() * 90},${120 + rnd() * 90},${120 + rnd() * 90},${0.05 + rnd() * 0.16})`;
        ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
      }
      noise(ctx, w, h, 20);
    }, { repeat: [1, 1], key: 'asphalt' + (light ? 'L' : 'D') });
  }

  function texGrass() {
    const w = 256, h = 256;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#5c7346'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        const g = 80 + rnd() * 80;
        ctx.fillStyle = `rgba(${g * 0.72},${g},${g * 0.56},${0.2 + rnd() * 0.42})`;
        ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5 + rnd() * 3);
      }
      noise(ctx, w, h, 14);
    }, { repeat: [1, 1], key: 'grass' });
  }

  /* =========================== 5. 屋面 / 混凝土 =========================== */
  function texRoof() {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#8e8b86'; ctx.fillRect(0, 0, w, h);
      // 屋面卷材分格
      ctx.strokeStyle = 'rgba(70,68,64,0.6)'; ctx.lineWidth = 4;
      const n = 4, s = w / n;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke();
      }
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(${140 + rnd() * 70},${138 + rnd() * 70},${132 + rnd() * 70},0.5)`;
        ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5);
      }
      noise(ctx, w, h, 18);
    }, { repeat: [1, 1], key: 'roof' });
  }

  function texConcrete(tint) {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = tint || '#cfc9bf'; ctx.fillRect(0, 0, w, h);
      // 石材/铝板分缝
      ctx.strokeStyle = 'rgba(120,116,108,0.55)'; ctx.lineWidth = 3;
      const n = 4, s = w / n;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke();
      // 竖向污渍
      ctx.globalAlpha = 0.07;
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = '#5c584f';
        ctx.fillRect(rnd() * w, 0, 2 + rnd() * 8, h);
      }
      ctx.globalAlpha = 1;
      noise(ctx, w, h, 12);
    }, { repeat: [1, 1], key: 'conc' + (tint || '') });
  }

  /* =========================== 6. 办公塔楼幕墙 =========================== */
  function texOfficeTower() {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#8f9aa3'; ctx.fillRect(0, 0, w, h);
      const cols = 4, rows = 4;
      const cw = w / cols, ch = h / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * cw, y = j * ch;
          const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
          const t = rnd();
          g.addColorStop(0, t > 0.6 ? '#7fa0bb' : '#5d7994');
          g.addColorStop(1, t > 0.3 ? '#41566b' : '#2f4356');
          ctx.fillStyle = g;
          ctx.fillRect(x + 3, y + 3, cw - 6, ch - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + 3, y + ch - ch * 0.2, cw - 6, ch * 0.14);
        }
      }
      ctx.strokeStyle = '#b6bcc2'; ctx.lineWidth = 3;
      for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke(); }
      for (let j = 0; j <= rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(w, j * ch); ctx.stroke(); }
      noise(ctx, w, h, 8);
    }, { repeat: [1, 1], key: 'office' });
  }

  /* ============================= 7. 汉字招牌 ============================= */
  /**
   * 生成带透明背景的文字贴图（用于发光字）
   * @param {string} text 文字（可含换行 \n）
   * @param {Object} opt {font, weight, color, glow, pad, stroke}
   */
  function texText(text, opt) {
    opt = Object.assign({
      font: '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif',
      weight: 'bold', color: '#ffffff', glow: 'rgba(255,255,255,0.9)',
      pad: 24, bg: null, w: 0, h: 0, letterSpacing: 0
    }, opt || {});
    const lines = String(text).split('\n');
    // 预估画布尺寸
    const measure = makeCanvas(8, 8).getContext('2d');
    const fs = opt.fontSize || 200;
    measure.font = `${opt.weight} ${fs}px ${opt.font}`;
    let maxW = 0;
    lines.forEach(l => { maxW = Math.max(maxW, measure.measureText(l).width + l.length * opt.letterSpacing); });
    const w = opt.w || Math.ceil(maxW + opt.pad * 2);
    const h = opt.h || Math.ceil(fs * 1.28 * lines.length + opt.pad * 2);
    return canvasTex(w, h, (ctx) => {
      if (opt.bg) { ctx.fillStyle = opt.bg; ctx.fillRect(0, 0, w, h); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${opt.weight} ${fs}px ${opt.font}`;
      if (opt.glow) {
        ctx.shadowColor = opt.glow;
        ctx.shadowBlur = fs * 0.22;
      }
      ctx.fillStyle = opt.color;
      lines.forEach((l, i) => {
        const y = opt.pad + fs * 1.28 * (i + 0.5);
        if (opt.letterSpacing) {
          // 手动字距
          const total = measure.measureText(l).width + (l.length - 1) * opt.letterSpacing;
          let x = (w - total) / 2;
          for (const ch of l) {
            const cw2 = measure.measureText(ch).width;
            ctx.fillText(ch, x + cw2 / 2, y);
            x += cw2 + opt.letterSpacing;
          }
        } else {
          ctx.fillText(l, w / 2, y);
        }
      });
      if (opt.stroke) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = opt.stroke;
        ctx.lineWidth = fs * 0.03;
        lines.forEach((l, i) => ctx.strokeText(l, w / 2, opt.pad + fs * 1.28 * (i + 0.5)));
      }
    }, { repeat: [1, 1] });
  }

  /* ============================== 8. LED 屏 ============================== */
  function texLED(variant) {
    const w = 1024, h = 512;
    const ads = [
      { bg: ['#0b1a3a', '#123a7a'], txt: 'WANDA\nPLAZA', sub: '万达广场', col: '#ffffff', acc: '#ffd34d' },
      { bg: ['#3a0b2e', '#8a1250'], txt: '双十一\n狂欢购', sub: '11.11 SALE', col: '#ffffff', acc: '#ff5fa2' },
      { bg: ['#062b2b', '#0d6b5f'], txt: '开业盛典\n盛大启幕', sub: 'GRAND OPENING', col: '#ffffff', acc: '#5cf2c4' },
      { bg: ['#2b0a0a', '#8c1c1c'], txt: 'IMAX\n万达影城', sub: 'WANDA CINEMA', col: '#ffffff', acc: '#ffb347' },
      { bg: ['#101820', '#25415c'], txt: '海底捞\n24H', sub: 'HOT POT', col: '#ffffff', acc: '#ff6b35' }
    ];
    const a = ads[variant % ads.length];
    return canvasTex(w, h, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, a.bg[0]); g.addColorStop(1, a.bg[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // 光晕装饰
      const rg = ctx.createRadialGradient(w * 0.78, h * 0.22, 10, w * 0.78, h * 0.22, w * 0.5);
      rg.addColorStop(0, a.acc + 'cc'); rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      // 斜纹
      ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffffff';
      for (let i = -h; i < w; i += 46) {
        ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + 22, h); ctx.lineTo(i + 22 + h, 0); ctx.lineTo(i + h, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 主文案
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 92px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillStyle = a.col; ctx.shadowColor = a.acc; ctx.shadowBlur = 26;
      a.txt.split('\n').forEach((l, i) => ctx.fillText(l, 70, h * 0.32 + i * 108));
      ctx.shadowBlur = 0;
      ctx.font = 'bold 34px "Segoe UI",Arial,sans-serif';
      ctx.fillStyle = a.acc;
      ctx.fillText(a.sub, 74, h * 0.32 + a.txt.split('\n').length * 108 + 8);
      // 底部走马灯条
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, h - 66, w, 66);
      ctx.fillStyle = a.acc; ctx.font = 'bold 32px "Microsoft YaHei",sans-serif';
      ctx.fillText('◆ 万达广场 · 城市生活中心 · 招商热线 400-000-0000', 40, h - 32);
    }, { repeat: [1, 1] });
  }

  /* =========================== 9. 道路贴图 =========================== */
  function texRoad() {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#43454a'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = `rgba(${110 + rnd() * 80},${110 + rnd() * 80},${112 + rnd() * 80},${0.04 + rnd() * 0.12})`;
        ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      noise(ctx, w, h, 16);
    }, { repeat: [1, 1], key: 'road' });
  }

  /* ========================= 10. 停车位贴图 ========================= */
  function texParkingLot() {
    const w = 512, h = 512; // 代表 16m x 16m
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#4a4c50'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(${120 + rnd() * 70},${120 + rnd() * 70},${122 + rnd() * 70},${0.05 + rnd() * 0.12})`;
        ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
      ctx.strokeStyle = 'rgba(235,235,230,0.75)'; ctx.lineWidth = 4;
      // 竖向车位线（每 2.5m 一个车位）
      const stall = w / 6.4;
      for (let i = 0; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(i * stall, 0); ctx.lineTo(i * stall, h * 0.45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * stall, h * 0.55); ctx.lineTo(i * stall, h); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, h * 0.45); ctx.lineTo(w, h * 0.45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * 0.55); ctx.lineTo(w, h * 0.55); ctx.stroke();
      noise(ctx, w, h, 12);
    }, { repeat: [1, 1] });
  }

  /* ========================== 11. 天窗玻璃 ========================== */
  function texSkylight() {
    const w = 256, h = 256;
    return canvasTex(w, h, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#8fb6d6'); g.addColorStop(0.5, '#5d87ab'); g.addColorStop(1, '#a9c8e0');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c8d2da'; ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, w, h);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * 0.6, 0); ctx.lineTo(w * 0.85, 0); ctx.lineTo(w * 0.25, h);
      ctx.closePath(); ctx.fill();
      noise(ctx, w, h, 6);
    }, { repeat: [1, 1], key: 'skylight' });
  }

  /* ========================== 12. 夜间窗光 ========================== */
  // 办公楼夜间亮灯贴图：按「整层点亮 / 成组点亮 / 零星加班」三种模式生成，
  // 比逐格随机更接近真实夜景（逐格随机会呈现棋盘状噪声感）
  function texOfficeNight() {
    const w = 512, h = 512;
    return canvasTex(w, h, (ctx) => {
      ctx.fillStyle = '#0d1420'; ctx.fillRect(0, 0, w, h);
      const cols = 8, rows = 10, cw = w / cols, ch = h / rows;

      const light = (i, j, alpha) => {
        const warm = rnd();
        ctx.fillStyle = warm > 0.62 ? '#ffe6b0' : (warm > 0.32 ? '#cfe4ff' : '#9fc4e8');
        ctx.globalAlpha = alpha;
        ctx.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
        ctx.globalAlpha = 1;
      };

      for (let j = 0; j < rows; j++) {
        const mode = rnd();
        if (mode > 0.82) {
          // 整层办公照明
          for (let i = 0; i < cols; i++) light(i, j, 0.55 + rnd() * 0.4);
        } else if (mode > 0.5) {
          // 成组点亮（同一租户区域）
          const start = randInt(0, cols - 4), len = randInt(2, 4);
          for (let i = start; i < Math.min(cols, start + len); i++) light(i, j, 0.5 + rnd() * 0.4);
        } else {
          // 零星加班
          for (let i = 0; i < cols; i++) {
            if (rnd() > 0.78) light(i, j, 0.4 + rnd() * 0.45);
          }
        }
      }

      ctx.strokeStyle = 'rgba(90,100,115,0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke(); }
      for (let j = 0; j <= rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(w, j * ch); ctx.stroke(); }
    }, { repeat: [1, 1] });
  }

  /* =========================== 几何工具 =========================== */
  /** 合并若干 Mesh 的几何（同材质） */
  function mergeMeshes(meshes, material) {
    const geos = [];
    meshes.forEach(m => {
      const g = m.geometry.clone();
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      geos.push(g);
    });
    const merged = T.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    return new T.Mesh(merged, material);
  }

  /** 多边形外扩（凸/弱凹多边形，沿角平分线），方向与 buildWallRing 的外法线一致 */
  function offsetPolygon(poly, d) {
    const n = poly.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
      const v1 = norm([p1[0] - p0[0], p1[1] - p0[1]]);
      const v2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
      const n1 = [v1[1], -v1[0]], n2 = [v2[1], -v2[0]]; // 外法线 (dz, -dx)
      const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
      const cosHalf = Math.max(0.4, bis[0] * n1[0] + bis[1] * n1[1]);
      out.push([p1[0] + bis[0] * d / cosHalf, p1[1] + bis[1] * d / cosHalf]);
    }
    return out;
  }
  function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
  function polyLength(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return s;
  }

  /**
   * 沿多边形轮廓生成竖直墙面（可指定高度区间），UV 按实际尺寸铺贴
   * @param {Array} poly [[x,z],...]
   * @param {number} y0 底标高
   * @param {number} y1 顶标高
   * @param {number} tileW 贴图横向覆盖实际宽度(米)
   * @param {number} tileH 贴图纵向覆盖实际高度(米)
   * @param {Array} skipEdges 需要跳过的边索引数组（如中庭幕墙位置）
   */
  function buildWallRing(poly, y0, y1, tileW, tileH, skipEdges) {
    const pos = [], uv = [], idx = [], nrm = [];
    let dist = 0;
    const h = y1 - y0;
    const skip = skipEdges || [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (skip.indexOf(i) >= 0) { dist += len; continue; }
      const base = pos.length / 3;
      pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      const u0 = dist / tileW, u1 = (dist + len) / tileW;
      uv.push(u0, 0, u1, 0, u1, h / tileH, u0, h / tileH);
      const n = norm([b[1] - a[1], -(b[0] - a[0])]); // 外向法线 = (dz, -dx)
      for (let k = 0; k < 4; k++) nrm.push(n[0], 0, n[1]);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      dist += len;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  }

  /** 反转三角形绕序（用于修正 ShapeGeometry 旋转后的法线朝向） */
  function flipWinding(g) {
    const idx = g.getIndex();
    if (idx) {
      const a = idx.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
      idx.needsUpdate = true;
    }
    g.computeVertexNormals();
    return g;
  }

  /** 由多边形生成水平面（默认顶面朝上） */
  function buildSlab(poly, y, tile, faceUp) {
    const shape = new T.Shape();
    poly.forEach((p, i) => i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1]));
    const g = new T.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);              // XY 平面 -> XZ 平面：(x, z) -> (x, 0, z)
    if (faceUp !== false) flipWinding(g); // 使法线朝 +Y
    else g.computeVertexNormals();
    // 按世界坐标重新计算 UV（每 tile 米一个循环）
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    uv.needsUpdate = true;
    g.translate(0, y, 0);
    return g;
  }

  /** 环形平板（雨棚/挑檐），内多边形 -> 外多边形；faceUp=true 朝上，false 朝下 */
  function buildRingSlab(inner, outer, y, faceUp) {
    const pos = [], uv = [], idx = [], nrm = [];
    const up = faceUp !== false;
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      const c = outer[(i + 1) % outer.length], d = outer[i];
      const base = pos.length / 3;
      if (up) {
        pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], d[0], y, d[1]);
      } else {
        pos.push(a[0], y, a[1], d[0], y, d[1], c[0], y, c[1], b[0], y, b[1]);
      }
      uv.push(a[0] / 8, a[1] / 8, b[0] / 8, b[1] / 8, c[0] / 8, c[1] / 8, d[0] / 8, d[1] / 8);
      for (let k = 0; k < 4; k++) nrm.push(0, up ? 1 : -1, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  }

  /** 发光字招牌（贴图 + 背板） */
  function makeGlowSign(text, opt) {
    opt = Object.assign({ fontSize: 220, color: '#ffffff', glow: 'rgba(255,255,255,0.95)', height: 8, backing: true, backingColor: '#1a1d21', letterSpacing: 12 }, opt || {});
    const tex = texText(text, { fontSize: opt.fontSize, color: opt.color, glow: opt.glow, letterSpacing: opt.letterSpacing, pad: 30 });
    const aspect = tex.image.width / tex.image.height;
    const h = opt.height, w = h * aspect;
    const grp = new T.Group();
    if (opt.backing) {
      const back = new T.Mesh(new T.BoxGeometry(w + h * 0.14, h + h * 0.1, h * 0.16),
        new T.MeshStandardMaterial({ color: opt.backingColor, roughness: 0.75, metalness: 0.25 }));
      back.position.z = -h * 0.09;
      grp.add(back);
    }
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const plane = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    plane.position.z = h * 0.005;
    grp.add(plane);
    grp.userData.size = { w, h };
    return grp;
  }

  /* ============================ 材质库 ============================ */
  function stdMat(o) { return new T.MeshStandardMaterial(o); }
  function glassMat(color, o) {
    return new T.MeshStandardMaterial(Object.assign({
      color: color || 0x3d5a75, roughness: 0.12, metalness: 0.85,
      envMapIntensity: 1.2
    }, o || {}));
  }

  W.utils = {
    rnd, rand, randInt, pick, mulberry32,
    canvasTex, cloneTex, makeCanvas, noise, applyTexOpt,
    texCurtainWall, texStorefront, texPavement, texPlazaPave, texAsphalt, texGrass,
    texRoof, texConcrete, texOfficeTower, texText, texLED, texRoad, texParkingLot,
    texSkylight, texOfficeNight,
    mergeMeshes, offsetPolygon, polyLength, buildWallRing, buildSlab, buildRingSlab,
    makeGlowSign, stdMat, glassMat,
    BRANDS, BRAND_COLORS
  };
})(window);
