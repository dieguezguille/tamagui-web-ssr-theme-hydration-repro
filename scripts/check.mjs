import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const url = process.env.URL ?? "http://localhost:4319/";
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.CDP_PORT ?? 9337);
const schemes = (process.env.SCHEMES ?? "dark,light").split(",");

const html = await (await fetch(url)).text();
console.log("static html (before hydration)");
console.log("  root wrappers:", rootWrappers(html));

const profile = mkdtempSync(join(tmpdir(), "theme-hydration-"));
const browser = spawn(chrome, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=800,900",
  "about:blank",
]);
let failed = false;
try {
  const version = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json());
  console.log(`browser: ${version.Browser}`);
  for (const scheme of schemes) failed = (await run(scheme)) || failed;
} finally {
  browser.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

async function run(scheme) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = await connect(target.webSocketDebuggerUrl);
  const errors = [];
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type === "error" || type === "warning") errors.push(`${type}: ${args.map((a) => a.value ?? a.description).join(" ")}`);
  });
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => errors.push(`exception: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`));
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await cdp.send("Page.navigate", { url });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  await poll(async () => (await evaluate(`/\\bt_(light|dark)\\b/.test(document.documentElement.className + document.body.className)`)) || undefined).catch((error) => {
    throw new Error(`hydration not detected (${error.message}):\n  ${errors.join("\n  ")}`);
  });
  await sleep(1000);
  const hydrated = await evaluate(`(${inspect})()`);
  await evaluate(`document.getElementById("open").click()`);
  await poll(async () => (await evaluate(`!!document.getElementById("sheet")`)) || undefined);
  await sleep(1000);
  const opened = await evaluate(`(${inspect})()`);
  cdp.close();

  const bad = hydrated.wrappers.some((w) => !w.includes(`t_${scheme}`)) || opened.screen !== opened.sheet;
  console.log(`\nprefers-color-scheme: ${scheme}`);
  console.log(`  matchMedia dark: ${hydrated.mediaDark}`);
  console.log(`  <html class>: ${JSON.stringify(hydrated.html)}  <body class>: ${JSON.stringify(hydrated.body)}`);
  console.log(`  root wrappers after hydration: ${JSON.stringify(hydrated.wrappers)}`);
  console.log(`  #screen background: ${opened.screen}`);
  console.log(`  #sheet background:  ${opened.sheet}  (portal, nearest theme class: ${JSON.stringify(opened.sheetTheme)})`);
  console.log(`  console errors/warnings: ${errors.length ? `\n    ${errors.join("\n    ")}` : "none"}`);
  console.log(`  => ${bad ? `MISMATCH: root wrappers are not t_${scheme} and the screen does not match the sheet` : "ok"}`);
  return bad;
}

function inspect() {
  const background = (id) => {
    const node = document.getElementById(id);
    return node ? getComputedStyle(node).backgroundColor : null;
  };
  const wrappers = [...document.querySelectorAll("span._dsp_contents, span.is_Theme")]
    .filter((node) => /\bt_(light|dark)\b/.test(node.className) && !node.className.includes("t_sub_theme"))
    .filter((node) => node.contains(document.getElementById("screen")))
    .map((node) => node.className);
  const sheet = document.getElementById("sheet");
  return {
    mediaDark: matchMedia("(prefers-color-scheme: dark)").matches,
    html: document.documentElement.className,
    body: document.body.className,
    wrappers,
    screen: background("screen"),
    sheet: background("sheet"),
    sheetTheme: sheet?.closest("[class*='t_light'], [class*='t_dark']")?.className ?? null,
  };
}

function rootWrappers(source) {
  return [...source.matchAll(/<span class="([^"]*(?:_dsp_contents|is_Theme)[^"]*)"/g)]
    .map((match) => match[1])
    .filter((name) => /\bt_(light|dark)\b/.test(name) && !name.includes("t_sub_theme"));
}

async function poll(function_, timeout = 20_000) {
  const start = Date.now();
  for (;;) {
    try {
      const value = await function_();
      if (value !== undefined) return value;
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
    }
    if (Date.now() - start > timeout) throw new Error("timed out");
    await sleep(200);
  }
}

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) {
      listeners.get(message.method)?.(message.params);
    }
  });
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }),
    on: (method, listener) => listeners.set(method, listener),
    close: () => socket.close(),
  };
}
