
/* 零依赖 3D 引擎：体素化布尔运算 + Canvas 2D 软件渲染
   为什么体素：布尔运算（切去/叠加）是"按三视图还原立体"的核心操作，
   而 CSG 库要么依赖 CDN（离线不可用），要么带来一堆依赖。
   体素法用 point-in-solid 判断 + 暴露面提取，20 行核心逻辑就能得到正确的布尔结果。 */
function initViewer(spec, canvas) {
  const CELL = spec.cell || 2.5;
  const ctx = canvas.getContext('2d');
  const bounds = spec.bounds;
  const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;

  /* ---------- 体素化 ---------- */
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
  const idx = (i, j, k) => (i * ny + j) * nz + k;
  const grid = new Uint8Array(nx * ny * nz);

  const inside = (s, px, py, pz) => {
    if (s.shape === 'box') {
      const [cx, cy, cz] = s.pos, [sx, sy, sz] = s.size;
      return Math.abs(px - cx) <= sx / 2 && Math.abs(py - cy) <= sy / 2 && Math.abs(pz - cz) <= sz / 2;
    }
    if (s.shape === 'cylinder') {
      const [cx, cy, cz] = s.pos;             // pos.y 是圆柱中心高度
      const dy = py - cy;
      if (Math.abs(dy) > s.h / 2) return false;
      const r = Math.hypot(px - cx, pz - cz);
      return r <= s.r;
    }
    return false;
  };

  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const px = x0 + (i + 0.5) * CELL, py = y0 + (j + 0.5) * CELL, pz = z0 + (k + 0.5) * CELL;
    let v = 0;
    for (const s of spec.solids) {
      const hit = inside(s, px, py, pz);
      if (s.op === 'base' && hit) v = 1;
      else if (s.op === 'add' && hit) v = 1;
      else if (s.op === 'sub' && hit) v = 0;
    }
    grid[idx(i, j, k)] = v;
  }

  /* ---------- 提取暴露面 ---------- */
  const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) ? 0 : grid[idx(i, j, k)];
  const faces = [];
  const pushQuad = (p, n) => faces.push({ p, n });
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    if (!grid[idx(i, j, k)]) continue;
    const X = x0 + i * CELL, Y = y0 + j * CELL, Z = z0 + k * CELL, e = CELL;
    if (!at(i + 1, j, k)) pushQuad([[X + e, Y, Z], [X + e, Y, Z + e], [X + e, Y + e, Z + e], [X + e, Y + e, Z]], [1, 0, 0]);
    if (!at(i - 1, j, k)) pushQuad([[X, Y, Z], [X, Y + e, Z], [X, Y + e, Z + e], [X, Y, Z + e]], [-1, 0, 0]);
    if (!at(i, j + 1, k)) pushQuad([[X, Y + e, Z], [X, Y + e, Z + e], [X + e, Y + e, Z + e], [X + e, Y + e, Z]], [0, 1, 0]);
    if (!at(i, j - 1, k)) pushQuad([[X, Y, Z], [X + e, Y, Z], [X + e, Y, Z + e], [X, Y, Z + e]], [0, -1, 0]);
    if (!at(i, j, k + 1)) pushQuad([[X, Y, Z + e], [X + e, Y, Z + e], [X + e, Y + e, Z + e], [X, Y + e, Z + e]], [0, 0, 1]);
    if (!at(i, j, k - 1)) pushQuad([[X, Y, Z], [X, Y + e, Z], [X + e, Y + e, Z], [X + e, Y, Z]], [0, 0, -1]);
  }

  /* ---------- 相机 ---------- */
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, czm = (z0 + z1) / 2;
  const radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
  let yaw = -0.62, pitch = 0.42, dist = radius * 3.2, auto = true, wire = false;
  let W = 0, H = 0, focal = 800;

  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = r.width; H = r.height;
    focal = Math.min(W, H) * 1.15;
  };

  const rot = (x, y, z) => {
    const p = x - cxm, q = y - cym, r = z - czm;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let X = p * cy - r * sy, Z = p * sy + r * cy, Y = q;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const Y2 = Y * cp - Z * sp, Z2 = Y * sp + Z * cp;
    return [X, Y2, Z2];
  };
  const project = (x, y, z) => {
    const [X, Y, Z] = rot(x, y, z);
    const d = Z + dist;
    const f = focal / Math.max(d, 1);
    return [W / 2 + X * f, H / 2 - Y * f, d];
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    // 地面网格
    ctx.strokeStyle = 'rgba(60,150,200,0.10)'; ctx.lineWidth = 1;
    const gy = y0, step = Math.max(x1 - x0, z1 - z0) / 6;
    for (let i = -2; i <= 2; i++) {
      const a = project(cxm + i * step, gy, czm - 2 * step), b = project(cxm + i * step, gy, czm + 2 * step);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const c = project(cxm - 2 * step, gy, czm + i * step), d = project(cxm + 2 * step, gy, czm + i * step);
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    }
    // 面排序（画家算法）
    const list = faces.map(f => {
      const pts = f.p.map(p => project(p[0], p[1], p[2]));
      const depth = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
      const [nx0, ny0, nz0] = rot(f.n[0] + cxm, f.n[1] + cym, f.n[2] + czm);
      const nrm = [nx0, ny0, nz0];
      return { pts, depth, nrm };
    }).filter(f => f.nrm[2] < -0.001);   // 只保留朝向相机（-Z）的面
    list.sort((a, b) => b.depth - a.depth);

    const light = [0.42, 0.66, 0.62];
    for (const f of list) {
      const d = Math.abs(f.nrm[0] * light[0] + f.nrm[1] * light[1] + f.nrm[2] * light[2]);
      const lum = 0.18 + 0.82 * Math.pow(d, 0.7);
      const R = Math.round(4 + 120 * lum), G = Math.round(58 + 150 * lum), B = Math.round(96 + 120 * lum);
      ctx.beginPath();
      ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
      ctx.closePath();
      if (wire) { ctx.strokeStyle = 'rgba(80,225,255,0.85)'; ctx.lineWidth = 1; ctx.stroke(); }
      else {
        const col = 'rgb(' + R + ',' + G + ',' + B + ')';
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = col;   // 同色描边，消除体素拼缝，不做马赛克
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    if (auto) { yaw += 0.005; requestAnimationFrame(draw); }
  };

  /* ---------- 交互 ---------- */
  let drag = false, lx = 0, ly = 0;
  canvas.addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; auto = false; });
  window.addEventListener('mouseup', () => drag = false);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    yaw += (e.clientX - lx) * 0.008;
    pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - ly) * 0.008));
    lx = e.clientX; ly = e.clientY; draw();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); dist *= (1 + Math.sign(e.deltaY) * 0.08); draw(); }, { passive: false });
  window.addEventListener('resize', () => { resize(); draw(); });

  const api = {
    setView(n) {
      auto = false;
      if (n === 'front') { yaw = 0; pitch = 0; }
      if (n === 'top') { yaw = 0; pitch = -Math.PI / 2 + 0.001; }
      if (n === 'left') { yaw = -Math.PI / 2; pitch = 0; }
      if (n === 'iso') { yaw = -0.62; pitch = 0.42; }
      draw();
    },
    toggleAuto() { auto = !auto; if (auto) draw(); },
    toggleWire() { wire = !wire; draw(); },
    reset() { yaw = -0.62; pitch = 0.42; dist = radius * 3.2; auto = true; draw(); },
  };
  resize(); draw();
  return api;
}
