#!/usr/bin/env python3
"""Interior browser controls with declared room, budget and service approach fixtures.

Venue relocation, cleared onboarding, local counter/door placement and garage
ownership fixtures precede real keyboard, pointer, touch and button actions.
This verifies shared scene controls, costs and saves; it is not a natural
campaign playthrough or a physical gamepad/iOS Safari result.
"""

import argparse
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/lowlight-interiors-browser")
URL = "http://localhost:5173/"


async def pause(page, ms=200):
    await page.wait_for_timeout(ms)


async def action(page, selector, phone):
    if phone:
        item = page.locator(selector)
        await item.scroll_into_view_if_needed()
        box = await item.bounding_box()
        await page.touchscreen.tap(
            box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        )
    else:
        await page.click(selector)
    await pause(page)


async def use(page, phone):
    if phone:
        await action(page, "#touch-interact", True)
    else:
        await page.keyboard.press("e", delay=75)
        await pause(page)


async def close(page, phone):
    if phone:
        await action(page, "dialog[open] .close-dialog", True)
    else:
        await page.keyboard.press("Escape", delay=60)
        await pause(page)


async def fixture(page, location, budget=1000, driving=False):
    data = await page.evaluate(
        """async ({location,budget,driving})=>{
  const {WORLD}=await import('/src/world.js');const {MISSIONS}=await import('/src/simulation.js');lowlight.start(false);const s=lowlight.state,anchor=WORLD.locations.find(item=>item.id===location);
  s.mission=null;s.dialogue=null;s.taxiJob=null;s.hostiles=[];s.police=[];s.policeAircraft=[];s.progress.completed=MISSIONS.map(m=>m.id);
  s.wanted.level=0;s.wanted.heat=0;s.wanted.status='clear';s.policeDispatch.reports=[];
  for(const car of s.vehicles)car.occupied=false;
  Object.assign(s.player,{x:anchor.x,y:anchor.y,z:0,groundZ:0,vz:0,vehicleId:null,health:70,money:budget,cover:null,traversal:null,fireCooldown:0,reloadRemaining:0});
  if(driving){const car=s.vehicles.find(car=>car.id==='starter-taxi');Object.assign(car,{x:anchor.x,y:anchor.y,z:0,groundZ:0,speed:0,health:50,occupied:true});s.player.vehicleId=car.id;}
  lowlight.refresh();return{location,x:anchor.x,y:anchor.y,budget,driving,completedOpeningFixture:s.progress.completed};
 }""",
        {"location": location, "budget": budget, "driving": driving},
    )
    await pause(page, 220)
    return data


async def approach(page, x, y):
    await page.evaluate(
        "({x,y})=>{Object.assign(lowlight.state.player,{x,y,z:0,groundZ:0,speed:0,vehicleId:null});lowlight.refresh();}",
        {"x": x, "y": y},
    )
    await pause(page)


async def require(page, expression, message):
    if not await page.evaluate(expression):
        raise AssertionError(message)


async def snap(page, label):
    await pause(page)
    await page.screenshot(path=str(OUT / f"{label}.png"))


