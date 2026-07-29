import cv2
import json
import os

# ---- EDIT THESE FOR EACH GARMENT ----
garment_name = 'dress1'
front_photo = 'input/dress1_front.jpeg'
back_photo = 'input/dress1_back.jpeg'
front_alpha = 'output/alpha/dress1_front_3.png'
back_alpha = 'output/alpha/dress1_back_3.png'
# --------------------------------------

os.makedirs(f'garments/{garment_name}', exist_ok=True)

def process_view(photo_path, alpha_path, label):
    original = cv2.imread(photo_path)
    alpha_mask = cv2.imread(alpha_path, cv2.IMREAD_GRAYSCALE)

    if alpha_mask.shape[:2] != original.shape[:2]:
        alpha_mask = cv2.resize(alpha_mask, (original.shape[1], original.shape[0]))

    # composite cutout
    b, g, r = cv2.split(original)
    rgba = cv2.merge([b, g, r, alpha_mask])
    cv2.imwrite(f'garments/{garment_name}/{label}_cutout.png', rgba)

    # clean mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    cleaned_mask = cv2.morphologyEx(alpha_mask, cv2.MORPH_OPEN, kernel)

    # extract outline
    contours, _ = cv2.findContours(cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    largest = max(contours, key=cv2.contourArea)
    outline = cv2.approxPolyDP(largest, epsilon=0.005 * cv2.arcLength(largest, True), closed=True)

    # debug visual
    debug = original.copy()
    cv2.drawContours(debug, [largest], -1, (0, 0, 255), 3)
    cv2.imwrite(f'garments/{garment_name}/{label}_debug.png', debug)

    # save outline points
    points = outline.reshape(-1, 2).tolist()
    with open(f'garments/{garment_name}/{label}_outline.json', 'w') as f:
        json.dump(points, f)

    print(f"{label}: done")

process_view(front_photo, front_alpha, 'front')
process_view(back_photo, back_alpha, 'back')

print(f"All done. Check garments/{garment_name}/")