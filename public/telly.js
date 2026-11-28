/* Badly Described: the telly's hosts, Vector Vince (Next Level) and Chet Monotone (Music News), drawn as flat-shaded
   blocks like mid-80s computer graphics on a synthwave set. Shared by the daily page (index.html) and Tour mode
   (tour.html). The Dial-O-Matic 85 cabinet they appear on is telly.css. */
const TELLY = (() => {
const HOSTS = {vince: {name: 'VECTOR VINCE', role: 'NEXT LEVEL'}, chet: {name: 'CHET MONOTONE', role: 'MUSIC NEWS'}};
const PAL = {
  next:{sky1:'#24063f',sky2:'#ff3fa4',floor:'#0d0020',grid:'#3ff0ff',sun1:'#ffe14d',sun2:'#ff3fa4',a:'#ffe14d',b:'#3ff0ff'},
  news:{sky1:'#00122b',sky2:'#1f5bff',floor:'#00081a',grid:'#8fd3ff',sun1:'#ffffff',sun2:'#1f5bff',a:'#ff3b3b',b:'#8fd3ff'},
  radio:{sky1:'#03200f',sky2:'#19b866',floor:'#011208',grid:'#b6ffcf',sun1:'#eaffb0',sun2:'#19b866',a:'#eaffb0',b:'#b6ffcf'},
  countdown:{sky1:'#14002b',sky2:'#00d8a0',floor:'#07001a',grid:'#ff3fa4',sun1:'#ffe14d',sun2:'#00d8a0',a:'#ff3fa4',b:'#ffe14d'},
  gold:{sky1:'#0b0b0b',sky2:'#a77b06',floor:'#050505',grid:'#ffd700',sun1:'#fff6c4',sun2:'#a77b06',a:'#ffd700',b:'#fff6c4'},
  split:{sky1:'#0a0a0a',sky2:'#5a1020',floor:'#050002',grid:'#ff5c8a',sun1:'#ff9aa8',sun2:'#5a1020',a:'#ff5c8a',b:'#ff9aa8'},
};
const FACES = [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[4,5,1,0],[3,2,6,7]], NORMALS = [[0,0,-1],[0,0,1],[-1,0,0],[1,0,0],[0,-1,0],[0,1,0]];
const LIGHT = (() => { const v = [-.45, -.65, -.62], m = Math.hypot(...v); return v.map(x => x / m); })();
function rot([x, y, z], yaw, pitch){ const cy = Math.cos(yaw), sy = Math.sin(yaw); [x, z] = [x * cy + z * sy, -x * sy + z * cy]; const cp = Math.cos(pitch), sp = Math.sin(pitch); [y, z] = [y * cp - z * sp, y * sp + z * cp]; return [x, y, z]; }
function shade(hex, k){ const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; }
function vince(open){ const s1 = '#f4c7a4', s2 = '#e9b892'; return [
  {c:[0,-18,0], s:[50,58,46], col:s1}, {c:[0,36,-2], s:[46,20,40], tb:.78, col:s2}, {c:[0,-80,4], s:[54,16,50], col:'#ffe14d'}, {c:[0,-92,-36], s:[42,16,18], tt:1.1, col:'#ffd21f'},
  {c:[0,-22,-48], s:[50,9,4], col:'#0c0c14', glint:true}, {c:[0,2,-50], s:[7,12,7], col:s2}, {c:[0,34,-44], s:[17,2 + open * 8,3], col:'#3b0c1e'},
  {c:[-53,-12,2], s:[5,13,9], col:s2}, {c:[53,-12,2], s:[5,13,9], col:s2}, {c:[0,72,6], s:[20,18,18], col:s2, body:true}, {c:[0,94,-10], s:[34,8,22], col:'#ffffff', body:true},
  {c:[0,132,8], s:[112,34,48], tt:.66, col:'#2b3bff', body:true}, {c:[0,118,-40], s:[7,24,3], col:'#ff3fa4', body:true}]; }
function chet(open){ const s1 = '#d99f78', s2 = '#c98d66'; return [
  {c:[0,-16,0], s:[48,56,44], col:s1}, {c:[0,36,-2], s:[44,20,40], tb:.82, col:s2}, {c:[0,-78,2], s:[50,12,46], col:'#7a7470'},
  {c:[-22,-20,-47], s:[17,10,3], col:'#3a2a12', glint:true}, {c:[22,-20,-47], s:[17,10,3], col:'#3a2a12', glint:true}, {c:[0,-26,-48], s:[6,2,2], col:'#c9a24a'},
  {c:[0,4,-48], s:[7,13,7], col:s2}, {c:[0,36,-43], s:[15,2 + open * 4,3], col:'#4a1a16'}, {c:[-51,-10,2], s:[5,13,9], col:s2}, {c:[51,-10,2], s:[5,13,9], col:s2},
  {c:[0,72,6], s:[20,18,18], col:s2, body:true}, {c:[0,96,-12], s:[26,12,20], col:'#9aa3ad', body:true}, {c:[0,132,8], s:[114,34,48], tt:.66, col:'#26232b', body:true},
  {c:[66,104,-52], s:[6,24,6], col:'#9a9a9a', body:true}, {c:[66,72,-52], s:[11,11,11], col:'#1b1b1b', body:true}, {c:[66,92,-52], s:[15,9,15], col:'#e0115f', body:true}]; }
function drawModel(ctx, parts, pose, ox, oy, scale){
  const F = 700 * scale, D = 700, polys = [];
  for (const b of parts) {
    const [cx, cy, cz] = b.c, [hx, hy, hz] = b.s, tt = b.tt || 1, tb = b.tb || 1, P = (sx, sy, sz) => [cx + sx * hx * (sy < 0 ? tt : tb), cy + sy * hy, cz + sz * hz];
    const v = [P(-1,-1,-1), P(1,-1,-1), P(1,1,-1), P(-1,1,-1), P(-1,-1,1), P(1,-1,1), P(1,1,1), P(-1,1,1)];
    const yaw = b.body ? pose.yaw * .25 : pose.yaw, pitch = b.body ? 0 : pose.pitch, rv = v.map(p => rot(p, yaw, pitch));
    FACES.forEach((ix, fi) => {
      const pts = ix.map(i => rv[i]), scr = pts.map(([x, y, z]) => [ox + x * F / (z + D), oy + y * F / (z + D)]);
      let area = 0; for (let i = 0; i < 4; i++) { const p = scr[i], q = scr[(i + 1) % 4]; area += p[0] * q[1] - q[0] * p[1]; }
      if (area <= 0) return;
      const n = rot(NORMALS[fi], yaw, pitch), lit = .42 + .78 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      polys.push({scr, z: pts.reduce((s, p) => s + p[2], 0) / 4, fill: shade(b.col, lit), glint: b.glint && fi === 0});
    });
  }
  polys.sort((a, b) => b.z - a.z);
  const path = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }, lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  for (const p of polys) { path(p.scr); ctx.fillStyle = p.fill; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
    if (p.glint) { const [a, b, c, d] = p.scr; path([lerp(a, b, .14), lerp(a, b, .26), lerp(d, c, .18), lerp(d, c, .06)]); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); } }
}
function wireCube(ctx, x, y, s, a, col){ const P = []; for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) { const p = rot([i * s, j * s, k * s], a, a * .7); P.push([x + p[0], y + p[1]]); }
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); for (const [m, n] of [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]]) { ctx.moveTo(...P[m]); ctx.lineTo(...P[n]); } ctx.stroke(); }
function backdrop(ctx, W, H, P, t){
  const hz = H * .62, g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.sky1); g.addColorStop(.62, P.sky2); g.addColorStop(.62, P.floor); g.addColorStop(1, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = H * .26, sy = hz - H * .05; ctx.save(); ctx.beginPath(); ctx.arc(W / 2, sy, r, Math.PI, 0); ctx.closePath(); ctx.clip();
  const sg = ctx.createLinearGradient(0, sy - r, 0, sy); sg.addColorStop(0, P.sun1); sg.addColorStop(1, P.sun2); ctx.fillStyle = sg; ctx.fillRect(W / 2 - r, sy - r, r * 2, r);
  ctx.fillStyle = P.sky2; for (let i = 0; i < 6; i++) ctx.fillRect(W / 2 - r, sy - i * r / 8 - ((t / 60) % (r / 8)), r * 2, 1.5 + i * .8); ctx.restore();
  ctx.strokeStyle = P.grid; ctx.lineWidth = 1.5; ctx.globalAlpha = .85;
  for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 8, hz); ctx.lineTo(W / 2 + i * W / 6, H); ctx.stroke(); }
  const off = (t / 650) % 1; for (let i = 0; i < 14; i++) { const z = (i + off) / 14, y = hz + (H - hz) * z * z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.globalAlpha = 1; wireCube(ctx, W * .15, H * .26, H * .095, t / 900, P.a); wireCube(ctx, W * .85, H * .3, H * .07, -t / 700, P.b);
}

