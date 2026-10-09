#!/usr/bin/env python3
"""Real rail UI/ride checks with a declared physical-platform relocation fixture.

The fixture clears onboarding and relocates to a real platform. Boarding,
journey choice, travel, saves/Continue and alighting then use actual browser
inputs and normal clock advancement. This is not a clean-save city journey.
"""

import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def check(playwright, engine, args, output):
    browser = await getattr(playwright, engine).launch()
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    report = {
        "engine": engine,
        "fixture": "Legacy-mode completed-onboarding physical-platform relocation",
        "checks": [],
    }
    try:
        await page.goto(args.url + "?debug=1&play=1")
        await page.wait_for_function("window.lowlight")
        # Declared legacy-mode baseline precedes the physical platform fixture.
        await page.evaluate("""async () => { const {createSimulation,saveGame}=await import('/src/simulation.js'); lowlight.restore(saveGame(createSimulation(61))); }""")
        await page.wait_for_function("lowlight.state.transit.time > 1")
        report["platform"] = await page.evaluate("""async () => {
          const {WORLD,MISSIONS}=await import('/src/simulation.js');
          const s=lowlight.state;s.mission=null;s.dialogue=null;s.progress.completed=MISSIONS.map(m=>m.id);
          const train=s.transit.trains.find(t=>t.phase==='dwelling'||t.phase==='held');
          if(!train)throw Error('No platform train is dwelling');
          const service=WORLD.transit.throughServices.find(v=>v.id===train.serviceId),call=service.calls[train.callIndex];
          const platform=WORLD.transit.stations.flatMap(s=>s.platforms).find(p=>p.id===call.platformId);
          Object.assign(s.player,platform.boardingPoint,{groundZ:platform.z,vehicleId:null,sceneId:null,health:100,money:1000});
          lowlight.game.cam.snap=true;lowlight.refresh();return {trainId:train.id,visits:train.visits,call,position:platform.boardingPoint};
        }""")
        await page.wait_for_timeout(250)
        await page.keyboard.press("e")
        await page.wait_for_function(
            "lowlight.state.transit.passengers.some(p=>p.id==='mara-voss')"
        )
        assert await page.evaluate("lowlight.state.player.money") == 1000
        report["checks"].append(
            "Real E boarding at physical open doors; no premature fare"
        )
        await page.keyboard.press("t")
        await page.locator("#phone-metro").click()
        await page.locator("[data-metro-stop]").nth(1).click()
        await page.wait_for_function("!document.getElementById('info-dialog').open")
        report["checks"].append(
            "Phone selects a served destination through the real route menu"
        )
        start = await page.evaluate(
            "({x:lowlight.state.player.x,y:lowlight.state.player.y})"
        )
        await page.wait_for_function(
            """() => {
          const rider=lowlight.state.transit.passengers.find(p=>p.id==='mara-voss');
          const train=lowlight.state.transit.trains.find(t=>t.id===rider.trainId);return train.speed>1;
        }""",
            timeout=360000,
        )
        await page.wait_for_function(
            "start => (lowlight.state.player.x-start.x)**2 + (lowlight.state.player.y-start.y)**2 > 100",
            arg=start,
            timeout=60000,
        )
        moved = await page.evaluate(
            "({x:lowlight.state.player.x,y:lowlight.state.player.y})"
        )
        assert (moved["x"] - start["x"]) ** 2 + (moved["y"] - start["y"]) ** 2 > 100
        await page.screenshot(path=str(output / f"{engine}-moving.png"))
        await page.keyboard.press("Escape")
        await page.locator("#save-game").click()
        await page.wait_for_timeout(200)
        await page.goto(args.url + "?debug=1")
        await page.wait_for_function("window.lowlight")
        await page.locator("#continue-game").click()
        await page.wait_for_function(
            "lowlight.state.transit.passengers.some(p=>p.id==='mara-voss')"
        )
        report["checks"].append(
            "Normal movement and manual save/Continue preserve actual rider and fleet"
        )
        await page.wait_for_function(
            """() => {
          const s=lowlight.state,r=s.transit.passengers.find(p=>p.id==='mara-voss');if(!r)return false;
          const t=s.transit.trains.find(t=>t.id===r.trainId);return t.visits>r.boardedVisits&&['dwelling','held'].includes(t.phase)&&t.doorProgress===1;
        }""",
            timeout=600000,
        )
        await page.keyboard.press("e")
        await page.wait_for_function(
            "!lowlight.state.transit.passengers.some(p=>p.id==='mara-voss')"
        )
        assert await page.evaluate("lowlight.state.player.money") == 998
        assert await page.evaluate("lowlight.game.errors.length") == 0
        assert not errors
        await page.screenshot(path=str(output / f"{engine}-alighted.png"))
        report["checks"].append(
            "Real alighting at a later open platform settles the disclosed $2 fare exactly once"
        )
        report["passed"] = True
    except Exception as error:
        report.update(passed=False, error=str(error), pageErrors=errors)
        report["state"] = await page.evaluate(
            "window.lowlight ? {player:lowlight.state.player,trains:lowlight.state.transit?.trains,signals:lowlight.state.railSignals,engineErrors:lowlight.game.errors.map(e=>String(e.error||e))}:null"
        )
        await page.screenshot(path=str(output / f"{engine}-failure.png"))
    finally:
        await context.close()
        await browser.close()
    return report


async def main(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        results = []
        for engine in args.engines.split(","):
            result = await check(playwright, engine, args, output)
            results.append(result)
            (output / "report.json").write_text(
                json.dumps({"fixtureNotice": __doc__, "results": results}, indent=2)
                + "\n"
            )
            print(
                f"{engine}: {'PASS' if result['passed'] else result['error']}",
                flush=True,
            )
    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--engines", default="chromium,webkit,firefox")
    parser.add_argument("--output", default="/tmp/lowlight-rail-journey")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
