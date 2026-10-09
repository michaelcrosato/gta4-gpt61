#!/usr/bin/env python3
"""Late Meter warning UI from declared, production-generated input saves.

Each fresh browser context installs the supplied save once, before navigation.
Continue, wrong/correct contacts, visible caption acknowledgment, movement,
save/reload and checkpoint retry then use real UI input and normal world time.
No later actor, world, director, health, clock or receipt edits are allowed.
Read-only debug telemetry observes outcomes. This is a focused fixture-based
regression, not a natural full mission playthrough or real-device Safari test.
"""

import argparse
import asyncio
import gzip
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import urlopen

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright

PROFILES = {
    "chromium-ultrawide": ("chromium", {"viewport": {"width": 2560, "height": 1080}}),
    "firefox-desktop": ("firefox", {"viewport": {"width": 1440, "height": 900}}),
    "webkit-small-phone": (
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
}
MODES = {"contacts", "save-continue", "timeout-retry", "annex"}
SAVE_KEY = "lowlight.save.v1"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def debug_url(url):
    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query))
    query.pop("play", None)
    query["debug"] = "1"
    return urlunsplit(parsed._replace(query=urlencode(query)))


def load_fixture(path, warning=True):
    path = Path(path).resolve()
    raw = (
        gzip.decompress(path.read_bytes())
        if path.suffix == ".gz"
        else path.read_bytes()
    )
    data = json.loads(raw)
    require(data.get("format") == "lowlight-save", f"Not a production save: {path}")
    state = data["state"]
    active = state.get("campaign", {}).get("active")
    require(
        active and active["missionId"] == "LL-ST-002", "Fixture must own Late Meter"
    )
    if warning:
        require(
            active["phase"] == "running" and active["stageId"] == "warn",
            "Phone fixture must be an actual running warn-stage save",
        )
        run = state["lateMeterRuntime"]["run"]
        require(
            run.get("recognition") and not run["warning"].get("delivered"),
            "Fixture must have actual recognition and no delivered warning",
        )
        require(
            run["warning"]["callId"] in state["phoneCalls"]["calls"],
            "Fixture lacks its actual registered warning call",
        )
        require(
            any(c["id"] == "annex" for c in active["checkpoints"]),
            "Fixture lacks the physically captured annex checkpoint",
        )
        require(
            state["time"] - run["recognition"]["at"] < 3,
            "The initial warning fixture has already consumed too much of its real deadline",
        )
    return {
        "path": str(path),
        "bytes": raw.decode(),
        "sha256": digest(raw),
        "state": state,
    }


def source_snapshot(root):
    paths = [
        root / "index.html",
        root / "styles.css",
        root / "my-3d2dge.js",
        *sorted((root / "src").rglob("*.js")),
    ]
    return {str(p.relative_to(root)): digest(p.read_bytes()) for p in paths}


def verify_server_sources(url, hashes):
    """Fail before fixture input if the URL serves a different candidate."""
    parsed = urlsplit(url)
    base = urlunsplit(parsed._replace(path="/", query="", fragment=""))
    for name in [
        "index.html",
        "styles.css",
        "src/game.js",
        "src/simulation.js",
        "src/renderer.js",
        "src/campaign/late-meter-runtime.js",
    ]:
        with urlopen(base + name, timeout=20) as response:
            require(
                digest(response.read()) == hashes[name],
                f"Server and --source-root differ: {name}",
            )


