#!/usr/bin/env python3
"""Verify real UI saves across Chromium, Firefox and WebKit.

Each campaign save starts with genuine New Game and the pause-menu Save button.
Other isolated browser contexts import those bytes as a declared storage fixture,
then use actual Continue. A separate same-engine legacy topology fixture checks
migration of previously published saves. These are save compatibility checks,
not natural campaign playthroughs or physical Safari evidence.
"""

import argparse
import asyncio
import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright


def debug_url(url):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("play", None)
    query["debug"] = "1"
    return urlunsplit(parts._replace(query=urlencode(query)))


def require(condition, message):
    if not condition:
        raise AssertionError(message)


async def save_new_game(browser, url):
    context = await browser.new_context(viewport={"width": 1280, "height": 800})
    try:
        page = await context.new_page()
        await page.goto(url)
        await page.locator("#new-game").click()
        await page.wait_for_function(
            "lowlight.state.campaign?.active?.missionId==='LL-ST-001'"
        )
        await page.keyboard.press("Escape")
        await page.locator("#pause-dialog").wait_for(state="visible")
        await page.locator("#save-game").click()
        await page.wait_for_function(
            "localStorage.getItem('lowlight.save.v1') !== null"
        )
        return await page.evaluate("localStorage.getItem('lowlight.save.v1')")
    finally:
        await context.close()


async def continue_save(browser, url, value, output, label):
    context = await browser.new_context(viewport={"width": 1280, "height": 800})
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    result = {"label": label, "passed": False, "errors": errors}
    try:
        await page.goto(url)
        await page.evaluate(
            "value => localStorage.setItem('lowlight.save.v1', value)", value
        )
        await page.reload()
        await page.locator("#continue-game").click()
        await page.wait_for_function(
            "document.body.dataset.mode==='play'", timeout=15000
        )
        await page.keyboard.press("Escape")
        await page.locator("#pause-dialog").wait_for(state="visible")
        actual = await page.evaluate("""() => ({
          mode: lowlight.state.campaignMode,
          mission: lowlight.state.campaign?.active?.missionId ?? null,
          stage: lowlight.state.campaign?.active?.stageId ?? null,
          companions: lowlight.state.companions.actors.map(a => ({id:a.id,health:a.health,sceneId:a.sceneId})),
          signals: lowlight.state.railSignals,
          engineErrors: lowlight.game.errors.map(e=>String(e.error||e))
        })""")
        expected = json.loads(value)["state"]
        require(
            actual["mode"] == expected["campaignMode"], "Save changed campaign mode"
        )
        require(
            actual["signals"]["topologyEncoding"] == 2,
            "Save topology was not canonicalized",
        )
        if expected.get("campaign"):
            require(
                actual["mission"] == expected["campaign"]["active"]["missionId"],
                "Campaign identity changed",
            )
            require(
                actual["stage"] == expected["campaign"]["active"]["stageId"],
                "Campaign stage changed",
            )
            expected_actors = [
                {k: a.get(k) for k in ("id", "health", "sceneId")}
                for a in expected["companions"]["actors"]
            ]
            require(
                actual["companions"] == expected_actors,
                "Companion health or scene was lost",
            )
            require(
                actual["signals"]["topology"] == expected["railSignals"]["topology"],
                "Cross-engine topology changed",
            )
        else:
            owners = {
                (r["resourceId"], r["trainId"])
                for r in actual["signals"]["reservations"]
            }
            require(
                all(
                    (r["resourceId"], r["trainId"]) in owners
                    for r in expected["railSignals"]["reservations"]
                ),
                "Legacy migration lost signal ownership",
            )
        require(not errors and not actual["engineErrors"], "Browser or engine errors")
        result.update(
            passed=True,
            mode=actual["mode"],
            mission=actual["mission"],
            topology=actual["signals"]["topology"],
            encoding=2,
        )
        await page.screenshot(path=str(output / f"{label}.png"))
    except (AssertionError, PlaywrightError) as error:
        result["failure"] = str(error)
        await page.screenshot(path=str(output / f"{label}-failure.png"))
    finally:
        await context.close()
    return result


async def legacy_save(browser, url):
    context = await browser.new_context()
    try:
        page = await context.new_page()
        await page.goto(url)
        return await page.evaluate("""async () => {
          const {createSimulation,saveGame,WORLD}=await import('/src/simulation.js');
          const {railDispatchTopology}=await import('/src/rail-dispatcher.js');
          const value=JSON.parse(saveGame(createSimulation(61)));
          value.state.railSignals.topology=railDispatchTopology(WORLD).legacyTopology;
          delete value.state.railSignals.topologyEncoding;
          return JSON.stringify(value);
        }""")
    finally:
        await context.close()


async def main(args):
    output = Path(args.output).resolve()
    require(
        str(output).startswith("/tmp/"),
        "Evidence must stay outside the repository in /tmp",
    )
    output.mkdir(parents=True, exist_ok=True)
    url = debug_url(args.url)
    root = Path(args.source_root).resolve()

    def source_hashes():
        files = [
            root / "index.html",
            root / "styles.css",
            *sorted((root / "src").rglob("*.js")),
        ]
        return {
            str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in files
        }

    report = {
        "boundary": __doc__,
        "saves": {},
        "results": [],
        "sourceHashes": source_hashes(),
    }
    browsers = {}
    async with async_playwright() as playwright:
        try:
            for engine in ("chromium", "firefox", "webkit"):
                browsers[engine] = await getattr(playwright, engine).launch()
            saves = {}
            for engine, browser in browsers.items():
                saves[engine] = await save_new_game(browser, url)
                report["saves"][engine] = {
                    "sha256": hashlib.sha256(saves[engine].encode()).hexdigest()
                }
            for target, browser in browsers.items():
                for source, value in saves.items():
                    result = await continue_save(
                        browser, url, value, output, f"{source}-to-{target}"
                    )
                    report["results"].append(result)
                    print(json.dumps(result), flush=True)
                result = await continue_save(
                    browser,
                    url,
                    await legacy_save(browser, url),
                    output,
                    f"legacy-{target}",
                )
                report["results"].append(result)
                print(json.dumps(result), flush=True)
        finally:
            for browser in browsers.values():
                await browser.close()
            final_hashes = source_hashes()
            report["sourceChanges"] = [
                name
                for name, digest in report["sourceHashes"].items()
                if final_hashes.get(name) != digest
            ]
            (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return (
        0
        if len(report["results"]) == 12
        and all(r["passed"] for r in report["results"])
        and not report["sourceChanges"]
        else 1
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--output", default="/tmp/lowlight-save-portability")
    parser.add_argument(
        "--source-root", default=str(Path(__file__).resolve().parents[1])
    )
    raise SystemExit(asyncio.run(main(parser.parse_args())))
