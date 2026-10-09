#!/usr/bin/env python3
"""Harbor Metro UI checks with explicitly declared platform/health/budget fixtures.

Setup clears the four onboarding jobs and relocates Mara once to an actual
physical platform with $1000 and health 100. Everything after setup uses actual
touch taps, keyboard input, native keyboard/wheel scrolling and normal simulation time. There
are no later scene/player/vehicle/clock mutations. Immediate open-door alighting
is allowed and proves UI/exit behavior, not arrival at the last requested stop.
WebKit profiles approximate Safari; no physical iPhone/finger-scroll/controller
claim is made. Reports and screenshots stay in /tmp.
"""

import argparse
import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import async_playwright

PROFILES = {
    "small-phone": ("webkit", 375, 667, True, 2),
    "landscape": ("webkit", 667, 375, True, 2),
    "tablet": ("webkit", 820, 1180, True, 2),
    "ultrawide": ("chromium", 2560, 1080, False, 1),
    "desktop": ("firefox", 1440, 900, False, 1),
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def play_url(url):
    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query))
    query.update(debug="1", play="1")
    return urlunsplit(parsed._replace(query=urlencode(query)))


def source_snapshot(source_root=None):
    root = (
        Path(source_root).resolve()
        if source_root
        else Path(__file__).resolve().parents[1]
    )
    files = [
        root / "index.html",
        root / "styles.css",
        *sorted((root / "src").rglob("*.js")),
    ]
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in files
    }


async def state_snapshot(page):
    return await page.evaluate("""() => {
          if(!window.lowlight)return null;
          const s=lowlight.state,r=s.transit?.passengers.find(p=>p.id==='mara-voss');
          const t=r?s.transit.trains.find(t=>t.id===r.trainId):null;
          return {player:{x:s.player.x,y:s.player.y,z:s.player.z,money:s.player.money,
            health:s.player.health,sceneId:s.player.sceneId,vehicleId:s.player.vehicleId},
            rider:r||null,train:t||null,time:s.transit?.time,
            engineErrors:lowlight.game.errors.map(e=>String(e.error||e))};
        }""")


async def geometry(page, selector):
    return await page.locator(selector).evaluate("""element => {
          const b=element.getBoundingClientRect();
          const clipped={left:0,top:0,right:innerWidth,bottom:innerHeight};
          for(let p=element.parentElement;p;p=p.parentElement){
            const s=getComputedStyle(p);
            if(/auto|scroll|hidden|clip/.test(s.overflowY+' '+s.overflowX)){
              const r=p.getBoundingClientRect();
              clipped.left=Math.max(clipped.left,r.left);clipped.top=Math.max(clipped.top,r.top);
              clipped.right=Math.min(clipped.right,r.right);clipped.bottom=Math.min(clipped.bottom,r.bottom);
            }
          }
          const x=b.left+b.width/2,y=b.top+b.height/2,hit=document.elementFromPoint(x,y);
          return {x:b.x,y:b.y,width:b.width,height:b.height,
            viewport:{width:innerWidth,height:innerHeight},clipped,
            fullyVisible:b.left>=clipped.left-1&&b.top>=clipped.top-1&&
              b.right<=clipped.right+1&&b.bottom<=clipped.bottom+1,
            receivesInput:hit===element||element.contains(hit),
            text:element.textContent.trim()};
        }""")


async def reveal_with_scroll(page, selector, report):
    """Use native input; mobile WebKit does not support Playwright wheel events."""
    for _ in range(24):
        box = await geometry(page, selector)
        if box["fullyVisible"] and box["receivesInput"]:
            return box
        dialog = await page.locator("dialog[open]").last.bounding_box()
        require(dialog is not None, f"No open scroller can reveal {selector}")
        center_y = box["y"] + box["height"] / 2
        sign = -1 if center_y < box["clipped"]["top"] else 1
        if report["touchTaps"] and report["engine"] == "webkit":
            # Native PageDown/PageUp scrolling keeps genuine device emulation;
            # this is disclosed mixed keyboard/touch input, not a finger swipe.
            await page.keyboard.press("PageUp" if sign < 0 else "PageDown")
            report["keyboardScrollEvents"] += 1
        else:
            await page.mouse.move(
                dialog["x"] + dialog["width"] / 2, dialog["y"] + dialog["height"] / 2
            )
            await page.mouse.wheel(0, sign * 180)
            report["wheelEvents"] += 1
        await page.wait_for_timeout(180)
    raise AssertionError(f"Native input scrolling could not reveal {selector}: {box}")