async def read(page):
    return await page.evaluate("""() => {
      const s=lowlight.state,v=lowlight.storyView(),r=s.lateMeterRuntime,
        warning=r?.run.warning,callId=warning?.callId,call=s.phoneCalls?.calls?.[callId],
        pose=a=>a&&({id:a.id,x:a.x,y:a.y,z:a.z??0,health:a.health,angle:a.angle,
          speed:a.speed??0,sceneId:a.sceneId??null,vehicleId:a.vehicleId??null,
          seat:a.seat??null,phase:a.companionPhase,sceneAction:a.sceneAction}),
        panel=document.getElementById('story-phone-panel'),
        caption=document.getElementById('story-phone-caption');
      return {time:s.time,clock:s.clock,transitTime:s.transit?.time,
        paused:lowlight.game.paused,player:{...pose(s.player),money:s.player.money},
        actors:(s.companions?.actors||[]).filter(a=>['LL-CHAR-002','LL-ARC-YARA',
          'LL-ARC-REEVE','holt-collector-watch'].includes(a.id)).map(pose),
        ride:pose(s.vehicles.find(a=>a.id===r?.run.rideId)),
        active:s.campaign?.active&&{missionId:s.campaign.active.missionId,
          phase:s.campaign.active.phase,stageId:s.campaign.active.stageId,
          attempt:s.campaign.active.attempt,failure:s.campaign.active.failure,
          dialogueIndex:s.campaign.active.dialogue.index,
          checkpoints:s.campaign.active.checkpoints.map(c=>({id:c.id,resumeStage:c.resumeStage}))},
        view:{active:v?.active,failed:v?.failed,failure:v?.failure,stageId:v?.stageId,
          inputEpoch:v?.inputEpoch,warningSecondsRemaining:v?.warningSecondsRemaining,
          dialogue:v?.dialogue,recognitionReady:v?.recognitionReady},
        runtime:{restoreEpoch:r?.restoreEpoch,recognition:r?.run.recognition,
          doorReachedAt:r?.run.doorReachedAt,warning,rideId:r?.run.rideId},
        call:call&&{id:call.id,phase:call.phase,index:call.index,dialCount:call.dialCount,
          presentation:call.presentation,history:call.history,acknowledgments:call.acknowledgments},
        phoneActiveId:s.phoneCalls?.activeId,
        phoneEvents:s.phoneCalls?.events?.slice(-8),
        outcomes:Object.values(s.phoneCalls?.outcomes||{}),
        completed:!!s.campaign?.completed?.['LL-ST-002'],
        progress:{deaths:s.progress.deaths,kills:s.progress.kills,arrests:s.progress.arrests},
        prop:s.campaignRuntime?.sceneProps?.['reeve-repossession-clipboard'],
        dom:{phoneOpen:!panel.hidden,phoneTag:panel.tagName,
          captionVisible:!caption.hidden&&!!caption.getClientRects().length,
          clock:document.getElementById('story-phone-clock').textContent,
          status:document.getElementById('story-phone-status').textContent,
          speaker:document.getElementById('story-phone-speaker').textContent,
          text:document.getElementById('story-phone-text').textContent,
          toggleHidden:document.getElementById('story-phone-toggle').hidden,
          dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),
          district:document.getElementById('district-name').textContent,
          overflow:document.documentElement.scrollWidth>innerWidth+1},
        engineErrors:lowlight.game.errors.map(e=>String(e.error||e))};
    }""")


async def geometry(page, selector):
    return await page.locator(selector).evaluate("""e=>{
      const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,
        hit=document.elementFromPoint(x,y),style=getComputedStyle(e);
      return {x:b.x,y:b.y,width:b.width,height:b.height,text:e.textContent.trim(),
        visible:!!e.getClientRects().length&&style.visibility!=='hidden',
        reachable:hit===e||e.contains(hit),
        inside:b.left>=-1&&b.top>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1};
    }""")


async def activate(page, selector, touch, report):
    await page.locator(selector).wait_for(state="visible")
    box = await geometry(page, selector)
    if not (box["inside"] and box["reachable"]):
        scroll_dialog = await page.locator(selector).evaluate(
            "e=>e.closest('dialog[open]')?.id||null"
        )
        if scroll_dialog:
            # Native focus navigation scrolls the actual modal container. Phone
            # cases disclose this mixed keyboard/touch input; no scrollTop or
            # game-state assignment reveals an offscreen control.
            for _ in range(18):
                await page.keyboard.press("Tab")
                report["nativeTabScrolls"] = report.get("nativeTabScrolls", 0) + 1
                box = await geometry(page, selector)
                if box["inside"] and box["reachable"]:
                    break
    require(
        box["visible"] and box["reachable"] and box["inside"],
        f"Control is clipped/covered: {selector}: {box}",
    )
    require(
        box["width"] >= 24 and box["height"] >= 24,
        f"Control is too small: {selector}: {box}",
    )
    report["targets"].append({"selector": selector, **box})
    if touch:
        await page.touchscreen.tap(
            box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        )
    else:
        await page.locator(selector).click()
    await page.wait_for_timeout(80)


