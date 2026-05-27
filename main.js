// ============================================================
//  КАТЕГОРИИ ПАРКОВ
//  Названия — строго как в GeoJSON (строчные, кроме ООПТ)
// ============================================================
const CATEGORIES = [
  { name: 'ООПТ',                             color: '#2d644a' },
  { name: 'парк специализированный',           color: '#a33723' },
  { name: 'бульвар',                           color: '#90dac2' },
  { name: 'сквер местного значения',           color: '#ff6e9e' },
  { name: 'малый сад',                         color: '#ffc7d9' },
  { name: 'сквер общегородского значения',     color: '#6a3434' },
  { name: 'сквер жилого района',              color: '#ad375e' },
  { name: 'сад жилого района',               color: '#a27d00' },
  { name: 'сад микрорайона',                  color: '#ebb609' },
  { name: 'мини-сквер',                        color: '#f5dd90' },
  { name: 'набережная',                        color: '#d1c9f6' },
  { name: 'парк общегородского значения',      color: '#536205' },
  { name: 'сад общегородского значения',       color: '#9db522' },
  { name: 'зона отдыха',                       color: '#ceda91' },
  { name: 'парк жилого района',               color: '#594501' },
];

// Поле атрибутивки, по которому классифицируем
const PRK_FIELD = '00_Назначение (категория) объекта';

// Инлайн-SVG глазика — используем как шаблон при генерации строк в DOM
const EYE_SVG = `
  <svg class="eye-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="4" fill="#303030"/>
    <path d="M21 12C21 12 20 4 12 4C4 4 3 12 3 12" stroke="#303030" stroke-width="2"/>
  </svg>`;

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ============================================================
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://raw.githubusercontent.com/gtitov/basemaps/refs/heads/master/positron-nolabels.json',
  center: [49.113185, 55.795749],
  zoom: 11,
  minZoom: 9,
  maxZoom: 18,
  attributionControl: false,
  maxBounds: [[48.770, 55.553], [49.431, 55.988]],
});

map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

// ===== МАСШТАБНАЯ ЛИНЕЙКА =====
class RussianScaleControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement("div");
        this._container.className = "maplibregl-ctrl russian-scale-control";

        this._line   = Object.assign(document.createElement("div"), { className: "russian-scale-line" });
        this._labels = Object.assign(document.createElement("div"), { className: "russian-scale-labels" });
        this._left   = Object.assign(document.createElement("span"), { innerText: "0" });
        this._right  = document.createElement("span");

        this._labels.append(this._left, this._right);
        this._container.append(this._line, this._labels);

        ["move", "zoom", "load"].forEach(e => map.on(e, () => this._update()));
        this._update();
        return this._container;
    }

    onRemove() {
        this._container.remove();
        this._map = undefined;
    }

    _update() {
        const map          = this._map;
        const center       = map.getCenter();
        const p1           = map.project(center);
        const lngOffset    = 1000 / (111320 * Math.cos(center.lat * Math.PI / 180));
        const p2           = map.project({ lng: center.lng + lngOffset, lat: center.lat });
        const pxPer1000m   = Math.abs(p2.x - p1.x);
        const mPerPx       = 1000 / pxPer1000m;
        const niceMeters   = this._nice(mPerPx * 120);

        this._line.style.width    = niceMeters / mPerPx + "px";
        this._right.innerText     = niceMeters >= 1000 ? niceMeters / 1000 + " км" : niceMeters + " м";
    }

    _nice(max) {
        const exp = Math.floor(Math.log10(max));
        const mag = Math.pow(10, exp);
        return [1, 2, 5].reduce((best, s) => s * mag <= max ? s * mag : best, mag);
    }
}

// Монтируем вручную в наш контейнер, минуя скрытые контролы MapLibre
const scaleBar = new RussianScaleControl();
scaleBar.onAdd(map);
document.getElementById('scale-bar').replaceWith(scaleBar._container);

// ============================================================
//  ВЫЕЗЖАЮЩИЕ БОКОВЫЕ ПАНЕЛИ
// ============================================================
const panelLeft   = document.getElementById('panel-left');
const panelRight  = document.getElementById('panel-right');
const toggleLeft  = document.getElementById('toggle-left');
const toggleRight = document.getElementById('toggle-right');
const zoomControl = document.getElementById('zoom-control');