async def activate(page, selector, touch, report, reveal=True):
    box = (
        await reveal_with_scroll(page, selector, report)
        if reveal
        else await geometry(page, selector)
    )
    require(
        box["fullyVisible"],
        f"Target clips outside viewport/scroller: {selector}: {box}",
    )
    require(box["receivesInput"], f"Target center is covered: {selector}: {box}")
    require(
        box["width"] >= 24 and box["height"] >= 24,
        f"Target is too small: {selector}: {box}",
    )
    report["targets"].append({"selector": selector, **box})
    if touch:
        await page.touchscreen.tap(
            box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        )
    else:
        await page.locator(selector).click()
    await page.wait_for_timeout(180)


async def viewport_check(page, report, phase):
    result = await page.evaluate("""() => ({width:innerWidth,height:innerHeight,
          scrollWidth:document.documentElement.scrollWidth,
          overflow:document.documentElement.scrollWidth>innerWidth+1,
          dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>{
            const r=d.getBoundingClientRect();return {id:d.id,x:r.x,y:r.y,width:r.width,height:r.height,
              scrollHeight:d.scrollHeight,clientHeight:d.clientHeight};})})""")
    require(not result["overflow"], f"Horizontal overflow at {phase}: {result}")
    for dialog in result["dialogs"]:
        require(
            dialog["x"] >= -1
            and dialog["y"] >= -1
            and dialog["x"] + dialog["width"] <= result["width"] + 1
            and dialog["y"] + dialog["height"] <= result["height"] + 1,
            f"Dialog outside viewport at {phase}: {dialog}",
        )
    report["viewportChecks"].append({"phase": phase, **result})


