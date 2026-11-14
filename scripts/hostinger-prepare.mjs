// Run on the build machine AFTER `next build`. Makes the prebuilt .next folder
// portable: Turbopack links some external packages (pg, @prisma/client) from
// .next/node_modules to the build machine's node_modules with absolute paths.
// Record them as relative links, drop the absolute ones, and blank the build
// machine's path in required-server-files. scripts/hostinger-link.mjs restores
// both on the server.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const nm = path.join(root, ".next", "node_modules");
const links = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const target = fs.realpathSync(p);
      const pkg = path.relative(path.join(root, "node_modules"), target);
      if (pkg.startsWith("..")) throw new Error(`Unexpected link target ${target}`);
      links.push({ link: path.relative(root, p).split(path.sep).join("/"), pkg: pkg.split(path.sep).join("/") });
      fs.rmSync(p, { recursive: true, force: true });
    } else if (e.isDirectory()) walk(p);
  }
}
walk(nm);
fs.writeFileSync(path.join(root, ".next", "external-links.json"), JSON.stringify(links, null, 2));

for (const f of ["required-server-files.json", "required-server-files.js"]) {
  const p = path.join(root, ".next", f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, "utf8");
  const escaped = JSON.stringify(root).slice(1, -1);
  fs.writeFileSync(p, text.split(escaped).join("__APP_DIR__"));
}
console.log(`Recorded ${links.length} external links:`, links);
