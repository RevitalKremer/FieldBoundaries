// Global variables for tracking state across steps
let map;
let currentMarker = null;
let currentStep = 'step0';
let mapOptions;  // Will be initialized after Google Maps loads

// ============= UTILITY FUNCTIONS =============

/**
 * Utility: Sets the current active step by adding/removing 'current' class
 */
function setCurrentStep(stepId) {
    currentStep = stepId;
    
    const allSteps = document.querySelectorAll('.step-row');
    allSteps.forEach(step => step.classList.remove('current'));
    
    const currentStepElement = document.getElementById(stepId);
    if (currentStepElement) {
        currentStepElement.classList.add('current');
    }
}

/**
 * Utility: Move to the next step
 */
function moveToNextStep(nextStepId) {
    const nextStep = document.getElementById(nextStepId);
    if (nextStep) {
        nextStep.classList.remove('hidden');
        // Enable both Next Step and Run All Steps buttons
        const nextButton = document.getElementById(`${nextStepId}Next`);
        const runAllButton = document.getElementById(`${nextStepId}RunAll`);
        if (nextButton) nextButton.disabled = false;
        if (runAllButton) runAllButton.disabled = false;
    }
    
    setCurrentStep(nextStepId);
    
    // Function to perform scrolling
    const scrollToStep = () => {
        const rect = nextStep.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        if (rect.height < viewportHeight) {
            nextStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            nextStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Wait for all images and maps in the step to load before scrolling
    const images = nextStep.getElementsByTagName('img');
    const maps = nextStep.getElementsByClassName('map-container');
    let totalElements = images.length + maps.length;
    let loadedElements = 0;

    const checkAllLoaded = () => {
        loadedElements++;
        if (loadedElements === totalElements) {
            // Add a small delay to ensure maps are fully rendered
            setTimeout(scrollToStep, 100);
        }
    };

    // Handle image loading
    if (images.length > 0) {
        Array.from(images).forEach(img => {
            if (img.complete) {
                checkAllLoaded();
            } else {
                img.onload = checkAllLoaded;
                img.onerror = checkAllLoaded; // Count errors too to avoid hanging
            }
        });
    }

    // Handle map loading
    if (maps.length > 0) {
        Array.from(maps).forEach(mapContainer => {
            // Check if this is step9's result map
            if (nextStepId === 'step9' && mapContainer.id === 'resultMap') {
                // For step9, we'll let processStep9 handle the scrolling
                checkAllLoaded();
            } else {
                // For other maps, check if they're loaded
                const mapElement = mapContainer.querySelector('.map');
                if (mapElement && mapElement.offsetParent !== null) {
                    // Map is visible and loaded
                    checkAllLoaded();
                } else {
                    // Wait a bit for the map to initialize
                    setTimeout(checkAllLoaded, 100);
                }
            }
        });
    }

    // If no images or maps, scroll immediately
    if (totalElements === 0) {
        scrollToStep();
    }
}

/**
 * Utility: Converts lat/lng to Mercator projection coordinates
 */
function project(lat, lng, zoom) {
    const siny = Math.sin((lat * Math.PI) / 180);
    const x = ((lng + 180) / 360);
    const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI));
    
    return {
        x: x,
        y: Math.max(0, Math.min(1, y))
    };
}

/**
 * Utility: Updates images for each step
 */
function updateStepImages(resultImgElement, imagePath, useOverlay = false) {
    const timestamp = new Date().getTime();
    resultImgElement.src = imagePath.startsWith('/display/') ? 
        imagePath + '?' + timestamp : 
        '/display/' + imagePath + '?' + timestamp;
    
    if (useOverlay) {
        const container = resultImgElement.parentElement.parentElement;
        const overlayImg = container.querySelector('img:first-of-type');
        overlayImg.src = '/gray_overlay?' + timestamp;
    }
}

/**
 * Utility: Enables all step buttons
 */
function enableAllButtons() {
    document.querySelectorAll('.next-button').forEach(button => {
        button.disabled = false;
    });
    document.querySelectorAll('.run-all-button').forEach(button => {
        button.disabled = false;
    });
}

/**
 * Utility: Shows error popup and logs error
 */
function showErrorPopup(stepName, error) {
    console.error(`Error in ${stepName}:`, error);
    alert(`Error in ${stepName}: ${error.message}`);
}

// ============= MAP FUNCTIONS =============

/**
 * Map: Initializes the Google Map
 */
