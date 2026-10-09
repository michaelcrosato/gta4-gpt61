#!/usr/bin/env python3
"""Continue a genuine coupled 0.6 all-held whole-game save in each browser.

The only fixture is initial localStorage containing supplied complete save bytes.
An additional Continue-button listener reads the restored state in the same click
task, after the production handler and before the first simulation tick. No game
state, fleet, world clock, timestep or animation scheduling is changed. Recovery,
pause-menu storage, reload and continued movement use actual UI and normal time.
This bounded recovery check is not a browser multi-circuit or natural-play claim.
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


def source_hashes(root):
    files = [
        *root.joinpath("src").rglob("*.js"),
        *(
            root / name
            for name in ("my-3d2dge.js", "my-3d2dge-agent.js", "package.json")
        ),
    ]
    return {
        str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest()
        for file in sorted(files)
    }


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def compare_before_tick(actual, expected):
    for key in (
        "time",
        "clock",
        "campaignMode",
        "progress",
        "campaign",
        "storyInventory",
    ):
        require(
            actual.get(key) == expected.get(key), f"Continue changed {key} before tick"
        )
    for key in ("time", "trains", "passengers", "ledger", "events", "stats"):
        require(
            actual["transit"].get(key) == expected["transit"].get(key),
            f"Continue changed transit.{key} before tick",
        )
    require(
        actual["railSignals"] == expected["railSignals"],
        "Continue changed reservations",
    )
    for key in ("health", "armour", "money", "vehicleId", "x", "y", "z"):
        require(
            actual["player"].get(key) == expected["player"].get(key),
            f"Player {key} changed",
        )
    for key in ("actors", "records", "events", "sequence"):
        require(
            actual["companions"].get(key) == expected["companions"].get(key),
            f"Continue changed companion {key}",
        )


async def continue_and_capture(page):
    await page.locator("#continue-game").evaluate("""button => {
      button.addEventListener('click', () => {
        window.__railRecoveryBeforeTick = JSON.parse(lowlight.save()).state;
      }, {once:true});
    }""")
    await page.locator("#continue-game").click()
    await page.wait_for_function("window.__railRecoveryBeforeTick")
    require(
        await page.evaluate("document.body.dataset.mode") == "play",
        "Actual Continue did not enter the game",
    )
    return await page.evaluate("window.__railRecoveryBeforeTick")


async def wait_for_motion(page, initial, timeout):
    await page.wait_for_function(
        """before => {
          const s=lowlight.state;
          return s.time>before.time+1 && s.transit.trains.some(t=>{
            const old=before.transit.trains.find(v=>v.id===t.id);
            return old && (t.visits>old.visits ||
              (t.x-old.x)**2+(t.y-old.y)**2+(t.z-old.z)**2>100);
          });
        }""",
        arg=initial,
        timeout=timeout,
    )
    return await page.evaluate("JSON.parse(lowlight.save()).state")


async def validate_actual(page):
    return await page.evaluate("""async () => {
      const {WORLD}=await import('/src/simulation.js');
      const {validateRailRuntime}=await import('/src/rail-runtime.js');
      const s=lowlight.state;
      return {valid:validateRailRuntime(s,WORLD),time:s.time,
        transitTime:s.transit.time,signalTime:s.railSignals.time,
        fleet:s.transit.trains,signals:s.railSignals,
        callbackErrors:s.transit.callbackErrors,
        engineErrors:lowlight.game.errors.map(e=>String(e.error||e))};
    }""")


async def check(playwright, engine, args, output, initial_bytes):
    browser = await getattr(playwright, engine).launch()
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    report = {"engine": engine, "passed": False, "checks": [], "pageErrors": errors}
    try:
        expected = json.loads(initial_bytes)["state"]
        require(
            all(t["phase"] == "held" for t in expected["transit"]["trains"]),
            "Initial genuine fixture must contain the all-held fleet",
        )
        await page.goto(debug_url(args.url))
        await page.wait_for_function("window.lowlight")
        # Sole initial fixture. No lowlight.restore/update or state writes follow.
        await page.evaluate(
            "bytes => localStorage.setItem('lowlight.save.v1',bytes)", initial_bytes
        )
        await page.reload()
        await page.wait_for_function("window.lowlight")
        restored = await continue_and_capture(page)
        compare_before_tick(restored, expected)
        report["checks"].append(
            "Actual Continue preserves complete owned state before first tick"
        )
        moved = await wait_for_motion(page, restored, args.timeout)
        report["recovery"] = {
            "initialTime": restored["time"],
            "observedTime": moved["time"],
            "initialFleet": restored["transit"]["trains"],
            "movingFleet": moved["transit"]["trains"],
        }
        require(
            moved["player"]["money"] == expected["player"]["money"],
            "Idle recovery cost money",
        )
        require(
            moved["transit"]["passengers"] == expected["transit"]["passengers"],
            "Riders changed",
        )
        report["checks"].append(
            "Previously held fleet physically moves on normal browser clock"
        )
        await page.screenshot(path=str(output / f"{engine}-recovered.png"))
        first = await validate_actual(page)
        require(
            first["valid"] is True, "Recovered ownership/physical rail model is invalid"
        )
        require(
            not first["callbackErrors"] and not first["engineErrors"],
            "Recovery has engine errors",
        )

        await page.keyboard.press("Escape")
        await page.locator("#pause-dialog").wait_for(state="visible")
        await page.locator("#save-game").click()
        stored_bytes = await page.evaluate("localStorage.getItem('lowlight.save.v1')")
        stored = json.loads(stored_bytes)["state"]
        require(
            stored["time"] > expected["time"], "Save did not commit the resumed world"
        )
        (output / f"{engine}-actual-ui-save.json").write_text(stored_bytes)
        await page.reload()
        await page.wait_for_function("window.lowlight")
        continued = await continue_and_capture(page)
        compare_before_tick(continued, stored)
        report["checks"].append(
            "Pause-menu Save and reload/Continue preserve actual moving world"
        )
        continued_motion = await wait_for_motion(page, continued, args.timeout)
        require(
            [t["id"] for t in continued_motion["transit"]["trains"]]
            == [t["id"] for t in expected["transit"]["trains"]],
            "Continued motion replaced trains",
        )
        require(
            continued_motion["player"]["money"] == expected["player"]["money"],
            "Wallet changed",
        )
        report["validation"] = await validate_actual(page)
        require(
            report["validation"]["valid"] is True, "Continued reservations are invalid"
        )
        require(
            not report["validation"]["callbackErrors"],
            "Rail callback error was swallowed",
        )
        require(
            not report["validation"]["engineErrors"] and not errors,
            "Browser/engine error",
        )
        report["checks"].append(
            "Further normal movement retains train identity and strict ownership"
        )
        await page.screenshot(path=str(output / f"{engine}-continued.png"))
        report["passed"] = True
    except (
        AssertionError,
        PlaywrightError,
        ValueError,
        KeyError,
        TypeError,
        OSError,
    ) as error:
        report["error"] = str(error)
        try:
            report["lastState"] = await page.evaluate(
                "window.lowlight ? JSON.parse(lowlight.save()).state : null"
            )
            await page.screenshot(path=str(output / f"{engine}-failure.png"))
        except (PlaywrightError, ValueError, TypeError, OSError) as capture_error:
            report["captureError"] = str(capture_error)
    finally:
        await context.close()
        await browser.close()
    return report


async def main(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    root = Path(args.source_root).resolve()
    before = source_hashes(root)
    initial_bytes = Path(args.save).read_text()
    results = []
    async with async_playwright() as playwright:
        for engine in args.engines.split(","):
            result = await check(playwright, engine, args, output, initial_bytes)
            results.append(result)
            summary = {
                "boundary": __doc__,
                "sourceRoot": str(root),
                "sourceHashes": before,
                "sourceChanges": [
                    k for k, v in source_hashes(root).items() if before.get(k) != v
                ],
                "initialSave": str(Path(args.save).resolve()),
                "initialSaveSha256": hashlib.sha256(initial_bytes.encode()).hexdigest(),
                "results": results,
            }
            (output / "report.json").write_text(json.dumps(summary, indent=2) + "\n")
            print(
                f"{engine}: {'PASS' if result['passed'] else result.get('error')}",
                flush=True,
            )
    return (
        0
        if all(result["passed"] for result in results) and not summary["sourceChanges"]
        else 1
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--save", required=True)
    parser.add_argument("--engines", default="chromium,webkit,firefox")
    parser.add_argument("--timeout", type=int, default=45000)
    parser.add_argument("--output", default="/tmp/lowlight-rail-recovery")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
