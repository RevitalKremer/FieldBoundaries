import cv2
import json
from geojson import Feature, Polygon, FeatureCollection

def process_step7():
    """Generate GeoJSON from the smoothed shape and draw it on the final image"""
    success, message = generate_geojson('images/step5_smoothed_shape.jpg')
    if success:
        if draw_geojson_on_image():
            return 'success'
    return message

def draw_geojson_on_image():
    """Draw the GeoJSON boundary on the original image"""
    try:
        # Read the masked field image to get the contours
        masked_image = cv2.imread('images/step6_masked_field.jpg')
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
        cv2.imwrite('images/step7_final_with_boundary.jpg', original_image)
        return True
    except Exception as e:
        print(f"Error drawing GeoJSON: {str(e)}")
        return False


def generate_geojson(image_path):
    """Generate GeoJSON from the field boundary image"""
    try:
        # Read the image
        image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if image is None:
            return False, "Could not read the image"
        
        # Find contours
        contours, _ = cv2.findContours(image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return False, "No contours found"
        
        # Get the largest contour
        largest_contour = max(contours, key=cv2.contourArea)
        
        # Convert contour points to coordinates
        coordinates = []
        for point in largest_contour:
            x, y = point[0]
            coordinates.append([float(x), float(y)])
        
        # Close the polygon by adding the first point at the end
        coordinates.append(coordinates[0])
        
        # Create GeoJSON feature
        polygon = Polygon([coordinates])
        feature = Feature(geometry=polygon)
        feature_collection = FeatureCollection([feature])
        
        # Save GeoJSON to file
        with open('images/field_boundary.geojson', 'w') as f:
            json.dump(feature_collection, f)
        
        return True, "GeoJSON generated successfully"
    except Exception as e:
        return False, f"Error generating GeoJSON: {str(e)}"
