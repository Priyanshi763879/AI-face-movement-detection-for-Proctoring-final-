const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status');
const beep = document.getElementById('beep');

let isBeeping = false; // To avoid continuous beeping
let videoStream = null; // Store the webcam stream
const VIDEO_WIDTH = canvas.width;
const VIDEO_HEIGHT = canvas.height;

// Object to store string counts for monitoring
let statusTextCounts = {};

// Start the webcam and draw to canvas
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoStream = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();

        // Stream the video directly to canvas
        const drawVideoToCanvas = () => {
            ctx.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        };

        setInterval(drawVideoToCanvas, 100); // 10 frames per second (adjust as needed)
        return video;
    } catch (err) {
        statusText.innerText = "Error: Unable to access webcam.";
        console.error(err);
    }
}

// Play a beep sound
function playBeep() {
    if (!isBeeping) {
        beep.play();
        isBeeping = true;
        setTimeout(() => (isBeeping = false), 1000); // 1-second cooldown
    }
}

// Calculate the distance between two points
function calculateDistance(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// Calculate Eye Aspect Ratio (EAR)
function calculateEAR(top, bottom, inner, outer) {
    const verticalDistance = calculateDistance(top, bottom);
    const horizontalDistance = calculateDistance(inner, outer);
    return verticalDistance / horizontalDistance;
}

// Detect blink or eyes closed
function detectBlinkOrEyesClosed(landmarks) {
    const EAR_THRESHOLD = 0.2; // Adjust based on testing

    const leftEye = {
        top: landmarks[159],
        bottom: landmarks[145],
        inner: landmarks[133],
        outer: landmarks[33],
    };
    const rightEye = {
        top: landmarks[386],
        bottom: landmarks[374],
        inner: landmarks[362],
        outer: landmarks[263],
    };

    const leftEAR = calculateEAR(leftEye.top, leftEye.bottom, leftEye.inner, leftEye.outer);
    const rightEAR = calculateEAR(rightEye.top, rightEye.bottom, rightEye.inner, rightEye.outer);
    const averageEAR = (leftEAR + rightEAR) / 2;

    if (averageEAR < EAR_THRESHOLD) {
        statusText.innerText = "Blink or Eyes Closed!";
    }
}

// Detect gaze direction based on landmarks
function detectGaze(landmarks) {
    if (!landmarks || landmarks.length === 0) {
        statusText.innerText = "Error: Eyes not detected!";
        return;
    }

    const leftEyeInnerCorner = landmarks[133];
    const rightEyeInnerCorner = landmarks[362];
    const noseTip = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const faceWidth = rightCheek.x - leftCheek.x;
    const faceHeight = chin.y - forehead.y;

    const leftEyeToNoseX = (leftEyeInnerCorner.x - noseTip.x) / faceWidth;
    const rightEyeToNoseX = (rightEyeInnerCorner.x - noseTip.x) / faceWidth;
    const leftEyeToNoseY = (leftEyeInnerCorner.y - noseTip.y) / faceHeight;
    const rightEyeToNoseY = (rightEyeInnerCorner.y - noseTip.y) / faceHeight;

    const thresholdLeft = -0.08;
    const thresholdRight = 0.08;
    const thresholdTop = -0.15;
    const thresholdBottom = -0.33;

    if (leftEyeToNoseX < thresholdLeft && rightEyeToNoseX < thresholdLeft) {
        statusText.innerText = "Looking Left!";
    } else if (leftEyeToNoseX > thresholdRight && rightEyeToNoseX > thresholdRight) {
        statusText.innerText = "Looking Right!";
    } else if (leftEyeToNoseY > thresholdTop && rightEyeToNoseY > thresholdTop) {
        statusText.innerText = "Looking Top!";
    } else if (leftEyeToNoseY < thresholdBottom && rightEyeToNoseY < thresholdBottom) {
        statusText.innerText = "Looking Bottom!";
    } else {
        statusText.innerText = "Looking Straight!";
    }
}

// Process and draw the eye pupils
function processEyes(landmarks) {
    const leftEyeLandmarks = [468, 469, 470, 471, 472];
    const rightEyeLandmarks = [473, 474, 475, 476, 477];

    drawIris(landmarks, leftEyeLandmarks, 'black');
    drawIris(landmarks, rightEyeLandmarks, 'black');
}

function drawIris(landmarks, indexes, color) {
    for (let i = 0; i < indexes.length; i++) {
        const x = landmarks[indexes[i]].x * VIDEO_WIDTH;
        const y = landmarks[indexes[i]].y * VIDEO_HEIGHT;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
    }
}

// Collect and count statusText.innerText
function collectStatusText() {
    const statusString = statusText.innerText;

    if (statusString in statusTextCounts) {
        statusTextCounts[statusString]++;
    } else {
        statusTextCounts[statusString] = 1;
    }
}

// Process the most frequent statusText
function processMostFrequentStatus() {
    let mostFrequentString = "";
    let maxCount = 0;

    for (const [key, value] of Object.entries(statusTextCounts)) {
        if (value > maxCount) {
            mostFrequentString = key;
            maxCount = value;
        }
    }

    console.log(`AI update last 4 seconds: "${mostFrequentString}" (${maxCount} times)`);
    if (
        mostFrequentString === "Looking Left!" ||
        mostFrequentString === "Looking Right!" ||
        mostFrequentString === "Looking Top!" ||
        mostFrequentString === "Looking Bottom!" ||
        mostFrequentString === "Blink or Eyes Closed!" ||
        mostFrequentString === "Status: No face detected!" ||
        mostFrequentString === "Multiple faces detected!"
    ) {
        playBeep();
    }
    statusTextCounts = {};
}

// Start monitoring statusText
function startMonitoring() {
    setInterval(collectStatusText, 100);
    setInterval(processMostFrequentStatus, 4000);
}

// Initialize the face mesh model
async function main() {
    const video = await startWebcam();

    if (!video) return;

    const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
        maxNumFaces: 3, // Allow detection of multiple faces
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
        ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

        const numFaces = results.multiFaceLandmarks.length;
        if (numFaces > 1) {
            statusText.innerText = "Multiple faces detected!";
            playBeep();
        } else if (numFaces === 1) {
            const landmarks = results.multiFaceLandmarks[0];

            ctx.fillStyle = "red";
            for (const landmark of landmarks) {
                const x = landmark.x * VIDEO_WIDTH;
                const y = landmark.y * VIDEO_HEIGHT;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            processEyes(landmarks);
            detectGaze(landmarks);
            detectBlinkOrEyesClosed(landmarks);
        } else {
            statusText.innerText = "Status: No face detected!";
        }
    });

    const sendFrameToModel = async () => {
        await faceMesh.send({ image: canvas });
    };

    setInterval(sendFrameToModel, 100); // 10 FPS
    startMonitoring(); // Start the monitoring process
}

main();