toggleLeft.addEventListener('click', () => {
  const isOpen = panelLeft.classList.toggle('open');
  toggleLeft.classList.toggle('open', isOpen);
  toggleLeft.textContent = isOpen ? '‹' : '›';
});

toggleRight.addEventListener('click', () => {
  const isOpen = panelRight.classList.toggle('open');
  toggleRight.classList.toggle('open', isOpen);
  toggleRight.textContent = isOpen ? '›' : '‹';
  // Сдвигаем кнопки зума вместе с правой панелью
  zoomControl.classList.toggle('shifted', isOpen);
  // Сдвигаем масштабную линейку вместе с правой панелью
  document.querySelector('.russian-scale-control')?.classList.toggle('shifted', isOpen);
});

// ============================================================
//  КНОПКИ ЗУМА
// ============================================================
document.getElementById('zoom-in').addEventListener('click', () => {
  map.easeTo({ zoom: map.getZoom() + 1, duration: 300 });
});
document.getElementById('zoom-out').addEventListener('click', () => {
  map.easeTo({ zoom: map.getZoom() - 1, duration: 300 });
});

// ============================================================
//  ГЕОКОДЕР NOMINATIM
// ============================================================
const geocoderInput   = document.getElementById('geocoder-input');
const geocoderBtn     = document.getElementById('geocoder-btn');
const geocoderClear   = document.getElementById('geocoder-clear');
const geocoderResults = document.getElementById('geocoder-results');

let searchTimeout = null;
let searchMarker  = null;

// HTML-пин поиска — Flag_fill.svg
const pinEl = document.createElement('div');
pinEl.style.cssText = 'width:28px;height:28px;cursor:pointer;';
pinEl.innerHTML = `<img src="./public/Flag_fill.svg" style="width:100%;height:100%;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));" alt=""/>`;

function placeMarker(lon, lat) {
  if (searchMarker) searchMarker.remove();
  searchMarker = new maplibregl.Marker({ element: pinEl, anchor: 'bottom-left' })
    .setLngLat([lon, lat]).addTo(map);
}

function clearSearch() {
  if (searchMarker) { searchMarker.remove(); searchMarker = null; }
  geocoderInput.value = '';
  geocoderResults.classList.remove('visible');
  geocoderClear.classList.remove('visible');
}

geocoderInput.addEventListener('input', () => {
  geocoderClear.classList.toggle('visible', geocoderInput.value.length > 0);
  clearTimeout(searchTimeout);
  const q = geocoderInput.value.trim();
  if (q.length < 3) { geocoderResults.classList.remove('visible'); return; }
  // Задержка перед запросом — не спамим Nominatim при каждом символе
  searchTimeout = setTimeout(() => searchAddress(q), 400);
});

geocoderBtn.addEventListener('click', () => {
  const q = geocoderInput.value.trim();
  if (q.length >= 3) searchAddress(q);
});

geocoderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter')  { const q = geocoderInput.value.trim(); if (q.length >= 3) searchAddress(q); }
  if (e.key === 'Escape') clearSearch();
});

geocoderClear.addEventListener('click', clearSearch);

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) geocoderResults.classList.remove('visible');
});

async function searchAddress(query) {
  try {
    // Ограничиваем поиск Казанью: viewbox + countrycodes + bounded
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Казань')}&format=json&limit=7&countrycodes=ru&bounded=1&viewbox=48.77,55.55,49.44,55.99`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'ru' } });
    const data = await res.json();

    geocoderResults.innerHTML = '';

    if (!data.length) {
      geocoderResults.innerHTML = '<div class="geocoder-result-item" style="color:#aaa;">Ничего не найдено</div>';
      geocoderResults.classList.add('visible');
      return;
    }

    data.forEach(item => {
      const div = document.createElement('div');
      div.className = 'geocoder-result-item';
      div.textContent = item.display_name;
      div.addEventListener('click', () => {
        const lon = parseFloat(item.lon);
        const lat = parseFloat(item.lat);
        map.flyTo({ center: [lon, lat], zoom: 15, speed: 1.4 });
        placeMarker(lon, lat);
        geocoderInput.value = item.display_name;
        geocoderClear.classList.add('visible');
        geocoderResults.classList.remove('visible');
      });
      geocoderResults.appendChild(div);
    });

    geocoderResults.classList.add('visible');
  } catch (err) {
    console.error('Ошибка геокодирования:', err);
  }
}

