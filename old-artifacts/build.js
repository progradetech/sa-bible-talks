#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

// Default password - change this before deploying
const PASSWORD = process.argv[2] || 'bibletalk2024';

// San Antonio center
const SA_CENTER = { lat: 29.4241, lng: -98.4936 };

// Parse CSV
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || '').trim());
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

// Geocode using Nominatim (free, no API key)
function nominatimSearch(query) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`;
    https.get(url, { headers: { 'User-Agent': 'ChurchBibleTalksMap/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results.length > 0) {
            resolve({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function geocode(address) {
  // Try full address first
  let result = await nominatimSearch(address);
  if (result) return result;

  // Try structured: strip unit/suite numbers, simplify
  await new Promise(r => setTimeout(r, 1100));
  const simplified = address.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  result = await nominatimSearch(simplified);
  if (result) return result;

  // Try just zip code + city for a neighborhood-level result
  const zip = address.match(/\b(78\d{3})\b/);
  if (zip) {
    await new Promise(r => setTimeout(r, 1100));
    result = await nominatimSearch(`${zip[1]}, TX`);
    if (result) return result;
  }

  return null;
}

// Fallback coordinates by zip code
const ZIP_COORDS = {
  '78023': { lat: 29.578, lng: -98.687 },
  '78249': { lat: 29.560, lng: -98.614 },
  '78260': { lat: 29.623, lng: -98.488 },
  '78258': { lat: 29.622, lng: -98.489 },
  '78261': { lat: 29.652, lng: -98.463 },
  '78209': { lat: 29.476, lng: -98.457 },
  '78250': { lat: 29.510, lng: -98.612 },
  '78253': { lat: 29.520, lng: -98.680 },
  '78266': { lat: 29.661, lng: -98.440 },
  '78254': { lat: 29.540, lng: -98.660 },
  '78251': { lat: 29.460, lng: -98.650 },
  '78223': { lat: 29.370, lng: -98.430 },
  '78218': { lat: 29.540, lng: -98.400 },
  '78213': { lat: 29.520, lng: -98.520 },
  '78006': { lat: 29.790, lng: -98.730 },
  '78227': { lat: 29.380, lng: -98.570 },
  '78221': { lat: 29.350, lng: -98.520 },
  '78232': { lat: 29.600, lng: -98.470 },
  '78255': { lat: 29.590, lng: -98.650 },
};

function extractZip(address) {
  const match = address.match(/\b(78\d{3})\b/);
  if (match) return match[1];
  // Check for known area names without zip
  if (/helotes/i.test(address)) return '78023';
  if (/boerne/i.test(address)) return '78006';
  return null;
}

// Jitter coordinates for public view (~7 mile radius = ~0.1 degrees)
function jitterCoords(lat, lng) {
  const angle = Math.random() * 2 * Math.PI;
  const radius = Math.random() * 0.02; // ~1.4 miles random offset
  return {
    lat: lat + radius * Math.cos(angle),
    lng: lng + radius * Math.sin(angle)
  };
}

// AES-256-GCM encryption compatible with Web Crypto API
async function encryptData(data, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: salt(16) + iv(12) + authTag(16) + ciphertext
  const packed = Buffer.concat([salt, iv, authTag, encrypted]);
  return packed.toString('base64');
}

// Ministry color mapping
const MINISTRY_COLORS = {
  'Family': '#2196F3',
  'YoPro': '#FF9800',
  'Campus': '#9C27B0',
  'Singles': '#E91E63',
  'Spanish': '#4CAF50'
};

async function main() {
  console.log('Reading CSV...');
  const records = parseCSV('ChurchBibleTalks.csv');
  console.log(`Found ${records.length} records`);

  console.log('Geocoding addresses (with 1s delay between requests for Nominatim rate limits)...');

  const locations = [];
  for (const record of records) {
    const address = record.Address;
    let coords = null;

    // Use manual Lat,Lng override if present
    if (record.Lat && record.Lng) {
      coords = { lat: parseFloat(record.Lat), lng: parseFloat(record.Lng) };
      console.log(`  ★ ${record.Name}: using manual coords ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    }

    // Try Nominatim if no manual override
    if (!coords) coords = await geocode(address);
    if (coords && !record.Lat) {
      console.log(`  ✓ ${record.Name}: geocoded to ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else if (!coords) {
      // Fallback to zip code
      const zip = extractZip(address);
      if (zip && ZIP_COORDS[zip]) {
        coords = { ...ZIP_COORDS[zip] };
        // Add small random offset so same-zip entries don't stack
        coords.lat += (Math.random() - 0.5) * 0.01;
        coords.lng += (Math.random() - 0.5) * 0.01;
        console.log(`  ~ ${record.Name}: used zip ${zip} fallback`);
      } else {
        // Last resort: SA center with offset
        coords = { lat: SA_CENTER.lat + (Math.random() - 0.5) * 0.1, lng: SA_CENTER.lng + (Math.random() - 0.5) * 0.1 };
        console.log(`  ✗ ${record.Name}: used SA center fallback`);
      }
    }

    locations.push({
      name: record.Name,
      address: record.Address,
      email: record.Email || '',
      phone: record.Phone || '',
      ministry: record.Ministry || 'Family',
      notes: record.Notes || '',
      lat: coords.lat,
      lng: coords.lng
    });

    // Rate limit for Nominatim (1 request/second)
    await new Promise(r => setTimeout(r, 1100));
  }

  // Generate public data (jittered, no PII)
  const publicData = locations.map(loc => ({
    ministry: loc.ministry,
    notes: loc.notes.replace(/[A-Z][a-z]+\/[A-Z][a-z]+/g, '').trim(), // Remove name references from notes
    ...jitterCoords(loc.lat, loc.lng)
  }));

  // Generate private data (exact coords + PII)
  const privateData = locations.map(loc => ({
    name: loc.name,
    address: loc.address,
    email: loc.email,
    phone: loc.phone,
    ministry: loc.ministry,
    notes: loc.notes,
    lat: loc.lat,
    lng: loc.lng
  }));

  console.log('Encrypting private data...');
  const encryptedData = await encryptData(privateData, PASSWORD);

  console.log('Generating index.html...');
  const html = generateHTML(publicData, encryptedData);
  fs.writeFileSync('index.html', html);
  console.log(`Done! Password is: ${PASSWORD}`);
  console.log('Open index.html or run: npx serve .');
}

function generateHTML(publicData, encryptedData) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>San Antonio Bible Talks & Small Groups</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #map { width: 100%; height: 100vh; }

    .header {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: white;
      padding: 10px 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 95vw;
    }

    .header h1 {
      font-size: 16px;
      white-space: nowrap;
    }

    .lock-btn {
      background: none;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .lock-btn:hover { background: #f5f5f5; }
    .lock-btn.unlocked { border-color: #4CAF50; color: #4CAF50; }

    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 2000;
      justify-content: center;
      align-items: center;
    }

    .modal-overlay.active { display: flex; }

    .modal {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      max-width: 360px;
      width: 90vw;
    }

    .modal h2 { font-size: 18px; margin-bottom: 12px; }
    .modal p { font-size: 14px; color: #666; margin-bottom: 16px; }

    .modal input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 16px;
      margin-bottom: 12px;
    }

    .modal input:focus { outline: none; border-color: #2196F3; }

    .modal-buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }

    .btn-primary { background: #2196F3; color: white; }
    .btn-primary:hover { background: #1976D2; }
    .btn-secondary { background: #e0e0e0; }
    .btn-secondary:hover { background: #ccc; }

    .error-msg { color: #f44336; font-size: 13px; display: none; margin-bottom: 8px; }

    .legend {
      position: absolute;
      bottom: 20px;
      left: 10px;
      z-index: 1000;
      background: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-size: 13px;
    }

    .legend h3 { font-size: 14px; margin-bottom: 8px; }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      cursor: pointer;
      user-select: none;
      padding: 2px 4px;
      border-radius: 4px;
      transition: opacity 0.2s;
    }

    .legend-item:hover { background: #f0f0f0; }
    .legend-item.disabled { opacity: 0.35; text-decoration: line-through; }

    .legend-color {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 2px rgba(0,0,0,0.3);
    }

    .leaflet-popup-content { font-size: 14px; line-height: 1.5; }
    .popup-name { font-weight: bold; font-size: 15px; }
    .popup-ministry { color: #666; font-size: 13px; }
    .popup-detail { margin-top: 4px; }
    .popup-detail a { color: #2196F3; text-decoration: none; }
    .popup-detail a:hover { text-decoration: underline; }

    @media (max-width: 600px) {
      .header { flex-direction: column; gap: 6px; padding: 8px 14px; }
      .header h1 { font-size: 14px; }
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <div class="header">
    <h1>SA Bible Talks & Small Groups</h1>
    <button class="lock-btn" id="lockBtn" onclick="toggleAuth()">
      <span id="lockIcon">&#128274;</span>
      <span id="lockText">Leader Login</span>
    </button>
  </div>

  <div class="legend" id="legend">
    <h3>Ministry</h3>
    <div class="legend-item" data-ministry="Family" onclick="toggleFilter(this)"><div class="legend-color" style="background:#2196F3"></div> Family</div>
    <div class="legend-item" data-ministry="YoPro" onclick="toggleFilter(this)"><div class="legend-color" style="background:#FF9800"></div> YoPro</div>
    <div class="legend-item" data-ministry="Campus" onclick="toggleFilter(this)"><div class="legend-color" style="background:#9C27B0"></div> Campus</div>
    <div class="legend-item" data-ministry="Singles" onclick="toggleFilter(this)"><div class="legend-color" style="background:#E91E63"></div> Singles</div>
    <div class="legend-item" data-ministry="Spanish" onclick="toggleFilter(this)"><div class="legend-color" style="background:#4CAF50"></div> Spanish</div>
    <div id="legendMode" style="margin-top:8px;font-size:12px;color:#999;">Showing approximate areas</div>
  </div>

  <div class="modal-overlay" id="modalOverlay">
    <div class="modal">
      <h2>Leader Access</h2>
      <p>Enter the password to view exact locations and contact details.</p>
      <input type="password" id="passwordInput" placeholder="Password" onkeydown="if(event.key==='Enter')attemptUnlock()" />
      <div class="error-msg" id="errorMsg">Incorrect password. Please try again.</div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="attemptUnlock()">Unlock</button>
      </div>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // San Antonio center
    const SA_CENTER = [29.4241, -98.4936];
    const FIFTY_MILES_M = 80467; // 50 miles in meters
    const CIRCLE_RADIUS_M = 2414; // 1.5 miles in meters

    const MINISTRY_COLORS = {
      'Family': '#2196F3',
      'YoPro': '#FF9800',
      'Campus': '#9C27B0',
      'Singles': '#E91E63',
      'Spanish': '#4CAF50'
    };

    // Public data (jittered coordinates, no PII)
    const publicData = ${JSON.stringify(publicData)};

    // Encrypted private data
    const encryptedBlob = '${encryptedData}';

    // State
    let isAuthenticated = false;
    let privateData = null;
    let mapLayers = []; // { layer, ministry }
    const hiddenMinistries = new Set();

    // Initialize map
    const map = L.map('map', { zoomControl: true }).setView(SA_CENTER, 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(map);

    // Draw 50-mile radius boundary
    L.circle(SA_CENTER, {
      radius: FIFTY_MILES_M,
      color: '#666',
      weight: 1,
      dashArray: '5,5',
      fillColor: 'transparent',
      fillOpacity: 0
    }).addTo(map);

    // Render public view
    function renderPublicView() {
      clearLayers();
      publicData.forEach(item => {
        const color = MINISTRY_COLORS[item.ministry] || '#999';
        const circle = L.circle([item.lat, item.lng], {
          radius: CIRCLE_RADIUS_M,
          color: color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.12,
          interactive: true
        });

        if (!hiddenMinistries.has(item.ministry)) circle.addTo(map);

        circle.bindPopup(
          '<div class="popup-ministry">' + item.ministry + ' Ministry</div>' +
          '<div style="font-size:12px;color:#999;margin-top:4px;">Approximate area</div>'
        );

        mapLayers.push({ layer: circle, ministry: item.ministry });
      });
      document.getElementById('legendMode').textContent = 'Showing approximate areas';
    }

    // Render private (authenticated) view
    function renderPrivateView() {
      clearLayers();
      privateData.forEach(item => {
        const color = MINISTRY_COLORS[item.ministry] || '#999';

        const marker = L.circleMarker([item.lat, item.lng], {
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9
        });

        if (!hiddenMinistries.has(item.ministry)) marker.addTo(map);

        let popupHTML = '<div class="popup-name">' + escapeHTML(item.name) + '</div>';
        popupHTML += '<div class="popup-ministry">' + escapeHTML(item.ministry) + ' Ministry</div>';
        if (item.phone) {
          popupHTML += '<div class="popup-detail">&#128222; <a href="tel:' + escapeHTML(item.phone) + '">' + escapeHTML(item.phone) + '</a></div>';
        }
        if (item.email) {
          popupHTML += '<div class="popup-detail">&#9993; <a href="mailto:' + escapeHTML(item.email) + '">' + escapeHTML(item.email) + '</a></div>';
        }
        popupHTML += '<div class="popup-detail" style="font-size:12px;color:#666;margin-top:4px;">' + escapeHTML(item.address) + '</div>';
        if (item.notes) {
          popupHTML += '<div class="popup-detail" style="font-size:12px;color:#999;">' + escapeHTML(item.notes) + '</div>';
        }

        marker.bindPopup(popupHTML);
        mapLayers.push({ layer: marker, ministry: item.ministry });
      });
      document.getElementById('legendMode').textContent = 'Showing exact locations (secured)';
    }

    function clearLayers() {
      mapLayers.forEach(({ layer }) => map.removeLayer(layer));
      mapLayers = [];
    }

    function toggleFilter(el) {
      const ministry = el.dataset.ministry;
      if (hiddenMinistries.has(ministry)) {
        hiddenMinistries.delete(ministry);
        el.classList.remove('disabled');
        // Show layers for this ministry
        mapLayers.forEach(({ layer, ministry: m }) => {
          if (m === ministry) layer.addTo(map);
        });
      } else {
        hiddenMinistries.add(ministry);
        el.classList.add('disabled');
        // Hide layers for this ministry
        mapLayers.forEach(({ layer, ministry: m }) => {
          if (m === ministry) map.removeLayer(layer);
        });
      }
    }

    function escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // Crypto: decrypt with Web Crypto API
    async function decryptData(base64Data, password) {
      const packed = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const salt = packed.slice(0, 16);
      const iv = packed.slice(16, 28);
      const authTag = packed.slice(28, 44);
      const ciphertext = packed.slice(44);

      // Combine ciphertext + authTag for Web Crypto (it expects them concatenated)
      const combined = new Uint8Array(ciphertext.length + authTag.length);
      combined.set(ciphertext);
      combined.set(authTag, ciphertext.length);

      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        combined
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    }

    // Auth UI
    function toggleAuth() {
      if (isAuthenticated) {
        // Lock
        isAuthenticated = false;
        privateData = null;
        document.getElementById('lockIcon').innerHTML = '&#128274;';
        document.getElementById('lockText').textContent = 'Leader Login';
        document.getElementById('lockBtn').classList.remove('unlocked');
        renderPublicView();
      } else {
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('passwordInput').value = '';
        document.getElementById('errorMsg').style.display = 'none';
        setTimeout(() => document.getElementById('passwordInput').focus(), 100);
      }
    }

    function closeModal() {
      document.getElementById('modalOverlay').classList.remove('active');
    }

    async function attemptUnlock() {
      const password = document.getElementById('passwordInput').value;
      try {
        privateData = await decryptData(encryptedBlob, password);
        isAuthenticated = true;
        document.getElementById('lockIcon').innerHTML = '&#128275;';
        document.getElementById('lockText').textContent = 'Lock';
        document.getElementById('lockBtn').classList.add('unlocked');
        closeModal();
        renderPrivateView();
      } catch (e) {
        document.getElementById('errorMsg').style.display = 'block';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
      }
    }

    // Close modal on overlay click
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });

    // Escape key closes modal
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });

    // Initial render
    renderPublicView();
  </script>
</body>
</html>`;
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
