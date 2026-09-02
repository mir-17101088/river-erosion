/* =============================================================
   Rivers that move — interaction layer
   No scroll listeners: IntersectionObserver + rAF only.
   ============================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAST = 70;

  /* Run cb once, shortly before el scrolls into view. Falls back to running now
     where IntersectionObserver is missing. Used to defer the heavy Leaflet maps. */
  function whenNear(el, cb, margin) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(); return; }
    var io = new IntersectionObserver(function (e, o) {
      if (e[0].isIntersecting) { o.disconnect(); cb(); }
    }, { rootMargin: (margin || '600px') + ' 0px' });
    io.observe(el);
  }

  document.getElementById('year') &&
    (document.getElementById('year').textContent = new Date().getFullYear());

  /* ---------- Masthead: shrink on scroll (sentinel) ---------- */
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:64px;pointer-events:none;';
  document.body.appendChild(sentinel);
  new IntersectionObserver(function (e) {
    document.body.dataset.scroll = e[0].isIntersecting ? 'top' : 'down';
  }, { threshold: 0 }).observe(sentinel);

  /* ---------- Masthead: light/dark theme follows the section at the top ---------- */
  var masthead = document.querySelector('.masthead');
  var themed = [].slice.call(document.querySelectorAll('[data-theme]'));
  function updateMastTheme() {
    var line = 64; // just below the shrunk masthead
    for (var i = themed.length - 1; i >= 0; i--) {
      var r = themed[i].getBoundingClientRect();
      if (r.top <= line && r.bottom > line) {
        masthead.dataset.on = themed[i].getAttribute('data-theme');
        return;
      }
    }
  }
  var themeObs = new IntersectionObserver(updateMastTheme,
    { rootMargin: '-' + MAST + 'px 0px -80% 0px', threshold: [0, 1] });
  themed.forEach(function (el) { themeObs.observe(el); });
  updateMastTheme();

  /* ---------- Generic reveal ---------- */
  var revealObs = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('is-in'); obs.unobserve(en.target); }
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal, .estimates, .riskstats, .minibars').forEach(function (el) {
    el.classList.add('reveal-target'); revealObs.observe(el);
  });

  /* ---------- Count-up numbers ---------- */
  function countUp(el) {
    var raw = el.getAttribute('data-count');
    var target = parseFloat(raw);
    if (isNaN(target)) return;
    var hasComma = /,/.test(el.textContent) || target >= 1000;
    if (reduce) { el.textContent = format(target); return; }
    var dur = 1100, start = null;
    function fmtNow(v) { return format(Math.round(v)); }
    function format(v) { return hasComma ? v.toLocaleString('en-US') : String(v); }
    function tick(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNow(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var countObs = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { countUp(en.target); obs.unobserve(en.target); }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach(function (el) { countObs.observe(el); });

  /* ---------- Section 1: Maxar satellite scrollytelling ---------- */
  var scrolly1 = document.getElementById('scrolly1');
  var mapOne = null;
  var lastBeat = { scene: 'rivers', state: '1' };
  function buildMapOneDeferred() {
    if (mapOne || !scrolly1 || !document.getElementById('mapone') || !window.L) return;
    try {
      mapOne = buildMapOne();
      if (mapOne && mapOne.applyScene) mapOne.applyScene(lastBeat.scene, lastBeat.state);
    } catch (e) { console.warn('Section 1 map failed', e); }
  }
  // Build the satellite map shortly before Section 1 enters view — keeps first paint light
  whenNear(scrolly1, buildMapOneDeferred, '800px');
  function applyBeat(scene, state) {
    if (!scrolly1) return;
    lastBeat.scene = scene; lastBeat.state = state;
    scrolly1.dataset.scene = scene;
    scrolly1.dataset.marks = (scene === 'rivers' && state === '2') ? '1' : '0';
    scrolly1.dataset.recede = (scene === 'dhaka' || scene === 'share') ? '1' : '0';
    if (mapOne && mapOne.applyScene) mapOne.applyScene(scene, state);
  }
  // Draw the river paths in only when the map scrolls into view (not on load, off-screen)
  if (scrolly1) {
    new IntersectionObserver(function (e, o) {
      if (e[0].isIntersecting) { scrolly1.dataset.drawn = '1'; o.disconnect(); }
    }, { threshold: 0.08 }).observe(scrolly1);
  }
  var s1steps = [].slice.call(document.querySelectorAll('.scrolly--map .scrolly__steps .step'));
  function setActiveStep(idx) {
    s1steps.forEach(function (st, i) {
      st.classList.toggle('is-active', i === idx);
      st.classList.toggle('is-past', i < idx);
    });
    var st = s1steps[idx];
    if (st) applyBeat(st.getAttribute('data-scene'), st.getAttribute('data-state'));
  }
  var s1obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        var idx = s1steps.indexOf(en.target);
        if (idx > -1) setActiveStep(idx);
      }
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  s1steps.forEach(function (s) { s1obs.observe(s); });
  if (s1steps.length) applyBeat('rivers', '1');

  /* ---------- Hero video: gentle slow-down; pause under reduced motion ---------- */
  var heroVid = document.querySelector('.hero__video');
  if (heroVid) {
    if (reduce) {
      try { heroVid.pause(); heroVid.removeAttribute('autoplay'); } catch (e) {}
    } else {
      var setHeroRate = function () { try { heroVid.playbackRate = 0.36; } catch (e) {} };
      heroVid.addEventListener('loadedmetadata', setHeroRate);
      setHeroRate();
    }
  }

  /* ---------- Site videos: loop the timelapse, holding 3s on the final frame ---------- */
  document.querySelectorAll('.sitefig').forEach(function (fig) {
    var vid = fig.querySelector('video');
    if (!vid) return;
    vid.loop = false;
    if (reduce) { return; } // poster stays; no autoplay under reduced motion
    var HOLD = 3000, holdTimer = null, holding = false, inView = false;
    function play() { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
    function replay() { try { vid.currentTime = 0; } catch (e) {} holding = false; play(); }
    vid.addEventListener('ended', function () {
      holding = true;                 // freeze on the final (2026) frame
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { holding = false; if (inView) replay(); }, HOLD);
    });
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        inView = en.isIntersecting;
        if (inView) {
          vid.preload = 'auto';
          if (!holding) { if (vid.ended) replay(); else play(); }
        } else {
          vid.pause();
        }
      });
    }, { threshold: 0.4 }).observe(fig);
  });

  /* ---------- Bholar Basti carousel (Section 2) ---------- */
  (function initCarousel() {
    var root = document.getElementById('bholaCarousel');
    if (!root) return;
    var slides = [].slice.call(root.querySelectorAll('.carousel__slide'));
    var dots = [].slice.call(root.querySelectorAll('.carousel__dot'));
    var prev = root.querySelector('.carousel__nav--prev');
    var next = root.querySelector('.carousel__nav--next');
    if (slides.length < 2) return;
    var i = 0, timer = null, inView = false, DELAY = 5200;

    function show(n) {
      n = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        s.classList.toggle('is-active', k === n);
        s.setAttribute('aria-hidden', k === n ? 'false' : 'true');
      });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === n);
        d.setAttribute('aria-selected', k === n ? 'true' : 'false');
      });
      i = n;
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function auto() { stop(); if (reduce || !inView) return; timer = setInterval(function () { show(i + 1); }, DELAY); }
    function go(n) { show(n); auto(); }

    if (prev) prev.addEventListener('click', function () { go(i - 1); });
    if (next) next.addEventListener('click', function () { go(i + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', auto);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', auto);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    });

    show(0);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        inView = e[0].isIntersecting;
        if (inView) auto(); else stop();
      }, { threshold: 0.25 }).observe(root);
    } else { inView = true; auto(); }
  })();

  /* ---------- Back to top ---------- */
  (function initToTop() {
    var btn = document.getElementById('toTop');
    if (!btn) return;
    btn.hidden = false; // visibility now driven by the .is-in class
    btn.addEventListener('click', function () {
      try { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    });
    var hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        btn.classList.toggle('is-in', !e[0].isIntersecting);
      }, { threshold: 0 }).observe(hero);
    } else {
      btn.classList.add('is-in');
    }
  })();

  /* ---------- Section 3: interactive index map (built just before it enters view) ---------- */
  var mapEl = document.getElementById('indexmap');
  if (mapEl && window.L) whenNear(document.getElementById('mapblock') || mapEl, buildMap, '800px');

  function buildMap() {
    var riverColor = { Jamuna: '#7fa3ad', Ganges: '#c97c5d', Padma: '#a13c23' };
    var mapblock = document.getElementById('mapblock');
    var frame = document.querySelector('.mapblock__frame');

    var map = L.map('indexmap', {
      zoomControl: false, attributionControl: true,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      minZoom: 6, maxZoom: 14
    });
    map.getContainer().setAttribute('tabindex', '0');

    // detectRetina: on 2x/3x screens Leaflet requests one zoom level deeper and
    // renders it at half size, so the imagery stays sharp when zoomed into a site
    // (256px raster tiles otherwise upscale and look blurry on high-DPI displays).
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 17, detectRetina: true, updateWhenZooming: false, keepBuffer: 4 }
    ).addTo(map);
    // faint place labels for orientation — {r} pulls CARTO's native @2x tiles on
    // high-DPI screens (no detectRetina here, or it would double up with {r})
    L.tileLayer(
      'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap, &copy; CARTO', opacity: 0.55, maxZoom: 19, updateWhenZooming: false }
    ).addTo(map);

    var siteList = document.getElementById('sitelist');
    var sideEl = document.getElementById('mapside');
    var markers = {};
    var homeCenter = null, homeZoom = null, homeBounds = null, resetBtn = null;

    // On desktop the site list overlays the right, so reserve that width when fitting —
    // the eleven markers then land in the clear left region and never sit under the panel.
    function isWide() { return window.matchMedia('(min-width:861px)').matches; }
    function sidePad() { return (isWide() && sideEl) ? Math.round(sideEl.getBoundingClientRect().width) + 40 : 0; }
    function fitOpts() { return { paddingTopLeft: L.point(46, 56), paddingBottomRight: L.point(46 + sidePad(), 46) }; }

    /* Reset control — replaces the +/- zoom buttons. Appears only once zoomed in. */
    var ResetCtrl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var b = L.DomUtil.create('button', 'map-reset');
        b.type = 'button';
        b.hidden = true;
        b.setAttribute('aria-label', 'Reset the map to show all eleven sites');
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.4v3.8h3.8"/></svg><span>Reset</span>';
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', function () { resetView(); });
        resetBtn = b;
        return b;
      }
    });
    map.addControl(new ResetCtrl());

    function resetView() {
      map.closePopup();
      if (homeCenter != null) map.flyTo(homeCenter, homeZoom, { duration: 0.8 });
      closeMenu();
    }
    function updateResetVisibility() {
      if (!resetBtn || homeZoom == null) return;
      resetBtn.hidden = map.getZoom() <= homeZoom + 0.25;
    }
    map.on('zoomend moveend', updateResetVisibility);

    /* Mobile: the "Sites" button opens the list as a panel over the map */
    var menuBtn = document.getElementById('mapmenu');
    function openMenu() { if (mapblock) { mapblock.classList.add('menu-open'); if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true'); } }
    function closeMenu() { if (mapblock) { mapblock.classList.remove('menu-open'); if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false'); } }
    function toggleMenu() { if (mapblock && mapblock.classList.contains('menu-open')) closeMenu(); else openMenu(); }
    if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
    map.on('click', closeMenu);

    function popupMaxWidth() { var w = frame ? frame.clientWidth : 320; return Math.max(180, Math.min(244, w - 52)); }

    fetch('assets/erosion_points_2026.geojson')
      .then(function (r) { return r.json(); })
      .then(function (gj) {
        var pts = gj.features.filter(function (f) { return f.properties.geom_role === 'marker'; });
        var foot = gj.features.filter(function (f) { return f.properties.geom_role === 'footprint'; });
        var bounds = [];

        // AOI footprints (faint)
        foot.forEach(function (f) {
          var latlngs = f.geometry.coordinates[0].map(function (c) { return [c[1], c[0]]; });
          L.polygon(latlngs, {
            color: '#a13c23', weight: 1, opacity: 0.5, fillColor: '#a13c23',
            fillOpacity: 0.06, interactive: false
          }).addTo(map);
        });

        pts.forEach(function (f, i) {
          var p = f.properties, c = f.geometry.coordinates, ll = [c[1], c[0]];
          bounds.push(ll);
          var col = riverColor[p.river] || '#a13c23';
          var icon = L.divIcon({
            className: '', iconSize: [18, 18], iconAnchor: [9, 9],
            html: '<span class="tds-pin" style="display:block;width:14px;height:14px;background:' + col +
              ';animation-delay:' + (i * 60) + 'ms"></span>'
          });
          var m = L.marker(ll, { icon: icon, keyboard: true, title: label(p) }).addTo(map);
          m.bindPopup(popupHtml(p), {
            closeButton: true, maxWidth: popupMaxWidth(),
            autoPan: true, keepInView: true,
            autoPanPaddingTopLeft: L.point(24, 74),
            autoPanPaddingBottomRight: L.point(24 + sidePad(), 24)
          });
          m.on('popupopen', function () { highlight(p.id); closeMenu(); });
          markers[p.id + '_' + i] = { marker: m, id: p.id };
          m._siteKey = p.id;

          // list item
          var li = document.createElement('li');
          li.className = 'siteitem';
          li.innerHTML =
            '<button class="siteitem__btn" data-id="' + p.id + '">' +
            '<span class="siteitem__pin" data-river="' + p.river + '"></span>' +
            '<span class="siteitem__place">' + placeName(p) +
            '<small>' + p.district + ' &middot; ' + p.river + ' &middot; ' + p.bank + ' bank</small></span>' +
            '<span class="siteitem__ha">' + p.id + '</span>' +
            '</button>';
          li.querySelector('button').addEventListener('click', function () {
            closeMenu();
            map.flyTo(ll, 12, { duration: 0.9 });
            m.openPopup();
            highlight(p.id);
          });
          siteList.appendChild(li);
        });

        homeBounds = bounds;
        map.fitBounds(bounds, fitOpts());
        if (map.getZoom() > 9) map.setZoom(8);
        homeCenter = map.getCenter();
        homeZoom = map.getZoom();
        updateResetVisibility();

        // drop-in animation gate: add class once map visible
        if (!reduce) {
          new IntersectionObserver(function (e, o) {
            if (e[0].isIntersecting) { mapEl.classList.add('pins-in'); o.disconnect(); }
          }, { threshold: 0.2 }).observe(mapEl);
        }
      })
      .catch(function (err) { console.warn('Map data failed to load', err); });

    // Re-fit on resize so the panel's reserved width tracks the viewport — but only near home,
    // so a resize while zoomed into a site doesn't yank the view.
    var rsz;
    window.addEventListener('resize', function () {
      clearTimeout(rsz);
      rsz = setTimeout(function () {
        map.invalidateSize(false);
        if (homeBounds && homeZoom != null && map.getZoom() <= homeZoom + 0.3) {
          map.fitBounds(homeBounds, fitOpts());
          if (map.getZoom() > 9) map.setZoom(8);
          homeCenter = map.getCenter();
          homeZoom = map.getZoom();
          updateResetVisibility();
        }
      }, 180);
    });

    function highlight(id) {
      document.querySelectorAll('.siteitem__btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-id') === id);
      });
    }
    function label(p) { return (placeName(p)) + ', ' + p.district; }
    function placeName(p) { return p.site_name && p.site_name.length ? p.site_name : p.upazila; }
    function popupHtml(p) {
      var note = p.note && p.note.length ? '<p class="popup__note">' + p.note + '</p>' : '';
      return '<p class="popup__river">' + p.river + ' &middot; ' + p.bank + ' bank</p>' +
        '<p class="popup__place">' + placeName(p) + '</p>' +
        '<p class="popup__dist">' + p.upazila + ', ' + p.district + '</p>' +
        '<div class="popup__figs">' +
        '<div class="popup__fig"><b>' + p.river_land_2026_ha + ' ha</b><span>land at risk, river total</span></div>' +
        '<div class="popup__fig"><b>' + p.river_eroded_2025_ha + ' ha</b><span>eroded in 2025</span></div>' +
        '</div>' + note;
    }
  }

  /* ---------- Section 1: build the locked Maxar map + projected overlay ---------- */
  function buildMapOne() {
    var el = document.getElementById('mapone');
    var stage = el.closest('.scrolly__stage');
    var NS = 'http://www.w3.org/2000/svg';
    var DHAKA = [23.8103, 90.4125];
    // where each river's proportional "share" circle sits, near its own reach
    var SHARE_CENTER = { jamuna: [24.92, 89.66], ganges: [24.42, 88.35], padma: [23.66, 90.32] };
    var SHARE_HA = { jamuna: 94150, ganges: 30482, padma: 33885 };

    // scene/state the overlay is drawing for, plus the logical camera target and home framing
    var sceneNow = 'rivers', stateNow = '1';
    var camState = 'home', camRAF = null;
    var homeCenterLL = null, homeZoomN = null, homeBnds = null;

    var map = L.map(el, {
      zoomControl: false, attributionControl: true,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, tap: false,
      zoomSnap: 0, fadeAnimation: true, inertia: false
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri, Maxar', maxZoom: 17, detectRetina: true, keepBuffer: 3 }).addTo(map);
    map.setView([24.05, 89.3], 7); // provisional view so projection is valid before fitBounds

    function mk(tag) { return document.createElementNS(NS, tag); }
    var svg = mk('svg'); svg.setAttribute('class', 'moverlay'); stage.appendChild(svg);
    var gRivers = mk('g'), gMarks = mk('g'), gCircles = mk('g'), gLabels = mk('g');
    gMarks.setAttribute('class', 'moverlay__marks');
    svg.appendChild(gRivers); svg.appendChild(gMarks); svg.appendChild(gCircles); svg.appendChild(gLabels);

    var riverPaths = {};
    ['jamuna', 'ganges', 'padma'].forEach(function (k) {
      var p = mk('path'); p.setAttribute('class', 'moverlay__riv moverlay__riv--' + k);
      gRivers.appendChild(p); riverPaths[k] = p;
    });

    var chips = {};
    ['Jamuna', 'Ganges', 'Padma'].forEach(function (name) {
      var d = document.createElement('div');
      d.className = 'rivchip rivchip--' + name.toLowerCase();
      d.textContent = name; d.setAttribute('aria-hidden', 'true');
      stage.appendChild(d); chips[name] = d;
    });

    function addCircle(cls) { var c = mk('circle'); c.setAttribute('class', cls); gCircles.appendChild(c); return c; }
    var circles = {
      unit: addCircle('mcircle mcircle--unit'),
      gross: addCircle('mcircle mcircle--gross'),
      net: addCircle('mcircle mcircle--net'),
      jamuna: addCircle('mcircle mcircle--jamuna'),
      ganges: addCircle('mcircle mcircle--ganges'),
      padma: addCircle('mcircle mcircle--padma')
    };
    function addLabel() {
      var g = mk('g'); g.setAttribute('class', 'mlabel');
      var t1 = mk('text'); t1.setAttribute('class', 'mlabel__big');
      var t2 = mk('text'); t2.setAttribute('class', 'mlabel__sub');
      g.appendChild(t1); g.appendChild(t2); gLabels.appendChild(g);
      return { g: g, big: t1, sub: t2 };
    }
    var labels = { dhaka: addLabel(), gross: addLabel(), jamuna: addLabel(), ganges: addLabel(), padma: addLabel() };

    var rivers = null, marks = [];
    function rKm(areaKm2) { return Math.sqrt(areaKm2 / Math.PI); }

    fetch('3 rivers.kml').then(function (r) { return r.text(); }).then(function (txt) {
      rivers = parseKml(txt);
      fetch('assets/erosion_points_2026.geojson').then(function (r) { return r.json(); }).then(function (gj) {
        gj.features.filter(function (f) { return f.properties.geom_role === 'marker'; }).forEach(function (f) {
          var c = mk('circle'); c.setAttribute('class', 'moverlay__mark'); c.setAttribute('r', '4.5');
          gMarks.appendChild(c);
          marks.push({ el: c, ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]] });
        });
        fitAndLayout();
      }).catch(fitAndLayout);
    }).catch(function () { fitAndLayout(); });

    function fitAndLayout() {
      var pts = [];
      if (rivers) Object.keys(rivers).forEach(function (k) { pts = pts.concat(rivers[k]); });
      pts.push(DHAKA);
      if (pts.length > 1) { homeBnds = L.latLngBounds(pts); map.fitBounds(homeBnds, { padding: [26, 26], animate: false }); }
      map.invalidateSize(false);
      homeCenterLL = map.getCenter(); homeZoomN = map.getZoom();
      layout();
    }

    function project(ll) { return map.latLngToContainerPoint(L.latLng(ll[0], ll[1])); }
    function pxPerMeter() {
      var c = map.getCenter();
      var a = map.latLngToContainerPoint(c);
      var b = map.latLngToContainerPoint(L.latLng(c.lat, c.lng + 0.2));
      var meters = map.distance(c, L.latLng(c.lat, c.lng + 0.2)) || 1;
      return Math.abs(b.x - a.x) / meters;
    }
    function setCircle(c, p, r) { c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); c.setAttribute('r', Math.max(2, r).toFixed(1)); }
    function placeChip(name, frac) {
      var pts = rivers && rivers[name]; if (!pts) return;
      var idx = Math.min(pts.length - 1, Math.max(0, Math.round(pts.length * frac)));
      var p = project(pts[idx]);
      chips[name].style.left = p.x + 'px'; chips[name].style.top = p.y + 'px';
    }
    function placeLabel(lab, p, big, sub, mode, r) {
      var yBig = (mode === 'above') ? (p.y - r - 12) : (p.y - 3);
      lab.big.setAttribute('x', p.x); lab.big.setAttribute('y', yBig); lab.big.textContent = big;
      lab.big.setAttribute('font-size', mode === 'above' ? 15 : 17);
      lab.sub.setAttribute('x', p.x); lab.sub.setAttribute('y', yBig + 16); lab.sub.textContent = sub;
      lab.sub.setAttribute('font-size', 11.5);
    }

    function layout() {
      var size = map.getSize();
      svg.style.width = size.x + 'px'; svg.style.height = size.y + 'px';
      if (rivers) {
        var keymap = { jamuna: 'Jamuna', ganges: 'Ganges', padma: 'Padma' };
        Object.keys(riverPaths).forEach(function (k) {
          var pts = rivers[keymap[k]]; if (!pts) return;
          var d = 'M' + pts.map(function (ll) { var p = project(ll); return p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' L');
          var path = riverPaths[k];
          path.setAttribute('d', d);
          try { path.style.setProperty('--len', path.getTotalLength()); } catch (e) {}
        });
        placeChip('Jamuna', 0.13);
        placeChip('Ganges', 0.20);
        placeChip('Padma', 0.44);
      }
      marks.forEach(function (m) { var p = project(m.ll); m.el.setAttribute('cx', p.x.toFixed(1)); m.el.setAttribute('cy', p.y.toFixed(1)); });

      var ppm = pxPerMeter();
      var rUnit = rKm(270) * 1000 * ppm, rGross = rKm(1585) * 1000 * ppm, rNet = rKm(1153) * 1000 * ppm;

      // Dhaka comparison: rings concentric on the city, drawn to the map's true scale.
      // Seen once the camera has flown in and centred Dhaka, so the 6× ring visibly dwarfs it.
      var dc = project(DHAKA);
      setCircle(circles.gross, dc, rGross);
      setCircle(circles.net, dc, rNet);
      setCircle(circles.unit, dc, rUnit);
      var net2 = (sceneNow === 'dhaka' && stateNow === '2');
      placeLabel(labels.gross, dc,
        net2 ? '4× Dhaka, net' : '6× Dhaka',
        net2 ? '1,153 km² lost after chars return' : '1,585 km² eroded in fifty years',
        'above', rGross);
      placeLabel(labels.dhaka, dc, 'Dhaka', '270 km²', 'center', 0);

      // Share proportional circles (area ∝ hectares eroded), near each river, clear of the card
      var maxR = Math.min(size.x, size.y) * 0.15;
      var maxHa = SHARE_HA.jamuna;
      ['jamuna', 'ganges', 'padma'].forEach(function (k) {
        var p = project(SHARE_CENTER[k]);
        setCircle(circles[k], p, maxR * Math.sqrt(SHARE_HA[k] / maxHa));
      });
      placeLabel(labels.jamuna, project(SHARE_CENTER.jamuna), '59%', 'Jamuna', 'center', 0);
      placeLabel(labels.ganges, project(SHARE_CENTER.ganges), '19%', 'Ganges', 'center', 0);
      placeLabel(labels.padma, project(SHARE_CENTER.padma), '21%', 'Padma', 'center', 0);
    }

    function show(node, on) { node.classList.toggle('show', !!on); }

    /* ---- Camera: fly to Dhaka for the size comparison, back home for the river shares ----
       The map's own animations are disabled, so we tween center+zoom on rAF and re-project the
       overlay every frame — the rings stay glued to the map and grow smoothly as it zooms. */
    function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function dhakaTarget() {
      var size = map.getSize();
      var minDim = Math.min(size.x, size.y);
      var lat = DHAKA[0] * Math.PI / 180;
      var grossRm = rKm(1585) * 1000;               // 6× ring radius, metres
      var wantRpx = 0.19 * minDim;                  // frame it at ~38% of the min viewport dimension
      var mPerPx = grossRm / wantRpx;
      var z = Math.log(40075016.686 * Math.cos(lat) / (256 * mPerPx)) / Math.LN2;
      z = Math.max(4, Math.min(z, 12));
      // seat Dhaka a little above centre so the rings clear the bottom glass card
      var dpt = map.project(DHAKA, z);
      var want = L.point(size.x / 2, size.y * 0.44);
      var centerPt = dpt.subtract(want.subtract(L.point(size.x / 2, size.y / 2)));
      return { center: map.unproject(centerPt, z), zoom: z };
    }

    function flyCamera(center, zoom, dur) {
      if (camRAF) { cancelAnimationFrame(camRAF); camRAF = null; }
      if (!center) { layout(); return; }
      if (reduce) { map.setView(center, zoom, { animate: false }); layout(); return; }
      var fromC = map.getCenter(), fromZ = map.getZoom(), t0 = null;
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1), e = easeIO(p);
        map.setView(
          [fromC.lat + (center.lat - fromC.lat) * e, fromC.lng + (center.lng - fromC.lng) * e],
          fromZ + (zoom - fromZ) * e,
          { animate: false }
        );
        layout();
        camRAF = p < 1 ? requestAnimationFrame(frame) : null;
      }
      camRAF = requestAnimationFrame(frame);
    }

    function goCamera(which) {
      if (which === camState) return;
      camState = which;
      map.invalidateSize(false); // ensure getSize() is fresh so the target is computed for the real stage
      if (which === 'dhaka') { var t = dhakaTarget(); flyCamera(t.center, t.zoom, 1250); }
      else if (homeBnds) { flyCamera(homeBnds.getCenter(), map.getBoundsZoom(homeBnds, false, L.point(26, 26)), 1150); }
      else if (homeCenterLL) { flyCamera(homeCenterLL, homeZoomN, 1150); }
    }

    function applyScene(scene, state) {
      sceneNow = scene; stateNow = state;
      var dhaka = scene === 'dhaka', share = scene === 'share';
      show(circles.unit, dhaka); show(circles.gross, dhaka); show(circles.net, dhaka && state === '2');
      show(labels.dhaka.g, dhaka); show(labels.gross.g, dhaka);
      show(circles.jamuna, share); show(circles.ganges, share); show(circles.padma, share);
      show(labels.jamuna.g, share); show(labels.ganges.g, share); show(labels.padma.g, share);
      goCamera(dhaka ? 'dhaka' : 'home');
      if (camState === 'dhaka' && !camRAF) layout(); // refresh 6×/4× label + net ring without a move
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var pts = [];
        if (rivers) Object.keys(rivers).forEach(function (k) { pts = pts.concat(rivers[k]); });
        pts.push(DHAKA);
        if (pts.length > 1) homeBnds = L.latLngBounds(pts);
        map.invalidateSize(false);
        if (camState === 'dhaka') { var t = dhakaTarget(); map.setView(t.center, t.zoom, { animate: false }); }
        else if (homeBnds) { map.fitBounds(homeBnds, { padding: [26, 26], animate: false }); homeCenterLL = map.getCenter(); homeZoomN = map.getZoom(); }
        layout();
      }, 180);
    });
    new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { map.invalidateSize(false); layout(); }
    }, { threshold: 0.01 }).observe(el);

    return { applyScene: applyScene, relayout: fitAndLayout };
  }

  function parseKml(text) {
    var xml = new DOMParser().parseFromString(text, 'application/xml');
    var pms = xml.getElementsByTagName('Placemark');
    var out = {};
    for (var i = 0; i < pms.length; i++) {
      var nameEl = pms[i].getElementsByTagName('name')[0];
      var coordEl = pms[i].getElementsByTagName('coordinates')[0];
      if (!nameEl || !coordEl) continue;
      var name = nameEl.textContent.trim();
      var pts = coordEl.textContent.trim().split(/\s+/).map(function (c) {
        var xy = c.split(','); return [parseFloat(xy[1]), parseFloat(xy[0])];
      }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
      if (pts.length) out[name] = pts;
    }
    return out;
  }
})();
