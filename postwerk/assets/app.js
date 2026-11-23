/* Postwerk – Oberfläche: Upload in Teilen, Titelbild, Zeichenzähler, Kopieren */
(function () {
  'use strict';
  var CSRF = document.body.dataset.csrf || '';
  var CHUNK = 4 * 1024 * 1024;
  var $ = function (s) { return document.querySelector(s); };

  function api(action, opts) {
    opts = opts || {};
    var headers = { 'X-CSRF': CSRF };
    var body = opts.body;
    if (opts.json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    return fetch('api.php?action=' + action + (opts.query || ''), { method: opts.method || 'POST', headers: headers, body: body, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  }

  function setProgress(el, pct, text) {
    el.hidden = false;
    el.querySelector('div').style.width = pct + '%';
    el.querySelector('span').textContent = text;
  }

  /** Lädt eine Datei in 4-MB-Teilen hoch (umgeht Upload-Grenzen des Webspace). */
  function uploadFile(file, kind, prog, extra) {
    return api('upload_start', { json: { name: file.name, size: file.size, kind: kind } }).then(function (s) {
      var offset = 0;
      function next() {
        if (offset >= file.size) return api('upload_finish', { json: Object.assign({ upload_id: s.upload_id }, extra ? extra() : {}) });
        var part = file.slice(offset, offset + CHUNK);
        return api('upload_chunk', { method: 'PUT', query: '&upload_id=' + s.upload_id + '&offset=' + offset, body: part })
          .catch(function () { return new Promise(function (res) { setTimeout(res, 1500); }).then(function () {
            return api('upload_chunk', { method: 'PUT', query: '&upload_id=' + s.upload_id + '&offset=' + offset, body: part });
          }); })
          .then(function (r) {
            offset = r.received;
            if (prog) setProgress(prog, Math.round(offset / file.size * 100), Math.round(offset / file.size * 100) + ' % · ' + (offset / 1048576).toFixed(1) + ' von ' + (file.size / 1048576).toFixed(1) + ' MB');
            return next();
          });
      }
      return next();
    });
  }

  /* ---------------- Video */
  var vfile = $('#vfile');
  if (vfile) {
    var player = $('#vplayer'), drop = $('#vdrop'), prev = $('#vprev'), prog = $('#vprog');
    var fileId = $('#file_id'), cover = $('#cover'), coverMs = $('#cover_ms'), submit = $('#submit');
    var thumbData = null;

    function grabFrame() {
      try {
        var c = document.createElement('canvas');
        var w = player.videoWidth, h = player.videoHeight;
        if (!w) return null;
        var s = Math.min(1, 540 / w);
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(player, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.8);
      } catch (e) { return null; }
    }

    function handle(file) {
      if (!file) return;
      if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) { alert('Bitte eine Videodatei wählen.'); return; }
      var url = URL.createObjectURL(file);
      player.src = url;
      prev.hidden = false; drop.hidden = true;
      $('#vname').textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
      submit.disabled = true;
      var meta = new Promise(function (res) {
        player.onloadedmetadata = function () {
          $('#duration').value = player.duration.toFixed(2);
          cover.max = Math.floor(player.duration * 1000);
          player.currentTime = Math.min(0.5, player.duration / 2);
        };
        player.onseeked = function () { thumbData = grabFrame(); res(); player.onseeked = null; };
        setTimeout(res, 4000);
      });
      uploadFile(file, 'video', prog, function () {
        return { duration: player.duration || null, width: player.videoWidth || null, height: player.videoHeight || null, thumb: thumbData };
      }).then(function (r) {
        fileId.value = r.file_id;
        setProgress(prog, 100, 'Hochgeladen ✓');
        submit.disabled = false;
        return meta;
      }).catch(function (e) {
        setProgress(prog, 0, 'Fehler: ' + e.message);
        drop.hidden = false;
        submit.disabled = false;
      });
    }
    vfile.addEventListener('change', function () { handle(vfile.files[0]); });
    $('#vchange').addEventListener('click', function () { fileId.value = ''; prev.hidden = true; drop.hidden = false; prog.hidden = true; player.removeAttribute('src'); });
    player.addEventListener('loadedmetadata', function () {
      cover.max = Math.floor(player.duration * 1000);
      if (coverMs.value) cover.value = coverMs.value;
    });
    cover.addEventListener('input', function () {
      coverMs.value = cover.value;
      player.currentTime = cover.value / 1000;
      $('#covert').textContent = 'Titelbild bei ' + (cover.value / 1000).toFixed(1) + ' s';
    });
    dragDrop(drop, function (f) { handle(f[0]); });
  }

  /* ---------------- Fotos */
  var ifile = $('#ifile');
  if (ifile) {
    var imgs = $('#imgs'), images = $('#images'), iprog = $('#iprog');
    function sync() { images.value = Array.prototype.map.call(imgs.querySelectorAll('figure'), function (f) { return f.dataset.n; }).join(','); }
    imgs.addEventListener('click', function (e) { if (e.target.classList.contains('x')) { e.target.parentNode.remove(); sync(); } });
    function addFiles(files) {
      files = Array.prototype.slice.call(files);
      var i = 0;
      (function next() {
        if (i >= files.length) { setProgress(iprog, 100, files.length + ' Foto(s) hochgeladen ✓'); return; }
        var f = files[i++];
        setProgress(iprog, Math.round((i - 1) / files.length * 100), 'Foto ' + i + ' von ' + files.length);
        uploadFile(f, 'image', null).then(function (r) {
          var fig = document.createElement('figure');
          fig.dataset.n = r.image;
          fig.innerHTML = '<img src="media/' + r.image + '" alt=""><button type="button" class="x" title="Entfernen">×</button>';
          imgs.appendChild(fig); sync(); next();
        }).catch(function (e) { setProgress(iprog, 0, 'Fehler: ' + e.message); });
      })();
    }
    ifile.addEventListener('change', function () { addFiles(ifile.files); ifile.value = ''; });
    dragDrop($('#idrop'), addFiles);
  }

  function dragDrop(el, cb) {
    if (!el) return;
    ['dragenter', 'dragover'].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.addEventListener(ev, function () { el.classList.remove('over'); }); });
    el.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files.length) cb(e.dataTransfer.files); });
  }

  /* ---------------- Text */
  var cap = $('#caption');
  if (cap) {
    var form = $('#compose');
    function count() {
      var photo = form.querySelector('input[name=type][value=photo]').checked;
      var max = photo ? 4000 : 2200;
      var n = Array.from(cap.value).length;
      $('#capmax').textContent = max;
      $('#capcount').textContent = n;
      $('#capcount').className = n > max ? 'over' : '';
      $('#hashcount').textContent = (cap.value.match(/#[^\s#]+/g) || []).length;
    }
    cap.addEventListener('input', count);
    form.addEventListener('change', count);
    count();
    form.addEventListener('submit', function (e) {
      var photo = form.querySelector('input[name=type][value=photo]').checked;
      if (!photo && !$('#file_id').value) { e.preventDefault(); alert('Bitte zuerst ein Video hochladen.'); return; }
      if (photo && !$('#images').value) { e.preventDefault(); alert('Bitte mindestens ein Foto hochladen.'); return; }
      var now = form.querySelector('input[name=when][value=now]').checked;
      if (now && !confirm('Jetzt sofort auf TikTok veröffentlichen?')) { e.preventDefault(); return; }
      $('#submit').disabled = true;
    });
  }

  /* ---------------- Allgemein */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.copy');
    if (!b) return;
    var t = b.dataset.copy;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      var o = b.textContent; b.textContent = 'Kopiert ✓'; setTimeout(function () { b.textContent = o; }, 1500);
    }).catch(function () { prompt('Kopieren:', t); });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset.confirm && !confirm(f.dataset.confirm)) e.preventDefault();
  });
})();
