import cv2
import json
from geojson import Feature, Polygon, FeatureCollection

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
