#!/usr/bin/env python3
"""Attempt LOWLIGHT's opening with genuine browser input and read-only telemetry.

Starts in an isolated empty storage context. No position, health, ammunition,
actor, mission, RNG or clock mutation is permitted. Navigation/aiming can read
the debug state and road graph; movement, shops, firing and interactions use UI.
Partial failures are retained rather than being described as a full playthrough.
"""

import argparse
import asyncio
import json
import math
from pathlib import Path
import sys
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import async_playwright


def distance(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def angle_error(a, b):
    return math.atan2(math.sin(a - b), math.cos(a - b))


def url_debug(url):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("play", None)
    query["debug"] = "1"
    return urlunsplit(parts._replace(query=urlencode(query)))


class Driver:
    def __init__(self, page, world, report, output):
        self.page, self.world, self.report, self.output = page, world, report, output
        self.held = set()
        self.route = []
        self.route_goal = None
        self.route_index = 1
        self.route_started = time.monotonic()
        self.last_position = None
        self.stalled = 0
        self.recoveries = 0
        self.accepted_deaths = 0
        self.parked_vehicle_id = 'starter-taxi'
        self.static_rects=world['buildings']+world.get('obstacles',[])
        self.last_chase_log=-1

    async def read(self):
        return await self.page.evaluate("""() => {
          const s=lowlight.state;
          return {time:s.time,player:{...s.player},mission:s.mission,dialogue:s.dialogue,
            wanted:s.wanted,vehicle:s.vehicles.find(v=>v.id===s.player.vehicleId)||null,
            vehicles:s.vehicles.map(v=>({id:v.id,spec:v.spec,x:v.x,y:v.y,speed:v.speed,angle:v.angle,health:v.health,policeControlled:v.policeControlled})),
            hostiles:s.hostiles.map(e=>({...e})),police:s.police.map(e=>({...e})),
            completed:s.progress.completed,failed:s.progress.failed,deaths:s.progress.deaths,
            arrests:s.progress.arrests,notices:s.notifications.slice(-4),paused:lowlight.game.paused};
        }""")

    async def keys(self, wanted, duration=.08):
        wanted = set(wanted)
        for key in self.held - wanted:
            await self.page.keyboard.up(key)
        for key in wanted - self.held:
            await self.page.keyboard.down(key)
        self.held = wanted
        self.report["inputFrames"] += 1
        if duration:
            await self.page.wait_for_timeout(duration * 1000)

    async def press(self, key):
        await self.keys([], 0)
        await self.page.keyboard.press(key, delay=85)
        self.report["presses"][key] = self.report["presses"].get(key, 0) + 1
        await self.page.wait_for_timeout(110)

    async def stop(self):
        s = await self.read()
        if s["vehicle"]:
            await self.keys(["Shift"], .65)
        await self.keys([], .04)

    async def ordinary_retry(self):
        if self.accepted_deaths >= 1:
            raise RuntimeError('A second real player death ended this natural attempt')
        await self.keys([], 0)
        await self.log('genuine-death-and-failed-assignment')
        await self.page.screenshot(path=str(self.output/'genuine-death.png'))
        await self.page.wait_for_function('lowlight.state.player.health>0', timeout=10000)
        s=await self.read()
        self.accepted_deaths=s['deaths']
        self.route_goal=None
        await self.log('ordinary-clinic-respawn-retry',{'failed':s['failed'][-1:]})

    async def dialogue(self):
        for _ in range(8):
            if not (await self.read())["dialogue"]:
                return
            await self.press("e")
        raise RuntimeError("Conversation did not finish after eight genuine E inputs")

    async def log(self, label, extra=None):
        s = await self.read()
        record = {"label": label, "time": s["time"], "position": {"x": s["player"]["x"], "y": s["player"]["y"]},
                  "health": s["player"]["health"], "armour": s["player"]["armour"], "money": s["player"]["money"],
                  "vehicle": s["vehicle"], "mission": s["mission"], "wanted": s["wanted"], "extra": extra}
        self.report["timeline"].append(record)
        (self.output/'live-report.json').write_text(json.dumps(self.report,indent=2)+'\n')
        print(json.dumps({"event": label, "completed": s["completed"], "health": record["health"], "money": record["money"], "position": record["position"]}), flush=True)

    async def route_to(self, goal):
        s = await self.read()
        route = await self.page.evaluate("""async point => {
          const {WORLD}=await import('/src/world.js');const {findRoute}=await import('/src/navigation.js');
          return findRoute(WORLD,lowlight.state.player,point);
        }""", goal)
        if not route:
            raise RuntimeError(f"No legal road route to {goal}")
        simple = [route[0]]
        for i in range(1, len(route) - 1):
            a, b, c = simple[-1], route[i], route[i + 1]
            cross = (b["x"] - a["x"]) * (c["y"] - b["y"]) - (b["y"] - a["y"]) * (c["x"] - b["x"])
            if abs(cross) > .001:
                simple.append(b)
        simple.append(route[-1])
        self.route, self.route_goal, self.route_index = simple, dict(goal), 1
        self.stalled = 0
        self.last_position = {"x": s["player"]["x"], "y": s["player"]["y"]}
        self.route_started = time.monotonic()

    async def driving_step(self, goal, radius=22, speed=54, stop_on_arrival=True):
        s = await self.read()
        if not s["vehicle"]:
            raise RuntimeError("Vehicle driving requested after the player left or lost the vehicle")
        car = s["vehicle"]
        if distance(car, goal) < radius:
            if stop_on_arrival:
                await self.stop()
            return True
        if self.route_goal != goal or not self.route:
            await self.route_to(goal)
        while self.route_index < len(self.route) - 1:
            start, end = self.route[self.route_index-1], self.route[self.route_index]
            vx, vy = end['x']-start['x'], end['y']-start['y']
            size = math.hypot(vx,vy) or 1
            remaining = ((end['x']-car['x'])*vx+(end['y']-car['y'])*vy)/size
            if remaining >= 17:
                break
            self.route_index += 1
        waypoint = self.route[self.route_index]
        previous = self.route[max(0, self.route_index - 1)]
        dx, dy = waypoint["x"] - previous["x"], waypoint["y"] - previous["y"]
        length = math.hypot(dx, dy) or 1
        nx, ny = dx / length, dy / length
        along = max(0, min(length, (car["x"] - previous["x"]) * nx + (car["y"] - previous["y"]) * ny))
        look = min(length, along + max(18, abs(car["speed"]) * .45))
        offset = 0
        obstacles = []
        for other in s["vehicles"]:
            if other["id"] == car["id"] or other["health"] <= 0:
                continue
            ahead = (other["x"] - car["x"]) * nx + (other["y"] - car["y"]) * ny
            lateral = (other["x"] - previous["x"]) * -ny + (other["y"] - previous["y"]) * nx
            if 0 < ahead < 75 and abs(lateral) < 32:
                obstacles.append((ahead, lateral))
        # Choose a lane by physical clearance, including the authored low rail.
        # This only changes genuine steering targets, never game state.
        current_lateral = (car['x']-previous['x'])*-ny+(car['y']-previous['y'])*nx
        lane_scores = []
        for lane in [0, -24, 24]:
            score = abs(lane)*.05 + abs(lane-current_lateral)*.025
            for ahead, lateral in obstacles:
                score += max(0, 23-abs(lateral-lane))*3
            ahead_limit = min(length, along+100)
            for step in range(13):
                progress = along+(ahead_limit-along)*step/12
                px = previous['x']+nx*progress-ny*lane
                py = previous['y']+ny*progress+nx*lane
                nearby_rects=(r for r in self.static_rects if abs(r['x']-px)<r['w']+12 and abs(r['y']-py)<r['h']+12)
                for rect in nearby_rects:
                    qx=max(rect['x'],min(rect['x']+rect['w'],px))
                    qy=max(rect['y'],min(rect['y']+rect['h'],py))
                    if math.hypot(px-qx,py-qy)<10.6:
                        score += 1000
            lane_scores.append((score,lane))
        offset = min(lane_scores)[1]
        target = {"x": previous["x"] + nx * look - ny * offset, "y": previous["y"] + ny * look + nx * offset}
        desired_angle = math.atan2(target["y"] - car["y"], target["x"] - car["x"])
        error = angle_error(desired_angle, car["angle"])
        desired_speed = speed
        if abs(error) > .3:
            desired_speed = min(desired_speed, 28)
        if distance(car, waypoint) < 75 and self.route_index < len(self.route) - 1:
            next_point = self.route[self.route_index + 1]
            next_angle = math.atan2(next_point["y"] - waypoint["y"], next_point["x"] - waypoint["x"])
            if abs(angle_error(next_angle, math.atan2(ny, nx))) > .4:
                desired_speed = min(desired_speed, 28)
        if self.route_index == len(self.route) - 1:
            desired_speed = min(desired_speed, max(15, distance(car, goal) * 1.15))
        if obstacles and min(obstacles)[0] < 28:
            desired_speed = min(desired_speed, 23)
        keys = []
        if car["speed"] < desired_speed - 4:
            keys.append("w")
        elif car["speed"] > desired_speed + 5:
            keys.append("Shift")
        if abs(error) > .075:
            keys.append("d" if error > 0 else "a")
        travel = distance(car, self.last_position) if self.last_position else 1
        self.stalled = self.stalled + 1 if travel < .18 else 0
        self.last_position = {"x": car["x"], "y": car["y"]}
        if self.stalled > 24:
            await self.keys(["s", "d"], .45)
            await self.keys(["w", "a"], .45)
            self.recoveries += 1
            await self.route_to(goal)
            if self.recoveries > 12:
                raise RuntimeError("Driver could not recover from repeated physical obstructions")
            return False
        await self.keys(keys)
        return False

    async def go(self, goal, radius=22, speed=54, timeout=90):
        began = time.monotonic()
        while time.monotonic() - began < timeout:
            s = await self.read()
            if s["player"]["health"] <= 0 or s["deaths"]>self.accepted_deaths:
                await self.ordinary_retry(); return False
            if s["vehicle"]:
                if await self.driving_step(goal, radius, speed):
                    return True
            else:
                if distance(s["player"], goal) < radius:
                    await self.keys([], .04)
                    return True
                await self.walking_step(s, goal)
        raise RuntimeError(f"Genuine navigation timed out at {s['player']['x']:.1f},{s['player']['y']:.1f} towards {goal}")

    def foot_blocked(self, s, point):
        nearby_rects=(r for r in self.static_rects if abs(r['x']-point['x'])<r['w']+8 and abs(r['y']-point['y'])<r['h']+8)
        for rect in nearby_rects:
            qx=max(rect['x'],min(rect['x']+rect['w'],point['x']))
            qy=max(rect['y'],min(rect['y']+rect['h'],point['y']))
            if math.hypot(point['x']-qx,point['y']-qy)<7.1:
                return True
        for car in s['vehicles']:
            if car['health']<=0:
                continue
            spec=self.world['vehicleSpecs'][car['spec']]
            dx,dy=point['x']-car['x'],point['y']-car['y']
            c,si=math.cos(car['angle']),math.sin(car['angle'])
            lx,ly=dx*c+dy*si,-dx*si+dy*c
            qx=max(-spec['length']/2,min(spec['length']/2,lx))
            qy=max(-spec['width']/2,min(spec['width']/2,ly))
            if math.hypot(lx-qx,ly-qy)<7.1:
                return True
        return False

    async def walking_step(self, s, goal):
        target=goal
        if distance(s['player'],goal)>100:
            if self.route_goal!=goal:
                await self.route_to(goal)
            while self.route_index<len(self.route)-1 and distance(s['player'],self.route[self.route_index])<12:
                self.route_index+=1
            target=self.route[self.route_index]
            if self.route_index==len(self.route)-1 and distance(s['player'],target)<18:
                target=goal
        candidates=[]
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                if dx==dy==0:
                    continue
                norm=math.hypot(dx,dy)
                vx,vy=dx/norm,dy/norm
                points=[{'x':s['player']['x']+vx*step,'y':s['player']['y']+vy*step} for step in [1,3,6,12]]
                blocked=sum(self.foot_blocked(s,point) for point in points)
                cost=distance(points[-1],target)+blocked*500
                candidates.append((cost,dx,dy,blocked))
        _,dx,dy,blocked=min(candidates)
        if blocked:
            await self.press('j')
        keys=(["d"] if dx>0 else ["a"] if dx<0 else [])+(["s"] if dy>0 else ["w"] if dy<0 else [])
        await self.keys(keys,.08)

    async def ensure_vehicle(self, preferred=None):
        s = await self.read()
        if s["vehicle"]:
            return True
        options = [v for v in s["vehicles"] if v["health"] > 0 and (not preferred or v["id"] == preferred) and (preferred or abs(v['speed'])<20)]
        if not options and preferred=='starter-taxi':
            required = await self.page.evaluate("""async () => {
              const {MISSIONS}=await import('/src/simulation.js');const m=lowlight.state.mission;
              const stage=m&&MISSIONS.find(d=>d.id===m.id)?.stages[m.stage];
              return stage?.requiredVehicle||stage?.vehicle||null;
            }""")
            options=[v for v in s['vehicles'] if v['health']>0 and abs(v['speed'])<2 and not v.get('policeControlled')]
            if required=='starter-taxi':
                options=[]
            elif required=='taxi':
                options=[v for v in options if v['spec']=='taxi']
            if options:
                await self.log('alternate-vehicle-recovery-selected',{'reason':'owned taxi destroyed','candidate':min(options,key=lambda v:distance(v,s['player']))['id']})
        if not options:
            raise RuntimeError(f"Required live vehicle {preferred} is unavailable")
        vehicle = min(options, key=lambda v: distance(v, s["player"]))
        if not await self.approach_vehicle(vehicle['id']):
            return False
        for _ in range(5):
            await self.press("e")
            s = await self.read()
            if s["vehicle"]:
                self.route_goal = None
                self.parked_vehicle_id=s['vehicle']['id']
                return True
            await self.dialogue()
        raise RuntimeError(f"E did not enter the nearby {vehicle['id']}; latest notices: {s['notices']}")

    async def approach_vehicle(self, vehicle_id, timeout=60):
        """Walk until the actual context offers this live vehicle's E action."""
        began=time.monotonic();side=None
        while time.monotonic()-began<timeout:
            s=await self.read()
            if s['player']['health']<=0 or s['deaths']>self.accepted_deaths:
                await self.ordinary_retry();return False
            vehicle=next((v for v in s['vehicles'] if v['id']==vehicle_id and v['health']>0),None)
            if not vehicle:
                return False
            candidate=await self.page.evaluate("""async()=>{
              const {nearestInteractable}=await import('/src/simulation.js');
              const c=nearestInteractable(lowlight.state);
              return c&&{id:c.id,type:c.type,available:c.available,distance:c.distance};
            }""")
            if candidate and candidate['type']=='vehicle' and candidate['id']==vehicle_id and candidate.get('available',True):
                await self.keys([],0);return True
            target=vehicle
            if distance(s['player'],vehicle)<36:
                # Services can own E on one side. Choose a reachable other side
                # through genuine walking, never an invented smaller entry radius.
                if side is None:
                    candidates=[{'x':vehicle['x']+math.cos(i*math.pi/4)*26,
                                 'y':vehicle['y']+math.sin(i*math.pi/4)*26} for i in range(8)]
                    candidates=[p for p in candidates if not self.foot_blocked(s,p)]
                    if not candidates:
                        raise RuntimeError('No reachable side around the live vehicle')
                    side=max(candidates,key=lambda p:min(distance(p,l) for l in self.world['locations']))
                target=side
            await self.walking_step(s,target)
        raise RuntimeError(f'Actual E-entry availability did not become reachable for {vehicle_id}')

    async def park_exit(self, target):
        s = await self.read()
        if s["vehicle"]:
            self.parked_vehicle_id=s['vehicle']['id']
            # Park outside service interaction radii so E is an actual vehicle exit.
            desired = {"x": target["x"] - 65, "y": target["y"]}
            parked = await self.page.evaluate("""async p=>{
              const {WORLD}=await import('/src/world.js');const {snapToRoad}=await import('/src/navigation.js');
              const q=snapToRoad(WORLD,p);return {x:q.x,y:q.y};
            }""", desired)
            if not await self.go(parked, radius=25):
                return False
            for _ in range(3):
                await self.press("e")
                if not (await self.read())["vehicle"]:
                    break
        return await self.go(target, radius=24)

    async def choose_pistol(self):
        for _ in range(8):
            if (await self.read())["player"]["weapon"] == "pistol":
                return
            await self.press("q")
        raise RuntimeError("Could not equip the owned pistol with genuine Q input")

    async def combat(self):
        await self.dialogue()
        await self.choose_pistol()
        began = time.monotonic()
        while time.monotonic() - began < 35:
            s = await self.read()
            if s["player"]["health"] <= 0 or s["deaths"]>self.accepted_deaths:
                await self.ordinary_retry(); return False
            enemies = [e for e in s["hostiles"] if e["health"] > 0]
            if not enemies:
                await self.keys([], .05)
                await self.log("combat-cleared")
                return True
            ammo = s["player"]["ammo"]["pistol"]
            if ammo["clip"] == 0:
                await self.press("r")
                await self.keys([], 1.25)
                continue
            enemy = min(enemies, key=lambda e: distance(e, s["player"]))
            point = await self.page.evaluate("""id => {
              const e=lowlight.state.hostiles.find(e=>e.id===id), game=lowlight.game,sc=game.screen;
              const p=game.view.p(e.x,e.y,(e.z||0)+13), rect=sc.canvas.getBoundingClientRect();
              return {x:rect.left+((p[0]-sc.ix)*sc.S+sc.OX-Math.round(sc.fx*sc.S))/sc.dpr,
                      y:rect.top+((p[1]-sc.iy)*sc.S+sc.OY-Math.round(sc.fy*sc.S))/sc.dpr};
            }""", enemy["id"])
            await self.page.mouse.move(point["x"], point["y"])
            await self.keys(["Space"], .11)
        raise RuntimeError("Genuine combat exceeded 35 seconds without clearing the encounter")

    async def escape(self):
        await self.dialogue()
        s=await self.read()
        if not s['vehicle']:
            if not await self.ensure_vehicle(self.parked_vehicle_id):
                return False
        began = time.monotonic()
        s = await self.read()
        axis='y' if abs(math.cos(s['vehicle']['angle'] if s['vehicle'] else 0))>.6 else 'x'
        goal=self.escape_turn(s,axis)
        concealment=await self.concealed_escape_point()
        hide_phase='drive' if concealment else None
        if concealment:
            goal=concealment['road']
            await self.log('concealment-route-selected',concealment)
        while time.monotonic() - began < 100:
            s = await self.read()
            if not s["wanted"]["level"]:
                await self.stop(); await self.log("police-escaped"); return
            if s["player"]["health"] <= 0 or s["deaths"]>self.accepted_deaths:
                await self.ordinary_retry(); return False
            if s['time']-self.last_chase_log>=1:
                self.last_chase_log=s['time']
                await self.log('genuine-pursuit-telemetry',{'distanceFromLastSeen':distance(s['player'],s['wanted']['lastSeen']),
                    'police':[{k:e.get(k) for k in ['id','x','y','role','inVehicle']} for e in s['police']]})
            if not s['vehicle'] and hide_phase!='walk':
                ride=sorted([v for v in s['vehicles'] if v['health']>0 and abs(v['speed'])<20],key=lambda v:distance(v,s['player']))
                if ride and distance(ride[0],s['player'])<70:
                    await self.ensure_vehicle(ride[0]['id'])
                    continue
            # Wait only when real police perception confirms hidden/outside.
            if not s['wanted'].get('observed') and s['wanted']['status']=='cooling' and s['wanted']['timer']>.5:
                await self.stop()
                await self.keys([], .15)
                continue
            if concealment and distance(s['player'],goal)<28:
                if hide_phase=='drive':
                    await self.stop()
                    await self.press('e')
                    if not (await self.read())['vehicle']:
                        hide_phase='walk';goal=concealment['point'];self.route_goal=None
                    continue
                if hide_phase=='walk':
                    await self.keys([], .15)
                    continue
            if distance(s["player"], goal) < 35:
                axis='x' if axis=='y' else 'y'
                goal=self.escape_turn(s,axis)
                self.route_goal = None
            if s["vehicle"]:
                await self.driving_step(goal, 25, 175 if s['vehicle']['spec']=='sports' else 132,stop_on_arrival=False)
            else:
                await self.walking_step(s,goal)
        raise RuntimeError(f"Could not naturally clear police attention: {s['wanted']}")

    async def concealed_escape_point(self):
        return await self.page.evaluate("""async () => {
          const {WORLD}=await import('/src/world.js');const {createTerrain}=await import('/src/terrain.js');
          const {snapToRoad}=await import('/src/navigation.js');const t=createTerrain(WORLD),s=lowlight.state,p=s.player;
          const observers=s.police.filter(e=>e.health>0), candidates=[];
          for(const b of WORLD.buildings){
            if(Math.hypot(b.x-p.x,b.y-p.y)>700)continue;
            for(const q of [{x:b.x-9,y:b.y+b.h/2},{x:b.x+b.w+9,y:b.y+b.h/2},
              {x:b.x+b.w/2,y:b.y-9},{x:b.x+b.w/2,y:b.y+b.h+9}]){
              const d=Math.hypot(q.x-p.x,q.y-p.y),known=Math.hypot(q.x-s.wanted.lastSeen.x,q.y-s.wanted.lastSeen.y);
              if(d<100||d>650||known<s.wanted.searchRadius+25||t.isBlocked(q.x,q.y,7,0))continue;
              const hidden=observers.every(e=>Math.hypot(q.x-e.x,q.y-e.y)>260||!t.hasLineOfSight(e,{...q,z:0,health:100}));
              if(!hidden)continue;const road=snapToRoad(WORLD,q);if(!road)continue;
              candidates.push({point:q,road:{x:road.x,y:road.y},distance:d,known,walk:road.distance});
            }
          }
          candidates.sort((a,b)=>(a.distance+a.walk*.7)-(b.distance+b.walk*.7));return candidates[0]||null;
        }""")

    def escape_turn(self,s,axis):
        p=s['player'];known=s['wanted']['lastSeen']
        police=[e for e in s['police'] if e['health']>0]
        nearest=min(police,key=lambda e:distance(e,p)) if police else known
        xs=sorted({r['x1'] for r in self.world['roads'] if abs(r['x1']-r['x2'])<.01 and min(r['y1'],r['y2'])<=p['y']<=max(r['y1'],r['y2'])})
        ys=sorted({r['y1'] for r in self.world['roads'] if abs(r['y1']-r['y2'])<.01 and min(r['x1'],r['x2'])<=p['x']<=max(r['x1'],r['x2'])})
        if not xs or not ys:
            raise RuntimeError('Escape position has no connected road crossing')
        x=min(xs,key=lambda x:abs(x-p['x']));y=min(ys,key=lambda y:abs(y-p['y']))
        if axis=='y':
            directions=[candidate for candidate in ys if abs(candidate-p['y'])>100]
            preferred=[candidate for candidate in directions if (candidate-p['y'])*(p['y']-nearest['y'])>=0]
            y=min(preferred or directions,key=lambda n:abs(n-p['y']))
        else:
            directions=[candidate for candidate in xs if abs(candidate-p['x'])>100]
            preferred=[candidate for candidate in directions if (candidate-p['x'])*(p['x']-nearest['x'])>=0]
            x=min(preferred or directions,key=lambda n:abs(n-p['x']))
        return {'x':x,'y':y}


async def main(args):
    output = Path(args.output).resolve()
    repository=Path(__file__).resolve().parents[1]
    if output==repository or repository in output.parents:
        raise ValueError('Opening reports must be written outside the repository')
    output.mkdir(parents=True, exist_ok=True)
    report = {"scope": "Isolated clean save, read-only debug navigation, genuine UI/key/pointer input; no state/actor/health/ammo/time mutation.",
              "timeline": [], "inputFrames": 0, "presses": {}, "pageErrors": [], "consoleErrors": [], "complete": False}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        page.on("console", lambda message: report["consoleErrors"].append(message.text) if message.type == "error" else None)
        driver = None
        try:
            await page.goto(url_debug(args.url)); await page.wait_for_function("window.lowlight")
            await page.click("#settings-button"); await page.select_option("#camera-setting", "topdown"); await page.locator("#volume").fill("0"); await page.click("#info-dialog .close-dialog")
            await page.click("#new-game")
            world = await page.evaluate("async()=>{const {WORLD}=await import('/src/world.js');const {VEHICLE_SPECS}=await import('/src/simulation.js');return {...WORLD,vehicleSpecs:VEHICLE_SPECS}}")
            missions = await page.evaluate("async()=>{const {MISSIONS}=await import('/src/simulation.js');return MISSIONS}")
            driver = Driver(page, world, report, output); await driver.log("clean-start")
            began = time.monotonic(); last_stage = None; supplied_armour = False; sports_selected=False
            while time.monotonic() - began < args.timeout:
                s = await driver.read()
                if s["deaths"]>driver.accepted_deaths or s["player"]["health"] <= 0:
                    await driver.ordinary_retry(); continue
                if len(s["completed"]) == 4:
                    report["complete"] = True; break
                if s["dialogue"]:
                    await driver.dialogue(); continue
                if not s["mission"]:
                    await driver.stop()
                    if s["wanted"]["level"]:
                        await driver.escape(); continue
                    if s['vehicle'] and s['vehicle']['health']<80 and s['player']['money']>=120:
                        garage=next(l for l in world['locations'] if l['type']=='garage')
                        if not await driver.go(garage,radius=15):
                            continue
                        before=(await driver.read())['player']['money']
                        await driver.press('e')
                        after=await driver.read()
                        await driver.log('ordinary-garage-repair',{'paid':before-after['player']['money'],'vehicleHealth':after['vehicle']['health'] if after['vehicle'] else None})
                    # Ordinary paid armour after the first earned mission reward.
                    if len(s["completed"]) == 1 and not supplied_armour:
                        supply = next(l for l in world["locations"] if l["type"] == "armour")
                        await driver.park_exit(supply); await driver.go(supply, radius=9); before = (await driver.read())["player"]["money"]
                        await driver.press("e"); after = await driver.read()
                        if after["player"]["armour"] > 0:
                            supplied_armour = True; await driver.log("ordinary-armour-purchase", {"paid": before-after["player"]["money"]})
                        else:
                            raise RuntimeError("Ordinary supply interaction did not buy armour")
                    if len(s['completed'])==1 and not sports_selected:
                        if not (await driver.read())['vehicle']:
                            await driver.ensure_vehicle('starter-taxi')
                        sport=next(v for v in (await driver.read())['vehicles'] if v['spec']=='sports' and v['health']>0)
                        await driver.park_exit(sport)
                        await driver.ensure_vehicle(sport['id'])
                        sports_selected=True
                        await driver.log('ordinary-sports-car-entry')
                    next_mission = next(m for m in missions if m["id"] not in s["completed"] and (not m["prerequisite"] or m["prerequisite"] in s["completed"]))
                    contact = next_mission["stages"][0]["target"]
                    # Return to a known live taxi through actual walking/entry if needed.
                    if not (await driver.read())["vehicle"]:
                        await driver.ensure_vehicle("starter-taxi")
                    await driver.park_exit(contact); await driver.press("e"); continue
                mission = s["mission"]
                marker = (mission["id"], mission["stage"])
                if marker != last_stage:
                    await driver.log("mission-stage", {"id": marker[0], "stage": marker[1]})
                    await page.screenshot(path=str(output / f"{marker[0]}-{marker[1]}.png")); last_stage = marker; driver.route_goal = None
                definition = next(m for m in missions if m["id"] == mission["id"]); stage = definition["stages"][mission["stage"]]
                kind = stage["type"]
                if kind == "vehicle":
                    await driver.ensure_vehicle(stage["vehicle"])
                elif kind in ["drive", "reach"]:
                    if stage.get("requiredVehicle") and not s["vehicle"]:
                        await driver.ensure_vehicle("medicine-van" if stage["requiredVehicle"] == "medicine-van" else "starter-taxi")
                    elif not s['vehicle'] and distance(s['player'],stage['target'])>100:
                        if not await driver.ensure_vehicle(driver.parked_vehicle_id):
                            continue
                    if mission["id"] == "cold-freight" and mission["stage"] == 3 and s["player"]["ammo"]["pistol"]["clip"] < 10:
                        await driver.press("r")
                    await driver.go(stage["target"], radius=min(24, stage["target"]["radius"]-2))
                elif kind == "interact":
                    if stage.get("onFoot") and s["vehicle"]:
                        if not await driver.park_exit(stage["target"]):
                            continue
                    else:
                        if not s['vehicle'] and distance(s['player'],stage['target'])>100:
                            if not await driver.ensure_vehicle(driver.parked_vehicle_id):
                                continue
                        if not await driver.go(stage["target"], radius=25):
                            continue
                    await driver.press("e")
                elif kind == "combat":
                    await driver.combat()
                elif kind == "escape":
                    await driver.escape()
                else:
                    raise RuntimeError(f"Unknown authored mission phase {kind}")
            if not report["complete"]:
                raise RuntimeError("Natural run reached its wall-clock timeout")
            await driver.stop(); await driver.log("four-opening-jobs-complete")
        except Exception as error:
            report["blocker"] = str(error)
            if driver:
                await driver.keys([], 0)
                report["partialState"] = await driver.read()
                await driver.log("honest-partial-blocker", {"reason": str(error)})
            await page.screenshot(path=str(output / "partial-or-final.png"))
        finally:
            if driver:
                report["finalState"] = await driver.read(); report["collisionRecoveries"] = driver.recoveries
            await context.close(); await browser.close()
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"complete": report["complete"], "blocker": report.get("blocker"), "report": str(output / 'report.json')}), flush=True)
    return 0 if report["complete"] and not report["pageErrors"] and not report["consoleErrors"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--output", default="/tmp/lowlight-opening-qa/first")
    parser.add_argument("--timeout", type=float, default=600)
    sys.exit(asyncio.run(main(parser.parse_args())))
