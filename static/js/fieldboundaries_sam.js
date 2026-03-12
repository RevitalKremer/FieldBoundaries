// Global variables
let map;
let currentMarker = null;
let currentStep = 'step0';
let mapOptions;

// ============= UTILITY FUNCTIONS =============

function setCurrentStep(stepId) {
    currentStep = stepId;
    document.querySelectorAll('.step-row').forEach(s => s.classList.remove('current'));
    const el = document.getElementById(stepId);
    if (el) el.classList.add('current');
}

function moveToNextStep(nextStepId) {
    const nextStep = document.getElementById(nextStepId);
    if (nextStep) {
        nextStep.classList.remove('hidden');
        const nextButton = document.getElementById(`${nextStepId}Next`);
        if (nextButton) nextButton.disabled = false;
    }
    setCurrentStep(nextStepId);
    if (nextStep) {
        setTimeout(() => nextStep.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
}

function project(lat, lng, zoom) {
    const siny = Math.sin((lat * Math.PI) / 180);
    return {
        x: (lng + 180) / 360,
        y: Math.max(0, Math.min(1, 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)))
    };
}

function showErrorPopup(stepName, error) {
    console.error(`Error in ${stepName}:`, error);
    alert(`Error in ${stepName}: ${error.message}`);
}

// ============= MAP FUNCTIONS =============

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

        map.addListener('tilesloaded', () => {
            const mapDiv = document.getElementById('map');
            if (mapDiv.innerHTML.toLowerCase().includes('sorry')) {
                document.getElementById('step0Next').disabled = true;
            } else {
                document.getElementById('step0Next').disabled = false;
            }
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
            document.getElementById('step0Next').disabled = false;
            document.getElementById('mapStatus').textContent = 'Point selected. Click "Capture This Area" to continue.';
        });

        setCurrentStep('step0');

        if (!isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lng) && lng >= -180 && lng <= 180) {
            const latLng = new google.maps.LatLng(lat, lng);
            if (currentMarker) currentMarker.setMap(null);
            currentMarker = new google.maps.Marker({
                position: latLng, map,
                icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#FF0000', fillOpacity: 1.0, strokeColor: '#FFFFFF', strokeWeight: 2, scale: 8 }
            });
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;
            document.getElementById('step0Next').disabled = false;
        }
    } catch (error) {
        console.error('Error initializing Google Maps:', error);
        document.getElementById('map').innerHTML = `<div class="error-container"><h4>Google Maps Error</h4><p>${error.message}</p></div>`;
        document.getElementById('step0Next').disabled = true;
    }
}

// ============= STEP 0: MAP CAPTURE =============

function handleImageLoad(selectedLat, selectedLng, lat, lng, zoom, radius = 50) {
    document.getElementById('step1-latitude').value = selectedLat;
    document.getElementById('step1-longitude').value = selectedLng;
    document.getElementById('step1-latitude').disabled = true;
    document.getElementById('step1-longitude').disabled = true;

    // Use the actual loaded image's natural dimensions so coordinates match
    // what gets saved to uploaded_image.jpg (the blob sent to the server).
    const img = document.getElementById('previewImage');
    const imageWidth = img.naturalWidth || document.getElementById('map').offsetWidth;
    const imageHeight = img.naturalHeight || document.getElementById('map').offsetHeight;

    const centerPoint = project(parseFloat(selectedLat), parseFloat(selectedLng), zoom);
    const imageCenter = project(lat, lng, zoom);
    const offsetX = (centerPoint.x - imageCenter.x) * 256 * Math.pow(2, zoom);
    const offsetY = (centerPoint.y - imageCenter.y) * 256 * Math.pow(2, zoom);
    const pointX = (imageWidth / 2) + offsetX;
    const pointY = (imageHeight / 2) + offsetY;

    console.log(`[handleImageLoad] image: ${imageWidth}x${imageHeight}, point: (${Math.round(pointX)}, ${Math.round(pointY)})`);

    document.querySelector('.captured-image-section').style.backgroundColor = '#e8f5e9';
    document.querySelector('.upload-section').style.opacity = '0.5';
    document.getElementById('imageInput').disabled = true;
    document.getElementById('pointX').value = Math.round(pointX);
    document.getElementById('pointY').value = Math.round(pointY);

    const marker = document.getElementById('pointMarker');
    marker.style.left = pointX + 'px';
    marker.style.top = pointY + 'px';
    marker.style.display = 'block';

    showAndEnableStep('step1');
}