// run(canvas, {host, pal, reduce}): draws a host on the canvas every frame until scene.stop(). Change the returned
// scene's talk (mouth moving), glitch (frames of tape tearing) and snap (a head jerk) while it runs.
function run(canvas, {host = 'vince', pal = 'next', reduce = false} = {}){
  const ctx = canvas.getContext('2d'), s = {host, pal, talk: 0, glitch: 0, snap: 0, t0: performance.now(), raf: 0, live: true};
  const frame = () => {
    if (!s.live) return;
    const t = performance.now() - s.t0, W = canvas.width, H = canvas.height, isV = s.host === 'vince';
    backdrop(ctx, W, H, PAL[s.pal] || PAL.next, t);
    const open = s.talk ? .25 + .75 * Math.abs(Math.sin(t / 55 + Math.sin(t / 130))) : .08;
    const pose = isV ? {yaw: Math.sin(t / 700) * .35 + s.snap, pitch: Math.sin(t / 430) * .06} : {yaw: Math.sin(t / 1600) * .12 - .1, pitch: Math.sin(t / 2100) * .03};
    drawModel(ctx, isV ? vince(open) : chet(open * .6), pose, W / 2, H * .44, .9);
    if (s.glitch > 0 && !reduce) { for (let i = 0; i < 4; i++) { const y = Math.random() * H | 0, h = 4 + Math.random() * 16 | 0, dx = (Math.random() * 40 - 20) | 0; ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h); } s.glitch--; }
    s.raf = requestAnimationFrame(frame);
  };
  s.stop = () => { s.live = false; cancelAnimationFrame(s.raf); };
  frame();
  return s;
}
return {HOSTS, PAL, run};
})();