function initMap() {
    try {
        // Initialize map options after Google Maps API is loaded
        mapOptions = {
            mapTypeId: 'satellite',
            
            // Controls visibility
            mapTypeControl: false,      // Remove map/satellite switch
            streetViewControl: false,    // Remove street view
            fullscreenControl: true,     // Keep fullscreen option
            zoomControl: true,          // Show zoom buttons
            scaleControl: true,         // Show scale bar
            rotateControl: false,       // Remove rotate control
            
            // Control positions and options
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            },
            scaleControlOptions: {
                position: google.maps.ControlPosition.BOTTOM_RIGHT
            },
            fullscreenControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT
            },
            
            // Additional map options
            clickableIcons: false,      // Disable POI clicks
            disableDoubleClickZoom: true, // Disable double-click zoom
            draggable: true,            // Allow map dragging
            keyboardShortcuts: false,   // Disable keyboard controls
            minZoom: 10,                // Set minimum zoom level
            maxZoom: 21,                // Set maximum zoom level
            zoom: 19                    // Set default zoom level
        };

        // Get initial coordinates from input fields or use defaults
        const lat = parseFloat(document.getElementById('latitude').value) || 31;
        const lng = parseFloat(document.getElementById('longitude').value) || 31;
        
        // Set initial center based on input coordinates or default
        const initialCenter = (!isNaN(lat) && !isNaN(lng) && 
                             lat >= -90 && lat <= 90 && 
                             lng >= -180 && lng <= 180) 
            ? { lat: lat, lng: lng }
            : { lat: 32.90113196474662, lng: 35.12035674668466 };

        map = new google.maps.Map(document.getElementById('map'), {
            ...mapOptions,
            center: initialCenter
        });

        // Update zoom slider to match default zoom from mapOptions
        document.getElementById('zoomSlider').value = mapOptions.zoom;
        document.getElementById('zoomLevel').textContent = mapOptions.zoom;

        setupMapControls();
        setupMapEventListeners();
        setCurrentStep('step0');

        // After map is initialized, simulate a click at the coordinates
        if (!isNaN(lat) && !isNaN(lng) && 
            lat >= -90 && lat <= 90 && 
            lng >= -180 && lng <= 180) {
            // Create a LatLng object for the click event
            const latLng = new google.maps.LatLng(lat, lng);
            // Simulate the click event
            handleMapClick({ latLng: latLng });
        }
        
    } catch (error) {
        handleMapInitError(error);
    }
}

/**
 * Map Step: Sets up map zoom controls and their event listeners
 * Manages the zoom slider and zoom level display
 */
function setupMapControls() {
    // Initialize zoom slider with map's current zoom
    const currentZoom = map.getZoom();
    document.getElementById('zoomSlider').value = currentZoom;
    document.getElementById('zoomLevel').textContent = currentZoom;

    map.addListener('zoom_changed', function() {
        const zoom = map.getZoom();
        document.getElementById('zoomSlider').value = zoom;
        document.getElementById('zoomLevel').textContent = zoom;
    });

    document.getElementById('zoomSlider').addEventListener('input', function() {
        const zoom = parseInt(this.value);
        map.setZoom(zoom);
        document.getElementById('zoomLevel').textContent = zoom;
    });

    document.getElementById('latitude').addEventListener('input', function() {
        const lat = parseFloat(this.value);
        const lng = parseFloat(document.getElementById('longitude').value);
        if (!isNaN(lat) && lat >= -90 && lat <= 90 && !isNaN(lng) && lng >= -180 && lng <= 180) {
            map.setCenter({ lat: lat, lng: map.getCenter().lng() });
        }
    });

    document.getElementById('longitude').addEventListener('input', function() {
        const lng = parseFloat(this.value);
        const lat = parseFloat(document.getElementById('latitude').value);
        if (!isNaN(lng) && lng >= -180 && lng <= 180) {
            map.setCenter({ lat: map.getCenter().lat(), lng: lng });
        }
    });
}

/**
 * Map Step: Sets up map event listeners for tile loading and clicks
 * Handles map interaction events
 */
function setupMapEventListeners() {
    map.addListener('tilesloaded', handleTilesLoaded);
    map.addListener('click', handleMapClick);
}

/**
 * Map Step: Handles map initialization errors
 * Displays user-friendly error message if map fails to load
 */