function processStep0() {
    const selectedLat = document.getElementById('latitude').value;
    const selectedLng = document.getElementById('longitude').value;
    if (!selectedLat || !selectedLng) {
        alert('Please select a point on the map first');
        return;
    }

    const center = map.getCenter();
    const lat = center.lat();
    const lng = center.lng();
    const zoom = map.getZoom();
    const radiusSize = document.getElementById('radiusSize')?.value || 50;

    // [Debug] Use locally uploaded image if provided
    const debugInput = document.getElementById('debugImageInput');
    if (debugInput && debugInput.files && debugInput.files[0]) {
        const img = document.getElementById('previewImage');
        img.onload = function() {
            console.log('[Debug] Local image loaded');
            handleImageLoad(selectedLat, selectedLng, lat, lng, zoom, radiusSize);
        };
        img.src = URL.createObjectURL(debugInput.files[0]);
        img.style.display = 'block';
        return;
    }

    const width = document.getElementById('map').offsetWidth;
    const height = document.getElementById('map').offsetHeight;
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=satellite&key=${googleMapsApiKey}`;

    const img = document.getElementById('previewImage');
    img.onload = function() {
        handleImageLoad(selectedLat, selectedLng, lat, lng, zoom, radiusSize);
    };
    img.onerror = function() {
        alert('Failed to capture the area. Please try again.');
    };
    img.src = url;
    img.style.display = 'block';
}

// ============= STEP 1: IMAGE + POINT =============

function showAndEnableStep(stepName) {
    const step = document.getElementById(stepName);
    if (!step) return;
    step.classList.remove('hidden');
    document.querySelectorAll(`#${stepName} button`).forEach(b => b.disabled = false);
    document.getElementById('uploadStatus').textContent = 'Point selected. Click "Next Step" to continue.';
    step.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setCurrentStep(stepName);
}

function handleImageInput(e) {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.getElementById('previewImage');
        img.src = e.target.result;
        img.style.display = 'block';
        document.getElementById('pointMarker').style.display = 'none';
        document.getElementById('pointX').value = '';
        document.getElementById('pointY').value = '';
        const step1Lat = document.getElementById('step1-latitude');
        const step1Lng = document.getElementById('step1-longitude');
        step1Lat.value = ''; step1Lng.value = '';
        step1Lat.disabled = false; step1Lng.disabled = false;
        document.querySelector('.upload-section').style.backgroundColor = '#e8f5e9';
        document.querySelector('.captured-image-section').style.opacity = '0.5';
        document.getElementById('step1Next').disabled = true;
        document.getElementById('uploadStatus').textContent = 'Click on the image to mark the field point and enter coordinates';
        setCurrentStep('step1');
    };
    reader.readAsDataURL(file);
}

function handlePreviewImageClick(e) {
    if (!document.getElementById('imageInput').disabled) {
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = this.naturalWidth / this.width;
        const scaleY = this.naturalHeight / this.height;
        const px = Math.round(x * scaleX);
        const py = Math.round(y * scaleY);
        document.getElementById('pointX').value = px;
        document.getElementById('pointY').value = py;
        const marker = document.getElementById('pointMarker');
        marker.style.left = x + 'px';
        marker.style.top = y + 'px';
        marker.style.display = 'block';
        checkStep1Completion();
    }
}

function checkStep1Completion() {
    const isUploadMode = !document.getElementById('imageInput').disabled;
    if (isUploadMode) {
        const ok = document.getElementById('pointX').value !== '' &&
                   document.getElementById('step1-latitude').value !== '' &&
                   document.getElementById('step1-longitude').value !== '';
        document.getElementById('step1Next').disabled = !ok;
        if (ok) document.getElementById('uploadStatus').textContent = 'Ready. Click "Next Step" to run SAM3.';
    }
}

// Sends image + point to /process_step2 (saves uploaded_image.jpg + circle_data.json)
async function processStep1ToSAM() {
    try {
        document.getElementById('step1Status').textContent = 'Uploading image and point...';
        document.getElementById('step1Next').disabled = true;

        const formData = new FormData();
        const pointX = document.getElementById('pointX').value;
        const pointY = document.getElementById('pointY').value;
        const latitude = document.getElementById('step1-latitude').value;
        const longitude = document.getElementById('step1-longitude').value;
        const zoom = document.getElementById('zoomSlider').value;

        if (!pointX || !pointY) {
            document.getElementById('step1Status').textContent = 'Error: no point selected';
            return;
        }

        const previewImage = document.getElementById('previewImage');
        const response = await fetch(previewImage.src);
        const blob = await response.blob();
        formData.append('image', blob, 'preview_image.jpg');
        formData.append('pointX', Math.round(parseFloat(pointX)));
        formData.append('pointY', Math.round(parseFloat(pointY)));
        formData.append('latitude', latitude);
        formData.append('longitude', longitude);
        formData.append('zoom', zoom);
        formData.append('radiusSize', 40);

        const bounds = map.getBounds().toJSON();
        formData.append('bounds[north]', bounds.north);
        formData.append('bounds[south]', bounds.south);
        formData.append('bounds[east]', bounds.east);
        formData.append('bounds[west]', bounds.west);

        const center = map.getCenter();
        formData.append('center[lat]', center.lat());
        formData.append('center[lng]', center.lng());

        const result = await fetch('/process_step2', { method: 'POST', body: formData }).then(r => r.text());

        if (result === 'success') {
            document.getElementById('step1Status').textContent = 'Done. Running SAM3...';
            moveToNextStep('stepSam');
            await processSAMStep();
        } else {
            throw new Error(result);
        }
    } catch (error) {
        showErrorPopup('Step 1', error);
        document.getElementById('step1Status').textContent = 'Error: ' + error.message;
        document.getElementById('step1Next').disabled = false;
    }
}

