import esbuild from "esbuild";

async function run() {
  try {
    await esbuild.build({
      entryPoints: ["src/index.ts"],
      outfile: "dist/index.js",
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      banner: {
        js: `import { createRequire as __createRequire } from "node:module";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { dirname as __dirnameFunction } from "node:path";
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFunction(__filename);
`,
      },
    });
    console.log("Backend bundled successfully into dist/index.js!");
  } catch (err) {
    console.error("Bundle failed:", err);
    process.exit(1);
  }
}

run();