function handleMapInitError(error) {
    console.error('Error initializing Google Maps:', error);
    const mapContainer = document.getElementById('map');
    mapContainer.innerHTML = `
        <div class="error-container">
            <h4>Google Maps Error</h4>
            <p>Error initializing Google Maps: ${error.message}</p>
            <p>Please check your internet connection and try refreshing the page.</p>
        </div>
    `;
    
    document.getElementById('step0Next').disabled = true;
}

/**
 * Map Step: Handles map tiles loading event
 * Checks if satellite imagery is available for the selected location
 */
function handleTilesLoaded() {
    const mapDiv = document.getElementById('map');
    if (mapDiv.innerHTML.toLowerCase().includes('sorry')) {
        document.getElementById('step0Next').disabled = true;
        document.getElementById('uploadStatus').textContent = 'No satellite imagery available for this location. Please try a different area.';
    } else {
        document.getElementById('step0Next').disabled = false;
        document.getElementById('uploadStatus').textContent = 'Click "Capture This Area" when ready.';
    }
}

/**
 * Map Step: Handles map click events
 * Updates coordinates and places marker when user selects a point
 */
function handleMapClick(e) {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    
    updateCoordinateInputs(lat, lng);
    updateMapMarker(e.latLng);
    
    document.getElementById('step0Next').disabled = false;
    document.getElementById('mapStatus').textContent = 'Point selected. Click "Capture This Area" to continue.';
}

/**
 * Map Step: Updates coordinate input fields
 * Displays selected latitude and longitude in input fields
 */
function updateCoordinateInputs(lat, lng) {
    document.getElementById('latitude').value = lat;
    document.getElementById('longitude').value = lng;
}

/**
 * Map Step: Updates the marker on the map
 * Creates or moves the red dot marker to selected position
 */
function updateMapMarker(position) {
    if (currentMarker) {
        currentMarker.setMap(null);
    }
    
    currentMarker = new google.maps.Marker({
        position: position,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#FF0000',
            fillOpacity: 1.0,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
            scale: 8
        }
    });
}

/**
 * Map Step: Handles image loading errors
 * Displays error message if image capture fails
 */
function handleImageError() {
    console.error('Failed to load image');
    alert('Failed to capture the area. Please try again.');
}

/**
 * Map Step: Clears the marker from the map
 * Removes the red dot marker after area capture
 */
function clearMapMarker() {
    if (currentMarker) {
        currentMarker.setMap(null);
        currentMarker = null;
    }
}

/**
 * Map Step -> Step 1: Handles successful image load from capture
 * Processes captured image and enables Step 1
 */
function handleImageLoad(selectedLat, selectedLng, lat, lng, zoom, radius = 50) {
    // Copy coordinates to Step 1
    const step1Lat = document.getElementById('step1-latitude');
    const step1Lng = document.getElementById('step1-longitude');
    
    step1Lat.value = selectedLat;
    step1Lng.value = selectedLng;
    step1Lat.disabled = true;  // Disable coordinate inputs for captured image
    step1Lng.disabled = true;
    
    // Calculate point position using fixed dimensions
    const imageWidth = document.getElementById('map').offsetWidth;
    const imageHeight = document.getElementById('map').offsetHeight;
    const centerPoint = project(parseFloat(selectedLat), parseFloat(selectedLng), zoom);
    const imageCenter = project(lat, lng, zoom);
    
    const offsetX = (centerPoint.x - imageCenter.x) * 256 * Math.pow(2, zoom);
    const offsetY = (centerPoint.y - imageCenter.y) * 256 * Math.pow(2, zoom);
    
    const pointX = (imageWidth / 2) + offsetX;
    const pointY = (imageHeight / 2) + offsetY;
    
    // Update UI for captured image path
    document.querySelector('.captured-image-section').style.backgroundColor = '#e8f5e9';
    document.querySelector('.upload-section').style.opacity = '0.5';
    document.getElementById('imageInput').disabled = true;
    
    // Update point marker using fixed dimensions
    document.getElementById('pointX').value = Math.round(pointX);
    document.getElementById('pointY').value = Math.round(pointY);
    
    const marker = document.getElementById('pointMarker');
    marker.style.left = pointX + 'px';
    marker.style.top = pointY + 'px';
    marker.style.display = 'block';

    // Set initial radius size
    const radiusSlider = document.getElementById('radiusSize');
    if (radiusSlider) {
        radiusSlider.value = radius;
        document.getElementById('radiusSizeValue').textContent = radius + 'px';
    }
    
    showAndEnableStep('step1');
}

/**
 * Map Step: Process step 0 - Capture the map area
 * Creates static map image from selected location
 */
