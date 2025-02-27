import cv2
import numpy as np

def step4_process_image(mask_path, point_coords):
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
        cv2.imwrite('images/main_shape.jpg', output)
        return True, "Connected area filled successfully"
        
    except Exception as e:
        return False, f"Error in flood fill: {str(e)}" 