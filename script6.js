let map;
let baseLayer;  // current map style layer
let radarOverlayLayers = [];  // layers keyed by frameIndex
let cloudOverlayLayers = [];
let currentFrame = 0;
let playInterval;

let radarFrames = [];
let satelliteFrames = [];
let apiHost = '';

let rainOpacity = 1;
let cloudOpacity = 1;

// Options for RainViewer color schemes etc
let optionColorScheme = 2;  // default Universal Blue
let optionSmoothData = 1;
let optionSnowColors = 1;
let optionExtension = 'webp';

// Mapping from friendly name to scheme ID
const radarColorSchemes = {
    universal_blue: 2,
    original: 1,
    titan: 3,
    weatherchannel: 4,
    meteored: 5,
    nexrad: 6,
    rainbow: 7, 
    darksky: 8,
    raw: 0  // raw dBZ values / black & white
};

// Map base styles (real tile servers)
const mapStyles = {
    geographic: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors'
    },
    streetmap: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors'
    },
    satellite: {
        // for real satellite, you might need a map provider that serves satellite tiles
        // here's an example from Esri world imagery
        url: 'https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri'
    },
    cyclosm: {
        url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        attribution: '&copy; Cyclosm & OpenStreetMap contributors'
    },
    tracestrack: {
        url: 'https://tile.tracestrack.org/{z}/{x}/{y}.png',
        attribution: '&copy; TracesTrack'
    }
};


async function fetchRainViewerData() {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();
    apiHost = data.host;
    radarFrames = [...(data.radar?.past || []), ...(data.radar?.nowcast || [])];
    satelliteFrames = data.satellite?.infrared || [];
    // after fetching, load the first frame
    addOverlays(currentFrame);
}

function buildRadarTileUrl(frame) {
    // frame.path includes the RainViewer path e.g. "/v2/radar/..."
    return `${apiHost}${frame.path}/${256}/{z}/{x}/{y}/${optionColorScheme}/${optionSmoothData}_${optionSnowColors}.${optionExtension}`;
}

function buildSatelliteTileUrl(frame) {
    // Satellites only use color scheme 0 and extension png, smooth=0 etc per docs
    return `${apiHost}${frame.path}/${256}/{z}/{x}/{y}/0/0_0.${optionExtension}`;
}

function addOverlays(frameIndex) {
    if (!radarFrames[frameIndex]) return;
    if (!satelliteFrames[frameIndex]) return;

    // Add radar overlay
    if (!radarOverlayLayers[frameIndex]) {
        const layer = L.tileLayer(buildRadarTileUrl(radarFrames[frameIndex]), {
            opacity: rainOpacity
        });
        radarOverlayLayers[frameIndex] = layer;
    }
    map.addLayer(radarOverlayLayers[frameIndex]);

    // Add satellite overlay
    if (!cloudOverlayLayers[frameIndex]) {
        const layer = L.tileLayer(buildSatelliteTileUrl(satelliteFrames[frameIndex]), {
            opacity: cloudOpacity
        });
        cloudOverlayLayers[frameIndex] = layer;
    }
    map.addLayer(cloudOverlayLayers[frameIndex]);
}

function removeOverlays(frameIndex) {
    if (radarOverlayLayers[frameIndex] && map.hasLayer(radarOverlayLayers[frameIndex])) {
        map.removeLayer(radarOverlayLayers[frameIndex]);
    }
    if (cloudOverlayLayers[frameIndex] && map.hasLayer(cloudOverlayLayers[frameIndex])) {
        map.removeLayer(cloudOverlayLayers[frameIndex]);
    }
}

function showFrame(index) {
    removeOverlays(currentFrame);
    currentFrame = index;
    addOverlays(currentFrame);
}

function nextFrame() {
    const max = Math.min(radarFrames.length, satelliteFrames.length);
    showFrame( (currentFrame + 1) % max );
}

function prevFrame() {
    const max = Math.min(radarFrames.length, satelliteFrames.length);
    showFrame( (currentFrame - 1 + max) % max );
}

function playToggle() {
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    } else {
        playInterval = setInterval(nextFrame, 700);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    map = L.map('map').setView([24.7136, 46.6753], 6);

    // Initial base layer
    const defaultStyleKey = 'geographic';
    baseLayer = L.tileLayer(mapStyles[defaultStyleKey].url, {
        attribution: mapStyles[defaultStyleKey].attribution
    }).addTo(map);

    fetchRainViewerData();

    // UI elements
    const playBtn = document.getElementById('play');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const opacityRainInput = document.getElementById('opacityRain');
    const opacityCloudInput = document.getElementById('opacityCloud');
    const radarStyleSelect = document.getElementById('radarStyle');
    const mapStyleSelect = document.getElementById('mapStyle');

    if (playBtn) playBtn.onclick = playToggle;
    if (prevBtn) prevBtn.onclick = prevFrame;
    if (nextBtn) nextBtn.onclick = nextFrame;

    if (opacityRainInput) {
        opacityRainInput.oninput = (e) => {
            rainOpacity = parseFloat(e.target.value);
            radarOverlayLayers.forEach(layer => {
                if (layer) layer.setOpacity(rainOpacity);
            });
        };
    }
    if (opacityCloudInput) {
        opacityCloudInput.oninput = (e) => {
            cloudOpacity = parseFloat(e.target.value);
            cloudOverlayLayers.forEach(layer => {
                if (layer) layer.setOpacity(cloudOpacity);
            });
        };
    }

    if (radarStyleSelect) {
        radarStyleSelect.onchange = (e) => {
            const sel = e.target.value;
            // find matching scheme ID
            if (radarColorSchemes.hasOwnProperty(sel)) {
                optionColorScheme = radarColorSchemes[sel];
                // After changing scheme, we need to redraw the current overlay
                removeOverlays(currentFrame);
                // Clear cached layers for radar overlays so it uses new scheme
                radarOverlayLayers = [];
                // Add overlays again
                addOverlays(currentFrame);
            }
        };
    }

    if (mapStyleSelect) {
        mapStyleSelect.onchange = (e) => {
            const sel = e.target.value;
            if (mapStyles.hasOwnProperty(sel)) {
                // remove old base layer
                if (baseLayer) {
                    map.removeLayer(baseLayer);
                }
                // add new base layer
                baseLayer = L.tileLayer(mapStyles[sel].url, {
                    attribution: mapStyles[sel].attribution
                }).addTo(map);
                // re-add current overlay layers so overlays remain
                addOverlays(currentFrame);
            }
        };
    }
});
