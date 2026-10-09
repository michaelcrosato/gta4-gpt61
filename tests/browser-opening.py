#!/usr/bin/env python3
"""Attempt the four additional jobs on a legacy build with genuine browser input.

Requires a build whose New Game starts First Shift, such as published 0.4.1.
Canonical Night Crossing builds fail this precondition immediately; their
arrival/UI and recovery checks are browser-smoke.py and browser-campaign-interruption.py.

Starts in an isolated empty storage context. No position, health, ammunition,
actor, mission, RNG or clock mutation is permitted. Navigation/aiming can read
the debug state and road graph; movement, shops, firing and interactions use UI.
Partial failures are retained rather than being described as a full playthrough.
"""

import argparse
import asyncio
import hashlib
import json
import math
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import Error as PlaywrightError
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
        self.parked_vehicle_id = "starter-taxi"
        self.static_rects = world["buildings"] + world.get("obstacles", [])
        self.last_chase_log = -1
        self.drive_checkpoint = None
        self.route_recoveries = 0

    async def read(self):
        return await self.page.evaluate("""async () => {
          const s=lowlight.state;
          const roomId=s.interior?.active?.roomId||null;
          const {interiorCollisionVolumes}=await import('/src/interiors.js');
          return {time:s.time,player:{...s.player},mission:s.mission,dialogue:s.dialogue,
            sceneId:roomId,roomSolids:roomId?interiorCollisionVolumes(s):[],
            interior:roomId?{roomId,doors:s.interior.rooms[roomId].doors}:null,
            wanted:s.wanted,vehicle:s.vehicles.find(v=>v.id===s.player.vehicleId)||null,
            vehicles:s.vehicles.map(v=>({id:v.id,spec:v.spec,x:v.x,y:v.y,z:v.z||0,speed:v.speed,angle:v.angle,health:v.health,policeControlled:v.policeControlled,sceneId:v.sceneId??(v.scene?.kind==='interior'?v.scene.id:null)})),
            walkDirections:[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]].map(([sx,sy])=>({sx,sy,world:lowlight.game.view.screenDirToGround(sx,sy)})),
            hostiles:s.hostiles.map(e=>({...e})),police:s.police.map(e=>({...e})),
            pedestrians:s.pedestrians.map(e=>({id:e.id,x:e.x,y:e.y,z:e.z||0,health:e.health,sceneId:e.sceneId??null})),
            completed:s.progress.completed,failed:s.progress.failed,deaths:s.progress.deaths,
            arrests:s.progress.arrests,notices:s.notifications.slice(-4),paused:lowlight.game.paused};
        }""")

    async def keys(self, wanted, duration=0.08):
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
            await self.keys(["Shift"], 0.65)
        await self.keys([], 0.04)

    async def ordinary_retry(self):
        if self.accepted_deaths >= 1:
            raise RuntimeError("A second real player death ended this natural attempt")
        await self.keys([], 0)
        await self.log("genuine-death-and-failed-assignment")
        await self.capture("genuine-death.png")
        await self.page.wait_for_function(
            "lowlight.state.player.health>0", timeout=10000
        )
        s = await self.read()
        self.accepted_deaths = s["deaths"]
        self.route_goal = None
        await self.log("ordinary-clinic-respawn-retry", {"failed": s["failed"][-1:]})

    async def dialogue(self):
        for _ in range(8):
            if not (await self.read())["dialogue"]:
                return
            await self.press("e")
        raise RuntimeError("Conversation did not finish after eight genuine E inputs")

    async def log(self, label, extra=None):
        s = await self.read()
        record = {
            "label": label,
            "time": s["time"],
            "position": {"x": s["player"]["x"], "y": s["player"]["y"]},
            "health": s["player"]["health"],
            "armour": s["player"]["armour"],
            "money": s["player"]["money"],
            "vehicle": s["vehicle"],
            "mission": s["mission"],
            "wanted": s["wanted"],
            "extra": extra,
        }
        self.report["timeline"].append(record)
        (self.output / "live-report.json").write_text(
            json.dumps(self.report, indent=2) + "\n"
        )
        print(
            json.dumps(
                {
                    "event": label,
                    "completed": s["completed"],
                    "health": record["health"],
                    "money": record["money"],
                    "position": record["position"],
                }
            ),
            flush=True,
        )

    async def capture(self, name):
        """Retain browser capture failures without aborting still-playable input."""
        requested = name
        path = self.output / name
        take = 1
        while path.exists():
            take += 1
            path = self.output / f"{Path(name).stem}-take-{take}{Path(name).suffix}"
        for attempt in range(2):
            try:
                await self.page.screenshot(path=str(path), timeout=5000)
                self.report.setdefault("captures", []).append(
                    {"requested": requested, "file": path.name}
                )
                return True
            except PlaywrightError as error:
                self.report.setdefault("captureErrors", []).append(
                    {"file": name, "attempt": attempt + 1, "error": str(error)}
                )
                s = await self.read()
                if s["hostiles"] or s["wanted"]["level"] or attempt:
                    return False
                await self.page.wait_for_timeout(150)
        return False

    async def route_to(self, goal):
        s = await self.read()
        if s["sceneId"]:
            raise RuntimeError("City road routing requested from a room-local scene")
        route = await self.page.evaluate(
            """async point => {
          const {WORLD}=await import('/src/world.js');const {findRoute,snapToRoad,createRoadNetwork}=await import('/src/navigation.js');
          const s=lowlight.state,p=s.player,mode=p.vehicleId?'car':'foot',options={mode,includeZ:true};
          if(mode==='foot')return findRoute(WORLD,p,point,options);
          // All graph/weights below are local planning data. The authored graph,
          // live vehicles and simulation remain read-only.
          const graph=createRoadNetwork(WORLD,{mode}),from=snapToRoad(WORLD,p,options),to=snapToRoad(WORLD,point,options);
          if(!from||!to)return [];
          const source=graph.nodes.length,dest=source+1,positions=[...graph.nodes,from,to],extra=new Map(),costs=new Map();
          const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
          const connect=(a,b)=>{if(!extra.has(a))extra.set(a,[]);if(!extra.has(b))extra.set(b,[]);const d=length(positions[a],positions[b]);extra.get(a).push([b,d]);extra.get(b).push([a,d]);};
          for(const [snap,id]of [[from,source],[to,dest]]){
            const index=graph.segments.findIndex(segment=>segment.index===snap.roadIndex),nodes=graph.segmentNodes[index];
            if(!nodes)return findRoute(WORLD,p,point,options);
            let before=nodes[0],after=nodes[nodes.length-1];
            for(const entry of nodes){if(entry.t<=snap.t+1e-7)before=entry;if(entry.t>=snap.t-1e-7){after=entry;break;}}
            connect(id,before.id);connect(id,after.id);
          }
          const stopped=s.vehicles.filter(v=>v.id!==p.vehicleId&&v.health>0&&Math.abs(v.speed)<2&&!(v.sceneId??(v.scene?.kind==='interior'?v.scene.id:null)));
          const penalty=(a,b)=>{
            const key=a<b?a+':'+b:b+':'+a;if(costs.has(key))return costs.get(key);
            const A=positions[a],B=positions[b],dx=B.x-A.x,dy=B.y-A.y,L=dx*dx+dy*dy;let count=0;
            for(const v of stopped){if(Math.abs((v.z||0)-((A.z||0)+(B.z||0))/2)>8)continue;const t=L?Math.max(0,Math.min(1,((v.x-A.x)*dx+(v.y-A.y)*dy)/L)):0;
              if(Math.hypot(v.x-A.x-dx*t,v.y-A.y-dy*t)<22)count++;}
            const cost=count>1?650+(count-2)*180:count*65;costs.set(key,cost);return cost;
          };
          const best=new Map([[source,0]]),parents=new Map(),open=[{id:source,g:0,f:length(from,to)}];
          for(let visits=0;open.length&&visits<12000;visits++){
            open.sort((a,b)=>a.f-b.f||a.id-b.id);const current=open.shift();if(current.g!==best.get(current.id))continue;
            if(current.id===dest){const path=[];let id=dest;while(id!==undefined){const n=positions[id];path.push({x:n.x,y:n.y,z:n.z||0});id=parents.get(id);}return path.reverse();}
            const links=[...(graph.nodes[current.id]?.edges||[]),...(extra.get(current.id)||[])];
            for(const [next,cost]of links){const g=current.g+cost+penalty(current.id,next);if(g>=(best.get(next)??Infinity))continue;best.set(next,g);parents.set(next,current.id);open.push({id:next,g,f:g+length(positions[next],to)});}
          }
          return findRoute(WORLD,p,point,options);
        }""",
            goal,
        )
        if not route:
            raise RuntimeError(f"No legal road route to {goal}")
        simple = [route[0]]
        for i in range(1, len(route) - 1):
            a, b, c = simple[-1], route[i], route[i + 1]
            cross = (b["x"] - a["x"]) * (c["y"] - b["y"]) - (b["y"] - a["y"]) * (
                c["x"] - b["x"]
            )
            forward = (b["x"] - a["x"]) * (c["x"] - b["x"]) + (b["y"] - a["y"]) * (
                c["y"] - b["y"]
            )
            if abs(cross) > 0.001 or forward < 0:
                simple.append(b)
        simple.append(route[-1])
        if self.route_goal != goal:
            self.route_recoveries = 0
        self.route, self.route_goal, self.route_index = simple, dict(goal), 1
        self.drive_checkpoint = None
        self.stalled = 0
        self.last_position = {"x": s["player"]["x"], "y": s["player"]["y"]}
        self.route_started = time.monotonic()

    async def driving_step(self, goal, radius=22, speed=54, stop_on_arrival=True):
        s = await self.read()
        if not s["vehicle"]:
            raise RuntimeError(
                "Vehicle driving requested after the player left or lost the vehicle"
            )
        car = s["vehicle"]
        if distance(car, goal) < radius:
            if stop_on_arrival:
                await self.stop()
            return True
        if self.route_goal != goal or not self.route:
            await self.route_to(goal)
        while self.route_index < len(self.route) - 1:
            start, end = self.route[self.route_index - 1], self.route[self.route_index]
            vx, vy = end["x"] - start["x"], end["y"] - start["y"]
            size = math.hypot(vx, vy) or 1
            remaining = ((end["x"] - car["x"]) * vx + (end["y"] - car["y"]) * vy) / size
            if remaining >= 17:
                break
            self.route_index += 1
        waypoint = self.route[self.route_index]
        previous = self.route[max(0, self.route_index - 1)]
        dx, dy = waypoint["x"] - previous["x"], waypoint["y"] - previous["y"]
        length = math.hypot(dx, dy) or 1
        nx, ny = dx / length, dy / length
        along = max(
            0,
            min(
                length,
                (car["x"] - previous["x"]) * nx + (car["y"] - previous["y"]) * ny,
            ),
        )
        look = min(length, along + max(18, abs(car["speed"]) * 0.45))
        offset = 0
        obstacles = []
        for other in s["vehicles"]:
            if (
                other["id"] == car["id"]
                or other["health"] <= 0
                or other.get("sceneId") != s["sceneId"]
                or abs(other.get("z", 0) - car.get("z", 0)) > 12
            ):
                continue
            ahead = (other["x"] - car["x"]) * nx + (other["y"] - car["y"]) * ny
            lateral = (other["x"] - previous["x"]) * -ny + (
                other["y"] - previous["y"]
            ) * nx
            if 0 < ahead < 75 and abs(lateral) < 32:
                obstacles.append((ahead, lateral))
        # Choose a lane by physical clearance, including the authored low rail.
        # This only changes genuine steering targets, never game state.
        current_lateral = (car["x"] - previous["x"]) * -ny + (
            car["y"] - previous["y"]
        ) * nx
        lane_scores = []
        spec = self.world["vehicleSpecs"][car["spec"]]
        lane_limit = 30
        supporting = []
        for road in self.world["roads"]:
            if road.get("access") is not None and "car" not in road["access"]:
                continue
            rx, ry = road["x2"] - road["x1"], road["y2"] - road["y1"]
            size = math.hypot(rx, ry)
            if size < 0.01 or abs(rx / size * ny - ry / size * nx) > 0.01:
                continue
            projection = max(
                0,
                min(
                    1,
                    ((car["x"] - road["x1"]) * rx + (car["y"] - road["y1"]) * ry)
                    / (size * size),
                ),
            )
            height = (
                road.get("z1", road.get("z", 0))
                + (road.get("z2", road.get("z", 0)) - road.get("z1", road.get("z", 0)))
                * projection
            )
            if abs(height - car.get("z", 0)) > 4:
                continue
            separation = math.hypot(
                car["x"] - road["x1"] - rx * projection,
                car["y"] - road["y1"] - ry * projection,
            )
            supporting.append((separation, road["width"]))
        if supporting:
            lane_limit = max(
                0, min(30, min(supporting)[1] / 2 - spec["width"] * 0.62 - 0.5)
            )
        for lane in sorted(
            {0, -min(24, lane_limit), min(24, lane_limit), -lane_limit, lane_limit}
        ):
            score = abs(lane) * 0.05 + abs(lane - current_lateral) * 0.025
            for ahead, lateral in obstacles:
                score += max(0, 23 - abs(lateral - lane)) * 3
            ahead_limit = min(length, along + 100)
            for step in range(13):
                progress = along + (ahead_limit - along) * step / 12
                px = previous["x"] + nx * progress - ny * lane
                py = previous["y"] + ny * progress + nx * lane
                nearby_rects = (
                    r
                    for r in self.static_rects
                    if abs(r["x"] - px) < r["w"] + 12 and abs(r["y"] - py) < r["h"] + 12
                )
                for rect in nearby_rects:
                    qx = max(rect["x"], min(rect["x"] + rect["w"], px))
                    qy = max(rect["y"], min(rect["y"] + rect["h"], py))
                    if math.hypot(px - qx, py - qy) < 10.6:
                        score += 1000
            tx = previous["x"] + nx * look - ny * lane
            ty = previous["y"] + ny * look + nx * lane
            for fraction in [0.25, 0.5, 0.75, 1]:
                px = car["x"] + (tx - car["x"]) * fraction
                py = car["y"] + (ty - car["y"]) * fraction
                for other in s["vehicles"]:
                    if (
                        other["id"] == car["id"]
                        or other["health"] <= 0
                        or other.get("sceneId") != s["sceneId"]
                        or abs(other.get("z", 0) - car.get("z", 0)) > 12
                    ):
                        continue
                    clearance = (
                        spec["width"]
                        + self.world["vehicleSpecs"][other["spec"]]["width"]
                    ) * 0.69 + 0.2
                    if math.hypot(px - other["x"], py - other["y"]) < clearance:
                        score += 600
                for person in s["pedestrians"] + s["police"]:
                    if (
                        person["health"] <= 0
                        or person.get("inVehicle")
                        or person.get("sceneId") != s["sceneId"]
                        or abs(person.get("z", 0) - car.get("z", 0)) > 12
                    ):
                        continue
                    if (
                        math.hypot(px - person["x"], py - person["y"])
                        < spec["width"] * 0.65 + 8
                    ):
                        score += 250
            lane_scores.append((score, lane))
        offset = min(lane_scores)[1]
        target = {
            "x": previous["x"] + nx * look - ny * offset,
            "y": previous["y"] + ny * look + nx * offset,
        }
        desired_angle = math.atan2(target["y"] - car["y"], target["x"] - car["x"])
        error = angle_error(desired_angle, car["angle"])
        desired_speed = speed
        if abs(error) > 0.3:
            desired_speed = min(desired_speed, 28)
        if distance(car, waypoint) < 75 and self.route_index < len(self.route) - 1:
            next_point = self.route[self.route_index + 1]
            next_angle = math.atan2(
                next_point["y"] - waypoint["y"], next_point["x"] - waypoint["x"]
            )
            if abs(angle_error(next_angle, math.atan2(ny, nx))) > 0.4:
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
        if abs(error) > 0.075:
            keys.append("d" if error > 0 else "a")
        travel = distance(car, self.last_position) if self.last_position else 1
        self.stalled = self.stalled + 1 if travel < 0.18 else 0
        self.last_position = {"x": car["x"], "y": car["y"]}
        checkpoint = self.drive_checkpoint
        if checkpoint is None or checkpoint["index"] != self.route_index:
            self.drive_checkpoint = {
                "time": s["time"],
                "index": self.route_index,
                "distance": distance(car, waypoint),
                "position": dict(self.last_position),
            }
        elif s["time"] - checkpoint["time"] > 1.8:
            progress = checkpoint["distance"] - distance(car, waypoint)
            if progress < 5 and distance(car, checkpoint["position"]) < 12:
                self.stalled = 25
            elif progress > 30:
                self.route_recoveries = 0
            self.drive_checkpoint = None
        if self.stalled > 24:
            await self.log(
                "genuine-driving-obstruction-recovery",
                {"goal": goal, "waypoint": waypoint, "lane": offset},
            )
            await self.keys(["Shift"], 0.25)
            await self.keys(["s"], 0.9)
            await self.keys(["s", "d"], 0.3)
            await self.keys(["w", "a"], 0.3)
            self.recoveries += 1
            self.route_recoveries += 1
            await self.route_to(goal)
            if self.route_recoveries > 12:
                raise RuntimeError(
                    "Driver could not recover from repeated physical obstructions"
                )
            return False
        await self.keys(keys)
        return False

    async def go(self, goal, radius=22, speed=54, timeout=90):
        began = time.monotonic()
        while time.monotonic() - began < timeout:
            s = await self.read()
            if s["player"]["health"] <= 0 or s["deaths"] > self.accepted_deaths:
                await self.ordinary_retry()
                return False
            if s["vehicle"]:
                if (
                    s["vehicle"]["id"] == "medicine-van"
                    and s["wanted"]["level"]
                    and s["mission"]
                    and s["mission"]["stageType"] == "drive"
                ):
                    # Keep the actual required van parked while breaking police
                    # sight on foot; returning and delivery still consume the
                    # authored mission deadline. No clocks or bodies are changed.
                    await self.log("medicine-van-parked-for-real-pursuit")
                    await self.escape(on_foot=True)
                    return False
                if s["sceneId"]:
                    return await self.local_drive(goal, radius=radius, timeout=timeout)
                if await self.driving_step(goal, radius, speed):
                    return True
            else:
                if distance(s["player"], goal) < radius:
                    await self.keys([], 0.04)
                    return True
                await self.walking_step(s, goal)
        raise RuntimeError(
            f"Genuine navigation timed out at {s['player']['x']:.1f},{s['player']['y']:.1f} towards {goal}"
        )

    def foot_blocked(self, s, point):
        solids = s["roomSolids"] if s["sceneId"] else self.static_rects
        nearby_rects = (
            r
            for r in solids
            if abs(r["x"] - point["x"]) < r["w"] + 8
            and abs(r["y"] - point["y"]) < r["h"] + 8
        )
        for rect in nearby_rects:
            if not (0 <= s["player"].get("z", 0) < rect.get("height", 40)):
                continue
            qx = max(rect["x"], min(rect["x"] + rect["w"], point["x"]))
            qy = max(rect["y"], min(rect["y"] + rect["h"], point["y"]))
            if math.hypot(point["x"] - qx, point["y"] - qy) < 7.1:
                return True
        for car in s["vehicles"]:
            if (
                car.get("sceneId") != s["sceneId"]
                or car["health"] <= 0
                or s["player"].get("z", 0) < car.get("z", 0) - 4
                or s["player"].get("z", 0) >= car.get("z", 0) + 16
            ):
                continue
            spec = self.world["vehicleSpecs"][car["spec"]]
            dx, dy = point["x"] - car["x"], point["y"] - car["y"]
            c, si = math.cos(car["angle"]), math.sin(car["angle"])
            lx, ly = dx * c + dy * si, -dx * si + dy * c
            qx = max(-spec["length"] / 2, min(spec["length"] / 2, lx))
            qy = max(-spec["width"] / 2, min(spec["width"] / 2, ly))
            if math.hypot(lx - qx, ly - qy) < 7.1:
                return True
        return False

    async def walking_step(self, s, goal, direct=False):
        target = goal
        if not direct and not s["sceneId"] and distance(s["player"], goal) > 100:
            if self.route_goal != goal:
                await self.route_to(goal)
            while (
                self.route_index < len(self.route) - 1
                and distance(s["player"], self.route[self.route_index]) < 12
            ):
                self.route_index += 1
            target = self.route[self.route_index]
            if (
                self.route_index == len(self.route) - 1
                and distance(s["player"], target) < 18
            ):
                target = goal
        # A local read-only grid detours around parked cars and building corners.
        # Movement still happens only through the normal keyboard controls.
        detour = await self.page.evaluate(
            """async target=>{
          const {isBlocked,VEHICLE_SPECS}=await import('/src/simulation.js'),s=lowlight.state,p=s.player;
          const scene=s.interior?.active?.roomId||null;
          const blocked=(x,y)=>isBlocked(x,y,7,p.z||0,s)||s.vehicles.some(v=>{
            if((v.sceneId??(v.scene?.kind==='interior'?v.scene.id:null))!==scene)return false;
            if(v.health<=0||(p.z||0)<(v.z||0)-4||(p.z||0)>=(v.z||0)+16)return false;
            const spec=VEHICLE_SPECS[v.spec],c=Math.cos(v.angle),n=Math.sin(v.angle),dx=x-v.x,dy=y-v.y,a=dx*c+dy*n,b=-dx*n+dy*c;
            return Math.hypot(a-Math.max(-spec.length/2,Math.min(spec.length/2,a)),b-Math.max(-spec.width/2,Math.min(spec.width/2,b)))<7.1;
          });
          const d=Math.hypot(target.x-p.x,target.y-p.y),nx=(target.x-p.x)/(d||1),ny=(target.y-p.y)/(d||1);
          if(![3,6,12,24,36].some(a=>a<d&&blocked(p.x+nx*a,p.y+ny*a)))return null;
          const step=8,limit=16,gx=Math.max(-limit,Math.min(limit,Math.round((target.x-p.x)/step))),gy=Math.max(-limit,Math.min(limit,Math.round((target.y-p.y)/step)));
          const key=(x,y)=>x+','+y,h=(x,y)=>Math.hypot(x-gx,y-gy),open=[{x:0,y:0,g:0,f:h(0,0)}],best=new Map([[key(0,0),0]]),parents=new Map(),positions=new Map([[key(0,0),[0,0]]]);
          let end=null,closest={x:0,y:0,h:h(0,0)};
          for(let visits=0;open.length&&visits<800;visits++){
            open.sort((a,b)=>a.f-b.f);const a=open.shift(),ak=key(a.x,a.y);if(a.g!==best.get(ak))continue;
            if(h(a.x,a.y)<closest.h)closest={x:a.x,y:a.y,h:h(a.x,a.y)};
            if(a.x===gx&&a.y===gy){end=ak;break;}
            for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++){
              if(!x&&!y)continue;const bx=a.x+x,by=a.y+y;if(Math.abs(bx)>limit||Math.abs(by)>limit)continue;
              if([0.33,0.66,1].some(t=>blocked(p.x+(a.x+x*t)*step,p.y+(a.y+y*t)*step)))continue;
              const bk=key(bx,by),g=a.g+Math.hypot(x,y);if(g>=(best.get(bk)??Infinity))continue;
              best.set(bk,g);parents.set(bk,ak);positions.set(bk,[bx,by]);open.push({x:bx,y:by,g,f:g+h(bx,by)});
            }
          }
          end??=key(closest.x,closest.y);if(end===key(0,0))return null;
          while(parents.get(end)&&parents.get(end)!==key(0,0))end=parents.get(end);
          const [x,y]=positions.get(end);return {x:p.x+x*step,y:p.y+y*step};
        }""",
            target,
        )
        if detour:
            target = detour
        candidates = []
        # Keyboard movement follows the screen. Score its actual projected world
        # directions instead of treating D/S as world east/south.
        for direction in s["walkDirections"]:
            vx, vy = direction["world"]
            points = [
                {"x": s["player"]["x"] + vx * step, "y": s["player"]["y"] + vy * step}
                for step in [
                    min(1, distance(s["player"], target)),
                    min(3, distance(s["player"], target)),
                    min(6, distance(s["player"], target)),
                    min(12, distance(s["player"], target)),
                ]
            ]
            blocked = sum(self.foot_blocked(s, point) for point in points)
            cost = distance(points[-1], target) + blocked * 500
            candidates.append((cost, direction["sx"], direction["sy"], blocked))
        _, dx, dy, blocked = min(candidates)
        if blocked:
            await self.press("j")
        keys = (["d"] if dx > 0 else ["a"] if dx < 0 else []) + (
            ["s"] if dy > 0 else ["w"] if dy < 0 else []
        )
        if s["wanted"]["level"] and s["player"]["stamina"] > 15:
            keys.append("Shift")
        speed = 106 if "Shift" in keys else 62
        duration = min(0.08, max(0.018, distance(s["player"], target) / speed * 0.65))
        await self.keys(keys, duration)

    async def nearest(self):
        return await self.page.evaluate("""async()=>{
          const {nearestInteractable}=await import('/src/simulation.js');
          const c=nearestInteractable(lowlight.state);
          return c&&{id:c.id,type:c.type,service:c.service,open:c.open,available:c.available,prompt:c.prompt};
        }""")

    async def local_drive(
        self, goal, radius=8, timeout=35, reverse=False, leave_scene=False
    ):
        """Drive in the current room's real coordinates using ordinary throttle/steering."""
        began = time.monotonic()
        room = (await self.read())["sceneId"]
        while time.monotonic() - began < timeout:
            s = await self.read()
            if s["sceneId"] != room:
                if leave_scene:
                    await self.stop()
                    self.route_goal = None
                    return True
                raise RuntimeError(
                    "Local vehicle navigation unexpectedly changed rooms"
                )
            car = s["vehicle"]
            if not car:
                raise RuntimeError("Room-local driving lost its real vehicle")
            if distance(car, goal) < radius:
                await self.stop()
                return True
            desired = math.atan2(goal["y"] - car["y"], goal["x"] - car["x"]) + (
                math.pi if reverse else 0
            )
            error = angle_error(desired, car["angle"])
            limit = min(17, max(7, (distance(car, goal) - radius) * 0.8))
            keys = []
            if abs(car["speed"]) < limit - 2:
                keys.append("s" if reverse else "w")
            elif abs(car["speed"]) > limit + 3:
                keys.append("Shift")
            if abs(error) > 0.06:
                keys.append("d" if error * (-1 if reverse else 1) > 0 else "a")
            await self.keys(keys, 0.06)
        raise RuntimeError(f"Physical local driving timed out in {room} toward {goal}")

    async def leave_interior(self):
        s = await self.read()
        if not s["sceneId"]:
            return
        layout = await self.page.evaluate("""async()=>{
          const {INTERIOR_LAYOUTS}=await import('/src/interiors.js');
          return INTERIOR_LAYOUTS[lowlight.state.interior.active.roomId];
        }""")
        door = next(d for d in layout["doors"] if d.get("exit"))
        approach = {"x": door["x"] + door["w"] / 2, "y": door["y"] - 14}
        if s["vehicle"]:
            await self.local_drive(approach, radius=2, reverse=True)
        else:
            await self.go(approach, radius=4)
        s = await self.read()
        if not s["interior"]["doors"][door["id"]]["open"]:
            action = await self.nearest()
            if not action or action["type"] != "door" or action["id"] != door["id"]:
                raise RuntimeError(f"Real room exit door is not reachable: {action}")
            await self.press("e")
        if s["vehicle"]:
            await self.local_drive(
                {"x": approach["x"], "y": layout["height"] + 15},
                radius=3,
                reverse=True,
                leave_scene=True,
            )
        else:
            began = time.monotonic()
            while (await self.read())["sceneId"] and time.monotonic() - began < 20:
                await self.walking_step(
                    await self.read(), {"x": approach["x"], "y": layout["height"] + 15}
                )
        if (await self.read())["sceneId"]:
            raise RuntimeError("The player did not physically cross the open room exit")
        self.route_goal = None
        await self.log("ordinary-room-exit", {"roomId": s["sceneId"]})

    async def repair_vehicle(self):
        garage = next(l for l in self.world["locations"] if l["type"] == "garage")
        if not await self.go(garage, radius=28):
            return False
        action = await self.nearest()
        await self.log("ordinary-garage-entry-request", {"context": action})
        await self.press("e")
        s = await self.read()
        if not s["sceneId"]:
            raise RuntimeError("The garage entry did not open its actual physical room")
        layout = await self.page.evaluate("""async()=>{
          const {INTERIOR_LAYOUTS}=await import('/src/interiors.js');
          return INTERIOR_LAYOUTS[lowlight.state.interior.active.roomId];
        }""")
        bay = next(h for h in layout["hooks"] if h.get("service") == "vehicle-repair")
        await self.local_drive(bay, radius=22)
        action = await self.nearest()
        if not action or action.get("service") != "vehicle-repair":
            raise RuntimeError(f"The actual repair bay is not usable: {action}")
        before = await self.read()
        await self.press("e")
        after = await self.read()
        paid = before["player"]["money"] - after["player"]["money"]
        if paid != 120 or after["vehicle"]["health"] <= before["vehicle"]["health"]:
            raise RuntimeError(
                f"Paid garage repair did not occur: {paid}, {after['notices']}"
            )
        await self.log(
            "ordinary-garage-repair",
            {"paid": paid, "vehicleHealth": after["vehicle"]["health"]},
        )
        await self.capture("ordinary-paid-garage-repair.png")
        await self.leave_interior()
        return True

    async def clinic_treatment(self):
        clinic = next(l for l in self.world["locations"] if l["type"] == "clinic")
        if not await self.park_exit(clinic):
            return False
        if not await self.go(clinic, radius=9):
            return False
        action = await self.nearest()
        if not action or action["type"] != "clinic":
            raise RuntimeError(f"The actual clinic treatment is not offered: {action}")
        before = await self.read()
        await self.press("e")
        after = await self.read()
        paid = before["player"]["money"] - after["player"]["money"]
        if (
            paid != clinic["cost"]
            or after["player"]["health"] <= before["player"]["health"]
        ):
            raise RuntimeError("Ordinary paid clinic treatment did not occur")
        await self.log(
            "ordinary-paid-clinic-treatment",
            {
                "paid": paid,
                "healthBefore": before["player"]["health"],
                "healthAfter": after["player"]["health"],
            },
        )
        await self.ensure_vehicle(self.parked_vehicle_id)
        return True

    async def ensure_vehicle(self, preferred=None):
        s = await self.read()
        if s["vehicle"]:
            return True
        options = [
            v
            for v in s["vehicles"]
            if v["health"] > 0
            and (not preferred or v["id"] == preferred)
            and (preferred or abs(v["speed"]) < 20)
        ]
        if not options and preferred == "starter-taxi":
            required = await self.page.evaluate("""async () => {
              const {MISSIONS}=await import('/src/simulation.js');const m=lowlight.state.mission;
              const stage=m&&MISSIONS.find(d=>d.id===m.id)?.stages[m.stage];
              return stage?.requiredVehicle||stage?.vehicle||null;
            }""")
            options = [
                v
                for v in s["vehicles"]
                if v["health"] > 0
                and abs(v["speed"]) < 2
                and not v.get("policeControlled")
            ]
            if required == "starter-taxi":
                options = []
            elif required == "taxi":
                options = [v for v in options if v["spec"] == "taxi"]
            if options:
                await self.log(
                    "alternate-vehicle-recovery-selected",
                    {
                        "reason": "owned taxi destroyed",
                        "candidate": min(
                            options, key=lambda v: distance(v, s["player"])
                        )["id"],
                    },
                )
        if not options:
            raise RuntimeError(f"Required live vehicle {preferred} is unavailable")
        vehicle = min(options, key=lambda v: distance(v, s["player"]))
        if not await self.approach_vehicle(vehicle["id"]):
            return False
        for _ in range(5):
            await self.press("e")
            s = await self.read()
            if s["vehicle"]:
                self.route_goal = None
                self.parked_vehicle_id = s["vehicle"]["id"]
                return True
            await self.dialogue()
        raise RuntimeError(
            f"E did not enter the nearby {vehicle['id']}; latest notices: {s['notices']}"
        )

    async def approach_vehicle(self, vehicle_id, timeout=60):
        """Walk until the actual context offers this live vehicle's E action."""
        began = time.monotonic()
        sides = None
        side_index = 0
        side_changed = time.monotonic()
        while time.monotonic() - began < timeout:
            s = await self.read()
            if s["player"]["health"] <= 0 or s["deaths"] > self.accepted_deaths:
                await self.ordinary_retry()
                return False
            vehicle = next(
                (v for v in s["vehicles"] if v["id"] == vehicle_id and v["health"] > 0),
                None,
            )
            if not vehicle:
                return False
            candidate = await self.page.evaluate("""async()=>{
              const {nearestInteractable}=await import('/src/simulation.js');
              const c=nearestInteractable(lowlight.state);
              return c&&{id:c.id,type:c.type,available:c.available,distance:c.distance,prompt:c.prompt};
            }""")
            if (
                candidate
                and candidate["type"] == "vehicle"
                and candidate["id"] == vehicle_id
                and candidate.get("available", True)
            ):
                await self.keys([], 0)
                return True
            if (
                candidate
                and candidate["type"] == "pickup"
                and candidate.get("available", True)
            ):
                # Dropped gear can legitimately own E ahead of a parked car.
                # Scavenge it through the same ordinary interaction as a player.
                await self.press("e")
                await self.log("ordinary-dropped-item-pickup", candidate)
                continue
            target = vehicle
            if distance(s["player"], vehicle) < 36:
                # Services can own E on one side. Choose a reachable other side
                # through genuine walking, never an invented smaller entry radius.
                if sides is None:
                    candidates = [
                        {
                            "x": vehicle["x"] + math.cos(i * math.pi / 4) * 26,
                            "y": vehicle["y"] + math.sin(i * math.pi / 4) * 26,
                        }
                        for i in range(8)
                    ]
                    candidates = [p for p in candidates if not self.foot_blocked(s, p)]
                    if not candidates:
                        raise RuntimeError("No reachable side around the live vehicle")
                    sides = sorted(
                        candidates,
                        key=lambda p: min(
                            distance(p, l) for l in self.world["locations"]
                        ),
                        reverse=True,
                    )
                    side_changed = time.monotonic()
                target = sides[side_index % len(sides)]
                if (
                    distance(s["player"], target) < 5
                    and time.monotonic() - side_changed > 0.8
                ):
                    side_index += 1
                    side_changed = time.monotonic()
                    target = sides[side_index % len(sides)]
                    await self.log(
                        "ordinary-vehicle-entry-side-change",
                        {
                            "vehicleId": vehicle_id,
                            "context": candidate,
                            "target": target,
                        },
                    )
            await self.walking_step(s, target)
        raise RuntimeError(
            f"Actual E-entry availability did not become reachable for {vehicle_id}"
        )

    async def park_exit(self, target):
        s = await self.read()
        if s["vehicle"]:
            self.parked_vehicle_id = s["vehicle"]["id"]
            # Park outside service interaction radii so E is an actual vehicle exit.
            parked = await self.page.evaluate(
                """async target=>{
              const {WORLD}=await import('/src/world.js');const {snapToRoad}=await import('/src/navigation.js');const s=lowlight.state,p=s.player;
              const candidates=[[90,0],[-90,0],[0,90],[0,-90]].map(([x,y])=>snapToRoad(WORLD,{x:target.x+x,y:target.y+y},{mode:'car',includeZ:true})).filter(q=>q&&Math.hypot(q.x-target.x,q.y-target.y)>60);
              candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
              const q=candidates[0];return {x:q.x,y:q.y};
            }""",
                target,
            )
            if not await self.go(parked, radius=25):
                return False
            for _ in range(3):
                action = await self.nearest()
                if not action or action["type"] != "exit":
                    raise RuntimeError(
                        f"Parking did not offer a real vehicle exit: {action}"
                    )
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
            if s["player"]["health"] <= 0 or s["deaths"] > self.accepted_deaths:
                await self.ordinary_retry()
                return False
            enemies = [e for e in s["hostiles"] if e["health"] > 0]
            if not enemies:
                await self.keys([], 0.05)
                await self.log("combat-cleared")
                return True
            ammo = s["player"]["ammo"]["pistol"]
            if ammo["clip"] == 0:
                await self.press("r")
                await self.keys(["ControlLeft"] if not s["vehicle"] else [], 1.25)
                continue
            enemy = min(enemies, key=lambda e: distance(e, s["player"]))
            point = await self.page.evaluate(
                """id => {
              const e=lowlight.state.hostiles.find(e=>e.id===id), game=lowlight.game,sc=game.screen;
              const p=game.view.p(e.x,e.y,(e.z||0)+13), rect=sc.canvas.getBoundingClientRect();
              return {x:rect.left+((p[0]-sc.ix)*sc.S+sc.OX-Math.round(sc.fx*sc.S))/sc.dpr,
                      y:rect.top+((p[1]-sc.iy)*sc.S+sc.OY-Math.round(sc.fy*sc.S))/sc.dpr};
            }""",
                enemy["id"],
            )
            await self.page.mouse.move(point["x"], point["y"])
            await self.keys(
                ["Space"] + (["ControlLeft"] if not s["vehicle"] else []), 0.11
            )
        raise RuntimeError(
            "Genuine combat exceeded 35 seconds without clearing the encounter"
        )

    async def escape(self, pending_theft=False, on_foot=False):
        await self.dialogue()
        s = await self.read()
        if s["vehicle"] and (
            on_foot or (s["mission"] and s["mission"]["stageType"] == "escape")
        ):
            self.parked_vehicle_id = s["vehicle"]["id"]
            if abs(s["vehicle"]["speed"]) > 2:
                await self.stop()
            action = await self.nearest()
            if action and action["type"] == "exit":
                await self.press("e")
                await self.log("ordinary-foot-getaway-exit")
                s = await self.read()
        if (
            not s["vehicle"]
            and not s["wanted"]["level"]
            and not await self.ensure_vehicle(self.parked_vehicle_id)
        ):
            return False
        began = time.monotonic()
        pursuit_seen = bool(s["wanted"]["level"])
        s = await self.read()
        axis = (
            "y"
            if abs(math.cos(s["vehicle"]["angle"] if s["vehicle"] else 0)) > 0.6
            else "x"
        )
        goal = self.escape_turn(s, axis)
        concealment = await self.concealed_escape_point()
        refuge = next(l for l in self.world["locations"] if l["type"] == "garage")
        use_refuge = bool(
            s["wanted"]["level"] >= 2
            and s["vehicle"]
            and distance(refuge, s["wanted"]["lastSeen"])
            > s["wanted"]["searchRadius"] + 25
        )
        hide_phase = "drive" if concealment else None
        foot_goal = None
        if not s["vehicle"]:
            foot_goal = await self.foot_escape_corridor()
            if foot_goal:
                use_refuge = False
                concealment = None
                hide_phase = "run"
                goal = foot_goal
                await self.log("straight-foot-getaway-selected", foot_goal)
        if use_refuge:
            goal = {"x": refuge["x"], "y": refuge["y"]}
            await self.log("real-garage-refuge-route-selected", {"goal": goal})
        elif concealment:
            goal = concealment["road"]
            await self.log("concealment-route-selected", concealment)
        while time.monotonic() - began < 100:
            s = await self.read()
            if s["sceneId"]:
                if not s["wanted"]["level"]:
                    await self.leave_interior()
                    await self.log("police-escaped-inside-real-garage")
                    return
                await self.keys([], 0.15)
                continue
            pursuit_seen = pursuit_seen or bool(s["wanted"]["level"])
            if not s["wanted"]["level"] and (
                pursuit_seen or not pending_theft or time.monotonic() - began > 8
            ):
                await self.stop()
                await self.log(
                    "police-escaped"
                    if pursuit_seen
                    else "getaway-without-delivered-report"
                )
                return
            if s["player"]["health"] <= 0 or s["deaths"] > self.accepted_deaths:
                await self.ordinary_retry()
                return False
            if s["time"] - self.last_chase_log >= 1:
                self.last_chase_log = s["time"]
                await self.log(
                    "genuine-pursuit-telemetry",
                    {
                        "distanceFromLastSeen": distance(
                            s["player"], s["wanted"]["lastSeen"]
                        ),
                        "police": [
                            {k: e.get(k) for k in ["id", "x", "y", "role", "inVehicle"]}
                            for e in s["police"]
                        ],
                    },
                )
            if not s["vehicle"] and concealment:
                hide_phase = "walk"
                goal = concealment["point"]
            if not s["vehicle"] and hide_phase not in ["walk", "run"]:
                foot_goal = await self.foot_escape_corridor()
                if foot_goal:
                    use_refuge = False
                    concealment = None
                    hide_phase = "run"
                    goal = foot_goal
                    self.route_goal = None
                    await self.log("straight-foot-getaway-selected", foot_goal)
                    continue
                ride = sorted(
                    [
                        v
                        for v in s["vehicles"]
                        if v["health"] > 0
                        and abs(v["speed"]) < 20
                        and not v.get("policeControlled")
                    ],
                    key=lambda v: distance(v, s["player"]),
                )
                if ride and distance(ride[0], s["player"]) < 70:
                    await self.ensure_vehicle(ride[0]["id"])
                    continue
            # Wait only when real police perception confirms hidden/outside.
            if (
                not s["wanted"].get("observed")
                and s["wanted"]["status"] == "cooling"
                and s["wanted"]["timer"] > 0.5
            ):
                if s["vehicle"]:
                    await self.stop()
                await self.keys(["ControlLeft"] if not s["vehicle"] else [], 0.15)
                continue
            if hide_phase == "run":
                if distance(s["player"], goal) < 35:
                    replacement = await self.foot_escape_corridor()
                    if replacement:
                        goal = replacement
                        self.route_goal = None
                await self.walking_step(s, goal, direct=True)
                continue
            if use_refuge:
                if distance(s["player"], refuge) < 34:
                    if (
                        not s["wanted"].get("observed")
                        and distance(s["player"], s["wanted"]["lastSeen"])
                        > s["wanted"]["searchRadius"] + 12
                    ):
                        await self.stop()
                        action = await self.nearest()
                        if action and action["type"] == "interior-portal":
                            await self.press("e")
                            if (await self.read())["sceneId"]:
                                await self.log("actual-unobserved-garage-refuge-entry")
                                continue
                    use_refuge = False
                    concealment = await self.concealed_escape_point()
                    if concealment:
                        hide_phase = "drive" if s["vehicle"] else "walk"
                        goal = (
                            concealment["road"]
                            if s["vehicle"]
                            else concealment["point"]
                        )
                        self.route_goal = None
                    else:
                        goal = self.escape_turn(s, axis)
                if use_refuge and s["vehicle"]:
                    await self.driving_step(goal, 22, 132, stop_on_arrival=False)
                    continue
            if concealment and distance(s["player"], goal) < (
                43 if hide_phase == "drive" else 8
            ):
                if hide_phase == "drive":
                    await self.stop()
                    await self.press("e")
                    if not (await self.read())["vehicle"]:
                        hide_phase = "walk"
                        goal = concealment["point"]
                        self.route_goal = None
                    continue
                if hide_phase == "walk":
                    foot_goal = await self.foot_escape_corridor()
                    if s["wanted"].get("observed") and foot_goal:
                        hide_phase = "run"
                        goal = foot_goal
                        concealment = None
                        self.route_goal = None
                        await self.log("straight-foot-getaway-selected", foot_goal)
                        continue
                    if (
                        not s["wanted"].get("observed")
                        and distance(s["player"], s["wanted"]["lastSeen"])
                        > s["wanted"]["searchRadius"]
                    ):
                        await self.keys([], 0.15)
                        continue
                    replacement = await self.concealed_escape_point()
                    if replacement and distance(replacement["point"], goal) > 25:
                        concealment = replacement
                        goal = replacement["point"]
                        self.route_goal = None
                        await self.log("foot-concealment-relocation", replacement)
                    else:
                        await self.keys([], 0.1)
                    continue
            if not concealment and distance(s["player"], goal) < 35:
                axis = "x" if axis == "y" else "y"
                goal = self.escape_turn(s, axis)
                self.route_goal = None
            if s["vehicle"]:
                await self.driving_step(
                    goal,
                    25,
                    175 if s["vehicle"]["spec"] == "sports" else 132,
                    stop_on_arrival=False,
                )
            else:
                await self.walking_step(s, goal, direct=bool(concealment))
        raise RuntimeError(f"Could not naturally clear police attention: {s['wanted']}")

    async def foot_escape_corridor(self):
        """Pick a long, dry, physically clear walking corridor; never relocate actors."""
        return await self.page.evaluate("""async()=>{
          const {WORLD}=await import('/src/world.js');const {TERRAIN}=await import('/src/simulation.js');const s=lowlight.state,p=s.player,police=s.police.filter(e=>e.health>0),candidates=[];
          for(const road of WORLD.roads){
            if(road.access&&!road.access.includes('foot'))continue;
            if(Math.abs(road.z1??road.z??0)>1||Math.abs(road.z2??road.z??0)>1||road.width<24)continue;
            const dx=road.x2-road.x1,dy=road.y2-road.y1,L=Math.hypot(dx,dy);if(L<350)continue;
            const nx=dx/L,ny=dy/L,t=Math.max(0,Math.min(L,(p.x-road.x1)*nx+(p.y-road.y1)*ny)),base={x:road.x1+nx*t,y:road.y1+ny*t};
            const approach=Math.hypot(base.x-p.x,base.y-p.y);if(approach>140)continue;
            for(const sign of [-1,1]){
              const available=sign>0?L-t:t;if(available<350)continue;
              const run=Math.min(650,available),q={x:base.x+nx*run*sign,y:base.y+ny*run*sign};
              if(TERRAIN.isBlocked(q.x,q.y,7,0))continue;
              let solid=false;for(let d=0;d<=run;d+=20)if(TERRAIN.isBlocked(base.x+nx*d*sign,base.y+ny*d*sign,7,0)){solid=true;break;}if(solid)continue;
              let risk=0;
              for(const e of police){const a=Math.max(0,Math.min(run,(e.x-base.x)*nx*sign+(e.y-base.y)*ny*sign)),near=Math.hypot(e.x-base.x-nx*a*sign,e.y-base.y-ny*a*sign);if(near<90)risk+=90-near;}
              const nearest=police.length?Math.min(...police.map(e=>Math.hypot(q.x-e.x,q.y-e.y))):run;
              const known=Math.hypot(q.x-s.wanted.lastSeen.x,q.y-s.wanted.lastSeen.y);
              candidates.push({...q,score:approach*2+risk*2-nearest*.25-known*.1,approach,run});
            }
          }
          candidates.sort((a,b)=>a.score-b.score);return candidates[0]||null;
        }""")

    async def concealed_escape_point(self):
        return await self.page.evaluate("""async () => {
          const {WORLD}=await import('/src/world.js');const {createTerrain}=await import('/src/terrain.js');
          const {snapToRoad}=await import('/src/navigation.js');const t=createTerrain(WORLD),s=lowlight.state,p=s.player;
          const observers=s.police.filter(e=>e.health>0), candidates=[],knownPoint=s.wanted.level?s.wanted.lastSeen:p;
          const radius=s.wanted.level?s.wanted.searchRadius:260,car=s.vehicles.find(v=>v.id===p.vehicleId);
          for(const b of WORLD.buildings){
            if(Math.hypot(b.x-p.x,b.y-p.y)>700)continue;
            for(const q of [{x:b.x-9,y:b.y+b.h/2},{x:b.x+b.w+9,y:b.y+b.h/2},
              {x:b.x+b.w/2,y:b.y-9},{x:b.x+b.w/2,y:b.y+b.h+9}]){
              const d=Math.hypot(q.x-p.x,q.y-p.y),known=Math.hypot(q.x-knownPoint.x,q.y-knownPoint.y);
              if(d<45||d>650||known<radius+25||t.isBlocked(q.x,q.y,7,0))continue;
              if(t.hasLineOfSight({...knownPoint,z:0,health:100},{...q,z:0,health:100}))continue;
              const hidden=observers.every(e=>Math.hypot(q.x-e.x,q.y-e.y)>260||!t.hasLineOfSight(e,{...q,z:0,health:100}));
              if(!hidden)continue;const road=snapToRoad(WORLD,q);if(!road)continue;
              const heading=car?Math.abs(Math.atan2(Math.sin(Math.atan2(road.y-p.y,road.x-p.x)-car.angle),Math.cos(Math.atan2(road.y-p.y,road.x-p.x)-car.angle))):0;
              candidates.push({point:q,road:{x:road.x,y:road.y},distance:d,known,walk:road.distance,heading});
            }
          }
          candidates.sort((a,b)=>(a.distance+a.walk*.7+a.heading*70)-(b.distance+b.walk*.7+b.heading*70));return candidates[0]||null;
        }""")

    def escape_turn(self, s, axis):
        p = s["player"]
        known = s["wanted"]["lastSeen"]
        police = [e for e in s["police"] if e["health"] > 0]
        nearest = min(police, key=lambda e: distance(e, p)) if police else known
        xs = sorted(
            {
                r["x1"]
                for r in self.world["roads"]
                if abs(r["x1"] - r["x2"]) < 0.01
                and min(r["y1"], r["y2"]) <= p["y"] <= max(r["y1"], r["y2"])
            }
        )
        ys = sorted(
            {
                r["y1"]
                for r in self.world["roads"]
                if abs(r["y1"] - r["y2"]) < 0.01
                and min(r["x1"], r["x2"]) <= p["x"] <= max(r["x1"], r["x2"])
            }
        )
        if not xs or not ys:
            raise RuntimeError("Escape position has no connected road crossing")
        x = min(xs, key=lambda x: abs(x - p["x"]))
        y = min(ys, key=lambda y: abs(y - p["y"]))
        if axis == "y":
            directions = [
                candidate for candidate in ys if abs(candidate - p["y"]) > 100
            ]
            preferred = [
                candidate
                for candidate in directions
                if (candidate - p["y"]) * (p["y"] - nearest["y"]) >= 0
            ]
            y = min(preferred or directions, key=lambda n: abs(n - p["y"]))
        else:
            directions = [
                candidate for candidate in xs if abs(candidate - p["x"]) > 100
            ]
            preferred = [
                candidate
                for candidate in directions
                if (candidate - p["x"]) * (p["x"] - nearest["x"]) >= 0
            ]
            x = min(preferred or directions, key=lambda n: abs(n - p["x"]))
        return {"x": x, "y": y}


