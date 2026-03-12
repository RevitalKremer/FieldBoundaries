// Global variables
let map;
let currentMarker = null;
let mapOptions;

// ============= UTILITY FUNCTIONS =============

function project(lat, lng) {
    const siny = Math.sin((lat * Math.PI) / 180);
    return {
        x: (lng + 180) / 360,
        y: Math.max(0, Math.min(1, 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)))
    };
}

function setPipelineStatus(msg) {
    const row  = document.getElementById('pipelineStatusRow');
    const span = document.getElementById('pipelineStatus');
    if (!span) return;
    if (msg) {
        span.textContent = msg;
        if (row) row.style.display = '';
    } else {
        span.textContent = '';
        if (row) row.style.display = 'none';
    }
}

// ============= MAP INIT =============

function initMap() {
    try {
        mapOptions = {
            mapTypeId: 'satellite',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            scaleControl: true,
            rotateControl: false,
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
            scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_RIGHT },
            fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
            clickableIcons: false,
            disableDoubleClickZoom: true,
            draggable: true,
            keyboardShortcuts: false,
            minZoom: 10,
            maxZoom: 21,
            zoom: 19
        };

        const lat = parseFloat(document.getElementById('latitude').value) || 31;
        const lng = parseFloat(document.getElementById('longitude').value) || 31;
        const initialCenter = (!isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lng) && lng >= -180 && lng <= 180)
            ? { lat, lng }
            : { lat: 32.90113196474662, lng: 35.12035674668466 };

        map = new google.maps.Map(document.getElementById('map'), { ...mapOptions, center: initialCenter });

        document.getElementById('zoomSlider').value = mapOptions.zoom;
        document.getElementById('zoomLevel').textContent = mapOptions.zoom;

        map.addListener('zoom_changed', () => {
            const z = map.getZoom();
            document.getElementById('zoomSlider').value = z;
            document.getElementById('zoomLevel').textContent = z;
        });
        document.getElementById('zoomSlider').addEventListener('input', function() {
            map.setZoom(parseInt(this.value));
            document.getElementById('zoomLevel').textContent = this.value;
        });
        document.getElementById('latitude').addEventListener('input', function() {
            const la = parseFloat(this.value);
            if (!isNaN(la) && la >= -90 && la <= 90)
                map.setCenter({ lat: la, lng: map.getCenter().lng() });
        });
        document.getElementById('longitude').addEventListener('input', function() {
            const ln = parseFloat(this.value);
            if (!isNaN(ln) && ln >= -180 && ln <= 180)
                map.setCenter({ lat: map.getCenter().lat(), lng: ln });
        });

        map.addListener('click', (e) => {
            const la = e.latLng.lat();
            const ln = e.latLng.lng();
            document.getElementById('latitude').value = la;
            document.getElementById('longitude').value = ln;
            if (currentMarker) currentMarker.setMap(null);
            currentMarker = new google.maps.Marker({
                position: e.latLng,
                map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#FF0000', fillOpacity: 1.0,
                    strokeColor: '#FFFFFF', strokeWeight: 2, scale: 8
                }
            });
            document.getElementById('runBtn').disabled = false;
            document.getElementById('mapStatus').textContent = 'Point selected. Click "Detect Boundary" to continue.';
        });

        if (!isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lng) && lng >= -180 && lng <= 180) {
            currentMarker = new google.maps.Marker({
                position: new google.maps.LatLng(lat, lng), map,
                icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#FF0000', fillOpacity: 1.0, strokeColor: '#FFFFFF', strokeWeight: 2, scale: 8 }
            });
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;
            document.getElementById('runBtn').disabled = false;
        }
    } catch (error) {
        console.error('Error initializing Google Maps:', error);
        document.getElementById('map').innerHTML = `<div class="error-container"><h4>Google Maps Error</h4><p>${error.message}</p></div>`;
        document.getElementById('runBtn').disabled = true;
    }
}

// ============= PIPELINE =============

