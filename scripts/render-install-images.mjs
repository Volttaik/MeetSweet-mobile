/**
 * Rasterize the MeetSweet install-guide SVGs into shareable PNGs using the
 * sharp build that ships in the server's pnpm store. Run from the workspace
 * root:
 *
 *   node scripts/render-install-images.mjs
 *
 * Outputs <name>.png (1080px) and <name>@2x.png (2160px) next to each SVG.
 */
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

// Give fontconfig a real font directory (the container has no system fonts),
// otherwise librsvg renders every <text> element empty.
const fontsDir = path.join(__dirname, "fonts");
mkdirSync(fontsDir, { recursive: true });
const fontConf = path.join(fontsDir, "fonts.conf");
writeFileSync(
  fontConf,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>/tmp/fc-cache</cachedir>
  <match target="pattern">
    <test name="family"><string>Arial</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>DejaVu Sans</string></edit>
  </match>
  <match target="pattern">
    <test name="family"><string>Helvetica</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>DejaVu Sans</string></edit>
  </match>
  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
</fontconfig>
`
);
process.env.FONTCONFIG_FILE = fontConf;
process.env.HOME = "/tmp";

// Locate the sharp package inside the server's pnpm store.
const pnpmDir = path.join(
  workspaceRoot,
  ".meetsweet-server/server/node_modules/.pnpm"
);
const sharpEntry = readdirSync(pnpmDir).find((name) =>
  name.startsWith("sharp@")
);
if (!sharpEntry) {
  console.error("sharp not found in server pnpm store");
  process.exit(1);
}
const require = createRequire(path.join(pnpmDir, sharpEntry, "node_modules/"));
const sharp = require("sharp");

const inputDir = path.join(
  workspaceRoot,
  ".meetsweet-server/server/public/install-help"
);
const svgs = readdirSync(inputDir).filter((f) => f.endsWith(".svg"));

for (const file of svgs) {
  const svg = readFileSync(path.join(inputDir, file));
  const base = file.replace(/\.svg$/, "");
  for (const [scale, suffix] of [
    [1, ""],
    [2, "@2x"],
  ]) {
    const png = await sharp(svg).resize(1080 * scale, 1080 * scale).png().toBuffer();
    const out = path.join(inputDir, `${base}${suffix}.png`);
    writeFileSync(out, png);
    console.log(`wrote ${path.relative(workspaceRoot, out)} (${png.length} bytes)`);
  }
}
console.log("done");
