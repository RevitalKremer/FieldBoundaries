import cv2
import numpy as np
import json
from geojson import Feature, Polygon, FeatureCollection
import math

def create_circle_coordinates(center_lat, center_lng, radius_meters, num_points=32):
    """Create coordinates for a circle polygon"""
    coordinates = []
    for i in range(num_points):
        angle = (2 * math.pi * i) / num_points
        dx = radius_meters * math.cos(angle)
        dy = radius_meters * math.sin(angle)
        
        # Convert meters to lat/lng
        delta_lat = dy / 111111
        delta_lng = dx / (111111 * math.cos(center_lat * math.pi / 180))
        
        lng = center_lng + delta_lng
        lat = center_lat + delta_lat
        coordinates.append([lng, lat])  # GeoJSON uses [lng, lat] order
    
    # Close the polygon by adding the first point at the end
    coordinates.append(coordinates[0])
    return coordinates

def process_step9():
    try:
        # Load original point from circle_data.json
        with open('circle_data.json', 'r') as f:
            circle_data = json.load(f)
            center_lat = float(circle_data['latitude'])
            center_lng = float(circle_data['longitude'])
            zoom = int(circle_data['zoom'])
        
        # Create a circle polygon with 50-meter radius
        radius_meters = 50
        circle_coordinates = create_circle_coordinates(center_lat, center_lng, radius_meters)
        
        # Create GeoJSON feature
        feature = Feature(
            geometry=Polygon([circle_coordinates]),
            properties={
                "center": [center_lng, center_lat],
                "zoom": zoom,
                "radius_meters": radius_meters
            }
        )
        
        # Save GeoJSON
        with open('images/field_boundary.geojson', 'w') as f:
            json.dump(feature, f)
        
        return 'success'
        
    except Exception as e:
        print(f"Error in process_step9: {str(e)}")
        return str(e)

def get_geojson():
    """Return the GeoJSON data for the field boundary"""
    try:
        with open('images/field_boundary.geojson', 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading GeoJSON: {str(e)}")
        return None 