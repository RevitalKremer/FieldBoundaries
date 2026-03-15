import cv2
import numpy as np
import json
import os

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'images')
POINT_DATA = os.path.join(BASE_DIR, 'point_data.json')


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
        import math
        import requests as http_requests
        import torch
        from PIL import Image
        from io import BytesIO
        from transformers import Sam2Processor, Sam2Model

        api_key = os.environ.get('GOOGLE_MAPS_API_KEY', '')
        IMG_SIZE = 640

        center_lat = (bounds['north'] + bounds['south']) / 2
        center_lng = (bounds['east']  + bounds['west'])  / 2

        static_url = (
            "https://maps.googleapis.com/maps/api/staticmap"
            f"?center={center_lat},{center_lng}"
            f"&zoom={zoom}"
            f"&size={IMG_SIZE}x{IMG_SIZE}"
            f"&maptype=satellite"
            f"&key={api_key}"
        )
        print(f"[SAM2] Fetching static map: center=({center_lat},{center_lng}) zoom={zoom}")
        resp = http_requests.get(static_url, timeout=15)
        resp.raise_for_status()

        pil_image = Image.open(BytesIO(resp.content)).convert('RGB')
        image_path = os.path.join(IMAGES_DIR, 'uploaded_image.jpg')
        pil_image.save(image_path)

        # Convert lat/lng → pixel using the same meters-per-pixel formula
        mpp     = 156543.03392 * math.cos(center_lat * math.pi / 180) / math.pow(2, zoom)
        w, h    = pil_image.width, pil_image.height
        dlat    = lat - center_lat
        dlng    = lng - center_lng
        point_x = int(w / 2 + (dlng * 111111 * math.cos(center_lat * math.pi / 180)) / mpp)
        point_y = int(h / 2 - (dlat * 111111) / mpp)
        point_x = max(0, min(point_x, w - 1))
        point_y = max(0, min(point_y, h - 1))
        print(f"[SAM2] Seed pixel: ({point_x}, {point_y})")

        point_data = {
            'cX':       point_x,
            'cY':       point_y,
            'latitude':  lat,
            'longitude': lng,
            'zoom':      zoom,
            'bounds':    bounds,
            'center':   {'lat': center_lat, 'lng': center_lng}
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

        cv_image = cv2.imread(image_path)
        overlay  = cv_image.copy()
        overlay[mask > 0] = [0, 200, 200]
        result_img = cv2.addWeighted(cv_image, 0.6, overlay, 0.4, 0)
        cv2.imwrite(os.path.join(IMAGES_DIR, 'sam_result.jpg'), result_img)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 'No contour found in SAM2 mask'

        main_contour = max(contours, key=cv2.contourArea)
        epsilon      = 0.001 * cv2.arcLength(main_contour, True)
        simplified   = cv2.approxPolyDP(main_contour, epsilon, True)

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

        cv_image = cv2.imread(image_path)
        overlay  = cv_image.copy()
        overlay[mask > 0] = [0, 200, 200]
        result_img = cv2.addWeighted(cv_image, 0.6, overlay, 0.4, 0)
        cv2.imwrite(os.path.join(IMAGES_DIR, 'sam_result.jpg'), result_img)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 'No contour found in SAM2 mask'

        main_contour = max(contours, key=cv2.contourArea)
        epsilon      = 0.001 * cv2.arcLength(main_contour, True)
        simplified   = cv2.approxPolyDP(main_contour, epsilon, True)

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
