#!/usr/bin/env python3
"""UI activity/shop/traversal checks using explicitly declared setup fixtures.

The tests relocate the player to venues and clear the introductory assignment.
Late-turn darts/pool/arcade fixtures isolate finishing/bust/overflow behavior.
They are not clean-save matches or a full-game playthrough. After setup, all
actions use browser buttons, keys, pointer or touch, never simulation helpers.
"""

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import async_playwright


def require(value, message):
    if not value:
        raise AssertionError(message)


def app_url(url):
    p = urlsplit(url)
    q = dict(parse_qsl(p.query))
    q.pop("play", None)
    q["debug"] = "1"
    return urlunsplit(p._replace(query=urlencode(q)))


async def key(page, value):
    await page.keyboard.press(value, delay=85)
    await page.wait_for_timeout(140)


async def click(page, selector, phone=False):
    item = page.locator(selector)
    if phone:
        await item.scroll_into_view_if_needed()
        box = await item.bounding_box()
        require(box is not None, f"Missing visible touch control {selector}")
        await page.touchscreen.tap(box["x"] + box["width"] / 2,
                                  box["y"] + box["height"] / 2)
    else:
        await item.click()


async def set_range(page, selector, wanted):
    item = page.locator(selector)
    current = float(await item.input_value())
    step = float(await item.get_attribute("step") or 1)
    count = round(abs(wanted - current) / step)
    require(count <= 200, f"Range adjustment too large for {selector}")
    for _ in range(count):
        await item.press("ArrowRight" if wanted > current else "ArrowLeft")
    require(abs(float(await item.input_value()) - wanted) < .001,
            f"Native keyboard did not set {selector} to {wanted}")


async def board_point(page, x, y, phone):
    board = page.locator("#activity-board")
    await board.scroll_into_view_if_needed()
    box = await board.bounding_box()
    require(box is not None, "Activity board is not visible")
    px, py = box["x"] + x / 640 * box["width"], box["y"] + y / 380 * box["height"]
    if phone:
        await page.touchscreen.tap(px, py)
    else:
        await page.mouse.click(px, py)


async def model(page):
    return await page.evaluate("lowlight.state.activitySession?.session || null")


async def settled_screenshot(page, output, filename):
    await page.wait_for_timeout(220)
    await page.screenshot(path=str(output / filename))


async def money(page):
    return await page.evaluate("lowlight.state.player.money")


async def cleanup(page, phone):
    for selector in ["#activity-dialog", "#info-dialog", "#map-dialog", "#pause-dialog"]:
        if await page.locator(selector).is_visible():
            await click(page, selector + " .close-dialog", phone)
            await page.wait_for_timeout(200)


async def venue_fixture(page, kind, report, budget=1000):
    data = await page.evaluate("""async ({kind,budget}) => {
      const {WORLD} = await import('/src/world.js');
      const venue = WORLD.locations.find(location => location.activity === kind);
      if (!venue) throw Error('Missing WORLD activity '+kind);
      const s = lowlight.state;
      s.mission=null; s.dialogue=null; s.taxiJob=null; s.hostiles=[]; s.police=[];
      s.wanted.level=0; s.wanted.heat=0; s.wanted.status='clear';
      for(const vehicle of s.vehicles) vehicle.occupied=false;
      Object.assign(s.player,{x:venue.x,y:venue.y,vehicleId:null,z:0,vz:0,
        traversal:null,cover:null,crouching:false,health:100,money:budget});
      return {kind,venue:venue.id,x:venue.x,y:venue.y,budget};
    }""", {"kind": kind, "budget": budget})
    report["fixtures"].append({"type": "venue relocation and introductory-job clearing", **data})
    await page.wait_for_timeout(180)


async def open_activity(page, kind, report, phone, budget=1000):
    await cleanup(page, phone)
    await venue_fixture(page, kind, report, budget)
    before = await money(page)
    fee = {"bowling": 10, "darts": 0, "pool": 20, "arcade": 2}[kind]
    prompt_price = f"${fee}" if fee else "Free"
    await page.wait_for_function("price=>document.querySelector('#context-text')?.textContent.includes(price)", arg=prompt_price)
    await key(page, "e")
    await page.locator("#activity-dialog").wait_for(state="visible")
    require(await money(page) == before - fee, f"{kind} did not charge its disclosed entry fee")
    require(await page.locator("#cash").inner_text() == f"${before-fee:,.0f}", "HUD cash did not update when the entry fee was charged")
    require((f"${fee} ENTRY" if fee else "FREE ENTRY") in await page.locator("#activity-eyebrow").inner_text(), "Activity dialog did not disclose its entry price")
    require((await model(page))["kind"] == kind, f"Venue opened the wrong activity for {kind}")
    return before - fee