async def observe_time(page, seconds, report, label):
    before = await read(page)
    await page.wait_for_function(
        "t=>lowlight.state.time>=t", arg=before["time"] + seconds, timeout=30000
    )
    after = await read(page)
    require(
        after["time"] >= before["time"] + seconds - 1e-6,
        f"Normal world time did not advance while {label}",
    )
    require(
        not after["paused"] and not after["dom"]["dialogs"],
        f"The nonmodal phone paused the world while {label}",
    )
    require(not after["view"]["failed"], f"Unexpected early failure while {label}")
    if before["transitTime"] is not None:
        require(
            after["transitTime"] > before["transitTime"],
            f"Actual train physics stopped while {label}",
        )
    report["clockSamples"].append({"label": label, "before": before, "after": after})
    return after


async def capture(page, output, name, report):
    observation = await read(page)
    require(not observation["dom"]["overflow"], f"Horizontal overflow in {name}")
    require(not observation["engineErrors"], f"Engine errors in {name}")
    path = output / f"{name}.png"
    await page.screenshot(path=str(path))
    report["screenshots"].append(str(path))
    report["timeline"].append({"label": name, **observation})
    print(
        f"{name}: sim={observation['time']:.2f} stage={observation['active']['stageId']}",
        flush=True,
    )
    return observation


async def dial(page, touch, report):
    await activate(page, "[data-story-contact='LL-CHAR-002']", touch, report)
    await page.wait_for_function("""()=>lowlight.state.phoneCalls.calls[
      lowlight.state.lateMeterRuntime.run.warning.callId]?.phase==='connected'&&
      !document.getElementById('story-phone-caption').hidden&&
      document.getElementById('story-phone-text').textContent.trim().length>0""")
    result = await read(page)
    require(result["call"]["dialCount"] == 1, "The actual call dial count is not one")
    require(
        result["call"]["presentation"]["presented"],
        "Mounted caption earned no presentation",
    )
    return result


async def acknowledge_remaining(page, touch, report):
    for _ in range(4):
        before = await read(page)
        if before["runtime"]["warning"]["delivered"]:
            break
        require(
            before["call"] and before["call"]["phase"] == "connected",
            "The actual warning call disconnected before acknowledgment",
        )
        require(
            before["dom"]["captionVisible"] and before["dom"]["text"],
            "An unmounted/hidden caption cannot be acknowledged",
        )
        index = before["call"]["index"]
        await activate(page, "#story-phone-continue", touch, report)
        await page.wait_for_function(
            """old=>{
          const r=lowlight.state.lateMeterRuntime.run,c=lowlight.state.phoneCalls.calls[r.warning.callId];
          return !!r.warning.delivered||c?.index>old;
        }""",
            arg=index,
        )
        after = await read(page)
        require(
            len(after["call"]["acknowledgments"])
            == len(before["call"]["acknowledgments"]) + 1,
            "One visible click must commit exactly one line acknowledgment",
        )
        report["acknowledgments"].append({"before": before, "after": after})
    final = await read(page)
    delivered = final["runtime"]["warning"]["delivered"]
    require(
        delivered and delivered["kind"] == "delivered",
        "The actual warning was not delivered",
    )
    require(
        delivered["at"] < final["runtime"]["recognition"]["at"] + 18,
        "Warning delivery missed its actual eighteen-second deadline",
    )
    door = final["runtime"]["doorReachedAt"]
    require(
        door is None or delivered["at"] < door,
        "A warning after physical door arrival is invalid",
    )
    require(
        len(final["call"]["acknowledgments"]) == 3,
        "Warning has exactly three actual lines",
    )
    require(
        not final["completed"], "Warning-only checks cannot award mission completion"
    )
    return final


