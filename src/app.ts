import "es6-shim";
import "leaflet/dist/leaflet.css";
import "./styles/app.css";
import {ShapeMap} from "./map";
import {Points, ShapeData} from "./types";

const shape: ShapeData = require("./includes/warsaw.json");
const points: Points = require("./includes/points.json");
new ShapeMap(shape, points);