// ============= SAM STEP =============

async function processSAMStep() {
    try {
        document.getElementById('samStatus').textContent = 'Running SAM3 segmentation... (this may take a moment)';
        document.getElementById('samNext').disabled = true;

        const result = await fetch('/process_step_sam').then(r => r.text());

        if (result !== 'success') throw new Error(result);

        const img = document.getElementById('samResultImage');
        img.src = '/image/sam_result.jpg?t=' + Date.now();
        img.style.display = 'block';
        document.getElementById('samStatus').textContent = 'Segmentation complete!';
        document.getElementById('samNext').disabled = false;
    } catch (error) {
        showErrorPopup('SAM3', error);
        document.getElementById('samStatus').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 9: DISPLAY ON MAP =============

async function processStep9() {
    try {
        const response = await fetch('/process_step9');
        const result = await response.text();
        if (result !== 'success') throw new Error(result);

        const selectedLat = parseFloat(document.getElementById('step1-latitude').value);
        const selectedLng = parseFloat(document.getElementById('step1-longitude').value);
        const initialZoom = map.getZoom();
        const initialBounds = map.getBounds().toJSON();
        const initialCenter = map.getCenter();

        // Reveal step9 BEFORE initializing the map — hidden elements have no
        // dimensions and Google Maps never fires 'idle' inside them.
        const step9El = document.getElementById('step9');
        step9El.classList.remove('hidden');
        setCurrentStep('step9');
        step9El.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Small delay to let the browser render the now-visible element
        await new Promise(resolve => setTimeout(resolve, 100));

        const resultMap = new google.maps.Map(document.getElementById('resultMap'), {
            ...mapOptions,
            zoom: initialZoom,
            center: { lat: initialCenter.lat(), lng: initialCenter.lng() }
        });

        google.maps.event.addListenerOnce(resultMap, 'idle', async () => {
            const latLngBounds = new google.maps.LatLngBounds(
                { lat: initialBounds.south, lng: initialBounds.west },
                { lat: initialBounds.north, lng: initialBounds.east }
            );
            resultMap.fitBounds(latLngBounds);

            google.maps.event.addListenerOnce(resultMap, 'bounds_changed', () => {
                resultMap.setZoom(initialZoom);
                resultMap.setCenter({ lat: initialCenter.lat(), lng: initialCenter.lng() });
            });

            new google.maps.Marker({
                position: { lat: selectedLat, lng: selectedLng },
                map: resultMap,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#FF0000', fillOpacity: 1.0,
                    strokeColor: '#FFFFFF', strokeWeight: 2, scale: 8
                }
            });

            const geojsonResponse = await fetch('/download_geojson');
            const geojsonData = await geojsonResponse.json();
            resultMap.data.addGeoJson(geojsonData);
            resultMap.data.setStyle({
                fillColor: '#00BCD4', fillOpacity: 0.3,
                strokeColor: '#00BCD4', strokeWeight: 2
            });

            const coordinates = geojsonData.features[0].geometry.coordinates[0];
            const area = google.maps.geometry.spherical.computeArea(
                coordinates.map(coord => new google.maps.LatLng(coord[1], coord[0]))
            );
            document.getElementById('fieldArea').textContent = `${(area / 10000).toFixed(2)} hectares`;

            document.getElementById('step9Status').textContent = 'Field boundary displayed on map';
            document.getElementById('step9Next').disabled = false;
        });

        const zoomSlider = document.getElementById('resultZoomSlider');
        const zoomLevel = document.getElementById('resultZoomLevel');
        zoomSlider.value = initialZoom;
        zoomLevel.textContent = initialZoom;
        zoomSlider.addEventListener('input', () => {
            const z = parseInt(zoomSlider.value);
            resultMap.setZoom(z);
            zoomLevel.textContent = z;
        });
        resultMap.addListener('zoom_changed', () => {
            zoomSlider.value = resultMap.getZoom();
            zoomLevel.textContent = resultMap.getZoom();
        });

    } catch (error) {
        console.error('Error in processStep9:', error);
        document.getElementById('step9Status').textContent = 'Error: ' + error.message;
    }
}

// ============= INIT =============

document.addEventListener('DOMContentLoaded', function() {
    setCurrentStep('step0');

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const cs = document.querySelector('.step-row.current');
            if (cs) {
                const btn = cs.querySelector('.next-button:not(.control-button)');
                if (btn && !btn.disabled) { event.preventDefault(); btn.click(); }
            }
        }
    });

    const imageInput = document.getElementById('imageInput');
    const previewImage = document.getElementById('previewImage');
    const step1Lat = document.getElementById('step1-latitude');
    const step1Lng = document.getElementById('step1-longitude');

    if (imageInput) imageInput.onchange = handleImageInput;
    if (previewImage) previewImage.onclick = handlePreviewImageClick;
    if (step1Lat) step1Lat.oninput = checkStep1Completion;
    if (step1Lng) step1Lng.oninput = checkStep1Completion;
});
