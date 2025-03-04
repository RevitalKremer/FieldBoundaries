// Global variables for tracking state across steps
let selectedPoint = null;
let map;
let currentMarker = null;
let currentStep = 'step0';  // Fix: Remove extra quote

// ============= UTILITY FUNCTIONS =============

/**
 * Utility: Sets the current active step by adding/removing 'current' class
 * @param {string} stepId - The ID of the step to set as current ('step0', 'step1', etc.)
 */
function setCurrentStep(stepId) {
    // Update the current step variable
    currentStep = stepId;
    
    // Remove 'current' class from all steps
    const allSteps = document.querySelectorAll('.step-row');
    allSteps.forEach(step => {
        step.classList.remove('current');
    });
    
    // Add 'current' class to the specified step
    const currentStepElement = document.getElementById(stepId);
    if (currentStepElement) {
        currentStepElement.classList.add('current');
    }
}

/**
 * Utility: Move to the next step
 * @param {string} nextStepId - The ID of the next step
 */
function moveToNextStep(nextStepId) {
    // Show the next step
    const nextStep = document.getElementById(nextStepId);
    if (nextStep) {
        nextStep.classList.remove('hidden');
    }
    
    // Update current step
    setCurrentStep(nextStepId);
    
    // Scroll to the new step
    document.getElementById(nextStepId).scrollIntoView({ behavior: 'smooth' });
}

/**
 * Utility: Converts lat/lng to Mercator projection coordinates
 * Used for calculating point positions on static map
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
 * Handles image updates with cache busting and optional overlay
 */
function updateStepImages(resultImgElement, imagePath, useOverlay = false) {
    resultImgElement.src = '/display/' + imagePath + '?' + new Date().getTime();
    
    if (useOverlay) {
        const container = resultImgElement.parentElement.parentElement;
        const overlayImg = container.querySelector('img:first-of-type');
        overlayImg.src = '/gray_overlay?' + new Date().getTime();
    }
}

/**
 * Utility: Enables all step buttons
 * Used after automatic processing to ensure all steps are accessible
 */
function enableAllButtons() {
    document.getElementById('step2Next').disabled = false;
    document.getElementById('step3Next').disabled = false;
    document.getElementById('step4Next').disabled = false;
    document.getElementById('step5Next').disabled = false;
    document.getElementById('step6Next').disabled = false;
}

/**
 * Utility: Shows error popup and logs error
 * @param {string} stepName - The name of the step that failed
 * @param {Error} error - The error object
 */
function showErrorPopup(stepName, error) {
    console.error(`Error in ${stepName}:`, error);
    alert(`Error in ${stepName}: ${error.message}`);
}

// ============= MAP STEP FUNCTIONS =============

/**
 * Map Step: Initializes the Google Map with satellite view
 * Sets up initial map position, zoom level, and map type
 */
function initMap() {
    try {
        map = new google.maps.Map(document.getElementById('map'), {
            center: { lat: 32.90113196474662, lng: 35.12035674668466 },
            zoom: 17,
            mapTypeId: 'satellite',
            mapTypeControl: false
        });

        setupMapControls();
        setupMapEventListeners();
        setCurrentStep('step0');  // Set map step as current initially
        
    } catch (error) {
        handleMapInitError(error);
    }
}

/**
 * Map Step: Sets up map zoom controls and their event listeners
 * Manages the zoom slider and zoom level display
 */