function processStep0() {
    // Check if coordinates are selected
    const selectedLat = document.getElementById('latitude').value;
    const selectedLng = document.getElementById('longitude').value;

    if (!selectedLat || !selectedLng) {
        alert('Please select a point on the map first');
        return;
    }

    // Get center coordinates and zoom
    const center = map.getCenter();
    const lat = center.lat();
    const lng = center.lng();
    const zoom = map.getZoom();

    // Get initial radius size
    const radiusSize = document.getElementById('radiusSize')?.value || 50;

    // Create URL for static map
    const width = document.getElementById('map').offsetWidth;
    const height = document.getElementById('map').offsetHeight;
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=satellite&key=${googleMapsApiKey}`;

    // Create an image element and set its source
    const img = document.getElementById('previewImage');
    
    console.log('Loading image:', url);
    
    img.onload = function() {
        console.log('Image loaded successfully');
        handleImageLoad(selectedLat, selectedLng, lat, lng, zoom, radiusSize);
    };

    img.onerror = function() {
        console.error('Failed to load image');
        alert('Failed to capture the area. Please try again.');
    };

    img.src = url;
    img.style.display = 'block';
    
    console.log('Capture process initiated');
}

// ============= PROCESSING STEPS =============

/**
 * Process all steps automatically from the specified step onward
 */
async function processAllSteps(event) {
    try {
        // Get the current step number from the clicked button's ID
        const buttonId = event.target.id;
        const stepNumber = parseInt(buttonId.match(/step(\d+)/)[1]);
        
        // Map of step numbers to their processing functions
        const stepFunctions = {
            2: processStep2,
            3: processStep3,
            4: processStep4,
            5: processStep5,
            6: processStep6,
            7: processStep7,
            8: processStep8,
            9: processStep9
        };
        
        // Process all steps from current step onward
        for (let i = stepNumber; i <= 9; i++) {
            if (stepFunctions[i]) {
                await stepFunctions[i]();
            }
        }
        
        enableAllButtons();
        
        // Wait for all images in the last step to load before scrolling
        const lastStep = document.getElementById(`step${Math.min(8, stepNumber + 1)}`);
        if (lastStep) {
            const images = lastStep.getElementsByTagName('img');
            if (images.length > 0) {
                let loadedImages = 0;
                const totalImages = images.length;
                
                const scrollAfterLoad = () => {
                    loadedImages++;
                    if (loadedImages === totalImages) {
                        // All images loaded, now scroll
                        const rect = lastStep.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        
                        if (rect.height < viewportHeight) {
                            lastStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } else {
                            lastStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                };

                Array.from(images).forEach(img => {
                    if (img.complete) {
                        scrollAfterLoad();
                    } else {
                        img.onload = scrollAfterLoad;
                        img.onerror = scrollAfterLoad; // Count errors too to avoid hanging
                    }
                });
            } else {
                // No images, scroll immediately
                lastStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        }
        
    } catch (error) {
        showErrorPopup('Automatic Processing', error);
    }
}

// ============= EVENT LISTENERS =============

document.addEventListener('DOMContentLoaded', function() {
    setCurrentStep('step0');

    // Add Enter key handler
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const currentStep = document.querySelector('.step-row.current');
            if (currentStep) {
                const nextButton = currentStep.querySelector('.next-button:not(.run-all-button):not(.control-button)');
                if (nextButton && !nextButton.disabled) {
                    event.preventDefault();
                    nextButton.click();
                }
            }
        }
    });

    // Setup input handlers
    setupInputHandlers();
    
    // Setup control handlers
    setupControlHandlers();
});

/**
 * Setup all input handlers
 */
function setupInputHandlers() {
    const imageInput = document.getElementById('imageInput');
    const previewImage = document.getElementById('previewImage');
    const step1Lat = document.getElementById('step1-latitude');
    const step1Lng = document.getElementById('step1-longitude');
    
    if (imageInput) imageInput.onchange = handleImageInput;
    if (previewImage) previewImage.onclick = handlePreviewImageClick;
    if (step1Lat) step1Lat.oninput = handleCoordinateInput;
    if (step1Lng) step1Lng.oninput = handleCoordinateInput;
}

/**
 * Setup all control handlers
 */
function setupControlHandlers() {
    setupRadiusControl();
    setupWindowSizeControl();
    setupEpsilonControl();
}

// ============= STEP 1 FUNCTIONS =============

/**
 * Step 1: Updates point marker on the captured image
 * Places marker at the selected coordinates
 */
function updatePointMarker(pointX, pointY, scale) {
    document.getElementById('pointX').value = Math.round(pointX);
    document.getElementById('pointY').value = Math.round(pointY);
    
    const marker = document.getElementById('pointMarker');
    marker.style.left = (pointX / scale) + 'px';
    marker.style.top = (pointY / scale) + 'px';
    marker.style.display = 'block';
}

/**
 * Step 1: Shows and enables Step 1 interface
 * Reveals Step 1 section and enables its controls
 */
function showAndEnableStep(stepName) {
    const step = document.getElementById(stepName);
    if (!step) {
        console.warn('❌ Could not find step element:', stepName);
        return;
    }
    step.classList.remove('hidden');
    
    document.querySelectorAll(`#${stepName} button`).forEach(button => {
        button.disabled = false;
    });
    
    document.getElementById('uploadStatus').textContent = 'Point selected. Click "Next Step" to continue or "Run All Steps" to process automatically.';
    
    step.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setCurrentStep(stepName);  // Set next step as current
}

