/* Veille·Info — logique du site (aucune dépendance, fonctionne en local via file://) */
(function (root) {
  'use strict';
  const C = root.VEILLE_CONFIG;
  const KEYS = { ov: 'veille.overrides.v1', usr: 'veille.user.v1', src: 'veille.sources.v1', usrsrc: 'veille.usersources.v1' };
  const CRIT = ['maj', 'cred', 'lis', 'freq', 'ver', 'pert'];
  const CRIT_LAB = { maj: 'Mises à jour', cred: 'Crédibilité', lis: 'Lisibilité', freq: 'Fréquence', ver: 'Véracité', pert: 'Pertinence' };
  const RET = ['important', 'publie']; // articles « retenus » pour les KPI

  /* ---------- Stockage local (navigateur) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  /* ---------- Utilitaires ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const today = () => root.VEILLE_TODAY || iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const weekStart = s => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const monthStart = s => s.slice(0, 7) + '-01';
  const monthEnd = s => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
  const isoWeek = s => { const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const fmt = s => { const d = parse(s); return d.getDate() + ' ' + MOIS[d.getMonth()]; };
  const fmtLong = s => { const d = parse(s); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear(); };
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';

  /* ---------- Sources ---------- */
  function sourcesAll() {
    const ov = store.get(KEYS.src, {});
    const list = (root.VEILLE_SOURCES || []).concat(store.get(KEYS.usrsrc, []));
    return list.map(s => {
      const sc = Object.assign({}, s.scores, ov[s.id] || {});
      return Object.assign({}, s, { scores: sc, score: avg(CRIT.map(k => Number(sc[k]) || 0)) });
    });
  }
  const srcMap = () => { const m = {}; sourcesAll().forEach(s => m[s.id] = s); return m; };

  /* ---------- Articles ---------- */
  function articlesAll() {
    const base = [].concat(root.VEILLE_ARTICLES || []);
    const ids = new Set(base.map(a => a.id)), urls = new Set(base.map(a => a.url));
    (root.VEILLE_AUTO || []).forEach(a => { if (!ids.has(a.id) && !urls.has(a.url)) { base.push(a); ids.add(a.id); } });
    store.get(KEYS.usr, []).forEach(a => { if (!ids.has(a.id)) { base.push(Object.assign({ user: true }, a)); ids.add(a.id); } });
    const ov = store.get(KEYS.ov, {});
    return base.map(a => Object.assign({ importance: 0, statut: 'collecte', sf: false, fav: false, later: false, note: '', objectif: '' }, a, ov[a.id] || {}));
  }
  function patch(id, obj) { const ov = store.get(KEYS.ov, {}); ov[id] = Object.assign(ov[id] || {}, obj); store.set(KEYS.ov, ov); }
  function addArticle(a) { const u = store.get(KEYS.usr, []); u.push(a); store.set(KEYS.usr, u); }
  function removeArticle(id) {
    store.set(KEYS.usr, store.get(KEYS.usr, []).filter(a => a.id !== id));
    const ov = store.get(KEYS.ov, {}); delete ov[id]; store.set(KEYS.ov, ov);
  }

  /* ---------- Périodes & KPI ---------- */
  function periods(h) {
    const arts = articlesAll().filter(a => a.h === h), t = today();
    const mois = C.horizons[h].periode === 'mois';
    const st = d => mois ? monthStart(d) : weekStart(d);
    const starts = arts.map(a => st(a.date)).concat([st(t)]);
    let s = starts.reduce((x, y) => x < y ? x : y);
    const last = starts.reduce((x, y) => x > y ? x : y);
    const out = [];
    while (s <= last) {
      const end = mois ? monthEnd(s) : addDays(s, 6);
      const label = mois ? ('Mois ' + s.slice(0, 7)) : ('S' + isoWeek(s) + ' · ' + fmt(s) + ' → ' + fmt(end));
      out.push({ start: s, end, label, current: t >= s && t <= end });
      s = mois ? monthStart(addDays(end, 1)) : addDays(s, 7);
    }
    return out.reverse();
  }
  const status = (v, t) => v == null ? 'nd' : (v >= t ? 'ok' : (v >= t * 0.75 ? 'warn' : 'ko'));
  function kpi(h, p) {
    const A = articlesAll().filter(a => a.h === h && a.date >= p.start && a.date <= p.end);
    const sm = srcMap(), kept = A.filter(a => RET.includes(a.statut));
    const scs = kept.map(a => sm[a.source]).filter(Boolean).map(s => s.score);
    const objs = C.objectifs.filter(o => o.h === h);
    const cov = objs.filter(o => kept.some(a => a.objectif === o.id));
    const has = A.length > 0;
    const k1 = has ? avg(scs) : null;
    const k2 = has && objs.length ? cov.length / objs.length : null;
    const k3 = has ? A.filter(a => a.sf && a.statut !== 'rejete').length : null;
    const T = C.kpi;
    return {
      n: A.length, kept: kept.length, published: A.filter(a => a.statut === 'publie').length,
      k1, k2, k3,
      covered: cov.map(o => o.id), missing: objs.filter(o => !cov.includes(o)).map(o => o.id),
      st1: status(k1, T.kpi1.cible), st2: status(k2, T.kpi2.cible), st3: status(k3, T.kpi3.cible[h]),
      sigs: A.filter(a => a.sf && a.statut !== 'rejete')
    };
  }
  function latestPeriod(h) {
    const ps = periods(h);
    const cur = ps.find(p => p.current && kpi(h, p).n > 0);
    return cur || ps.find(p => kpi(h, p).n > 0) || ps[0];
  }
  const pct = v => v == null ? 'n/d' : Math.round(v * 100) + ' %';
  const num = v => v == null ? 'n/d' : String(v).replace('.', ',');

  /* ---------- Rendu : éléments communs ---------- */
  const stars = n => '<span class="stars" title="Importance ' + n + '/5">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
  function card(a, full) {
    const s = srcMap()[a.source];
    const hh = C.horizons[a.h];
    const st = C.statuts[a.statut] || a.statut;
    let h = '<article class="card ' + a.h.toLowerCase() + ' ' + a.statut + '" data-id="' + esc(a.id) + '">';
    h += '<div class="row"><span class="tag ' + a.h.toLowerCase() + '">' + a.h + ' · ' + esc(hh.theme) + '</span><span>' + fmt(a.date) + '</span>' + (a.importance ? stars(a.importance) : '') + '</div>';
    h += '<h3><a href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">' + esc(a.titre) + '</a></h3>';
    h += '<p class="sum">' + esc(a.resume) + '</p>';
    h += '<div class="meta"><span>' + (s ? esc(s.nom) + ' (' + num(s.score) + '/10)' : 'Source : ' + esc(a.source || 'n/d')) + '</span>' +
      '<span class="tag st-' + a.statut + '">' + esc(st) + '</span>' +
      (a.objectif ? '<span class="tag">' + esc(a.objectif) + '</span>' : '') +
      (a.sf ? '<span class="tag sf">Signal faible</span>' : '') +
      (a.fav ? '<span title="Favori">★ favori</span>' : '') + (a.later ? '<span title="À lire plus tard">⏰ à lire</span>' : '') + '</div>';
    if (a.note) h += '<p class="small muted">📝 ' + esc(a.note) + '</p>';
    if (full) {
      h += '<div class="actions">' +
        '<select data-act="statut" title="Étape du pipeline">' + Object.keys(C.statuts).map(k => '<option value="' + k + '"' + (k === a.statut ? ' selected' : '') + '>' + C.statuts[k] + '</option>').join('') + '</select>' +
        '<select data-act="importance" title="Importance">' + [0, 1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (n === a.importance ? ' selected' : '') + '>Imp. ' + n + '</option>').join('') + '</select>' +
        '<button data-act="fav">' + (a.fav ? '★ Retirer' : '☆ Favori') + '</button>' +
        '<button data-act="later">' + (a.later ? '✔ Lu' : '⏰ Plus tard') + '</button>' +
        '<button data-act="sf">' + (a.sf ? '⚑ Signal faible ✓' : '⚐ Signal faible') + '</button>' +
        '<button data-act="note">✎ Note</button>' +
        (a.user ? '<button data-act="del" class="danger">Suppr.</button>' : '') + '</div>';
    }
    return h + '</article>';
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function download(name, text, type) {
    const b = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function shell(page) {
    const nav = [['index.html', 'Accueil', 'home'], ['pipeline.html', 'Pipeline', 'pipeline'], ['actualites.html', 'Actualités', 'news'], ['sources.html', 'Sources', 'sources'], ['kpi.html', 'Fiches KPI', 'kpi']];
    document.getElementById('shell').innerHTML =
      '<div class="stripes"></div><div class="top"><div class="wrap"><a class="brand" href="index.html">' + esc(C.titre) + '<small>Tableau de bord de veille · H1 cyber · H2 IA · H3 SecOps</small></a><nav>' +
      nav.map(n => '<a href="' + n[0] + '"' + (n[2] === page ? ' class="on"' : '') + '>' + n[1] + '</a>').join('') + '</nav></div></div><div class="stripes thin"></div>';
    const f = document.getElementById('foot');
    if (f) f.innerHTML = '<div class="stripes thin"></div><footer class="site"><div class="wrap"><span>Veille·Info v' + esc(C.version) + ' — données dans le dossier <b>data/</b>, copie de travail dans ce navigateur.</span><span><a href="actualites.html#sauvegarde">Sauvegarde / import</a></span></div></footer>';
  }

  /* ---------- Page : accueil ---------- */
  function pageHome() {
    const all = articlesAll(), t = today();
    const sm = srcMap();
    const kpis = ['H1', 'H2', 'H3'].map(h => ({ h, p: latestPeriod(h) }));
    document.getElementById('counters').innerHTML = [
      [all.length, 'Articles suivis'], [all.filter(a => a.statut === 'publie').length, 'Publiés'], [all.filter(a => a.statut === 'important').length, 'À surveiller'],
      [all.filter(a => a.sf && a.statut !== 'rejete').length, 'Signaux faibles'], [Object.keys(sm).length, 'Sources évaluées']
    ].map(c => '<div class="counter"><b>' + c[0] + '</b><span>' + c[1] + '</span></div>').join('');
    document.getElementById('edition').textContent = 'Édition du ' + fmtLong(t);

    const pub = h => all.filter(a => a.h === h && a.statut === 'publie').sort((x, y) => y.importance - x.importance || (y.date > x.date ? 1 : -1));
    let html = '';
    ['H1', 'H2', 'H3'].forEach(h => {
      const hc = C.horizons[h], list = pub(h);
      let items = [], per = '';
      if (h === 'H1') {
        const days = [...new Set(list.map(a => a.date))].sort().reverse();
        const d = days.includes(t) ? t : days[0];
        items = list.filter(a => a.date === d); per = d ? (d === t ? 'Aujourd’hui — ' : 'Dernier jour publié — ') + fmtLong(d) : '';
      } else {
        const p = periods(h).find(p => p.current && list.some(a => a.date >= p.start && a.date <= p.end)) || periods(h).find(p => list.some(a => a.date >= p.start && a.date <= p.end));
        if (p) { items = list.filter(a => a.date >= p.start && a.date <= p.end); per = (p.current ? 'Période en cours — ' : 'Dernière période publiée — ') + p.label + (h === 'H2' ? ' (lundi → dimanche)' : ' (1er → 30 du mois)'); }
      }
      html += '<section class="band ' + h.toLowerCase() + '"><header><h2>' + h + ' · ' + esc(hc.nom) + '</h2><span class="rule">Veille ' + esc(hc.frequence.toLowerCase()) + ' · ' + esc(hc.publication) + '</span></header><div class="body">' +
        (per ? '<p class="period">' + esc(per) + '</p>' : '') +
        (items.length ? '<div class="grid">' + items.slice(0, 6).map(a => card(a, false)).join('') + '</div>' : '<div class="empty">Aucune information publiée pour cette période.</div>') +
        '</div><footer><a class="btn" href="actualites.html?h=' + h + '">Toutes les actualités ' + h + ' →</a></footer></section>';
    });
    document.getElementById('bands').innerHTML = html;

    const watch = all.filter(a => a.statut === 'important').sort((x, y) => y.date > x.date ? 1 : -1);
    document.getElementById('watch').innerHTML = watch.length ? '<div class="grid">' + watch.map(a => card(a, false)).join('') + '</div>' : '<div class="empty">Rien à surveiller pour l’instant.</div>';

    document.getElementById('kpistrip').innerHTML = '<div class="kpis">' + kpis.map(x => {
      const k = kpi(x.h, x.p);
      return '<div class="kpibox"><div class="h">' + x.h + ' · ' + esc(C.horizons[x.h].theme) + '</div><div class="small muted">' + esc(x.p.label) + '</div>' +
        '<p class="mono small" style="margin:8px 0 0">KPI1 qualité sources <span class="pill ' + k.st1 + '">' + num(k.k1) + '/10</span><br>KPI2 couverture <span class="pill ' + k.st2 + '">' + pct(k.k2) + '</span><br>KPI3 signaux faibles <span class="pill ' + k.st3 + '">' + num(k.k3) + '</span></p></div>';
    }).join('') + '</div><p><a class="btn" href="kpi.html">Voir les fiches KPI →</a></p>';
  }

  /* ---------- Page : pipeline ---------- */
  function pageActualPipeline() {
    const all = articlesAll();
    const c = {
      1: all.length, 2: all.filter(a => a.statut !== 'collecte').length,
      3: all.filter(a => ['lu', 'important', 'publie'].includes(a.statut)).length,
      4: all.filter(a => ['important', 'publie'].includes(a.statut)).length, 5: all.filter(a => a.statut === 'publie').length
    };
    const rej = all.filter(a => a.statut === 'rejete').length;
    document.getElementById('steps').innerHTML = C.etapes.map(e =>
      '<div class="step"><div class="num">' + e.n + '</div><div class="content"><div class="count"><b>' + c[e.n] + '</b><span class="small muted">articles</span></div>' +
      '<h3>' + esc(e.nom) + '</h3><div class="muted">' + esc(e.but) + '</div><div class="cols"><div><h4>Actions</h4><ul>' + e.actions.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
      '<div><h4>Règles & critères</h4><ul>' + e.regles.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><h4>Sortie</h4><div class="small">' + esc(e.sortie) + '</div></div></div></div></div>').join('');
    const mx = Math.max(1, c[1]);
    document.getElementById('funnel').innerHTML = C.etapes.map(e => '<div><span class="lab">' + e.n + ' · ' + esc(e.nom.split(' ')[0]) + '</span><span class="bar"><i style="width:' + (c[e.n] / mx * 100) + '%"></i></span><b>' + c[e.n] + '</b></div>').join('') +
      '<div><span class="lab">Rejetés au triage</span><span class="bar"><i style="width:' + (rej / mx * 100) + '%;background:var(--ko)"></i></span><b>' + rej + '</b></div>';
    document.getElementById('rythme').innerHTML = '<tr><th class="nosort">Horizon</th><th class="nosort">Thème</th><th class="nosort">Itération de veille</th><th class="nosort">Publication sur le site</th><th class="nosort">Seuil d’importance</th></tr>' +
      ['H1', 'H2', 'H3'].map(h => { const x = C.horizons[h]; return '<tr><td><span class="tag ' + h.toLowerCase() + '">' + h + '</span></td><td>' + esc(x.nom) + '</td><td>' + esc(x.frequence) + '</td><td>' + esc(x.publication) + '</td><td class="num">≥ ' + x.seuilPublication + '</td></tr>'; }).join('');
    document.getElementById('grille').innerHTML = '<tr><th class="nosort">Note</th><th class="nosort">Niveau</th><th class="nosort">Définition</th></tr>' + C.importance.map(i => '<tr><td class="num"><b>' + i.n + '</b></td><td>' + esc(i.nom) + '</td><td>' + esc(i.def) + '</td></tr>').join('');
    document.getElementById('objectifs').innerHTML = '<tr><th class="nosort">Objectif</th><th class="nosort">Horizon</th><th class="nosort">Intitulé</th></tr>' + C.objectifs.map(o => '<tr><td><b>' + o.id + '</b></td><td><span class="tag ' + o.h.toLowerCase() + '">' + o.h + '</span></td><td>' + esc(o.label) + '</td></tr>').join('');
  }

  /* ---------- Page : actualités ---------- */
  function pageNews() {
    const q = new URLSearchParams(location.search);
    const F = { h: q.get('h') || '', day: q.get('day') || '', range: 'all', txt: '', statut: '', only: '', sort: 'date' };
    const $ = id => document.getElementById(id);
    // sources dans le formulaire
    $('f-source').innerHTML = sourcesAll().map(s => '<option value="' + esc(s.id) + '">' + esc(s.nom) + '</option>').join('');
    const fillObj = () => { const h = $('f-h').value; $('f-obj').innerHTML = '<option value="">—</option>' + C.objectifs.filter(o => o.h === h).map(o => '<option value="' + o.id + '">' + o.id + ' · ' + esc(o.label) + '</option>').join(''); };
    $('f-h').onchange = fillObj; fillObj();
    $('f-date').value = today();

    function inRange(a) {
      const t = today();
      if (F.day) return a.date === F.day;
      if (F.range === 'today') return a.date === t;
      if (F.range === '7') return a.date >= addDays(t, -6) && a.date <= t;
      if (F.range === 'week') return a.date >= weekStart(t) && a.date <= addDays(weekStart(t), 6);
      if (F.range === 'month') return a.date >= monthStart(t) && a.date <= monthEnd(t);
      return true;
    }
    function render() {
      let L = articlesAll().filter(a => (!F.h || a.h === F.h) && inRange(a) && (!F.statut || a.statut === F.statut) &&
        (!F.txt || (a.titre + ' ' + a.resume + ' ' + a.note).toLowerCase().includes(F.txt)) &&
        (F.only !== 'fav' || a.fav) && (F.only !== 'later' || a.later) && (F.only !== 'sf' || a.sf));
      L.sort(F.sort === 'imp' ? (x, y) => y.importance - x.importance || (y.date > x.date ? 1 : -1) : (x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : y.importance - x.importance));
      $('count').textContent = L.length + ' article' + (L.length > 1 ? 's' : '');
      let html = '';
      if (F.sort === 'date') {
        const days = [...new Set(L.map(a => a.date))];
        days.forEach(d => { html += '<div class="daytitle">' + fmtLong(d) + '</div><div class="grid">' + L.filter(a => a.date === d).map(a => card(a, true)).join('') + '</div>'; });
      } else html = '<div class="grid">' + L.map(a => card(a, true)).join('') + '</div>';
      $('list').innerHTML = L.length ? html : '<div class="empty">Aucun article pour ces filtres.</div>';
      document.querySelectorAll('[data-hbtn]').forEach(b => b.classList.toggle('on', b.dataset.hbtn === F.h));
    }
    document.querySelectorAll('[data-hbtn]').forEach(b => b.onclick = () => { F.h = b.dataset.hbtn; render(); });
    $('range').onchange = e => { F.range = e.target.value; F.day = ''; $('day').value = ''; render(); };
    $('day').onchange = e => { F.day = e.target.value; render(); };
    $('txt').oninput = e => { F.txt = e.target.value.trim().toLowerCase(); render(); };
    $('statut').onchange = e => { F.statut = e.target.value; render(); };
    $('only').onchange = e => { F.only = e.target.value; render(); };
    $('sort').onchange = e => { F.sort = e.target.value; render(); };
    $('statut').innerHTML = '<option value="">Toutes les étapes</option>' + Object.keys(C.statuts).map(k => '<option value="' + k + '">' + C.statuts[k] + '</option>').join('');
    if (F.day) $('day').value = F.day;

    $('list').addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
      const id = b.closest('.card').dataset.id, a = articlesAll().find(x => x.id === id), act = b.dataset.act;
      if (act === 'fav') patch(id, { fav: !a.fav });
      if (act === 'later') patch(id, { later: !a.later });
      if (act === 'sf') patch(id, { sf: !a.sf });
      if (act === 'note') { const n = prompt('Note personnelle (vide pour effacer) :', a.note || ''); if (n === null) return; patch(id, { note: n }); }
      if (act === 'del') { if (!confirm('Supprimer cet article ajouté manuellement ?')) return; removeArticle(id); }
      render();
    });
    $('list').addEventListener('change', ev => {
      const s = ev.target.closest('select[data-act]'); if (!s) return;
      const id = s.closest('.card').dataset.id;
      patch(id, s.dataset.act === 'importance' ? { importance: Number(s.value) } : { statut: s.value });
      render();
    });

    $('add-form').onsubmit = ev => {
      ev.preventDefault();
      const g = id => $(id).value.trim();
      if (!/^https?:\/\//i.test(g('f-url'))) { alert('Le lien doit commencer par http:// ou https://'); return; }
      addArticle({ id: 'u' + Date.now(), date: g('f-date') || today(), h: g('f-h'), titre: g('f-titre'), resume: g('f-resume'), url: g('f-url'), source: g('f-source'),
        importance: Number(g('f-imp')), statut: g('f-statut'), objectif: g('f-obj'), sf: $('f-sf').checked });
      ev.target.reset(); $('f-date').value = today(); fillObj(); toast('Article ajouté'); render();
    };

    $('b-export').onclick = () => { download('veille-sauvegarde-' + today() + '.json', JSON.stringify({ version: 1, date: today(), ov: store.get(KEYS.ov, {}), usr: store.get(KEYS.usr, []), src: store.get(KEYS.src, {}), usrsrc: store.get(KEYS.usrsrc, []) }, null, 1), 'application/json'); };
    $('b-import').onchange = ev => {
      const f = ev.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const d = JSON.parse(r.result); store.set(KEYS.ov, d.ov || {}); store.set(KEYS.usr, d.usr || []); store.set(KEYS.src, d.src || {}); store.set(KEYS.usrsrc, d.usrsrc || []); toast('Sauvegarde importée'); render(); } catch (e) { alert('Fichier invalide.'); } };
      r.readAsText(f); ev.target.value = '';
    };
    $('b-js').onclick = () => {
      const arts = articlesAll().map(a => { const o = Object.assign({}, a); delete o.user; return o; });
      download('articles.js', '/* articles.js — généré par l’export du site le ' + today() + ' */\nwindow.VEILLE_ARTICLES = ' + JSON.stringify(arts, null, 1) + ';\n', 'text/javascript');
      toast('Remplacez data/articles.js par ce fichier');
    };
    $('b-csv').onclick = () => {
      const cols = ['id', 'date', 'h', 'titre', 'resume', 'url', 'source', 'importance', 'statut', 'objectif', 'sf', 'fav', 'note'];
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      download('veille-articles-' + today() + '.csv', '﻿' + cols.join(';') + '\n' + articlesAll().map(a => cols.map(c => q(a[c])).join(';')).join('\n'), 'text/csv;charset=utf-8');
    };
    $('b-reset').onclick = () => { if (confirm('Effacer toutes les modifications locales (statuts, notes, articles ajoutés) ? Les fichiers du dossier data/ ne sont pas touchés.')) { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); toast('Stockage local réinitialisé'); render(); } };
    render();
  }

  /* ---------- Page : sources ---------- */
  function pageSources() {
    const $ = id => document.getElementById(id);
    const S = { zone: '', h: '', txt: '', key: 'score', dir: -1, edit: false };
    const ZL = { FR: 'France', EU: 'Europe', INTL: 'International' };
    const used = () => { const m = {}; articlesAll().filter(a => RET.includes(a.statut)).forEach(a => m[a.source] = (m[a.source] || 0) + 1); return m; };
    const cls = v => v >= 8 ? 'good' : v >= 6.5 ? 'mid' : 'low';
    function render() {
      const u = used();
      let L = sourcesAll().filter(s => (!S.zone || s.zone === S.zone) && (!S.h || s.h.includes(S.h)) && (!S.txt || (s.nom + ' ' + s.type).toLowerCase().includes(S.txt)));
      const val = s => S.key === 'nom' ? s.nom.toLowerCase() : S.key === 'score' ? s.score : S.key === 'used' ? (u[s.id] || 0) : (s.scores[S.key] || 0);
      L.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * S.dir; });
      const grouped = S.key === 'zone-default';
      const head = '<tr><th data-k="nom">Source</th><th class="nosort">Objectif</th><th class="nosort">Type</th>' + CRIT.map(k => '<th class="num" data-k="' + k + '">' + CRIT_LAB[k] + ' /10</th>').join('') + '<th data-k="score">Score /10</th><th class="num" data-k="used">Retenus</th></tr>';
      let rows = '';
      ['FR', 'EU', 'INTL'].forEach(z => {
        const part = L.filter(s => s.zone === z); if (!part.length) return;
        rows += '<tr class="zone"><td colspan="11">' + ZL[z] + ' — ' + part.length + ' source' + (part.length > 1 ? 's' : '') + ' · moyenne ' + num(avg(part.map(s => s.score))) + '/10</td></tr>';
        part.forEach(s => {
          rows += '<tr><td><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener"><b>' + esc(s.nom) + '</b></a></td><td>' + s.h.map(h => '<span class="tag ' + h.toLowerCase() + '">' + h + '</span>').join(' ') + '</td><td>' + esc(s.type) + '</td>' +
            CRIT.map(k => '<td class="num">' + (S.edit ? '<input type="number" min="0" max="10" step="0.5" value="' + s.scores[k] + '" data-sid="' + esc(s.id) + '" data-k="' + k + '">' : s.scores[k]) + '</td>').join('') +
            '<td><div class="score ' + cls(s.score) + '">' + num(s.score) + '<span class="bar"><i style="width:' + s.score * 10 + '%"></i></span></div></td><td class="num">' + (u[s.id] || 0) + '</td></tr>';
        });
      });
      $('tbl').innerHTML = '<thead>' + head + '</thead><tbody>' + (rows || '<tr><td colspan="11" class="empty">Aucune source.</td></tr>') + '</tbody>';
      const all = sourcesAll();
      $('summary').textContent = all.length + ' sources · moyenne générale ' + num(avg(all.map(s => s.score))) + '/10 (FR ' + num(avg(all.filter(s => s.zone === 'FR').map(s => s.score))) + ' · UE ' + num(avg(all.filter(s => s.zone === 'EU').map(s => s.score))) + ' · INTL ' + num(avg(all.filter(s => s.zone === 'INTL').map(s => s.score))) + ')';
      $('b-edit').classList.toggle('on', S.edit);
    }
    $('zone').onchange = e => { S.zone = e.target.value; render(); };
    $('hh').onchange = e => { S.h = e.target.value; render(); };
    $('txt').oninput = e => { S.txt = e.target.value.trim().toLowerCase(); render(); };
    $('b-edit').onclick = () => { S.edit = !S.edit; render(); };
    $('tbl').addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; const k = th.dataset.k; if (S.key === k) S.dir *= -1; else { S.key = k; S.dir = k === 'nom' ? 1 : -1; } render(); });
    $('tbl').addEventListener('change', e => {
      const i = e.target.closest('input[data-sid]'); if (!i) return;
      let v = Math.max(0, Math.min(10, Number(i.value) || 0));
      const ov = store.get(KEYS.src, {}); ov[i.dataset.sid] = Object.assign(ov[i.dataset.sid] || {}, { [i.dataset.k]: v }); store.set(KEYS.src, ov); render();
    });
    $('src-form').onsubmit = ev => {
      ev.preventDefault();
      const g = id => $(id).value.trim();
      if (!/^https?:\/\//i.test(g('s-url'))) { alert('Le site doit commencer par http:// ou https://'); return; }
      const sc = {}; CRIT.forEach(k => sc[k] = Math.max(0, Math.min(10, Number($('s-' + k).value) || 0)));
      const l = store.get(KEYS.usrsrc, []);
      l.push({ id: 'us' + Date.now(), nom: g('s-nom'), url: g('s-url'), zone: g('s-zone'), h: [...document.querySelectorAll('.s-h:checked')].map(x => x.value), type: g('s-type') || 'Autre', scores: sc, rss: '' });
      store.set(KEYS.usrsrc, l); ev.target.reset(); toast('Source ajoutée'); render();
    };
    $('legend').innerHTML = [['Mises à jour', 'Le site est-il à jour, les articles anciens sont-ils corrigés ?'], ['Crédibilité', 'Réputation, expertise, indépendance de la source.'], ['Lisibilité', 'Clarté, structure, accessibilité du contenu.'], ['Fréquence', 'Régularité et volume de publication.'], ['Véracité', 'Fiabilité des faits vérifiables, sources citées.'], ['Pertinence', 'Adéquation avec l’objectif (H1, H2, H3) suivi.']].map(x => '<div><b>' + x[0] + '</b><br><span class="small">' + x[1] + '</span></div>').join('');
    render();
  }

  /* ---------- Page : fiches KPI ---------- */
  function pageKpi() {
    const T = C.kpi;
    const FICHES = [
      { id: 'kpi1', nom: 'KPI1 · Qualité moyenne des sources', unit: v => num(v) + '/10', key: 'k1', st: 'st1', cible: () => '≥ ' + num(T.kpi1.cible) + ' / 10', max: 10,
        def: 'Note moyenne (sur 10) des sources dont sont issus les articles retenus (statuts « À surveiller » et « Publié ») sur la période.',
        formule: 'KPI1 = moyenne( score de la source de chaque article retenu )  avec  score = moyenne des 6 critères du tableau Sources',
        donnees: 'data/articles.js (champ source, statut) + data/sources.js (6 critères notés de 0 à 10) ; notes modifiables sur la page Sources.',
        controle: 'Vérifier que chaque article retenu a une source connue ; relire les notes des sources à chaque itération ; alerte si la valeur passe sous 75 % de la cible.',
        smart: ['S — Spécifique|Mesure la fiabilité globale des sources réellement utilisées, pas du catalogue entier.', 'M — Mesurable|Moyenne sur 10, recalculée automatiquement à partir des données.', 'A — Atteignable|Cible 7,5/10 : réaliste avec des sources institutionnelles et médias spécialisés.', 'R — Relevant|Une veille n’est utile que si ses sources sont crédibles et vérifiables.', 'T — Temporel|Calculé à chaque itération : hebdomadaire (H1, H2), mensuelle (H3).'] },
      { id: 'kpi2', nom: 'KPI2 · Couverture des objectifs', unit: v => pct(v), key: 'k2', st: 'st2', cible: () => '≥ ' + Math.round(T.kpi2.cible * 100) + ' %', max: 1,
        def: 'Part des objectifs de veille de l’horizon pour lesquels au moins un article retenu existe sur la période.',
        formule: 'KPI2 = objectifs couverts ÷ objectifs de l’horizon  (objectif couvert = ≥ 1 article retenu rattaché)',
        donnees: 'data/config.js (liste des objectifs O1 à O9) + data/articles.js (champ objectif, statut).',
        controle: 'Chaque article retenu doit porter un objectif ; la liste des objectifs manquants est affichée ci-dessous pour décider des recherches complémentaires.',
        smart: ['S — Spécifique|3 objectifs par horizon, définis dans config.js.', 'M — Mesurable|Pourcentage d’objectifs couverts, calcul automatique.', 'A — Atteignable|Cible 80 % : tolère 1 objectif sur 3 non alimenté sur une période calme.', 'R — Relevant|Évite une veille biaisée sur un seul sujet.', 'T — Temporel|À chaque itération (semaine ou mois).'] },
      { id: 'kpi3', nom: 'KPI3 · Signaux faibles détectés', unit: v => num(v), key: 'k3', st: 'st3', cible: h => '≥ ' + T.kpi3.cible[h] + (C.horizons[h].periode === 'mois' ? ' / mois' : ' / semaine'), max: 5,
        def: 'Nombre d’articles non rejetés marqués « Signal faible » : information peu relayée mais à fort potentiel (nouvelle technique, usage inattendu, tendance émergente).',
        formule: 'KPI3 = nombre d’articles avec signal faible = oui et statut ≠ Rejeté, dans la période',
        donnees: 'data/articles.js (champ sf) ; l’indicateur se bascule depuis la page Actualités.',
        controle: 'Pour chaque signal faible, noter pourquoi il est faible (peu de sources, domaine voisin) et le réévaluer à l’itération suivante : promotion ou abandon.',
        smart: ['S — Spécifique|Un signal faible = info à fort potentiel, non encore relayée largement.', 'M — Mesurable|Compte d’articles flaggés par période.', 'A — Atteignable|Cible 2 par semaine (H1, H2), 3 par mois (H3).', 'R — Relevant|Permet d’anticiper plutôt que de subir l’actualité.', 'T — Temporel|Compté à chaque itération.'] }
    ];
    let html = '';
    FICHES.forEach(f => {
      html += '<section class="fiche" id="' + f.id + '"><header><h2>' + f.nom + '</h2><span class="mono small">Contrôle automatique à chaque ouverture du site</span></header><div class="inner">' +
        '<dl class="defs"><dt>Définition</dt><dd>' + f.def + '</dd><dt>Calcul</dt><dd><span class="formula">' + f.formule + '</span></dd><dt>Données</dt><dd>' + f.donnees + '</dd><dt>Contrôle</dt><dd>' + f.controle + '</dd></dl>' +
        '<div class="smart">' + f.smart.map(s => { const p = s.split('|'); return '<div><b>' + p[0] + '</b>' + p[1] + '</div>'; }).join('') + '</div>' +
        '<h3 class="mono" style="margin:18px 0 8px">Valeurs actuelles</h3><div class="kpis">';
      ['H1', 'H2', 'H3'].forEach(h => {
        const ps = periods(h), cur = latestPeriod(h), k = kpi(h, cur);
        const hist = ps.slice(0, 8).reverse();
        html += '<div class="kpibox"><div class="h"><span class="tag ' + h.toLowerCase() + '">' + h + '</span> ' + esc(C.horizons[h].theme) + '</div><div class="small muted">' + esc(cur.label) + '</div>' +
          '<div class="big">' + f.unit(k[f.key]) + ' <span class="pill ' + k[f.st] + '">' + ({ ok: 'OK', warn: 'À surveiller', ko: 'Écart', nd: 'n/d' }[k[f.st]]) + '</span></div><div class="small">Cible : ' + f.cible(h) + '</div>';
        if (f.id === 'kpi2') html += '<div class="small">Couverts : ' + (k.covered.join(', ') || '—') + ' · Manquants : ' + (k.missing.join(', ') || '—') + '</div>';
        if (f.id === 'kpi3') html += '<div class="small">' + (k.sigs.map(a => '• ' + esc(a.titre.slice(0, 60)) + '…').join('<br>') || 'Aucun signal faible.') + '</div>';
        if (f.id === 'kpi1') html += '<div class="small">' + k.kept + ' article(s) retenu(s) sur ' + k.n + '</div>';
        html += '<div class="hist" title="Historique des périodes">' + hist.map(p => { const kk = kpi(h, p); const v = kk[f.key]; const hgt = v == null ? 8 : Math.max(6, Math.min(100, v / f.max * 100)); return '<i class="' + kk[f.st] + '" style="height:' + hgt + '%" title="' + esc(p.label) + ' : ' + f.unit(v) + '"></i>'; }).join('') + '</div></div>';
      });
      html += '</div></div></section>';
    });
    document.getElementById('fiches').innerHTML = html;

    // Contrôle de qualité des données
    const A = articlesAll(), sm = srcMap(), ids = new Set(), dup = [];
    A.forEach(a => { if (ids.has(a.id)) dup.push(a.id); ids.add(a.id); });
    const checks = [
      ['Articles sans source reconnue', A.filter(a => !sm[a.source]).length],
      ['Articles retenus sans objectif', A.filter(a => RET.includes(a.statut) && !a.objectif).length],
      ['Articles publiés avec importance sous le seuil', A.filter(a => a.statut === 'publie' && a.importance < C.horizons[a.h].seuilPublication).length],
      ['Articles évalués sans importance (lu, à surveiller, publié)', A.filter(a => ['lu', 'important', 'publie'].includes(a.statut) && !a.importance).length],
      ['Articles sans lien valide', A.filter(a => !/^https?:\/\//.test(a.url || '')).length],
      ['Identifiants en double', dup.length]
    ];
    document.getElementById('checks').innerHTML = checks.map(c => '<li><span class="pill ' + (c[1] ? 'ko' : 'ok') + '">' + (c[1] ? c[1] : 'OK') + '</span> ' + c[0] + '</li>').join('');
    // Tableau historique
    let t = '<tr><th class="nosort">Horizon</th><th class="nosort">Période</th><th class="nosort">Articles</th><th class="nosort">Retenus</th><th class="nosort">KPI1</th><th class="nosort">KPI2</th><th class="nosort">KPI3</th></tr>';
    ['H1', 'H2', 'H3'].forEach(h => periods(h).forEach(p => { const k = kpi(h, p); t += '<tr><td><span class="tag ' + h.toLowerCase() + '">' + h + '</span></td><td>' + esc(p.label) + (p.current ? ' <span class="tag sf">en cours</span>' : '') + '</td><td class="num">' + k.n + '</td><td class="num">' + k.kept + '</td>' +
      '<td class="num"><span class="pill ' + k.st1 + '">' + num(k.k1) + '</span></td><td class="num"><span class="pill ' + k.st2 + '">' + pct(k.k2) + '</span></td><td class="num"><span class="pill ' + k.st3 + '">' + num(k.k3) + '</span></td></tr>'; }));
    document.getElementById('histo').innerHTML = t;
  }

  /* ---------- Démarrage ---------- */
  const core = { articlesAll, sourcesAll, periods, kpi, latestPeriod, isoWeek, weekStart, monthEnd, avg };
  root.VEILLE = core;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const page = document.body.dataset.page;
      shell(page);
      ({ home: pageHome, pipeline: pageActualPipeline, news: pageNews, sources: pageSources, kpi: pageKpi }[page] || (() => { }))();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
