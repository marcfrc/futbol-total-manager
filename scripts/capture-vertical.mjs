/** Captura vertical/horizontal del partido para revisión visual. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const file = resolve(DIST, "." + raw);
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader"],
});

async function shots(name, viewport, touch) {
  const page = await browser.newPage({ viewport, hasTouch: touch });
  page.on("pageerror", (e) => console.error("PAGEERROR:", e));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__FTM_DEBUG__, null, { timeout: 8000 });
  await page.evaluate(() => window.__FTM_DEBUG__.quickMatch());
  await page.waitForFunction(() => window.__FTM_MATCH_DEBUG__?.phase?.() === "play", null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/g-${name}-play.png` });
  // gol forzado: celebración + público saltando
  await page.evaluate(() => window.__FTM_MATCH_DEBUG__.forceGoal());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `/tmp/g-${name}-goal.png` });
  // disparo con estela: pase largo en campo propio
  await page.waitForTimeout(2600);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(1500);
  await page.keyboard.down("KeyK");
  await page.waitForTimeout(650);
  await page.keyboard.up("KeyK");
  await page.waitForTimeout(280);
  await page.screenshot({ path: `/tmp/g-${name}-shot.png` });
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await page.close();
}

await shots("vert", { width: 390, height: 844 }, true);
await shots("horz", { width: 1280, height: 720 }, false);
await browser.close();
server.close();
console.log("SHOTS OK");
