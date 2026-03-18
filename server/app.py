try:
    from dotenv import load_dotenv
except ImportError:
    print("\nError: The 'python-dotenv' package is not installed.")
    print("Please install it using: pip install python-dotenv\n")
    raise

from flask import Flask, render_template, request, send_file, jsonify
from sam import (run_segmentation, run_segmentation_by_map_location,
                 get_polygon_by_map_location, make_job_id, job_dir,
                 pixel_geojson_to_geo)

import json
import math
import os
import time

load_dotenv()

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'images')

app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'client'),
            static_folder=os.path.join(BASE_DIR, 'client', 'static'),
            static_url_path='/static')

GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', '')
if not GOOGLE_MAPS_API_KEY:
    print("WARNING: GOOGLE_MAPS_API_KEY is not set in .env")

os.makedirs(IMAGES_DIR, exist_ok=True)


# ============= ROUTES =============

@app.route('/')
def index():
    return render_template('index.html',
                           google_maps_api_key=GOOGLE_MAPS_API_KEY,
                           timestamp=int(time.time()))


@app.route('/upload_image', methods=['POST'])
def upload_image():
    try:
        image = request.files.get('image')
        if not image:
            return 'Error: No image provided'

        lat    = float(request.form.get('latitude'))
        lng    = float(request.form.get('longitude'))
        zoom   = int(request.form.get('zoom'))
        jid    = make_job_id(lat, lng, zoom)
        d      = job_dir(jid)

        point_x = int(request.form.get('pointX'))
        point_y = int(request.form.get('pointY'))

        img_path = os.path.join(d, 'uploaded_image.jpg')
        image.save(img_path)

        # Get image dimensions for pixel→geo conversion
        import cv2
        img = cv2.imread(img_path)
        w, h = (img.shape[1], img.shape[0]) if img is not None else (640, 640)

        point_data = {
            'cX': point_x, 'cY': point_y,
            'latitude': lat, 'longitude': lng,
            'zoom': zoom,
            'bounds': {
                'north': float(request.form.get('bounds[north]')),
                'south': float(request.form.get('bounds[south]')),
                'east':  float(request.form.get('bounds[east]')),
                'west':  float(request.form.get('bounds[west]'))
            },
            'center': {
                'lat': float(request.form.get('center[lat]')),
                'lng': float(request.form.get('center[lng]'))
            },
            'image_size': [w, h]
        }
        with open(os.path.join(d, 'point_data.json'), 'w') as f:
            json.dump(point_data, f)

        return jid   # job_id — client passes this to subsequent calls
    except Exception as e:
        print(f"Error in upload_image: {e}")
        return f'Error: {e}'


@app.route('/run_segmentation')
def run_segmentation_route():
    job_id = request.args.get('job_id')
    if not job_id:
        return 'Error: job_id required', 400
    return run_segmentation(job_id)


@app.route('/run_segmentation_by_map_location', methods=['POST'])
def run_segmentation_by_map_location_route():
    try:
        data   = request.get_json(force=True)
        lat    = float(data['lat'])
        lng    = float(data['lng'])
        bounds = data['bounds']
        zoom   = int(data['zoom'])
        result = run_segmentation_by_map_location(lat, lng, bounds, zoom)
        if result != 'success':
            return result, 400
        return make_job_id(lat, lng, zoom)   # job_id — client passes to convert/download
    except Exception as e:
        print(f"Error in run_segmentation_by_map_location: {e}")
        return str(e), 400


@app.route('/get_polygon_by_map_location', methods=['POST'])
def get_polygon_by_map_location_route():
    try:
        data   = request.get_json(force=True)
        lat    = float(data['lat'])
        lng    = float(data['lng'])
        bounds = data['bounds']
        zoom   = int(data['zoom'])
        result = get_polygon_by_map_location(lat, lng, bounds, zoom)
        if isinstance(result, str):
            return result, 400
        return jsonify(result)
    except Exception as e:
        print(f"Error in get_polygon_by_map_location: {e}")
        return str(e), 400


@app.route('/convert_to_geojson')
def convert_to_geojson():
    try:
        job_id = request.args.get('job_id')
        if not job_id:
            return 'Error: job_id required', 400

        d = os.path.join(IMAGES_DIR, job_id)
        with open(os.path.join(d, 'point_data.json'), 'r') as f:
            point_data = json.load(f)
        with open(os.path.join(d, 'field_boundary.geojson'), 'r') as f:
            geojson = json.load(f)

        geojson = pixel_geojson_to_geo(geojson, point_data)

        with open(os.path.join(d, 'field_boundary_geo.geojson'), 'w') as f:
            json.dump(geojson, f)

        return 'success'
    except Exception as e:
        print(f"Error in convert_to_geojson: {e}")
        return str(e)


@app.route('/download_geojson')
def download_geojson():
    try:
        job_id = request.args.get('job_id')
        if not job_id:
            return 'Error: job_id required', 400
        geo_path = os.path.join(IMAGES_DIR, job_id, 'field_boundary_geo.geojson')
        return send_file(geo_path, mimetype='application/geo+json',
                         as_attachment=True, download_name='field_boundary.geojson')
    except Exception as e:
        return str(e), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True, threaded=True)
