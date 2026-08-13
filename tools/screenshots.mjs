// Скриншоты страницы для README. Одноразовый инструмент: сайт остаётся без зависимостей,
// playwright берётся глобально (npm i -g playwright && npx playwright install chromium).
//
//   node tools/screenshots.mjs        # → docs/screenshots/*.png
import { chromium } from "playwright";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs/screenshots");
const URL = "file://" + path.join(ROOT, "index.html");

const shots = [
  { name: "01-hero-dark", theme: "dark", w: 1600, h: 1000 },
  { name: "02-projects", theme: "dark", w: 1600, h: 1000, section: "#projects" },
  { name: "03-experience", theme: "dark", w: 1600, h: 1000, section: "#experience" },
  { name: "04-hero-light", theme: "light", w: 1600, h: 1000 },
  { name: "05-mobile", theme: "dark", w: 390, h: 844 },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate((t) => localStorage.setItem("theme", t), s.theme);
  await page.reload({ waitUntil: "networkidle" });
  // Печатающая строка и появление секций при скролле — даём им доиграть.
  await page.waitForTimeout(1400);
  if (s.section) {
    await page.locator(s.section).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
  console.log("✓", s.name);
  await ctx.close();
}
await browser.close();
