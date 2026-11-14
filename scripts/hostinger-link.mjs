// Hostinger build step (replaces `next build`, the app is prebuilt): fills
// .next/standalone with this server's own installed packages, recreates
// Turbopack's external package links and adds the static files. See
// scripts/hostinger-prepare.mjs.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sa = path.join(root, ".next", "standalone");
const rootNm = path.join(root, "node_modules");
const saNm = path.join(sa, "node_modules");
const { links, packages } = JSON.parse(
  fs.readFileSync(path.join(root, ".next", "hostinger-manifest.json"), "utf8")
);

let copied = 0;
for (const pkg of packages) {
  const from = path.join(rootNm, pkg);
  // OS-specific optional packages (e.g. @img/sharp-win32-x64) don't exist here;
  // the @img scope is copied whole below so this platform's binaries come along.
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(saNm, pkg), { recursive: true, dereference: true });
  copied++;
}
if (fs.existsSync(path.join(rootNm, "@img")))
  fs.cpSync(path.join(rootNm, "@img"), path.join(saNm, "@img"), { recursive: true, dereference: true });

for (const { link, pkg } of links) {
  const linkPath = path.join(sa, link);
  const target = path.join(saNm, pkg);
  if (!fs.existsSync(target)) throw new Error(`Missing ${pkg} in standalone node_modules`);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.rmSync(linkPath, { recursive: true, force: true });
  // Windows (local testing) needs a junction, which takes an absolute target.
  if (process.platform === "win32") fs.symlinkSync(target, linkPath, "junction");
  else fs.symlinkSync(path.relative(path.dirname(linkPath), target), linkPath, "dir");
}

fs.cpSync(path.join(root, ".next", "static"), path.join(sa, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public")))
  fs.cpSync(path.join(root, "public"), path.join(sa, "public"), { recursive: true });

console.log(`Standalone ready: ${copied}/${packages.length} packages copied, ${links.length} links`);