// ============================================================
//  СОСТОЯНИЕ СЛОЯ "ЗЕЛЕНЫЕ ЗОНЫ"
// ============================================================
const prkState = {
  visible: true,   // глазик родительской строки включён
  expanded: false, // список категорий раскрыт
};

// Множество активных (видимых) категорий — изначально все включены
const activeCats = new Set(CATEGORIES.map(c => c.name));

// Применяет нужные видимости PRK-слоёв и фильтр категорий
function applyPRKVisibility() {
  if (!map.getLayer('PRK-layer')) return;

  if (!prkState.visible) {
    // Глазик выкл. → оба слоя скрыты
    map.setLayoutProperty('PRK-layer',     'visibility', 'none');
    map.setLayoutProperty('PRK-cat-layer', 'visibility', 'none');

  } else if (prkState.expanded) {
    // Глазик вкл. + список раскрыт → классифицированный слой
    map.setLayoutProperty('PRK-layer', 'visibility', 'none');

    if (activeCats.size === 0) {
      // Все категории отключены — скрываем слой
      map.setLayoutProperty('PRK-cat-layer', 'visibility', 'none');
    } else {
      map.setLayoutProperty('PRK-cat-layer', 'visibility', 'visible');
      if (activeCats.size === CATEGORIES.length) {
        // Все включены — убираем фильтр (показываем всё)
        map.setFilter('PRK-cat-layer', null);
      } else {
        // Фильтруем: показываем только активные категории
        map.setFilter('PRK-cat-layer', ['in', PRK_FIELD, ...activeCats]);
      }
    }

  } else {
    // Глазик вкл. + список свёрнут → единый зелёный цвет
    map.setLayoutProperty('PRK-layer',     'visibility', 'visible');
    map.setLayoutProperty('PRK-cat-layer', 'visibility', 'none');
  }
}

// Синхронизирует состояние глазика "включить всё" с activeCats
function syncAllEye(allEyeEl) {
  allEyeEl.classList.toggle('off', activeCats.size !== CATEGORIES.length);
}

// ============================================================
//  ГЕНЕРАЦИЯ СПИСКА КАТЕГОРИЙ В DOM
// ============================================================
const prkCategoriesEl = document.getElementById('prk-categories');
const expandBtn       = document.getElementById('prk-expand');

// --- Строка "включить / выключить все" ---
const allRow = document.createElement('div');
allRow.className = 'cat-all-row';

const allEye = document.createElement('div');
allEye.className = 'eye-btn';
allEye.id = 'eye-cat-all';
allEye.title = 'Включить / выключить все категории';
allEye.innerHTML = EYE_SVG;

const allLabel = document.createElement('span');
allLabel.className = 'cat-all-label';
allLabel.textContent = 'Включить / выключить все';

allRow.appendChild(allEye);
allRow.appendChild(allLabel);
prkCategoriesEl.appendChild(allRow);

// Клик по глазику "все" или по тексту — переключаем всё разом
function toggleAllCategories() {
  const turnOn = activeCats.size !== CATEGORIES.length; // если не все вкл. — включаем все
  CATEGORIES.forEach(cat => {
    if (turnOn) {
      activeCats.add(cat.name);
    } else {
      activeCats.delete(cat.name);
    }
    // Обновляем состояние индивидуальных глазиков
    const eye = document.getElementById(`eye-cat-${cat.name}`);
    if (eye) eye.classList.toggle('off', !turnOn);
  });
  syncAllEye(allEye);
  applyPRKVisibility();
}

allEye.addEventListener('click', toggleAllCategories);
allLabel.addEventListener('click', toggleAllCategories);

// --- Строки отдельных категорий ---
CATEGORIES.forEach(cat => {
  const row = document.createElement('div');
  row.className = 'category-row';

  // Глазик категории
  const eye = document.createElement('div');
  eye.className = 'eye-btn';
  eye.id = `eye-cat-${cat.name}`;
  eye.title = `Показать / скрыть: ${cat.name}`;
  eye.innerHTML = EYE_SVG;

  // Цветной квадрат
  const dot = document.createElement('div');
  dot.className = 'cat-dot';
  dot.style.background = cat.color;

  // Подпись (первая буква — заглавная для отображения)
  const label = document.createElement('span');
  label.className = 'cat-label';
  label.textContent = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);

  row.appendChild(eye);
  row.appendChild(dot);
  row.appendChild(label);
  prkCategoriesEl.appendChild(row);

  // Переключение отдельной категории
  eye.addEventListener('click', () => {
    const isActive = activeCats.has(cat.name);
    if (isActive) {
      activeCats.delete(cat.name);
      eye.classList.add('off');
    } else {
      activeCats.add(cat.name);
      eye.classList.remove('off');
    }
    syncAllEye(allEye);
    applyPRKVisibility();
  });
});