async def check(p, engine, viewport, name, phone=False):
    browser = await getattr(p, engine).launch()
    context = await browser.new_context(
        viewport=viewport, has_touch=phone, is_mobile=phone
    )
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    report = {
        "engine": engine,
        "viewport": viewport,
        "phoneInput": phone,
        "fixtures": [],
        "checks": [],
    }
    try:
        await page.goto(URL + "?debug=1")
        await page.wait_for_function("window.lowlight")
        await action(page, "#new-game", phone)
        report["fixtures"].append(await fixture(page, "felix-office"))
        if not phone:
            await page.keyboard.down("w")
            await pause(page, 20)
        await use(page, phone)
        if not phone:
            await page.keyboard.up("w")
        await require(
            page,
            "lowlight.state.interior?.active?.roomId==='voss-dispatch'",
            "Real USE did not enter dispatch",
        )
        await require(
            page,
            "document.getElementById('district-name').textContent==='VOSS DISPATCH'",
            "Room name missing",
        )
        await require(
            page,
            "document.getElementById('minimap').getAttribute('aria-label').startsWith('Room plan:')",
            "Local room plan missing",
        )
        await require(
            page,
            "Math.hypot(lowlight.state.player.x-168,lowlight.state.player.y-198)<1",
            "Held movement leaked into entry",
        )
        entry_exterior = await page.evaluate(
            "({...lowlight.state.interior.active.exterior})"
        )
        report["entryExterior"] = entry_exterior
        await snap(page, name + "-dispatch")
        report["fixtures"].append(
            {
                "type": "exterior hostile at overlapping room coordinates for scene isolation",
                "x": 210,
                "y": 125,
            }
        )
        await page.evaluate(
            "()=>lowlight.state.hostiles.push({id:'qa-exterior-hostile',kind:'hostile',sceneId:null,x:210,y:125,z:0,angle:0,health:100,weapon:'pistol',speed:0,fireCooldown:100})"
        )

        async def pointer_world(x, y, z):
            return await page.evaluate(
                "({x,y,z})=>{const game=lowlight.game,s=game.screen,p=game.r.w(x,y,z),r=s.canvas.getBoundingClientRect();return{x:r.left+(s.OX-Math.round(s.fx*s.S)+p[0]*s.S)/s.dpr,y:r.top+(s.OY-Math.round(s.fy*s.S)+p[1]*s.S)/s.dpr}}",
                {"x": x, "y": y, "z": z},
            )

        if not phone:
            point = await pointer_world(210, 125, 13)
            await page.mouse.move(point["x"], point["y"])
            await pause(page)
            await require(
                page,
                "!lowlight.state.player.aimTarget",
                "Hover selected an exterior occupant from inside",
            )
            point = await pointer_world(162, 40, 13)
            await page.mouse.move(point["x"], point["y"])
            await pause(page)
            await require(
                page,
                "lowlight.state.player.aimTarget&&Math.hypot(lowlight.state.player.aimTarget.x-162,lowlight.state.player.aimTarget.y-40)<1",
                "Hover failed to target persisted room occupant",
            )
            point = await pointer_world(130, 220, 13)
            await page.mouse.move(point["x"], point["y"])
            await page.mouse.click(point["x"], point["y"])
            await pause(page, 60)
        else:
            await action(page, "#touch-fire", True)
        await require(
            page,
            "lowlight.state.player.ammo.pistol.clip<12 && lowlight.state.hostiles.find(h=>h.id==='qa-exterior-hostile').health===100 && !lowlight.state.player.aimTarget",
            "Actual attack/auto aim crossed scenes",
        )
        report["checks"].append(
            "genuine scene-filtered hover/auto aim and finite attack; exterior overlapping target untouched"
        )
        report["checks"].append(
            "real entry; room name/minimap; held-input release; native room"
        )
        before = await page.evaluate(
            "({x:lowlight.state.player.x,y:lowlight.state.player.y})"
        )
        await page.keyboard.down("w")
        await page.wait_for_function(
            "before => Math.hypot(lowlight.state.player.x-before.x,lowlight.state.player.y-before.y)>3",
            arg=before,
            timeout=15000,
        )
        await page.keyboard.up("w")
        await pause(page)
        await require(
            page,
            f"Math.hypot(lowlight.state.player.x-{before['x']},lowlight.state.player.y-{before['y']})>3",
            "Indoor keyboard movement failed",
        )
        await page.keyboard.press("m", delay=70)
        await pause(page)
        await require(
            page,
            "document.getElementById('map-dialog').open && document.querySelector('.map-instruction').textContent.includes('Routes begin at the entrance')",
            "City map entrance context missing",
        )
        await page.locator("#city-map").focus()
        await page.keyboard.press("Home")
        await page.keyboard.press("Enter")
        await pause(page)
        await require(
            page,
            "lowlight.state.waypoint && Math.hypot(lowlight.state.waypoint.x-458,lowlight.state.waypoint.y-700)<40",
            "City waypoint used local room coordinates",
        )
        await snap(page, name + "-city-map-inside")
        await close(page, phone)
        report["checks"].append(
            "city map Home/waypoint from exterior entrance; local movement"
        )
        report["fixtures"].append(
            {
                "type": "declared local service approach",
                "room": "voss-dispatch",
                "x": 112,
                "y": 105,
            }
        )
        await approach(page, 112, 105)
        await use(page, phone)
        await require(
            page,
            "document.getElementById('info-dialog').open&&document.getElementById('info-title').textContent==='Nothing comes free.'",
            "Dispatch journal hook was not routed",
        )
        await close(page, phone)
        await page.evaluate(
            "async()=>{const {setInteriorDoor}=await import('/src/interiors.js');setInteriorDoor(lowlight.state,'records-door',{open:true});}"
        )
        report["fixtures"].append(
            {
                "type": "declared refuge approach/open internal doorway",
                "x": 250,
                "y": 164,
            }
        )
        await approach(page, 250, 164)
        await use(page, phone)
        await require(
            page,
            "lowlight.state.player.health===95 && localStorage.getItem('lowlight.save.v1')",
            "Home callback/save failed",
        )
        await page.reload()
        await page.wait_for_function("window.lowlight")
        await action(page, "#continue-game", phone)
        await require(
            page,
            "lowlight.state.interior?.active?.roomId==='voss-dispatch' && lowlight.state.player.health===95",
            "Native Continue lost interior identity",
        )
        report["checks"].append(
            "journal UI; refuge rest/save; reload/Continue restores local room"
        )
        report["fixtures"].append(
            {"type": "declared door approach", "x": 168, "y": 218}
        )
        await approach(page, 168, 218)
        await use(page, phone)
        await require(
            page,
            "lowlight.state.interior.rooms['voss-dispatch'].doors['front-door'].open",
            "Real USE did not open front door",
        )
        await page.keyboard.down("s")
        await page.wait_for_function("!lowlight.state.interior.active", timeout=15000)
        await page.keyboard.up("s")
        await pause(page)
        await require(
            page,
            f"!lowlight.state.interior.active && Math.hypot(lowlight.state.player.x-{entry_exterior['x']},lowlight.state.player.y-{entry_exterior['y']})<0.001",
            "Physical door exit/input release failed",
        )
        report["checks"].append(
            "real open door and walking exit; exact exterior return/camera snap"
        )
        report["fixtures"].append(await fixture(page, "saira-shop"))
        await use(page, phone)
        await require(
            page,
            "lowlight.state.interior?.active?.roomId==='saira-garage'",
            "Garage entry failed",
        )
        report["fixtures"].append(
            {"type": "declared local parts-counter approach", "x": 300, "y": 220}
        )
        await approach(page, 300, 220)
        await use(page, phone)
        await require(
            page,
            "document.getElementById('info-dialog').open && document.querySelectorAll('[data-buy-weapon]').length===3",
            "Workshop catalogue wrong",
        )
        await require(
            page,
            "document.getElementById('info-eyebrow').textContent==='Saira’s Tools' && document.getElementById('info-content').textContent.includes('$60')",
            "Workshop name/prices wrong",
        )
        await action(page, '[data-buy-weapon="knife"]', phone)
        await action(page, '[data-buy-weapon="club"]', phone)
        await action(page, '[data-buy-weapon="street-object"]', phone)
        await action(page, '[data-buy-weapon="street-object"]', phone)
        await require(
            page,
            "lowlight.state.player.money===861 && document.querySelector('[data-buy-weapon=\"street-object\"]').textContent==='BUY' && document.querySelectorAll('[data-buy-ammo]').length===0",
            "Workshop paid repeat purchases/supply rules wrong",
        )
        await snap(page, name + "-workshop")
        await close(page, phone)
        report["checks"].append(
            "store-specific real prices/stock; repeat purchases charge twice; no fake ammo offers"
        )
        report["fixtures"].append(await fixture(page, "saira-shop", 1))
        await use(page, phone)
        await approach(page, 300, 220)
        await use(page, phone)
        await action(page, '[data-buy-weapon="knife"]', phone)
        await require(
            page,
            "lowlight.state.player.money===1 && !lowlight.state.player.ownedWeapons.includes('knife')",
            "Insufficient funds purchase changed supply",
        )
        await close(page, phone)
        report["fixtures"].append(await fixture(page, "saira-shop", 500, True))
        await use(page, phone)
        await require(
            page,
            "lowlight.state.interior?.active?.roomId==='saira-garage' && lowlight.state.player.vehicleId==='starter-taxi'",
            "Actual garage vehicle transition missing",
        )
        report["fixtures"].append(
            {"type": "declared slow service-bay approach", "x": 105, "y": 168}
        )
        await page.evaluate(
            "()=>{const s=lowlight.state,c=s.vehicles.find(c=>c.id===s.player.vehicleId);Object.assign(s.player,{x:105,y:168});Object.assign(c,{x:105,y:168,speed:0});lowlight.refresh();}"
        )
        await use(page, phone)
        await require(
            page,
            "(async()=>{const {VEHICLE_SPECS}=await import('/src/simulation.js');return lowlight.state.player.money===380 && lowlight.state.vehicles.find(car=>car.id==='starter-taxi').health===VEHICLE_SPECS.taxi.health;})()",
            "Garage repair did not use actual car/wallet",
        )
        await snap(page, name + "-garage")
        report["checks"].append(
            "actual vehicle enters garage; repair changes its health and charges $120"
        )
        for location, room, x, y, kind in [
            ("lantern-darts", "lantern-bar", 280, 130, "darts"),
            ("blue-hour-lanes", "blue-hour-lanes", 380, 390, "bowling"),
        ]:
            report["fixtures"].append(await fixture(page, location))
            await use(page, phone)
            await require(
                page,
                f"lowlight.state.interior?.active?.roomId==='{room}'",
                "Activity room entry missing",
            )
            await snap(page, name + "-" + room)
            report["fixtures"].append(
                {
                    "type": "declared local activity approach",
                    "room": room,
                    "x": x,
                    "y": y,
                }
            )
            await approach(page, x, y)
            await use(page, phone)
            await require(
                page,
                f"document.getElementById('activity-dialog').open&&lowlight.state.activitySession.kind==='{kind}'",
                "Activity hook UI did not open",
            )
            await snap(page, name + "-" + kind)
            await close(page, phone)
        report["checks"].append(
            "native darts and bowling entry; second USE opens actual activity UI"
        )
        await require(
            page,
            "document.documentElement.scrollWidth<=innerWidth",
            "Horizontal viewport overflow",
        )
        await require(page, "lowlight.game.errors.length===0", "Engine error recorded")
        if errors:
            raise AssertionError(errors)
        report["pageErrors"] = errors
        report["roomMapStats"] = await page.evaluate("lowlight.roomMapStats()")
        report["passed"] = True
    except Exception as error:
        report.update(passed=False, error=str(error), pageErrors=errors)
        report["failureState"] = await page.evaluate(
            "window.lowlight ? {player:lowlight.state.player,active:lowlight.state.interior?.active,lastExit:lowlight.state.interior?.lastExit,time:lowlight.state.time,engineErrors:lowlight.game.errors.map(e=>String(e.error||e))}:null"
        )
        await page.screenshot(path=str(OUT / f"{name}-failure.png"))
    finally:
        await browser.close()
    return report