async def main(args):
    output = Path(args.output).resolve()
    repository = Path(__file__).resolve().parents[1]
    if output == repository or repository in output.parents:
        raise ValueError("Opening reports must be written outside the repository")
    if output.exists() and any(output.iterdir()):
        raise ValueError(
            "Use a fresh output directory to preserve earlier natural attempts"
        )
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "scope": "Isolated clean save, read-only debug navigation, genuine UI/key/pointer input; no state/actor/health/ammo/time mutation.",
        "timeline": [],
        "inputFrames": 0,
        "presses": {},
        "pageErrors": [],
        "consoleErrors": [],
        "complete": False,
        "url": args.url,
        "driverSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    (output / "driver-source.py").write_bytes(Path(__file__).read_bytes())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        page.on(
            "console",
            lambda message: (
                report["consoleErrors"].append(message.text)
                if message.type == "error"
                else None
            ),
        )
        driver = None
        try:
            await page.goto(url_debug(args.url))
            await page.wait_for_function("window.lowlight")
            await page.click("#settings-button")
            await page.select_option("#camera-setting", "topdown")
            await page.locator("#volume").fill("0")
            await page.click("#info-dialog .close-dialog")
            await page.click("#new-game")
            if not await page.evaluate(
                "lowlight.state.mission?.id === 'first-shift' && !lowlight.state.campaign"
            ):
                raise RuntimeError(
                    "This additional-job driver requires a legacy First Shift New Game "
                    "(for example published 0.4.1). Canonical Night Crossing builds use "
                    "browser-smoke.py and browser-campaign-interruption.py for their "
                    "bounded arrival/recovery checks."
                )
            world = await page.evaluate(
                "async()=>{const {WORLD}=await import('/src/world.js');const {VEHICLE_SPECS}=await import('/src/simulation.js');return {buildings:WORLD.buildings,obstacles:WORLD.obstacles,roads:WORLD.roads,locations:WORLD.locations,vehicleSpecs:VEHICLE_SPECS}}"
            )
            missions = await page.evaluate(
                "async()=>{const {MISSIONS}=await import('/src/simulation.js');return MISSIONS}"
            )
            driver = Driver(page, world, report, output)
            await driver.log("clean-start")
            began = time.monotonic()
            last_stage = None
            sports_selected = False
            while time.monotonic() - began < args.timeout:
                s = await driver.read()
                if s["deaths"] > driver.accepted_deaths or s["player"]["health"] <= 0:
                    await driver.ordinary_retry()
                    continue
                if len(s["completed"]) == 4:
                    report["complete"] = True
                    break
                if s["dialogue"]:
                    await driver.dialogue()
                    continue
                if not s["mission"]:
                    await driver.stop()
                    if s["wanted"]["level"]:
                        await driver.escape()
                        continue
                    if (
                        s["vehicle"]
                        and s["vehicle"]["health"] < 80
                        and s["player"]["money"] >= 120
                        and not await driver.repair_vehicle()
                    ):
                        continue
                    if (
                        s["player"]["health"] < 85
                        and s["player"]["money"] >= 60
                        and not await driver.clinic_treatment()
                    ):
                        continue
                    # Ordinary paid armour after the first earned mission reward.
                    if (
                        len(s["completed"]) >= 1
                        and s["player"]["armour"] < 70
                        and s["player"]["money"] >= 180
                    ):
                        supply = next(
                            l for l in world["locations"] if l["type"] == "armour"
                        )
                        await driver.park_exit(supply)
                        await driver.go(supply, radius=9)
                        before = (await driver.read())["player"]["money"]
                        await driver.press("e")
                        after = await driver.read()
                        if after["player"]["armour"] > 0:
                            await driver.log(
                                "ordinary-armour-purchase",
                                {"paid": before - after["player"]["money"]},
                            )
                        else:
                            raise RuntimeError(
                                "Ordinary supply interaction did not buy armour"
                            )
                    if len(s["completed"]) == 1 and not sports_selected:
                        if not (await driver.read())["vehicle"]:
                            await driver.ensure_vehicle("starter-taxi")
                        sport = next(
                            v
                            for v in (await driver.read())["vehicles"]
                            if v["spec"] == "sports" and v["health"] > 0
                        )
                        await driver.park_exit(sport)
                        await driver.ensure_vehicle(sport["id"])
                        sports_selected = True
                        await driver.log("ordinary-sports-car-entry")
                        await driver.escape(pending_theft=True)
                        after = await driver.read()
                        if (
                            after["wanted"]["level"] == 0
                            and after["vehicle"]
                            and after["vehicle"]["id"] == sport["id"]
                        ):
                            await driver.park_exit(
                                next(
                                    v
                                    for v in after["vehicles"]
                                    if v["id"] == "starter-taxi"
                                )
                            )
                        await driver.ensure_vehicle("starter-taxi")
                        await driver.log("owned-taxi-resumed-after-theft-regression")
                        continue
                    next_mission = next(
                        m
                        for m in missions
                        if m["id"] not in s["completed"]
                        and (
                            not m["prerequisite"] or m["prerequisite"] in s["completed"]
                        )
                    )
                    contact = next_mission["stages"][0]["target"]
                    # Return to a known live taxi through actual walking/entry if needed.
                    if not (await driver.read())["vehicle"]:
                        await driver.ensure_vehicle("starter-taxi")
                    await driver.park_exit(contact)
                    await driver.press("e")
                    continue
                mission = s["mission"]
                marker = (mission["id"], mission["stage"])
                if marker != last_stage:
                    await driver.log(
                        "mission-stage", {"id": marker[0], "stage": marker[1]}
                    )
                    await driver.capture(f"{marker[0]}-{marker[1]}.png")
                    last_stage = marker
                    driver.route_goal = None
                definition = next(m for m in missions if m["id"] == mission["id"])
                stage = definition["stages"][mission["stage"]]
                kind = stage["type"]
                if kind == "vehicle":
                    await driver.ensure_vehicle(stage["vehicle"])
                elif kind in ["drive", "reach"]:
                    if (
                        mission["id"] == "glass-house"
                        and kind == "reach"
                        and any(e["health"] > 0 for e in s["hostiles"])
                    ):
                        await driver.log("camera-card-ambush-defence")
                        await driver.combat()
                        continue
                    if stage.get("requiredVehicle") and not s["vehicle"]:
                        await driver.ensure_vehicle(
                            "medicine-van"
                            if stage["requiredVehicle"] == "medicine-van"
                            else "starter-taxi"
                        )
                    elif (
                        not s["vehicle"]
                        and distance(s["player"], stage["target"]) > 100
                        and not await driver.ensure_vehicle(driver.parked_vehicle_id)
                    ):
                        continue
                    if (
                        mission["id"] == "cold-freight"
                        and mission["stage"] == 3
                        and s["player"]["ammo"]["pistol"]["clip"] < 10
                    ):
                        await driver.press("r")
                    await driver.go(
                        stage["target"], radius=min(24, stage["target"]["radius"] - 2)
                    )
                elif kind == "interact":
                    if (
                        stage.get("encounter")
                        and s["player"]["ammo"]["pistol"]["clip"] < 10
                    ):
                        await driver.press("r")
                    if stage.get("onFoot") and s["vehicle"]:
                        if not await driver.park_exit(stage["target"]):
                            continue
                    else:
                        if (
                            not s["vehicle"]
                            and distance(s["player"], stage["target"]) > 100
                            and not await driver.ensure_vehicle(
                                driver.parked_vehicle_id
                            )
                        ):
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
            await driver.stop()
            await driver.log("four-opening-jobs-complete")
            await driver.capture("four-opening-jobs-complete.png")
        # Preserve every unexpected failure as inspectable QA evidence.
        except Exception as error:  # noqa: BLE001
            report["blocker"] = str(error)
            if driver:
                await driver.keys([], 0)
                report["partialState"] = await driver.read()
                await driver.log("honest-partial-blocker", {"reason": str(error)})
            if driver:
                await driver.capture("partial-or-final.png")
            else:
                await page.screenshot(path=str(output / "partial-or-final.png"))
        finally:
            if driver:
                report["finalState"] = await driver.read()
                report["collisionRecoveries"] = driver.recoveries
            await context.close()
            await browser.close()
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "complete": report["complete"],
                "blocker": report.get("blocker"),
                "report": str(output / "report.json"),
            }
        ),
        flush=True,
    )
    return (
        0
        if report["complete"]
        and not report["pageErrors"]
        and not report["consoleErrors"]
        else 1
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--output", default="/tmp/lowlight-opening-qa/first")
    parser.add_argument("--timeout", type=float, default=600)
    sys.exit(asyncio.run(main(parser.parse_args())))
