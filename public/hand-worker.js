// Classic worker: MediaPipe's WASM loader uses importScripts.
importScripts('/vendor/mediapipe/vision_bundle.js');
let detector;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      const files = await Vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      detector = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath:'/models/hand_landmarker.task', delegate:'CPU'},
        runningMode:'VIDEO', numHands:2,
        minHandDetectionConfidence:.6, minHandPresenceConfidence:.6, minTrackingConfidence:.6,
      });
      self.postMessage({type:'ready'});
    } else if (data.type === 'frame') {
      try {
        const start = performance.now();
        const result = detector.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({type:'result',landmarks:result.landmarks,worldLandmarks:result.worldLandmarks,inferenceMs:performance.now()-start,timestamp:data.timestamp});
      } finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({type:'error',message:String(error)}); }
};
