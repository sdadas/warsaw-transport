from typing import Callable
from PIL import Image
import json


def process_image(input_path: str, output_path: str):
    img = Image.open(input_path, 'r')
    pix = img.load()
    height = img.size[1]
    width = img.size[0]

    vborder = [process_line(lambda idx: pix[i, idx], height) for i in range(width)]
    hborder = [process_line(lambda idx: pix[idx, j], width) for j in range(height)]

    res = dict()
    res["center"] = [52.237049, 21.017532]
    res["box"] = [[52.097851, 20.851688], [52.368153, 21.271151]]
    res["hborder"] = hborder
    res["vborder"] = vborder
    res["size"] = [width, height]
    with open(output_path, "w") as output_file:
        json.dump(res, output_file, sort_keys=True)


def process_line(getter: Callable, size):
    border_min = 0
    border_max = 0
    for i in range(size):
        color = getter(i)
        if color[3] > 0:
            border_min = i
            break
    for i in range(size - 1, 0, -1):
        color = getter(i)
        if color[3] > 0:
            border_max = i
            break
    return [border_min, border_max]


if __name__ == '__main__':
    process_image("data/warsaw.png", "../src/includes/warsaw.json")