/**
 * Step 1: Handles image file input
 * Processes user-uploaded image files
 */
function handleImageInput(e) {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('previewImage');
            img.src = e.target.result;
            img.style.display = 'block';
            
            // Reset point marker and coordinates for uploaded image
            document.getElementById('pointMarker').style.display = 'none';
            document.getElementById('pointX').value = '';
            document.getElementById('pointY').value = '';
            
            // Reset and enable coordinate inputs for manual entry
            const step1Lat = document.getElementById('step1-latitude');
            const step1Lng = document.getElementById('step1-longitude');
            step1Lat.value = '';
            step1Lng.value = '';
            step1Lat.disabled = false;
            step1Lng.disabled = false;
            
            // Update UI for upload path
            document.querySelector('.upload-section').style.backgroundColor = '#e8f5e9';
            document.querySelector('.captured-image-section').style.opacity = '0.5';
            
            // Update status and buttons
            document.getElementById('step1Next').disabled = true;
            document.getElementById('runAllSteps').disabled = true;
            document.getElementById('uploadStatus').textContent = 'Click on the image to mark the field point and enter coordinates';
            
            setCurrentStep('step1');
        }
        reader.readAsDataURL(file);
    }
}

/**
 * Step 1: Handles clicks on the preview image
 * Allows user to mark point on uploaded image
 */
function handlePreviewImageClick(e) {
    // Only allow clicking if we're in upload mode (coordinates are empty)
    if (!document.getElementById('imageInput').disabled) {
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const scaleX = this.naturalWidth / this.width;
        const scaleY = this.naturalHeight / this.height;
        
        selectedPoint = {
            x: Math.round(x * scaleX),
            y: Math.round(y * scaleY)
        };

        const marker = document.getElementById('pointMarker');
        marker.style.left = x + 'px';
        marker.style.top = y + 'px';
        marker.style.display = 'block';

        document.getElementById('pointX').value = selectedPoint.x;
        document.getElementById('pointY').value = selectedPoint.y;
        
        // Check if coordinates are entered to enable next step
        checkStep1Completion();
    }
}

/**
 * Step 1: Handles coordinate input changes
 * Validates coordinates and enables next step if all requirements are met
 */
function handleCoordinateInput() {
    checkStep1Completion();
}

/**
 * Step 1: Checks if all requirements are met to enable next step
 * For upload path: needs point marker and coordinates
 * For capture path: automatically enabled
 */
function checkStep1Completion() {
    const isUploadMode = !document.getElementById('imageInput').disabled;
    if (isUploadMode) {
        const hasPoint = document.getElementById('pointX').value !== '';
        const hasLat = document.getElementById('step1-latitude').value !== '';
        const hasLng = document.getElementById('step1-longitude').value !== '';
        
        const canProceed = hasPoint && hasLat && hasLng;
        document.getElementById('step1Next').disabled = !canProceed;
        document.getElementById('runAllSteps').disabled = !canProceed;
        
        if (canProceed) {
            document.getElementById('uploadStatus').textContent = 'Point selected and coordinates entered. Click "Next Step" to continue.';
        } else if (hasPoint) {
            document.getElementById('uploadStatus').textContent = 'Please enter latitude and longitude coordinates.';
        }
    }
}

/**
 * Step 2: Process initial image with given radius size
 * Processes the initial image and point selection
 */
