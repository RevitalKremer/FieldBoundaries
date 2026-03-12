# FieldBoundaries

A web application for detecting and mapping agricultural field boundaries from satellite imagery.

## What It Does

Given a satellite image and a point on a field, the app runs a multi-step image processing pipeline to extract the field boundary and export it as a GeoJSON polygon with geographic coordinates.

**Pipeline steps:**

1. Select a location on Google Maps and capture the map bounds
2. Upload a satellite image and mark a reference point on the field
3. Extract green color reference and create an HSV color mask
4. Apply sliding-window density analysis to refine the mask
5. Flood-fill from the marked point to isolate the connected field region
6. Smooth and simplify the boundary contour
7. Generate a masked field image
8. Convert the boundary to GeoJSON with lat/lng coordinates

## Tech Stack

- **Backend**: Python, Flask, OpenCV, NumPy, geojson
- **Frontend**: Vanilla JavaScript, Google Maps API

## Setup

### Prerequisites

- Python 3.x
- A [Google Maps API key](https://developers.google.com/maps/documentation/javascript/get-api-key)

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd FieldBoundaries

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install python-dotenv
```

### Configuration

Create a `.env` file in the project root:

```text
GOOGLE_MAPS_API_KEY=your_api_key_here
```

### Run

```bash
python3 app.py
```

The app will be available at `http://localhost:5002`.

## Output

The pipeline produces a downloadable `step9_geojson.json` file containing a GeoJSON polygon of the detected field boundary, ready for use in mapping tools like QGIS, Mapbox, or Leaflet.
