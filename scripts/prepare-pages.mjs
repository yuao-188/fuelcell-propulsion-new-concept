import { copyFile, cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await mkdir(path.join(root, "assets"), { recursive: true });
await cp(path.join(root, "dist", "assets"), path.join(root, "assets"), { recursive: true, force: true });
await copyFile(path.join(root, "dist", "index.source.html"), path.join(root, "index.html"));
console.log("GitHub Pages root updated from dist/index.source.html");