// ============================================================
//  ГЛАЗИК "ЗЕЛЕНЫЕ ЗОНЫ" (родительская строка)
// ============================================================
document.getElementById('eye-prk').addEventListener('click', function () {
  prkState.visible = !prkState.visible;
  this.classList.toggle('off', !prkState.visible);
  applyPRKVisibility();
});

// Стрелка раскрытия / сворачивания списка категорий.
// Работает независимо от prkState.visible: список открывается всегда,
// но пока слой выключен — категории на карте не отображаются.
expandBtn.addEventListener('click', () => {
  prkState.expanded = !prkState.expanded;
  prkCategoriesEl.classList.toggle('collapsed', !prkState.expanded);
  expandBtn.classList.toggle('open', prkState.expanded);
  applyPRKVisibility();
});

// ============================================================
//  ГЛАЗИКИ ОСТАЛЬНЫХ СЛОЁВ
//  Простая привязка: eyeId → layerId
// ============================================================
function bindEye(eyeId, layerId) {
  document.getElementById(eyeId).addEventListener('click', function () {
    const isOff = this.classList.toggle('off');
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', isOff ? 'none' : 'visible');
    }
  });
}

// ============================================================
//  PIE CHART OVERLAYS — типы зелёных зон по обеспеченности
// ============================================================
const PIE_ZOOM_THRESHOLD = 10;
const PIE_RADIUS = 20;
const CLUSTER_RADIUS_PX = 100;

// Соответствие поля GeoJSON → цвет из CATEGORIES
const PIE_FIELDS = [
  { key: 'area_парк_общегородского_значения',  color: '#536205' },
  { key: 'area_парк_жилого_района',            color: '#594501' },
  { key: 'area_парк_специализированный',       color: '#a33723' },
  { key: 'area_сад_общегородского_значения',   color: '#9db522' },
  { key: 'area_сад_жилого_района',             color: '#a27d00' },
  { key: 'area_сад_микрорайона',               color: '#ebb609' },
  { key: 'area_малый_сад',                     color: '#ffc7d9' },
  { key: 'area_сквер_общегородского_значения', color: '#6a3434' },
  { key: 'area_сквер_жилого_района',           color: '#ad375e' },
  { key: 'area_сквер_местного_значения',       color: '#ff6e9e' },
  { key: 'area_мини_сквер',                    color: '#f5dd90' },
  { key: 'area_бульвар',                       color: '#90dac2' },
  { key: 'area_зона_отдыха',                   color: '#ceda91' },
  { key: 'area_набережная',                    color: '#d1c9f6' },
  { key: 'area_оопт',                          color: '#2d644a' },
];

// Preloaded pie data: fid → { values: number[], centroid: [lng,lat] }
// Загружаем один раз, чтобы не зависеть от querySourceFeatures (ненадёжен с Кириллицей)
const pieDataMap = new Map();

fetch('./data/obesp_landuse_ply_with_parks.geojson')
  .then(r => r.json())
  .then(d => {
    for (const feat of d.features) {
      const fid = String(feat.properties.fid ?? '');
      if (!fid) continue;
      const props = feat.properties;
      const values = PIE_FIELDS.map(f => {
        const v = props[f.key];
        if (v === null || v === undefined || v === '' || v === 'null') return 0;
        const n = parseFloat(v);
        return isFinite(n) && n > 0 ? n : 0;
      });
      if (values.reduce((s, v) => s + v, 0) <= 0) continue; // пропускаем пустые
      const centroid = polygonCentroid(feat.geometry);
      if (!centroid) continue;
      pieDataMap.set(fid, { values, centroid });
    }
    console.log(`[pie] preloaded ${pieDataMap.size} features with area data`);
  })
  .catch(err => console.error('[pie] preload error:', err));

