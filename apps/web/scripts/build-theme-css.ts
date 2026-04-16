import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { getTailwindThemeCss, getThemeCssVariables } from "../styles/theme.ts";

async function main() {
  const outputPath = resolve(process.cwd(), "styles/theme-vars.css");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    [
      "/* This file is generated from styles/theme.ts. Do not edit directly. */",
      getThemeCssVariables(),
      getTailwindThemeCss()
    ].join("\n\n"),
    "utf8"
  );
}

main().catch((error) => {
  console.error("Failed to build theme CSS", error);
  process.exit(1);
});
