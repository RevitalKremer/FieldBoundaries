try:
    from dotenv import load_dotenv
except ImportError:
    print("\nError: The 'python-dotenv' package is not installed.")
    print("Please install it using: pip install python-dotenv\n")
    raise

from flask import Flask, render_template, request, send_file
from steps.step_sam import process_step_sam

import cv2
import json
import math
import os
import time

load_dotenv()

app = Flask(__name__, static_folder='static')

GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', '')
if not GOOGLE_MAPS_API_KEY:
    print("WARNING: GOOGLE_MAPS_API_KEY is not set in .env")

if not os.path.exists('images'):
    os.makedirs('images')


# ============= ROUTES =============

@app.route('/')
def index():
    return render_template('fieldboundaries_sam.html',
                           google_maps_api_key=GOOGLE_MAPS_API_KEY,
                           timestamp=int(time.time()))


@app.route('/upload_image', methods=['POST'])
def upload_image():
    try:
        image = request.files.get('image')
        if not image:
            return 'Error: No image provided'

        point_x = int(request.form.get('pointX'))
        point_y = int(request.form.get('pointY'))

        image.save('images/uploaded_image.jpg')

        point_data = {
            'cX': point_x,
            'cY': point_y,
            'radius': int(request.form.get('radiusSize', 40)),
            'latitude': request.form.get('latitude'),
            'longitude': request.form.get('longitude'),
            'zoom': request.form.get('zoom'),
            'bounds': {
                'north': float(request.form.get('bounds[north]')),
                'south': float(request.form.get('bounds[south]')),
                'east':  float(request.form.get('bounds[east]')),
                'west':  float(request.form.get('bounds[west]'))
            },
            'center': {
                'lat': float(request.form.get('center[lat]')),
                'lng': float(request.form.get('center[lng]'))
            }
        }
        with open('point_data.json', 'w') as f:
            json.dump(point_data, f)

        return 'success'
    except Exception as e:
        print(f"Error in upload_image: {e}")
        return str(e)


@app.route('/convert_to_geojson')
def convert_to_geojson():
    try:
        with open('point_data.json', 'r') as f:
            point_data = json.load(f)
        with open('images/field_boundary.geojson', 'r') as f:
            geojson = json.load(f)

        pixel_coords = geojson['features'][0]['geometry']['coordinates'][0]
        center_lat = float(point_data['center']['lat'])
        center_lng = float(point_data['center']['lng'])
        zoom = int(point_data['zoom'])

        def pixel_to_latlng(px, py):
            mpp = 156543.03392 * math.cos(center_lat * math.pi / 180) / math.pow(2, zoom)
            img = cv2.imread('images/uploaded_image.jpg')
            w, h = (img.shape[1], img.shape[0]) if img is not None else (640, 640)
            dlat = ((h / 2 - py) * mpp) / 111111
            dlng = ((px - w / 2) * mpp) / (111111 * math.cos(center_lat * math.pi / 180))
            return center_lat + dlat, center_lng + dlng

        geo_coords = []
        for x, y in pixel_coords:
            lat, lng = pixel_to_latlng(x, y)
            geo_coords.append([lng, lat])
        if geo_coords[0] != geo_coords[-1]:
            geo_coords.append(geo_coords[0])

        geojson['features'][0]['geometry']['coordinates'] = [geo_coords]
        geojson['features'][0]['properties'] = {
            'bounds': point_data['bounds'],
            'center': {'lat': center_lat, 'lng': center_lng},
            'zoom': zoom,
            'selected_point': {
                'lat': float(point_data['latitude']),
                'lng': float(point_data['longitude'])
            }
        }

        with open('images/field_boundary.geojson', 'w') as f:
            json.dump(geojson, f)

        return 'success'
    except Exception as e:
        print(f"Error in convert_to_geojson: {e}")
        return str(e)


@app.route('/run_segmentation')
def run_segmentation():
    return process_step_sam()



@app.route('/download_geojson')
def download_geojson():
    try:
        return send_file('images/field_boundary.geojson',
                         mimetype='application/geo+json',
                         as_attachment=True,
                         download_name='field_boundary.geojson')
    except Exception as e:
        return str(e), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)
