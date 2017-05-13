import * as L from "leaflet";
import * as Voronoi from "voronoi";
import * as jQuery from "jquery";
import {MapGradient, Point, Points, Routes, SelectItem, ShapeData} from "./types";
import {DijkstraAlgorithm} from "./dijkstra";
import {distance} from "./utils";

export class ShapeMap {

    private shape: ShapeData;
    private points: Points;
    private visiblePoints: Point[];
    private gradient: MapGradient;
    private voronoi: VoronoiDiagram;
    private routes: Routes;

    private map: L.Map;
    private layer: L.TileLayer;
    private overlay: L.ImageOverlay;
    private settings: SettingsControl;
    private canvas: HTMLCanvasElement;
    private center: L.LatLngTuple;
    private tooltip: HTMLDivElement;
    private tooltipVisible: boolean;
    private hourSelect: HTMLSelectElement;
    private daySelect: HTMLSelectElement;
    private hour: number;
    private day: string;

    constructor(shape: ShapeData) {
        this.shape = shape;
        this.center = this.shape.center;
        this.canvas = document.createElement("canvas");
        this.canvas.width = this.shape.size[0];
        this.canvas.height = this.shape.size[1];
        this.tooltip = document.getElementById("tooltip") as HTMLDivElement;
        this.tooltipVisible = false;
        this.initMap();
        jQuery.ajax("./includes/points.json").then((data) => this.initRoutesLayer(data));
    }

    private initRoutesLayer(data: Points): void {
        this.points = data;
        this.gradient = this.createMapGradient();
        this.visiblePoints = this.createVisiblePoints();
        this.voronoi = this.createVoronoiDiagram();
        this.initVoronoiRoutes();
        this.initOverlay();
        this.requestRepaint(this.center);
    }

    private createVoronoiDiagram(): VoronoiDiagram {
        const bbox: BBox = {xl: 0, xr: this.shape.size[0] - 1, yt: 0, yb: this.shape.size[1]};
        const sites: Site[] = this.visiblePoints;
        const voronoi: Voronoi = new Voronoi();
        return voronoi.compute(sites, bbox);
    }

    private initVoronoiRoutes(): void {
        for(let edge of this.voronoi.edges) {
            const first: Point = edge.lSite as Point;
            const second: Point = edge.rSite as Point;
            if(!first || !second || this.riverSide(first.x, first.y) !== this.riverSide(second.x, second.y)) {
                continue;
            }
            const dist: number = distance(first.lat, first.lon, second.lat, second.lon);
            const time: number = Math.ceil(dist * 10);
            first.routes[second.code] = time;
            second.routes[first.code] = time;
        }
    }

    private riverSide(x: number, y: number): number {
        const point: number = this.shape.river[y];
        return x > point ? 1 : -1;
    }

    private createMapGradient(): MapGradient {
        let res: any = {start: [153, 217, 234], end: [237, 28, 36], steps: 121};
        res.lookup = this.createGradientLookup(res.start, res.end, res.steps);
        res.hexLookup = res.lookup.map((color: number[]) => this.rgbToHex(color));
        return res as MapGradient;
    }

    private createGradientLookup(start: number[], end: number[], steps: number): number[][] {
        let res: number[][] = new Array<number[]>(steps);
        for(let idx=0; idx<steps; ++idx) {
            const weight: number = idx / steps;
            res[idx] = this.gradientValue(start, end, weight);
        }
        return res;
    }

    private pixelPosition(lat: number, lon: number): Site {
        const min: L.LatLngTuple = this.shape.box[0];
        const max: L.LatLngTuple = this.shape.box[1];
        let x = Math.round(((lon - min[1]) / (max[1] - min[1])) * this.shape.size[0]);
        let y = Math.round(((max[0] - lat) / (max[0] - min[0])) * this.shape.size[1]);
        return {x: x, y: y}
    }

    private createVisiblePoints(): Point[] {
        let res: Point[] = [];
        const min: L.LatLngTuple = this.shape.box[0];
        const max: L.LatLngTuple = this.shape.box[1];
        for(let key of Object.keys(this.points)) {
            const point: Point = this.points[key];
            point.code = key;
            if(point.lat > max[0] || point.lat < min[0] || point.lon > max[1] || point.lon < min[1]) {
                continue;
            }
            let pos: Site = this.pixelPosition(point.lat, point.lon);
            point.x = pos.x;
            point.y = pos.y;
            point.colorHex = this.gradient.hexLookup[0];
            res.push(point);
        }
        return res;
    }

    private initMap(): void {
        this.map = new L.Map("mapid");
        this.map.setView(this.shape.center, 11);
        const attribution = `&copy; <a href="http://openstreetmap.org">OpenStreetMap</a>`;
        this.layer = L.tileLayer("https://tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png", {attribution, maxZoom: 18,});
        this.layer.addTo(this.map);
    }

