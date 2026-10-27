//#region funcs
function slug(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
function getDifficultyRank(zoneKey) {
  // Stable numeric rank 0–4 from dificultad.json (not language-dependent).
  if (!DATA.difficultyByZone || zoneKey == null) return 1; // NORMAL
  const r = Number(DATA.difficultyByZone[zoneKey]);
  return Number.isFinite(r) ? r : 1;
}
function difficultyClass(rankOrKey) {
  // Colors by numeric difficulty, never by localized text.
  let rank = rankOrKey;
  if (typeof rank !== "number") {
    rank = (diffRank[rankOrKey] != null && typeof diffRank[rankOrKey] === "number")
      ? diffRank[rankOrKey]
      : getDifficultyRank(rankOrKey);
  }
  if (!Number.isFinite(rank)) rank = 1;
  return "d-" + rank;
}
function hashHue(label) {
  let n = 0;
  for (let i = 0; i < String(label).length; i++) n = (n * 31 + String(label).charCodeAt(i)) >>> 0;
  return n % 360;
}
function trackPath(mode) {
  if (mode === "Drag14" || mode === "Drag12" || mode === "Drag") return "M80 210 H720";
  if (mode === "Drift") return "M90 300 C160 40 250 380 380 120 S560 40 720 250 C760 320 620 360 520 300 S240 360 90 300";
  if (mode === "Speed") return "M40 250 C180 80 300 320 470 140 S720 80 780 230";
  return "M180 80 C420 40 680 90 700 210 C720 330 520 380 360 350 C180 310 80 280 90 180 C100 90 140 90 180 80";
}
function fallbackSvg(label, mode) {
  const hue = hashHue(label + (mode || "loc"));
  const path = trackPath(mode);
  const sub = mode ? ("NFS PROSTREET · " + String(mode).toUpperCase()) : "NFS PROSTREET · LOCALIZACIÓN";
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420"><defs>
         <linearGradient id="g" x1="0" x2="1">
             <stop stop-color="#101923"/><stop offset="1" stop-color="#27394a"/>
         </linearGradient>
         </defs>
         <rect width="800" height="420" fill="url(#g)"/>
         <g fill="none" stroke="#8da0b5" stroke-width="18" opacity=".35">
             <path d="M-20 300 C130 30 240 400 380 120 S610 30 820 220"/>
             <path d="M20 100 C200 240 300 40 500 260 S650 350 820 120"/>
         </g>
         <path d="${path}" fill="none" stroke="hsl(${hue} 72% 58%)" stroke-width="8" stroke-linecap="round"/>
         <text x="34" y="55" fill="#fff" font-family="Arial" font-size="28" font-weight="700">${esc(label)}</text>
         <text x="34" y="84" fill="#a9bacb" font-family="Arial" font-size="15">${esc(sub)}</text></svg>`
  );
}
function mapFrame(src, alt, fallbackLabel, mode) {
  const fb = fallbackSvg(fallbackLabel || alt || "?", mode);
  if (!src) return `<img src="${fb}" alt="${esc(alt)}" referrerpolicy="no-referrer">`;
  return `<img src="${esc(src)}" alt="${esc(alt)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'">`;
}
function zeroPad(valor, padding = 3) {
  return String(valor).padStart(padding, "0");
}
function locDisplayName(locKey) {
  const loc = DATA.locations[locKey];
  if (!loc || loc.lt_low == null) return locKey;
  const key = `HUB_NAME_${zeroPad(loc.lt_low)}`;
  return data_labels_str.hub[key] || key;
}
function zoneDisplayName(zone) {
  const tag = zone?.track_layout?.Data?.LocalizationTag;
  if (tag == null) return zone?.CollectionKey || zone?.Name || "?";
  const key = `TRACK_CONFIG_${zeroPad(tag)}`;
  return data_labels_str.calelas[key] || key;
}
function zoneTrackLength(zone) {
  return zone?.track_layout?.Data?.TrackLength ?? null;
}
function escapeLayoutName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function zoneMapSrc(zone) {
  // Renamed images: zone_${track_layout.Name escaped}.webp
  const layoutName = zone?.track_layout?.Name || zone?.track_layout?.Data?.Name || zone?.CollectionKey;
  if (!layoutName) return null;
  return `./img/zone_${escapeLayoutName(layoutName)}.webp`;
}
function locMapSrc(locKey) {
  // Overview maps: <escaped loc key>.webp e.g. tracks_autobahn_gd.webp
  if (!locKey) return null;
  const part = escapeLayoutName(locKey);
  return part ? `./img/${part}.webp` : null;
}
function analyzeZone(zone) {
  const races = Array.isArray(zone?.races) ? zone.races : [];
  const parents = new Set();
  let hasGroup = false;
  let isLooping = false;
  for (const r of races) {
    const p = r?.ParentName;
    if (p) parents.add(p);
    const d = r?.Data || {};
    if (d.HandicapMode === "kHandicap_Group") hasGroup = true;
    if (d.IsLoopingRace === true || d.IsLoopingRace === "True") isLooping = true;
  }

  let modeType = null; // Grip | Drag14 | Drag12 | Drift | Speed
  const variants = []; // [{ id, parent, labelKey }]

  if (parents.has("solodrift")) {
    modeType = "Drift";
    variants.push({ id: "Drift", parent: "solodrift" });
  } else if (parents.has("prodrag") || parents.has("prodragwheelie")) {
    const len = zoneTrackLength(zone);
    // 1/4 mile ≈ 402m, 1/2 mile ≈ 804m
    if (parents.has("prodragwheelie") || (len && len < 600)) {
      modeType = "Drag14";
      variants.push({ id: "Drag14", parent: "prodrag" });
      if (parents.has("prodragwheelie")) variants.push({ id: "Wheelie", parent: "prodragwheelie" });
    } else {
      modeType = "Drag12";
      variants.push({ id: "Drag12", parent: "prodrag" });
    }
  } else if (parents.has("topspeedchallenge") || parents.has("highspeedchallenge")) {
    modeType = "Speed";
    if (parents.has("highspeedchallenge")) variants.push({ id: "Speed", parent: "highspeedchallenge" });
    if (parents.has("topspeedchallenge")) variants.push({ id: "TopSpeed", parent: "topspeedchallenge" });
  } else if (parents.has("circuit") || parents.has("timeattack") || parents.has("sectorshootout")) {
    modeType = "Grip";
    if (parents.has("circuit")) variants.push({ id: "Grip", parent: "circuit" });
    if (parents.has("timeattack")) variants.push({ id: "TimeAttack", parent: "timeattack" });
    if (parents.has("sectorshootout")) variants.push({ id: "Shootout", parent: "sectorshootout" });
    if (hasGroup) variants.push({ id: "GripClass", parent: "circuit_group" });
  }

  // Deduplicate variants by id
  const seen = new Set();
  const unique = [];
  for (const v of variants) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    unique.push(v);
  }

  return { modeType, variants: unique, isLooping, parents };
}
function variantLabel(variantId) {
  // Prefer raceVariants structure populated by CambiarIdioma
  for (const group of Object.values(raceVariants)) {
    if (group?.variants && group.variants[variantId]) return group.variants[variantId];
  }
  // Fallback via data_labels_str.tipo + data_modos
  const labelKey = data_modos[variantId];
  if (labelKey && data_labels_str.tipo[labelKey]) return data_labels_str.tipo[labelKey];
  return variantId;
}
function modeTypeLabel(modeType) {
  if (!modeType) return "";
  const cat = categoryMode(modeType);
  // Map modeType to modos enum key then modeLabel
  const map = {
    Grip: modos.Grip,
    Drift: modos.Drift,
    Drag: modos.Drag,
    Drag14: modos.Drag,
    Drag12: modos.Drag,
    Speed: modos.Speed
  };
  const k = map[cat] || map[modeType];
  if (k && modeLabel[k]) return modeLabel[k];
  return cat || modeType;
}
function difficultyLabel(rankOrKey) {
  // Accept rank number or Spanish key; display string follows current language.
  let rank = rankOrKey;
  if (typeof rank !== "number") {
    rank = (diffRank[rankOrKey] != null && typeof diffRank[rankOrKey] === "number")
      ? diffRank[rankOrKey]
      : null;
  }
  if (rank == null || !Number.isFinite(rank)) return rankOrKey == null ? "" : String(rankOrKey);
  return diffRank[rank] || String(rank);
}
function labelExtra(gameKey) {
  // gameKey like HUB_TRACKPREVIEW_LAPS — stored inverted in utiles then resolved in data_labels_str.extra
  // data_labels_str.extra maps label-id-name -> localized text after CambiarIdioma
  // Actually after load: data_labels_global_utiles.extra[LABEL] = hashId
  // then data_labels_str.extra[LABEL] = localized
  return data_labels_str.extra[gameKey] || gameKey;
}
function kphUnit() {
  // Game strings: "km/h", "km/u" (NL), "km/t" (NO), "Km/h"…
  // Keep only the part before the first slash.
  const raw = String(data_labels_str.extra["COMMON_ABBREV_KPH"] || "km/h").trim();
  const cut = raw.split("/")[0].trim();
  return cut || "km";
}
function categoryMode(modeType) {
  // UI filter category: Drag12/Drag14 collapse into Drag
  if (modeType === "Drag12" || modeType === "Drag14") return "Drag";
  return modeType;
}
function modeMatchesFilter(modeType, filter) {
  if (!filter) return true;
  if (filter === "Drag") return modeType === "Drag12" || modeType === "Drag14";
  return modeType === filter;
}
function canSelect(loc) {
  if (state.blocked.has(loc)) return false;
  if (state.chosen.size > 0 && !state.chosen.has(loc)) return false;
  return true;
}
function lockReason(loc) {
  if (state.blocked.has(loc)) return "Esta localización está bloqueada. No podés seleccionar sus zonas.";
  if (state.chosen.size > 0 && !state.chosen.has(loc)) return "Hay localizaciones elegidas. Solo podés seleccionar zonas de esas.";
  return null;
}
function stripSelected(pred) {
  for (const id of [...state.selected.keys()]) {
    const loc = id.split("|")[0];
    if (!pred(loc)) state.selected.delete(id);
  }
}
function toggleBlocked(loc) {
  if (state.blocked.has(loc)) {
    state.blocked.delete(loc);
  } else {
    state.blocked.add(loc);
    state.chosen.delete(loc);
    stripSelected(l => l !== loc);
  }
  render();
}
function toggleChosen(loc) {
  if (state.chosen.has(loc)) {
    state.chosen.delete(loc);
  } else {
    state.chosen.add(loc);
    state.blocked.delete(loc);
    stripSelected(l => state.chosen.has(l));
  }
  render();
}
function getZone(locKey, zoneKey) {
  return DATA.locations[locKey]?.zones?.[zoneKey] || null;
}
function zoneId(locKey, zoneKey) {
  return locKey + "|" + zoneKey;
}
function parseZoneId(id) {
  const i = id.indexOf("|");
  return { locKey: id.slice(0, i), zoneKey: id.slice(i + 1) };
}
function defaultConfig(zone) {
  const info = analyzeZone(zone);
  const variant = info.variants[0]?.id || info.modeType;
  let laps = 1;
  if (info.modeType === "Grip") laps = 3;
  else if (info.modeType === "Drift" || info.modeType === "Drag14" || info.modeType === "Drag12") laps = 3;
  else if (info.modeType === "Speed") laps = 1;
  return { variant, laps, modeType: info.modeType, isLooping: info.isLooping };
}
function openConfig(id) {
  const { locKey, zoneKey } = parseZoneId(id);
  const zone = getZone(locKey, zoneKey);
  if (!zone || !canSelect(locKey)) return;
  const existing = state.selected.get(id);
  const base = existing || defaultConfig(zone);
  state.config = {
    id,
    locKey,
    zoneKey,
    zone,
    name: zoneDisplayName(zone),
    ...base
  };
  renderConfig();
  $("#configModal").classList.add("open");
}
function onZonePick(id) {
  if (state.selected.has(id)) {
    state.selected.delete(id);
    render();
    return;
  }
  openConfig(id);
}
function locationKeys() {
  return Object.keys(DATA.locations).filter(k => {
    const loc = DATA.locations[k];
    if (loc.lt_low == null) return false;
    const zones = loc.zones || {};
    return Object.values(zones).some(z => Array.isArray(z.races) && z.races.length);
  });
}
function zonesOf(locKey) {
  const loc = DATA.locations[locKey];
  if (!loc?.zones) return [];
  return Object.entries(loc.zones)
    .filter(([, z]) => Array.isArray(z.races) && z.races.length && z.track_layout)
    .map(([zoneKey, zone]) => {
      const info = analyzeZone(zone);
      return { zoneKey, zone, info, name: zoneDisplayName(zone) };
    })
    .filter(z => z.info.modeType);
}
function matchDifficulty(zoneKey) {
  // Returns numeric rank 0–4 (language-independent).
  return getDifficultyRank(zoneKey);
}
function renderLocations() {
  const q = state.query;
  const names = locationKeys().filter(l => {
    const disp = locDisplayName(l).toLowerCase();
    if (!q) return true;
    if (disp.includes(q) || l.toLowerCase().includes(q)) return true;
    return zonesOf(l).some(z => z.name.toLowerCase().includes(q));
  });
  names.sort((a, b) => locDisplayName(a).localeCompare(locDisplayName(b), undefined, { sensitivity: "base" }));

  $("#locList").innerHTML = names.map(l => {
    const blocked = state.blocked.has(l);
    const chosen = state.chosen.has(l);
    const active = state.location === l;
    const cls = ["loc-row", active && "active", blocked && "blocked", chosen && "chosen"].filter(Boolean).join(" ");
    const disp = locDisplayName(l);
    const count = zonesOf(l).length;
    return '<div class="' + cls + '">' +
      '<button type="button" class="mark ' + (blocked ? "on-block" : "") + '" data-block="' + esc(l) + '" title="Bloquear" aria-label="Bloquear ' + esc(disp) + '" aria-pressed="' + blocked + '">🚫</button>' +
      '<button type="button" class="mark ' + (chosen ? "on-chosen" : "") + '" data-choose="' + esc(l) + '" title="Marcar como elegida" aria-label="Elegir ' + esc(disp) + '" aria-pressed="' + chosen + '">✅</button>' +
      '<button type="button" class="loc-btn" data-loc="' + esc(l) + '"><span>' + esc(disp) + '</span><span class="count">' + count + '</span></button>' +
      '</div>';
  }).join("") || '<div class="source" style="padding:10px">Sin coincidencias.</div>';
}
function zonesHtml(locKey, zones) {
  let shown = zones.filter(z => {
    if (!modeMatchesFilter(z.info.modeType, state.mode)) return false;
    if (state.query && !(z.name + " " + z.info.modeType).toLowerCase().includes(state.query)) return false;
    return true;
  });
  shown.sort((a, b) => {
    if (state.sort === "difficulty") {
      const da = getDifficultyRank(a.zoneKey);
      const db = getDifficultyRank(b.zoneKey);
      return da - db || a.name.localeCompare(b.name);
    }
    if (state.sort === "mode") {
      const order = { Grip: 0, Drift: 1, Drag: 2, Drag14: 2, Drag12: 2, Speed: 3 };
      return (order[a.info.modeType] ?? 9) - (order[b.info.modeType] ?? 9) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
  if (!shown.length) return '<div class="empty">No hay zonas con ese filtro.</div>';
  const locked = !canSelect(locKey);
  return shown.map(z => {
    const id = zoneId(locKey, z.zoneKey);
    const sel = state.selected.has(id);
    const diffRankNum = getDifficultyRank(z.zoneKey);
    const diffText = difficultyLabel(diffRankNum);
    const modeText = modeTypeLabel(z.info.modeType);
    const len = zoneTrackLength(z.zone);
    const lenText = len != null ? (Math.round(len) + " " + kphUnit()) : "";
    return '<article class="zone ' + (sel ? "selected" : "") + (locked ? " locked" : "") + '">' +
      '<div class="zone-img">' + mapFrame(zoneMapSrc(z.zone), "Mapa " + z.name, z.name, z.info.modeType) +
      '<div class="map-overlay">MAP ZONE · ' + esc(modeText) + '</div></div>' +
      '<div class="zone-body"><div class="zone-name">' + esc(z.name) + '</div>' +
      '<div class="meta"><span class="tag">' + esc(modeText) + '</span>' +
      '<span class="tag difficulty ' + difficultyClass(diffRankNum) + '">' + esc(diffText) + '</span>' +
      (lenText ? '<span class="tag">' + esc(lenText) + '</span>' : '') +
      '</div>' +
      '<div class="select-row"><span class="source">' + (locked ? "No disponible" : (sel ? "Seleccionada" : "Disponible")) + '</span>' +
      '<button class="pick" data-zone="' + esc(id) + '" ' + (locked ? "disabled" : "") + '>' + (sel ? "Quitar" : "Seleccionar") + '</button>' +
      '</div></div></article>';
  }).join("");
}
function renderContent() {
  const c = $("#content");
  if (!state.location) {
    c.innerHTML = '<div class="empty"><div><strong>Elegí una localización</strong>Después seleccioná el modo y las zonas que quieras incluir.</div></div>';
    return;
  }
  const locKey = state.location;
  const zones = zonesOf(locKey);
  const modeCats = [...new Set(zones.map(z => categoryMode(z.info.modeType)).filter(Boolean))];
  const modeOrderUi = { Grip: 0, Drift: 1, Drag: 2, Speed: 3 };
  modeCats.sort((a, b) => (modeOrderUi[a] ?? 9) - (modeOrderUi[b] ?? 9));
  const disp = locDisplayName(locKey);
  const reason = lockReason(locKey);
  c.innerHTML = '<div class="hero"><div class="hero-img">' + mapFrame(locMapSrc(locKey), disp, disp) +
    '<div class="hero-label">' + esc(disp) + '</div></div>' +
    '<div class="hero-copy"><div class="kicker">Localización</div><h2>' + esc(disp) + '</h2>' +
    '<p></p>' +
    '<div class="meta"><span class="tag">' + zones.length + ' zonas</span><span class="tag">' + modeCats.length + ' modos</span>' +
    (state.blocked.has(locKey) ? '<span class="tag" style="border-color:var(--block-line);color:var(--block-fg)">🚫 Bloqueada</span>' : '') +
    (state.chosen.has(locKey) ? '<span class="tag" style="border-color:var(--chosen-line);color:var(--chosen-fg)">✅ Elegida</span>' : '') +
    '</div></div></div>' +
    '<div class="modebar"><button class="mode-btn ' + (!state.mode ? "active" : "") + '" data-mode="" type="button">Todos</button>' +
    modeCats.map(m => '<button class="mode-btn ' + (state.mode === m ? "active" : "") + '" data-mode="' + esc(m) + '" type="button"><span class="mode-icon">' + (icons[m] || "•") + '</span>' + esc(modeTypeLabel(m)) + '</button>').join("") +
    '</div><div class="zone-head"><h3>' + (state.mode ? esc(modeTypeLabel(state.mode)) : "Todas las zonas") + '</h3>' +
    '<span class="source ' + (reason ? (state.blocked.has(locKey) ? "lock-note" : "lock-note chosen-note") : "") + '">' + (reason || "Seleccioná una zona para configurar el tipo de carrera y las vueltas.") + '</span></div>' +
    '<div class="zone-grid">' + zonesHtml(locKey, zones) + '</div>';
}
function renderConfig() {
  const c = state.config;
  if (!c) return;
  const info = analyzeZone(c.zone);
  const locName = locDisplayName(c.locKey);
  const zoneName = zoneDisplayName(c.zone);
  $("#configTitle").textContent = locName + " · " + zoneName;
  $("#configMeta").textContent = modeTypeLabel(info.modeType);

  const diffRankNum = getDifficultyRank(c.zoneKey);
  const diffHeader = labelExtra("RACEDAY_SCREEN_DIFFICULTY") || "Dificultad";
  $("#configDifficulty").innerHTML = esc(diffHeader) + ': <strong class="difficulty ' + difficultyClass(diffRankNum) + '">' + esc(difficultyLabel(diffRankNum)) + '</strong>';

  $("#configMapWrap").innerHTML = mapFrame(zoneMapSrc(c.zone), "Mapa " + zoneName, zoneName, info.modeType);

  // Mode variants
  const modeHeader = labelExtra("TUT_CAREER_002_HEADER") || "Modo de juego";
  const modeSection = $("#raceVariants").parentElement;
  if (modeSection) {
    const kicker = modeSection.querySelector(".kicker");
    if (kicker) kicker.textContent = modeHeader;
  }
  if (info.variants.length <= 1) {
    const only = info.variants[0];
    $("#raceVariants").innerHTML = '<button class="option-btn active" disabled>' + esc(variantLabel(only?.id || info.modeType)) + '</button>';
  } else {
    $("#raceVariants").innerHTML = info.variants.map(v =>
      '<button class="option-btn ' + (c.variant === v.id ? "active" : "") + '" data-variant="' + esc(v.id) + '" type="button">' + esc(variantLabel(v.id)) + '</button>'
    ).join("");
  }

  // Laps / Rounds — range slider 1–10
  const lapSection = $("#lapSection");
  const lapKicker = lapSection?.querySelector(".kicker");
  const isDragOrDrift = info.modeType === "Drift" || info.modeType === "Drag14" || info.modeType === "Drag12";
  const showLaps = info.modeType === "Grip" || (info.modeType === "Speed" && info.isLooping);
  const showRounds = isDragOrDrift;
  const fixedOne = !showLaps && !showRounds;
  const curLaps = Math.min(10, Math.max(1, Number(c.laps) || 1));

  if (lapSection) lapSection.hidden = false;
  if (showLaps) {
    if (lapKicker) lapKicker.textContent = labelExtra("HUB_TRACKPREVIEW_LAPS") || "Cantidad de vueltas";
  } else if (showRounds) {
    if (lapKicker) lapKicker.textContent = labelExtra("HUB_TRACKPREVIEW_ROUNDS") || "Cantidad de rondas";
  } else {
    if (lapKicker) lapKicker.textContent = labelExtra("HUB_TRACKPREVIEW_LAPS") || "Cantidad de vueltas";
  }

  if (fixedOne) {
    // Speed sin loop: solo 1 vuelta, botón fijo
    c.laps = 1;
    $("#lapOptions").innerHTML =
      '<button class="option-btn active" type="button" disabled>1</button>';
  } else {
    $("#lapOptions").innerHTML =
      '<div class="range-wrap">' +
      '<input type="range" id="lapRange" min="1" max="10" value="' + curLaps + '">' +
      '<span class="range-val" id="lapRangeVal">' + curLaps + '</span>' +
      '</div>';
  }

  const len = zoneTrackLength(c.zone);
  const unit = kphUnit();
  let infoHtml = "";
  if (len != null) {
    infoHtml += "<strong>" + esc(Math.round(len) + " " + unit) + "</strong>";
  }
  if (info.isLooping) {
    infoHtml += (infoHtml ? " · " : "") + "Loop";
  }
  $("#fixedRaceInfo").innerHTML = infoHtml || "&nbsp;";
}
function saveConfig() {
  const c = state.config;
  if (!c) return;
  const info = analyzeZone(c.zone);
  let laps = Number(c.laps) || 1;
  if (info.modeType === "Speed" && !info.isLooping) laps = 1;
  state.selected.set(c.id, {
    variant: c.variant,
    laps,
    modeType: info.modeType,
    isLooping: info.isLooping
  });
  state.config = null;
  $("#configModal").classList.remove("open");
  render();
}
function renderSelected() {
  const arr = [...state.selected.entries()].map(([id, opt]) => {
    const { locKey, zoneKey } = parseZoneId(id);
    const zone = getZone(locKey, zoneKey);
    return { id, locKey, zoneKey, zone, opt, name: zoneDisplayName(zone), locName: locDisplayName(locKey) };
  });
  $("#selectedTitle").textContent = "Tus zonas seleccionadas (" + arr.length + ")";
  const wrap = $("#marksWrap");
  if (!state.chosen.size && !state.blocked.size) {
    wrap.innerHTML = "";
    wrap.hidden = true;
  } else {
    wrap.hidden = false;
    let html = "";
    if (state.chosen.size) {
      html += '<div class="marks-block chosen-block"><div class="kicker">Localizaciones elegidas</div>' +
        '<div class="mark-chips">' + [...state.chosen].map(l => '<span class="chip chip-chosen">✅ ' + esc(locDisplayName(l)) + '</span>').join("") + '</div>' +
        '<p class="source" style="margin:8px 0 0">Solo se pueden seleccionar zonas de estas localizaciones.</p></div>';
    }
    if (state.blocked.size) {
      html += '<div class="marks-block blocked-block"><div class="kicker">Localizaciones bloqueadas</div>' +
        '<div class="mark-chips">' + [...state.blocked].map(l => '<span class="chip chip-blocked">🚫 ' + esc(locDisplayName(l)) + '</span>').join("") + '</div>' +
        '<p class="source" style="margin:8px 0 0">No se pueden seleccionar zonas de estas localizaciones.</p></div>';
    }
    wrap.innerHTML = html;
  }
  $("#selectedGrid").innerHTML = arr.length ? arr.map((x, i) => {
    const modeText = modeTypeLabel(x.opt.modeType);
    const vLabel = variantLabel(x.opt.variant);
    const isRounds = x.opt.modeType === "Drift" || x.opt.modeType === "Drag14" || x.opt.modeType === "Drag12";
    const unit = isRounds
      ? (labelExtra("HUB_TRACKPREVIEW_ROUNDS") || "rondas")
      : (labelExtra("HUB_TRACKPREVIEW_LAPS") || "vueltas");
    const diffRankNum = getDifficultyRank(x.zoneKey);
    const len = zoneTrackLength(x.zone);
    const lenText = len != null ? (Math.round(len) + " " + kphUnit()) : "";
    return '<div class="selected-item"><div class="selected-map">' + mapFrame(zoneMapSrc(x.zone), "Mapa " + x.name, x.name, x.opt.modeType) + '</div>' +
      '<div class="selected-info"><div class="kicker">Zona ' + String(i + 1).padStart(2, "0") + '</div>' +
      '<h3>' + esc(x.locName) + " · " + esc(x.name) + '</h3>' +
      '<p>' + esc(modeText) + ' · <strong class="difficulty ' + difficultyClass(diffRankNum) + '">' + esc(difficultyLabel(diffRankNum)) + '</strong></p>' +
      '<div class="selected-details"><span class="tag">' + esc(vLabel) + '</span><span class="tag">' + x.opt.laps + " " + esc(unit) + '</span>' +
      (lenText ? '<span class="tag">' + esc(lenText) + '</span>' : '') +
      '</div></div></div>';
  }).join("") : '<div class="empty" style="min-height:160px">No hay zonas seleccionadas todavía.</div>';
}
function renderStats() {
  const locs = locationKeys();
  $("#locStat").textContent = locs.length;
  $("#zoneStat").textContent = locs.reduce((n, k) => n + zonesOf(k).length, 0);
  $("#selectedCount").textContent = state.selected.size;
  $("#chosenStat").textContent = state.chosen.size;
  $("#blockedStat").textContent = state.blocked.size;
  $("#chosenPill").hidden = state.chosen.size === 0;
  $("#blockedPill").hidden = state.blocked.size === 0;
}
function render() {
  renderLocations();
  renderContent();
  renderStats();
}
function clearAll() {
  state.selected.clear();
  state.blocked.clear();
  state.chosen.clear();
  state.config = null;
  $("#configModal").classList.remove("open");
  $("#modal").classList.remove("open");
  render();
}
//#endregion

//#region data loading

async function descargarJSON(loc) {
  const respuesta = await fetch(loc);
  if (!respuesta.ok) {
    throw new Error(`Error al descargar el JSON: ${respuesta.status} ${loc}`);
  }
  return await respuesta.json();
}

// Prefer local package paths; fall back to GitHub raw if needed.
const gh_base_addr = "https://raw.githubusercontent.com/jaloadege/nfsps_ExtendedLanGame/refs/heads/main/";
async function descargarJSONLocal(loc) {
  try {
    return await descargarJSON(`./${loc}`);
  } catch (_) {
    return await descargarJSON(`${gh_base_addr}${loc}`);
  }
}

async function ObtenerJsonCompleto(idiomaStr) {
  const data_lang_global = await descargarJSONLocal(`json/strings/LANGUAGES/${idiomaStr}_Global/strings.json`);
  const data_lang_global_dlc = await descargarJSONLocal(`json/strings/LANGUAGES/${idiomaStr}_Global_DLC/strings.json`);
  const data_lang_global_ingame = await descargarJSONLocal(`json/strings/LANGUAGES/${idiomaStr}_InGame/strings.json`);
  const data_lang_global_front = await descargarJSONLocal(`json/strings/LANGUAGES/${idiomaStr}_Frontend/strings.json`);
  Object.assign(data_lang_global, data_lang_global_dlc, data_lang_global_ingame, data_lang_global_front);
  return data_lang_global;
}

function looksMojibake(s) {
  // NFS ProStreet language packs use a proprietary codepage (not real Unicode
  // CJK/Cyrillic/Hangul). Those bytes land in C1 controls / Latin-1 junk.
  if (s == null) return true;
  const str = String(s);
  if (!str.trim()) return true;
  let bad = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    // C1 controls + common private high-Latin game glyphs mistaken for text
    if ((c >= 0x80 && c <= 0x9f) || c === 0x7f) bad++;
  }
  // If a noticeable share is in the broken range, treat as unreadable
  return bad > 0 && bad >= Math.max(1, Math.floor(str.replace(/\s/g, "").length * 0.25));
}

async function CambiarIdioma(idiomaStr) {
  if (!Object.hasOwn(data_idiomas, idiomaStr) && idiomaStr !== "Labels") {
    console.warn("Idioma desconocido", idiomaStr);
    return;
  }
  const data_lang_global = await ObtenerJsonCompleto(idiomaStr);
  // English fallback when the pack is proprietary-encoded (RU/KR/CN/etc.)
  let data_lang_en = null;
  if (idiomaStr !== "English") {
    try { data_lang_en = await ObtenerJsonCompleto("English"); } catch (_) { /* optional */ }
  }
  const data_labels_global_utiles_temp = JSON.parse(JSON.stringify(data_labels_global_utiles));
  for (const label_global_utiles_key of Object.keys(data_labels_global_utiles_temp)) {
    data_labels_str[label_global_utiles_key] = data_labels_global_utiles_temp[label_global_utiles_key];
  }
  for (const label_key of Object.keys(data_labels_str)) {
    const label_dict_actual = data_labels_global_utiles[label_key];
    for (const label_itm_key of Object.keys(label_dict_actual)) {
      const label_str = label_dict_actual[label_itm_key];
      let resolved = Object.hasOwn(data_lang_global, label_str) ? data_lang_global[label_str] : null;
      if (resolved == null || looksMojibake(resolved)) {
        if (data_lang_en && Object.hasOwn(data_lang_en, label_str)) {
          resolved = data_lang_en[label_str];
        }
      }
      if (resolved != null && !looksMojibake(resolved)) {
        data_labels_str[label_key][label_itm_key] = resolved;
      }
    }
  }

  // Race variant labels
  raceVariants.Grip = {
    default: "Grip",
    variants: {
      Grip: data_labels_str.tipo[data_modos.Grip] || "Grip",
      TimeAttack: data_labels_str.tipo[data_modos.TimeAttack] || "Time Attack",
      Shootout: data_labels_str.tipo[data_modos.Shootout] || "Sector Shootout",
      GripClass: data_labels_str.tipo[data_modos.GripClass] || "Group",
    }
  };
  raceVariants.Drag14 = {
    default: "Drag14",
    variants: {
      Drag14: data_labels_str.tipo[data_modos.Drag14] || "1/4 Mile",
      Wheelie: data_labels_str.tipo[data_modos.Wheelie] || "Wheelie",
    }
  };
  raceVariants.Drag12 = {
    default: "Drag12",
    variants: {
      Drag12: data_labels_str.tipo[data_modos.Drag12] || "1/2 Mile",
    }
  };
  raceVariants.Drift = {
    default: "Drift",
    variants: {
      Drift: data_labels_str.tipo[data_modos.Drift] || "Drift",
    }
  };
  raceVariants.Speed = {
    default: "Speed",
    variants: {
      Speed: data_labels_str.tipo[data_modos.Speed] || "Speed",
      TopSpeed: data_labels_str.tipo[data_modos.TopSpeed] || "Top Speed",
    }
  };

  // Difficulty display strings (keep rank indices stable)
  // Spanish keys FACIL/NORMAL/... remain the lookup keys
  if (idiomaStr === "Spanish") {
    diffRank[0] = "FACIL";
    diffRank[1] = "NORMAL";
    diffRank[2] = "DIFICIL";
    diffRank[3] = "EXPERTO";
    diffRank[4] = "IMPOSIBLE";
  } else {
    diffRank[0] = data_labels_str.extra[data_modos.FACIL] || "FACIL";
    diffRank[1] = data_labels_str.extra[data_modos.NORMAL] || "NORMAL";
    diffRank[2] = data_labels_str.extra[data_modos.DIFICIL] || "DIFICIL";
    diffRank[3] = data_labels_str.extra[data_modos.EXPERTO] || "EXPERTO";
    diffRank[4] = data_labels_str.extra[data_modos.IMPOSIBLE] || "IMPOSIBLE";
  }

  modeLabel[modos.Grip] = data_labels_str.extra[data_modos[modos.Grip]] || "Grip";
  modeLabel[modos.Drift] = data_labels_str.extra[data_modos[modos.Drift]] || "Drift";
  modeLabel[modos.Drag] = data_labels_str.extra[data_modos[modos.Drag]] || "Drag";
  modeLabel[modos.Speed] = data_labels_str.extra[data_modos[modos.Speed]] || "Speed";

  // Also expose modeType shorthand icons labels
  icons.Grip = icons[modos.Grip] || "↻";
  icons.Drift = icons[modos.Drift] || "〰";
  icons.Drag = icons[modos.Drag] || "↕";
  icons.Drag14 = icons[modos.Drag] || "↕";
  icons.Drag12 = icons[modos.Drag] || "↕";
  icons.Speed = icons[modos.Speed] || "⌁";

  state.lang = idiomaStr;
  const sel = $("#langSelect");
  if (sel && sel.value !== idiomaStr) sel.value = idiomaStr;
}

//#endregion

const DATA = {
  locations: {},
  cars: {},
  difficultyByZone: null, // zone_id -> rank 0-4
};
const raceVariants = {
  Grip: {},
  Drag14: {},
  Drag12: {},
  Drift: {},
  Speed: {},
};

const state = {
  location: null,
  mode: null,
  selected: new Map(),
  blocked: new Set(),
  chosen: new Set(),
  sort: "mode",
  query: "",
  config: null,
  lang: "Spanish",
};
const $ = (s) => document.querySelector(s);

//#region pseudo enums

const data_idiomas = Object.freeze({
  Chinese_Simp: "Chinese_Simp",
  Chinese_Trad: "Chinese_Trad",
  Czech: "Czech",
  Danish: "Danish",
  Dutch: "Dutch",
  English: "English",
  Finnish: "Finnish",
  French: "French",
  German: "German",
  Hungarian: "Hungarian",
  Italian: "Italian",
  Korean: "Korean",
  Mexican: "Mexican",
  Norwegian: "Norwegian",
  Polish: "Polish",
  Russian: "Russian",
  Spanish: "Spanish",
  Swedish: "Swedish",
});

const modos = Object.freeze({
  Grip: "GripMode",
  Drift: "DriftMode",
  Drag: "DragMode",
  Speed: "SpeedMode",
});

const data_modos = {
  RACE_NAME_001_SHORT: "Drag_1_4",
  RACE_NAME_002_SHORT: "Drag_1_2",
  RACE_NAME_004_SHORT: "Drift",
  RACE_NAME_007_SHORT: "Grip",
  RACE_NAME_010_SHORT: "Grip_class",
  RACE_NAME_016_SHORT: "Shootout",
  RACE_NAME_018_SHORT: "Speed",
  RACE_NAME_024_SHORT: "Time_attack",
  RACE_NAME_025_SHORT: "Top_Speed",
  RACE_NAME_028_SHORT: "Wheelie",
  // reverse
  Drag14: "RACE_NAME_001_SHORT",
  Drag12: "RACE_NAME_002_SHORT",
  Drift: "RACE_NAME_004_SHORT",
  Grip: "RACE_NAME_007_SHORT",
  GripClass: "RACE_NAME_010_SHORT",
  Shootout: "RACE_NAME_016_SHORT",
  Speed: "RACE_NAME_018_SHORT",
  TimeAttack: "RACE_NAME_024_SHORT",
  TopSpeed: "RACE_NAME_025_SHORT",
  Wheelie: "RACE_NAME_028_SHORT",
  // difficulty labels in game files
  FACIL: "HUB_DIFFICULTY_1",
  NORMAL: "HUB_DIFFICULTY_1",
  DIFICIL: "HUB_DIFFICULTY_2",
  EXPERTO: "HUB_DIFFICULTY_3",
  IMPOSIBLE: "HUB_DIFFICULTY_3",
  CUST_BLUEPRINT_MODE_GRIP: modos.Grip,
  CUST_BLUEPRINT_MODE_DRIFT: modos.Drift,
  CUST_BLUEPRINT_MODE_DRAG: modos.Drag,
  CUST_BLUEPRINT_MODE_SPEED: modos.Speed,
};
data_modos[modos.Grip] = "CUST_BLUEPRINT_MODE_GRIP";
data_modos[modos.Drift] = "CUST_BLUEPRINT_MODE_DRIFT";
data_modos[modos.Drag] = "CUST_BLUEPRINT_MODE_DRAG";
data_modos[modos.Speed] = "CUST_BLUEPRINT_MODE_SPEED";

// Bidirectional difficulty rank. Spanish keys are stable identifiers.
const diffRank = {
  FACIL: 0,
  NORMAL: 1,
  DIFICIL: 2,
  EXPERTO: 3,
  IMPOSIBLE: 4,
  0: "FACIL",
  1: "NORMAL",
  2: "DIFICIL",
  3: "EXPERTO",
  4: "IMPOSIBLE",
};

const modeLabel = {};
const modeOrder = {};
modeOrder[modos.Grip] = 0;
modeOrder[modos.Drift] = 1;
modeOrder[modos.Drag] = 2;
modeOrder[modos.Speed] = 3;

const icons = {};
icons[modos.Grip] = "↻";
icons[modos.Drift] = "〰";
icons[modos.Drag] = "↕";
icons[modos.Speed] = "⌁";
icons.Grip = "↻";
icons.Drift = "〰";
icons.Drag = "↕";
icons.Drag14 = "↕";
icons.Drag12 = "↕";
icons.Speed = "⌁";

Object.freeze(modeOrder);
Object.freeze(data_modos);

//#endregion

const data_labels_str = {
  tipo_largo: {},
  tipo: {},
  hub: {},
  hub_lower: {},
  calelas: {},
  autos: {},
  oponentees: {},
  extra: {},
};
const data_labels_global_utiles = JSON.parse(JSON.stringify(data_labels_str));

function populateLangSelect() {
  const sel = $("#langSelect");
  if (!sel) return;
  const labels = {
    Chinese_Simp: "中文 (简体)",
    Chinese_Trad: "中文 (繁體)",
    Czech: "Čeština",
    Danish: "Dansk",
    Dutch: "Nederlands",
    English: "English",
    Finnish: "Suomi",
    French: "Français",
    German: "Deutsch",
    Hungarian: "Magyar",
    Italian: "Italiano",
    Korean: "한국어",
    Mexican: "Español (México)",
    Norwegian: "Norsk",
    Polish: "Polski",
    Russian: "Русский",
    Spanish: "Español",
    Swedish: "Svenska",
  };
  sel.innerHTML = Object.keys(data_idiomas).map(k =>
    `<option value="${k}">${labels[k] || k}</option>`
  ).join("");
  sel.value = state.lang || "Spanish";
}

window.addEventListener("load", async () => {
  // Label keys catalog (hash id → LABEL_NAME)
  const data_labels_global_temp = await ObtenerJsonCompleto("Labels");

  for (const label_global_key of Object.keys(data_labels_global_temp)) {
    const val = String(data_labels_global_temp[label_global_key]);
    if (val.match(/RACE_NAME_[0-9]{0,9}$/)) {
      data_labels_global_utiles.tipo_largo[val] = label_global_key;
    } else if (val.match(/RACE_NAME_[0-9]{0,9}_SHORT/)) {
      data_labels_global_utiles.tipo[val] = label_global_key;
    } else if (val.match(/HUB_NAME_[0-9]{0,9}$/)) {
      data_labels_global_utiles.hub[val] = label_global_key;
    } else if (val.match(/HUB_NAME_LOWER_/)) {
      data_labels_global_utiles.hub_lower[val] = label_global_key;
    } else if (val.match(/TRACK_CONFIG_/)) {
      data_labels_global_utiles.calelas[val] = label_global_key;
    } else if (val.match(/CARNAME_/)) {
      data_labels_global_utiles.autos[val] = label_global_key;
    } else if (val.match(/ELITENAME_/)) {
      data_labels_global_utiles.oponentees[val] = label_global_key;
    } else if (val.match(/^RACERNAME_/)) {
      data_labels_global_utiles.oponentees[val] = label_global_key;
    } else if (val.match(/BOOST_RACERNAME_/)) {
      data_labels_global_utiles.oponentees[val] = label_global_key;
    } else if (val.match(/CUST_BLUEPRINT_MODE_/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    } else if (val.match(/HUB_DIFFICULTY_/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    } else if (val.match(/HUB_TRACKPREVIEW_ROUNDS/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    } else if (val.match(/HUB_TRACKPREVIEW_LAPS/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    } else if (val.match(/TUT_CAREER_002_HEADER/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    } else if (val.match(/RACEDAY_SCREEN_DIFFICULTY/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    } else if (val.match(/COMMON_ABBREV_KPH/)) {
      data_labels_global_utiles.extra[val] = label_global_key;
    }
  }

  populateLangSelect();
  await CambiarIdioma(data_idiomas.Spanish);

  DATA.locations = await descargarJSONLocal("json/info_locations.json");

  // Difficulty ranks by zone id: { locations: { "Autobahnring": [ { zone, difficulty } ] } }
  try {
    const diffData = await descargarJSONLocal("json/dificultad.json");
    if (diffData?.locations) {
      const byZone = {};
      for (const zones of Object.values(diffData.locations)) {
        for (const entry of zones) {
          if (entry?.zone != null && entry.difficulty != null) {
            byZone[entry.zone] = Number(entry.difficulty);
          }
        }
      }
      DATA.difficultyByZone = byZone;
    }
  } catch (_) { /* optional */ }

  const keys = locationKeys();
  state.location = keys[0] ?? null;
  state.mode = null;
  state.selected = new Map();
  state.blocked = new Set();
  state.chosen = new Set();
  state.sort = "mode";
  state.query = "";
  state.config = null;

  $("#search").addEventListener("input", e => { state.query = e.target.value.trim().toLowerCase(); render(); });
  $("#sort").addEventListener("change", e => { state.sort = e.target.value; renderContent(); });
  $("#reset").addEventListener("click", clearAll);
  $("#accept").addEventListener("click", () => { renderSelected(); $("#modal").classList.add("open"); });
  $("#close").addEventListener("click", () => $("#modal").classList.remove("open"));
  $("#clearClose").addEventListener("click", clearAll);
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").classList.remove("open"); });
  $("#configClose").addEventListener("click", () => { $("#configModal").classList.remove("open"); state.config = null; });
  $("#confirmZone").addEventListener("click", saveConfig);
  $("#configModal").addEventListener("click", e => {
    if (e.target.id === "configModal") { $("#configModal").classList.remove("open"); state.config = null; }
  });
  const langSel = $("#langSelect");
  if (langSel) {
    langSel.addEventListener("change", async e => {
      const v = e.target.value;
      try {
        await CambiarIdioma(v);
        render();
        if (state.config) renderConfig();
      } catch (err) {
        console.error(err);
        alert("No se pudo cargar el idioma: " + v);
      }
    });
  }

  document.addEventListener("click", e => {
    const block = e.target.closest("[data-block]");
    if (block) { toggleBlocked(block.getAttribute("data-block")); return; }
    const choose = e.target.closest("[data-choose]");
    if (choose) { toggleChosen(choose.getAttribute("data-choose")); return; }
    const loc = e.target.closest("[data-loc]");
    if (loc) { state.location = loc.getAttribute("data-loc"); state.mode = null; render(); return; }
    const modeBtn = e.target.closest(".modebar [data-mode]");
    if (modeBtn) {
      const m = modeBtn.getAttribute("data-mode");
      state.mode = m || null;
      renderContent();
      return;
    }
    const zone = e.target.closest("[data-zone]");
    if (zone && !zone.disabled) { onZonePick(zone.getAttribute("data-zone")); return; }
    const variant = e.target.closest("[data-variant]");
    if (variant && state.config) { state.config.variant = variant.getAttribute("data-variant"); renderConfig(); return; }
    const laps = e.target.closest("[data-laps]");
    if (laps && state.config) { state.config.laps = Number(laps.getAttribute("data-laps")); renderConfig(); return; }
  });

  document.addEventListener("input", e => {
    if (!state.config) return;
    if (e.target && e.target.id === "lapRange") {
      const n = Number(e.target.value) || 1;
      state.config.laps = n;
      const val = $("#lapRangeVal");
      if (val) val.textContent = String(n);
    }
  });

  render();
});
