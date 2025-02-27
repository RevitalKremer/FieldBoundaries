from flask import Flask, render_template, request, send_file, jsonify
import cv2
import numpy as np
import json
from steps.step2 import step2_process_image
from steps.step3 import step3_process_image
from steps.step4 import step4_process_image
from steps.step5 import smooth_shape_edges
from steps.step6 import step6_process_image
from steps.step7 import generate_geojson

import os
from geojson import Feature, Polygon, FeatureCollection

app = Flask(__name__)

if not os.path.exists('images'):
    os.makedirs('images')

def step1_process_image_with_point(image_path, point_coords):
    """Process image to draw circle around selected point"""
    try:
        # Read the image
        image = cv2.imread(image_path)
        if image is None:
            return False, "Could not read the image"
        
        cX, cY = point_coords
        
        # Save circle data for step 2
        with open('circle_data.json', 'w') as f:
            json.dump({'cX': cX, 'cY': cY}, f)
        
        # Draw red circle around selected point
        cv2.circle(image, (cX, cY), 40, (0, 0, 255), 2)
        
        # Save processed image
        cv2.imwrite('images/processed_image.jpg', image)
        return True, "Point marked successfully"
        
    except Exception as e:
        return False, f"Error processing image: {str(e)}"
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
        return render_template('findboundaries.html')
    except Exception as e:
        app.logger.error(f"Error in index route: {str(e)}")
        return f"Error accessing template: {str(e)}", 500

@app.route('/process_step1_upload', methods=['POST'])
def process_step1_upload():
    file = request.files['image']
    point_x = int(request.form['pointX'])
    point_y = int(request.form['pointY'])
    
    # Save original image
    file.save('images/uploaded_image.jpg')
    
    # Process image with point
    success, message = step1_process_image_with_point('images/uploaded_image.jpg', (point_x, point_y))
    if success:
        return 'success'
    return message

@app.route('/processed_image')
def processed_image():
    return send_file('images/processed_image.jpg', mimetype='image/jpeg')

@app.route('/process_step2')
def process_step2():
    # Get circle center and radius from step 1
    with open('circle_data.json', 'r') as f:
        circle_data = json.load(f)
    
    success, message = step2_process_image(
        'images/uploaded_image.jpg',
        (circle_data['cX'], circle_data['cY']),
        40  # radius from step 1
    )
    
    if success:
        return 'success'
    return message

@app.route('/green_mask')
def green_mask():
    return send_file('images/green_mask.jpg', mimetype='image/jpeg')

@app.route('/process_step3', methods=['POST'])
def process_step3():
    # Get window size from request
    window_size = int(request.form.get('windowSize', 5))
    success, message = step3_process_image('images/green_mask.jpg', window_size=window_size)
    
    if success:
        # Save window size for step 6
        with open('window_size.json', 'w') as f:
            json.dump({'size': window_size}, f)
        return 'success'
    return message

@app.route('/density_mask')
def density_mask():
    return send_file('images/density_mask.jpg', mimetype='image/jpeg')

@app.route('/process_step4')
def process_step4():
    # Get original point coordinates
    with open('circle_data.json', 'r') as f:
        circle_data = json.load(f)
    
    success, message = step4_process_image(
        'images/density_mask.jpg',
        (circle_data['cX'], circle_data['cY'])
    )
    
    if success:
        return 'success'
    return message

@app.route('/main_shape')
def main_shape():
    return send_file('images/main_shape.jpg', mimetype='image/jpeg')

@app.route('/process_step5', methods=['POST'])
def process_step5():
    epsilon_factor = float(request.form.get('epsilonFactor', 0.001))
    success, message = smooth_shape_edges('images/main_shape.jpg', epsilon_factor)
    if success:
        return 'success'
    return message

@app.route('/smoothed_shape')
def smoothed_shape():
    return send_file('images/smoothed_shape.jpg', mimetype='image/jpeg')

@app.route('/process_step6')
def process_step6():
    # Use smoothed shape from step 4.1 instead of main shape
    success, message = step6_process_image('images/uploaded_image.jpg', 'images/smoothed_shape.jpg')
    if success:
        return 'success'
    return message

@app.route('/masked_field')
def masked_field():
    return send_file('images/masked_field.jpg', mimetype='image/jpeg')

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

def draw_geojson_on_image():
    """Draw the GeoJSON boundary on the original image"""
    try:
        # Read the masked field image to get the contours
        masked_image = cv2.imread('images/masked_field.jpg')
        # Read the original image to draw on
        original_image = cv2.imread('images/uploaded_image.jpg')
        if masked_image is None or original_image is None:
            return False

        # Convert masked image to grayscale
        gray = cv2.cvtColor(masked_image, cv2.COLOR_BGR2GRAY)
        
        # Threshold to get non-white areas
        _, thresh = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
        
        # Find contours of the non-white areas
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            # Get the largest contour (main field area)
            main_contour = max(contours, key=cv2.contourArea)
            
            # Simplify the contour
            epsilon = 0.001 * cv2.arcLength(main_contour, True)
            simplified_contour = cv2.approxPolyDP(main_contour, epsilon, True)
            
            # Draw the boundary line in cyan color (BGR format) on the original image
            cv2.polylines(original_image, [simplified_contour], True, (255, 255, 0), 2)
            
            # Update the GeoJSON file with the new coordinates
            coordinates = simplified_contour.reshape(-1, 2).tolist()
            geojson_data = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [coordinates]
                    },
                    "properties": {}
                }]
            }
            
            # Save the updated GeoJSON
            with open('images/field_boundary.geojson', 'w') as f:
                json.dump(geojson_data, f)
        
        # Save the original image with boundary
        cv2.imwrite('images/final_with_boundary.jpg', original_image)
        return True
    except Exception as e:
        print(f"Error drawing GeoJSON: {str(e)}")
        return False

@app.route('/process_step7')
def process_step7():
    """Generate GeoJSON from the smoothed shape and draw it on the final image"""
    success, message = generate_geojson('images/smoothed_shape.jpg')
    if success:
        if draw_geojson_on_image():
            return 'success'
    return message

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
