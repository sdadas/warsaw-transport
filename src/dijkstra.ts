import * as L from "leaflet";
import * as TinyQueue from "tinyqueue";
import {Point, Points, Routes, SimpleRoutes, TimedRoute, TimedRoutes} from "./types";
import {distance} from "./utils";

type PointPriority = {code: string, priority: number}

export class DijkstraAlgorithm {

    private points: Points;
    private routes: Routes;
    private start: number;

    constructor(points: Points, routes: Routes, start: number) {
        this.points = points;
        this.routes = routes;
        this.start = start;
    }

    public execute(center: L.LatLngTuple): void {
        let starting: Point = this.initState(center);
        const next: TinyQueue<PointPriority> = new TinyQueue<PointPriority>([], (a, b) => a.priority - b.priority);
        this.visit(starting, starting.code, next);
        while(next.length > 0) {
            const code: string = next.pop().code;
            const point: Point = this.points[code];
            if(!point.visited) {
                this.visit(point, code, next);
            }
        }
    }

    private visit(point: Point, code: string, next: TinyQueue<PointPriority>) {
        point.visited = true;
        const walking: SimpleRoutes = point.routes;
        const driving: TimedRoutes = this.routes[code] || {};

        for(let key of Object.keys(walking)) {
            const cost: number = point.cost + walking[key];
            const other: Point = this.points[key];
            if(other.cost > cost) {
                other.cost = cost;
                if(!other.visited) next.push({code: key, priority: cost});
            }
        }

        for(let key of Object.keys(driving)) {
            const tr: TimedRoute[] = driving[key];
            const idx: number = this.routeLinearSearch(tr, point.cost);
            if(idx >= 0) {
                const cost: number = tr[idx][0] + tr[idx][1];
                const other: Point = this.points[key];
                if(other.cost > cost) {
                    other.cost = cost;
                    if(!other.visited) next.push({code: key, priority: cost});
                }
            }
        }
    }

    private routeLinearSearch(costs: TimedRoute[], current: number) {
        for(let idx=0; idx<costs.length; ++idx) {
            const cost: TimedRoute = costs[idx];
            if(cost[0] >= current) {
                return idx;
            }
        }
        return -1;
    }

    private routeBinSearch(costs: TimedRoute[], current: number) {
        if(costs.length === 0) return -1;
        if(costs[0][0] >= current) return 0;

        let m = 1;
        let n = costs.length - 1;
        while (m <= n) {
            let k = (n + m) >> 1;
            if (current > costs[k][0]) {
                m = k + 1;
            } else if(current < costs[k][0]) {
                if(current > costs[k-1][0]) {
                    return k;
                } else {
                    n = k - 1;
                }
            } else {
                return k;
            }
        }
        return -m - 1;
    }

    private initState(center: L.LatLngTuple): Point {
        let nearest: Point = null;
        let min: number = Number.MAX_SAFE_INTEGER;
        for(let key of Object.keys(this.points)) {
            const point: Point = this.points[key];
            point.visited = false;
            point.cost = Number.MAX_SAFE_INTEGER;
            const dist = distance(center[0], center[1], point.lat, point.lon);
            if(dist < min && Object.keys(point.routes).length > 0) {
                min = dist;
                nearest = point;
                nearest.code = key;
            }
        }
        nearest.cost = this.start + Math.floor(12 * min);
        return nearest;
    }

    private getMinMaxCost(): number[] {
        let minCost = Number.MAX_SAFE_INTEGER;
        let maxCost = 0;
        for(let key of Object.keys(this.points)) {
            const cost: number = this.points[key].cost;
            if(cost > maxCost && cost < Number.MAX_SAFE_INTEGER) {
                maxCost = cost;
            }
            if(cost < minCost) {
                minCost = cost;
            }
        }
        return [minCost, maxCost];
    }
}