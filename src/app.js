/* =============================================================================
 * app.js —— 场景装配 / 光照与日夜系统 / 相机 / 交互 / 导出
 * ========================================================================== */
(function (global) {
  'use strict';
  const W = (global.WANDA = global.WANDA || {});
  const T = global.THREE;
  const U = W.utils;

  const params = new URLSearchParams(location.search);
  const SHOT = params.get('shot');            // 无头截图模式：?shot=overview
  const HOUR0 = params.has('hour') ? parseFloat(params.get('hour')) : 15.5;

  let renderer, scene, camera, controls, clock;
  let sun, hemi, ambient, sky, skyMat;
  let sunTarget;
  let currentHour = HOUR0;
  let autoRotate = false;
  const tween = { active: false, t: 0, dur: 1.0, from: null, to: null, fromT: null, toT: null };

  /* ============================== 天空 ============================== */
  const SKY_VERT = `
    varying vec3 vWorldPos;
    void main() {
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const SKY_FRAG = `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 bottomColor;
    uniform vec3 sunColor;
    uniform vec3 sunDir;
    uniform float starAmt;
    varying vec3 vWorldPos;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    void main() {
      vec3 dir = normalize(vWorldPos);
      float h = clamp(dir.y, -0.2, 1.0);
      vec3 col;
      // 暖色带只保留在地平线附近，向上迅速过渡到天顶色（否则黄昏整片天空发棕）
      if (h > 0.04) {
        col = mix(midColor, topColor, smoothstep(0.04, 0.46, h));
      } else {
        col = mix(bottomColor, midColor, smoothstep(-0.12, 0.04, h));
      }
      float sd = max(dot(dir, normalize(sunDir)), 0.0);
      // 太阳本体
      col += sunColor * pow(sd, 420.0) * 3.0;
      // 太阳光晕
      col += sunColor * pow(sd, 12.0) * 0.35;
      // 地平线霞光
      float horizon = pow(sd, 2.5) * (1.0 - smoothstep(0.0, 0.45, abs(h)));
      col += sunColor * horizon * 0.30;
      // 星空
      if (starAmt > 0.001 && dir.y > 0.0) {
        vec3 gp = floor(dir * 420.0);
        float s = hash(gp);
        float star = smoothstep(0.9975, 1.0, s) * (0.5 + 0.5 * hash(gp + 3.7));
        col += vec3(star) * starAmt * smoothstep(0.0, 0.35, dir.y) * 2.2;
      }
      gl_FragColor = vec4(col, 1.0);
    }`;

  function buildSky() {
    const geo = new T.SphereGeometry(1600, 32, 20);
    skyMat = new T.ShaderMaterial({
      uniforms: {
        topColor: { value: new T.Color(0x2c6bc4) },
        midColor: { value: new T.Color(0x8fc0e8) },
        bottomColor: { value: new T.Color(0xd8e4ee) },
        sunColor: { value: new T.Color(0xfff0d0) },
        sunDir: { value: new T.Vector3(0.5, 0.6, 0.5) },
        starAmt: { value: 0.0 }
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: T.BackSide,
      depthWrite: false,
      fog: false
    });
    sky = new T.Mesh(geo, skyMat);
    sky.name = '天空';
    return sky;
  }

  /* ============================== 环境贴图 ============================== */
  function buildEnv(renderer) {
    const pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new T.Scene();
    // 简易渐变环境：上蓝下灰 + 地面
    const g = new T.SphereGeometry(100, 24, 16);
    const m = new T.ShaderMaterial({
      uniforms: {
        top: { value: new T.Color(0x6ba3dd) },
        bot: { value: new T.Color(0xbfc4c8) },
        sunDir: { value: new T.Vector3(0.5, 0.7, 0.4) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          vec3 c = mix(bot, top, smoothstep(-0.1, 0.6, d.y));
          float s = pow(max(dot(d, normalize(sunDir)), 0.0), 8.0);
          c += vec3(1.0, 0.95, 0.85) * s * 0.8;
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: T.BackSide
    });
    envScene.add(new T.Mesh(g, m));
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    return rt.texture;
  }

  /* ============================== 初始化 ============================== */
  function init() {
    const canvas = document.getElementById('scene');

    renderer = new T.WebGLRenderer({
      canvas, antialias: true, alpha: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, SHOT ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = false;

    scene = new T.Scene();
    scene.fog = new T.Fog(0xcdd8e2, 420, 1500);

    // 环境反射
    const envTex = buildEnv(renderer);
    scene.environment = envTex;

    camera = new T.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 4000);
    camera.position.set(-155, 92, 178);

    controls = new T.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(2, 12, 16);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 18;
    controls.maxDistance = 900;
    controls.autoRotateSpeed = 0.35;

    clock = new T.Clock();

    /* --------- 光照 --------- */
    ambient = new T.AmbientLight(0xdfe9f5, 0.35);
    scene.add(ambient);

    hemi = new T.HemisphereLight(0x9dc4ec, 0x6b6656, 0.55);
    scene.add(hemi);

    sun = new T.DirectionalLight(0xfff2d8, 2.1);
    sun.position.set(160, 190, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 900;
    const S = 250;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    sunTarget = new T.Object3D();
    sunTarget.position.set(0, 0, 0);
    scene.add(sunTarget);
    sun.target = sunTarget;
    scene.add(sun);

    /* --------- 天空 --------- */
    scene.add(buildSky());

    /* --------- 建筑与场地 --------- */
    const mall = W.mall.build();
    // 默认开启投影，但跳过标记了 noShadow 的构件（如屋面设备，避免在广场上留下污渍状阴影）
    mall.traverse(o => {
      if (o.isMesh) {
        if (!o.userData.noShadow) o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(mall);

    const site = W.site.build();
    scene.add(site);
    // 地面只接收阴影，减少开销
    site.traverse(o => {
      if (o.isMesh && o.name === '地面基底') { o.receiveShadow = true; o.castShadow = false; }
    });

    W.scene = scene;
    W.renderer = renderer;
    W.camera = camera;
    W.controls = controls;

    collectNightTargets();
    collectLEDs();
    setHour(currentHour, true);

    window.addEventListener('resize', onResize);
    setupUI();
    animate();

    // 首帧渲染完成标记（供无头截图等待）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      global.__WANDA_READY__ = true;
      document.getElementById('loading').classList.add('hidden');
    }));

    if (SHOT) {
      document.getElementById('ui').style.display = 'none';
      document.getElementById('hint').style.display = 'none';
      applyPreset(SHOT, true);
    }
  }

  /* ========================= 夜间发光目标收集 ========================= */
  let nightTargets = [];
  function collectNightTargets() {
    nightTargets = (W.nightTargets || []).slice();
    // 周边建筑夜间窗光
    if (W.skylineGroup) {
      W.skylineGroup.traverse(o => {
        if (o.isMesh && o.userData.isNightGlow) {
          o.visible = false;
          o.userData._nightGlow = true;
        }
      });
    }
  }

  /* ============================= LED 循环 ============================= */
  let leds = [];
  function collectLEDs() {
    const texes = [];
    for (let i = 0; i < 5; i++) texes.push(U.texLED(i));
    scene.traverse(o => {
      if (o.isMesh && (o.name === 'LED大屏' || (o.material && o.material.map &&
        o.material.map.image && o.material.map.image.width === 1024 && o.material.map.image.height === 512))) {
        if (leds.indexOf(o) < 0 && o.material && o.material.map) leds.push(o);
      }
    });
    // 精神堡垒的 LED 条
    scene.traverse(o => {
      if (o.userData && o.userData.ledMat) {
        const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), o.userData.ledMat);
        leds.push({ material: o.userData.ledMat, isMat: true });
      }
    });
    leds = leds.filter((v, i) => leds.indexOf(v) === i);
    W._ledTextures = texes;
    W._ledIndex = 0;
  }

  let ledTimer = 0;
  function updateLED(dt) {
    ledTimer += dt;
    if (ledTimer > 6.5) {
      ledTimer = 0;
      const texes = W._ledTextures;
      W._ledIndex = (W._ledIndex + 1) % texes.length;
      const t = texes[W._ledIndex];
      leds.forEach(o => {
        const mat = o.isMat ? o.material : o.material;
        if (mat) { mat.map = t; mat.needsUpdate = true; }
      });
    }
  }

  /* ============================== 日夜系统 ============================== */
  // 关键帧：按小时定义太阳高度/方位与配色
  function skyState(hour) {
    // 太阳高度角：6 点日出、12 点正午、18 点日落
    const dayT = (hour - 6) / 12;                    // 0..1 白天进度
    const elev = Math.sin(dayT * Math.PI);           // -1..1
    const azim = Math.PI * (0.15 + dayT * 0.85);     // 东 -> 西

    // 直射日照强度：太阳落到地平线以下即无直射
    const dayAmt = Math.max(0, Math.min(1, (elev + 0.06) / 0.34));
    // 暮光余晖：日出/日落前后天空仍亮，环境光需平滑延续（避免地面瞬间全黑）
    const twilight = Math.max(0, Math.min(1, 1 - Math.abs(elev) / 0.42));
    // 霞光强度
    const duskAmt = Math.max(0, 1 - Math.abs(elev) / 0.35);
    const night = elev <= -0.02;

    let top, mid, bot, sunCol, fogCol;
    if (elev > 0.02) {
      // 白天 -> 黄昏
      top = new T.Color(0x1f5fb8).lerp(new T.Color(0x2b3f6e), duskAmt * 0.75);
      mid = new T.Color(0x7fb4e4).lerp(new T.Color(0xd98a52), duskAmt * 0.85);
      bot = new T.Color(0xd6e3ee).lerp(new T.Color(0xe8a869), duskAmt * 0.9);
      sunCol = new T.Color(0xfff4dc).lerp(new T.Color(0xff9a45), duskAmt * 0.9);
      fogCol = bot.clone().lerp(new T.Color(0xffffff), 0.08);
    } else {
      // 黄昏 -> 夜晚：按 nAmt 平滑过渡，使天色与地面积光同步衰减
      const nAmt = Math.min(1, Math.max(0, -elev / 0.42));
      top = new T.Color(0x2b3f6e).lerp(new T.Color(0x070e20), nAmt);
      mid = new T.Color(0x8a6a86).lerp(new T.Color(0x101c38), nAmt);   // 暮色紫 → 夜蓝
      bot = new T.Color(0xe8a869).lerp(new T.Color(0x1e2b46), nAmt);   // 地平线暖光
      sunCol = new T.Color(0xff9a45).lerp(new T.Color(0x2a3a5c), nAmt);
      // 雾色跟随地平线色，暮色时不至于突然变黑
      fogCol = bot.clone().lerp(new T.Color(0x16223a), nAmt * 0.8);
    }
    return { elev, azim, dayAmt, duskAmt, twilight, night, top, mid, bot, sunCol, fogCol };
  }

  function setHour(hour, instant) {
    currentHour = ((hour % 24) + 24) % 24;
    const st = skyState(currentHour);

    // 太阳位置（球坐标）
    const r = 520;
    const elevRad = Math.max(-0.25, st.elev) * (Math.PI / 2) * 0.92;
    const y = Math.sin(elevRad) * r;
    const horiz = Math.cos(elevRad) * r;
    const x = Math.cos(st.azim) * horiz;
    const z = Math.sin(st.azim) * horiz;
    const dir = new T.Vector3(x, Math.max(y, -60), z).normalize();

    sun.position.set(x, Math.max(y, -60), z);
    sun.intensity = 2.5 * st.dayAmt;
    sun.color.copy(st.sunCol).lerp(new T.Color(0xffffff), 0.25);
    sun.castShadow = st.dayAmt > 0.06;

    hemi.intensity = 0.16 + 0.46 * st.dayAmt + 0.34 * st.twilight;
    hemi.color.copy(st.mid).lerp(new T.Color(0xbcd6f0), 0.35);
    hemi.groundColor.setHex(0x4a4638).lerp(new T.Color(0x2a2c33), 1 - st.dayAmt);

    // 暮光余晖：日落后环境光不立即归零，避免地面突然全黑
    ambient.intensity = 0.12 + 0.20 * st.dayAmt + 0.30 * st.twilight;
    ambient.color.copy(st.mid).lerp(new T.Color(0xc9d8ea), 0.4);

    // 天空
    skyMat.uniforms.topColor.value.copy(st.top);
    skyMat.uniforms.midColor.value.copy(st.mid);
    skyMat.uniforms.bottomColor.value.copy(st.bot);
    skyMat.uniforms.sunColor.value.copy(st.sunCol);
    skyMat.uniforms.sunDir.value.copy(dir);
    skyMat.uniforms.starAmt.value = st.night ? Math.min(1, Math.max(0, -st.elev / 0.3)) : 0.0;

    // 雾
    scene.fog.color.copy(st.fogCol);
    scene.fog.near = 380 - 120 * st.dayAmt;
    scene.fog.far = 1500 - 320 * st.dayAmt;
    renderer.setClearColor(st.fogCol);

    // 夜间发光：随天色渐暗逐步点亮，而非瞬间切换
    const nightAmt = Math.max(0, Math.min(1, 1 - st.dayAmt - 0.35 * st.twilight));
    nightTargets.forEach(t => {
      if (!t || !t.mat) return;
      const v = t.day + (t.night - t.day) * nightAmt;
      if (t.opacityMode) t.mat.opacity = v;
      else if (t.mat.emissiveIntensity !== undefined) t.mat.emissiveIntensity = v;
    });
    // 周边建筑夜景
    if (W.skylineGroup) {
      W.skylineGroup.traverse(o => {
        if (o.isMesh && o.userData._nightGlow) o.visible = nightAmt > 0.45;
      });
    }
    // 路灯
    (W.streetGlow || []).forEach(m => { m.opacity = 0.06 + 0.5 * nightAmt; });
    // 曝光微调
    renderer.toneMappingExposure = 0.82 - 0.05 * nightAmt;
    // UI
    const el = document.getElementById('hourLabel');
    if (el) {
      const hh = Math.floor(currentHour), mm = Math.floor((currentHour - hh) * 60);
      el.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` +
        (nightAmt > 0.5 ? ' · 夜' : (st.duskAmt > 0.5 ? ' · 霞' : ' · 昼'));
    }
    const slider = document.getElementById('hour');
    if (slider && !instant) slider.value = String(currentHour);
    if (slider && instant) slider.value = String(currentHour);
    W.currentHour = currentHour;
    W.nightAmt = nightAmt;
  }

  /* ============================== 相机预设 ============================== */
  const PRESETS = {
    overview: { name: '全景', pos: [-148, 96, 196], target: [0, 14, 22], hour: 15.5 },
    entrance: { name: '主入口', pos: [0, 16, 128], target: [0, 13, 50], hour: 17.6 },
    aerial: { name: '鸟瞰', pos: [96, 300, 268], target: [0, 4, 6], hour: 11.0 },
    street: { name: '街景', pos: [-132, 14, -84], target: [-12, 18, 10], hour: 8.4 },
    night: { name: '夜景', pos: [-104, 46, 148], target: [0, 15, 34], hour: 20.4 },
    atrium: { name: '中庭', pos: [30, 30, 108], target: [2, 17, 52], hour: 19.2 }
  };

  function applyPreset(key, instant) {
    const p = PRESETS[key];
    if (!p) return;
    moveCamera(new T.Vector3().fromArray(p.pos), new T.Vector3().fromArray(p.target), instant ? 0 : 1.1);
    // 显式指定 hour 参数时（无头截图/外链），不被预设自带的时刻覆盖
    if (p.hour !== undefined && !params.has('hour')) setHour(p.hour);
    document.querySelectorAll('#presets button').forEach(b => {
      b.classList.toggle('active', b.dataset.key === key);
    });
  }

  function moveCamera(pos, target, dur) {
    if (dur <= 0) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      tween.active = false;
      return;
    }
    tween.active = true; tween.t = 0; tween.dur = dur;
    tween.from = camera.position.clone(); tween.to = pos.clone();
    tween.fromT = controls.target.clone(); tween.toT = target.clone();
  }

  /* ============================== 动画 ============================== */
  let animTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    animTime += dt;

    // 相机补间
    if (tween.active) {
      tween.t += dt / tween.dur;
      const k = Math.min(1, tween.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (k >= 1) tween.active = false;
    }

    // 车流
    if (W.traffic && W.traffic.visible) {
      W.traffic.children.forEach(car => {
        const l = car.userData.lane;
        if (!l) return;
        if (l.axis === 'x') {
          car.position.x += l.speed * dt;
          if (car.position.x > l.max) car.position.x = l.min;
          if (car.position.x < l.min) car.position.x = l.max;
        } else {
          car.position.z += l.speed * dt;
          if (car.position.z > l.max) car.position.z = l.min;
          if (car.position.z < l.min) car.position.z = l.max;
        }
      });
    }

    // 人群漫步
    if (W.crowd && W.crowd.visible) {
      W.crowd.children.forEach(p => {
        const w = p.userData.walk;
        if (!w) return;
        const t = animTime * w.speed + w.phase;
        p.position.x = w.home[0] + Math.cos(t) * w.range;
        p.position.z = w.home[1] + Math.sin(t * 0.8) * w.range * 0.6;
        p.rotation.y = -t + Math.PI / 2;
        p.position.y = 0.06 + Math.abs(Math.sin(animTime * 4 * w.speed + w.phase)) * 0.04;
      });
    }

    updateLED(dt);
    controls.autoRotate = autoRotate;
    controls.update();
    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ============================== 交互 UI ============================== */
  function setupUI() {
    // 预设按钮
    const wrap = document.getElementById('presets');
    Object.keys(PRESETS).forEach(k => {
      const b = document.createElement('button');
      b.textContent = PRESETS[k].name;
      b.dataset.key = k;
      b.onclick = () => applyPreset(k);
      wrap.appendChild(b);
    });
    document.querySelector('#presets button').classList.add('active');

    // 时间滑杆
    const slider = document.getElementById('hour');
    slider.value = String(currentHour);
    slider.oninput = () => setHour(parseFloat(slider.value));

    // 开关
    bindToggle('tg-rotate', v => { autoRotate = v; });
    bindToggle('tg-traffic', v => { if (W.traffic) W.traffic.visible = v; });
    bindToggle('tg-crowd', v => { if (W.crowd) W.crowd.visible = v; });
    bindToggle('tg-shadow', v => {
      renderer.shadowMap.enabled = v;
      scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    });
    bindToggle('tg-sky', v => { if (W.skylineGroup) W.skylineGroup.visible = v; });
    bindToggle('tg-fog', v => { scene.fog.far = v ? 1500 : 6000; });

    // 自动播放时间
    document.getElementById('btn-timelapse').onclick = function () {
      const on = this.classList.toggle('active');
      this.textContent = on ? '⏸ 暂停昼夜' : '▶ 昼夜循环';
      W._timelapse = on;
    };

    // 导出
    document.getElementById('btn-glb').onclick = exportGLB;
    document.getElementById('btn-shot').onclick = screenshot;
  }

  function bindToggle(id, cb) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = () => cb(el.checked);
    cb(el.checked);
  }

  /* ============================== 导出 GLB ============================== */
  function exportGLB() {
    const btn = document.getElementById('btn-glb');
    const old = btn.textContent;
    btn.textContent = '导出中…';
    btn.disabled = true;
    // 导出前临时隐藏夜景发光体，避免重复几何
    const exporter = new T.GLTFExporter();
    const root = new T.Group();
    root.name = 'WandaPlaza';
    // 只导出建筑与场地（不含天空穹顶）
    scene.children.forEach(c => {
      if (c === sky || c.isLight || c.type === 'Object3D' && c === sunTarget) return;
      if (c.name === '天空') return;
      root.add(c.clone(true));
    });
    exporter.parse(root, (result) => {
      const blob = new Blob([result], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wanda-plaza.glb';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      btn.textContent = '✓ 已导出 ' + (blob.size / 1048576).toFixed(1) + 'MB';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = old; }, 3000);
      W._lastGlbSize = blob.size;
    }, (err) => {
      console.error(err);
      btn.textContent = '导出失败';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = old; }, 2500);
    }, { binary: true, onlyVisible: true, truncateDrawRange: false });
  }

  /* ============================== 截图 ============================== */
  function screenshot() {
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wanda-plaza-' + Date.now() + '.png';
    a.click();
  }

  /* ============================== 启动 ============================== */
  function boot() {
    try {
      init();
    } catch (e) {
      console.error(e);
      const el = document.getElementById('loading');
      if (el) el.innerHTML = '<div style="color:#ff8a8a;max-width:600px;text-align:center">初始化失败：' + e.message + '</div>';
      global.__WANDA_ERROR__ = String(e && e.stack || e);
    }
  }

  // 昼夜自动循环
  setInterval(() => {
    if (W._timelapse) setHour(currentHour + 0.12);
  }, 50);

  W.app = {
    get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; },
    setHour, applyPreset, exportGLB, screenshot, PRESETS,
    get leds() { return leds; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
