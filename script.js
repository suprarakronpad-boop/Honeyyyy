/* =========================================================
   Honey — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : โหลดสินค้า + ปุ่มกรอง mood + ปุ่มสั่งซื้อ
   - order.html   : เติม item/price จาก URL ลงฟอร์ม + ส่งออเดอร์
   - admin.html   : อ่าน CSV จาก Google Sheets มาแสดงเป็นตาราง
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Config ---------- */
  var PRODUCTS_URL = 'products.json';

  var ORDER_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbwZitheYrlGUWBEmrTxnurKevVKdtTdD7kx3Hj54bHN0Q0zpBoB945FTkL4OV04SLz_/exec';

  var ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMhnpUx5Hxxz5GWFtFAeYRIxzitsHBwGSU2b5x_Zjb6dVf0Sfzk1w17IiP6asHQbGcxPGRnWJ3ChZB/pub?gid=0&single=true&output=csv';

  // ปุ่มกรองในหน้า product.html (ค่า mood ต้องตรงกับใน products.json)
  var FILTERS = [
    { mood: 'all', label: 'ทั้งหมด' },
    { mood: 'confident', label: 'น้ำผึ้งป่าเดือนห้า' },
    { mood: 'sweet', label: 'น้ำผึ้งดอกลำไย' }
  ];

  /* ---------- Helpers ---------- */
  function $(selector) {
    return document.querySelector(selector);
  }

  // สร้าง element แบบปลอดภัย (ใช้ textContent ไม่ใช้ innerHTML)
  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === 'text') node.textContent = props[key];
      else if (key === 'class') node.className = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function formatPrice(price) {
    if (typeof price === 'number') return price.toLocaleString('th-TH') + ' บาท';
    return price ? String(price) : '';
  }

  /* =========================================================
     1) product.html
     ========================================================= */
  function initProducts() {
    var list = $('#product-list');
    var bar = $('#filter-bar');
    if (!list) return;

    var products = [];
    var current = 'all';

    function validMood(mood) {
      return FILTERS.some(function (f) { return f.mood === mood; });
    }

    function buildCard(p) {
      var orderUrl =
        'order.html?item=' + encodeURIComponent((p.name + ' ' + (p.size || '')).trim()) +
        '&price=' + encodeURIComponent(formatPrice(p.price));

      var media = el('div', { class: 'card__media' }, [
        el('img', { src: p.image, alt: p.name, loading: 'lazy' })
      ]);

      var meta = el('div', { class: 'card__meta' }, [
        el('span', { text: p.size || '' }),
        el('span', { class: 'price', text: formatPrice(p.price) })
      ]);

      var action = el('p', {}, [
        el('a', { class: 'btn btn--gold', href: orderUrl, text: 'สั่งซื้อ' })
      ]);

      var card = el('article', { class: 'card', 'data-mood': p.mood || '' }, [
        media,
        el('h3', { class: 'card__title', text: p.name }),
        meta,
        action
      ]);
      return card;
    }

    function render() {
      list.textContent = '';
      var shown = products.filter(function (p) {
        return current === 'all' || p.mood === current;
      });

      if (!shown.length) {
        list.appendChild(el('p', { text: 'ยังไม่มีสินค้าในหมวดนี้' }));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    function updateButtons() {
      if (!bar) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.filter'), function (btn) {
        var active = btn.getAttribute('data-mood') === current;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setFilter(mood) {
      current = validMood(mood) ? mood : 'all';
      updateButtons();
      render();

      // อัปเดต URL ให้แชร์ลิงก์ที่กรองไว้ได้ (ไม่รีโหลดหน้า)
      if (window.history && history.replaceState) {
        var url = new URL(window.location.href);
        if (current === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', current);
        history.replaceState(null, '', url);
      }
    }

    function buildFilterBar() {
      if (!bar) return;
      bar.textContent = '';
      FILTERS.forEach(function (f) {
        var btn = el('button', {
          type: 'button',
          class: 'filter',
          'data-mood': f.mood,
          'aria-pressed': 'false'
        }, [
          f.mood !== 'all' ? el('span', { class: 'mood-dot', 'data-mood': f.mood }) : null,
          el('span', { text: f.label })
        ]);
        btn.addEventListener('click', function () { setFilter(f.mood); });
        bar.appendChild(btn);
      });
    }

    buildFilterBar();

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        var param = new URLSearchParams(window.location.search).get('mood');
        setFilter(param || 'all');
      })
      .catch(function (error) {
        console.error(error);
        list.textContent = '';
        list.appendChild(el('p', { text: 'โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }));
      });
  }

  /* =========================================================
     2) order.html
     ========================================================= */
  function initOrder() {
    var form = $('#orderForm');
    if (!form) return;

    // เติมชื่อสินค้าและราคาจาก URL ทันทีที่โหลดหน้า
    var params = new URLSearchParams(window.location.search);
    var itemField = $('#items');
    var totalField = $('#total');
    if (itemField) itemField.value = params.get('item') || '';
    if (totalField) totalField.value = params.get('price') || '';

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      var payload = {
        customerName: $('#customerName').value.trim(),
        contact: $('#contact').value.trim(),
        items: $('#items').value.trim(),
        total: $('#total').value.trim(),
        note: $('#note') ? $('#note').value.trim() : ''
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* =========================================================
     3) admin.html
     ========================================================= */

  // parse CSV เอง: รองรับเครื่องหมายคำพูด, comma/ขึ้นบรรทัดใหม่ในช่อง, "" แทน "
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // ตัด BOM

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    // ตัดแถวว่าง
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  // แปลงข้อความวันเวลาเป็น timestamp (รองรับ dd/mm/yyyy และ ปี พ.ศ.) คืน NaN ถ้าอ่านไม่ได้
  function parseDate(str) {
    var s = String(str || '').trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      var year = parseInt(m[3], 10);
      if (year > 2400) year -= 543;
      return new Date(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10),
        parseInt(m[4] || 0, 10), parseInt(m[5] || 0, 10), parseInt(m[6] || 0, 10)).getTime();
    }
    return Date.parse(s);
  }

  // เรียงล่าสุดขึ้นก่อน (ถ้าอ่านวันที่ไม่ครบทุกแถว ใช้ลำดับในชีตกลับด้านแทน)
  function sortNewestFirst(rows) {
    var items = rows.map(function (r, i) { return { row: r, index: i, time: parseDate(r[0]) }; });
    var allValid = items.every(function (it) { return !isNaN(it.time); });

    items.sort(function (a, b) {
      if (allValid && a.time !== b.time) return b.time - a.time;
      return b.index - a.index;
    });
    return items.map(function (it) { return it.row; });
  }

  function initAdmin() {
    var table = $('#ordersTable');
    if (!table) return;

    var tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = el('tbody');
      table.appendChild(tbody);
    }

    function showMessage(text) {
      tbody.textContent = '';
      var td = el('td', { colspan: '6', text: text });
      tbody.appendChild(el('tr', {}, [td]));
    }

    showMessage('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // ตัดแถวหัวตาราง

        if (!rows.length) {
          showMessage('ยังไม่มีออเดอร์');
          return;
        }

        tbody.textContent = '';
        sortNewestFirst(rows).forEach(function (r) {
          var tr = el('tr');
          // วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
          for (var i = 0; i < 6; i++) {
            tr.appendChild(el('td', { text: r[i] || '' }));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initProducts();
    initOrder();
    initAdmin();
  });
})();
