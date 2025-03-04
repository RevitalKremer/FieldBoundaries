import cv2
import numpy as np
import json


def process_step6():
    # Use smoothed shape from step 4.1 instead of main shape
    success, message = step6_process_image('images/uploaded_image.jpg', 'images/smoothed_shape.jpg')
    if success:
        return 'success'
    return message


def step6_process_image(original_image_path, smoothed_shape_path):
    """Create masked original image showing only the field area and mark the selected point"""
    try:
        # Read the original image and the smoothed shape image
        original = cv2.imread(original_image_path)
        smoothed_shape = cv2.imread(smoothed_shape_path)
        
        if original is None or smoothed_shape is None:
            return False, "Could not read the images"

        # Create mask from magenta area
        magenta_mask = cv2.inRange(
            smoothed_shape,
            np.array([250, 0, 250]),  # lower bound for magenta
            np.array([255, 10, 255])  # upper bound for magenta
        )

        # Create white background
        result = np.ones_like(original) * 255  # white background
        
        # Copy only the magenta area from original image
        result = cv2.bitwise_and(original, original, mask=magenta_mask)
        
        # Make non-magenta areas white
        result[magenta_mask == 0] = [255, 255, 255]

        # Get the original point coordinates
        with open('circle_data.json', 'r') as f:
            circle_data = json.load(f)
        
        # Draw red point
        point_radius = 5  # smaller radius for the point
        cv2.circle(result, (circle_data['cX'], circle_data['cY']), point_radius, (0, 0, 255), -1)  # filled circle

        # Save the result
        cv2.imwrite('images/step6_masked_field.jpg', result)
        return True, "Field area masked and point marked successfully"
        
    except Exception as e:
        return False, f"Error creating masked image: {str(e)}" 