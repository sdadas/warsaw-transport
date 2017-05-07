import sys, time, json, random, os, re
from typing import Callable, Sequence, Iterator, Dict, Set
from math import cos, asin, sqrt, ceil
from collections import defaultdict


def download_ftp(path: str, output_path: str):
    if os.path.exists(output_path): return
    import ftplib
    ftp = ftplib.FTP(path)
    ftp.login("anonymous", "")
    files = ftp.nlst()

    pattern = re.compile(r"RA(\d+)\.7z")
    files = [f for f in files if re.match(pattern, f)]
    files.sort(key=lambda x: int(pattern.match(x).group(1)), reverse=True)

    with open(output_path, "wb") as output_file:
        ftp.retrbinary("RETR %s" % (files[0],), output_file.write)
    ftp.quit()


def decompress_data(path: str, output_path: str):
    if os.path.exists(output_path): return
    os.system("7z x %s -o%s" % (path, output_path))


class ZtmFormatIterator(object):
    def __init__(self, iterator: Iterator, tag):
        self.__iter = iterator
        self.__tag = tag
        self.__start = "*" + tag
        self.__end = "#" + tag

    @classmethod
    def iterate(cls, iter: Iterator, tag: str):
        return ZtmFormatIterator(iter, tag)

    def run(self, processor: Callable):
        lines = []
        append_mode = False
        while True:
            line = self.__iter.__next__()
            line = line.strip()
            if not append_mode and self.isstart(line):
                append_mode = True
                continue
            elif append_mode and self.isend(line):
                processor(lines)
                break

            if append_mode:
                lines.append(line)

    def isstart(self, line: str):
        return line.startswith(self.__start)

    def isend(self, line: str):
        return line.startswith(self.__end)


