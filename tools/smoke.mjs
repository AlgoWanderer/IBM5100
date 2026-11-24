// Headless smoke test against the dev server (npm run dev must be running).
// Opens the page in your installed Chrome, powers on, optionally interacts,
// prints console errors, and saves a screenshot.
//
//   CHROME=<path to chrome.exe> npm run smoke
//
// Optional env:  TYPE="text"        type a line + Enter
//                WHEEL="x,y,dy,n"   n wheel events at (x,y)
//                HOLD="KeyF,KeyJ"   hold keys down for the screenshot
//                TYPE_WAIT=ms      wait after typing (default 1500)
//                POWEROFF=ms        press POWER OFF, screenshot after ms
//                Q="?nofx"  SIZE="800x550"  WAIT=ms  OUT=file.png
import puppeteer from "puppeteer-core";

const env = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: env.CHROME,
  headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: env.SIZE ? { width: +env.SIZE.split("x")[0], height: +env.SIZE.split("x")[1] } : { width: 1400, height: 950 },
});
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[console.${m.type()}]`, m.text().slice(0, 400));
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:" + (env.PORT || 5173) + "/" + (env.Q || ""), { waitUntil: "networkidle0" });
await page.click(".power-prompt");
await sleep(Number(env.WAIT || 9000));

if (env.WHEEL) {
  const [x, y, dy, n] = env.WHEEL.split(",").map(Number);
  // dispatched directly: real wheel input stalls under software rendering
  await page.evaluate((x, y, dy, n) => {
    const c = document.querySelector("canvas");
    for (let i = 0; i < n; i++) c.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY: dy, bubbles: true, cancelable: true }));
  }, x, y, dy, n);
  await sleep(3000);
}
if (env.TYPE) {
  await page.keyboard.type(env.TYPE, { delay: Number(env.TYPE_DELAY || 60) });
  await page.keyboard.press("Enter");
  await sleep(Number(env.TYPE_WAIT || 1500));
}
if (env.HOLD) {
  for (const k of env.HOLD.split(",")) await page.keyboard.down(k);
  await sleep(400);
}
if (env.POWEROFF) {
  await page.evaluate(() => [...document.querySelectorAll(".hud-btn")].find((b) => b.textContent.includes("POWER"))?.click());
  await sleep(Number(env.POWEROFF));
}

await page.screenshot({ path: env.OUT || "tools/.tmp/shot.png" });
console.log("canvas:", await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? `${c.width}x${c.height}` : "none";
}));
await browser.close();