    private initOverlay(): void {
        this.overlay = L.imageOverlay(this.draw(), this.shape.box, {opacity: 0.6, interactive: true});
        this.overlay.addTo(this.map);
        this.overlay.on("click", (event: any) => this.onClick(event));

        this.settings = new SettingsControl();
        this.settings.addTo(this.map);
        this.hourSelect = document.getElementById("wt-hour-select") as HTMLSelectElement;
        this.daySelect = document.getElementById("wt-day-select") as HTMLSelectElement;
        this.hourSelect.addEventListener("change", (event: Event) => this.requestRepaint(this.center));
        this.daySelect.addEventListener("change", (event: Event) => this.requestRepaint(this.center));

        this.map.on("mousemove", (event: any) => this.onHover(event));
        this.tooltip.addEventListener("mouseover", (event: any) => {
            this.tooltipVisible = false;
            this.tooltip.style.display = "none";
        });
    }

    private onHover(event: any) {
        let loc: L.LatLngLiteral = event.latlng;
        const pos: Site = this.pixelPosition(loc.lat, loc.lng);
        if(this.isOutsideOverlay(pos.x, pos.y) || this.isOutsideShape(pos.x, pos.y)) {
            if(this.tooltipVisible) {
                this.tooltipVisible = false;
                this.tooltip.style.display = "none";
            }
            return;
        } else {
            if(!this.tooltipVisible) {
                this.tooltipVisible = true;
                this.tooltip.style.display = "block";
            }
            this.tooltip.style.left = (event.originalEvent.pageX + 10) + "px";
            this.tooltip.style.top = (event.originalEvent.pageY - 7) + "px";
            const color: any = this.canvas.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data;
            const hex: string = this.rgbToHex(color);
            let idx: number = this.gradient.hexLookup.indexOf(hex);
            idx = idx < 0 && hex === "#ffffff" ? 0 : idx;
            if(idx >= 0) {
                this.tooltip.innerHTML = idx.toString() + (idx < (this.gradient.steps - 1) ? " min" : "+ min");
            }
        }
    }

    private onClick(event: any): void {
        let loc: L.LatLngLiteral = event.latlng;
        const min: L.LatLngTuple = this.shape.box[0];
        const max: L.LatLngTuple = this.shape.box[1];
        const pos: Site = this.pixelPosition(loc.lat, loc.lng);
        if(this.isOutsideOverlay(pos.x, pos.y)) {
            return;
        }
        if(!this.isOutsideShape(pos.x, pos.y)) {
            const timeStart :number = performance.now();
            this.requestRepaint([loc.lat, loc.lng]);
            console.log(`repaint in ${(performance.now() - timeStart) / 1000}s`);
        }
    }

    private requestRepaint(center: L.LatLngTuple): void {
        let hour: number = parseInt(this.hourSelect.value, 10);
        let day: string = this.daySelect.value;

        if(!this.routes || hour !== this.hour || day !== this.day) {
            const url: string = `./includes/routes_${day}_${hour}.json`;
            jQuery.ajax(url).then((data) => {
                this.routes = data;
                this.repaint(hour, day, center);
            });
        } else {
            this.repaint(hour, day, center);
        }
    }

    private repaint(hour: number, day: string, center: L.LatLngTuple) {
        this.hour = hour;
        this.day = day;
        this.center = center;
        let start: number = hour * 60;
        let dijkstra: DijkstraAlgorithm = new DijkstraAlgorithm(this.points, this.routes, hour * 60);
        dijkstra.execute(center);
        for(let point of this.visiblePoints) {
            const colorIdx = Math.min(point.cost - start, this.gradient.steps - 1);
            point.color = this.gradient.lookup[colorIdx];
            point.colorHex = this.gradient.hexLookup[colorIdx];
        }
        this.overlay.setUrl(this.draw());
    }

    private gradientValue(color1: number[], color2: number[], weight: number): number[] {
        const res: number[] = [];
        for(let idx=0; idx<4; ++idx) {
            res.push(color1[idx] * Math.abs(weight - 1.0) + color2[idx] * weight);
        }
        return res;
    }

    private rgbToHex(color: number[]): string {
        let rgb = color[2] | (color[1] << 8) | (color[0] << 16);
        return "#" + (0x1000000 | rgb).toString(16).substring(1);
    }

    private draw(): string {
        this.drawVoronoiDiagram();
        this.drawBorders();
        this.drawCenter();
        return this.canvas.toDataURL("image/png");
    }

