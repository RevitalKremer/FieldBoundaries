import cv2
import numpy as np
import json
import os

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'images')
POINT_DATA = os.path.join(BASE_DIR, 'point_data.json')

MAX_POLYGON_POINTS = 25


def smooth_mask(mask):
    """Smooth a binary SAM mask with morphological ops + Gaussian blur."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel, iterations=1)
    blurred = cv2.GaussianBlur(mask, (9, 9), 0)
    _, mask = cv2.threshold(blurred, 127, 255, cv2.THRESH_BINARY)
    return mask


def limit_contour_points(contour, max_points=MAX_POLYGON_POINTS):
    """Simplify a contour to at most max_points using adaptive Douglas-Peucker."""
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


def get_polygon_by_map_location(lat, lng, bounds, zoom):
    """
    Single-call version: runs segmentation + pixel→geo conversion and returns
    the GeoJSON FeatureCollection directly (dict), or an error string.
    """
    import math

    result = run_segmentation_by_map_location(lat, lng, bounds, zoom)
    if result != 'success':
        return result

    with open(POINT_DATA, 'r') as f:
        point_data = json.load(f)
    with open(os.path.join(IMAGES_DIR, 'field_boundary.geojson'), 'r') as f:
        geojson = json.load(f)

    pixel_coords = geojson['features'][0]['geometry']['coordinates'][0]
    center_lat   = float(point_data['center']['lat'])
    center_lng   = float(point_data['center']['lng'])
    zoom_level   = int(point_data['zoom'])
    img          = cv2.imread(os.path.join(IMAGES_DIR, 'uploaded_image.jpg'))
    w, h         = (img.shape[1], img.shape[0]) if img is not None else (640, 640)

    def pixel_to_latlng(px, py):
        mpp  = 156543.03392 * math.cos(center_lat * math.pi / 180) / math.pow(2, zoom_level)
        dlat = ((h / 2 - py) * mpp) / 111111
        dlng = ((px - w / 2) * mpp) / (111111 * math.cos(center_lat * math.pi / 180))
        return center_lat + dlat, center_lng + dlng

    geo_coords = []
    for x, y in pixel_coords:
        lat_c, lng_c = pixel_to_latlng(x, y)
        geo_coords.append([lng_c, lat_c])
    if geo_coords[0] != geo_coords[-1]:
        geo_coords.append(geo_coords[0])

    geojson['features'][0]['geometry']['coordinates'] = [geo_coords]
    geojson['features'][0]['properties'] = {
        'bounds': point_data['bounds'],
        'center': {'lat': center_lat, 'lng': center_lng},
        'zoom': zoom_level,
        'selected_point': {'lat': lat, 'lng': lng}
    }

    with open(os.path.join(IMAGES_DIR, 'field_boundary.geojson'), 'w') as f:
        json.dump(geojson, f)

    return geojson


def run_segmentation_by_map_location(lat, lng, bounds, zoom):
    """
    Take a server-side satellite screenshot via Google Static Maps API, then run SAM2.

    Args:
        lat:    float  – latitude of the seed point (SAM2 input point)
        lng:    float  – longitude of the seed point
        bounds: dict   – {north, south, east, west}
        zoom:   int    – map zoom level

    Returns same output as run_segmentation(): 'success' or an error string.
    Writes uploaded_image.jpg, sam_result.jpg, field_boundary.geojson, and point_data.json.
    """
    try:
        import requests as http_requests
        import torch
        from PIL import Image
        from io import BytesIO
        from transformers import Sam2Processor, Sam2Model

        api_key = os.environ.get('GOOGLE_MAPS_API_KEY', '')
        IMG_SIZE = 640

        # Center the static map on the clicked point — same as the client does —
        # so the seed pixel is always at image center and both methods see the same tile.
        static_url = (
            "https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}"
            f"&zoom={zoom}"
            f"&size={IMG_SIZE}x{IMG_SIZE}"
            f"&maptype=satellite"
            f"&key={api_key}"
        )
        print(f"[SAM2] Fetching static map: center=({lat},{lng}) zoom={zoom}")
        resp = http_requests.get(static_url, timeout=15)
        resp.raise_for_status()

        pil_image = Image.open(BytesIO(resp.content)).convert('RGB')
        image_path = os.path.join(IMAGES_DIR, 'uploaded_image.jpg')
        pil_image.save(image_path)

        # Clicked point is at image center
        point_x = pil_image.width  // 2
        point_y = pil_image.height // 2
        print(f"[SAM2] Seed pixel: ({point_x}, {point_y})")

        point_data = {
            'cX':       point_x,
            'cY':       point_y,
            'latitude':  lat,
            'longitude': lng,
            'zoom':      zoom,
            'bounds':    bounds,
            'center':   {'lat': lat, 'lng': lng}
        }
        with open(POINT_DATA, 'w') as f:
            json.dump(point_data, f)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[SAM2] Using device: {device}")

        processor = Sam2Processor.from_pretrained("facebook/sam2-hiera-large")
        model     = Sam2Model.from_pretrained("facebook/sam2-hiera-large").to(device)
        model.eval()

        inputs = processor(
            images=pil_image,
            input_points=[[[[point_x, point_y]]]],
            input_labels=[[[1]]],
            return_tensors="pt"
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        pred_masks = outputs.pred_masks[0, 0]
        scores     = outputs.iou_scores[0, 0]

        if pred_masks.shape[0] == 0:
            return 'SAM2 found no segments for the selected point'

        best_idx  = int(scores.argmax())
        best_mask = pred_masks[best_idx].numpy()
        best_mask = (best_mask > 0).astype(np.uint8) * 255
        mask = cv2.resize(best_mask, (pil_image.width, pil_image.height),
                          interpolation=cv2.INTER_NEAREST)

        mask = smooth_mask(mask)

        cv_image = cv2.imread(image_path)
        overlay  = cv_image.copy()
        overlay[mask > 0] = [0, 200, 200]
        result_img = cv2.addWeighted(cv_image, 0.6, overlay, 0.4, 0)
        cv2.imwrite(os.path.join(IMAGES_DIR, 'sam_result.jpg'), result_img)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 'No contour found in SAM2 mask'

        main_contour = max(contours, key=cv2.contourArea)
        simplified   = limit_contour_points(main_contour)

        coordinates = simplified.reshape(-1, 2).tolist()
        coordinates.append(coordinates[0])

        geojson_data = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                "properties": {}
            }]
        }
        with open(os.path.join(IMAGES_DIR, 'field_boundary.geojson'), 'w') as f:
            json.dump(geojson_data, f)

        print(f"[SAM2] Segmentation done. Contour points: {len(coordinates)}")
        return 'success'

    except Exception as e:
        print(f"[SAM2] Error: {str(e)}")
        return str(e)


def run_segmentation():
    """Run SAM2 segmentation using the selected point from point_data.json"""
    try:
        with open(POINT_DATA, 'r') as f:
            point_data = json.load(f)

        point_x = point_data['cX']
        point_y = point_data['cY']

        import torch
        from PIL import Image
        from transformers import Sam2Processor, Sam2Model

        image_path = os.path.join(IMAGES_DIR, 'uploaded_image.jpg')
        pil_image = Image.open(image_path).convert('RGB')

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[SAM2] Using device: {device}")

        processor = Sam2Processor.from_pretrained("facebook/sam2-hiera-large")
        model = Sam2Model.from_pretrained("facebook/sam2-hiera-large").to(device)
        model.eval()

        inputs = processor(
            images=pil_image,
            input_points=[[[[point_x, point_y]]]],
            input_labels=[[[1]]],
            return_tensors="pt"
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        pred_masks = outputs.pred_masks[0, 0]
        scores     = outputs.iou_scores[0, 0]

        if pred_masks.shape[0] == 0:
            return 'SAM2 found no segments for the selected point'

        best_idx  = int(scores.argmax())
        best_mask = pred_masks[best_idx].numpy()
        best_mask = (best_mask > 0).astype(np.uint8) * 255
        mask = cv2.resize(best_mask, (pil_image.width, pil_image.height),
                          interpolation=cv2.INTER_NEAREST)

        mask = smooth_mask(mask)

        cv_image = cv2.imread(image_path)
        overlay  = cv_image.copy()
        overlay[mask > 0] = [0, 200, 200]
        result_img = cv2.addWeighted(cv_image, 0.6, overlay, 0.4, 0)
        cv2.imwrite(os.path.join(IMAGES_DIR, 'sam_result.jpg'), result_img)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 'No contour found in SAM2 mask'

        main_contour = max(contours, key=cv2.contourArea)
        simplified   = limit_contour_points(main_contour)

        coordinates = simplified.reshape(-1, 2).tolist()
        coordinates.append(coordinates[0])

        geojson_data = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                "properties": {}
            }]
        }

        with open(os.path.join(IMAGES_DIR, 'field_boundary.geojson'), 'w') as f:
            json.dump(geojson_data, f)

        print(f"[SAM2] Segmentation done. Contour points: {len(coordinates)}")
        return 'success'

    except Exception as e:
        print(f"[SAM2] Error: {str(e)}")
        return str(e)