async function processStep2WithRadius() {
    try {
        const radiusSlider = document.getElementById('radiusSize');
        if (!radiusSlider) return false;

        const radiusSize = radiusSlider.value;
        document.getElementById('step2Status').textContent = 'Processing...';
        
        const formData = new FormData();
        
        // Get point coordinates
        const pointX = document.getElementById('pointX').value;
        const pointY = document.getElementById('pointY').value;
        const latitude = document.getElementById('step1-latitude').value;
        const longitude = document.getElementById('step1-longitude').value;
        const zoom = document.getElementById('zoomSlider').value;
        
        if (!pointX || !pointY) {
            document.getElementById('uploadStatus').textContent = 'Error: Point coordinates not found';
            return false;
        }

        // Get the preview image - use existing image without re-fetching
        const previewImage = document.getElementById('previewImage');
        const response = await fetch(previewImage.src);
        const blob = await response.blob();
        formData.append('image', blob, 'preview_image.jpg');
        
        // Add form data
        formData.append('pointX', Math.round(parseFloat(pointX)));
        formData.append('pointY', Math.round(parseFloat(pointY)));
        formData.append('latitude', latitude);
        formData.append('longitude', longitude);
        formData.append('zoom', zoom);
        formData.append('radiusSize', radiusSize);

        // Add map bounds
        const bounds = map.getBounds().toJSON();
        formData.append('bounds[north]', bounds.north);
        formData.append('bounds[south]', bounds.south);
        formData.append('bounds[east]', bounds.east);
        formData.append('bounds[west]', bounds.west);

        // Add map center
        const center = map.getCenter();
        formData.append('center[lat]', center.lat());
        formData.append('center[lng]', center.lng());

        const result = await fetch('/process_step2', {
            method: 'POST',
            body: formData
        }).then(response => response.text());
        
        if (result === 'success') {
            updateStepImages(document.getElementById('processedImage'), 'step2_processed_image.jpg');
            document.getElementById('step2Status').textContent = `Processing complete! (Radius size: ${radiusSize}px)`;
            document.getElementById('step2Next').disabled = false;
            return true;
        } else {
            throw new Error(result);
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('step2Status').textContent = 'Error: ' + error.message;
        return false;
    }
}

/**
 * Step 2: Processes the initial image and point selection
 * Sends selected coordinates and image to server for processing
 */
async function processStep2() {
    const success = await processStep2WithRadius();
    if (success) {
        moveToNextStep('step2');
    }
}

/**
 * Setup radius control
 */
function setupRadiusControl() {
    const radiusSlider = document.getElementById('radiusSize');
    if (!radiusSlider) return;

    // Update value display
    radiusSlider.oninput = function() {
        document.getElementById('radiusSizeValue').textContent = this.value + 'px';
    };

    // Apply button handler
    document.getElementById('applyRadiusSize').onclick = processStep2WithRadius;
}


// ============= STEP 3 FUNCTIONS =============

/**
 * Step 3: Creates green areas mask
 * Processes image to identify areas with similar green color
 */
async function processStep3() {
    try {
        const result = await fetch('/process_step3').then(response => response.text());
        if (result !== 'success') throw new Error('Step 3 failed');
        
        updateStepImages(document.getElementById('greenMaskImage'), 'step3_green_mask.jpg');
        document.getElementById('step3Status').textContent = 'Processing complete!';
        document.getElementById('step3Next').disabled = false;
        moveToNextStep('step3');
    } catch (error) {
        showErrorPopup('Step 2', error);
        document.getElementById('step2Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEPS 4 FUNCTIONS =============

/**
 * Step 4: Process pixel density with given window size
 * Creates black mask based on pixel density analysis
 */
async function processStep4WithWindowSize() {
    try {
        const windowSlider = document.getElementById('windowSize');
        if (!windowSlider) return false;
        
        const windowSize = windowSlider.value;
        document.getElementById('step4Status').textContent = 'Processing...';
        document.getElementById('step4Next').disabled = true;
        
        const formData = new FormData();
        formData.append('windowSize', windowSize);
        
        const response = await fetch('/process_step4', {
            method: 'POST',
            body: formData
        });
        const result = await response.text();
        
        if (result === 'success') {
            updateStepImages(document.getElementById('densityMaskImage'), 'step4_density_mask.jpg');
            document.getElementById('step4Status').textContent = `Processing complete! (Window size: ${windowSize}px)`;
            document.getElementById('step4Next').disabled = false;
            return true;
        } else {
            throw new Error(result);
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('step4Status').textContent = 'Error: ' + error.message;
        return false;
    }
}

/**
 * Step 4: Process pixel density
 * Creates black mask based on pixel density analysis
 */
async function processStep4() {
    const success = await processStep4WithWindowSize();
    if (success) {
        moveToNextStep('step4');
    }
}

/**
 * Setup window size control
 */
function setupWindowSizeControl() {
    const windowSlider = document.getElementById('windowSize');
    if (!windowSlider) return;

    // Update value display
    windowSlider.oninput = function() {
        document.getElementById('windowSizeValue').textContent = this.value + 'px';
    };

    // Apply button handler
    document.getElementById('applyWindowSize').onclick = processStep4WithWindowSize;
}


// ============= STEP 5 FUNCTIONS =============
/**
 * Step 5: Identify main shape
 * Identifies the main field shape containing the selected point
 */
async function processStep5() {
    try {
        const result = await fetch('/process_step5').then(response => response.text());
        if (result !== 'success') throw new Error('Step 5 failed');
        
        updateStepImages(document.getElementById('mainShapeImage'), 'step5_main_shape.jpg');
        document.getElementById('step5Status').textContent = 'Processing complete!';
        document.getElementById('step5Next').disabled = false;
        moveToNextStep('step5');
    } catch (error) {
        showErrorPopup('Step 5', error);
        document.getElementById('step4Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 6 FUNCTIONS =============

/**
 * Step 6: Process edge smoothing with given epsilon factor
 * Smooths the edges of the identified field shape
 */
async function processStep6WithEpsilon() {
    try {
        const epsilonSlider = document.getElementById('epsilonFactor');
        if (!epsilonSlider) return false;
        
        const epsilonFactor = epsilonSlider.value;
        document.getElementById('step6Status').textContent = 'Processing...';
        document.getElementById('step6Next').disabled = true;
        
        const formData = new FormData();
        formData.append('epsilonFactor', epsilonFactor);
        
        const response = await fetch('/process_step6', {
            method: 'POST',
            body: formData
        });
        const result = await response.text();
        
        if (result === 'success') {
            updateStepImages(document.getElementById('smoothedShapeImage'), 'step6_smoothed_shape.jpg');
            document.getElementById('step6Status').textContent = `Processing complete! (Smoothing: ${parseFloat(epsilonFactor).toFixed(4)})`;
            document.getElementById('step6Next').disabled = false;
            return true;
        } else {
            throw new Error(result);
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('step6Status').textContent = 'Error: ' + error.message;
        return false;
    }
}

/**
 * Step 6: Applies edge smoothing
 * Smooths the edges of the identified field shape
 */
async function processStep6() {
    const success = await processStep6WithEpsilon();
    if (success) {
        moveToNextStep('step6');
    }
}

/**
 * Setup epsilon control
 */
function setupEpsilonControl() {
    const epsilonSlider = document.getElementById('epsilonFactor');
    if (!epsilonSlider) return;

    // Update value display
    epsilonSlider.oninput = function() {
        const value = parseFloat(this.value).toFixed(4);
        document.getElementById('epsilonValue').textContent = value;
    };

    // Apply button handler
    document.getElementById('applySmoothing').onclick = processStep6WithEpsilon;
}


// ============= STEP 7 FUNCTIONS =============

/**
 * Step 7: Isolates the field area
 * Creates masked version showing only the identified field
 */
async function processStep7() {
    try {
        const result = await fetch('/process_step7').then(response => response.text());
        if (result !== 'success') throw new Error('Step 7 failed');
        
        updateStepImages(document.getElementById('maskedFieldImage'), 'step7_masked_field.jpg');
        document.getElementById('step7Status').textContent = 'Processing complete!';
        document.getElementById('step7Next').disabled = false;
        moveToNextStep('step7');
    } catch (error) {
        showErrorPopup('Step 7', error);
        document.getElementById('step6Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 8 FUNCTIONS =============

/**
 * Step 8: Generates final GeoJSON output
 * Creates downloadable GeoJSON file from field boundary
 */
async function processStep8() {
    try {
        const result = await fetch('/process_step8').then(response => response.text());
        if (result !== 'success') throw new Error('Step 8 failed');
        
        updateStepImages(document.getElementById('finalImage'), 'step8_final_with_boundary.jpg');
        document.getElementById('step8Status').textContent = 'Processing complete! GeoJSON boundary shown in cyan. Ready for download.';
        document.getElementById('downloadGeoJSON').disabled = false;
        moveToNextStep('step8');
    } catch (error) {
        showErrorPopup('Step 8', error);
        document.getElementById('step7Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 9 FUNCTIONS =============

/**
 * Step 9: Displays field boundary on interactive map
 * Shows the generated GeoJSON on a Google Maps satellite view
 */
async function processStep9() {
    try {
        // First, process step 9 on the server
        const response = await fetch('/process_step9');
        const result = await response.text();
        if (result !== 'success') {
            throw new Error(result);
        }

        // Get the exact properties from the initial map
        const selectedLat = parseFloat(document.getElementById('step1-latitude').value);
        const selectedLng = parseFloat(document.getElementById('step1-longitude').value);
        const initialZoom = map.getZoom();
        const initialBounds = map.getBounds().toJSON();
        const initialCenter = map.getCenter();

        console.log('Initial map properties:', {
            zoom: initialZoom,
            center: { lat: initialCenter.lat(), lng: initialCenter.lng() },
            bounds: initialBounds,
            selectedPoint: { lat: selectedLat, lng: selectedLng }
        });

        // Initialize the result map with exact same properties as initial map
        const resultMap = new google.maps.Map(document.getElementById('resultMap'), {
            ...mapOptions,
            zoom: initialZoom,  // Set zoom first
            center: { lat: initialCenter.lat(), lng: initialCenter.lng() }  // Use exact center
        });

        // Wait for the map to be idle before setting bounds and adding features
        google.maps.event.addListenerOnce(resultMap, 'idle', async () => {
            // Set the exact same bounds
            const latLngBounds = new google.maps.LatLngBounds(
                { lat: initialBounds.south, lng: initialBounds.west },
                { lat: initialBounds.north, lng: initialBounds.east }
            );
            resultMap.fitBounds(latLngBounds);

            // Force the exact zoom level after bounds are set
            google.maps.event.addListenerOnce(resultMap, 'bounds_changed', () => {
                resultMap.setZoom(initialZoom);
                resultMap.setCenter({ lat: initialCenter.lat(), lng: initialCenter.lng() });
            });

            // Add marker for the selected point at exact same position
            new google.maps.Marker({
                position: { lat: selectedLat, lng: selectedLng },
                map: resultMap,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#FF0000',
                    fillOpacity: 1.0,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                    scale: 8
                }
            });

            // Fetch and add the GeoJSON data after map is properly initialized
            const geojsonResponse = await fetch('/download_geojson');
            const geojsonData = await geojsonResponse.json();
            
            resultMap.data.addGeoJson(geojsonData);
            resultMap.data.setStyle({
                fillColor: '#00BCD4',
                fillOpacity: 0.3,
                strokeColor: '#00BCD4',
                strokeWeight: 2
            });

            console.log('Result map properties:', {
                zoom: resultMap.getZoom(),
                center: resultMap.getCenter().toJSON(),
                bounds: resultMap.getBounds().toJSON(),
                selectedPoint: { lat: selectedLat, lng: selectedLng }
            });

            // Log GeoJSON data for debugging
            console.log('GeoJSON data:', geojsonData);
        });

        // Set up zoom slider to match initial map
        const zoomSlider = document.getElementById('resultZoomSlider');
        const zoomLevel = document.getElementById('resultZoomLevel');
        
        // Initialize zoom controls with exact same zoom
        zoomSlider.value = initialZoom;
        zoomLevel.textContent = initialZoom;
        
        // Ensure zoom controls maintain synchronization
        zoomSlider.addEventListener('input', () => {
            const zoom = parseInt(zoomSlider.value);
            resultMap.setZoom(zoom);
            zoomLevel.textContent = zoom;
            
            // Keep the center point when zooming
            resultMap.setCenter({ lat: initialCenter.lat(), lng: initialCenter.lng() });
        });

        resultMap.addListener('zoom_changed', () => {
            const zoom = resultMap.getZoom();
            zoomSlider.value = zoom;
            zoomLevel.textContent = zoom;
        });

        // Add center_changed listener to maintain the center point
        resultMap.addListener('center_changed', () => {
            const currentCenter = resultMap.getCenter();
            if (currentCenter.lat() !== initialCenter.lat() || 
                currentCenter.lng() !== initialCenter.lng()) {
                resultMap.setCenter({ lat: initialCenter.lat(), lng: initialCenter.lng() });
            }
        });

        document.getElementById('step9Status').textContent = 'Field boundary displayed on map';
        moveToNextStep('step9');

    } catch (error) {
        console.error('Error in processStep9:', error);
        document.getElementById('step9Status').textContent = 'Error: ' + error.message;
    }
} 