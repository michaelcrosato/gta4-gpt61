#!/usr/bin/env python3
"""Exercise LOWLIGHT's browser controls with machine-installed Playwright.

Canonical New Game uses the actual Night Crossing arrival and driver approach.
A separately declared legacy save fixture preserves old Continue/onboarding UI
coverage. This is a partial-story UI regression, not a complete-game playthrough.
Natural keyboard/touch movement never teleports the player. The reload check
uses a declared ammunition fixture, and controller checks mock getGamepads;
they do not establish physical gamepad or real iOS Safari compatibility.
"""

import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
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
      story: lowlight.storyView(),
      felixHealth: lowlight.state.companions?.actors.find(a=>a.id==='LL-CHAR-002')?.health,
      openDialog: (()=>{const d=document.querySelector('dialog[open]');return d?{id:d.id,text:d.innerText}:null})(),
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


async def walk_story_route(page, points, trace):
    """Read authored approach points; movement uses ordinary browser key events."""
    held = []
    try:
        for target in points:
            began = time.monotonic()
            while True:
                move = await page.evaluate("""target => {
                  const p=lowlight.state.player,g=lowlight.game,dx=target.x-p.x,dy=target.y-p.y;
                  const choices=[[[0,-1],['w']],[[1,-1],['w','d']],[[1,0],['d']],
                    [[1,1],['s','d']],[[0,1],['s']],[[-1,1],['s','a']],
                    [[-1,0],['a']],[[-1,-1],['w','a']]].map(([v,keys])=>{
                      const direction=g.view.screenDirToGround(...v);
                      return {keys,score:(direction[0]*dx+direction[1]*dy)/Math.hypot(...direction)};
                    }).sort((a,b)=>b.score-a.score);
                  return {distance:Math.hypot(dx,dy),keys:choices[0].keys,x:p.x,y:p.y,z:p.z};
                }""", target)
                trace.append({"target": target, **move})
                if move["distance"] < 3.5:
                    break
                require(time.monotonic() - began < 35,
                        "Actual foot inputs did not reach the authored driver approach")
                if move["keys"] != held:
                    for button in held:
                        await page.keyboard.up(button)
                    held = move["keys"]
                    for button in held:
                        await page.keyboard.down(button)
                await page.wait_for_timeout(90)
            for button in held:
                await page.keyboard.up(button)
            held = []
    finally:
        for button in held:
            await page.keyboard.up(button)


async def canonical_start(page, report, output, name, phone):
    report["canonical"] = {"fixture": "None: empty storage and actual New Game inputs.", "trace": []}
    await page.wait_for_function("window.lowlight")
    require(await page.evaluate("localStorage.getItem('lowlight.save.v1')===null"),
            "Canonical start requires isolated empty storage")
    await page.click("#new-game")
    initial = await snapshot(page)
    require(initial["story"]["missionId"] == "LL-ST-001"
            and initial["story"]["stageId"] == "berth"
            and initial["mission"] is None,
            "New Game did not begin the canonical ferry arrival")
    await page.screenshot(path=str(output / f"{name}-canonical-staging.png"))
    await page.wait_for_function(
        "lowlight.storyView()?.dialogue && !document.getElementById('dialogue-panel').hidden",
        timeout=90000)
    report["canonical"]["reunion"] = await snapshot(page)
    scene_use_bounds = await page.locator("#touch-interact").bounding_box() if phone else None
    await page.screenshot(path=str(output / f"{name}-canonical-caption.png"))
    require(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),
            "Canonical arrival has horizontal overflow")
    await page.click("#menu-button")
    require(await page.evaluate("!lowlight.state.campaignPresentation.presented && document.getElementById('dialogue-panel').hidden"),
            "Paused story caption was still presented")
    await page.click("#resume-game")
    for index in range(5):
        await page.wait_for_function(
            "index=>lowlight.storyView().stageId==='berth' && lowlight.storyView().dialogueIndex===index && lowlight.state.campaignPresentation.presented && !lowlight.game.paused && !document.getElementById('dialogue-panel').hidden",
            arg=index, timeout=10000)
        if phone:
            await touch_tap(page, "#touch-interact")
        else:
            await key(page, "e")
        await page.wait_for_function(
            "index=>lowlight.storyView().stageId==='taxi' || lowlight.storyView().dialogueIndex>index",
            arg=index, timeout=5000)
    await page.wait_for_function("lowlight.storyView().stageId==='taxi'", timeout=5000)
    if phone:
        use_bounds = await page.locator("#touch-interact").bounding_box()
        require(scene_use_bounds is not None and use_bounds is not None,
                "The essential USE control disappeared during the story transition")
        require(all(abs(use_bounds[key] - scene_use_bounds[key]) <= 0.5
                    for key in ("x", "y", "width", "height")),
                "USE moved when the cinematic restored other touch actions")
        report["canonical"]["stableTouchUseBounds"] = {
            "duringScene": scene_use_bounds, "afterScene": use_bounds,
        }
    points = await page.evaluate("async()=>{const{WORLD}=await import('/src/simulation.js');return WORLD.campaignSceneBindings['pier-berth'].driverWaypoints}")
    await walk_story_route(page, points, report["canonical"]["trace"])
    if phone:
        await touch_tap(page, "#touch-interact")
    else:
        await key(page, "e")
    await page.wait_for_function("lowlight.state.player.vehicleId==='arc-arrival-taxi'", timeout=5000)
    await page.wait_for_function("lowlight.storyView().dialogue && lowlight.storyView().dialogueReady && lowlight.state.campaignPresentation.presented && !document.getElementById('dialogue-panel').hidden", timeout=20000)
    seated = await snapshot(page)
    if phone:
        await touch_tap(page, "#touch-interact")
    else:
        await key(page, "e")
    require((await snapshot(page))["player"]["vehicleId"] == "arc-arrival-taxi",
            "Caption acknowledgment exited the actual taxi")
    await page.keyboard.down("w")
    await page.wait_for_timeout(800)
    await page.keyboard.up("w")
    driven = await snapshot(page)
    require(driven["felixHealth"] == 100, "The taxi struck its own seated Felix")
    require(((driven["player"]["x"] - seated["player"]["x"]) ** 2
             + (driven["player"]["y"] - seated["player"]["y"]) ** 2) ** 0.5 > 1,
            "Actual canonical taxi acceleration did not move the car")
    await page.click("#menu-button")
    await page.click("#save-game")
    saved = await page.evaluate("JSON.parse(localStorage.getItem('lowlight.save.v1'))")
    require(saved["state"]["campaign"]["active"]["missionId"] == "LL-ST-001",
            "Ordinary save lost the active story")
    require(not saved["state"]["campaignRuntime"]["night"]["services"]["save"],
            "Ordinary save fabricated a physical shelter-save objective")
    await page.click("#menu-button")
    await page.click("#quit-game")
    await page.reload()
    await page.wait_for_function("window.lowlight")
    await page.click("#continue-game")
    continued = await snapshot(page)
    require(continued["player"]["vehicleId"] == "arc-arrival-taxi"
            and continued["story"]["missionId"] == "LL-ST-001"
            and continued["felixHealth"] == 100,
            "Canonical Continue lost the real story or occupied taxi")
    report["canonical"]["continued"] = continued
    await page.screenshot(path=str(output / f"{name}-canonical-continued.png"))
    report["checks"].append("canonical New Game: ferry staging, presented captions, actual approach/boarding, E or touch priority, driving, save and Continue")
    await page.click("#menu-button")
    await page.click("#quit-game")
    await page.evaluate("localStorage.removeItem('lowlight.save.v1')")
    await page.reload()


