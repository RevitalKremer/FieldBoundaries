from flask import request
import cv2
import numpy as np
import json
import urllib.request

def download_image_from_url(url):
    """Download image from URL and save it"""
    try:
        resp = urllib.request.urlopen(url)
        arr = np.asarray(bytearray(resp.read()), dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        
        if image is not None:
            cv2.imwrite('images/uploaded_image.jpg', image)
            return True
        return False
    except Exception as e:
        print(f"Error downloading image: {str(e)}")
        return False


def step1_process_image_with_point(image_path, point_x, point_y, radius=40, latitude=None, longitude=None, zoom=None, map_bounds=None, map_center=None):
    """Process the image from step 1 with the selected point"""
    try:
        # If image_path is a URL, download it first
        if image_path.startswith('http'):
            if not download_image_from_url(image_path):
                return False, "Could not download the image from URL"
            image_path = 'images/uploaded_image.jpg'
        
        # Read the image
        image = cv2.imread(image_path)
        if image is None:
            return False, "Could not read the image"
        
        # Store circle data
        circle_data = {
            'cX': point_x,
            'cY': point_y,
            'radius': radius,
            'latitude': latitude,
            'longitude': longitude,
            'zoom': zoom,
            'bounds': map_bounds,
            'center': map_center
        }
        
        with open('circle_data.json', 'w') as f:
            json.dump(circle_data, f)
        
        # Draw red circle around selected point
        cv2.circle(image, (point_x, point_y), radius, (0, 0, 255), 2)
        cv2.circle(image, (point_x, point_y), 5, (0, 0, 255), -1)
        
        # Save processed image
        cv2.imwrite('images/step2_processed_image.jpg', image)
        
        return True, "Point marked successfully"
        
    except Exception as e:
        return False, f"Error processing image: {str(e)}"

def process_step2():
    """Process step 2 - Track the red dot"""
    try:
        if request.method == 'POST':
            # Get form data
            point_x = int(request.form.get('pointX'))
            point_y = int(request.form.get('pointY'))
            radius = int(request.form.get('radiusSize', 40))
            latitude = request.form.get('latitude')
            longitude = request.form.get('longitude')
            zoom = request.form.get('zoom')
            map_bounds = {
                'north': float(request.form.get('bounds[north]')),
                'south': float(request.form.get('bounds[south]')),
                'east': float(request.form.get('bounds[east]')),
                'west': float(request.form.get('bounds[west]'))
            }
            map_center = {
                'lat': float(request.form.get('center[lat]')),
                'lng': float(request.form.get('center[lng]'))
            }
            
            # Get the image file
            image = request.files.get('image')
            if not image:
                return 'Error: No image provided'
                
            # Save uploaded image
            image_path = 'images/uploaded_image.jpg'
            image.save(image_path)
            
            # Process image with point
            success, message = step1_process_image_with_point(
                image_path, point_x, point_y, radius, 
                latitude, longitude, zoom, map_bounds, map_center
            )
            
            if success:
                return 'success'
            return message
            
        return 'Error: Invalid request method'
        
    except Exception as e:
        print(f"Error in process_step2: {str(e)}")
        return str(e)