async function detectBoundary() {
    const selectedLat = document.getElementById('latitude').value;
    const selectedLng = document.getElementById('longitude').value;
    if (!selectedLat || !selectedLng) {
        alert('Please select a point on the map first');
        return;
    }

    document.getElementById('runBtn').disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('resultInfo').style.display = 'none';
    map.data.forEach(f => map.data.remove(f));
    setPipelineStatus('Capturing image...');

    const center = map.getCenter();
    const lat    = center.lat();
    const lng    = center.lng();
    const zoom   = map.getZoom();
    const width  = document.getElementById('map').offsetWidth;
    const height = document.getElementById('map').offsetHeight;
    const url    = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=satellite&key=${googleMapsApiKey}`;

    const img = document.getElementById('previewImage');
    img.onload  = () => runPipeline(selectedLat, selectedLng, lat, lng, zoom);
    img.onerror = () => {
        setPipelineStatus('');
        document.getElementById('runBtn').disabled = false;
        alert('Failed to capture the area. Please try again.');
    };
    img.src = url;
}

async function runPipeline(selectedLat, selectedLng, lat, lng, zoom) {
    try {
        const img         = document.getElementById('previewImage');
        const imageWidth  = img.naturalWidth  || document.getElementById('map').offsetWidth;
        const imageHeight = img.naturalHeight || document.getElementById('map').offsetHeight;

        const centerPoint = project(parseFloat(selectedLat), parseFloat(selectedLng));
        const imageCenter = project(lat, lng);
        const offsetX = (centerPoint.x - imageCenter.x) * 256 * Math.pow(2, zoom);
        const offsetY = (centerPoint.y - imageCenter.y) * 256 * Math.pow(2, zoom);
        const pointX  = Math.round((imageWidth  / 2) + offsetX);
        const pointY  = Math.round((imageHeight / 2) + offsetY);

        console.log(`[runPipeline] image: ${imageWidth}x${imageHeight}, point: (${pointX}, ${pointY})`);

        // Upload image + point metadata
        setPipelineStatus('Uploading image...');
        const formData = new FormData();
        const blob = await fetch(img.src).then(r => r.blob());
        formData.append('image', blob, 'image.jpg');
        formData.append('pointX', pointX);
        formData.append('pointY', pointY);
        formData.append('latitude', selectedLat);
        formData.append('longitude', selectedLng);
        formData.append('zoom', zoom);

        const bounds = map.getBounds().toJSON();
        formData.append('bounds[north]', bounds.north);
        formData.append('bounds[south]', bounds.south);
        formData.append('bounds[east]',  bounds.east);
        formData.append('bounds[west]',  bounds.west);
        formData.append('center[lat]', lat);
        formData.append('center[lng]', lng);

        const uploadResult = await fetch('/upload_image', { method: 'POST', body: formData }).then(r => r.text());
        if (uploadResult !== 'success') throw new Error(uploadResult);

        // Run SAM segmentation
        setPipelineStatus('Running SAM segmentation... (this may take a moment)');
        const samResult = await fetch('/run_segmentation').then(r => r.text());
        if (samResult !== 'success') throw new Error(samResult);

        // Convert pixel coordinates to geo coordinates
        setPipelineStatus('Converting to map coordinates...');
        const geoResult = await fetch('/convert_to_geojson').then(r => r.text());
        if (geoResult !== 'success') throw new Error(geoResult);

        // Draw boundary on map
        setPipelineStatus('Drawing boundary...');
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
        document.getElementById('fieldArea').textContent = `${(area / 10000).toFixed(2)} hectares`;
        document.getElementById('resultInfo').style.display = '';
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('runBtn').disabled = false;
        setPipelineStatus('Done!');
        document.getElementById('mapStatus').textContent = 'Boundary detected.';

    } catch (error) {
        console.error('Pipeline error:', error);
        alert('Error: ' + error.message);
        setPipelineStatus('Error: ' + error.message);
        document.getElementById('runBtn').disabled = false;
    }
}

// ============= INIT =============

document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const btn = document.getElementById('runBtn');
            if (btn && !btn.disabled) { event.preventDefault(); btn.click(); }
        }
    });
});
