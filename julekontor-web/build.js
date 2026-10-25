// Builds public/index.html from src/page.html by adding the document skeleton.
// src/page.html is kept without <html>/<head>/<body> so it can also be published as a Claude artifact preview.
import { readFileSync, writeFileSync } from "node:fs";

const page = readFileSync(new URL("./src/page.html", import.meta.url), "utf8");
const splitAt = page.indexOf("</style>") + "</style>".length;
const head = page.slice(0, splitAt);
const body = page.slice(splitAt);

const html = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%239e1f22'/%3E%3Ctext x='32' y='44' text-anchor='middle' font-family='Georgia,serif' font-style='italic' font-weight='700' font-size='34' fill='%23f2d48a'%3EJ%3C/text%3E%3C/svg%3E">
${head}
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync(new URL("./public/index.html", import.meta.url), html);
console.log("public/index.html geschrieben");
