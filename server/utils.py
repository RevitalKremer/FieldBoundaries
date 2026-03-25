"""Shared utilities for sam.py and fastsam.py."""
import cv2
import math
import json
import os

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'images')

MAX_POLYGON_POINTS = 25


def make_job_id(lat, lng, zoom):
    return f"{float(lat):.5f}_{float(lng):.5f}_{int(zoom)}"


def job_dir(job_id):
    d = os.path.join(IMAGES_DIR, job_id)
    os.makedirs(d, exist_ok=True)
    return d


def smooth_mask(mask):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel, iterations=1)
    blurred = cv2.GaussianBlur(mask, (9, 9), 0)
    _, mask = cv2.threshold(blurred, 127, 255, cv2.THRESH_BINARY)
    return mask


def limit_contour_points(contour, max_points=MAX_POLYGON_POINTS):
    perimeter  = cv2.arcLength(contour, True)
    epsilon    = 0.001 * perimeter
    simplified = cv2.approxPolyDP(contour, epsilon, True)

    if len(simplified) > max_points:
        lo, hi = epsilon, perimeter
        for _ in range(20):
            mid       = (lo + hi) / 2
            candidate = cv2.approxPolyDP(contour, mid, True)
            if len(candidate) <= max_points:
                simplified = candidate
                hi = mid
            else:
                lo = mid

    return simplified


def pixel_geojson_to_geo(geojson, point_data):
    """Convert pixel-coordinate polygon → lat/lng GeoJSON in-place."""
    pixel_coords = geojson['features'][0]['geometry']['coordinates'][0]
    center_lat   = float(point_data['center']['lat'])
    center_lng   = float(point_data['center']['lng'])
    zoom_level   = int(point_data['zoom'])
    w, h         = point_data['image_size']

    def p2ll(px, py):
        mpp  = 156543.03392 * math.cos(center_lat * math.pi / 180) / math.pow(2, zoom_level)
        dlat = ((h / 2 - py) * mpp) / 111111
        dlng = ((px - w / 2) * mpp) / (111111 * math.cos(center_lat * math.pi / 180))
        return center_lat + dlat, center_lng + dlng

    geo_coords = []
    for x, y in pixel_coords:
        lat_c, lng_c = p2ll(x, y)
        geo_coords.append([lng_c, lat_c])
    if geo_coords[0] != geo_coords[-1]:
        geo_coords.append(geo_coords[0])

    geojson['features'][0]['geometry']['coordinates'] = [geo_coords]
    geojson['features'][0]['properties'] = {
        'bounds':         point_data['bounds'],
        'center':         {'lat': center_lat, 'lng': center_lng},
        'zoom':           zoom_level,
        'selected_point': {'lat': point_data['latitude'], 'lng': point_data['longitude']}
    }
    return geojson