const pieMarkers = new Map();

// Строит SVG круговой диаграммы. Секторы рисуются с fill-opacity 0.8
function makePieSVG(slices, r) {
  const cx = r + 1, cy = r + 1, size = 2 * r + 2;
  let paths = '';
  let angle = -Math.PI / 2;
  for (const { color, fraction } of slices) {
    if (fraction <= 0) continue;
    const a2 = angle + fraction * 2 * Math.PI;
    const x1 = (cx + r * Math.cos(angle)).toFixed(3);
    const y1 = (cy + r * Math.sin(angle)).toFixed(3);
    const x2 = (cx + r * Math.cos(a2)).toFixed(3);
    const y2 = (cy + r * Math.sin(a2)).toFixed(3);
    const large = fraction > 0.5 ? 1 : 0;
    paths += `<path d="M${cx},${cy}L${x1},${y1}A${r},${r} 0 ${large},1 ${x2},${y2}Z"
      fill="${color}" fill-opacity="0.8" stroke="#fff" stroke-width="0.6"/>`;
    angle = a2;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
    xmlns="http://www.w3.org/2000/svg"
    style="display:block;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.35));cursor:default;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.85)"/>
    ${paths}
  </svg>`;
}

function polygonCentroid(geometry) {
  let ring = [];
  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    let best = 0;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > best) { best = poly[0].length; ring = poly[0]; }
    }
  }
  if (!ring.length) return null;
  return [
    ring.reduce((s, c) => s + c[0], 0) / ring.length,
    ring.reduce((s, c) => s + c[1], 0) / ring.length,
  ];
}

function updatePieMarkers() {
  const eyePie = document.getElementById('eye-pie');
  const pieVisible = eyePie && !eyePie.classList.contains('off');

  pieMarkers.forEach(({ marker }) => marker.remove());
  pieMarkers.clear();

  if (!pieVisible || map.getZoom() < PIE_ZOOM_THRESHOLD) return;
  if (pieDataMap.size === 0) return; // данные ещё не загружены

  const canvas = map.getCanvas();
  const W = canvas.width, H = canvas.height;

  // Собираем точки из preloaded данных — только те, что видны на экране
  const points = [];
  for (const [, { values, centroid }] of pieDataMap) {
    const px = map.project(centroid);
    if (px.x < -60 || px.y < -60 || px.x > W + 60 || px.y > H + 60) continue;
    points.push({ centroid, px, values });
  }

  // Жадная кластеризация
  const assigned = new Set();
  let idx = 0;

  for (let i = 0; i < points.length; i++) {
    if (assigned.has(i)) continue;
    assigned.add(i);
    const cluster = [points[i]];

    for (let j = i + 1; j < points.length; j++) {
      if (assigned.has(j)) continue;
      const dx = points[i].px.x - points[j].px.x;
      const dy = points[i].px.y - points[j].px.y;
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_RADIUS_PX) {
        cluster.push(points[j]);
        assigned.add(j);
      }
    }

    const merged = new Array(PIE_FIELDS.length).fill(0);
    cluster.forEach(p => p.values.forEach((v, k) => { merged[k] += v; }));
    const total = merged.reduce((s, v) => s + v, 0);
    if (total <= 0) continue;

    const slices = PIE_FIELDS.map((f, k) => ({ color: f.color, fraction: merged[k] / total }));
    const lng = cluster.reduce((s, p) => s + p.centroid[0], 0) / cluster.length;
    const lat = cluster.reduce((s, p) => s + p.centroid[1], 0) / cluster.length;

    const el = document.createElement('div');
    el.innerHTML = makePieSVG(slices, PIE_RADIUS);
    el.style.pointerEvents = 'none';
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);
    pieMarkers.set(String(idx++), { marker });
  }
}

bindEye('eye-buffer',    'buffer-layer');
bindEye('eye-iso',       'iso-layer');
bindEye('eye-obesp',     'obesp-layer');
bindEye('eye-priority',  'priority-layer');
bindEye('eye-density',   'density-layer');

// Глазик картодиаграмм — управляет фоновым полигональным слоем и маркерами
document.getElementById('eye-pie').addEventListener('click', function () {
  this.classList.toggle('off');
  const isOff = this.classList.contains('off');
  if (map.getLayer('pie-bg-layer')) {
    map.setLayoutProperty('pie-bg-layer', 'visibility', isOff ? 'none' : 'visible');
  }
  setTimeout(updatePieMarkers, 50);
});

// ============================================================
//  ЗАГРУЗКА СЛОЁВ (выполняется после готовности карты)
// ============================================================
map.on('load', () => {

  // --- Маска (фоновый полупрозрачный белый слой поверх подложки) ---
  map.addSource('mask', { type: 'geojson', data: './data/mask.geojson' });
  map.addLayer({
    id: 'mask-layer',
    type: 'fill',
    source: 'mask',
    paint: {
      'fill-color': '#ffffff',
      'fill-opacity': 0.55,
    },
  });
  map.addLayer({
    id: 'mask-outline-layer',
    type: 'line',
    source: 'mask',
    paint: {
      'line-color': '#000000',
      'line-width': 0,   // скрыт — заменён раздельными слоями ниже
    },
  });

  // Внешняя граница (граница города) — сплошная
  map.addSource('mask-outer', { type: 'geojson', data: './data/mask_outer.geojson' });
  map.addLayer({
    id: 'mask-outer-line',
    type: 'line',
    source: 'mask-outer',
    paint: {
      'line-color': '#000000',
      'line-width': 1.4,
      'line-opacity': 0.75,
    },
  });

  // Внутренняя граница (граница селитебной зоны) — пунктирная
  map.addSource('mask-inner', { type: 'geojson', data: './data/mask_inner.geojson' });
  map.addLayer({
    id: 'mask-inner-line',
    type: 'line',
    source: 'mask-inner',
    paint: {
      'line-color': '#000000',
      'line-width': 0.9,
      'line-opacity': 0.6,
      'line-dasharray': [5, 4],
    },
  });

  // --- Слой 1: Зеленые зоны — единый цвет ---
  // Активен когда список категорий свёрнут
  map.addSource('PRK', { type: 'geojson', data: './data/PRK.geojson' });
  map.addLayer({
    id: 'PRK-layer',
    type: 'fill',
    source: 'PRK',
    paint: {
      'fill-color': '#2d644a',
      'fill-opacity': 0.5,
      'fill-outline-color': 'rgba(0,0,0,0.15)',
    },
  });

  // --- Слой 2: Зеленые зоны — по категориям ---
  // Активен когда список категорий раскрыт; изначально скрыт
  const colorExpr = ['match', ['get', PRK_FIELD]];
  CATEGORIES.forEach(c => { colorExpr.push(c.name); colorExpr.push(c.color); });
  colorExpr.push('#cccccc');  // fallback для неизвестных категорий

  map.addSource('PRK-cat', { type: 'geojson', data: './data/PRK.geojson' });
  map.addLayer({
    id: 'PRK-cat-layer',
    type: 'fill',
    source: 'PRK-cat',
    layout: { visibility: 'none' },
    paint: {
      'fill-color': colorExpr,
      'fill-opacity': 0.75,
      'fill-outline-color': 'rgba(0,0,0,0.15)',
    },
  });

  // Popup при клике на парк (работает для обоих слоёв ПРК)
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: [0, -6],
    maxWidth: '240px',
    className: 'prk-popup',
  });

  ['PRK-layer', 'PRK-cat-layer'].forEach(layerId => {
    map.on('click', layerId, (e) => {
      // Показываем popup только если слой зеленых зон включён
      if (!prkState.visible) return;
      const props   = e.features[0].properties;
      const name    = props['00_Наименование'] || props.name || 'Объект ПРК';
      const address = props['00_Местоположение'] || '';
      const areaSqm = parseFloat(props['area']);
      const areaHa  = isNaN(areaSqm) ? null : (areaSqm / 10000).toFixed(2);

      const addrLine = address
        ? `<div style="margin-top:4px;font-size:11.5px;color:#555;">Адрес: ${address}</div>`
        : '';
      const areaLine = areaHa !== null
        ? `<div style="margin-top:2px;font-size:11.5px;color:#555;">Площадь: ${areaHa} га</div>`
        : '';

      popup.setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;padding:2px 4px 2px 0;line-height:1.45;">
            <div style="font-size:13px;font-weight:600;">${name}</div>
            ${addrLine}
            ${areaLine}
          </div>`)
        .addTo(map);
    });
    map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
  });

  // --- Слой 3: Буферы доступности (ВЫКЛЮЧЕН по умолчанию) ---
  map.addSource('buffer', { type: 'geojson', data: './data/buffer.geojson' });
  map.addLayer({
    id: 'buffer-layer',
    type: 'fill',
    source: 'buffer',
    layout: { visibility: 'none' },
    paint: {
      'fill-color': 'rgba(66,79,8,0.15)',
      'fill-outline-color': 'rgba(66,79,8,0.5)',
    },
  });

  // --- Слой 3б: Изохроны доступности (выключен по умолчанию) ---
  map.addSource('iso', { type: 'geojson', data: './data/PRK_iso_dissolved.geojson' });
  map.addLayer({
    id: 'iso-layer',
    type: 'fill',
    source: 'iso',
    layout: { visibility: 'none' },
    paint: {
      'fill-color': 'rgba(30,130,180,0.18)',
      'fill-outline-color': 'rgba(30,130,180,0.7)',
    },
  });

  // --- Слой: Численность населения (растр, выключен по умолчанию) ---
  map.addSource('density', {
    type: 'image',
    url: './data/density_popul.png',
    coordinates: [
      [48.828420065, 55.935467563], // top-left  [lng, lat]
      [49.3185234,   55.935467563], // top-right
      [49.3185234,   55.673626998], // bottom-right
      [48.828420065, 55.673626998], // bottom-left
    ],
  });
  map.addLayer({
    id: 'density-layer',
    type: 'raster',
    source: 'density',
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 0.75 },
  });

  // --- Слой 4: Фон картодиаграмм — жилые зоны с обеспеченностью > 0 (включён по умолчанию) ---
  // Отдельный источник, независим от слоя обеспеченности
  map.addSource('pie-source', { type: 'geojson', data: './data/obesp_landuse_ply_with_parks.geojson' });
  map.addLayer({
    id: 'pie-bg-layer',
    type: 'fill',
    source: 'pie-source',
    filter: ['>', ['coalesce', ['get', 'obesp'], 0], 0],
    layout: { visibility: 'none' },
    paint: {
      'fill-color': 'rgba(161,111,76,0.35)',
      'fill-outline-color': 'rgba(120,80,50,0.4)',
    },
  });

  // --- Слой 5: Обеспеченность жилых территорий (выключен по умолчанию) ---
  // 3 класса (step по квантилям позитивных значений):
  //   Низкая  — obesp = 0 / null         → #e05c47 (красный)
  //   Средняя — 0 < obesp ≤ 0.025        → #fee08b (жёлтый)
  //   Высокая — obesp > 0.025            → #4dab6d (зелёный)
  map.addSource('obesp', { type: 'geojson', data: './data/obesp_landuse_ply_with_parks.geojson' });
  map.addLayer({
    id: 'obesp-layer',
    type: 'fill',
    source: 'obesp',
    layout: { visibility: 'none' },
    paint: {
      'fill-color': [
        'step',
        ['coalesce', ['get', 'obesp'], 0],
        '#D8A47F',         // 0 / null → Низкая (самый светлый)
        0.001, '#A16F4C',  // > 0 до 0.025 → Средняя
        0.025, '#4D270B',  // > 0.025 → Высокая (самый тёмный)
      ],
      'fill-opacity': 0.72,
      'fill-outline-color': 'rgba(0,0,0,0.08)',
    },
  });

  // --- Слой 5: Приоритетные территории (выключен по умолчанию) ---
  // Жилые территории с obesp = 0 или без значения
  map.addSource('priority', { type: 'geojson', data: './data/obesp_landuse_ply_with_parks.geojson' });
  map.addLayer({
    id: 'priority-layer',
    type: 'fill',
    source: 'priority',
    layout: { visibility: 'none' },
    filter: ['<=', ['coalesce', ['get', 'obesp'], 0], 0],
    paint: {
      'fill-color': 'rgba(180,30,30,0.15)',
      'fill-outline-color': '#b41e1e',
    },
  });

  // --- Pie charts: обновляем при движении / зуме ---
  map.on('moveend', updatePieMarkers);
  map.on('zoomend', updatePieMarkers);
  // Первичная отрисовка после загрузки данных
  map.once('idle', updatePieMarkers);

}); // end map.on('load')