async def legacy_continue_fixture(page, report):
    report.setdefault("fixtures", []).append(
        "Initial legacy-mode save generated inside this browser with createSimulation(61); loaded by actual Continue. No mission progress, movement or health mutation.")
    await page.evaluate("""async()=>{
      const{createSimulation,saveGame}=await import('/src/simulation.js');
      localStorage.setItem('lowlight.save.v1',saveGame(createSimulation(61)));
    }""")
    await page.reload()
    await page.wait_for_function("window.lowlight")
    await page.click("#continue-game")
    require(await page.evaluate("!lowlight.state.campaign && lowlight.state.mission?.id==='first-shift'"),
            "Explicit legacy Continue did not restore the old opening")


async def legacy_continue_flow(page, report, output, name, phone):
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
    await legacy_continue_fixture(page, report)
    require(await page.evaluate("document.body.dataset.mode") == "play",
            "Legacy Continue did not enter play mode")
    require((await snapshot(page))["mission"]["stage"] == 0,
            "Legacy Continue did not restore the opening mission stage")

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
    await page.wait_for_function("Math.abs(lowlight.state.vehicles.find(v=>v.id===lowlight.state.player.vehicleId).speed)<10", timeout=15000)
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
        await legacy_continue_fixture(page, report)
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
        await canonical_start(page, report, output, name, phone)
        await legacy_continue_flow(page, report, output, name, phone)
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
    source_root = Path(args.source_root).resolve() if args.source_root else repository
    require(output != source_root and source_root not in output.parents,
            "Generated browser reports must be outside the tested source root")
    sources = {"index.html": source_root / "index.html", "styles.css": source_root / "styles.css",
               "my-3d2dge.js": source_root / "my-3d2dge.js",
               "tests/browser-smoke.py": Path(__file__).resolve(),
               **{str(path.relative_to(source_root)): path
                  for path in sorted((source_root / "src").rglob("*.js"))}}
    source_hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest()
                     for name, path in sources.items()}
    async with async_playwright() as playwright:
        reports = []
        for name in (part.strip() for part in args.engines.split(",")):
            require(name in {"chromium", "webkit", "firefox"}, f"Unknown engine {name}")
            reports.append(await run_engine(playwright, name, args, output))
    result = {"url": args.url, "passed": all(report["passed"] for report in reports),
              "scope": "Canonical arrival/boarding and UI inputs plus explicit legacy Continue regression; not a complete-story or full-game playthrough.",
              "limitations": ["WebKit profile emulates iPhone; real iOS Safari is not tested.",
                              "Controllers are virtual API fixtures; physical hardware is not tested.",
                              "Legacy Continue uses an initial legacy save fixture generated inside each engine.",
                              "Reload uses a declared ammunition fixture."], "engines": reports}
    result["localSourceHashes"] = source_hashes
    result["localSourceRoot"] = str(source_root)
    result["harnessPath"] = str(Path(__file__).resolve())
    result["localSourcesChangedDuringRun"] = [name for name, path in sources.items()
                                             if hashlib.sha256(path.read_bytes()).hexdigest()
                                             != source_hashes[name]]
    (output / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Report and screenshots: {output}", flush=True)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/", help="Running LOWLIGHT application URL")
    parser.add_argument("--engines", default="chromium,webkit,firefox", help="Comma-separated browser engines")
    parser.add_argument("--source-root", help="Local source root served by the tested URL, for immutable-candidate hashing")
    parser.add_argument("--output", default="/tmp/lowlight-browser-smoke/" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
                        help="Report/screenshot directory (default: /tmp/lowlight-browser-smoke/<timestamp>)")
    sys.exit(asyncio.run(main(parser.parse_args())))
