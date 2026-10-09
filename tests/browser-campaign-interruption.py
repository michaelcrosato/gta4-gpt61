#!/usr/bin/env python3
"""Exercise real failure -> leave -> save/Continue -> explicit story recovery UI.

Every case starts with empty storage and actual New Game ferry staging. Genuine
pointer aiming and held keyboard Space attacks cause Felix's death; no actor,
health, pose, clock, mission or director field is assigned. Phone profiles use
touch for menu/recovery controls and keyboard/mouse for this combat stimulus.
This is an interruption regression, not a natural full campaign playthrough,
physical mobile combat/gamepad test or real iOS Safari verification.
"""

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright

PROFILES = {
    "chromium-ultrawide": ("chromium", {"viewport": {"width": 2560, "height": 1080}}),
    "webkit-phone": (
        "webkit",
        {
            "viewport": {"width": 375, "height": 667},
            "device_scale_factor": 2,
            "is_mobile": True,
            "has_touch": True,
        },
    ),
    "webkit-landscape": (
        "webkit",
        {
            "viewport": {"width": 667, "height": 375},
            "device_scale_factor": 2,
            "is_mobile": True,
            "has_touch": True,
        },
    ),
    "webkit-tablet": (
        "webkit",
        {
            "viewport": {"width": 820, "height": 1180},
            "device_scale_factor": 2,
            "is_mobile": True,
            "has_touch": True,
        },
    ),
    "firefox-desktop": ("firefox", {"viewport": {"width": 1440, "height": 900}}),
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def debug_url(url):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("play", None)
    query["debug"] = "1"
    return urlunsplit(parts._replace(query=urlencode(query)))


async def read(page):
    return await page.evaluate("""()=>{
      const s=lowlight.state,v=lowlight.storyView(),felix=s.companions?.actors.find(a=>a.id==='LL-CHAR-002');
      return {time:s.time,player:{x:s.player.x,y:s.player.y,z:s.player.z,health:s.player.health,
        money:s.player.money,vehicleId:s.player.vehicleId,sceneId:s.player.sceneId??null},
        felix:felix&&{health:felix.health,x:felix.x,y:felix.y,z:felix.z,phase:felix.companionPhase},
        view:v,active:s.campaign?.active&&{missionId:s.campaign.active.missionId,
          stageId:s.campaign.active.stageId,attempt:s.campaign.active.attempt,phase:s.campaign.active.phase},
        retained:s.campaign?.suspended.map(run=>({missionId:run.missionId,stageId:run.stageId,
          attempt:run.attempt,phase:run.phase,resumeInfo:run.resumeInfo,
          checkpoints:run.checkpoints.map(point=>point.id)})),
        completed:!!s.campaign?.completed?.['LL-ST-001'],wanted:s.wanted.level,
        heldFire:lowlight.game.input.down('fire'),paused:lowlight.game.paused,
        engineErrors:lowlight.game.errors.map(e=>String(e.error||e)),
        openDialog:(()=>{const d=document.querySelector('dialog[open]');return d?{id:d.id,text:d.innerText}:null})()};
    }""")


async def control_geometry(page, selector):
    item = page.locator(selector)
    await item.scroll_into_view_if_needed()
    return await item.evaluate("""e=>{
      const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {id:e.id,text:e.innerText,x:b.x,y:b.y,width:b.width,height:b.height,
        visible:!!e.getClientRects().length,hit:hit===e||e.contains(hit),
        inside:b.x>=-1&&b.y>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1};
    }""")


async def action(page, selector, phone):
    geometry = await control_geometry(page, selector)
    require(
        geometry["visible"] and geometry["hit"] and geometry["inside"],
        f"Control {selector} is not visible and reachable: {geometry}",
    )
    if phone:
        await page.touchscreen.tap(
            geometry["x"] + geometry["width"] / 2,
            geometry["y"] + geometry["height"] / 2,
        )
    else:
        await page.click(selector)
    await page.wait_for_timeout(140)
    return geometry


async def recovery_controls(page, prefix):
    result = []
    for suffix in ["retry", "restart"]:
        geometry = await control_geometry(page, f"#{prefix}-story-{suffix}")
        require(
            geometry["hit"] and geometry["inside"] and geometry["height"] >= 44,
            f"Recovery button is clipped or obstructed: {geometry}",
        )
        result.append(geometry)
    return result


async def run_case(playwright, profile, mode, args, output):
    engine, options = PROFILES[profile]
    phone = options.get("has_touch", False)
    name = f"{profile}-{mode}"
    report = {
        "profile": profile,
        "engine": engine,
        "mode": mode,
        "viewport": options["viewport"],
        "passed": False,
        "fixture": "None: actual New Game, natural ferry staging, real unarmed attacks, actual UI saves and recovery controls.",
        "inputBoundary": "Keyboard/mouse cause combat failure; touch activates phone-profile menus and recovery buttons.",
        "aimPolicy": (
            "visible body point"
            if args.body_aim
            else "feet when visible, otherwise visible body point"
        ),
        "pageErrors": [],
        "consoleErrors": [],
        "hitSamples": [],
    }
    browser = await getattr(playwright, engine).launch(headless=True)
    context = await browser.new_context(**options)
    page = await context.new_page()
    page.set_default_timeout(15000)
    page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
    page.on(
        "console",
        lambda message: (
            report["consoleErrors"].append(message.text)
            if message.type == "error"
            else None
        ),
    )
    try:
        await page.goto(debug_url(args.url))
        await page.wait_for_function("window.lowlight")
        require(
            await page.evaluate("localStorage.getItem('lowlight.save.v1')===null"),
            "The recovery case did not start with empty storage",
        )
        await action(page, "#new-game", phone)
        await page.wait_for_function(
            "lowlight.storyView()?.dialogue && !lowlight.storyView().cinematic && lowlight.state.campaignPresentation.presented",
            timeout=90000,
        )
        await action(page, "#menu-button", phone)
        await action(page, "#save-game", phone)
        baseline = await page.evaluate("localStorage.getItem('lowlight.save.v1')")
        require(bool(baseline), "The genuine healthy baseline save is missing")
        report["baselineSaveSha256"] = hashlib.sha256(baseline.encode()).hexdigest()
        report["baseline"] = await read(page)
        aim = await page.evaluate(
            """bodyAim=>{
          const actor=lowlight.state.companions.actors.find(a=>a.id==='LL-CHAR-002'),g=lowlight.game,
            canvas=document.getElementById('screen'),cv=canvas.getBoundingClientRect();
          const candidates=(bodyAim?[13,20,6]:[0,13,20,6]).map(height=>{
            const p=g.r.w(actor.x,actor.y,actor.z+height),
              x=cv.x+p[0]*cv.width/g.screen.W,y=cv.y+p[1]*cv.height/g.screen.H;
            return {x,y,height,hit:document.elementFromPoint(x,y)===canvas,
              inside:x>=0&&x<innerWidth&&y>=0&&y<innerHeight};
          });
          return {target:candidates.find(point=>point.hit&&point.inside)||null,candidates};
        }""",
            args.body_aim,
        )
        report["aim"] = aim
        require(
            aim["target"] is not None,
            "No visible character aim point is reachable through the canvas",
        )
        point = aim["target"]
        await page.mouse.move(point["x"], point["y"])
        await page.keyboard.down("Space")
        for _ in range(80):
            await page.wait_for_timeout(300)
            sample = await read(page)
            report["hitSamples"].append(
                {
                    "time": sample["time"],
                    "felixHealth": sample["felix"]["health"],
                    "playerHealth": sample["player"]["health"],
                    "failed": sample["view"]["failed"],
                }
            )
            if sample["view"]["failed"]:
                break
        await page.keyboard.up("Space")
        require(
            sample["view"]["failed"] and sample["felix"]["health"] == 0,
            "Genuine attacks did not produce companion-death failure",
        )
        await page.wait_for_function(
            "document.getElementById('info-dialog').open && document.getElementById('info-dialog').dataset.storyPanel==='failure'"
        )
        report["failed"] = await read(page)
        require(
            await page.evaluate("localStorage.getItem('lowlight.save.v1')") == baseline,
            "Active failed journey overwrote the healthy saved game",
        )
        await page.screenshot(path=str(output / f"{name}-failed.png"))
        await action(page, "#story-leave", phone)
        await action(page, "#menu-button", phone)
        left = await read(page)
        report["left"] = left
        require(
            left["active"] is None
            and len(left["retained"]) == 1
            and left["retained"][0]["resumeInfo"]["reason"] == "return-to-free-roam",
            "Return to the city lost the failed run/checkpoints",
        )
        require(
            left["felix"]["health"] == 0 and not left["completed"],
            "Leaving silently restored a checkpoint or issued completion",
        )
        epoch = left["view"]["inputEpoch"]

        await action(page, "#pause-phone", phone)
        report["phoneButtons"] = await recovery_controls(page, "phone")
        require(
            (await read(page))["felix"]["health"] == 0,
            "Opening Phone implicitly restored the world",
        )
        await action(page, "#phone-journal", phone)
        report["journalButtons"] = await recovery_controls(page, "journal")
        require(
            (await read(page))["felix"]["health"] == 0,
            "Opening Journal implicitly restored the world",
        )
        await page.screenshot(path=str(output / f"{name}-recovery-panel.png"))
        await action(page, "#info-dialog .close-dialog", phone)
        await action(page, "#menu-button", phone)
        await action(page, "#save-game", phone)
        saved = await page.evaluate(
            "JSON.parse(localStorage.getItem('lowlight.save.v1'))"
        )
        require(
            saved["state"]["campaign"]["active"] is None
            and len(saved["state"]["campaign"]["suspended"]) == 1,
            "Saving dropped retained recovery ownership",
        )
        require(
            next(
                actor
                for actor in saved["state"]["companions"]["actors"]
                if actor["id"] == "LL-CHAR-002"
            )["health"]
            == 0,
            "Saving implicitly healed the interrupted world",
        )
        await action(page, "#menu-button", phone)
        await action(page, "#quit-game", phone)
        stored = await page.evaluate("localStorage.getItem('lowlight.save.v1')")
        (output / f"{name}-interrupted-save.json").write_text(stored)
        report["interruptedSaveSha256"] = hashlib.sha256(stored.encode()).hexdigest()
        await page.reload()
        await page.wait_for_function("window.lowlight")
        await action(page, "#continue-game", phone)
        continued = await read(page)
        report["continued"] = continued
        require(
            await page.evaluate("document.body.dataset.mode==='play'"),
            "Continue rejected the actual interrupted save",
        )
        require(
            continued["active"] is None
            and continued["view"]["interrupted"]
            and continued["felix"]["health"] == 0,
            "Continue lost the recovery route or silently healed/restarted",
        )
        require(
            continued["view"]["inputEpoch"] == epoch,
            "Leaving, menus or Continue unexpectedly restored a checkpoint",
        )
        await action(page, "#menu-button", phone)
        await action(page, "#pause-phone", phone)
        prefix = "phone"
        if mode == "restart-mission":
            await action(page, "#phone-journal", phone)
            prefix = "journal"
        suffix = "restart" if mode == "restart-mission" else "retry"
        report["selectedRecovery"] = await action(
            page, f"#{prefix}-story-{suffix}", phone
        )
        await page.wait_for_function(
            "lowlight.state.campaign.active?.missionId==='LL-ST-001'", timeout=15000
        )
        restored = await read(page)
        report["restored"] = restored
        require(
            restored["active"]["phase"] == "running"
            and restored["active"]["attempt"] == left["retained"][0]["attempt"] + 1
            and not restored["retained"],
            "Explicit recovery did not atomically reclaim the retained run",
        )
        require(
            restored["felix"]["health"] == 100
            and restored["view"]["inputEpoch"] > epoch,
            "Explicit recovery did not restore the real healthy physical checkpoint",
        )
        require(
            restored["active"]["stageId"] == "berth"
            and restored["view"]["cinematic"]
            and not restored["heldFire"]
            and not restored["completed"],
            "Recovery missed ferry staging, input clearing or completion boundaries",
        )
        require(
            await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),
            "Recovery UI produced horizontal overflow",
        )
        require(
            not report["pageErrors"]
            and not report["consoleErrors"]
            and not restored["engineErrors"],
            "Browser/engine errors during recovery",
        )
        await page.screenshot(path=str(output / f"{name}-restored.png"))
        report["passed"] = True
    except (
        AssertionError,
        PlaywrightError,
        OSError,
        LookupError,
        TypeError,
        ValueError,
        RuntimeError,
    ) as error:
        report["failure"] = str(error)
        try:
            report["failureState"] = await read(page)
            await page.screenshot(path=str(output / f"{name}-failure.png"))
        except (PlaywrightError, OSError) as capture_error:
            report["captureFailure"] = str(capture_error)
    finally:
        await page.keyboard.up("Space")
        await context.close()
        await browser.close()
    (output / f"{name}-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"{name}: {'PASS' if report['passed'] else 'FAIL'}"
        + (f" — {report['failure']}" if "failure" in report else ""),
        flush=True,
    )
    return report