async def run_contacts(page, touch, report, output, name):
    await activate(page, "[data-story-contact='dispatch-line']", touch, report)
    wrong = await read(page)
    require(
        wrong["dom"]["phoneOpen"] and "another line" in wrong["dom"]["status"],
        "Wrong contact did not retain the phone and give a retry cue",
    )
    require(
        wrong["call"]["dialCount"] == 0
        and not wrong["runtime"]["warning"]["delivered"],
        "Wrong contact dialled Felix or delivered the warning",
    )
    await observe_time(page, 0.45, report, "wrong contact remains open")
    # Real keyboard driving is intentionally mixed with touch menus on phones.
    before = await read(page)
    await page.keyboard.down("w")
    try:
        await observe_time(page, 0.2, report, "moving with the nonmodal phone open")
    finally:
        await page.keyboard.up("w")
    await page.keyboard.down("Shift")
    try:
        moving = await observe_time(page, 0.2, report, "braking with the phone open")
    finally:
        await page.keyboard.up("Shift")
    require(
        math.hypot(
            moving["player"]["x"] - before["player"]["x"],
            moving["player"]["y"] - before["player"]["y"],
        )
        > 0.1,
        "The open phone swallowed normal movement controls",
    )
    await capture(page, output, name + "-wrong-contact", report)
    await activate(page, "#story-phone-hide", touch, report)
    hidden = await observe_time(page, 0.45, report, "phone hidden")
    require(
        not hidden["dom"]["phoneOpen"] and hidden["call"]["dialCount"] == 0,
        "Hiding the phone implicitly called or reset the warning",
    )
    await activate(page, "#story-phone-toggle", touch, report)
    await dial(page, touch, report)
    await capture(page, output, name + "-visible-call", report)
    await acknowledge_remaining(page, touch, report)
    await capture(page, output, name + "-warning-delivered", report)


async def run_save_continue(page, touch, report, output, name):
    await dial(page, touch, report)
    await activate(page, "#story-phone-continue", touch, report)
    await page.wait_for_function("""()=>lowlight.state.phoneCalls.calls[
      lowlight.state.lateMeterRuntime.run.warning.callId].index===1""")
    await activate(page, "#story-phone-hide", touch, report)
    hidden = await observe_time(page, 0.5, report, "connected caption hidden")
    require(
        hidden["call"]["index"] == 1 and len(hidden["call"]["acknowledgments"]) == 1,
        "A hidden line advanced without visible acknowledgment",
    )
    require(
        not hidden["call"]["presentation"]["visible"],
        "Hidden caption kept presentation credit",
    )
    await capture(page, output, name + "-hidden-mid-call", report)
    await activate(page, "#menu-button", touch, report)
    require((await read(page))["paused"], "The actual pause menu did not pause")
    await activate(page, "#save-game", touch, report)
    stored = await page.evaluate("localStorage.getItem('lowlight.save.v1')")
    saved = json.loads(stored)["state"]
    saved_call_id = saved["lateMeterRuntime"]["run"]["warning"]["callId"]
    saved_call = saved["phoneCalls"]["calls"][saved_call_id]
    require(
        saved_call["index"] == 1 and len(saved_call["acknowledgments"]) == 1,
        "The real UI save did not preserve the partial conversation",
    )
    (output / f"{name}-actual-ui-save.json").write_text(stored)
    report["actualUiSaveSha256"] = digest(stored.encode())
    await page.reload()
    await page.wait_for_function("window.lowlight")
    navigation_stored = await page.evaluate("localStorage.getItem('lowlight.save.v1')")
    navigation_saved = json.loads(navigation_stored)["state"]
    navigation_call = navigation_saved["phoneCalls"]["calls"].get(saved_call_id)
    report["navigationSaveSha256"] = digest(navigation_stored.encode())
    (output / f"{name}-actual-navigation-save.json").write_text(navigation_stored)
    # visibilitychange may legitimately persist a slightly later world snapshot
    # during navigation. Require committed conversation/deadline evidence,
    # rather than identical whole-save bytes or suppressing the real autosave.
    require(
        report["navigationSaveSha256"] != report["fixtureSha256"]
        and navigation_call
        and navigation_call["index"] == saved_call["index"]
        and navigation_call["dialCount"] == saved_call["dialCount"]
        and navigation_call["acknowledgments"] == saved_call["acknowledgments"]
        and navigation_saved["lateMeterRuntime"]["run"]["recognition"]
        == saved["lateMeterRuntime"]["run"]["recognition"],
        "Navigation did not retain the actual saved call, acknowledgments and identification",
    )
    require(
        navigation_saved["time"] >= saved["time"]
        and navigation_saved["time"] - saved["time"] < 1,
        "The navigation lifecycle save rewound or substantially advanced the real clock",
    )
    await activate(page, "#continue-game", touch, report)
    await page.wait_for_function("!document.getElementById('story-phone-panel').hidden")
    continued = await capture(page, output, name + "-continued-call", report)
    require(
        continued["active"]["stageId"] == "warn" and continued["call"]["index"] == 1,
        "Continue skipped or restarted the warning conversation",
    )
    require(
        continued["call"]["id"] == saved_call_id
        and continued["call"]["dialCount"] == 1,
        "Continue invented a new call or dial",
    )
    require(
        len(continued["call"]["acknowledgments"]) == 1,
        "Continue invented an acknowledgment for the hidden line",
    )
    require(
        continued["runtime"]["recognition"]
        == saved["lateMeterRuntime"]["run"]["recognition"],
        "Continue reset actual identification/deadline evidence",
    )
    require(
        continued["time"] >= navigation_saved["time"]
        and continued["time"] - navigation_saved["time"] < 1,
        "Continue rewound or substantially advanced the saved world clock",
    )
    require(
        continued["player"]["money"] == saved["player"]["money"],
        "Continue changed the wallet",
    )
    await acknowledge_remaining(page, touch, report)
    await capture(page, output, name + "-continued-delivery", report)


