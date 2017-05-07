interface Voronoi {
    compute(sites: Site[], bbox: BBox): VoronoiDiagram;
}

interface VoronoiDiagram {
    vertices: VoronoiVertex[];
    edges: VoronoiEdge[];
    cells: VoronoiCell[];
    execTime: number;
}

interface VoronoiCell {
    halfedges: VoronoiHalfedge[];
    site: Site;
}

interface VoronoiHalfedge {
    site: Site;
    angle: number;
    edge: VoronoiEdge;
    getStartpoint: () => VoronoiVertex;
    getEndpoint: () => VoronoiVertex;
}

interface VoronoiEdge {
    lSite: Site;
    rSite: Site;
    va: VoronoiVertex;
    vb: VoronoiVertex;
}

interface VoronoiVertex {
    x: number;
    y: number;
}

type BBox = {xl: number, xr: number, yt: number, yb: number}
type Site = {x: number, y: number, [idx: string]:any}

declare module "voronoi" {
    type VoronoiStatic = {
        new(): Voronoi;

    }
    const voronoi: VoronoiStatic;
    export = voronoi;
}