#!/usr/bin/env python3
"""Compare paired fresh-context startup and exact world output across browsers.

This measures headless browser navigation/module readiness, not cold OS caches,
sustained gameplay or physical-device performance. No actor/world/clock fixtures
are applied. Each optimized build also starts a genuine new arrival. Timing is
reported rather than assigned a machine-dependent pass threshold.
"""

import argparse
import asyncio
import hashlib
import json
import statistics
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import async_playwright


def debug_url(url):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("play", None)
    query["debug"] = "1"
    return urlunsplit(parts._replace(query=urlencode(query)))


async def source_hashes(browser, url):
    context = await browser.new_context()
    try:
        page = await context.new_page()
        result = {}
        base = urlsplit(url)
        for name in ("src/city-blueprint.js", "src/world.js", "src/simulation.js"):
            response = await page.request.get(
                urlunsplit(base._replace(path="/" + name, query="", fragment=""))
            )
            if not response.ok:
                raise AssertionError(f"Source {name} returned {response.status}")
            result[name] = hashlib.sha256(await response.body()).hexdigest()
        return result
    finally:
        await context.close()


async def sample(browser, url, label):
    context = await browser.new_context(
        viewport={"width": 1440, "height": 900}, device_scale_factor=1
    )
    try:
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: (
                errors.append(message.text) if message.type == "error" else None
            ),
        )
        started = time.monotonic()
        await page.goto(debug_url(url))
        await page.wait_for_function("window.lowlight", timeout=30000)
        timing = await page.evaluate("""() => ({
          readyMs: performance.now(),
          loadMs: performance.getEntriesByType('navigation')[0].loadEventEnd,
          mode: document.body.dataset.mode,
          engineErrors: lowlight.game.errors.map(e=>String(e.error||e))
        })""")
        timing["wallMs"] = (time.monotonic() - started) * 1000
        content = await page.evaluate("""async () => {
          const {WORLD}=await import('/src/world.js');
          const digest=async text=>{
            const bytes=new TextEncoder().encode(text);
            const hash=await crypto.subtle.digest('SHA-256',bytes);
            return {bytes:bytes.length,sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')};
          };
          return {world:await digest(JSON.stringify(WORLD)),state:await digest(lowlight.save())};
        }""")
        if errors or timing["engineErrors"] or timing["mode"] != "title":
            raise AssertionError(f"Startup failed: {timing}, {errors}")
        return {"label": label, **timing, **content, "errors": errors}
    finally:
        await context.close()


async def new_game(browser, url, output, engine):
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(debug_url(url))
        await page.locator("#new-game").click()
        await page.wait_for_function(
            "lowlight.state.campaign?.active?.missionId==='LL-ST-001' && lowlight.state.time>1",
            timeout=30000,
        )
        actual = await page.evaluate("""() => ({
          stage:lowlight.state.campaign.active.stageId,
          health:lowlight.state.player.health,
          actorHealth:lowlight.state.companions.actors.map(a=>a.health),
          time:lowlight.state.time,
          engineErrors:lowlight.game.errors.map(e=>String(e.error||e)),
          overflow:document.documentElement.scrollWidth>innerWidth+1
        })""")
        if (
            actual["stage"] != "berth"
            or actual["health"] != 100
            or any(health != 100 for health in actual["actorHealth"])
            or actual["engineErrors"]
            or actual["overflow"]
            or errors
        ):
            raise AssertionError(f"New Game failed: {actual}, {errors}")
        await page.screenshot(path=str(output / f"{engine}-arrival.png"))
        return actual
    finally:
        await context.close()


async def main(args):
    output = Path(args.output).resolve()
    if not str(output).startswith("/tmp/"):
        raise ValueError("Keep benchmark reports outside the repository in /tmp")
    output.mkdir(parents=True, exist_ok=True)
    report = {"boundary": __doc__, "samplesPerBuild": args.samples, "engines": []}
    try:
        async with async_playwright() as playwright:
            for engine in args.engines.split(","):
                browser = await getattr(playwright, engine).launch()
                try:
                    urls = {"baseline": args.baseline, "optimized": args.url}
                    before = {
                        label: await source_hashes(browser, url)
                        for label, url in urls.items()
                    }
                    samples = []
                    for iteration in range(args.samples):
                        order = (
                            list(urls) if iteration % 2 == 0 else list(reversed(urls))
                        )
                        for label in order:
                            result = await sample(browser, urls[label], label)
                            result["iteration"] = iteration
                            samples.append(result)
                            print(
                                json.dumps(
                                    {
                                        "engine": engine,
                                        "build": label,
                                        "iteration": iteration,
                                        "readyMs": result["readyMs"],
                                    }
                                ),
                                flush=True,
                            )
                    for key in ("world", "state"):
                        if (
                            len({json.dumps(s[key], sort_keys=True) for s in samples})
                            != 1
                        ):
                            raise AssertionError(
                                f"{engine} {key} output changed across builds"
                            )
                    after = {
                        label: await source_hashes(browser, url)
                        for label, url in urls.items()
                    }
                    if after != before:
                        raise AssertionError(
                            f"{engine} sources changed during measurement"
                        )
                    arrival = await new_game(browser, args.url, output, engine)
                    medians = {
                        label: statistics.median(
                            s["readyMs"] for s in samples if s["label"] == label
                        )
                        for label in urls
                    }
                    report["engines"].append(
                        {
                            "engine": engine,
                            "passed": True,
                            "samples": samples,
                            "sourceHashes": before,
                            "sourceUnchanged": True,
                            "readyMsMedian": medians,
                            "reductionPercent": 100
                            * (1 - medians["optimized"] / medians["baseline"]),
                            "genuineNewGame": arrival,
                        }
                    )
                finally:
                    await browser.close()
    finally:
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--engines", default="chromium,webkit,firefox")
    parser.add_argument("--samples", type=int, choices=range(2, 11), default=3)
    parser.add_argument("--output", default="/tmp/lowlight-browser-startup")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
