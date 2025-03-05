try:
    from dotenv import load_dotenv
except ImportError:
    print("\nError: The 'python-dotenv' package is not installed.")
    print("Please install it using one of these commands:")
    print("    pip install python-dotenv")
    print("    pip3 install python-dotenv\n")
    raise

from flask import Flask, render_template, request, send_file, jsonify, url_for
import cv2
import numpy as np
import json
from steps.step2 import process_step2
from steps.step3 import process_step3
from steps.step4 import process_step4
from steps.step5 import process_step5
from steps.step6 import process_step6    
from steps.step7 import process_step7
from steps.step8 import process_step8

import os
from geojson import Feature, Polygon, FeatureCollection
import time

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static')

# Get Google Maps API key from environment
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY')

if not os.path.exists('images'):
    os.makedirs('images')

def get_timestamp():
    """Generate a timestamp for cache busting"""
    return int(time.time())

def overlay_point_on_image(image_path, point_coords, save_path=None):
    """Overlay the selected point on an image without modifying the original"""
    try:
        # Read the image
        image = cv2.imread(image_path)
        if image is None:
            return False
            
        # Create a copy for display
        display_image = image.copy()
        
        # Draw red point
        point_radius = 5
        cv2.circle(display_image, point_coords, point_radius, (0, 0, 255), -1)
        
        # Save if path provided, otherwise return the image
        if save_path:
            cv2.imwrite(save_path, display_image)
            return True
        return display_image
        
    except Exception:
        return False

def create_gray_overlay(image_path, opacity=0.5):
    """Create a white overlay version of the original image"""
    try:
        # Read the image
        image = cv2.imread(image_path)
        if image is None:
            return False
            
        # Create white image of same size
        white = np.ones_like(image) * 255
        
        # Apply opacity
        overlay = cv2.addWeighted(white, opacity, image, 1-opacity, 0)
        
        return overlay
    except Exception:
        return False

@app.route('/')
def index():
    try:
        return render_template('findboundaries.html', 
                             google_maps_api_key=GOOGLE_MAPS_API_KEY,
                             timestamp=get_timestamp())
    except Exception as e:
        app.logger.error(f"Error in index route: {str(e)}")
        return f"Error accessing template: {str(e)}", 500

@app.route('/process_step<int:step_id>', methods=['GET', 'POST'])
def process_step(step_id):
    step_function = globals()[f'process_step{step_id}']
    return step_function()

@app.route('/processed_image')
def processed_image():
    return send_file('images/step2_processed_image.jpg', mimetype='image/jpeg')

@app.route('/image/<image_name>')
def get_image(image_name):
    return send_file(f'images/{image_name}', mimetype='image/jpeg')

@app.route('/display/<path:filename>')
def display_image(filename):
    """Serve images with point overlay"""
    try:
        with open('circle_data.json', 'r') as f:
            circle_data = json.load(f)
        point = (circle_data['cX'], circle_data['cY'])
        
        # Create temporary display version with point
        temp_path = f'images/display_{filename}'
        if overlay_point_on_image(f'images/{filename}', point, temp_path):
            return send_file(temp_path, mimetype='image/jpeg')
        return send_file(f'images/{filename}', mimetype='image/jpeg')
    except Exception:
        return send_file(f'images/{filename}', mimetype='image/jpeg')

@app.route('/gray_overlay')
def gray_overlay():
    """Serve the gray overlay version of the original image"""
    try:
        overlay = create_gray_overlay('images/uploaded_image.jpg')
        if overlay is not False:
            cv2.imwrite('images/gray_overlay.jpg', overlay)
            return send_file('images/gray_overlay.jpg', mimetype='image/jpeg')
    except Exception:
        pass
    return send_file('images/uploaded_image.jpg', mimetype='image/jpeg')


@app.route('/download_geojson')
def download_geojson():
    """Download the generated GeoJSON file"""
    try:
        return send_file('images/field_boundary.geojson',
                        mimetype='application/geo+json',
                        as_attachment=True,
                        download_name='field_boundary.geojson')
    except Exception as e:
        return str(e), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
