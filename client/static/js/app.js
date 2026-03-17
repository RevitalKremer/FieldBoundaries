let map;
let currentMarker = null;
let mapOptions;

function setStatus(msg, loading = true) {
    document.getElementById('statusText').textContent = msg;
    document.getElementById('loader').style.display = loading ? '' : 'none';
}

// ============= MAP INIT =============

function initMap() {
    try {
        mapOptions = {
            mapTypeId: 'satellite',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
            scaleControl: true,
            rotateControl: false,
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
            scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_RIGHT },
            clickableIcons: false,
            disableDoubleClickZoom: true,
            draggable: true,
            keyboardShortcuts: false,
            minZoom: 10,
            maxZoom: 21,
            zoom: 16,
            center: { lat: 32.90113196474662, lng: 35.12035674668466 }
        };

        map = new google.maps.Map(document.getElementById('map'), mapOptions);

        map.addListener('click', (e) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;
            if (currentMarker) currentMarker.setMap(null);
            currentMarker = new google.maps.Marker({
                position: e.latLng,
                map
            });
            document.getElementById('runBtn').disabled = false;
            document.getElementById('runServerBtn').disabled = false;
            document.getElementById('runServerV2Btn').disabled = false;
            setStatus('Point selected — click "Detect Boundary" to continue.', false);
        });

    } catch (error) {
        console.error('Error initializing Google Maps:', error);
        document.getElementById('map').innerHTML =
            `<div class="error-container"><h4>Google Maps Error</h4><p>${error.message}</p></div>`;
        document.getElementById('runBtn').disabled = true;
    }
}

// ============= PIPELINE =============

