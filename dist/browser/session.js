import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { sessionCookies, writeStorageState } from "../core/auth.js";
import { CliError } from "../core/errors.js";
export function browserEnvironment() {
    const bundledLibraries = "/tmp/chromium-libs/usr/lib/x86_64-linux-gnu";
    if (!existsSync(bundledLibraries))
        return { ...process.env };
    return { ...process.env, LD_LIBRARY_PATH: `${bundledLibraries}:${process.env.LD_LIBRARY_PATH ?? ""}` };
}
async function findChromium(root) {
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    }
    catch {
        return undefined;
    }
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isFile() && (entry.name === "chrome" || entry.name === "chromium") && /chrome-linux|chromium/.test(full))
            return full;
    }
    for (const entry of entries)
        if (entry.isDirectory()) {
            const found = await findChromium(path.join(root, entry.name));
            if (found)
                return found;
        }
    return undefined;
}
export async function discoverChromium(explicit) {
    const candidate = explicit ?? process.env.NORI_SUBSTACK_BROWSER ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (candidate)
        return candidate;
    const found = await findChromium(path.join(os.homedir(), ".cache/ms-playwright"));
    if (!found)
        throw new CliError("BROWSER_NOT_FOUND", "Chromium was not found. Install it with: npx playwright install --with-deps chromium", 5, true);
    return found;
}
export async function captureFromCdp(cdp, statePath) {
    let browser;
    try {
        browser = await chromium.connectOverCDP(cdp);
    }
    catch (error) {
        throw new CliError("CDP_CONNECTION_FAILED", `Could not connect to Chromium at ${cdp}.`, 5, true, { cause: error instanceof Error ? error.message : String(error) });
    }
    try {
        const context = browser.contexts()[0];
        if (!context)
            throw new CliError("CDP_CONTEXT_MISSING", "No browser context exists at the CDP endpoint.", 5, true);
        const captured = await context.storageState({ indexedDB: true });
        const json = `${JSON.stringify(captured)}\n`;
        const authenticated = sessionCookies(captured);
        if (!authenticated.length)
            throw new CliError("AUTH_COOKIES_MISSING", "The connected browser is not signed into Substack.", 3, true);
        await mkdir(path.dirname(statePath), { recursive: true });
        const state = await writeStorageState(statePath, json);
        return { statePath, cookieCount: state.cookies.length, sessionCookieCount: authenticated.length };
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=session.js.map