async def close_activity(page, phone):
    await click(page, "#activity-dialog .close-dialog", phone)
    await page.wait_for_function("!lowlight.state.activitySession")


async def bowling_case(page, report, output, name, phone):
    await cleanup(page, phone)
    await venue_fixture(page, "bowling", report, 1)
    await key(page, "e")
    require(not await page.locator("#activity-dialog").is_visible(), "Bowling admitted an unaffordable entry")
    require(await money(page) == 1, "Rejected bowling entry still charged money")
    charged = await open_activity(page, "bowling", report, phone)
    await set_range(page, "#lane-position", 20)
    await set_range(page, "#lane-aim", 5)
    await set_range(page, "#shot-power", 85)
    await set_range(page, "#shot-spin", -15)
    aim = (await model(page))["aim"]
    require(aim == {"position": .2, "direction": .05, "power": .85, "spin": -.15}, "Bowling range controls did not update the live aim")
    await set_range(page, "#lane-position", 0)
    await set_range(page, "#shot-spin", 0)
    await settled_screenshot(page, output, f"{name}-bowling.png")
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.ball?.y > 3")
    require((await model(page))["phase"] == "rolling", "Bowling button did not launch actual ball physics")
    await page.wait_for_function("lowlight.state.activitySession?.session.players[0].rolls.length > 0")
    rolled = await model(page)
    require(rolled["players"][0]["rolls"][0] == 10, "A physical pocket roll did not knock down the ten pins")
    await page.wait_for_function("document.querySelector('#activity-score .scorecard-player small')?.textContent==='X'")
    require(len(rolled["players"][0]["frames"]) == 10, "Bowling session has fewer than ten frames")
    require(await money(page) == charged, "An incomplete bowling frame was rewarded as a match win")
    await close_activity(page, phone)
    require(await money(page) == charged, "Aborting bowling paid a win reward")
    report["checks"].append("bowling fees, native stance/aim/power/spin, physical ten-pin strike, ten frames and abort")


async def saved_bowling_case(page, context, report, output, name, phone):
    charged = await open_activity(page, "bowling", report, phone)
    await set_range(page, "#shot-power", 20)
    await set_range(page, "#lane-aim", 0)
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.ball?.y > 3")
    # Headless browser pages remain focused/visible when opening another tab.
    # Verify the real automatic snapshot instead of synthesizing blur events.
    await page.wait_for_function("""() => {
      const saved=JSON.parse(localStorage.getItem('lowlight.save.v1'))?.state.activitySession;
      return saved?.session.phase==='rolling' && saved.session.ball?.y>3;
    }""")
    saved = await page.evaluate("JSON.parse(localStorage.getItem('lowlight.save.v1')).state.activitySession")
    require(saved is not None and saved["session"]["phase"] == "rolling"
            and saved["session"]["ball"]["y"] > 3,
            "Automatic activity save did not capture a moving ball")
    report["savedActivity"] = {"kind": saved["kind"], "phase": saved["session"]["phase"],
                               "ballY": saved["session"]["ball"]["y"], "paused": saved["session"]["paused"]}
    await page.reload()
    await page.wait_for_function("window.lowlight")
    await click(page, "#continue-game", phone)
    await page.locator("#activity-dialog").wait_for(state="visible")
    restored = await model(page)
    require(restored["kind"] == "bowling" and restored["phase"] == "rolling", "Continue lost the active bowling phase")
    require(restored["ball"]["y"] >= saved["session"]["ball"]["y"] - .01, "Continue reset the moving ball to its release point")
    require(await money(page) == charged, "Continuing an activity charged its entry fee twice")
    await settled_screenshot(page, output, f"{name}-bowling-restored.png")
    await close_activity(page, phone)
    report["checks"].append("real automatic snapshot and Continue restoring mid-roll activity without duplicate fees")


