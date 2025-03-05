from flask import request
import cv2
import numpy as np
import json

def process_step6():
    epsilon_factor = float(request.form.get('epsilonFactor', 0.001))
    success, message = smooth_shape_edges('images/step5_main_shape.jpg', epsilon_factor)
    if success:
        return 'success'
    return message


def smooth_shape_edges(image_path, epsilon_factor=0.001):
    """Convert magenta shape to smooth polygon"""
    try:
        # Read the image
        image = cv2.imread(image_path)
        if image is None:
            return False, "Could not read the image"

        # Create mask from magenta area
        magenta_mask = cv2.inRange(
            image,
            np.array([250, 0, 250]),  # lower bound for magenta
            np.array([255, 10, 255])  # upper bound for magenta
        )

        # Find contours in the magenta mask
        contours, _ = cv2.findContours(magenta_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Get the contour containing the point
        with open('circle_data.json', 'r') as f:
            circle_data = json.load(f)
        point = (circle_data['cX'], circle_data['cY'])
        
        main_contour = None
        for contour in contours:
            if cv2.pointPolygonTest(contour, point, False) >= 0:
                main_contour = contour
                break
                
        if main_contour is None:
            return False, "Could not find shape containing the point"

        # Calculate epsilon based on contour perimeter
        perimeter = cv2.arcLength(main_contour, True)
        epsilon = epsilon_factor * perimeter
        
        # Approximate and smooth the contour
        smoothed_contour = cv2.approxPolyDP(main_contour, epsilon, True)
        
        # Create output image
        output = np.zeros_like(image)
        output[:] = [255, 255, 255]  # white background
        
        # Draw original shape in red
        cv2.drawContours(output, [main_contour], -1, (0, 0, 255), -1)
        
        # Draw smoothed polygon in magenta
        cv2.drawContours(output, [smoothed_contour], -1, (255, 0, 255), -1)
        
        # Save the smoothed contour for later use
        np.save('smoothed_contour.npy', smoothed_contour)

        # Save the result
        cv2.imwrite('images/step6_smoothed_shape.jpg', output)
        return True, "Shape smoothed successfully"
        
    except Exception as e:
        return False, f"Error smoothing shape: {str(e)}"