async def run_timeout_retry(page, touch, report, output, name, fixture):
    before = await read(page)
    await activate(page, "[data-story-contact='dispatch-line']", touch, report)
    await activate(page, "#story-phone-hide", touch, report)
    await page.wait_for_function("lowlight.storyView()?.failed", timeout=120000)
    await page.wait_for_function("document.getElementById('info-dialog').open")
    failed = await capture(page, output, name + "-failed", report)
    require(
        failed["active"]["failure"]["id"] in {"warning-late", "collector-at-door"},
        f"Unexpected physical warning failure: {failed['active']['failure']}",
    )
    require(
        not failed["runtime"]["warning"]["delivered"],
        "Expired call was marked delivered",
    )
    require(
        failed["time"] > before["time"] and failed["paused"],
        "Failure was not reached through normal time followed by the modal recovery UI",
    )
    require(
        await page.evaluate("localStorage.getItem('lowlight.save.v1')")
        == fixture["bytes"],
        "The failed assignment overwrote the retained input save",
    )
    await activate(page, "#story-retry", touch, report)
    await page.wait_for_function("""()=>lowlight.state.campaign.active?.missionId==='LL-ST-002'&&
      lowlight.state.campaign.active.phase==='running'""")
    restored = await capture(page, output, name + "-retried-annex", report)
    checkpoint = next(
        c
        for c in fixture["state"]["campaign"]["active"]["checkpoints"]
        if c["id"] == "annex"
    )
    require(
        restored["active"]["attempt"] == before["active"]["attempt"] + 1,
        "Checkpoint retry did not create the next actual attempt",
    )
    require(
        restored["active"]["stageId"] == checkpoint["resumeStage"],
        "Retry missed the authored physical annex checkpoint stage",
    )
    require(
        restored["runtime"]["restoreEpoch"] > before["runtime"]["restoreEpoch"],
        "Retry did not invalidate old camera/input/phone ownership",
    )
    require(
        restored["runtime"]["recognition"] is None
        and restored["phoneActiveId"] is None,
        "Retry retained stale recognition or an active warning call",
    )
    require(
        restored["dom"]["toggleHidden"] and not restored["completed"],
        "Retry left stale warning UI or awarded mission completion",
    )