// ============================================================
//  ИНСТРУМЕНТ "ДОБАВЛЕНИЕ НОВОГО ОБЪЕКТА"
// ============================================================

// Радиусы буферов доступности по типу объекта (метры)
const OBJECT_RADII = {
  park:      1200,
  garden:     600,
  square:     400,
  boulevard:  400,
};

const objectTypeSelect = document.getElementById('object-type-select');
const populationCount  = document.getElementById('population-count');

let toolMarker  = null;   // пин в точке клика
let populData   = null;   // загруженный GeoJSON с населением МКД

// ---- Загружаем данные о населении один раз при старте ----
fetch('./data/mkd_popul_G2SFCA.geojson')
  .then(r => r.json())
  .then(d => { populData = d; })
  .catch(err => console.error('Не удалось загрузить mkd_popul_G2SFCA.geojson:', err));

// ---- Стиль пина инструмента — Flag_fill.svg ----
function makeToolPin() {
  const el = document.createElement('div');
  el.style.cssText = 'width:28px;height:28px;cursor:pointer;';
  el.innerHTML = `<img src="./public/Flag_fill.svg" style="width:100%;height:100%;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));" alt=""/>`;
  return el;
}

// ---- Генерация полигона-круга вокруг точки [lng, lat] ----
function makeCircle(center, radiusMeters, points = 64) {
  const [lng, lat] = center;
  const earthR = 6378137; // радиус Земли в метрах
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(theta);
    const dy = radiusMeters * Math.sin(theta);
    const dLng = (dx / (earthR * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);
    const dLat = (dy / earthR) * (180 / Math.PI);
    coords.push([lng + dLng, lat + dLat]);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }],
  };
}

