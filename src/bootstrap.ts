import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { configureCursorSdk } from "@cursor/sdk";

let initialized = false;

function resolveBundledRipgrep(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("@cursor/sdk-linux-x64/package.json");
    return join(dirname(pkgJson), "bin", "rg");
  } catch {
    return undefined;
  }
}

export function ensureCursorSdkBootstrapped(): void {
  if (initialized) return;
  initialized = true;

  configureCursorSdk({
    local: { useHttp1ForAgent: true },
  });

  const rg = resolveBundledRipgrep();
  if (rg) {
    const rgDir = dirname(rg);
    if (!process.env.PATH?.split(":").includes(rgDir)) {
      process.env.PATH = `${rgDir}:${process.env.PATH ?? ""}`;
    }
    if (!process.env.RIPGREP_PATH?.trim()) {
      process.env.RIPGREP_PATH = rg;
    }
  }
}
