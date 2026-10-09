#!/usr/bin/env python3
"""Focused native-canvas and map-control checks; camera elevations and legacy-mode saves use declared fixtures."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from playwright.async_api import async_playwright


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def debug_url(url):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop('play', None)
    query['debug'] = '1'
    return urlunsplit(parts._replace(query=urlencode(query)))


NATIVE_PIXELS = """async () => {
  const {createMapBackground,createMapProjection}=await import('/src/map-background.js');
  const world={width:200,height:200,spawn:{x:100,y:100},districts:[],
    landforms:[{polygon:[[0,0],[200,0],[0,200]]}],lakes:[{x:30,y:30,w:20,h:20}],
    buildings:[{x:60,y:20,w:20,h:20}],roads:[
      {id:'ground',x1:50,y1:150,x2:200,y2:150,width:14,access:['foot','car']},
      {id:'bridge',x1:80,y1:120,x2:180,y2:120,width:10,z:28,bridge:true,access:['foot','car']},
      {id:'reverse',x1:60,y1:20,x2:20,y2:60,width:10,access:['foot','car']}]};
  const a=document.createElement('canvas'),b=document.createElement('canvas');
  a.width=b.width=a.height=b.height=200;
  const map=createMapBackground(world);
  map.draw(a.getContext('2d'),createMapProjection(world,200,200,{full:true}));
  map.draw(b.getContext('2d'),createMapProjection(world,200,200,{center:{x:100,y:100},scale:1}));
  const pixels=a.getContext('2d').getImageData(0,0,200,200).data;
  const tiles=b.getContext('2d').getImageData(0,0,200,200).data;
  let differences=0;for(let i=0;i<pixels.length;i++)if(pixels[i]!==tiles[i])differences++;
  const at=(x,y)=>Array.from(pixels.slice((y*200+x)*4,(y*200+x)*4+4));
  const before=map.stats();
  map.draw(b.getContext('2d'),createMapProjection(world,200,200,{center:{x:100,y:100},scale:1}));
  return {differences,water:at(180,180),land:at(20,20),lake:at(40,40),building:at(70,30),
    clippedGround:at(130,150),bridge:at(140,120),before,after:map.stats()};
}"""


async def run_engine(playwright, name, url, output):
    report = {'engine': name, 'passed': False, 'checks': [], 'pageErrors': [], 'consoleErrors': []}
    browser = await getattr(playwright, name).launch(headless=True)
    options = playwright.devices['iPhone SE (3rd gen)'] if name == 'webkit' else {
        'viewport': {'width': 820, 'height': 1180} if name == 'firefox' else {'width': 1680, 'height': 1050}}
    context = await browser.new_context(**options)
    page = await context.new_page()
    page.set_default_timeout(20000)
    page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
    page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
    try:
        await page.goto(debug_url(url))
        await page.wait_for_function('window.lowlight')
        native = await page.evaluate(NATIVE_PIXELS)
        water = [27, 61, 67, 255]
        require(native['differences'] == 0, 'Native full-map/tile pixels disagree')
        for key in ['water', 'lake', 'clippedGround']:
            require(native[key] == water, f'{key} is painted as land/road')
        require(native['bridge'] != water, 'Physical bridge is missing over underlying water')
        require(native['land'] != water and native['building'] == [82, 102, 84, 255], 'Native land/building colors missing')
        require(native['before'] == native['after'], 'Warmed native tile rerasterized')
        report['nativeCanvas'] = native
        report['checks'].append('native pixels: exact coast/lake, clipped water crossing, raised bridge, reversed road, full/tile equivalence and warmed cache')

        await page.click('#new-game')
        # Explicit legacy fixture for the existing opening/map regression.
        await page.evaluate("""async () => { const {createSimulation,saveGame}=await import('/src/simulation.js'); lowlight.restore(saveGame(createSimulation(61))); }""")
        await page.wait_for_timeout(700)
        await page.keyboard.press('m')
        await page.locator('#map-dialog').wait_for(state='visible')
        await page.keyboard.press('Tab')
        require(await page.evaluate('document.activeElement.id') == 'city-map', 'Map is not keyboard reachable')
        before = await page.evaluate('lowlight.mapStats()')
        for _ in range(3):
            await page.keyboard.press('ArrowRight')
        await page.keyboard.press('Enter')
        waypoint = await page.evaluate('lowlight.state.waypoint')
        require(waypoint and isinstance(waypoint.get('z'), (float, int)), 'Keyboard map did not retain a layer-aware waypoint')
        after = await page.evaluate('lowlight.mapStats()')
        require(after['fullRenders'] == before['fullRenders'], 'Keyboard overlays rebuilt static full map')
        require(after['tiles'] <= 24, 'Minimap cache exceeded its tile bound')
        await page.screenshot(path=str(output / f'{name}-full-map.png'))
        box = await page.locator('#city-map').bounding_box()
        # Known original clinic street intersection, using the shared full-map projection.
        await page.evaluate("document.getElementById('city-map').addEventListener('click', event => window.mapClick = {x:event.clientX,y:event.clientY},{once:true})")
        await page.mouse.click(box['x'] + (30 + 180 * .07) / 900 * box['width'],
                               box['y'] + (960 * .07) / 700 * box['height'])
        clicked = await page.evaluate('lowlight.state.waypoint')
        actual = await page.evaluate('window.mapClick')
        # MouseEvent coordinates can round to whole CSS pixels. Compare against
        # the actual event and independently project onto the two original streets.
        raw_x = ((actual['x'] - box['x']) * 900 / box['width'] - 30) / .07
        raw_y = (actual['y'] - box['y']) * 700 / box['height'] / .07
        expected = (raw_x, 960) if abs(raw_y - 960) < abs(raw_x - 180) else (180, raw_y)
        require(abs(clicked['x'] - expected[0]) < 1e-6 and abs(clicked['y'] - expected[1]) < 1e-6,
                'Map pointer origin/scale does not match its background')
        report['pointerWaypoint'] = {'event': actual, 'unprojected': {'x': raw_x, 'y': raw_y}, 'waypoint': clicked}
        await page.click('#clear-waypoint')
        require(await page.evaluate('lowlight.state.waypoint === null'), 'Clear waypoint failed')
        await page.keyboard.press('Escape')
        require(not await page.locator('#map-dialog').is_visible(), 'Map Escape failed')
        require(await page.evaluate('document.activeElement.id') == 'screen', 'Map close did not restore game focus')
        for _ in range(6):
            if not await page.evaluate('!!lowlight.state.dialogue'):
                break
            await page.keyboard.press('e', delay=100)
            await page.wait_for_timeout(220)
        require(await page.evaluate('lowlight.state.dialogue === null'), 'Opening conversation obscures minimap capture')
        await page.screenshot(path=str(output / f'{name}-minimap.png'))
        report['checks'].append('actual map: Tab/arrows/Enter, layer-aware waypoint, shared click projection, cached overlays, clear, Escape/game focus')

        for layer in ['bridge', 'tunnel']:
            fixture = await page.evaluate("""async layer => {
              const {WORLD}=await import('/src/simulation.js');
              const road=WORLD.roads.find(r=>r.catalogueId && r.access.includes('car') && r.z1===r.z2 &&
                (layer==='bridge'?r.bridge&&r.z1>0:r.tunnel&&r.z1<0));
              if(!road)throw Error('No constant-grade '+layer+' fixture road');
              const s=lowlight.state,car=s.vehicles.find(v=>v.id==='starter-taxi');
              const x=(road.x1+road.x2)/2,y=(road.y1+road.y2)/2,z=road.z1;
              Object.assign(car,{x,y,z,groundZ:z,vz:0,speed:0,occupied:true,kind:'parked',route:null});
              Object.assign(s.player,{x,y,z,groundZ:z,vz:0,vehicleId:car.id});
              s.dialogue=null;s.mission=null;s.waypoint=null;
              lowlight.game.cam.snap=true;
              return {roadId:road.id,x,y,z};
            }""", layer)
            await page.wait_for_function('(z)=>Math.abs(lowlight.state.player.z-z)<1e-7 && Math.abs(lowlight.game.cam.tz-z)<1e-7', arg=fixture['z'])
            await page.wait_for_timeout(300)
            require(await page.evaluate('lowlight.game.errors.length') == 0, 'Engine error in elevation fixture')
            place = await page.evaluate('lowlight.state.place')
            fixture['place'] = place
            report[layer + 'CameraFixture'] = fixture
            require(place and await page.locator('#district-name').inner_text() == place['name'].upper(),
                    'Infrastructure HUD retained an unrelated area name')
            await page.screenshot(path=str(output / f'{name}-{layer}-camera.png'))
        report['checks'].append('declared constant-grade bridge/tunnel fixtures: player and camera target retain absolute elevation')
        await page.evaluate("""async () => {
          const {WORLD}=await import('/src/simulation.js'),s=lowlight.state,lake=WORLD.lakes[0];
          const car=s.vehicles.find(v=>v.id===s.player.vehicleId);if(car)car.occupied=false;
          Object.assign(s.player,{x:lake.x+lake.w/2,y:lake.y+lake.h/2,z:0,groundZ:0,vehicleId:null,health:100,stamina:100});
          lowlight.game.cam.snap=true;
        }""")
        await page.wait_for_function('lowlight.state.player.swimming && document.getElementById("street-name").textContent.includes("SWIMMING")')
        require('Stamina' in await page.locator('#minimap').get_attribute('aria-label'), 'Swimming map omits the stamina guidance')
        await page.evaluate('lowlight.state.player.stamina = 12')
        await page.wait_for_function('document.getElementById("weapon-name").textContent.includes("FLOAT TO REST") && document.getElementById("ammo").textContent.includes("STAMINA")')
        require('Float' in await page.locator('#minimap').get_attribute('aria-label'), 'Swimming map omits floating recovery guidance')
        await page.screenshot(path=str(output / f'{name}-swimming-hud.png'))
        report['checks'].append('declared lake fixture: visible swimming mode and accessible stamina/RUN guidance')
        if name == 'webkit':
            landscape = await browser.new_context(**playwright.devices['iPhone 17 Pro landscape'])
            try:
                conversation = await landscape.new_page()
                await conversation.goto(debug_url(url))
                await conversation.wait_for_function('window.lowlight')
                await conversation.click('#new-game')
                await conversation.evaluate("""async () => { const {createSimulation,saveGame}=await import('/src/simulation.js'); lowlight.restore(saveGame(createSimulation(61))); }""")
                await conversation.wait_for_function('lowlight.state.dialogue && document.body.classList.contains("in-conversation")')
                require(not await conversation.locator('#context-prompt').is_visible(), 'Landscape context prompt overlaps conversation')
                require(not await conversation.locator('#minimap').is_visible(), 'Landscape minimap overlaps conversation')
                await conversation.screenshot(path=str(output / 'webkit-landscape-conversation.png'))
                for _ in range(6):
                    if not await conversation.evaluate('!!lowlight.state.dialogue'):
                        break
                    await conversation.keyboard.press('e', delay=100)
                    await conversation.wait_for_timeout(220)
                await conversation.wait_for_function('!lowlight.state.dialogue && !document.body.classList.contains("in-conversation")')
                require(await conversation.locator('#minimap').is_visible(), 'Landscape minimap did not restore after conversation')
                require(await conversation.locator('#context-prompt').is_visible(), 'Landscape context prompt did not restore after conversation')
                await conversation.screenshot(path=str(output / 'webkit-landscape-restored.png'))
                report['checks'].append('WebKit iPhone 17 Pro landscape: conversation hides minimap/context prompt; both restore after actual E input')
            finally:
                await landscape.close()
        require(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'Page has horizontal overflow')
        require(not report['pageErrors'] and not report['consoleErrors'], 'Browser reported JavaScript/console errors')
        report['passed'] = True
    except Exception as error:
        report['failure'] = str(error)
        await page.screenshot(path=str(output / f'{name}-failure.png'))
    finally:
        await context.close()
        await browser.close()
    (output / f'{name}-report.json').write_text(json.dumps(report, indent=2) + '\n')
    if report['passed']:
        (output / f'{name}-failure.png').unlink(missing_ok=True)
    print(f"{name}: {'PASS' if report['passed'] else 'FAIL'}" + (f" — {report['failure']}" if 'failure' in report else ''), flush=True)
    return report


async def main(args):
    output = Path(args.output).resolve()
    repository = Path(__file__).resolve().parents[1]
    require(output != repository and repository not in output.parents, 'Reports must be outside the repository')
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        reports = []
        for name in args.engines.split(','):
            require(name in {'chromium', 'webkit', 'firefox'}, 'Unknown engine')
            reports.append(await run_engine(playwright, name, args.url, output))
    report = {'passed': all(r['passed'] for r in reports), 'engines': reports,
              'limitations': ['WebKit iPhone profile; real iOS Safari unavailable.',
                              'Map controls use actual input; camera layers use declared relocation fixtures.',
                              'This checks maps and camera layers, not a campaign playthrough.']}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Report and screenshots: {output}', flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:5173/')
    parser.add_argument('--engines', default='chromium,webkit,firefox')
    parser.add_argument('--output', default='/tmp/lowlight-browser-map/' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    sys.exit(asyncio.run(main(parser.parse_args())))