class ZtmFormatReader(object):
    def __init__(self, data_dir, metro_path):
        self.data_dir = data_dir
        self.data_file = os.path.join(self.data_dir, os.listdir(data_dir)[0])
        self.metro_path = metro_path
        self.points = {}
        self.routes_num = 0
        self.route_types = set()

    def read(self):
        start = time.time()
        with open(self.data_file, encoding="windows-1250") as input_file:
            iterator = input_file.__iter__()
            self.iterate(iterator, "ZP").run(self.read_point_groups)
            print("Parsed %d data points %.2fs" % (len(self.points), time.time() - start))

            start = time.time()
            try:
                while True:
                    self.iterate(iterator, "WK").run(self.read_routes)
            except StopIteration:
                pass

        self.read_metro()
        print("Parsed %d edges %.2fs" % (self.routes_num, time.time() - start))
        print("Known route types: " + self.route_types.__str__())
        return self.points

    def read_metro(self):
        with open(self.metro_path, "r", encoding="utf-8") as metro_file:
            data = json.load(metro_file)
            for metro_line in data:
                self.read_metro_line(metro_line)

    def read_metro_line(self, metro_line: Dict):
        points = metro_line["points"]
        times = metro_line["times"]
        trains = metro_line["trains"]
        for point in points:
            point["routes"] = []
            self.points[point["code"]] = point

        self.generate_metro_routes(points, times, trains["week"], "DP")
        self.generate_metro_routes(points, times, trains["saturday"], "SB")
        self.generate_metro_routes(points, times, trains["sunday"], "DS")

    def generate_metro_routes(self, points: Sequence[Dict], times: Sequence[int], trains: Sequence[Dict],
                              route_type: str):
        for time_window in trains:
            time_window["from"] = self.as_time(time_window["from"], sep=":")
            time_window["to"] = self.as_time(time_window["to"], sep=":")

        current_time = 0
        time_window_idx = 0
        current_time_window = trains[0]
        while current_time < 1440:
            if current_time >= current_time_window["to"]:
                time_window_idx += 1
                if time_window_idx >= len(trains):
                    break
                current_time_window = trains[time_window_idx]
            if current_time < current_time_window["from"]:
                current_time = current_time_window["from"]

            if "rate" in current_time_window:
                current_time += random.choice(current_time_window["rate"])
                self.generate_metro_route(points, times, route_type, current_time)
            elif "start" in current_time_window:
                for element in current_time_window["start"]:
                    start = current_time_window["from"] + element
                    self.generate_metro_route(points, times, route_type, start)
                current_time = current_time_window["to"]
            else:
                raise Exception("Invalid time window")

    def generate_metro_route(self, points: Sequence[Dict], times: Sequence[int], route_type: str, start: int):
        current_time = start
        for idx, duration in enumerate(times):
            if current_time >= 1440: return
            route = {"to": points[idx + 1]["code"], "start": current_time, "time": duration, "type": route_type}
            points[idx]["routes"].append(route)
            self.routes_num += 1
            current_time += duration

    def iterate(self, iter: Iterator, tag: str) -> ZtmFormatIterator:
        return ZtmFormatIterator.iterate(iter, tag)

    def read_point_groups(self, lines: Sequence[str]):
        try:
            iter = lines.__iter__()
            while True:
                self.iterate(iter, "PR").run(self.read_points)
        except StopIteration as e:
            return

    def read_points(self, lines: Sequence[str]):
        for line in lines:
            if len(line) > 6 and re.match(r"\d{6}\s", line):
                arr = re.split(r"\s\s+", line)
                self.read_point(arr)

    def read_point(self, arr: Sequence[str]):
        lat = re.findall(r"\d+\.\d+", arr[4])
        lon = re.findall(r"\d+\.\d+", arr[5])
        if len(lon) == 0 or len(lat) == 0:
            # there are some cases of missing geo locations
            lon = None
            lat = None
        else:
            lon = float(lon[0])
            lat = float(lat[0])

        code = arr[0]
        name = arr[2].strip(",")
        point = {"name": name, "code": code, "lon": lon, "lat": lat, "routes": []}
        self.points[code] = point

    def read_routes(self, lines: Sequence[str]):
        records = [line.split() for line in lines]
        current_route = records[0][0]
        previous_point = None
        previous_time = None
        for record in records:
            route = record[0]
            point = record[1]
            route_type = record[2]
            time = self.as_time(record[3])
            if route == current_route and previous_point is not None:
                self.add_route(previous_point, point, route_type, time, time - previous_time)
            elif route != current_route:
                current_route = route
            previous_point = point
            previous_time = time

    def add_route(self, point_from: str, point_to: str, route_type: str, time_start: int, duration: int):
        self.route_types.add(route_type)
        res = {"to": point_to, "start": time_start, "time": duration, "type": route_type}
        point = self.points.get(point_from)
        routes = point.get("routes")
        routes.append(res)
        self.routes_num += 1

    def as_time(self, value: str, sep: str = ".") -> int:
        split = [int(val) for val in value.split(sep)]
        res = split[0] * 60 + split[1]
        return res % 1440