async def check(playwright, profile, args, output):
    engine, width, height, touch, dpr = PROFILES[profile]
    browser = await getattr(playwright, engine).launch()
    options = (
        dict(
            playwright.devices[
                "iPad Pro 11" if profile == "tablet" else "iPhone SE (3rd gen)"
            ]
        )
        if touch
        else {}
    )
    options.update(
        viewport={"width": width, "height": height},
        has_touch=touch,
        device_scale_factor=dpr,
    )
    context = await browser.new_context(**options)
    page = await context.new_page()
    errors, console = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "console",
        lambda message: (
            console.append(message.text) if message.type == "error" else None
        ),
    )
    before = source_snapshot(args.source_root)
    report = {
        "profile": profile,
        "engine": engine,
        "viewport": {"width": width, "height": height, "dpr": dpr},
        "touchTaps": touch,
        "sourceRoot": (
            str(Path(args.source_root).resolve())
            if args.source_root
            else str(Path(__file__).resolve().parents[1])
        ),
        "wheelEvents": 0,
        "keyboardScrollEvents": 0,
        "targets": [],
        "viewportChecks": [],
        "checks": [],
        "sourceBefore": before,
    }
    try:
        await page.goto(play_url(args.url))
        await page.wait_for_function("window.lowlight")
        # Declared legacy-mode baseline precedes the physical platform fixture.
        await page.evaluate("""async () => { const {createSimulation,saveGame}=await import('/src/simulation.js'); lowlight.restore(saveGame(createSimulation(61))); }""")
        await page.wait_for_function("lowlight.state.transit.time > 1")
        report["fixture"] = await page.evaluate("""async () => {
              const {WORLD,MISSIONS}=await import('/src/simulation.js');
              const s=lowlight.state;s.mission=null;s.dialogue=null;
              s.progress.completed=MISSIONS.map(m=>m.id);
              const train=s.transit.trains.find(t=>['dwelling','held'].includes(t.phase));
              if(!train)throw Error('No train is dwelling at fixture setup');
              const service=WORLD.transit.throughServices.find(v=>v.id===train.serviceId),call=service.calls[train.callIndex];
              const platform=WORLD.transit.stations.flatMap(s=>s.platforms).find(p=>p.id===call.platformId);
              Object.assign(s.player,platform.boardingPoint,{groundZ:platform.z,vehicleId:null,sceneId:null,health:100,money:1000});
              lowlight.game.cam.snap=true;lowlight.refresh();
              return {type:'Legacy-mode baseline, then completed-onboarding/physical-platform/health/budget setup',
                completedOpening:s.progress.completed.slice(),budget:1000,health:100,
                trainId:train.id,call,position:platform.boardingPoint,serviceId:service.id,
                servedStops:service.calls.length,lastServedStop:service.calls.at(-1),
                servedRoles:service.calls.map(c=>{const p=WORLD.transit.stations.flatMap(s=>s.platforms).find(p=>p.id===c.platformId);
                  return {stationId:c.stationId,platformId:c.platformId,role:p.role,sourcePlatformId:p.sourcePlatformId||c.sourcePlatformId||p.id};})};
            }""")
        await page.wait_for_timeout(220)
        await viewport_check(page, report, "physical-platform")
        await page.screenshot(path=str(output / f"{profile}-platform.png"))
        if touch:
            await activate(page, "#touch-interact", touch, report, reveal=False)
        else:
            await page.keyboard.press("e")
        await page.wait_for_function(
            "lowlight.state.transit.passengers.some(p=>p.id==='mara-voss')"
        )
        require(
            await page.evaluate("lowlight.state.player.money") == 1000,
            "Boarding prematurely charged a fare",
        )
        report["checks"].append(
            "Actual USE touch/E boards at open physical doors without premature fare"
        )
        if touch:
            await activate(page, "#menu-button", touch, report, reveal=False)
            await page.wait_for_function("document.getElementById('pause-dialog').open")
            await activate(page, "#pause-phone", touch, report)
        else:
            await page.keyboard.press("t")
        await page.wait_for_function("document.getElementById('info-dialog').open")
        await viewport_check(page, report, "phone")
        await page.screenshot(path=str(output / f"{profile}-phone.png"))
        await activate(page, "#phone-metro", touch, report)
        stops = page.locator("[data-metro-stop]")
        require(
            await stops.count() == report["fixture"]["servedStops"],
            "Phone omitted served stop roles",
        )
        report["stopOptions"] = await stops.evaluate_all(
            r"""buttons => buttons.map(b=>({
          stationId:b.dataset.metroStop,platformId:b.dataset.metroPlatform,
          text:b.textContent.trim().replace(/\s+/g,' ')}))"""
        )
        labels = [option["text"] for option in report["stopOptions"]]
        require(
            len(set(labels)) == len(labels),
            f"Distinct served roles have ambiguous duplicate labels: {labels}",
        )
        require(
            len({option["platformId"] for option in report["stopOptions"]})
            == len(labels),
            "Stop roles duplicate a platform identity",
        )
        station_counts = {}
        for role in report["fixture"]["servedRoles"]:
            station_counts[role["stationId"]] = (
                station_counts.get(role["stationId"], 0) + 1
            )
        for option, role in zip(
            report["stopOptions"], report["fixture"]["servedRoles"]
        ):
            if station_counts[role["stationId"]] > 1:
                hint = role.get("role")
                if hint not in ["upper", "lower"]:
                    hint = (
                        "upper"
                        if ":upper" in role["sourcePlatformId"]
                        else "lower" if ":lower" in role["sourcePlatformId"] else None
                    )
                if hint:
                    require(
                        f"{hint} platform" in option["text"].lower(),
                        f"Repeated complex lacks its authored {hint} platform hint: {option}",
                    )
        report["checks"].append(
            "Every served role has a distinct visible label; repeated upper/lower complexes retain their authored platform hints"
        )
        last = stops.last
        selected = {
            "stationId": await last.get_attribute("data-metro-stop"),
            "platformId": await last.get_attribute("data-metro-platform"),
        }
        require(
            selected
            == {
                k: report["fixture"]["lastServedStop"][k]
                for k in ["stationId", "platformId"]
            },
            "Phone order does not end at the last served role",
        )
        last_selector = f'[data-metro-platform="{selected["platformId"]}"]'
        await reveal_with_scroll(page, last_selector, report)
        await viewport_check(page, report, "last-served-stop")
        await page.screenshot(path=str(output / f"{profile}-stops.png"))
        await activate(page, last_selector, touch, report)
        await page.wait_for_function("!document.getElementById('info-dialog').open")
        requested = await state_snapshot(page)
        require(requested["rider"] is not None, "Selecting a stop removed the rider")
        require(
            requested["rider"]["destination"]["stationId"] == selected["stationId"]
            and requested["rider"]["destination"]["platformId"]
            == selected["platformId"],
            "Actual rider did not retain requested stop",
        )
        require(
            requested["train"]["serviceId"] == report["fixture"]["serviceId"],
            "Phone rerouted train to another service",
        )
        require(
            requested["rider"]["arrivalPending"] is False,
            "Distant requested stop falsely reported arrival",
        )
        report["requestedJourney"] = requested
        report["checks"].append(
            "Real pause-phone/Metro menu, native input scroll and last served stop selection persist a pending rider destination"
        )
        await viewport_check(page, report, "requested-journey-hud")
        await page.screenshot(path=str(output / f"{profile}-requested-hud.png"))
        # Wait for real open doors; never advance the transit clock or move actors.
        await page.wait_for_function(
            """() => {const r=lowlight.state.transit.passengers.find(p=>p.id==='mara-voss');
              const t=r&&lowlight.state.transit.trains.find(t=>t.id===r.trainId);
              return t&&['dwelling','held'].includes(t.phase)&&t.doorProgress>=1-1e-7;}""",
            timeout=args.ride_timeout * 1000,
        )
        before_exit = await state_snapshot(page)
        fare = await page.evaluate(
            """async () => {const {quoteTransitFare}=await import('/src/transit.js');return quoteTransitFare(lowlight.state.transit,'mara-voss').amount;}"""
        )
        if touch:
            await activate(page, "#touch-interact", touch, report, reveal=False)
        else:
            await page.keyboard.press("e")
        await page.wait_for_function(
            "!lowlight.state.transit.passengers.some(p=>p.id==='mara-voss')"
        )
        after_exit = await state_snapshot(page)
        require(
            after_exit["player"]["money"] == 1000 - fare,
            f"Alighting fare differs from actual quote: {fare}, {after_exit}",
        )
        report["exit"] = {
            "fare": fare,
            "stopsTravelled": before_exit["rider"]["stopsTravelled"],
            "kind": (
                "immediate open-door exit"
                if before_exit["rider"]["stopsTravelled"] == 0
                else "later normal-clock open-door exit"
            ),
            "requestedFinalStopArrivalProven": False,
            "state": after_exit,
        }
        report["checks"].append(
            "Actual open-door USE/E alighting settles its real quote once; no claim of reaching final requested stop"
        )
        await viewport_check(page, report, "alighted-hud")
        await page.screenshot(path=str(output / f"{profile}-alighted.png"))
        require(
            not after_exit["engineErrors"],
            f"Engine errors: {after_exit['engineErrors']}",
        )
        require(not errors and not console, f"Browser errors: {errors}, {console}")
        report["passed"] = True
    except Exception as error:
        report.update(passed=False, error=str(error))
        try:
            report["failureState"] = await state_snapshot(page)
            await page.screenshot(path=str(output / f"{profile}-failure.png"))
        except Exception as capture_error:
            report["captureError"] = str(capture_error)
    finally:
        report.update(
            pageErrors=errors,
            consoleErrors=console,
            sourceAfter=source_snapshot(args.source_root),
        )
        report["sourceChangesDuringProfile"] = [
            path
            for path in sorted(set(before) | set(report["sourceAfter"]))
            if before.get(path) != report["sourceAfter"].get(path)
        ]
        await context.close()
        await browser.close()
    return report


async def main(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    profiles = args.profiles.split(",")
    require(all(profile in PROFILES for profile in profiles), "Unknown profile")
    results = []
    async with async_playwright() as playwright:
        for profile in profiles:
            result = await check(playwright, profile, args, output)
            results.append(result)
            (output / "report.json").write_text(
                json.dumps(
                    {
                        "url": args.url,
                        "fixtureNotice": __doc__,
                        "results": results,
                        "stableSourceAcrossProfiles": all(
                            r["sourceBefore"] == results[0]["sourceBefore"]
                            and r["sourceAfter"] == results[0]["sourceBefore"]
                            for r in results
                        ),
                    },
                    indent=2,
                )
                + "\n"
            )
            print(
                f"{profile}: {'PASS' if result['passed'] else result['error']}",
                flush=True,
            )
    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--profiles", default=",".join(PROFILES))
    parser.add_argument("--ride-timeout", type=int, default=600)
    parser.add_argument(
        "--source-root",
        help="Frozen served root to fingerprint; defaults to the working repository",
    )
    parser.add_argument(
        "--output",
        default=f"/tmp/lowlight-rail-ui/{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
    )
    raise SystemExit(asyncio.run(main(parser.parse_args())))
