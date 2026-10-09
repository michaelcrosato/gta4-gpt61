#!/usr/bin/env python3
"""Native city raster/layer checks with declared geography fixtures.

An explicit legacy-mode save baseline and scene captures relocate the player and starter taxi to isolate rendering. They
are not natural travel, campaign acceptance, or physical device benchmarks.
"""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from playwright.async_api import async_playwright


def debug_url(url):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.update(debug="1", play="1")
    return urlunsplit(parts._replace(query=urlencode(query)))


async def check(playwright, engine, url, output):
    browser = await getattr(playwright, engine).launch()
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        await page.goto(debug_url(url))
        await page.wait_for_function("window.lowlight")
        await page.evaluate("""async () => { const {createSimulation,saveGame}=await import('/src/simulation.js'); lowlight.restore(saveGame(createSimulation(61))); }""")
        await page.wait_for_function("lowlight.state.time > .1")
        comparisons = await page.evaluate("""async () => {
          const {WORLD}=await import('/src/world.js');
          const {createCityGroundRenderer}=await import('/src/city-ground.js');
          const E=My3D2dge;
          const positions=[[458,700],[5200,5200],[4000,4000],[11900,9900],[5200,4500],[5800,6100]];
          const results=[];
          for(const angles of [[35,48],[0,90]]) {
            const view=new E.View('test','Test',...angles,.8,1);
            const floor=createCityGroundRenderer(WORLD,{tileSize:128,maxTiles:12});
            for(const [x,y] of positions) {
              const [px,py]=view.p(x,y,0),ix=Math.floor(px)-72,iy=Math.floor(py)-55;
              const make=()=>{
                const canvas=document.createElement('canvas');canvas.width=144;canvas.height=110;
                const ctx=canvas.getContext('2d');
                return {ctx,view,ix,iy,bw:144,bh:110,queue(){},w(x,y,z=0){const p=view.p(x,y,z);return[p[0]-ix,p[1]-iy]},
                  sky(){ctx.fillStyle='#263f40';ctx.fillRect(0,0,144,110);ctx._c=null}};
              };
              const cached=make(),live=make();floor.draw(cached);floor.drawLive(live);
              const a=cached.ctx.getImageData(0,0,144,110).data,b=live.ctx.getImageData(0,0,144,110).data;
              let changed=0;for(let i=0;i<a.length;i++) if(a[i]!==b[i]) changed++;
              results.push({angles,x,y,changed,cachedTiles:floor.stats.cachedTiles});
            }
            floor.dispose();
          }
          return results;
        }""")
        if any(item["changed"] for item in comparisons):
            raise AssertionError(f"{engine}: cached/direct native ground pixels differ")
        fixtures = await page.evaluate("""async () => {
          const {WORLD}=await import('/src/world.js');
          const {snapToRoad}=await import('/src/navigation.js');
          const span=WORLD.roads.find(r=>r.bridge && r.access.includes('car') && r.z1>0 && r.z1===r.z2);
          const bore=WORLD.roads.find(r=>r.tunnel && r.access.includes('car') && r.z1<0 && r.z1===r.z2);
          const middle=r=>({x:(r.x1+r.x2)/2,y:(r.y1+r.y2)/2,z:r.z1});
          const scenes=[{name:'opening',x:458,y:700,z:0}];
          for(const district of WORLD.districts) {
            const area=WORLD.neighbourhoods.find(a=>a.districtId===district.id && a.profile!=='island');
            const road=WORLD.roads.find(r=>area.roadIds.includes(r.id)&&r.access.includes('car')&&!r.bridge&&!r.tunnel);
            if(road) scenes.push({name:district.id,x:(road.x1+road.x2)/2,y:(road.y1+road.y2)/2,z:0});
          }
          for(const profile of ['finance','coastal','civic']) {
            const b=WORLD.buildings.find(b=>b.profile===profile&&!b.protectedPrologue);
            if(b){const p=snapToRoad(WORLD,{x:b.x-15,y:b.y+b.h/2},{mode:'foot',includeZ:true});
              scenes.push({name:'facade-'+profile,x:p.x,y:p.y,z:p.z});}
          }
          scenes.push({name:'bridge',...middle(span),car:true},{name:'bore',...middle(bore),car:true});
          const lake=WORLD.lakes[0];scenes.push({name:'swimming',x:lake.x+lake.w/2,y:lake.y+lake.h/2,z:0});
          return scenes;
        }""")
        scenes = []
        for fixture in fixtures:
            await page.evaluate("""point => {
              const s=lowlight.state;s.mission=null;s.dialogue=null;s.hostiles=[];
              s.wanted.level=0;s.policeDispatch.reports=[];
              for(const car of s.vehicles) car.occupied=false;
              Object.assign(s.player,{x:point.x,y:point.y,z:point.z,groundZ:point.z,vz:0,
                health:100,armour:100,vehicleId:null,traversal:null,cover:null});
              if(point.car){const car=s.vehicles.find(v=>v.id==='starter-taxi');
                Object.assign(car,{x:point.x,y:point.y,z:point.z,groundZ:point.z,speed:0,occupied:true});
                s.player.vehicleId=car.id;}
              lowlight.game.cam.snap=true;lowlight.refresh();
            }""", fixture)
            await page.wait_for_timeout(450)
            await page.screenshot(path=str(output / f"{engine}-{fixture['name']}.png"))
            sample = await page.evaluate("""() => new Promise(resolve=>{
              const times=[];function frame(time){times.push(time);if(times.length<25)requestAnimationFrame(frame);
                else resolve({fps:24000/(times[24]-times[0]),player:{x:lowlight.state.player.x,y:lowlight.state.player.y,z:lowlight.state.player.z,swimming:lowlight.state.player.swimming},
                  engineErrors:lowlight.game.errors.map(e=>String(e.error||e)),map:lowlight.mapStats(),
                  overflow:document.documentElement.scrollWidth>innerWidth+1});}requestAnimationFrame(frame);
            })""")
            if sample["engineErrors"] or sample["overflow"]:
                raise AssertionError(f"{engine}/{fixture['name']}: {sample}")
            if fixture["name"] == "swimming" and not sample["player"]["swimming"]:
                raise AssertionError("Declared lake fixture did not activate swimming")
            scenes.append({"fixture": fixture, "sample": sample})
        if errors:
            raise AssertionError(errors)
        return {"engine": engine, "passed": True, "pixelComparisons": comparisons,
                "scenes": scenes, "errors": errors}
    except Exception as error:
        await page.screenshot(path=str(output / f"{engine}-failure.png"))
        return {"engine": engine, "passed": False, "error": str(error), "errors": errors}
    finally:
        await context.close()
        await browser.close()


async def main(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        results = []
        for engine in args.engines.split(","):
            result = await check(playwright, engine.strip(), args.url, output)
            results.append(result)
            print(json.dumps(result), flush=True)
    (output / "report.json").write_text(json.dumps({"fixtureNotice": __doc__, "results": results}, indent=2) + "\n")
    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--engines", default="chromium,webkit,firefox")
    parser.add_argument("--output", default="/tmp/lowlight-city-qa")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
