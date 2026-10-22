#!/usr/bin/env python3
"""Calibrate the current Tracking lab camera sessions from explicit paired captures.
Setup: python -m venv .venv-tracking
       .venv-tracking/bin/pip install -r scripts/tracking-requirements.txt
Run:   .venv-tracking/bin/python scripts/calibrate-stereo.py captures.json --output calibration.json
Print target at 100%; verify 25 mm squares. Keep the two cameras fixed.
"""
import argparse
import base64
import json
from pathlib import Path
import cv2
import numpy as np

BOARD = {'squaresX': 5, 'squaresY': 7, 'squareMm': 25, 'markerMm': 18, 'dictionary': 'DICT_4X4_50'}

def board():
    return cv2.aruco.CharucoBoard((5, 7), 25., 18., cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50))

def write_board(path):
    image = board().generateImage((1500, 2100), marginSize=0, borderBits=1)
    data = base64.b64encode(cv2.imencode('.png', image)[1]).decode()
    Path(path).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="125mm" height="175mm" viewBox="0 0 1500 2100"><title>ChArUco target: 5 × 7 squares, each 25 mm; print at 100%</title><image width="1500" height="2100" href="data:image/png;base64,{data}"/></svg>')

def identity(view):
    result = {key: view[key] for key in ('captureId', 'width', 'height')}
    if not isinstance(result['captureId'], str) or not 1 <= len(result['captureId']) <= 80:
        raise ValueError('Invalid camera session identity')
    if any(not isinstance(result[k], int) or not 160 <= result[k] <= 4096 for k in ('width', 'height')):
        raise ValueError('Invalid camera dimensions')
    return result

def decode(view):
    data = view['jpeg']
    if not isinstance(data, str) or not data.startswith('data:image/jpeg;base64,') or len(data) > 110000:
        raise ValueError('Invalid or oversized JPEG')
    image = cv2.imdecode(np.frombuffer(base64.b64decode(data.split(',', 1)[1], validate=True), np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None or image.shape[::-1] != (view['width'], view['height']):
        raise ValueError('Photo dimensions do not match capture metadata')
    return image

def calibrate(data):
    if data.get('schema') != 'spatial-stereo-captures-v1' or data.get('board') != BOARD:
        raise ValueError('Unsupported capture schema or target dimensions')
    pairs = data.get('pairs', [])
    if not 12 <= len(pairs) <= 24:
        raise ValueError('Capture 12–24 stationary target pairs with varied position, depth and tilt')
    first = pairs[0]
    ids = [identity(first[side]) for side in ('desktop', 'phone')]
    detector = cv2.aruco.CharucoDetector(board())
    objects, left, right, used, rejected, centers = [], [], [], [], [], []
    corners3d = board().getChessboardCorners()
    for i, pair in enumerate(pairs):
        found = []
        for index, side in enumerate(('desktop', 'phone')):
            if identity(pair[side]) != ids[index]:
                raise ValueError('A camera restarted or changed dimensions. Capture a fresh set')
            image = decode(pair[side])
            corners, corner_ids, _, _ = detector.detectBoard(image)
            found.append({int(k): p.reshape(2) for k, p in zip(corner_ids.flatten(), corners)} if corner_ids is not None else {})
        common = sorted(set(found[0]) & set(found[1]))
        if len(common) < 12:
            rejected.append(i + 1)
            continue
        objects.append(np.array([corners3d[k] for k in common], np.float32))
        left.append(np.array([found[0][k] for k in common], np.float32).reshape(-1, 1, 2))
        right.append(np.array([found[1][k] for k in common], np.float32).reshape(-1, 1, 2))
        centers.append(left[-1].mean(axis=0).flatten())
        used.append(i + 1)
    if len(used) < 10:
        raise ValueError(f'Only {len(used)} pairs have 12+ shared target corners. Need at least 10 usable pairs; rejected {rejected}')
    if np.linalg.norm(np.std(centers, axis=0)) < 15:
        raise ValueError('Target positions barely vary. Cover more of the image and vary target tilt/depth')
    sizes = [(v['width'], v['height']) for v in ids]
    flags = cv2.CALIB_FIX_K3
    rms1, k1, d1, rv1, _ = cv2.calibrateCamera(objects, left, sizes[0], None, None, flags=flags)
    rms2, k2, d2, _, _ = cv2.calibrateCamera(objects, right, sizes[1], None, None, flags=flags)
    normals = np.array([cv2.Rodrigues(r)[0][:, 2] for r in rv1])
    if np.linalg.norm(np.std(normals, axis=0)) < .05:
        raise ValueError('Target tilt barely varies. Recapture several distinctly tilted target poses')
    rms, k1, d1, k2, d2, rotation, translation, _, _ = cv2.stereoCalibrate(objects, left, right, k1, d1, k2, d2, sizes[0], flags=cv2.CALIB_FIX_INTRINSIC)
    baseline = float(np.linalg.norm(translation))
    if not np.isfinite([rms, rms1, rms2, baseline]).all() or max(rms, rms1, rms2) > 3 or not 30 <= baseline <= 1500:
        raise ValueError(f'Calibration rejected: RMS {rms:.2f} px, baseline {baseline:.1f} mm. Check target scale, stationary poses and fixed cameras')
    return {'schema': 'spatial-stereo-v1', 'units': 'mm', 'desktop': ids[0], 'phone': ids[1],
            'K1': k1.flatten().tolist(), 'K2': k2.flatten().tolist(), 'D1': d1.flatten()[:5].tolist(), 'D2': d2.flatten()[:5].tolist(),
            'R': rotation.flatten().tolist(), 'T': translation.flatten().tolist(), 'rms': rms,
            'quality': {'desktopRmsPx': rms1, 'phoneRmsPx': rms2, 'baselineMm': baseline, 'usedPairs': used, 'rejectedPairs': rejected},
            'convention': 'X_phone = R * X_desktop + T; unmirrored image pixels; Brown-Conrady k1,k2,p1,p2,k3',
            'limitations': 'Reprojection fit is not independent metric accuracy. Camera sessions and positions must remain unchanged. Capture pairs require a stationary target.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', nargs='?')
    parser.add_argument('--output', default='calibration.json')
    parser.add_argument('--board', help='Write the dimensioned printable SVG target')
    args = parser.parse_args()
    if args.board:
        write_board(args.board)
    if args.captures:
        source = Path(args.captures)
        if source.stat().st_size > 6_000_000:
            raise ValueError('Capture file exceeds 6 MB')
        result = calibrate(json.loads(source.read_text()))
        Path(args.output).write_text(json.dumps(result, indent=2))
        print(f"Saved {args.output}: RMS {result['rms']:.2f} px, baseline {result['quality']['baselineMm']:.1f} mm; {len(result['quality']['usedPairs'])} usable pairs")
    elif not args.board:
        parser.error('Provide captures.json or --board target.svg')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, cv2.error) as exc:
        raise SystemExit(str(exc))
