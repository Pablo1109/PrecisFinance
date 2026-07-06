const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.resolve(root, "public");
const entries = ["index.html", "manifest.webmanifest", "sw.js", "assets", "src"];

if (!outDir.startsWith(root + path.sep)) {
  throw new Error(`Unsafe output directory: ${outDir}`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const source = path.resolve(root, entry);
  const destination = path.resolve(outDir, entry);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing build input: ${entry}`);
  }

  fs.cpSync(source, destination, { recursive: true });
}

console.log(`Static site exported to ${path.relative(root, outDir)}`);
