import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "./args.js";
import {
  defaultPath,
  inferNpmName,
  renderIndexTsx,
  renderPackageJson,
} from "./scaffold.js";

const args = parseArgs(process.argv.slice(2));
const rl = createInterface({ input, output });

async function ask(prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

async function main(): Promise<void> {
  console.log("\nSilo Extension Scaffold\n");

  const id = args.id ?? (await ask("Extension id (e.g. dave.clock): "));
  const name = args.name ?? ((await ask(`Display name [${id}]: `)) || id);
  const description = args.description ?? (await ask("Short description: "));
  const publisher =
    args.publisher ?? (await ask("Publisher (your name or handle): "));
  const suggested = defaultPath(id);
  const path =
    args.path ??
    ((await ask(`Output directory [${suggested}]: `)) || suggested);

  rl.close();

  const scaffoldInput = { id, name, description, publisher };

  await mkdir(join(path, "src"), { recursive: true });
  await mkdir(join(path, "dist"), { recursive: true });
  await writeFile(
    join(path, "src", "index.tsx"),
    renderIndexTsx(scaffoldInput),
  );
  await writeFile(join(path, "package.json"), renderPackageJson(scaffoldInput));

  const npmName = inferNpmName(id);
  console.log(`\nScaffolded ${npmName} → ${path}`);
  console.log("  src/index.tsx   — extension source (edit this)");
  console.log("  package.json    — extension manifest");
  console.log(`\nTo compile:`);
  console.log(`  cd ${path} && npm run build`);
  console.log(`\nTo watch for changes:`);
  console.log(`  cd ${path} && npm run dev`);
  console.log(`\nTo install:`);
  console.log(`  silo install ${path}`);
  console.log(`\nTo pack for sharing (builds + produces a .tgz):`);
  console.log(`  cd ${path} && npm run pack`);
  console.log(`\nTo uninstall:`);
  console.log(`  silo uninstall ${id}`);
}

main().catch((err: unknown) => {
  rl.close();
  console.error((err as Error).message ?? err);
  process.exit(1);
});
