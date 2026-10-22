const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require("/tmp/node_modules/puppeteer");

const DIST = path.resolve(__dirname, "dist");
const SHOTS = path.resolve(__dirname, ".shots");
const PORT = 8123;

const server = http.createServer((req, res) => {
  const p = path.join(DIST, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  fs.readFile(p, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("nf");
    }
    res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html" : "text/plain" });
    res.end(data);
  });
});

const BOT = `
window.__bot = function (seconds, cfg) {
  cfg = cfg || {};
  const g = window.__game;
  const fixed = 1 / 60;
  const steps = Math.round(seconds / fixed);
  const out = { maxEnemies: 0, waves: [], bursts: 0, dashes: 0, stopped: null };
  let lastWave = g.wave;
  g.firing = true;
  for (let i = 0; i < steps; i++) {
    if (g.phase !== 'playing') { out.stopped = g.phase; break; }
    const es = g.enemies.filter((e) => !e.dead);
    out.maxEnemies = Math.max(out.maxEnemies, es.length);
    if (es.length) {
      es.sort((a, b) => a.pos.distanceToSquared(g.pos) - b.pos.distanceToSquared(g.pos));
      let e = es[0];
      if (!cfg.wrong) { const m = es.find((x) => x.channel === g.channel); if (m) e = m; }
      const dx = e.pos.x - g.pos.x, dy = e.pos.y - (g.pos.y + 1.75), dz = e.pos.z - g.pos.z;
      g.yaw = Math.atan2(-dx, -dz);
      g.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if (!cfg.wrong && e.channel !== g.channel) g.setChannel(e.channel);
    } else {
      g.yaw += 0.02;
      g.pitch *= 0.9;
    }
    const ph = Math.floor(g.now * 0.8) % 4;
    g.keys.KeyA = ph === 0; g.keys.KeyD = ph === 1;
    g.keys.KeyW = ph === 2; g.keys.KeyS = ph === 3;
    if (g.saturation >= 1 && cfg.burst !== false) { g.tryBurst(); out.bursts++; }
    if (g.dashCharges > 0 && i % 90 === 0) { g.tryDash(); out.dashes++; }
    if (g.hp < g.maxHp * 0.35 && i % 40 === 0) g.pitch = 0.5;
    g.debugStep(fixed);
    if (g.wave !== lastWave) { out.waves.push(g.wave); lastWave = g.wave; }
  }
  return out;
};
window.__stats = function () {
  const g = window.__game;
  return {
    phase: g.phase, wave: g.wave, enemies: g.enemies.length, queue: g.spawnQueue.length,
    hp: Math.round(g.hp), shield: Math.round(g.shield), score: Math.round(g.score),
    kills: g.kills, shots: g.shots, hits: g.hitsLanded, combo: g.combo, mult: g.multiplier(),
    sat: +g.saturation.toFixed(2), over: +g.overcharge.toFixed(2), ch: g.channel,
    bolts: g.bolts.length, orbs: g.orbs.length, debris: g.debris.length, rings: g.rings.length,
    pickups: g.pickups.length, dash: g.dashCharges, ts: +g.timeScale.toFixed(2),
    pos: [+g.pos.x.toFixed(1), +g.pos.y.toFixed(1), +g.pos.z.toFixed(1)],
    boss: g.boss ? { hp: Math.round(g.boss.hp), max: Math.round(g.boss.maxHp), ch: g.boss.channel } : null,
    elapsed: +g.elapsed.toFixed(1),
    kinds: g.enemies.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {}),
  };
};
`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    headless: "shell",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[PAGEERROR] ${e.message} :: ${(e.stack || "").split("\n")[1]}`));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));
  await page.evaluate(BOT);
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });

  // ---- menu with ambient prisms
  await page.evaluate(() => window.__game.debugStep(9));
  await new Promise((r) => setTimeout(r, 900));
  await shot("01-menu");
  const menuState = await page.evaluate(() => ({
    phase: window.__game.phase,
    ambient: window.__game.enemies.length,
  }));

  // ---- begin
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      x.textContent.includes("ENTER THE ARENA"),
    );
    if (b) b.click();
    return !!b;
  });
  await page.evaluate(() => {
    window.__game.locked = true;
    window.__game.debugStep(2.6);
  });
  await new Promise((r) => setTimeout(r, 800));
  await shot("02-wave1");
  const s1 = await page.evaluate(() => window.__stats());

  // ---- bot plays 45 simulated seconds
  const b1 = await page.evaluate(() => window.__bot(45, {}));
  await new Promise((r) => setTimeout(r, 700));
  await shot("03-combat");
  const s2 = await page.evaluate(() => window.__stats());

  // ---- keep going to reach a boss wave
  const b2 = await page.evaluate(() => window.__bot(70, {}));
  await new Promise((r) => setTimeout(r, 700));
  await shot("04-late");
  const s3 = await page.evaluate(() => window.__stats());

  // ---- force a specter boss
  const bossInfo = await page.evaluate(() => {
    const g = window.__game;
    g.enemies.slice().forEach((e) => g.damageEnemy(e, 1e7, true));
    g.spawnQueue.length = 0;
    g.pendingWave = 5;
    g.intermission = 0.01;
    g.hp = 100;
    g.debugStep(6);
    return window.__stats();
  });
  await new Promise((r) => setTimeout(r, 700));
  await shot("05-boss");
  const b3 = await page.evaluate(() => window.__bot(25, { burst: false }));
  const bossAfter = await page.evaluate(() => window.__stats());
  await new Promise((r) => setTimeout(r, 700));
  await shot("06-boss-fight");

  // ---- dissonance check: fire with the WRONG colour, expect no damage
  const disso = await page.evaluate(() => {
    const g = window.__game;
    g.enemies.slice().forEach((e) => g.damageEnemy(e, 1e7, true));
    g.pendingWave = 3; g.intermission = 0.01; g.spawnQueue.length = 0;
    g.debugStep(4);
    const e = g.enemies[0];
    if (!e) return { ok: false };
    const before = e.hp;
    g.channel = (e.channel + 2) % 4;
    g.refreshEnemyAppearance();
    g.ghostOpacity = e.coreMat.opacity;
    const dx = e.pos.x - g.pos.x, dy = e.pos.y - (g.pos.y + 1.75), dz = e.pos.z - g.pos.z;
    g.yaw = Math.atan2(-dx, -dz);
    g.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.firing = true;
    g.debugStep(2.5);
    const target = g.enemies.find((x) => x === e);
    return {
      ok: true,
      hpBefore: Math.round(before),
      hpAfter: target ? Math.round(target.hp) : -1,
      ghostOpacity: g.ghostOpacity,
      aim: g.aimState,
      shots: g.shots,
    };
  });

  // ---- death + rank screen
  const death = await page.evaluate(() => {
    const g = window.__game;
    g.score = 27400;
    g.invuln = 0; g.shield = 0;
    g.hurt(99999, null);
    g.debugStep(3);
    return window.__stats();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await shot("07-death");

  // ---- pause screen
  const pause = await page.evaluate(() => {
    window.__game.beginRun();
    window.__game.debugStep(4);
    window.__game.setPhase("paused");
    return window.__game.phase;
  });
  await new Promise((r) => setTimeout(r, 900));
  await shot("08-pause");

  // ---- back to menu
  await page.evaluate(() => {
    window.__game.toMenu();
    window.__game.debugStep(8);
  });
  await new Promise((r) => setTimeout(r, 900));
  await shot("09-menu-again");

  const mem = await page.evaluate(() => {
    const g = window.__game;
    const info = g.renderer.info;
    return {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : -1,
      calls: info.render.calls,
      tris: info.render.triangles,
    };
  });

  console.log("MENU:", JSON.stringify(menuState));
  console.log("CLICKED:", clicked);
  console.log("S1 :", JSON.stringify(s1));
  console.log("BOT1:", JSON.stringify(b1));
  console.log("S2 :", JSON.stringify(s2));
  console.log("BOT2:", JSON.stringify(b2));
  console.log("S3 :", JSON.stringify(s3));
  console.log("BOSS:", JSON.stringify(bossInfo));
  console.log("BOT3:", JSON.stringify(b3));
  console.log("BOSS_AFTER:", JSON.stringify(bossAfter));
  console.log("DISSONANCE:", JSON.stringify(disso));
  console.log("DEATH:", JSON.stringify(death));
  console.log("PAUSE:", pause);
  console.log("GPU_MEM:", JSON.stringify(mem));
  console.log("---- LOGS (" + logs.length + ") ----");
  console.log(logs.slice(0, 50).join("\n"));

  await browser.close();
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});