async def main(args):
    repository = Path(__file__).resolve().parents[1]
    source_root = Path(args.source_root).resolve() if args.source_root else repository
    output = Path(args.output).resolve()
    for protected in [repository, source_root]:
        require(
            output != protected and protected not in output.parents,
            "Generated recovery evidence must be outside the repository/candidate",
        )
    output.mkdir(parents=True, exist_ok=True)
    sources = {
        "index.html": source_root / "index.html",
        "styles.css": source_root / "styles.css",
        "my-3d2dge.js": source_root / "my-3d2dge.js",
        "harness": Path(__file__).resolve(),
        **{
            str(path.relative_to(source_root)): path
            for path in sorted((source_root / "src").rglob("*.js"))
        },
    }
    hashes = {
        name: hashlib.sha256(path.read_bytes()).hexdigest()
        for name, path in sources.items()
    }
    reports = []
    async with async_playwright() as playwright:
        for profile in args.profiles.split(","):
            require(profile in PROFILES, f"Unknown profile {profile}")
            for mode in args.modes.split(","):
                require(
                    mode in {"retry-last-checkpoint", "restart-mission"},
                    f"Unknown mode {mode}",
                )
                reports.append(await run_case(playwright, profile, mode, args, output))
    result = {
        "url": args.url,
        "sourceRoot": str(source_root),
        "passed": all(r["passed"] for r in reports),
        "scope": "Actual clean arrival/combat failure and UI interruption recovery; no full campaign or source completion claim.",
        "limitations": [
            "Mobile profiles use real touch menus but keyboard/mouse combat inputs.",
            "WebKit profiles are not real iOS Safari or physical devices.",
        ],
        "sourceHashes": hashes,
        "sourceChangesDuringRun": [
            name
            for name, path in sources.items()
            if hashlib.sha256(path.read_bytes()).hexdigest() != hashes[name]
        ],
        "cases": reports,
    }
    (output / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Recovery evidence: {output}", flush=True)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5178/")
    parser.add_argument("--source-root")
    parser.add_argument("--profiles", default=",".join(PROFILES))
    parser.add_argument("--modes", default="retry-last-checkpoint,restart-mission")
    parser.add_argument(
        "--body-aim",
        action="store_true",
        help="Require an actual visible torso/head aim point, including companion pointer picking",
    )
    parser.add_argument(
        "--output",
        default="/tmp/lowlight-campaign-interruption/"
        + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
    )
    sys.exit(asyncio.run(main(parser.parse_args())))
