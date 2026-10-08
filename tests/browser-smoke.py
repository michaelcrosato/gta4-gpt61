#!/usr/bin/env python3
"""Exercise LOWLIGHT's browser controls with machine-installed Playwright.

This is an onboarding and UI regression check, not a complete-game playthrough.
Natural keyboard/touch movement never teleports the player. The reload check
uses a declared ammunition fixture, and controller checks mock getGamepads;
they do not establish physical gamepad or real iOS Safari compatibility.
"""

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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


async def key(page, name):
    await page.keyboard.press(name, delay=85)
    await page.wait_for_timeout(170)


async def touch_tap(page, selector):
    box = await page.locator(selector).bounding_box()
    require(box is not None, f"Touch control {selector} is not visible")
    await page.touchscreen.tap(box["x"] + box["width"] / 2,
                              box["y"] + box["height"] / 2)
    await page.wait_for_timeout(240)


async def snapshot(page):
    return await page.evaluate("""() => ({
      mission: lowlight.state.mission,
      player: {...lowlight.state.player},
      time: lowlight.state.time,
      waypoint: lowlight.state.waypoint,
      dialogue: lowlight.state.dialogue,
      engineErrors: lowlight.game.errors.map(error => String(error.error || error)),
      reportedFps: lowlight.game.fps,
      stats: {...lowlight.game.stats}
    })""")


async def frame_sample(page):
    return await page.evaluate("""() => new Promise(resolve => {
      const times = [];
      const frame = time => {
        times.push(time);
        if (times.length < 25) requestAnimationFrame(frame);
        else resolve({
          actualFps: 24000 / (times[24] - times[0]),
          reportedFps: lowlight.game.fps,
          internal: {width: lowlight.game.screen.W, height: lowlight.game.screen.H},
          output: {width: document.getElementById('screen').width,
                   height: document.getElementById('screen').height},
          dpr: devicePixelRatio, stats: {...lowlight.game.stats}
        });
      };
      requestAnimationFrame(frame);
    })""")


