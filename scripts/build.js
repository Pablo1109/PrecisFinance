const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.resolve(root, "public");
const entries = ["index.html", "manifest.webmanifest", "sw.js", "assets", "src"];
const publicEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
};

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

fs.writeFileSync(
  path.join(outDir, "src", "env.js"),
  `window.PRECIS_ENV = ${JSON.stringify(publicEnv, null, 2)};\n`,
  "utf8"
);

console.log(`Static site exported to ${path.relative(root, outDir)}`);