// ---- Расстояние между двумя точками в метрах (Haversine) ----
function distMeters(lng1, lat1, lng2, lat2) {
  const R = 6378137;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---- Суммарное население точек внутри круга ----
function sumPopulation(center, radius) {
  if (!populData) return null;
  let total = 0;
  for (const f of populData.features) {
    if (f.geometry?.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates;
    if (distMeters(center[0], center[1], lng, lat) <= radius) {
      total += Number(f.properties?.POPUL) || 0;
    }
  }
  return total;
}

// ---- Сброс состояния инструмента ----
function resetTool() {
  if (toolMarker) { toolMarker.remove(); toolMarker = null; }
  if (map.getSource('tool-buffer')) {
    map.getSource('tool-buffer').setData({ type: 'FeatureCollection', features: [] });
  }
  populationCount.textContent = '—';
}

const objectTypeClear = document.getElementById('object-type-clear');

// Показываем крестик только когда тип выбран
function updateClearVisibility() {
  objectTypeClear.classList.toggle('visible', objectTypeSelect.value !== '');
}

// При смене типа объекта — очищаем предыдущий результат
objectTypeSelect.addEventListener('change', () => {
  resetTool();
  updateClearVisibility();
});

// Клик по крестику — полный сброс инструмента
objectTypeClear.addEventListener('click', () => {
  objectTypeSelect.value = '';
  resetTool();
  updateClearVisibility();
});

// ---- Обработчик клика по карте ----
map.on('click', (e) => {
  const type = objectTypeSelect.value;
  if (!type) return;                  // тип не выбран — инструмент неактивен

  const center = [e.lngLat.lng, e.lngLat.lat];
  const radius = OBJECT_RADII[type];

  // 1) Пин в точке клика
  if (toolMarker) toolMarker.remove();
  toolMarker = new maplibregl.Marker({ element: makeToolPin(), anchor: 'bottom' })
    .setLngLat(center).addTo(map);

  // 2) Буфер-круг вокруг пина
  const buffer = makeCircle(center, radius);
  if (map.getSource('tool-buffer')) {
    map.getSource('tool-buffer').setData(buffer);
  } else {
    map.addSource('tool-buffer', { type: 'geojson', data: buffer });
    map.addLayer({
      id: 'tool-buffer-layer',
      type: 'fill',
      source: 'tool-buffer',
      paint: {
        'fill-color': '#424f08',
        'fill-opacity': 0.2,
        'fill-outline-color': '#424f08',
      },
    });
  }

  // 3) Сумма населения внутри буфера
  const total = sumPopulation(center, radius);
  populationCount.textContent =
    total === null ? '...' : total.toLocaleString('ru-RU');
});