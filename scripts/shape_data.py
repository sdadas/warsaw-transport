from math import floor
from typing import Callable
from PIL import Image
import json


def process_image(input_path: str, output_path: str):
    img = Image.open(input_path, 'r')
    pix = img.load()
    height = img.size[1]
    width = img.size[0]

    visible_predicate = lambda color: color[3] > 0
    vborder = [process_line(lambda idx: pix[i, idx], visible_predicate, height) for i in range(width)]
    hborder = [process_line(lambda idx: pix[idx, j], visible_predicate, width) for j in range(height)]

    blue_predicate = lambda color: color[2] == 255
    rborder = [process_line(lambda idx: pix[idx, j], blue_predicate, width) for j in range(height)]
    river = [floor((bmin + bmax) / 2) for bmin, bmax in rborder]

    first_val = next((idx, river[idx]) for idx in range(len(river)) if river[idx] > 0)
    last_val = next((len(river) - 1 - idx, river[-idx]) for idx in range(len(river)) if river[-idx] > 0)
    river[:first_val[0]] = [first_val[1]] * first_val[0]
    river[last_val[0]:] = [last_val[1]] * (len(river) - last_val[0])

    res = dict()
    res["center"] = [52.237049, 21.017532]
    res["box"] = [[52.097851, 20.851688], [52.368153, 21.271151]]
    res["hborder"] = hborder
    res["vborder"] = vborder
    res["size"] = [width, height]
    res["river"] = river
    with open(output_path, "w") as output_file:
        json.dump(res, output_file, sort_keys=True)


def process_line(getter: Callable, color_predicate: Callable, size):
    border_min = 0
    border_max = 0
    for i in range(size):
        color = getter(i)
        if color_predicate(color):
            border_min = i
            break
    for i in range(size - 1, 0, -1):
        color = getter(i)
        if color_predicate(color):
            border_max = i
            break
    return [border_min, border_max]


if __name__ == '__main__':
    process_image("data/warsaw.png", "../src/includes/warsaw.json")
