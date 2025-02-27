import cv2
import numpy as np

def get_reference_green(image_path, circle_center, circle_radius):
    """Get the green color reference from inside the red circle"""
    image = cv2.imread(image_path)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    # Create a mask for the circle area
    circle_mask = np.zeros(image.shape[:2], dtype=np.uint8)
    cv2.circle(circle_mask, circle_center, circle_radius, 255, -1)
    
    # Create a mask for the yellow dot to exclude it
    lower_yellow = np.array([20, 100, 100])
    upper_yellow = np.array([30, 255, 255])
    yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)
    
    # Final mask: circle area minus yellow dot
    reference_area = cv2.bitwise_and(circle_mask, cv2.bitwise_not(yellow_mask))
    
    # Get the average HSV values in the reference area
    mean_hsv = cv2.mean(hsv, mask=reference_area)[:3]
    return mean_hsv

def step2_process_image(image_path, circle_center, circle_radius):
    """Create mask for green areas based on reference color"""
    try:
        # Get reference green color
        ref_hsv = get_reference_green(image_path, circle_center, circle_radius)
        
        # Read the image and convert to HSV
        image = cv2.imread(image_path)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        # Define green color range based on reference (with tolerance)
        h_tolerance = 10
        s_tolerance = 50
        v_tolerance = 50
        
        lower_green = np.array([
            max(0, ref_hsv[0] - h_tolerance),
            max(0, ref_hsv[1] - s_tolerance),
            max(0, ref_hsv[2] - v_tolerance)
        ])
        
        upper_green = np.array([
            min(180, ref_hsv[0] + h_tolerance),
            min(255, ref_hsv[1] + s_tolerance),
            min(255, ref_hsv[2] + v_tolerance)
        ])
        
        # Create the green mask
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        
        # Save the mask
        cv2.imwrite('images/green_mask.jpg', green_mask)
        return True, "Green areas mask created successfully"
        
    except Exception as e:
        return False, f"Error creating green mask: {str(e)}" 