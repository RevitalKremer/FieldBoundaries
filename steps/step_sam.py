import cv2
import numpy as np
import json


def process_step_sam():
    """Run SAM2 segmentation using the selected point from circle_data.json"""
    try:
        # Load point + map metadata saved by step2
        with open('circle_data.json', 'r') as f:
            circle_data = json.load(f)

        point_x = circle_data['cX']
        point_y = circle_data['cY']

        import torch
        from PIL import Image
        from transformers import Sam2Processor, Sam2Model

        image_path = 'images/uploaded_image.jpg'
        pil_image = Image.open(image_path).convert('RGB')

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[SAM2] Using device: {device}")

        processor = Sam2Processor.from_pretrained("facebook/sam2-hiera-large")
        model = Sam2Model.from_pretrained("facebook/sam2-hiera-large").to(device)
        model.eval()

        # Run inference with point prompt
        # SAM2 expects input_points as [[[x, y]]] (batch x points x coords)
        inputs = processor(
            images=pil_image,
            input_points=[[[[point_x, point_y]]]],
            input_labels=[[[1]]],   # 1 = foreground
            return_tensors="pt"
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        # outputs.pred_masks: [batch, num_objects, num_masks, H, W]
        # Squeeze batch and object dims → [num_masks, H, W]
        pred_masks = outputs.pred_masks[0, 0]   # shape: [num_masks, h, w]
        scores = outputs.iou_scores[0, 0]        # shape: [num_masks]

        if pred_masks.shape[0] == 0:
            return 'SAM2 found no segments for the selected point'

        # Pick mask with highest IoU score and resize to original image size
        best_idx = int(scores.argmax())
        best_mask = pred_masks[best_idx].numpy()  # values in [0,1] or logits
        best_mask = (best_mask > 0).astype(np.uint8) * 255
        mask = cv2.resize(best_mask, (pil_image.width, pil_image.height),
                          interpolation=cv2.INTER_NEAREST)

        # Save visual result (cyan overlay on original image)
        cv_image = cv2.imread(image_path)
        overlay = cv_image.copy()
        overlay[mask > 0] = [0, 200, 200]
        result_img = cv2.addWeighted(cv_image, 0.6, overlay, 0.4, 0)
        cv2.imwrite('images/sam_result.jpg', result_img)

        # Extract contour and save pixel-coordinate GeoJSON (step9 converts to geo)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 'No contour found in SAM2 mask'

        main_contour = max(contours, key=cv2.contourArea)
        epsilon = 0.001 * cv2.arcLength(main_contour, True)
        simplified = cv2.approxPolyDP(main_contour, epsilon, True)

        coordinates = simplified.reshape(-1, 2).tolist()
        coordinates.append(coordinates[0])   # close the polygon

        geojson_data = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                "properties": {}
            }]
        }

        with open('images/field_boundary.geojson', 'w') as f:
            json.dump(geojson_data, f)

        print(f"[SAM2] Segmentation done. Contour points: {len(coordinates)}")
        return 'success'

    except Exception as e:
        print(f"[SAM2] Error: {str(e)}")
        return str(e)
