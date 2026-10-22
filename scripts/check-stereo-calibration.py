#!/usr/bin/env python3
"""Render synthetic ChArUco views and run the actual calibration utility.
No real-camera accuracy or mobile throughput is measured by this check.
"""
import base64
import importlib.util
import json
from pathlib import Path
import cv2
import numpy as np
spec = importlib.util.spec_from_file_location('calibrate', Path(__file__).with_name('calibrate-stereo.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
rng = np.random.default_rng(42)
image = module.board().generateImage((1000, 1400), marginSize=0)
k = np.array([[800., 0, 320], [0, 800., 240], [0, 0, 1]])
rotation = cv2.Rodrigues(np.array([0., .25, 0.]))[0]
translation = -rotation @ np.array([250., 0, 0])
source = np.array([[0, 0], [999, 0], [999, 1399], [0, 1399]], np.float32)
physical = np.array([[0., 0, 0], [125., 0, 0], [125., 175, 0], [0., 175, 0]])
pairs = []
for i in range(24):
    r = cv2.Rodrigues(rng.uniform([-.5, -.45, -.15], [.5, .45, .15]))[0]
    t = np.array([rng.uniform(-100, 40), rng.uniform(-150, -25), rng.uniform(440, 720)])
    views = {}
    for phone, side in enumerate(('desktop', 'phone')):
        rr, tt = (rotation @ r, rotation @ t + translation) if phone else (r, t)
        dest = cv2.projectPoints(physical, cv2.Rodrigues(rr)[0], tt, k, np.zeros(5))[0].reshape(-1, 2).astype(np.float32)
        rendered = cv2.warpPerspective(image, cv2.getPerspectiveTransform(source, dest), (640, 480), borderValue=255)
        jpeg = base64.b64encode(cv2.imencode('.jpg', rendered, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]).decode()
        views[side] = {'captureId': side, 'width': 640, 'height': 480, 'jpeg': 'data:image/jpeg;base64,' + jpeg}
    pairs.append({'id': str(i), **views})
result = module.calibrate({'schema': 'spatial-stereo-captures-v1', 'board': module.BOARD, 'pairs': pairs})
assert result['rms'] < 2, result['rms']
assert abs(result['quality']['baselineMm'] - 250) < 20, result['quality']
assert np.linalg.norm(np.array(result['R']).reshape(3, 3) - rotation) < .08
assert abs(result['K1'][0] - 800) < 100
report = {'passed': True, 'syntheticOnly': True, 'knownBaselineMm': 250, 'calibration': result}
Path('reports').mkdir(exist_ok=True)
Path('reports/calibration-synthetic-check.json').write_text(json.dumps(report, indent=2))
print(f"Synthetic image calibration passed: RMS {result['rms']:.3f} px, recovered baseline {result['quality']['baselineMm']:.2f} mm (known 250 mm)")