async def run_annex(page, touch, report, output, name):
    before = await read(page)
    if before["player"]["sceneId"] != "impound-annex":
        require(
            before["player"]["vehicleId"] is None,
            "Entry fixture must place Mara on foot",
        )
        if touch:
            await activate(page, "#touch-interact", True, report)
        else:
            await page.keyboard.press("e", delay=60)
        await page.wait_for_function("lowlight.state.player.sceneId==='impound-annex'")
        report["browserEntryProved"] = True
    else:
        report["browserEntryProved"] = False
        report["entryBoundary"] = (
            "Initial production input save already owns the actual interior entry."
        )
    inside = await capture(page, output, name + "-annex-room", report)
    require("IMPOUND" in inside["dom"]["district"].upper(), "Annex HUD title is absent")
    stats = await page.evaluate("lowlight.roomRendererStats()")
    require(
        stats["roomId"] == "impound-annex" and stats["props"] > 0,
        "The native room renderer did not draw the actual annex",
    )
    report["nativeRoomStats"] = stats


async def run_case(playwright, profile, mode, args, fixture, output):
    engine, options = PROFILES[profile]
    touch = options.get("has_touch", False)
    name = f"{profile}-{mode}"
    report = {
        "profile": profile,
        "engine": engine,
        "mode": mode,
        "passed": False,
        "viewport": options["viewport"],
        "touchMenus": touch,
        "fixturePath": fixture["path"],
        "fixtureSha256": fixture["sha256"],
        "postLoadStateEdits": False,
        "naturalBrowserCompletion": False,
        "targets": [],
        "clockSamples": [],
        "acknowledgments": [],
        "timeline": [],
        "screenshots": [],
        "pageErrors": [],
        "consoleErrors": [],
    }
    browser = await getattr(playwright, engine).launch(headless=True)
    context = await browser.new_context(**options)
    origin = urlunsplit(urlsplit(args.url)._replace(path="", query="", fragment=""))
    # sessionStorage survives page reload; only the first document receives the
    # fixture. An actual UI save can never be overwritten by this setup hook.
    await context.add_init_script(
        script=f"""(() => {{
      if(location.origin!=={json.dumps(origin)})return;
      const marker='lowlight.qa.late-meter.initial-save';
      if(sessionStorage.getItem(marker)===null){{
        localStorage.setItem({json.dumps(SAVE_KEY)},{json.dumps(fixture["bytes"])});
        sessionStorage.setItem(marker,{json.dumps(fixture["sha256"])});
      }}
    }})();"""
    )
    page = await context.new_page()
    page.set_default_timeout(20000)
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
        print(f"{name}: loading declared input save", flush=True)
        await page.goto(debug_url(args.url))
        await page.wait_for_function("window.lowlight")
        require(
            await page.evaluate("localStorage.getItem('lowlight.save.v1')")
            == fixture["bytes"],
            "Initial context did not install the exact declared save",
        )
        await activate(page, "#continue-game", touch, report)
        if mode != "annex":
            await page.wait_for_function(
                "!document.getElementById('story-phone-panel').hidden"
            )
            initial = await read(page)
            require(
                initial["active"]["stageId"] == "warn" and not initial["paused"],
                "Continue did not restore the live actual warning stage",
            )
            require(
                initial["dom"]["phoneTag"] == "ASIDE" and not initial["dom"]["dialogs"],
                "Warning phone must be nonmodal",
            )
        await capture(page, output, name + "-initial", report)
        if mode == "contacts":
            await run_contacts(page, touch, report, output, name)
        elif mode == "save-continue":
            await run_save_continue(page, touch, report, output, name)
        elif mode == "timeout-retry":
            await run_timeout_retry(page, touch, report, output, name, fixture)
        else:
            await run_annex(page, touch, report, output, name)
        require(
            not report["pageErrors"] and not report["consoleErrors"],
            "Browser JavaScript errors",
        )
        report["passed"] = True
    except (
        AssertionError,
        PlaywrightError,
        OSError,
        LookupError,
        TypeError,
        ValueError,
    ) as error:
        report["failure"] = str(error)
        try:
            report["failureState"] = await read(page)
            path = output / f"{name}-failure.png"
            await page.screenshot(path=str(path))
            report["screenshots"].append(str(path))
        except (PlaywrightError, OSError) as capture_error:
            report["captureFailure"] = str(capture_error)
    finally:
        await page.keyboard.up("w")
        await page.keyboard.up("Shift")
        await context.close()
        await browser.close()
    (output / f"{name}-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"{name}: {'PASS' if report['passed'] else 'FAIL — ' + report['failure']}",
        flush=True,
    )
    return report


