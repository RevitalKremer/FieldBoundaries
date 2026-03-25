import cv2
import numpy as np
import json
import os
import threading

import requests as http_requests
from PIL import Image
from io import BytesIO
from ultralytics import FastSAM

from utils import (IMAGES_DIR, make_job_id, job_dir,
                   smooth_mask, limit_contour_points, pixel_geojson_to_geo)

# ── Model loaded once at startup ──────────────────────────────────────────────
_device     = "cuda" if __import__('torch').cuda.is_available() else "cpu"
print("[FastSAM] Loading model…")
_model      = FastSAM("FastSAM-x.pt")   # downloads weights on first run
_model_lock = threading.Lock()
print("[FastSAM] Model ready.")
# ─────────────────────────────────────────────────────────────────────────────


def _infer(pil_image, point_x, point_y):
    """Run FastSAM point-prompt inference. Thread-safe via lock."""
    with _model_lock:
        results = _model(
            pil_image,
            points=[[point_x, point_y]],
            labels=[1],
            device=_device,
            retina_masks=True,
            imgsz=640,
            conf=0.4,
            iou=0.9,
            verbose=False
        )
    return results[0]


def _result_to_pixel_geojson(result, pil_image, jid):
    """Convert FastSAM result to pixel-coord GeoJSON and save overlay image."""
    if result.masks is None or len(result.masks.data) == 0:
        return None, 'FastSAM found no segments for the selected point'

    # Pick the largest mask (most likely the field)
    masks_np = result.masks.data.cpu().numpy()  # (N, H, W)
    areas    = [m.sum() for m in masks_np]
    best_mask = masks_np[int(np.argmax(areas))]
    best_mask = (best_mask > 0.5).astype(np.uint8) * 255
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
        return None, 'No contour found in FastSAM mask'

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


# ── Public API (mirrors sam.py) ───────────────────────────────────────────────

def run_segmentation(job_id):
    """Client-upload flow: image already saved to job dir; run FastSAM."""
    try:
        d = job_dir(job_id)
        with open(os.path.join(d, 'point_data.json'), 'r') as f:
            point_data = json.load(f)

        pil_image = Image.open(os.path.join(d, 'uploaded_image.jpg')).convert('RGB')
        result    = _infer(pil_image, point_data['cX'], point_data['cY'])

        geojson, err = _result_to_pixel_geojson(result, pil_image, job_id)
        if err:
            return err

        with open(os.path.join(d, 'field_boundary.geojson'), 'w') as f:
            json.dump(geojson, f)

        print(f"[FastSAM] {job_id}: {len(geojson['features'][0]['geometry']['coordinates'][0])} pts")
        return 'success'
    except Exception as e:
        print(f"[FastSAM] run_segmentation error: {e}")
        return str(e)


def run_segmentation_by_map_location(lat, lng, bounds, zoom):
    """Server-fetch flow: fetch satellite image, run FastSAM, write pixel GeoJSON."""
    try:
        jid = make_job_id(lat, lng, zoom)
        d   = job_dir(jid)

        if os.path.exists(os.path.join(d, 'field_boundary.geojson')):
            print(f"[FastSAM] {jid}: pixel cache hit")
            return 'success'

        api_key  = os.environ.get('GOOGLE_MAPS_API_KEY', '')
        IMG_SIZE = 640

        static_url = (
            "https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}&zoom={zoom}"
            f"&size={IMG_SIZE}x{IMG_SIZE}&maptype=satellite&key={api_key}"
        )
        print(f"[FastSAM] {jid}: fetching static map")
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

        result = _infer(pil_image, point_x, point_y)
        geojson, err = _result_to_pixel_geojson(result, pil_image, jid)
        if err:
            return err

        with open(os.path.join(d, 'field_boundary.geojson'), 'w') as f:
            json.dump(geojson, f)

        print(f"[FastSAM] {jid}: {len(geojson['features'][0]['geometry']['coordinates'][0])} pts")
        return 'success'
    except Exception as e:
        print(f"[FastSAM] run_segmentation_by_map_location error: {e}")
        return str(e)


def get_polygon_by_map_location(lat, lng, bounds, zoom):
    """Single-call: segment + convert pixel→geo, return GeoJSON dict (with cache)."""
    jid      = make_job_id(lat, lng, zoom)
    d        = job_dir(jid)
    geo_path = os.path.join(d, 'field_boundary_geo.geojson')

    if os.path.exists(geo_path):
        print(f"[FastSAM] {jid}: geo cache hit")
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
