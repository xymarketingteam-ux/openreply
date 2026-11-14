// Run on the build machine AFTER `next build` (output: "standalone").
// Hostinger's shared hosting cannot finish `next build` inside its 16-minute
// build limit, so the app is compiled elsewhere and committed. This makes the
// standalone server portable to the Linux server:
//  - records which packages the standalone server needs, then deletes the
//    build machine's copies (they include OS-specific binaries such as
//    @img/sharp-win32-x64); scripts/hostinger-link.mjs copies the server's own;
//  - records Turbopack's links in .next/node_modules (absolute paths to this
//    machine) and removes them;
//  - replaces this machine's directory in server.js with __dirname.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sa = path.join(root, ".next", "standalone");
const rootNm = path.join(root, "node_modules");
if (!fs.existsSync(path.join(sa, "server.js")))
  throw new Error("No .next/standalone/server.js: build with output 'standalone' first");

const links = [];
function collectLinks(dir, base) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const pkg = path.relative(rootNm, fs.realpathSync(p)).split(path.sep).join("/");
      if (pkg.startsWith("..")) throw new Error(`Unexpected link target for ${p}`);
      if (base) links.push({ link: path.relative(base, p).split(path.sep).join("/"), pkg });
      fs.rmSync(p, { recursive: true, force: true });
    } else if (e.isDirectory()) collectLinks(p, base);
  }
}
collectLinks(path.join(sa, ".next", "node_modules"), sa);
collectLinks(path.join(root, ".next", "node_modules"), null);

const saNm = path.join(sa, "node_modules");
const packages = [];
if (fs.existsSync(saNm)) {
  for (const name of fs.readdirSync(saNm)) {
    if (name.startsWith("@"))
      for (const sub of fs.readdirSync(path.join(saNm, name))) packages.push(`${name}/${sub}`);
    else packages.push(name);
  }
  fs.rmSync(saNm, { recursive: true, force: true });
}
// next build copies .env* into the standalone folder. Never commit secrets:
// on Hostinger they come from the panel's environment variables.
for (const f of fs.readdirSync(sa))
  if (f.startsWith(".env")) fs.rmSync(path.join(sa, f), { force: true });
// Copied on the server by hostinger-link.mjs; don't commit duplicates.
fs.rmSync(path.join(sa, ".next", "static"), { recursive: true, force: true });
fs.rmSync(path.join(sa, "public"), { recursive: true, force: true });

const quoted = JSON.stringify(root); // "E:\...\openreply" exactly as in server.js
const serverJs = path.join(sa, "server.js");
fs.writeFileSync(serverJs, fs.readFileSync(serverJs, "utf8").split(quoted).join("__dirname"));
for (const f of [path.join(sa, ".next", "required-server-files.json"), path.join(root, ".next", "required-server-files.json"), path.join(root, ".next", "required-server-files.js")]) {
  if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, "utf8").split(quoted).join('"."'));
}

fs.writeFileSync(path.join(root, ".next", "hostinger-manifest.json"), JSON.stringify({ links, packages }, null, 2));
console.log(`Recorded ${links.length} links and ${packages.length} packages`);