async def main(args):
    global OUT, URL
    OUT = Path(args.output)
    OUT.mkdir(parents=True, exist_ok=True)
    URL = args.url.rstrip("/") + "/"
    report = {
        "scope": "Declared exterior venue relocation, clear jobs/wanted, local counter/door/activity approach and vehicle fixtures, followed by real keys/pointer/touch/button actions. Not a natural full campaign or real iOS Safari run.",
        "runs": [],
    }
    async with async_playwright() as p:
        for engine, viewport, name, phone in [
            ("chromium", {"width": 1440, "height": 900}, "chromium-desktop", False),
            ("firefox", {"width": 1440, "height": 900}, "firefox-desktop", False),
            ("webkit", {"width": 390, "height": 844}, "webkit-phone", True),
            ("webkit", {"width": 375, "height": 667}, "webkit-small-phone", True),
            ("webkit", {"width": 820, "height": 1180}, "webkit-tablet", True),
            ("webkit", {"width": 1920, "height": 1080}, "webkit-wide", False),
        ]:
            if engine not in args.engines.split(","):
                continue
            if args.profiles and name not in args.profiles.split(","):
                continue
            print("checking", name, flush=True)
            run = await check(p, engine, viewport, name, phone)
            report["runs"].append(run)
            (OUT / "report.json").write_text(json.dumps(report, indent=2))
            print(
                "PASS" if run["passed"] else "FAIL",
                name,
                len(run["checks"]),
                run.get("error", ""),
                flush=True,
            )
    print("Report:", OUT / "report.json")
    return 0 if report["runs"] and all(run["passed"] for run in report["runs"]) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--output", default="/tmp/lowlight-interiors-browser")
    parser.add_argument("--engines", default="chromium,firefox,webkit")
    parser.add_argument(
        "--profiles", default="", help="Optional comma-separated profile names"
    )
    raise SystemExit(asyncio.run(main(parser.parse_args())))