async def natural_flow(page, report, output, name, phone):
    await page.wait_for_function("window.lowlight")
    await page.wait_for_timeout(550)
    await page.screenshot(path=str(output / f"{name}-title.png"))

    # Native Enter must activate the focused menu control rather than new game.
    await page.focus("#controls-button")
    await key(page, "Enter")
    require(await page.locator("#info-dialog").is_visible(),
            "Native Enter did not open the focused How to Play control")
    require(await page.locator("#info-title").inner_text() == "Own the streets.",
            "Native Enter activated the wrong menu control")
    await key(page, "Escape")
    require(not await page.locator("#info-dialog").is_visible(),
            "Escape did not close the controls dialog")
    report["checks"].append("native menu Enter and dialog Escape")

    await page.click("#settings-button")
    await page.select_option("#weather-setting", "off")
    await page.select_option("#motion-setting", "on")
    await page.select_option("#camera-setting", "topdown")
    await page.locator("#volume").fill("17")
    settings = await page.evaluate("JSON.parse(localStorage.getItem('lowlight.settings.v1'))")
    require(settings["volume"] == 0.17 and not settings["rain"]
            and settings["reduceMotion"] and settings["camera"] == "topdown",
            "Settings did not persist the selected values")
    await key(page, "Escape")
    await page.focus("#credits-button")
    await key(page, "Enter")
    require("city behind" in await page.locator("#info-title").inner_text(),
            "Credits menu did not open")
    await key(page, "Escape")
    await page.focus("#new-game")
    await key(page, "Enter")
    require(await page.evaluate("document.body.dataset.mode") == "play",
            "New game did not enter play mode")
    require((await snapshot(page))["mission"]["stage"] == 0,
            "New game did not start at the opening mission stage")

    # These are real key events; debug state is only read for assertions.
    for _ in range(3):
        await key(page, "e")
    require((await snapshot(page))["dialogue"] is None,
            "Three E presses did not finish the opening conversation")
    await key(page, "e")
    require((await snapshot(page))["mission"]["stage"] == 1,
            "Reporting to Felix did not advance to the taxi objective")
    await key(page, "e")
    entered = await snapshot(page)
    require(entered["player"]["vehicleId"] == "starter-taxi"
            and entered["mission"]["stage"] == 2,
            "Genuine E input did not enter the starter taxi")
    await key(page, "e")
    before = (await snapshot(page))["player"]
    await page.keyboard.down("w")
    await page.wait_for_timeout(1800)
    await page.keyboard.up("w")
    after = (await snapshot(page))["player"]
    driven = ((after["x"] - before["x"]) ** 2
              + (after["y"] - before["y"]) ** 2) ** 0.5
    require(driven > 20, "Holding W did not move the taxi at least 20 world units")
    await page.keyboard.down("Shift")
    await page.wait_for_timeout(900)
    await page.keyboard.up("Shift")
    await key(page, "e")
    require((await snapshot(page))["player"]["vehicleId"] is None,
            "Brake then E did not exit the taxi")
    report["drivenWorldUnits"] = driven
    report["checks"].append("E conversation, taxi entry, genuine W drive, brake and exit")

    await key(page, "Escape")
    require(await page.locator("#pause-dialog").is_visible(), "Escape did not pause")
    frozen = await page.evaluate("lowlight.state.time")
    await page.wait_for_timeout(350)
    require(await page.evaluate("lowlight.state.time") == frozen,
            "Simulation time advanced while the pause dialog was open")
    await page.click("#pause-map")
    await key(page, "Tab")
    require(await page.evaluate("document.activeElement.id") == "city-map",
            "Map canvas is not reachable with Tab")
    await key(page, "ArrowRight")
    await key(page, "ArrowRight")
    await key(page, "ArrowDown")
    await key(page, "Enter")
    mapped = await snapshot(page)
    require(mapped["waypoint"] is not None, "Keyboard map did not set a waypoint")
    separation = ((mapped["waypoint"]["x"] - mapped["player"]["x"]) ** 2
                  + (mapped["waypoint"]["y"] - mapped["player"]["y"]) ** 2) ** 0.5
    require(separation > 25, "Keyboard map only selected the player's own location")
    await key(page, "Escape")
    require(not await page.locator("#map-dialog").is_visible(),
            "Escape did not close the focused map canvas")
    await key(page, "e")
    require((await snapshot(page))["player"]["vehicleId"] == "starter-taxi",
            "Closing the map did not restore keyboard interaction")
    await key(page, "e")
    require((await snapshot(page))["player"]["vehicleId"] is None,
            "Keyboard vehicle exit did not work after closing the map")

    # No artificial delay between dialog close and the new Escape press.
    await key(page, "m")
    await page.click("#map-dialog .close-dialog")
    await page.keyboard.press("Escape", delay=85)
    await page.wait_for_timeout(200)
    require(await page.locator("#pause-dialog").is_visible(),
            "Immediate Escape after map close was discarded")
    await page.click("#save-game")
    saved = await page.evaluate("JSON.parse(localStorage.getItem('lowlight.save.v1'))")
    require(saved["state"]["mission"]["stage"] == 2, "Save missed the active mission stage")
    await key(page, "e")
    require((await snapshot(page))["player"]["vehicleId"] == "starter-taxi",
            "Saving progress did not restore keyboard interaction")
    await key(page, "e")
    require((await snapshot(page))["player"]["vehicleId"] is None,
            "Keyboard vehicle exit did not work after saving progress")
    await key(page, "Escape")
    require(await page.locator("#pause-dialog").is_visible(), "Pause did not reopen after saved-game interaction")
    await page.click("#save-game")
    await page.keyboard.press("Escape", delay=85)
    await page.wait_for_timeout(200)
    require(await page.locator("#pause-dialog").is_visible(),
            "Immediate Escape after Save closed the dialog was discarded")
    await page.click("#quit-game")
    await page.reload()
    await page.wait_for_function("window.lowlight")
    require(await page.locator("#continue-game").is_visible(), "Continue did not appear after reload")
    require(await page.evaluate("JSON.parse(localStorage.getItem('lowlight.settings.v1')).camera")
            == "topdown", "Camera settings were lost after reload")
    await page.click("#continue-game")
    await page.wait_for_timeout(450)
    restored = await snapshot(page)
    require(restored["mission"]["id"] == saved["state"]["mission"]["id"]
            and restored["mission"]["stage"] == saved["state"]["mission"]["stage"],
            "Continue did not restore the persisted mission")
    require(await page.locator("#notifications .toast").count() == 0,
            "Continue replayed stale saved notifications")
    report["checks"].append("pause, keyboard waypoint, focused Escape, close races, save and continue")

    await page.click("#menu-button")
    await page.click("#pause-phone")
    require(await page.locator("#info-title").inner_text() == "One missed call.",
            "Pause-menu Phone did not open")
    await page.click("#phone-journal")
    require(await page.locator(".journal-card").count() == 4, "Journal lost the current four mission entries")
    await key(page, "Escape")
    before_resume = (await snapshot(page))["player"]
    await page.keyboard.down("w")
    await page.wait_for_timeout(250)
    await page.keyboard.up("w")
    after_resume = (await snapshot(page))["player"]
    require(((after_resume["x"] - before_resume["x"]) ** 2
             + (after_resume["y"] - before_resume["y"]) ** 2) ** 0.5 > 1,
            "Closing Phone/Journal left keyboard gameplay trapped on a HUD button")
    report["checks"].append("Phone and journal")
    require(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
            "Page has horizontal overflow")
    require(not restored["engineErrors"], "Engine recorded an update or rendering error")
    report["telemetry"] = await frame_sample(page)
    await page.screenshot(path=str(output / f"{name}-continued.png"))

    if phone:
        # A named fixture isolates the finite-ammo reload contract; no movement
        # or mission progression is teleported or marked complete by this setup.
        await page.evaluate("lowlight.state.player.ammo.pistol.clip=5;"
                            "lowlight.state.player.ammo.pistol.reserve=20")
        await touch_tap(page, "#touch-reload")
        await page.wait_for_timeout(1800)
        ammo = await page.evaluate("lowlight.state.player.ammo.pistol")
        require(ammo == {"clip": 12, "reserve": 13}, "Touch LOAD did not conserve finite ammunition")
        await touch_tap(page, "#menu-button")
        await touch_tap(page, "#quit-game")
        await touch_tap(page, "#new-game")
        await touch_tap(page, "#confirm-new-game")
        require("USE CONTINUE" in await page.locator("#dialogue-panel").inner_text(),
                "Phone dialogue still asks for a keyboard-only control")
        for _ in range(5):
            await touch_tap(page, "#touch-interact")
        require((await snapshot(page))["player"]["vehicleId"] == "starter-taxi",
                "Genuine touch USE did not complete onboarding and enter the taxi")
        report["checks"].append("WebKit genuine touch USE and finite-ammo LOAD fixture")