async function detectBoundary() {
    const selectedLat = document.getElementById('latitude').value;
    const selectedLng = document.getElementById('longitude').value;
    if (!selectedLat || !selectedLng) {
        alert('Please click on the map to select a point first.');
        return;
    }

    document.getElementById('runBtn').disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('fieldArea').style.display = 'none';
    map.data.forEach(f => map.data.remove(f));
    setStatus('Capturing image...');

    // Snapshot map state now — user may pan/zoom while SAM is running
    const zoom   = map.getZoom();
    const bounds = map.getBounds().toJSON();

    // Center the static map on the clicked point so it's always at image center
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${selectedLat},${selectedLng}&zoom=${zoom}&size=640x640&maptype=satellite&key=${googleMapsApiKey}`;

    const img = document.getElementById('previewImage');
    img.onload  = () => runPipeline(selectedLat, selectedLng, zoom, bounds);
    img.onerror = () => {
        setStatus('Failed to capture the area. Please try again.', false);
        document.getElementById('runBtn').disabled = false;
    };
    img.src = url;
}

async function runPipeline(selectedLat, selectedLng, zoom, bounds) {
    try {
        const img         = document.getElementById('previewImage');
        const imageWidth  = img.naturalWidth  || 640;
        const imageHeight = img.naturalHeight || 640;

        // The static map is centered on the clicked point, so the point is always at image center
        const pointX = Math.round(imageWidth  / 2);
        const pointY = Math.round(imageHeight / 2);

        setStatus('Uploading image...');
        const formData = new FormData();
        const blob = await fetch(img.src).then(r => r.blob());
        formData.append('image', blob, 'image.jpg');
        formData.append('pointX', pointX);
        formData.append('pointY', pointY);
        formData.append('latitude', selectedLat);
        formData.append('longitude', selectedLng);
        formData.append('zoom', zoom);
        // Use snapshotted bounds — not affected by subsequent map panning
        formData.append('bounds[north]', bounds.north);
        formData.append('bounds[south]', bounds.south);
        formData.append('bounds[east]',  bounds.east);
        formData.append('bounds[west]',  bounds.west);
        // Image is centered on the clicked point — use it as the geo reference center
        formData.append('center[lat]', selectedLat);
        formData.append('center[lng]', selectedLng);

        const uploadResult = await fetch('/upload_image', { method: 'POST', body: formData }).then(r => r.text());
        if (uploadResult !== 'success') throw new Error(uploadResult);

        setStatus('Running segmentation… (this may take a moment)');
        const samResult = await fetch('/run_segmentation').then(r => r.text());
        if (samResult !== 'success') throw new Error(samResult);

        setStatus('Converting to map coordinates...');
        const geoResult = await fetch('/convert_to_geojson').then(r => r.text());
        if (geoResult !== 'success') throw new Error(geoResult);

        setStatus('Drawing boundary...');
        const geojsonData = await fetch('/download_geojson').then(r => r.json());
        map.data.addGeoJson(geojsonData);
        map.data.setStyle({
            fillColor: '#00BCD4', fillOpacity: 0.3,
            strokeColor: '#00BCD4', strokeWeight: 2
        });

        const coordinates = geojsonData.features[0].geometry.coordinates[0];
        const area = google.maps.geometry.spherical.computeArea(
            coordinates.map(coord => new google.maps.LatLng(coord[1], coord[0]))
        );
        const areaEl = document.getElementById('fieldArea');
        areaEl.textContent = `Field area: ${(area / 10000).toFixed(2)} ha`;
        areaEl.style.display = '';
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('runBtn').disabled = false;
        setStatus('Boundary detected. Click a new point to run again.', false);

    } catch (error) {
        console.error('Pipeline error:', error);
        setStatus('Error: ' + error.message, false);
        document.getElementById('runBtn').disabled = false;
    }
}

async function detectBoundaryServer() {
    const selectedLat = document.getElementById('latitude').value;
    const selectedLng = document.getElementById('longitude').value;
    if (!selectedLat || !selectedLng) {
        alert('Please click on the map to select a point first.');
        return;
    }

    document.getElementById('runBtn').disabled = true;
    document.getElementById('runServerBtn').disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('fieldArea').style.display = 'none';
    map.data.forEach(f => map.data.remove(f));

    const zoom   = map.getZoom();
    const bounds = map.getBounds().toJSON();

    try {
        setStatus('Running server-side segmentation… (this may take a moment)');
        const samResult = await fetch('/run_segmentation_by_map_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: parseFloat(selectedLat), lng: parseFloat(selectedLng), bounds, zoom })
        }).then(r => r.text());
        if (samResult !== 'success') throw new Error(samResult);

        setStatus('Converting to map coordinates...');
        const geoResult = await fetch('/convert_to_geojson').then(r => r.text());
        if (geoResult !== 'success') throw new Error(geoResult);

        setStatus('Drawing boundary...');
        const geojsonData = await fetch('/download_geojson').then(r => r.json());
        map.data.addGeoJson(geojsonData);
        map.data.setStyle({
            fillColor: '#00BCD4', fillOpacity: 0.3,
            strokeColor: '#00BCD4', strokeWeight: 2
        });

        const coordinates = geojsonData.features[0].geometry.coordinates[0];
        const area = google.maps.geometry.spherical.computeArea(
            coordinates.map(coord => new google.maps.LatLng(coord[1], coord[0]))
        );
        const areaEl = document.getElementById('fieldArea');
        areaEl.textContent = `Field area: ${(area / 10000).toFixed(2)} ha`;
        areaEl.style.display = '';
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('runBtn').disabled = false;
        document.getElementById('runServerBtn').disabled = false;
        setStatus('Boundary detected. Click a new point to run again.', false);

    } catch (error) {
        console.error('Pipeline error:', error);
        setStatus('Error: ' + error.message, false);
        document.getElementById('runBtn').disabled = false;
        document.getElementById('runServerBtn').disabled = false;
    }
}

async function detectBoundaryServerV2() {
    const selectedLat = document.getElementById('latitude').value;
    const selectedLng = document.getElementById('longitude').value;
    if (!selectedLat || !selectedLng) {
        alert('Please click on the map to select a point first.');
        return;
    }

    document.getElementById('runBtn').disabled = true;
    document.getElementById('runServerBtn').disabled = true;
    document.getElementById('runServerV2Btn').disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('fieldArea').style.display = 'none';
    map.data.forEach(f => map.data.remove(f));

    const zoom   = map.getZoom();
    const bounds = map.getBounds().toJSON();

    try {
        setStatus('Running single-call server segmentation…');
        const geojsonData = await fetch('/get_polygon_by_map_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: parseFloat(selectedLat), lng: parseFloat(selectedLng), bounds, zoom })
        }).then(r => r.json());

        map.data.addGeoJson(geojsonData);
        map.data.setStyle({
            fillColor: '#00BCD4', fillOpacity: 0.3,
            strokeColor: '#00BCD4', strokeWeight: 2
        });

        const coordinates = geojsonData.features[0].geometry.coordinates[0];
        const area = google.maps.geometry.spherical.computeArea(
            coordinates.map(coord => new google.maps.LatLng(coord[1], coord[0]))
        );
        const areaEl = document.getElementById('fieldArea');
        areaEl.textContent = `Field area: ${(area / 10000).toFixed(2)} ha`;
        areaEl.style.display = '';
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('runBtn').disabled = false;
        document.getElementById('runServerBtn').disabled = false;
        document.getElementById('runServerV2Btn').disabled = false;
        setStatus('Boundary detected. Click a new point to run again.', false);

    } catch (error) {
        console.error('Pipeline error:', error);
        setStatus('Error: ' + error.message, false);
        document.getElementById('runBtn').disabled = false;
        document.getElementById('runServerBtn').disabled = false;
        document.getElementById('runServerV2Btn').disabled = false;
    }
}

// ============= SEARCH =============

function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    new google.maps.Geocoder().geocode({ address: query }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const viewport = results[0].geometry.viewport;
            if (viewport) {
                map.fitBounds(viewport);
            } else {
                map.setCenter(results[0].geometry.location);
                map.setZoom(14);
            }
        } else {
            alert('Location not found: ' + query);
        }
    });
}

// ============= INIT =============

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const btn = document.getElementById('runBtn');
            if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
        }
    });
});
