import cv2
import numpy as np
import json
from geojson import Feature, Polygon, FeatureCollection
import math

def pixel_to_latlng(pixel_x, pixel_y, center_lat, center_lng, zoom, image_width=640, image_height=640):
    """Convert pixel coordinates to latitude/longitude"""
    # Calculate meters per pixel at this zoom level and latitude
    meters_per_pixel = 156543.03392 * math.cos(center_lat * math.pi / 180) / math.pow(2, zoom)
    
    # Convert pixel offsets from image center to meters
    center_x = image_width / 2
    center_y = image_height / 2
    delta_meters_x = (pixel_x - center_x) * meters_per_pixel
    delta_meters_y = (center_y - pixel_y) * meters_per_pixel  # Flip Y axis as image Y increases downward
    
    # Convert meters to lat/lng
    delta_lat = delta_meters_y / 111111
    delta_lng = delta_meters_x / (111111 * math.cos(center_lat * math.pi / 180))
    
    return center_lat + delta_lat, center_lng + delta_lng

def get_shape_from_image():
    """Extract shape from the processed image"""
    try:
        # Read the smoothed shape image
        image = cv2.imread('images/step6_smoothed_shape.jpg', cv2.IMREAD_GRAYSCALE)
        if image is None:
            return None
            
        # Find contours
        contours, _ = cv2.findContours(image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
            
        # Get the largest contour
        main_contour = max(contours, key=cv2.contourArea)
        
        # Simplify the contour
        epsilon = 0.001 * cv2.arcLength(main_contour, True)
        simplified_contour = cv2.approxPolyDP(main_contour, epsilon, True)
        
        return simplified_contour
    except Exception as e:
        print(f"Error getting shape: {str(e)}")
        return None

def process_step9():
    try:
        # Load circle data
        with open('circle_data.json', 'r') as f:
            circle_data = json.load(f)

        # Load GeoJSON from step 8
        with open('images/field_boundary.geojson', 'r') as f:
            step8_geojson = json.load(f)

        # Get pixel coordinates from step 8 GeoJSON
        pixel_coordinates = step8_geojson['features'][0]['geometry']['coordinates'][0]

        # Get map parameters
        center_lat = float(circle_data['center']['lat'])
        center_lng = float(circle_data['center']['lng'])
        zoom = int(circle_data['zoom'])
        bounds = circle_data['bounds']

        print("Map parameters:")
        print(f"Center: {center_lat}, {center_lng}")
        print(f"Zoom: {zoom}")
        print(f"Bounds: {bounds}")
        print(f"Selected point: {circle_data['latitude']}, {circle_data['longitude']}")

        # Convert pixel coordinates to geographic coordinates using map center
        geo_coordinates = []
        for x, y in pixel_coordinates:
            lat, lng = pixel_to_latlng(x, y, center_lat, center_lng, zoom)
            geo_coordinates.append([lng, lat])  # GeoJSON uses [lng, lat] order

        # Ensure polygon is closed
        if geo_coordinates[0] != geo_coordinates[-1]:
            geo_coordinates.append(geo_coordinates[0])

        # Create GeoJSON feature collection with all map properties
        geojson = {
            'type': 'FeatureCollection',
            'features': [{
                'type': 'Feature',
                'properties': {
                    'bounds': bounds,
                    'center': {
                        'lat': center_lat,
                        'lng': center_lng
                    },
                    'zoom': zoom,
                    'selected_point': {
                        'lat': float(circle_data['latitude']),
                        'lng': float(circle_data['longitude'])
                    }
                },
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [geo_coordinates]
                }
            }]
        }

        # Print first coordinate for debugging
        print(f"First pixel coordinate: {pixel_coordinates[0]}")
        print(f"First geo coordinate: {geo_coordinates[0]}")

        # Save the GeoJSON
        with open('images/field_boundary.geojson', 'w') as f:
            json.dump(geojson, f)

        return 'success'
    except Exception as e:
        print(f"Error in process_step9: {str(e)}")
        return str(e)

def get_geojson(): # tbd revital duplicated??
    """Return the GeoJSON data for the field boundary"""
    try:
        with open('images/field_boundary.geojson', 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading GeoJSON: {str(e)}")
        return None 