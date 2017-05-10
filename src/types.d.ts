import * as L from "leaflet";

interface ShapeData {
    center?: L.LatLngTuple;
    box?: L.LatLngTuple[];
    hborder?: number[][];
    vborder?: number[][];
    size?: [number, number];
    river?: number[];
}

interface MapGradient {
    start: number[];
    end: number[];
    steps: number;
    lookup: number[][];
    hexLookup: string[];
}

type SimpleRoute = number
type TimedRoute = [number, number]
type SimpleRoutes = {[key: string]: SimpleRoute}
type TimedRoutes = {[key: string]: TimedRoute[]}

interface Point extends Site {
    routes: SimpleRoutes;
    visited?: boolean;
    cost?: number;
    code?: string;
    color?: number[];
    colorHex?: string;
    lon: number;
    lat: number;
}

type Points = {[key: string]: Point}
type Routes = {[key: string]: TimedRoutes}