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


def step1_process_image_with_point(image_path, point_coords):
    """Process image to draw circle around selected point"""
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
        
        cX, cY = point_coords
        
        # Save circle data for step 2
        with open('circle_data.json', 'w') as f:
            json.dump({
                'cX': int(cX),
                'cY': int(cY),
                'radius': 40  # Fixed radius for the circle
            }, f)
        
        # Draw red circle around selected point
        cv2.circle(image, (int(cX), int(cY)), 40, (0, 0, 255), 2)  # Draw circle
        cv2.circle(image, (int(cX), int(cY)), 5, (0, 0, 255), -1)  # Draw center point
        
        # Save processed image
        cv2.imwrite('images/step2_processed_image.jpg', image)
        
        return True, "Point marked successfully"
        
    except Exception as e:
        return False, f"Error processing image: {str(e)}"

def process_step2():
    try:
       # Get window size from request
        radius_size = int(request.form.get('radiusSize', 5))
 
        # Get the image data from the form
        image_path = None
        
        if 'image' in request.files and request.files['image'].filename:
            # Handle file upload
            file = request.files['image']
            file.save('images/uploaded_image.jpg')
            image_path = 'images/uploaded_image.jpg'
        elif 'staticMapUrl' in request.form and request.form['staticMapUrl']:
            # Handle static map URL
            image_path = request.form['staticMapUrl']
        
        if not image_path:
            return 'No image data provided'

        point_x = int(request.form['pointX'])
        point_y = int(request.form['pointY'])
        
        # Process image with point
        success, message = step1_process_image_with_point(image_path, (point_x, point_y))
        if success:
            return 'success'
        return message
    except Exception as e:
        return f"Error processing upload: {str(e)}"