async def controller_contract(browser, url, report):
    context = await browser.new_context(viewport={"width": 1280, "height": 900})
    try:
        page = await context.new_page()
        page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        page.on("console", lambda message: report["consoleErrors"].append(message.text)
                if message.type == "error" else None)
        await page.goto(url)
        await page.wait_for_function("window.lowlight")
        await page.evaluate("""() => {
          window.qaPad = {id:'LOWLIGHT regression mock',index:0,connected:true,
            mapping:'standard',axes:[0,0,0,0],
            buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
          Object.defineProperty(navigator,'getGamepads',
            {configurable:true,value:()=>[qaPad]});
        }""")

        async def pad(index):
            await page.evaluate("i=>qaPad.buttons[i]={pressed:true,touched:true,value:1}", index)
            await page.wait_for_timeout(180)
            await page.evaluate("i=>qaPad.buttons[i]={pressed:false,touched:false,value:0}", index)
            await page.wait_for_timeout(120)

        await page.focus("#controls-button")
        await pad(0)
        require(await page.locator("#info-dialog").is_visible(), "Mock controller A did not activate a menu")
        await pad(1)
        require(not await page.locator("#info-dialog").is_visible(), "Mock controller B did not close a menu")
        await page.focus("#new-game")
        await pad(0)
        require(await page.evaluate("document.body.dataset.mode") == "play", "Mock controller A did not start play")
        await pad(9)
        require(await page.locator("#pause-dialog").is_visible(), "Mock controller Menu did not pause")
        await pad(13)
        require(await page.evaluate("document.activeElement.id") == "resume-game", "D-pad did not focus Resume")
        await pad(13)
        require(await page.evaluate("document.activeElement.id") == "pause-map", "D-pad did not focus Map")
        await pad(0)
        require(await page.locator("#map-dialog").is_visible(), "Mock controller A did not open Map")
        await pad(13)
        require(await page.evaluate("document.activeElement.id") == "city-map", "D-pad did not reach map canvas")
        await pad(15)
        await pad(0)
        require(await page.evaluate("!!lowlight.state.waypoint"), "Mock controller did not set a map waypoint")
        await pad(1)
        require(not await page.locator("#map-dialog").is_visible(), "Mock controller B did not close Map")
        await pad(9)
        await page.focus("#pause-phone")
        await pad(0)
        require(await page.locator("#info-title").inner_text() == "One missed call.",
                "Mock controller A did not open the Phone menu")
        await pad(1)
        await pad(9)
        await page.focus("#pause-settings")
        await pad(0)
        await page.focus("#volume")
        old_volume = int(await page.locator("#volume").input_value())
        await pad(15)
        require(int(await page.locator("#volume").input_value()) == min(100, old_volume + 5),
                "Mock controller could not adjust the volume slider")
        await page.focus("#weather-setting")
        old_weather = await page.locator("#weather-setting").input_value()
        await pad(15)
        require(await page.locator("#weather-setting").input_value() != old_weather,
                "Mock controller could not change a settings dropdown")
        await pad(1)
        require(not (await snapshot(page))["engineErrors"], "Engine failed during mock controller checks")
        report["checks"].append("mock getGamepads: A/B/Menu/D-pad, map, Phone and settings")
    finally:
        await context.close()