async def darts_case(page, report, output, name, phone):
    charged = await open_activity(page, "darts", report, phone)
    await page.locator("#dart-steady").check()
    await board_point(page, 320, 187 - 143 * 103 / 170, phone)
    for _ in range(3):
        await click(page, "#activity-launch", phone)
        await page.wait_for_function("!lowlight.state.activitySession?.session.flight")
    played = await model(page)
    require(played["players"][0]["remaining"] == 121 and played["players"][0]["highestTurn"] == 180,
            "Three real board-targeted triple twenties did not score a 180 turn")
    await page.wait_for_function("document.querySelector('#activity-score .activity-player b')?.textContent==='121'")
    await page.evaluate("""() => {
      const m=lowlight.state.activitySession.session;
      m.currentPlayer=0; m.phase='aim'; m.flight=null; m.players[0].remaining=50;
      m.turnStart=50; m.throwsInTurn=0; m.turnDarts=[]; m.aiWait=2;
    }""")
    report["fixtures"].append({"type": "darts bust turn", "remaining": 50, "currentPlayer": 0})
    await page.wait_for_timeout(180)
    await board_point(page, 320, 187 - 143 * .35, phone)
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("!lowlight.state.activitySession?.session.flight")
    require((await model(page))["players"][0]["remaining"] == 30, "Single twenty was mis-scored")
    await board_point(page, 320, 187 - 143 * 103 / 170, phone)
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.players[0].busts > 0")
    require((await model(page))["players"][0]["remaining"] == 50, "Bust failed to restore the whole turn")
    await page.wait_for_function("document.querySelector('#activity-score .activity-player b')?.textContent==='50'")
    await page.evaluate("""() => {
      const m=lowlight.state.activitySession.session;
      m.currentPlayer=0; m.phase='aim'; m.flight=null; m.players[0].remaining=40;
      m.turnStart=40; m.throwsInTurn=0; m.turnDarts=[]; m.aiWait=2;
    }""")
    report["fixtures"].append({"type": "darts last-turn checkout", "remaining": 40, "currentPlayer": 0})
    await page.wait_for_timeout(180)
    await board_point(page, 320, 187 - 143 * 166 / 170, phone)
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.finished")
    require((await model(page))["result"]["winner"] == 0, "A real double twenty did not finish the declared forty-point fixture")
    await page.wait_for_function("document.querySelector('#activity-score .activity-player b')?.textContent==='0'")
    await page.locator("#activity-done").wait_for(state="visible")
    require(await money(page) == charged, "Darts paid an undeclared win reward")
    await settled_screenshot(page, output, f"{name}-darts-checkout.png")
    await click(page, "#activity-done", phone)
    await page.wait_for_function("!lowlight.state.activitySession")
    report["checks"].append("board-directed dart flights, 180 turn, bust rollback and disclosed double-out fixture")