    private drawCenter(): void {
        if(!this.center) return;
        const loc: Site = this.pixelPosition(this.center[0], this.center[1]);
        let ctx: CanvasRenderingContext2D = this.canvas.getContext("2d");
        ctx.beginPath();
        ctx.arc(loc.x, loc.y, 10, 0, 2 * Math.PI, false);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#333333";
        ctx.stroke();
    }

    private drawBorders(): void {
        let ctx: CanvasRenderingContext2D = this.canvas.getContext("2d");
        let image: ImageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        for(let i = 0; i < image.height; ++i) {
            for(let j = 0; j < image.width; ++j) {
                const idx = (i * image.width + j) * 4;
                if(this.isOutsideShape(j, i)) {
                    this.setPixel(image, idx, [0, 0, 0, 0]);
                }
            }
        }
        ctx.putImageData(image, 0, 0);
    }

    private isOutsideShape(x: number, y: number): boolean {
        const hb = this.shape.hborder[y];
        const vb = this.shape.vborder[x];
        return x < hb[0] || x > hb[1] || y < vb[0] || y > vb[1];
    }

    private isOutsideOverlay(x: number, y: number): boolean {
        return y < 0 || y >= this.shape.hborder.length || x < 0 || x > this.shape.vborder.length;
    }

    private setPixel(image: ImageData, idx: number, values: number[]): void {
        for(let i=0; i<4; ++i) {
            image.data[idx + i] = values[i];
        }
    }

    private drawVoronoiDiagram(): void {
        let ctx: CanvasRenderingContext2D = this.canvas.getContext("2d");
        for(let cell of this.voronoi.cells) {
            this.drawVoronoiCell(cell, ctx);
        }
    }

    private drawVoronoiCell(cell: VoronoiCell, ctx: CanvasRenderingContext2D): void {
        ctx.fillStyle = (cell.site as Point).colorHex;
        ctx.beginPath();
        const halfedges: VoronoiHalfedge[] = cell.halfedges;
        if(halfedges.length === 0) return;

        let start: VoronoiVertex = halfedges[0].getStartpoint();
        let end: VoronoiVertex = halfedges[0].getEndpoint();
        ctx.moveTo(start.x, start.y);
        let currentX = start.x;
        let currentY = start.y;
        for(let i=0; i<halfedges.length; ++i) {
            start = halfedges[i].getStartpoint();
            end = halfedges[i].getEndpoint();
            currentX = end.x;
            currentY = end.y;
            ctx.lineTo(end.x, end.y);
        }
        ctx.closePath();
        ctx.fill();
    }

    private randomColor(): string {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++ ) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    private randomSites(num: number): Site[] {
        let res: Site[] = [];
        while(res.length < num) {
            const site = this.randomSite();
            if(!this.isOutsideShape(site.x, site.y)) {
                res.push(site);
            }
        }
        return res;
    }

    private randomSite(): Site {
        const x: number = Math.floor(Math.random() * (this.shape.size[0]));
        const y: number = Math.floor(Math.random() * (this.shape.size[1]));
        return {x, y};
    }
}

class SettingsControl extends L.Control {

    private container: HTMLDivElement;

    onAdd(map: L.Map): HTMLElement {
        this.container = L.DomUtil.create("div", "info") as HTMLDivElement;
        this.createContent();
        return this.container;
    }

    private createContent(): void {
        let content: string[] = [];
        let text: string = require("./legend.txt");
        content.push(text);
        content.push(`<span style="font-size:1.3em">Dzień i godzina: </span>`);
        content.push(this.createDaySelect());
        content.push(this.createHourSelect());
        this.container.innerHTML = content.join("");
    }

    private createDaySelect(): string {
        let items: SelectItem[] = [];
        items.push({name: "Dzień roboczy", value: "week"});
        items.push({name: "Sobota", value: "sat"});
        items.push({name: "Niedziela", value: "sun"});
        return this.createSelect("wt-day-select", items, "week");
    }

    private createHourSelect(): string {
        let items: SelectItem[] = [];
        for(let idx=0; idx<24; ++idx) {
            const hour: string = idx.toString();
            const name: string = (hour.length > 1 ? hour : "0" + hour) + ":00";
            items.push({name: name, value: hour});
        }
        return this.createSelect("wt-hour-select", items, "17");
    }

    private createSelect(id: string, items: SelectItem[], selectedValue: string): string {
        let res: string[] = [];
        res.push(`<select id="${id}">`);
        for(let idx=0; idx<items.length; ++idx) {
            let selected: boolean = selectedValue === items[idx].value;
            res.push(`<option value="${items[idx].value}" ${selected ? "selected" : ""}>${items[idx].name}</option>`);
        }
        res.push(`</select>`);
        return res.join("");
    }
}