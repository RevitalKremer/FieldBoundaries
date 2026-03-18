import cv2
import math
import numpy as np
import json
import os
import threading

import requests as http_requests
import torch
from PIL import Image
from io import BytesIO
from transformers import Sam2Processor, Sam2Model

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'images')

MAX_POLYGON_POINTS = 25

# ── Model loaded once at startup ──────────────────────────────────────────────
_device     = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[SAM2] Loading model on {_device}…")
_processor  = Sam2Processor.from_pretrained("facebook/sam2-hiera-large")
_model      = Sam2Model.from_pretrained("facebook/sam2-hiera-large").to(_device)
_model.eval()
_model_lock = threading.Lock()
print("[SAM2] Model ready.")
# ─────────────────────────────────────────────────────────────────────────────


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


def _infer(pil_image, point_x, point_y):
    """Run SAM2 inference. Serialized via lock — safe for threaded Flask."""
    inputs = _processor(
        images=pil_image,
        input_points=[[[[point_x, point_y]]]],
        input_labels=[[[1]]],
        return_tensors="pt"
    ).to(_device)

    with _model_lock:
        with torch.no_grad():
            outputs = _model(**inputs)

    return outputs.pred_masks[0, 0], outputs.iou_scores[0, 0]


def _masks_to_pixel_geojson(pil_image, pred_masks, scores, jid):
    """Convert SAM2 output to pixel-coord GeoJSON and save result overlay image."""
    if pred_masks.shape[0] == 0:
        return None, 'SAM2 found no segments for the selected point'

    best_mask = pred_masks[int(scores.argmax())].numpy()
    best_mask = (best_mask > 0).astype(np.uint8) * 255
    mask = cv2.resize(best_mask, (pil_image.width, pil_image.height),
                      interpolation=cv2.INTER_NEAREST)
    mask = smooth_mask(mask)

    cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    overlay  = cv_image.copy()
    overlay[mask > 0] = [0, 200, 200]
    cv2.imwrite(os.path.join(job_dir(jid), 'sam_result.jpg'),
                cv2.addWeighted(cv_image, 0.6, overlay, 0.4, 0))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, 'No contour found in SAM2 mask'

    simplified  = limit_contour_points(max(contours, key=cv2.contourArea))
    coordinates = simplified.reshape(-1, 2).tolist()
    coordinates.append(coordinates[0])

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coordinates]},
            "properties": {}
        }]
    }
    return geojson, None


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


# ── Public API ────────────────────────────────────────────────────────────────

def run_segmentation(job_id):
    """Client-upload flow: image already saved to job dir; run SAM2."""
    try:
        d = job_dir(job_id)
        with open(os.path.join(d, 'point_data.json'), 'r') as f:
            point_data = json.load(f)

        pil_image          = Image.open(os.path.join(d, 'uploaded_image.jpg')).convert('RGB')
        pred_masks, scores = _infer(pil_image, point_data['cX'], point_data['cY'])

        geojson, err = _masks_to_pixel_geojson(pil_image, pred_masks, scores, job_id)
        if err:
            return err

        with open(os.path.join(d, 'field_boundary.geojson'), 'w') as f:
            json.dump(geojson, f)

        print(f"[SAM2] {job_id}: {len(geojson['features'][0]['geometry']['coordinates'][0])} pts")
        return 'success'
    except Exception as e:
        print(f"[SAM2] run_segmentation error: {e}")
        return str(e)


def run_segmentation_by_map_location(lat, lng, bounds, zoom):
    """Server-fetch flow: fetch satellite image, run SAM2, write pixel GeoJSON."""
    try:
        jid = make_job_id(lat, lng, zoom)
        d   = job_dir(jid)

        # Cache: pixel boundary already computed
        if os.path.exists(os.path.join(d, 'field_boundary.geojson')):
            print(f"[SAM2] {jid}: pixel cache hit")
            return 'success'

        api_key  = os.environ.get('GOOGLE_MAPS_API_KEY', '')
        IMG_SIZE = 640

        static_url = (
            "https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}&zoom={zoom}"
            f"&size={IMG_SIZE}x{IMG_SIZE}&maptype=satellite&key={api_key}"
        )
        print(f"[SAM2] {jid}: fetching static map")
        resp = http_requests.get(static_url, timeout=15)
        resp.raise_for_status()

        pil_image  = Image.open(BytesIO(resp.content)).convert('RGB')
        image_path = os.path.join(d, 'uploaded_image.jpg')
        pil_image.save(image_path)

        point_x, point_y = pil_image.width // 2, pil_image.height // 2

        point_data = {
            'cX': point_x, 'cY': point_y,
            'latitude': lat, 'longitude': lng,
            'zoom': zoom, 'bounds': bounds,
            'center': {'lat': lat, 'lng': lng},
            'image_size': [pil_image.width, pil_image.height]
        }
        with open(os.path.join(d, 'point_data.json'), 'w') as f:
            json.dump(point_data, f)

        pred_masks, scores = _infer(pil_image, point_x, point_y)
        geojson, err = _masks_to_pixel_geojson(pil_image, pred_masks, scores, jid)
        if err:
            return err

        with open(os.path.join(d, 'field_boundary.geojson'), 'w') as f:
            json.dump(geojson, f)

        print(f"[SAM2] {jid}: {len(geojson['features'][0]['geometry']['coordinates'][0])} pts")
        return 'success'
    except Exception as e:
        print(f"[SAM2] run_segmentation_by_map_location error: {e}")
        return str(e)


def get_polygon_by_map_location(lat, lng, bounds, zoom):
    """Single-call: segment + convert pixel→geo, return GeoJSON dict (with cache)."""
    jid      = make_job_id(lat, lng, zoom)
    d        = job_dir(jid)
    geo_path = os.path.join(d, 'field_boundary_geo.geojson')

    if os.path.exists(geo_path):
        print(f"[SAM2] {jid}: geo cache hit")
        with open(geo_path, 'r') as f:
            return json.load(f)

    result = run_segmentation_by_map_location(lat, lng, bounds, zoom)
    if result != 'success':
        return result

    with open(os.path.join(d, 'point_data.json'), 'r') as f:
        point_data = json.load(f)
    with open(os.path.join(d, 'field_boundary.geojson'), 'r') as f:
        geojson = json.load(f)

    geojson = pixel_geojson_to_geo(geojson, point_data)

    with open(geo_path, 'w') as f:
        json.dump(geojson, f)

    return geojson