function setupMapControls() {
    document.getElementById('zoomSlider').value = 17;
    document.getElementById('zoomLevel').textContent = '17';

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

// ============= STEP 1 FUNCTIONS =============

/**
 * Map Step -> Step 1: Handles successful image load from capture
 * Processes captured image and enables Step 1
 */
function handleImageLoad(selectedLat, selectedLng, lat, lng, zoom) {
    // Copy coordinates to Step 1
    const step1Lat = document.getElementById('step1-latitude');
    const step1Lng = document.getElementById('step1-longitude');
    
    step1Lat.value = selectedLat;
    step1Lng.value = selectedLng;
    step1Lat.disabled = true;  // Disable coordinate inputs for captured image
    step1Lng.disabled = true;
    
    // Calculate point position using fixed dimensions
    const imageWidth = 640;
    const imageHeight = 640;
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
    
    showAndEnableStep('step1');
    clearMapMarker();
}

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
    
    step.scrollIntoView({ behavior: 'smooth' });
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
 * Step 1: Processes the initial image and point selection
 * Sends selected coordinates and image to server for processing
 */
async function processStep1() {
    try {
        const formData = new FormData();
        formData.append('staticMapUrl', document.getElementById('previewImage').src);
        formData.append('pointX', document.getElementById('pointX').value);
        formData.append('pointY', document.getElementById('pointY').value);
        formData.append('latitude', document.getElementById('step1-latitude').value);
        formData.append('longitude', document.getElementById('step1-longitude').value);

        document.getElementById('uploadStatus').textContent = 'Processing step 1...';
        const result = await fetch('/process_step1', {
            method: 'POST',
            body: formData
        }).then(response => response.text());
        
        if (result !== 'success') {
            throw new Error('Step 1 failed: ' + result);
        }
        
        updateStepImages(document.getElementById('processedImage'), 'step2_processed_image.jpg');
        document.getElementById('step2Status').textContent = 'Processing complete!';
        document.getElementById('step2Next').disabled = false;
        moveToNextStep('step2');
    } catch (error) {
        showErrorPopup('Step 1', error);
        document.getElementById('uploadStatus').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 2 FUNCTIONS =============

/**
 * Step 2: Creates green areas mask
 * Processes image to identify areas with similar green color
 */
async function processStep2() {
    try {
        const result = await fetch('/process_step2').then(response => response.text());
        if (result !== 'success') throw new Error('Step 2 failed');
        
        updateStepImages(document.getElementById('greenMaskImage'), 'step3_green_mask.jpg');
        document.getElementById('step3Status').textContent = 'Processing complete!';
        document.getElementById('step3Next').disabled = false;
        moveToNextStep('step3');
    } catch (error) {
        showErrorPopup('Step 2', error);
        document.getElementById('step2Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEPS 3 & 4 FUNCTIONS =============

/**
 * Steps 3 & 4: Processes pixel density and identifies main shape
 * Creates black mask and identifies the main field shape
 */
async function processStep3And4() {
    try {
        const formData = new FormData();
        formData.append('windowSize', '1');
        
        const step3Result = await fetch('/process_step3', {
            method: 'POST',
            body: formData
        }).then(response => response.text());
        if (step3Result !== 'success') throw new Error('Step 3 failed');
        
        const step4Result = await fetch('/process_step4').then(response => response.text());
        if (step4Result !== 'success') throw new Error('Step 4 failed');
        
        updateStepImages(document.getElementById('mainShapeImage'), 'step4_main_shape.jpg');
        document.getElementById('step4Status').textContent = 'Processing complete!';
        document.getElementById('step4Next').disabled = false;
        moveToNextStep('step4');
    } catch (error) {
        showErrorPopup('Steps 3 & 4', error);
        document.getElementById('step3Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 5 FUNCTIONS =============

/**
 * Step 5: Applies edge smoothing
 * Smooths the edges of the identified field shape
 */
async function processStep5() {
    try {
        const formData = new FormData();
        formData.append('epsilonFactor', '0.01');
        
        const result = await fetch('/process_step5', {
            method: 'POST',
            body: formData
        }).then(response => response.text());
        if (result !== 'success') throw new Error('Step 5 failed');
        
        document.getElementById('smoothedShapeImage').src = '/display/step5_smoothed_shape.jpg?' + new Date().getTime();
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
 * Step 6: Isolates the field area
 * Creates masked version showing only the identified field
 */
async function processStep6() {
    try {
        const result = await fetch('/process_step6').then(response => response.text());
        if (result !== 'success') throw new Error('Step 6 failed');
        
        updateStepImages(document.getElementById('maskedFieldImage'), 'step6_masked_field.jpg');
        document.getElementById('step6Status').textContent = 'Processing complete!';
        document.getElementById('step6Next').disabled = false;
        moveToNextStep('step6');
    } catch (error) {
        showErrorPopup('Step 6', error);
        document.getElementById('step5Status').textContent = 'Error: ' + error.message;
    }
}

// ============= STEP 7 FUNCTIONS =============

/**
 * Step 7: Generates final GeoJSON output
 * Creates downloadable GeoJSON file from field boundary
 */
async function processStep7() {
    try {
        const result = await fetch('/process_step7').then(response => response.text());
        if (result !== 'success') throw new Error('Step 7 failed');
        
        document.getElementById('finalImage').src = '/display/step7_final_with_boundary.jpg?' + new Date().getTime();
        document.getElementById('step7Status').textContent = 'Processing complete! GeoJSON boundary shown in cyan. Ready for download.';
        document.getElementById('downloadGeoJSON').disabled = false;
        moveToNextStep('step7');
    } catch (error) {
        showErrorPopup('Step 7', error);
        document.getElementById('step6Status').textContent = 'Error: ' + error.message;
    }
}

// ============= AUTOMATIC PROCESSING =============

/**
 * All Steps: Processes all steps automatically
 * Runs steps 1-7 in sequence when "Run All Steps" is clicked
 */
async function processAllSteps() {
    try {
        await processStep1();
        await processStep2();
        await processStep3And4();
        await processStep5();
        await processStep6();
        await processStep7();
        
        enableAllButtons();
        document.getElementById('step7').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        showErrorPopup('Automatic Processing', error);
        alert('Error during automatic processing: ' + error.message);
    }
}

/**
 * Generic step processor that handles all steps
 * @param {number} stepNumber - The step number to process
 */
async function processStep(stepNumber) {
    try {
        switch(stepNumber) {
            case 1:
                await processStep1();
                break;
            case 2:
                await processStep2();
                break;
            case 3:
                await processStep3And4();
                break;
            case 4:
                await processStep5();
                break;
            case 5:
                await processStep6();
                break;
            case 6:
                await processStep7();
                break;
            default:
                throw new Error(`Invalid step number: ${stepNumber}`);
        }
    } catch (error) {
        console.error(`Error in Step ${stepNumber}:`, error);
        const statusElement = document.getElementById(`step${stepNumber}Status`);
        if (statusElement) {
            statusElement.textContent = 'Error: ' + error.message;
        }
    }
}

// ============= EVENT LISTENERS =============

document.addEventListener('DOMContentLoaded', function() {
    // Check if elements exist
    const mapStep = document.getElementById('step0');
    
    // Set initial current step
    setCurrentStep('step0');

    // Add Enter key handler
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            // Find the current step's next button
            const currentStep = document.querySelector('.step-row.current');
            if (currentStep) {
                // Exclude both run-all-button and control-button classes
                const nextButton = currentStep.querySelector('.next-button:not(.run-all-button):not(.control-button)');
                if (nextButton && !nextButton.disabled) {
                    event.preventDefault(); // Prevent default Enter behavior
                    nextButton.click();
                }
            }
        }
    });

    // Image input handlers
    document.getElementById('imageInput').onchange = function(e) {
        handleImageInput.call(this, e);
    };
    document.getElementById('previewImage').onclick = handlePreviewImageClick;

    // Add coordinate input handlers
    const step1Lat = document.getElementById('step1-latitude');
    const step1Lng = document.getElementById('step1-longitude');
    if (step1Lat) step1Lat.oninput = handleCoordinateInput;
    if (step1Lng) step1Lng.oninput = handleCoordinateInput;

    // Window size controls
    document.getElementById('windowSize').oninput = function() {
        document.getElementById('windowSizeValue').textContent = this.value + 'px';
    };

    // Epsilon factor controls
    document.getElementById('epsilonFactor').oninput = function() {
        const value = parseFloat(this.value).toFixed(4);
        document.getElementById('epsilonValue').textContent = value;
    };

    // Apply window size button
    document.getElementById('applyWindowSize').onclick = async function() {
        try {
            const windowSize = document.getElementById('windowSize').value;
            document.getElementById('step4Status').textContent = 'Processing...';
            document.getElementById('step4Next').disabled = true;
            
            const formData = new FormData();
            formData.append('windowSize', windowSize);
            
            const step3Result = await fetch('/process_step3', {
                method: 'POST',
                body: formData
            }).then(response => response.text());
            
            if (step3Result !== 'success') {
                throw new Error('Step 3 failed');
            }
            
            const step4Result = await fetch('/process_step4').then(response => response.text());
            if (step4Result !== 'success') {
                throw new Error('Step 4 failed');
            }
            
            updateStepImages(document.getElementById('mainShapeImage'), 'step4_main_shape.jpg');
            document.getElementById('step4Status').textContent = `Processing complete! (Window size: ${windowSize}px)`;
            document.getElementById('step4Next').disabled = false;
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('step4Status').textContent = 'Error: ' + error.message;
        }
    };

    // Apply smoothing button
    document.getElementById('applySmoothing').onclick = async function() {
        try {
            const epsilonFactor = document.getElementById('epsilonFactor').value;
            document.getElementById('step5Status').textContent = 'Processing...';
            document.getElementById('step5Next').disabled = true;
            
            const formData = new FormData();
            formData.append('epsilonFactor', epsilonFactor);
            
            const result = await fetch('/process_step5', {
                method: 'POST',
                body: formData
            }).then(response => response.text());
            
            if (result !== 'success') {
                throw new Error('Step 5 failed');
            }
            
            updateStepImages(document.getElementById('smoothedShapeImage'), 'step5_smoothed_shape.jpg');
            document.getElementById('step5Status').textContent = `Processing complete! (Smoothing factor: ${parseFloat(epsilonFactor).toFixed(4)})`;
            document.getElementById('step5Next').disabled = false;
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('step5Status').textContent = 'Error: ' + error.message;
        }
    };
}); 