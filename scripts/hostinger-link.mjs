// Run on the server instead of `next build` (the app is prebuilt). Recreates
// the external package links recorded by scripts/hostinger-prepare.mjs and
// points required-server-files at this server's app directory.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const links = JSON.parse(
  fs.readFileSync(path.join(root, ".next", "external-links.json"), "utf8")
);
for (const { link, pkg } of links) {
  const linkPath = path.join(root, link);
  const target = path.join(root, "node_modules", pkg);
  if (!fs.existsSync(target)) throw new Error(`Missing package ${pkg}; was npm install run?`);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.rmSync(linkPath, { recursive: true, force: true });
  // Windows (local testing) needs a junction, which takes an absolute target.
  if (process.platform === "win32") fs.symlinkSync(target, linkPath, "junction");
  else fs.symlinkSync(path.relative(path.dirname(linkPath), target), linkPath, "dir");
}
const escaped = JSON.stringify(root).slice(1, -1);
for (const f of ["required-server-files.json", "required-server-files.js"]) {
  const p = path.join(root, ".next", f);
  if (fs.existsSync(p))
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").split("__APP_DIR__").join(escaped));
}
console.log(`Linked ${links.length} external packages; app dir ${root}`);
