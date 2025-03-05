import json
import cv2
import numpy as np

from flask import request

def process_step100():
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

def process_step5():
    # Get original point coordinates
    with open('circle_data.json', 'r') as f:
        circle_data = json.load(f)
    
    success, message = step5_process_image(
        'images/density_mask.jpg',
        (circle_data['cX'], circle_data['cY'])
    )
    
    if success:
        return 'success'
    return message


def step5_process_image(mask_path, point_coords):
    """Fill connected white area containing the point with magenta"""
    try:
        # Read the density mask
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            return False, "Could not read the mask image"

        # Create colored output image
        output = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
        
        # Point coordinates
        seed_point = (point_coords[0], point_coords[1])
        
        # Check if seed point is on white
        if mask[seed_point[1], seed_point[0]] == 0:
            return False, "Selected point is not on a white area"

        # Create a copy of the mask for flood fill
        mask_copy = mask.copy()
        
        # Create mask for flood fill
        height, width = mask.shape
        flood_mask = np.zeros((height + 2, width + 2), dtype=np.uint8)
        
        # Perform flood fill to get the connected component
        cv2.floodFill(
            mask_copy,
            flood_mask,
            seed_point,
            128,  # temporary fill value
            loDiff=0,
            upDiff=0,
            flags=8 | (255 << 8)  # fill with 128, considering white pixels only
        )
        
        # Create the final mask for the connected component
        connected_mask = (mask_copy == 128)
        
        # Color everything red first
        output[mask == 255] = (0, 0, 255)  # red for all white areas
        
        # Then color the connected component magenta
        output[connected_mask] = (255, 0, 255)  # magenta for connected component

        # Save the result
        cv2.imwrite('images/step5_main_shape.jpg', output)
        return True, "Connected area filled successfully"
        
    except Exception as e:
        return False, f"Error in flood fill: {str(e)}"