async def main(args):
    repository = Path(__file__).resolve().parents[1]
    source_root = Path(args.source_root).resolve()
    output = Path(args.output).resolve()
    for protected in [repository, source_root]:
        require(
            output != protected and protected not in output.parents,
            "Generated browser evidence must remain outside repository/candidate",
        )
    output.mkdir(parents=True, exist_ok=True)
    profiles = args.profiles.split(",")
    modes = args.modes.split(",")
    require(all(name in PROFILES for name in profiles), "Unknown browser profile")
    require(all(mode in MODES for mode in modes), "Unknown case mode")
    require(
        "annex" not in modes or args.annex_save,
        "--annex-save is required for annex mode",
    )
    warn = load_fixture(args.warn_save)
    annex = load_fixture(args.annex_save, warning=False) if args.annex_save else None
    provenance = json.loads(Path(args.fixture_report).read_text())
    require(
        isinstance(provenance, dict),
        "Fixture report must describe the production input journey",
    )
    snapshots = provenance.get("snapshots", {})
    require(
        isinstance(snapshots, dict)
        and any(
            isinstance(snapshot, dict) and snapshot.get("sha256") == warn["sha256"]
            for snapshot in snapshots.values()
        ),
        "The supplied journey report does not attest the warning save's exact bytes",
    )
    if annex:
        require(
            any(
                isinstance(snapshot, dict) and snapshot.get("sha256") == annex["sha256"]
                for snapshot in snapshots.values()
            ),
            "The supplied journey report does not attest the annex save's exact bytes",
        )
    hashes = source_snapshot(source_root)
    hashes["browser-harness"] = digest(Path(__file__).read_bytes())
    verify_server_sources(args.url, hashes)
    reports = []
    async with async_playwright() as playwright:
        for profile in profiles:
            for mode in modes:
                reports.append(
                    await run_case(
                        playwright,
                        profile,
                        mode,
                        args,
                        annex if mode == "annex" else warn,
                        output,
                    )
                )
    after = source_snapshot(source_root)
    after["browser-harness"] = digest(Path(__file__).read_bytes())
    changes = [name for name, value in hashes.items() if after.get(name) != value]
    result = {
        "url": args.url,
        "sourceRoot": str(source_root),
        "passed": bool(reports)
        and all(case["passed"] for case in reports)
        and not changes,
        "scope": "Declared production-save warning UI, real time, visible acknowledgments, save/Continue and physical checkpoint retry.",
        "limitations": [
            "Not a natural full Late Meter playthrough or source completion proof.",
            "Phone profiles mix actual touch menus with keyboard movement.",
            "WebKit profiles are not real iOS Safari or physical-device tests.",
            "Screenshots require human review; this harness does not certify art by counts.",
        ],
        "fixtureReport": str(Path(args.fixture_report).resolve()),
        "fixtureProvenance": provenance,
        "warnFixtureSha256": warn["sha256"],
        "sourceHashes": hashes,
        "sourceChangesDuringRun": changes,
        "cases": reports,
    }
    (output / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Late Meter browser evidence: {output}", flush=True)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5179/")
    parser.add_argument(
        "--source-root", required=True, help="Frozen source directory served by --url"
    )
    parser.add_argument(
        "--warn-save",
        required=True,
        help="Actual production-generated warn-before-dial save",
    )
    parser.add_argument(
        "--fixture-report",
        required=True,
        help="Production input journey provenance JSON",
    )
    parser.add_argument(
        "--annex-save", help="Optional production pre-entry or interior save"
    )
    parser.add_argument("--profiles", default=",".join(PROFILES))
    parser.add_argument("--modes", default="contacts,save-continue,timeout-retry")
    parser.add_argument(
        "--output",
        default="/tmp/lowlight-late-meter-browser/"
        + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
    )
    sys.exit(asyncio.run(main(parser.parse_args())))
