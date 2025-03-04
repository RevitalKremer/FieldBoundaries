from flask import request
import cv2
import numpy as np
import json

def process_step3():
    # Get window size from request
    window_size = int(request.form.get('windowSize', 5))
    success, message = step3_process_image('images/step3_green_mask.jpg', window_size=window_size)
    
    if success:
        # Save window size for step 6
        with open('window_size.json', 'w') as f:
            json.dump({'size': window_size}, f)
        return 'success'
    return message


def step3_process_image(mask_path, window_size=10, threshold=0.6):
    """Create density-based mask using sliding window"""
    try:
        # Read the green mask
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            return False, "Could not read the mask image"

        # Create output mask
        height, width = mask.shape
        density_mask = np.zeros_like(mask)

        # Slide window across the image
        for y in range(0, height - window_size + 1, window_size):
            for x in range(0, width - window_size + 1, window_size):
                # Get window
                window = mask[y:y + window_size, x:x + window_size]
                
                # Calculate density of white pixels
                white_pixels = np.count_nonzero(window)
                density = white_pixels / (window_size * window_size)
                
                # If density exceeds threshold, mark this region as white
                if density > threshold:
                    density_mask[y:y + window_size, x:x + window_size] = 255

        # Save the density mask
        cv2.imwrite('images/density_mask.jpg', density_mask)
        return True, "Density mask created successfully"
        
    except Exception as e:
        return False, f"Error creating density mask: {str(e)}" 