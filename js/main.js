/* =============================================================
   Rivers that move — interaction layer
   No scroll listeners: IntersectionObserver + rAF only.
   ============================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAST = 70;

  /* Device/connection hints. On Data Saver or a 2G-class link we skip eager,
     autoplaying video downloads (the reader can still scrub); on phones we ask
     Leaflet to keep a smaller off-screen tile buffer. Desktop is unaffected. */
  var conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
  var saveData = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  var noAuto = reduce || saveData;
  var isPhone = window.matchMedia('(max-width:900px)').matches;

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
    if (st) {
      applyBeat(st.getAttribute('data-scene'), st.getAttribute('data-state'));
      // auto-drop the figures table on the "60% Jamuna" beat, so it opens on scroll (no click needed)
      var dt = st.querySelector('.datatable');
      if (dt && !dt.open) dt.open = true;
    }
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
    if (noAuto) {
      // reduced motion, or a metered/slow link: hold on the poster, don't fetch the film
      try { heroVid.pause(); heroVid.removeAttribute('autoplay'); heroVid.preload = 'none'; heroVid.load(); } catch (e) { }
    } else {
      var setHeroRate = function () { try { heroVid.playbackRate = 0.72; } catch (e) { } };
      heroVid.addEventListener('loadedmetadata', setHeroRate);
      setHeroRate();
    }
  }

  /* ---------- Site videos: play once when they scroll into view, then STOP.
     No auto-replay, no button — a single subtle scrubber lets the reader replay and move
     back and forth through the years (the frames carry their own year label). ---------- */
  document.querySelectorAll('.sitefig').forEach(function (fig) {
    var vid = fig.querySelector('video');
    if (!vid) return;
    var scrub = fig.querySelector('.sitefig__scrub');
    vid.loop = false;
    var autoplayed = false, scrubbing = false, raf = null;

    function play() { var p = vid.play(); if (p && p.catch) p.catch(function () { }); }
    function setFill(p) { if (scrub) scrub.style.setProperty('--p', (p * 100).toFixed(2) + '%'); }
    function syncScrub() {
      if (scrubbing || !vid.duration) return;
      var p = vid.currentTime / vid.duration;
      if (scrub) scrub.value = String(p * 1000);
      setFill(p);
    }
    // rAF keeps the fill gliding smoothly while it plays (timeupdate alone is steppy)
    function loop() { syncScrub(); raf = (!vid.paused && !vid.ended) ? requestAnimationFrame(loop) : null; }
    function startLoop() { if (!raf) raf = requestAnimationFrame(loop); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    vid.addEventListener('loadedmetadata', syncScrub);
    vid.addEventListener('timeupdate', syncScrub);
    vid.addEventListener('play', startLoop);
    vid.addEventListener('pause', function () { stopLoop(); syncScrub(); });
    vid.addEventListener('ended', function () { stopLoop(); if (scrub) scrub.value = '1000'; setFill(1); });

    if (scrub) {
      scrub.addEventListener('pointerdown', function () { vid.pause(); });
      scrub.addEventListener('input', function () {
        scrubbing = true;
        var p = (+scrub.value) / 1000;
        setFill(p);
        if (vid.duration) { try { vid.currentTime = p * vid.duration; } catch (e) { } }
      });
      var endScrub = function () { scrubbing = false; };
      scrub.addEventListener('change', endScrub);
      scrub.addEventListener('pointerup', endScrub);
      scrub.addEventListener('pointercancel', endScrub);
    }

    // First time it enters view: load it and play once through, then it stops on its own.
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          // full fetch on view, but on data-saver wait for a scrub/tap before pulling the whole clip
          vid.preload = saveData ? 'metadata' : 'auto';
          if (!autoplayed && !noAuto) { autoplayed = true; play(); }
        } else if (!vid.ended) {
          vid.pause();                                // pause when scrolled away; never auto-resumes
        }
      });
    }, { threshold: 0.4 }).observe(fig);
  });

  /* ---------- Photo carousel (Section 2 — "From riverbank to slum") ---------- */
  (function initCarousel() {
    var root = document.getElementById('bholaCarousel');
    if (!root) return;

    var dotsContainer = root.querySelector('.carousel__dots');
    var prev = root.querySelector('.carousel__nav--prev');
    var next = root.querySelector('.carousel__nav--next');

    var allSlides = [].slice.call(root.querySelectorAll('.carousel__slide'));
    var validSlides = [];
    var dots = [];
    var i = 0, timer = null, inView = false, DELAY = 5200;

    function refreshValidSlides() {
      validSlides = allSlides.filter(function (slide) {
        if (slide.dataset.broken === 'true') return false;
        var img = slide.querySelector('img');
        if (!img) return false;
        if (img.complete && img.naturalWidth === 0 && img.src) {
          slide.dataset.broken = 'true';
          return false;
        }
        return true;
      });
    }

    function buildDots() {
      if (!dotsContainer) return;
      dotsContainer.innerHTML = '';
      dots = [];

      validSlides.forEach(function (slide, idx) {
        var dot = document.createElement('button');
        dot.className = 'carousel__dot' + (idx === i ? ' is-active' : '');
        dot.type = 'button';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-selected', idx === i ? 'true' : 'false');
        dot.setAttribute('aria-label', 'Photograph ' + (idx + 1));
        dot.addEventListener('click', function () { go(idx); });
        dotsContainer.appendChild(dot);
        dots.push(dot);
      });

      var multiple = validSlides.length > 1;
      if (prev) prev.style.display = multiple ? '' : 'none';
      if (next) next.style.display = multiple ? '' : 'none';
      dotsContainer.style.display = multiple ? '' : 'none';
    }

    function show(n) {
      if (!validSlides.length) return;
      n = (n + validSlides.length) % validSlides.length;
      validSlides.forEach(function (s, k) {
        var active = k === n;
        s.classList.toggle('is-active', active);
        s.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach(function (d, k) {
        var active = k === n;
        d.classList.toggle('is-active', active);
        d.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      i = n;
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function auto() {
      stop();
      if (reduce || !inView || validSlides.length < 2) return;
      timer = setInterval(function () { show(i + 1); }, DELAY);
    }
    function go(n) { show(n); auto(); }

    // Auto-adjust resilience: if an image (like 4.jpg) is missing, auto-skip without breaking
    allSlides.forEach(function (slide) {
      var img = slide.querySelector('img');
      if (!img) return;

      function onErr() {
        slide.dataset.broken = 'true';
        slide.style.display = 'none';
        slide.classList.remove('is-active');
        refreshValidSlides();
        buildDots();
        if (i >= validSlides.length) i = Math.max(0, validSlides.length - 1);
        show(i);
      }

      img.addEventListener('error', onErr);
      if (img.complete && img.naturalWidth === 0 && img.src) onErr();
    });

    if (prev) prev.addEventListener('click', function () { go(i - 1); });
    if (next) next.addEventListener('click', function () { go(i + 1); });

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', auto);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', auto);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    });

    // Touch swipe support on mobile
    var touchStartX = 0, touchEndX = 0;
    root.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length) {
        touchStartX = e.touches[0].clientX;
        touchEndX = touchStartX;
        stop();
      }
    }, { passive: true });

    root.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length) {
        touchEndX = e.touches[0].clientX;
      }
    }, { passive: true });

    root.addEventListener('touchend', function () {
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) go(i + 1);
        else go(i - 1);
      } else {
        auto();
      }
    }, { passive: true });

    refreshValidSlides();
    buildDots();
    show(0);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var isIntersecting = entries[0].isIntersecting;
        if (isIntersecting) {
          if (!inView) {
            inView = true;
            if (validSlides.length > 1 && !reduce) {
              show(i + 1);
            }
            auto();
          }
        } else {
          inView = false;
          stop();
        }
      }, { threshold: 0.2 }).observe(root);
    } else {
      inView = true;
      if (validSlides.length > 1 && !reduce) {
        show(i + 1);
      }
      auto();
    }
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

    // Esri imagery. detectRetina fetches one zoom level deeper on 2x/3x screens
    // (rendered at half size) so the imagery stays sharp when zoomed into a site.
    // keepBuffer holds a wide ring of loaded tiles so the full-bleed frame is fully
    // covered after a flyTo — without it the uncovered edges fell back to upscaled
    // low-zoom parent tiles (the soft/blurry patches). updateWhenZooming stays at its
    // default (true) so the grid keeps loading through the fly and lands fully covered.
    // Lighter tile footprint on phones: a smaller off-screen buffer means far fewer
    // tile requests and much less memory. Skip retina doubling on data-saver links.
    var kb = isPhone ? 2 : 6;
    var retina = !saveData;
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 17, detectRetina: retina, keepBuffer: kb }
    ).addTo(map);
    // faint place labels for orientation — {r} pulls CARTO's native @2x tiles on
    // high-DPI screens (no detectRetina here, or it would double up with {r})
    L.tileLayer(
      'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap, &copy; CARTO', opacity: 0.55, maxZoom: 19, keepBuffer: kb }
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
            map.flyTo(ll, 13, { duration: 0.9 });
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
      { attribution: 'Imagery &copy; Esri, Maxar', maxZoom: 17, detectRetina: !saveData, keepBuffer: isPhone ? 2 : 3 }).addTo(map);
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
    // the "6× Dhaka" caption gets a bigger, warm, hard-to-miss treatment
    labels.gross.big.setAttribute('class', 'mlabel__big mlabel__big--hero');
    labels.gross.sub.setAttribute('class', 'mlabel__sub mlabel__sub--hero');

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
    function placeLabel(lab, p, big, sub, mode, r, opts) {
      opts = opts || {};
      var bigSize = opts.bigSize || (mode === 'above' ? 15 : 17);
      var subSize = opts.subSize || 11.5;
      var gap = opts.gap || (bigSize + 4);
      var yBig = (mode === 'above') ? (p.y - r - 14) : (p.y - 3);
      lab.big.setAttribute('x', p.x); lab.big.setAttribute('y', yBig); lab.big.textContent = big;
      lab.big.setAttribute('font-size', bigSize);
      lab.sub.setAttribute('x', p.x); lab.sub.setAttribute('y', yBig + gap); lab.sub.textContent = sub;
      lab.sub.setAttribute('font-size', subSize);
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
          try { path.style.setProperty('--len', path.getTotalLength()); } catch (e) { }
        });
        placeChip('Jamuna', 0.13);
        placeChip('Ganges', 0.20);
        placeChip('Padma', 0.44);
      }
      marks.forEach(function (m) { var p = project(m.ll); m.el.setAttribute('cx', p.x.toFixed(1)); m.el.setAttribute('cy', p.y.toFixed(1)); });

      var ppm = pxPerMeter();
      var rUnit = rKm(305) * 1000 * ppm, rGross = rKm(1585) * 1000 * ppm, rNet = rKm(1153) * 1000 * ppm;

      // Dhaka comparison: rings concentric on the city, drawn to the map's true scale.
      // Seen once the camera has flown in and centred Dhaka, so the 6× ring visibly dwarfs it.
      var dc = project(DHAKA);
      setCircle(circles.gross, dc, rGross);
      setCircle(circles.net, dc, rNet);
      setCircle(circles.unit, dc, rUnit);
      var net2 = (sceneNow === 'dhaka' && stateNow === '2');
      placeLabel(labels.gross, dc,
        net2 ? '4× Dhaka, net' : '5× Dhaka',
        net2 ? '1,153 square kilometres lost after the chars return' : '1,585 square kilometres eroded in fifty years',
        'above', rGross, { bigSize: 21, subSize: 15.5, gap: 26 });
      placeLabel(labels.dhaka, dc, 'Dhaka', '305 km²', 'center', 0);

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
      // On desktop the beats sit on the left, so seat Dhaka (and its rings) to the right.
      // On narrower screens the card is centred at the foot, so keep the rings centred and lifted.
      var wide = size.x >= 1024;
      var dpt = map.project(DHAKA, z);
      var want = L.point(size.x * (wide ? 0.7 : 0.5), size.y * (wide ? 0.5 : 0.44));
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