async def run_engine(playwright, name, args, output):
    report = {"engine": name, "checks": [], "pageErrors": [], "consoleErrors": [], "passed": False}
    browser = None
    context = None
    page = None
    try:
        browser = await getattr(playwright, name).launch(headless=True)
        phone = name == "webkit"
        options = playwright.devices["iPhone SE (3rd gen)"] if phone else {"viewport": {"width": 1440, "height": 900}}
        context = await browser.new_context(**options)
        page = await context.new_page()
        page.set_default_timeout(15000)
        page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        page.on("console", lambda message: report["consoleErrors"].append(message.text)
                if message.type == "error" else None)
        await page.goto(debug_url(args.url))
        await natural_flow(page, report, output, name, phone)
        await controller_contract(browser, debug_url(args.url), report)
        require(not report["pageErrors"], "Browser emitted JavaScript errors")
        require(not report["consoleErrors"], "Browser emitted console errors")
        report["passed"] = True
    except Exception as error:
        report["failure"] = str(error)
        if page:
            try:
                report["failureState"] = await snapshot(page)
                await page.screenshot(path=str(output / f"{name}-failure.png"))
            except Exception:
                pass
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
    (output / f"{name}-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{name}: {'PASS' if report['passed'] else 'FAIL'}"
          + (f" — {report['failure']}" if "failure" in report else ""), flush=True)
    return report


async def main(args):
    output = Path(args.output).resolve()
    repository = Path(__file__).resolve().parents[1]
    require(output != repository and repository not in output.parents,
            "Generated browser reports must be written outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        reports = []
        for name in (part.strip() for part in args.engines.split(",")):
            require(name in {"chromium", "webkit", "firefox"}, f"Unknown engine {name}")
            reports.append(await run_engine(playwright, name, args, output))
    result = {"url": args.url, "passed": all(report["passed"] for report in reports),
              "scope": "Genuine-input onboarding and UI regression; not a full-game playthrough.",
              "limitations": ["WebKit profile emulates iPhone; real iOS Safari is not tested.",
                              "Controllers are virtual API fixtures; physical hardware is not tested.",
                              "Reload uses a declared ammunition fixture."], "engines": reports}
    (output / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Report and screenshots: {output}", flush=True)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/", help="Running LOWLIGHT application URL")
    parser.add_argument("--engines", default="chromium,webkit,firefox", help="Comma-separated browser engines")
    parser.add_argument("--output", default="/tmp/lowlight-browser-smoke/" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
                        help="Report/screenshot directory (default: /tmp/lowlight-browser-smoke/<timestamp>)")
    sys.exit(asyncio.run(main(parser.parse_args())))