class ZtmPostProcessor(object):
    def __init__(self, points: Dict):
        self.points = points

    def fill_missing_values(self):
        for point in self.points.values():
            if point["lon"] is None:
                self.__fill_missing_values(point)

    def __fill_missing_values(self, point):
        routes = point["routes"]
        lon, lat, size = 0, 0, 0
        destinations = set()
        for route in routes:
            destination = self.points[route["to"]]
            if destination["lon"] is None or destination["code"] in destinations:
                continue
            lon += destination["lon"]
            lat += destination["lat"]
            size += 1
            destinations.add(destination["code"])

        if size == 0:
            point["lon"] = 21.017532
            point["lat"] = 52.237049
        else:
            lon /= size
            lat /= size
            point["lon"] = lon
            point["lat"] = lat

    def add_walk_routes(self, max_distance: float, max_points: int):
        for point in self.points.values():
            self.__add_walk_routes(point, max_distance, max_points)

    def __add_walk_routes(self, point: Dict, max_distance: float, max_points: int):
        if point["lon"] is None: return
        for other in self.points.values():
            if other["lon"] is None:
                other["dist"] = sys.maxsize
            else:
                other["dist"] = self.dist(point["lon"], point["lat"], other["lon"], other["lat"])
        self.points[point["code"]]["dist"] = sys.maxsize

        res = sorted(self.points.values(), key=lambda row: row["dist"])
        idx = 0
        routes = point["routes"]
        while idx < max_points:
            row = res[idx]
            if idx > 0 and row["dist"] > max_distance:
                break
            routes.append({"to": row["code"], "time": ceil(12 * row["dist"]), "type": "WALK"})
            idx += 1

    def dist(self, lat1, lon1, lat2, lon2):
        p = 0.017453292519943295  # pi / 180
        a = 0.5 - cos((lat2 - lat1) * p) / 2 + cos(lat1 * p) * cos(lat2 * p) * (1 - cos((lon2 - lon1) * p)) / 2
        return 12742 * asin(sqrt(a))  # 2 * R * asin()


class ZtmJsonWriter:
    def __init__(self, points: Dict, output_dir: str):
        self.points = points
        self.output_dir = output_dir

    def write(self):
        self.write_points()
        self.write_routes()

    def write_routes(self):
        types = {
            "week": {"D1", "D2", "D3", "D4", "D5", "N1", "N2", "N3", "N4", "N7", "DP", "NO", "NS"},
            "sat": {"D6", "N5", "SB", "NO", "NP", "NS"},
            "sun": {"D7", "N6", "DS", "TS", "NO", "NP", "NS"}
        }
        for key, val in types.items():
            idx = 0
            for start in range(0, 1440, 60):
                end = (start + 120) % 1440
                filename = "routes_%s_%d.json" % (key, idx)
                self.write_routes_file(start, end, val, filename)
                idx += 1

    def write_routes_file(self, start: int, end: int, types: Set[str], filename: str):
        res = dict()
        for point in self.points.values():
            routes = self.filter_routes(point["routes"], start, end, types)
            if len(routes) == 0:
                continue
            res[point["code"]] = routes
        self.__write_json(res, filename)

    def filter_routes(self, routes: Sequence[Dict], start: int, end: int, types: Set[str]) -> Dict:
        res = defaultdict(list)
        check_time = lambda rs: rs < start or rs > end
        if end < start:
            check_time = lambda rs: not (rs > start or rs < end)

        for route in routes:
            route_type = route["type"]
            route_start = route.get("start", None)
            duration = route["time"]
            if route_type not in types or check_time(route_start):
                continue
            res[route["to"]].append([route_start, duration])
        return {key: sorted(val, key=lambda item: item[0]) for key, val in res.items()}

    def write_points(self):
        res = dict()
        for point in self.points.values():
            routes = {route["to"]: route["time"] for route in point["routes"] if route["type"] == "WALK"}
            res[point["code"]] = {"lon": point["lon"], "lat": point["lat"], "routes": routes}
        self.__write_json(res, "points.json")

    def __write_json(self, obj, file_name):
        output_path = os.path.join(self.output_dir, file_name)
        with open(output_path, "w", encoding="utf-8") as output_file:
            json.dump(obj, output_file, separators=(",", ":"))
            print("%s" % (file_name,))


if __name__ == '__main__':
    download_ftp("rozklady.ztm.waw.pl", "downloaded.7z")
    decompress_data("downloaded.7z", "downloaded")
    reader = ZtmFormatReader("downloaded", "data/metro.json")
    points = reader.read()
    processor = ZtmPostProcessor(points)
    processor.add_walk_routes(max_distance=1, max_points=100)
    processor.fill_missing_values()
    writer = ZtmJsonWriter(points, "../src/includes")
    writer.write()