async def pool_case(page, report, output, name, phone):
    charged = await open_activity(page, "pool", report, phone)
    await set_range(page, "#shot-power", 96)
    await set_range(page, "#shot-spin", 10)
    await set_range(page, "#cue-elevation", 5)
    require((await model(page))["aim"]["spin"] == .1 and (await model(page))["aim"]["elevation"] == .05,
            "Pool spin/elevation controls did not update live state")
    await set_range(page, "#shot-spin", 0)
    await set_range(page, "#cue-elevation", 0)
    initial = (await model(page))["balls"]
    await board_point(page, 45 + 550 * 1.8 / 2.24, 58 + 275 * .56 / 1.12, phone)
    await settled_screenshot(page, output, f"{name}-pool.png")
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("!!lowlight.state.activitySession?.session.shot && lowlight.state.activitySession.session.shot.firstHit !== null")
    await page.wait_for_function("""before => lowlight.state.activitySession.session.balls.some((b,i) =>
      b.number && Math.abs(b.x-before[i].x)+Math.abs(b.y-before[i].y)>.01)
    """, arg=initial)
    rolling = await model(page)
    require(rolling["shot"]["firstHit"] == 1, "Real pool break did not contact the rack's head ball")
    require(any(abs(b["x"] - initial[i]["x"]) + abs(b["y"] - initial[i]["y"]) > .01
                for i, b in enumerate(rolling["balls"]) if b["number"]), "The pool rack never moved physically")
    await close_activity(page, phone)
    require(await money(page) == charged, "Aborting pool paid a fabricated win reward")
    charged = await open_activity(page, "pool", report, phone)
    await page.evaluate("""() => {
      const m=lowlight.state.activitySession.session;
      m.phase='place-cue';m.ballInHand=true;
      Object.assign(m.balls.find(b=>b.id===0),{pocketed:true,vx:0,vy:0,vz:0,z:0});
    }""")
    report["fixtures"].append({"type": "pool ball-in-hand pointer-placement boundary", "currentPlayer": 0})
    await page.wait_for_timeout(180)
    require(await page.locator("#activity-launch").is_disabled(), "Pool permitted a shot before cue-ball placement")
    await board_point(page, 45 + 550 * .35 / 2.24, 58 + 275 * .35 / 1.12, phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.phase==='aim' && !lowlight.state.activitySession.session.ballInHand")
    placed = next(b for b in (await model(page))["balls"] if b["number"] == 0)
    require(abs(placed["x"]-.35) < .015 and abs(placed["y"]-.35) < .015 and not placed["pocketed"],
            "Genuine table pointer/touch did not place the cue ball at the selected legal spot")
    await page.evaluate("""() => {
      const m=lowlight.state.activitySession.session;
      m.breaking=false; m.groups=['solid','stripe']; m.players[0].group='solid'; m.players[1].group='stripe';
      for(const b of m.balls) {b.pocketed=![0,8,9].includes(b.id); b.offTable=false; b.vx=b.vy=b.vz=b.z=0;}
      Object.assign(m.balls.find(b=>b.id===0),{x:1.12,y:.75});
      Object.assign(m.balls.find(b=>b.id===8),{x:1.12,y:.30});
      Object.assign(m.balls.find(b=>b.id===9),{x:.35,y:.35});
    }""")
    report["fixtures"].append({"type": "pool last-eight shot", "group": "solid", "ownBallsRemaining": 0})
    await set_range(page, "#shot-power", 28)
    await board_point(page, 320, 58 + 275 * .30 / 1.12, phone)
    await click(page, "#activity-launch", phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.finished")
    require((await model(page))["result"]["winner"] == 0, "Physical legal eight-ball shot did not win the declared fixture")
    await page.wait_for_function("lowlight.state.activitySession?.recorded")
    require(await money(page) == charged + 40, "Pool win reward did not match the earned forty-dollar payout")
    require(await page.locator("#cash").inner_text() == f"${charged+40:,.0f}", "HUD cash did not update on earned pool payout")
    await settled_screenshot(page, output, f"{name}-pool-win.png")
    await click(page, "#activity-done", phone)
    await page.wait_for_function("!lowlight.state.activitySession")
    require(await money(page) == charged + 40, "Closing a completed pool game paid the reward twice")
    report["checks"].append("pool fee, live power/spin/elevation, actual rack break, abort, pointer cue placement and disclosed legal-eight reward")


async def arcade_case(page, report, output, name, phone):
    charged = await open_activity(page, "arcade", report, phone)
    await page.focus("#activity-board")
    await key(page, "ArrowLeft")
    require((await model(page))["current"]["x"] == 1, "Arcade keyboard did not move the falling piece")
    await key(page, "ArrowUp")
    require((await model(page))["current"]["rotation"] == 1, "Arcade keyboard did not rotate the pair")
    await click(page, '[data-action="drop"]', phone)
    played = await model(page)
    require(played["stats"]["pairsPlaced"] == 1 and played["score"] > 0,
            "Arcade DROP did not place real cells and earn drop points")
    require(sum(c is not None for row in played["grid"] for c in row) == 2, "Arcade did not place the pair on its board")
    await settled_screenshot(page, output, f"{name}-arcade.png")
    await page.evaluate("""() => {
      const m=lowlight.state.activitySession.session;
      for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)m.grid[y][x]=y===0?null:(x+y)%3;
      m.current={x:2,y:0,rotation:0,colors:[0,1]}; m.phase='falling';m.fallElapsed=0;
    }""")
    report["fixtures"].append({"type": "arcade near-overflow board", "occupiedRows": 11, "freeTopRows": 1})
    await click(page, '[data-action="drop"]', phone)
    await page.wait_for_function("lowlight.state.activitySession?.session.finished")
    require((await model(page))["result"]["outcome"] == "loss", "Overflow was falsely declared a cabinet win")
    require(await money(page) == charged, "Arcade overflow paid a win reward")
    await click(page, "#activity-done", phone)
    await page.wait_for_function("!lowlight.state.activitySession")
    require(await page.evaluate("lowlight.state.progress.arcadeBest || 0") >= played["score"], "Earned arcade points were discarded on loss")
    report["checks"].append("arcade genuine left/rotation/drop/score and disclosed overflow fixture")


async def shop_and_traversal_case(page, report, output, name, phone):
    await cleanup(page, phone)
    catalog = await page.evaluate("""async () => {
      const {WEAPONS,SHOP_WEAPONS}=await import('/src/combat.js');
      const {WORLD}=await import('/src/world.js');const s=lowlight.state;
      const shop=WORLD.locations.find(location=>location.type==='weapons');
      s.mission=null;s.dialogue=null;s.taxiJob=null;s.wanted.level=0;s.hostiles=[];s.police=[];
      Object.assign(s.player,{x:shop.x,y:shop.y,vehicleId:null,z:0,vz:0,traversal:null,cover:null,health:100,money:100000});
      return {position:{x:shop.x,y:shop.y,id:shop.id},weapons:SHOP_WEAPONS.map(id=>({id,cost:WEAPONS[id].cost,owned:s.player.ownedWeapons.includes(id)}))};
    }""")
    report["fixtures"].append({"type": "Rook shop and purchase budget", **catalog["position"], "budget": 100000})
    report["shopInteractionBeforeE"] = await page.evaluate("""async () => {
      const {nearestInteractable}=await import('/src/simulation.js');
      const candidate=nearestInteractable(lowlight.state);
      return candidate && {type:candidate.type,id:candidate.id,distance:candidate.distance};
    }""")
    await key(page, "e")
    require(await page.evaluate("!lowlight.state.player.vehicleId"),
            "E at the exact shop marker entered a nearby vehicle instead of opening the store")
    await page.locator("#info-dialog").wait_for(state="visible")
    require(await page.locator("[data-buy-weapon]").count() == 15, "Shop omitted a registered purchasable/equippable weapon")
    purchases = [w for w in catalog["weapons"] if not w["owned"]]
    require(len(purchases) == 14, "Fixture should begin with fourteen new shop weapons")
    for weapon in purchases:
        old_money = await money(page)
        await click(page, f'[data-buy-weapon="{weapon["id"]}"]', phone)
        require(await money(page) == old_money - weapon["cost"], f"Wrong purchase charge for {weapon['id']}")
        require(await page.evaluate("id=>lowlight.state.player.ownedWeapons.includes(id)", weapon["id"]),
                f"Bought weapon {weapon['id']} was not retained as owned")
        require(await page.evaluate("lowlight.state.player.weapon") == weapon["id"], f"Bought weapon {weapon['id']} was not equipped")
    old_money = await money(page)
    await click(page, '[data-buy-weapon="shotgun"]', phone)
    require(await money(page) == old_money, "Re-equipping an owned weapon charged its purchase price again")
    require(await page.evaluate("lowlight.state.player.weapon") == "shotgun", "Owned shotgun did not re-equip")
    await settled_screenshot(page, output, f"{name}-weapon-shop.png")
    await key(page, "Escape")
    await page.evaluate("""() => {
      const p=lowlight.state.player;Object.assign(p,{x:1080,y:700,z:0,vz:0,angle:Math.PI/2,traversal:null,cover:null,crouching:false,stamina:100});
    }""")
    report["fixtures"].append({"type": "open-street jump/crouch", "x": 1080, "y": 700})
    await key(page, "j")
    require(await page.evaluate("lowlight.state.player.z > 2"), "Genuine J input did not start vertical jumping physics")
    await page.wait_for_function("lowlight.state.player.z===0 && !lowlight.state.player.traversal")
    await page.keyboard.down("Control")
    await page.wait_for_timeout(200)
    require(await page.evaluate("lowlight.state.player.crouching"), "Holding Ctrl did not crouch")
    await page.keyboard.up("Control")
    await page.wait_for_function("!lowlight.state.player.crouching")
    building = await page.evaluate("""async () => {
      const {WORLD}=await import('/src/world.js');const b=WORLD.buildings[0];
      Object.assign(lowlight.state.player,{x:b.x-10,y:b.y+b.h/2,angle:0,z:0,vz:0,cover:null,traversal:null});return b.id;
    }""")
    report["fixtures"].append({"type": "wall-cover approach", "building": building})
    await key(page, "c")
    require(await page.evaluate("id=>lowlight.state.player.cover?.buildingId===id", building), "Genuine C input did not attach to the fixture wall")
    await key(page, "c")
    require(await page.evaluate("!lowlight.state.player.cover"), "Second C press did not leave cover")
    report["checks"].append("fourteen genuine shop purchases, owned re-equip, J jump, Ctrl crouch and C wall cover")


async def run_engine(p, name, args, output):
    report = {"engine": name, "fixtures": [], "checks": [], "failures": [], "pageErrors": [], "consoleErrors": []}
    browser = await getattr(p, name).launch(headless=True)
    phone = name == "webkit"
    opts = p.devices['iPhone SE (3rd gen)'] if phone else {"viewport": {"width": 1440, "height": 900}}
    context = await browser.new_context(**opts)
    page = await context.new_page()
    page.set_default_timeout(20000)
    page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
    page.on("console", lambda message: report["consoleErrors"].append(message.text) if message.type == "error" else None)
    try:
        await page.goto(app_url(args.url))
        await page.wait_for_function("window.lowlight")
        await click(page, "#new-game", phone)
        cases = [("bowling", bowling_case), ("saved-bowling", saved_bowling_case), ("darts", darts_case),
                 ("pool", pool_case), ("arcade", arcade_case), ("shop-and-traversal", shop_and_traversal_case)]
        if args.cases:
            requested = {item.strip() for item in args.cases.split(',')}
            require(requested <= {label for label, _ in cases}, "Unknown case in --cases")
            cases = [(label, case) for label, case in cases if label in requested]
        for label, case in cases:
            try:
                if label == "saved-bowling":
                    await case(page, context, report, output, name, phone)
                else:
                    await case(page, report, output, name, phone)
                print(f"{name}/{label}: PASS", flush=True)
            except Exception as error:
                report["failures"].append({"case": label, "error": str(error)})
                try:
                    report["failures"][-1]["activity"] = await model(page)
                    report["failures"][-1]["world"] = await page.evaluate("({player:lowlight.state.player,wanted:lowlight.state.wanted,paused:lowlight.game.paused,time:lowlight.state.time,focus:document.activeElement.id})")
                    await page.screenshot(path=str(output / f"{name}-{label}-failure.png"))
                    await cleanup(page, phone)
                    if await page.evaluate("document.body.dataset.mode") == "title":
                        await click(page, "#new-game", phone)
                        if await page.locator("#confirm-new-game").is_visible():
                            await click(page, "#confirm-new-game", phone)
                except Exception:
                    pass
                print(f"{name}/{label}: FAIL — {error}", flush=True)
        report["engineErrors"] = await page.evaluate("lowlight.game.errors.map(error=>String(error.error||error))")
        require(not report["pageErrors"] and not report["consoleErrors"] and not report["engineErrors"], "Browser or renderer reported errors")
    except Exception as error:
        report["failures"].append({"case": "startup-or-console", "error": str(error)})
    finally:
        await context.close()
        await browser.close()
    report["passed"] = not report["failures"]
    (output / f"{name}-report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


async def main(args):
    output = Path(args.output).resolve()
    repository = Path(__file__).resolve().parents[1]
    require(output != repository and repository not in output.parents, "Reports must be written outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        reports = []
        for name in (item.strip() for item in args.engines.split(",")):
            require(name in {"chromium", "webkit", "firefox"}, f"Unknown browser engine {name}")
            reports.append(await run_engine(p, name, args, output))
    result = {"passed": all(r["passed"] for r in reports), "url": args.url,
              "requestedCases": args.cases or "all",
              "scope": "Declared venue and last-phase fixtures followed by genuine browser gameplay actions; not clean-save matches or a full-game playthrough.",
              "limitations": ["WebKit uses an iPhone profile; physical iOS Safari is not tested.", "Venue relocation, budgets and last-phase fixtures are listed in each report."],
              "engines": reports}
    (output / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Activity reports and screenshots: {output}", flush=True)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--engines", default="chromium,webkit,firefox")
    parser.add_argument("--cases", help="Optional comma-separated case names for targeted rechecks")
    parser.add_argument("--output", default="/tmp/lowlight-activities-qa/" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    sys.exit(asyncio.run(main(parser.parse_args())))
