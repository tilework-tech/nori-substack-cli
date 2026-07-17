import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { CliError } from "../core/errors.js";
import { browserEnvironment, discoverChromium } from "./session.js";
const DISPLAY_NUM = 99;
const RFB_PORT = 5900;
const NOVNC_PORT = 6080;
const CDP_PORT = 9222;
export function resolveVncStack(xvfbExists, home, vncRoot = path.join(home, ".local/vnc-root")) {
    if (xvfbExists)
        return { useProot: false, vncBin: "/usr/bin", novncWeb: "/usr/share/novnc", websockify: ["websockify"], vncRoot };
    return { useProot: true, vncBin: path.join(vncRoot, "usr/bin"), novncWeb: path.join(vncRoot, "usr/share/novnc"), websockify: ["python3", "-m", "websockify"], vncRoot };
}
export function buildNovncUrl(sessionBaseUrl, novncPort) {
    const base = sessionBaseUrl.replace(/\/+$/, "");
    return `${base}/port/${novncPort}/vnc.html?path=port/${novncPort}/websockify&autoconnect=true&resize=scale`;
}
function statePath() {
    return process.env.NORI_SUBSTACK_HOST_STATE ?? path.join(os.homedir(), ".local/state/nori-substack/host.json");
}
function readState() {
    const target = statePath();
    if (!existsSync(target))
        return undefined;
    return JSON.parse(readFileSync(target, "utf8"));
}
function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === "EPERM";
    }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs, intervalMs) {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await predicate())
            return true;
        await sleep(intervalMs);
    } while (Date.now() < deadline);
    return false;
}
function portListening(port) {
    return new Promise((resolve) => {
        const socket = net.connect(port, "127.0.0.1");
        socket.once("connect", () => { socket.destroy(); resolve(true); });
        socket.once("error", () => resolve(false));
    });
}
function onPath(binary) {
    return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).some((dir) => existsSync(path.join(dir, binary)));
}
function findMissing(plan) {
    const missing = [];
    if (plan.useProot) {
        for (const relative of ["usr/bin/proot", "usr/bin/Xtigervnc", "usr/bin/xkbcomp", "usr/bin/fluxbox"]) {
            if (!existsSync(path.join(plan.vncRoot, relative)))
                missing.push(path.join(plan.vncRoot, relative));
        }
        if (!onPath("python3"))
            missing.push("python3");
    }
    else {
        for (const binary of ["Xvfb", "x11vnc", "fluxbox", "websockify"])
            if (!onPath(binary))
                missing.push(binary);
    }
    if (!existsSync(plan.novncWeb))
        missing.push(plan.novncWeb);
    return missing;
}
function stackEnvironment(plan, home) {
    const environment = { ...process.env, DISPLAY: `:${DISPLAY_NUM}` };
    if (!plan.useProot)
        return environment;
    environment.LD_LIBRARY_PATH = [path.join(plan.vncRoot, "usr/lib/x86_64-linux-gnu"), path.join(plan.vncRoot, "lib/x86_64-linux-gnu"), process.env.LD_LIBRARY_PATH ?? ""].filter(Boolean).join(path.delimiter);
    environment.PYTHONPATH = [path.join(plan.vncRoot, "usr/lib/python3/dist-packages"), process.env.PYTHONPATH ?? ""].filter(Boolean).join(path.delimiter);
    environment.PATH = [path.join(home, ".local/vnc-bin"), plan.vncBin, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
    return environment;
}
function chromiumEnvironment(plan, home) {
    const stack = stackEnvironment(plan, home);
    return { ...browserEnvironment(), DISPLAY: `:${DISPLAY_NUM}`, LD_LIBRARY_PATH: [(browserEnvironment().LD_LIBRARY_PATH ?? ""), (stack.LD_LIBRARY_PATH ?? "")].filter(Boolean).join(path.delimiter) };
}
function spawnDetached(command, args, environment, logFile) {
    const log = openSync(logFile, "a");
    const child = spawn(command, args, { detached: true, stdio: ["ignore", log, log], env: environment });
    child.unref();
    return child.pid ?? -1;
}
function writeWatchdog(plan, logDir) {
    const watchdog = path.join(logDir, "watchdog.sh");
    const websockify = plan.websockify.join(" ");
    const script = `#!/usr/bin/env bash
export DISPLAY=:${DISPLAY_NUM}
while true; do
  if [[ "${plan.useProot ? 1 : 0}" == 0 ]]; then
    pgrep -x x11vnc >/dev/null || nohup x11vnc -display :${DISPLAY_NUM} -forever -shared -nopw -rfbport ${RFB_PORT} >"${logDir}/x11vnc.log" 2>&1 &
  fi
  if ! ss -ltn 2>/dev/null | grep -q ':${NOVNC_PORT}'; then
    for pid in $(pgrep -f websockify); do kill "$pid" 2>/dev/null; done; sleep 1
    nohup ${websockify} --web="${plan.novncWeb}" ${NOVNC_PORT} localhost:${RFB_PORT} >>"${logDir}/websockify.log" 2>&1 &
  fi
  sleep 10
done
`;
    writeFileSync(watchdog, script, { mode: 0o755 });
    return watchdog;
}
async function startBridge(plan, chromium, home) {
    const logDir = path.join(home, ".local/share/noriagent/logs");
    const profile = path.join(home, ".local/share/noriagent/substack-chrome-profile");
    mkdirSync(logDir, { recursive: true });
    mkdirSync(profile, { recursive: true });
    mkdirSync(path.join(home, ".local/vnc-bin"), { recursive: true });
    const environment = stackEnvironment(plan, home);
    const pids = [];
    if (plan.useProot) {
        pids.push(spawnDetached(path.join(plan.vncBin, "proot"), [
            "-b", `${path.join(plan.vncRoot, "usr/bin/xkbcomp")}:/usr/bin/xkbcomp`,
            "-b", `${path.join(plan.vncRoot, "usr/share/X11/xkb")}:/usr/share/X11/xkb`,
            path.join(plan.vncBin, "Xtigervnc"), `:${DISPLAY_NUM}`,
            "-geometry", "1280x800", "-depth", "24", "-ac", "-SecurityTypes", "None", "-rfbport", String(RFB_PORT),
        ], environment, path.join(logDir, "xtigervnc.log")));
    }
    else {
        pids.push(spawnDetached("Xvfb", [`:${DISPLAY_NUM}`, "-screen", "0", "1280x800x24", "-ac"], environment, path.join(logDir, "xvfb.log")));
    }
    // Chromium and the window manager cannot connect to :99 until the X server's
    // socket exists; the original script slept, we wait for the socket instead.
    const displayReady = await waitFor(() => existsSync(`/tmp/.X11-unix/X${DISPLAY_NUM}`), 15_000, 200);
    if (!displayReady) {
        for (const pid of pids) {
            try {
                process.kill(-pid, "SIGTERM");
            }
            catch { /* already gone */ }
        }
        throw new CliError("DISPLAY_START_FAILED", `The virtual X display :${DISPLAY_NUM} did not come up; see ${logDir}.`, 5, true, { logDir });
    }
    pids.push(spawnDetached(path.join(plan.vncBin, "fluxbox"), [], environment, path.join(logDir, "fluxbox.log")));
    pids.push(spawnDetached("bash", [writeWatchdog(plan, logDir)], environment, path.join(logDir, "watchdog-run.log")));
    pids.push(spawnDetached(chromium, [
        "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, "--window-size=1280,800", "--start-maximized", "https://substack.com/sign-in",
    ], chromiumEnvironment(plan, home), path.join(logDir, "chrome.log")));
    await waitFor(() => portListening(NOVNC_PORT), 15_000, 300);
    return pids;
}
function writeState(state) {
    const target = statePath();
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(state), { mode: 0o600 });
}
function stopBridge() {
    const state = readState();
    if (!state)
        return { stopped: false, reason: "no bridge running" };
    for (const pid of state.pids) {
        try {
            process.kill(-pid, "SIGTERM");
        }
        catch {
            try {
                process.kill(pid, "SIGTERM");
            }
            catch { /* process already gone */ }
        }
    }
    rmSync(statePath(), { force: true });
    return { stopped: true, pids: state.pids };
}
const nextSteps = `Give novncUrl to the human, end your turn, and do not poll. After they confirm login: nori-substack auth capture --cdp http://127.0.0.1:${CDP_PORT} --confirm, then nori-substack auth status.`;
export async function hostBrowser(options) {
    if (options.stop)
        return stopBridge();
    const running = readState();
    if (running && running.pids.some(isAlive))
        return { ...running, status: "awaiting_human", reused: true, next: nextSteps };
    const sessionUrl = (options.sessionUrl ?? process.env.NORI_SESSION_URL ?? "").trim();
    if (!sessionUrl)
        throw new CliError("SESSION_URL_MISSING", "No --session-url given and NORI_SESSION_URL is unset; cannot build the human noVNC link.", 2, true);
    const home = os.homedir();
    const vncRoot = process.env.NORI_SUBSTACK_VNC_ROOT ?? path.join(home, ".local/vnc-root");
    const plan = resolveVncStack(existsSync("/usr/bin/Xvfb"), home, vncRoot);
    const missing = findMissing(plan);
    if (missing.length) {
        throw new CliError("VNC_STACK_MISSING", `The noVNC re-auth stack is not installed (${plan.useProot ? "proot" : "system"} mode). Missing: ${missing.join(", ")}. Provision it in the fleet setup before hosting a browser.`, 5, false, { mode: plan.useProot ? "proot" : "system", missing });
    }
    const chromium = await discoverChromium(options.browser);
    const novncUrl = buildNovncUrl(sessionUrl, NOVNC_PORT);
    const pids = await startBridge(plan, chromium, home);
    writeState({ pids, cdpPort: CDP_PORT, novncPort: NOVNC_PORT, novncUrl });
    return { novncUrl, cdpPort: CDP_PORT, novncPort: NOVNC_PORT, mode: plan.useProot ? "proot" : "system", status: "awaiting_human", pids, next: nextSteps };
}
//# sourceMappingURL=host.js.map