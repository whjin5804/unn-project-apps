// DMZ 도메인 관리 시스템 - 대시보드 로직
(function () {
  'use strict';

  // ===== 상태 =====
  var domains = [];          // 서버에서 받은 전체 도메인 목록
  var editingId = null;      // 수정 중인 도메인 id (없으면 추가 모드)
  var selected = {};         // 일괄 선택된 id 맵
  var sortKey = 'name';      // 현재 정렬 기준
  var sortDir = 1;           // 1: 오름차순, -1: 내림차순
  var currentPage = 1;       // 현재 페이지(1-base)
  var pageSize = 10;         // 페이지당 건수 (0 = 전체)
  var importRows = null;     // CSV 가져오기 파싱 결과 임시 저장
  var detailId = null;       // 상세 모달에 표시 중인 도메인 id

  // ===== 요소 캐시 =====
  var $ = function (id) { return document.getElementById(id); };

  var currentUserEl = $('current-user');
  var noticeEl = $('notice');
  var tbody = $('domain-tbody');

  var searchInput = $('search-input');
  var filterAffiliate = $('filter-affiliate');
  var filterOperation = $('filter-operation');
  var filterSecurity = $('filter-security');

  var resultCount = $('result-count');
  var bulkActions = $('bulk-actions');
  var bulkCount = $('bulk-count');
  var checkAll = $('check-all');

  var pageSizeSel = $('page-size');
  var pageInfo = $('page-info');

  // 도메인 모달
  var domainModal = $('domain-modal');
  var domainForm = $('domain-form');
  var domainModalTitle = $('domain-modal-title');
  var domainFormError = $('domain-form-error');
  var domainSaveBtn = $('domain-save-btn');
  var affiliateList = $('affiliate-list');

  var fName = $('f-name');
  var fIp = $('f-ip');
  var fAffiliate = $('f-affiliate');
  var fOwner = $('f-owner');
  var fIsHanwha = $('f-isHanwha');
  var fWebFirewall = $('f-webFirewall');
  var fWebSSL = $('f-webSSL');
  var fVulnScan = $('f-vulnScan');
  var fDnsApproval = $('f-dnsApproval');
  var fDescription = $('f-description');

  // 비밀번호 모달
  var pwModal = $('pw-modal');
  var pwForm = $('pw-form');
  var pwFormError = $('pw-form-error');
  var pwSuccess = $('pw-success');
  var pwSaveBtn = $('pw-save-btn');
  var fCurrentPassword = $('f-currentPassword');
  var fNewPassword = $('f-newPassword');
  var fNewPassword2 = $('f-newPassword2');

  // 기타 모달
  var detailModal = $('detail-modal');
  var detailBody = $('detail-body');
  var importModal = $('import-modal');
  var importFile = $('import-file');
  var importPreview = $('import-preview');
  var importError = $('import-error');
  var importConfirmBtn = $('import-confirm-btn');
  var logsModal = $('logs-modal');
  var logsTbody = $('logs-tbody');

  var BOOL_FIELDS = [
    { key: 'webFirewall', label: '웹방화벽' },
    { key: 'webSSL', label: '웹 SSL' },
    { key: 'vulnScan', label: '취약점진단' },
    { key: 'dnsApproval', label: 'DNS 결재' }
  ];

  // CSV 헤더 ↔ 필드 매핑
  var CSV_COLS = [
    { key: 'name', header: '도메인명' },
    { key: 'ip', header: 'IP주소' },
    { key: 'affiliate', header: '계열사' },
    { key: 'owner', header: '운영주체' },
    { key: 'isHanwha', header: '한화운영', bool: true },
    { key: 'webFirewall', header: '웹방화벽', bool: true },
    { key: 'webSSL', header: '웹SSL', bool: true },
    { key: 'vulnScan', header: '취약점진단', bool: true },
    { key: 'dnsApproval', header: 'DNS결재', bool: true },
    { key: 'description', header: '비고' }
  ];

  var LOG_LABELS = {
    'auth.login': '로그인',
    'auth.logout': '로그아웃',
    'auth.password': '비밀번호 변경',
    'domain.create': '도메인 등록',
    'domain.update': '도메인 수정',
    'domain.delete': '도메인 삭제',
    'domain.bulk': '일괄 등록'
  };

  // ===== 유틸 =====
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scoreOf(d) {
    return BOOL_FIELDS.reduce(function (n, f) { return n + (d[f.key] ? 1 : 0); }, 0);
  }

  function formatDate(iso) {
    if (!iso) return '-';
    var dt = new Date(iso);
    if (isNaN(dt.getTime())) return escapeHtml(iso);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) +
      ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
  }

  // ===== 토스트 알림 =====
  function toast(message, type) {
    var c = $('toast-container');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = message;
    c.appendChild(el);
    // 등장 애니메이션
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, 3000);
  }

  function showNotice(text, isError) {
    noticeEl.textContent = text;
    noticeEl.className = 'notice' + (isError ? ' error' : '');
    noticeEl.style.display = 'block';
  }
  function hideNotice() { noticeEl.style.display = 'none'; }

  function redirectToLogin() { window.location.href = '/login.html'; }

  // 공통 fetch 래퍼: 401이면 로그인 화면으로, JSON 파싱 후 {status,data} 반환
  function api(path, options) {
    options = options || {};
    options.credentials = 'same-origin';
    if (options.body && !(options.headers && options.headers['Content-Type'])) {
      options.headers = options.headers || {};
      options.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, options).then(function (res) {
      if (res.status === 401) {
        redirectToLogin();
        return new Promise(function () {});
      }
      return res.json().catch(function () { return null; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  // ===== 세션 확인 =====
  function checkSession() {
    fetch('/api/session', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.authenticated) { redirectToLogin(); return; }
        currentUserEl.textContent = data.username || '-';
        loadDomains();
      })
      .catch(function () { redirectToLogin(); });
  }

  // ===== 도메인 로드 =====
  function loadDomains(silent) {
    api('/api/domains').then(function (result) {
      if (!result) return;
      if (result.status === 200 && Array.isArray(result.data)) {
        domains = result.data;
        hideNotice();
        rebuildAffiliateOptions();
        renderStats();
        render();
        if (silent) toast('목록을 새로고침했습니다.', 'success');
      } else {
        showNotice('도메인 목록을 불러오지 못했습니다.', true);
      }
    }).catch(function () {
      showNotice('서버와 통신할 수 없습니다. 잠시 후 다시 시도하세요.', true);
    });
  }

  // ===== 통계 =====
  function renderStats() {
    var total = domains.length;
    var hanwhaCount = domains.filter(function (d) { return d.isHanwha; }).length;

    $('stat-total').textContent = total;
    $('stat-hanwha').textContent = hanwhaCount;
    $('stat-hanwha-sub').textContent = '외부 ' + (total - hanwhaCount) + '건';

    BOOL_FIELDS.forEach(function (f) {
      var done = domains.filter(function (d) { return d[f.key]; }).length;
      var pending = total - done;
      var pct = total === 0 ? 0 : Math.round((done / total) * 100);

      var valEl = $('stat-' + f.key);
      var subEl = $('stat-' + f.key + '-sub');
      var barEl = $('bar-' + f.key);
      if (valEl) valEl.innerHTML = '<span class="pct">' + pct + '%</span>';
      if (subEl) subEl.innerHTML = '✓ ' + done + '건 &nbsp;✗ ' + pending + '건';
      if (barEl) barEl.style.width = pct + '%';
    });
  }

  // ===== 계열사 옵션/자동완성 갱신 =====
  function rebuildAffiliateOptions() {
    var set = {};
    domains.forEach(function (d) { if (d.affiliate) set[d.affiliate] = true; });
    var names = Object.keys(set).sort();

    var prev = filterAffiliate.value;
    filterAffiliate.innerHTML = '<option value="">계열사 전체</option>';
    names.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      filterAffiliate.appendChild(o);
    });
    filterAffiliate.value = prev;

    affiliateList.innerHTML = '';
    names.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      affiliateList.appendChild(o);
    });
  }

  // ===== 필터링 + 정렬 =====
  function getFilteredDomains() {
    var q = searchInput.value.trim().toLowerCase();
    var aff = filterAffiliate.value;
    var op = filterOperation.value;
    var sec = filterSecurity.value;

    var list = domains.filter(function (d) {
      if (q) {
        var hay = ((d.name || '') + ' ' + (d.ip || '') + ' ' + (d.owner || '') + ' ' + (d.affiliate || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (aff && d.affiliate !== aff) return false;
      if (op === 'hanwha' && !d.isHanwha) return false;
      if (op === 'external' && d.isHanwha) return false;
      if (sec === 'complete' && scoreOf(d) !== 4) return false;
      if (sec === 'pending' && scoreOf(d) === 4) return false;
      return true;
    });

    list.sort(function (a, b) {
      var av, bv;
      if (sortKey === 'score') { av = scoreOf(a); bv = scoreOf(b); }
      else {
        av = a[sortKey]; bv = b[sortKey];
        if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
        else { av = (av === null || av === undefined) ? '' : String(av).toLowerCase();
               bv = (bv === null || bv === undefined) ? '' : String(bv).toLowerCase(); }
      }
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return list;
  }

  // ===== 배지 렌더 =====
  function boolBadge(val) {
    return val ? '<span class="badge ok">O</span>' : '<span class="badge no">X</span>';
  }
  function hanwhaBadge(val) {
    return val ? '<span class="badge hanwha">O</span>' : '<span class="badge external">X</span>';
  }
  function scoreBadge(d) {
    var s = scoreOf(d);
    var cls = s === 4 ? 'ok' : (s === 0 ? 'no' : 'warn');
    return '<span class="score-badge ' + cls + '">' + s + '/4</span>';
  }

  // ===== 메인 렌더 (테이블 + 페이저 + 결과수 + 선택바) =====
  function render() {
    var list = getFilteredDomains();
    updateSortIndicators();

    // 페이지 계산
    var size = pageSize > 0 ? pageSize : list.length || 1;
    var totalPages = Math.max(1, Math.ceil(list.length / size));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * size;
    var pageItems = pageSize > 0 ? list.slice(start, start + size) : list;

    tbody.innerHTML = '';
    if (list.length === 0) {
      var empty = document.createElement('tr');
      empty.className = 'empty-row';
      var td = document.createElement('td');
      td.colSpan = 13;
      td.textContent = domains.length === 0
        ? '등록된 도메인이 없습니다. "+ 도메인 추가" 버튼으로 등록하세요.'
        : '검색/필터 조건에 맞는 도메인이 없습니다.';
      empty.appendChild(td);
      tbody.appendChild(empty);
    } else {
      pageItems.forEach(function (d) {
        var tr = document.createElement('tr');
        if (selected[d.id]) tr.className = 'row-selected';
        tr.innerHTML =
          '<td class="col-check"><input type="checkbox" data-check="' + escapeHtml(d.id) + '"' + (selected[d.id] ? ' checked' : '') + ' /></td>' +
          '<td class="col-name">' + escapeHtml(d.name) + '</td>' +
          '<td>' + escapeHtml(d.ip) + '</td>' +
          '<td>' + escapeHtml(d.affiliate || '') + '</td>' +
          '<td>' + escapeHtml(d.owner) + '</td>' +
          '<td>' + hanwhaBadge(d.isHanwha) + '</td>' +
          '<td>' + boolBadge(d.webFirewall) + '</td>' +
          '<td>' + boolBadge(d.webSSL) + '</td>' +
          '<td>' + boolBadge(d.vulnScan) + '</td>' +
          '<td>' + boolBadge(d.dnsApproval) + '</td>' +
          '<td>' + scoreBadge(d) + '</td>' +
          '<td class="desc-cell" title="' + escapeHtml(d.description) + '">' + escapeHtml(d.description) + '</td>' +
          '<td class="col-actions">' +
            '<button class="btn btn-sm" type="button" data-action="detail" data-id="' + escapeHtml(d.id) + '">상세</button> ' +
            '<button class="btn btn-sm" type="button" data-action="edit" data-id="' + escapeHtml(d.id) + '">수정</button> ' +
            '<button class="btn btn-sm btn-danger" type="button" data-action="delete" data-id="' + escapeHtml(d.id) + '">삭제</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    // 결과 수
    resultCount.textContent = '총 ' + domains.length + '건 중 ' + list.length + '건 표시';

    // 페이저
    pageInfo.textContent = currentPage + ' / ' + totalPages + ' 페이지';
    $('page-prev').disabled = currentPage <= 1;
    $('page-next').disabled = currentPage >= totalPages;

    // 전체선택 체크 상태 (현재 페이지 기준)
    var allChecked = pageItems.length > 0 && pageItems.every(function (d) { return selected[d.id]; });
    checkAll.checked = allChecked;

    updateBulkBar();
  }

  function updateSortIndicators() {
    var ths = document.querySelectorAll('th.sortable');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.getAttribute('data-sort') === sortKey) {
        th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      }
    }
  }

  function updateBulkBar() {
    var ids = Object.keys(selected);
    if (ids.length > 0) {
      bulkActions.style.display = 'flex';
      bulkCount.textContent = ids.length + '건 선택';
    } else {
      bulkActions.style.display = 'none';
    }
  }

  // ===== 모달 헬퍼 =====
  function openModal(modal) { modal.classList.add('open'); }
  function closeModal(modal) { modal.classList.remove('open'); }
  function anyModalOpen() { return !!document.querySelector('.modal-overlay.open'); }

  function setFormError(el, text) {
    if (text) { el.textContent = text; el.classList.add('show'); }
    else { el.textContent = ''; el.classList.remove('show'); }
  }

  // ===== 도메인 추가/수정 모달 =====
  function openDomainModal(domain) {
    setFormError(domainFormError, '');
    if (domain) {
      editingId = domain.id;
      domainModalTitle.textContent = '도메인 수정';
      fName.value = domain.name || '';
      fIp.value = domain.ip || '';
      fAffiliate.value = domain.affiliate || '';
      fOwner.value = domain.owner || '';
      fIsHanwha.checked = !!domain.isHanwha;
      fWebFirewall.checked = !!domain.webFirewall;
      fWebSSL.checked = !!domain.webSSL;
      fVulnScan.checked = !!domain.vulnScan;
      fDnsApproval.checked = !!domain.dnsApproval;
      fDescription.value = domain.description || '';
    } else {
      editingId = null;
      domainModalTitle.textContent = '도메인 추가';
      domainForm.reset();
    }
    openModal(domainModal);
    fName.focus();
  }

  function submitDomain(e) {
    e.preventDefault();
    setFormError(domainFormError, '');

    var name = fName.value.trim();
    if (!name) {
      setFormError(domainFormError, '도메인명은 필수 입력 항목입니다.');
      fName.focus();
      return;
    }

    var payload = {
      name: name,
      ip: fIp.value.trim(),
      affiliate: fAffiliate.value.trim(),
      owner: fOwner.value.trim(),
      isHanwha: fIsHanwha.checked,
      webFirewall: fWebFirewall.checked,
      webSSL: fWebSSL.checked,
      vulnScan: fVulnScan.checked,
      dnsApproval: fDnsApproval.checked,
      description: fDescription.value
    };

    var isEdit = !!editingId;
    var path = isEdit ? '/api/domains/' + encodeURIComponent(editingId) : '/api/domains';
    var method = isEdit ? 'PUT' : 'POST';

    domainSaveBtn.disabled = true;
    var prev = domainSaveBtn.textContent;
    domainSaveBtn.textContent = '저장 중...';

    api(path, { method: method, body: JSON.stringify(payload) })
      .then(function (result) {
        if (!result) return;
        var okStatus = isEdit ? 200 : 201;
        if (result.status === okStatus && result.data && (result.data.id || result.data.ok !== false)) {
          closeModal(domainModal);
          toast(isEdit ? '도메인을 수정했습니다.' : '도메인을 등록했습니다.', 'success');
          loadDomains();
        } else {
          setFormError(domainFormError, (result.data && result.data.error) || '저장에 실패했습니다.');
        }
      })
      .catch(function () { setFormError(domainFormError, '서버와 통신할 수 없습니다.'); })
      .then(function () { domainSaveBtn.disabled = false; domainSaveBtn.textContent = prev; });
  }

  function deleteDomain(id) {
    var domain = findDomain(id);
    var label = domain ? domain.name : '이 도메인';
    if (!window.confirm('"' + label + '" 도메인을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.')) return;
    api('/api/domains/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (result) {
        if (!result) return;
        if (result.status === 200 && result.data && result.data.ok) {
          delete selected[id];
          toast('도메인을 삭제했습니다.', 'success');
          loadDomains();
        } else {
          toast((result.data && result.data.error) || '삭제에 실패했습니다.', 'error');
        }
      })
      .catch(function () { toast('삭제 중 서버와 통신할 수 없습니다.', 'error'); });
  }

  function findDomain(id) {
    return domains.filter(function (d) { return d.id === id; })[0];
  }

  // ===== 상세 모달 =====
  function openDetail(id) {
    var d = findDomain(id);
    if (!d) return;
    detailId = id;
    function row(label, value) {
      return '<div class="detail-row"><div class="detail-label">' + label + '</div><div class="detail-value">' + value + '</div></div>';
    }
    detailBody.innerHTML =
      row('도메인명', '<strong>' + escapeHtml(d.name) + '</strong>') +
      row('IP 주소', escapeHtml(d.ip) || '-') +
      row('계열사', escapeHtml(d.affiliate) || '-') +
      row('운영주체/부서', escapeHtml(d.owner) || '-') +
      row('운영여부', d.isHanwha ? '<span class="badge hanwha">한화시스템/ICT</span>' : '<span class="badge external">외부</span>') +
      row('웹방화벽', boolBadge(d.webFirewall)) +
      row('웹 SSL', boolBadge(d.webSSL)) +
      row('취약점진단', boolBadge(d.vulnScan)) +
      row('DNS 결재', boolBadge(d.dnsApproval)) +
      row('보안 완료', scoreBadge(d)) +
      row('비고', escapeHtml(d.description) || '-') +
      row('등록일시', formatDate(d.createdAt)) +
      row('수정일시', formatDate(d.updatedAt));
    openModal(detailModal);
  }

  // ===== CSV 내보내기 =====
  function csvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv() {
    var list = getFilteredDomains();
    var lines = [];
    lines.push(CSV_COLS.map(function (c) { return csvCell(c.header); }).join(','));
    list.forEach(function (d) {
      lines.push(CSV_COLS.map(function (c) {
        var v = d[c.key];
        if (c.bool) v = v ? 'O' : 'X';
        return csvCell(v);
      }).join(','));
    });
    // Excel 한글 깨짐 방지용 BOM
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var ts = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    a.href = url;
    a.download = 'dmz-domains-' + ts.getFullYear() + p(ts.getMonth() + 1) + p(ts.getDate()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(list.length + '건을 CSV로 내보냈습니다.', 'success');
  }

  // ===== CSV 파싱 =====
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM 제거
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (ch === '\r') { /* skip */ }
        else field += ch;
      }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r.length === 1 && r[0].trim() !== ''); });
  }

  function parseBool(v) {
    var s = String(v || '').trim().toLowerCase();
    return s === 'o' || s === 'true' || s === '1' || s === 'y' || s === 'yes' || s === '예' || s === '적용' || s === '완료';
  }

  function handleImportFile() {
    importRows = null;
    importConfirmBtn.disabled = true;
    importPreview.innerHTML = '';
    setFormError(importError, '');
    var file = importFile.files && importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rows = parseCsv(String(reader.result));
        if (rows.length < 2) { setFormError(importError, '데이터 행이 없습니다. 헤더 + 1행 이상이 필요합니다.'); return; }
        var header = rows[0].map(function (h) { return h.trim(); });
        // 헤더 → 인덱스 매핑
        var idx = {};
        CSV_COLS.forEach(function (c) { idx[c.key] = header.indexOf(c.header); });
        if (idx.name === -1) { setFormError(importError, "'도메인명' 헤더를 찾을 수 없습니다."); return; }
        var parsed = [];
        for (var r = 1; r < rows.length; r++) {
          var cells = rows[r];
          var obj = {};
          CSV_COLS.forEach(function (c) {
            var v = idx[c.key] >= 0 ? (cells[idx[c.key]] || '').trim() : '';
            obj[c.key] = c.bool ? parseBool(v) : v;
          });
          if (obj.name) parsed.push(obj);
        }
        if (parsed.length === 0) { setFormError(importError, '유효한 데이터 행(도메인명 포함)이 없습니다.'); return; }
        importRows = parsed;
        importConfirmBtn.disabled = false;
        importPreview.innerHTML = '<div class="import-ok">✓ ' + parsed.length + '건을 가져올 준비가 되었습니다. 미리보기(상위 5건):</div>' +
          '<ul class="import-list">' + parsed.slice(0, 5).map(function (o) {
            return '<li>' + escapeHtml(o.name) + (o.affiliate ? ' <span class="muted">(' + escapeHtml(o.affiliate) + ')</span>' : '') + '</li>';
          }).join('') + '</ul>';
      } catch (err) {
        setFormError(importError, 'CSV 파싱 중 오류가 발생했습니다.');
      }
    };
    reader.onerror = function () { setFormError(importError, '파일을 읽을 수 없습니다.'); };
    reader.readAsText(file, 'utf-8');
  }

  function confirmImport() {
    if (!importRows || importRows.length === 0) return;
    importConfirmBtn.disabled = true;
    var prev = importConfirmBtn.textContent;
    importConfirmBtn.textContent = '가져오는 중...';
    api('/api/domains/bulk', { method: 'POST', body: JSON.stringify({ domains: importRows }) })
      .then(function (result) {
        if (!result) return;
        if (result.status === 200 && result.data && result.data.ok) {
          closeModal(importModal);
          importFile.value = '';
          var msg = result.data.created + '건을 등록했습니다.';
          if (result.data.failed) msg += ' (' + result.data.failed + '건 실패)';
          toast(msg, result.data.failed ? 'info' : 'success');
          loadDomains();
        } else {
          setFormError(importError, (result.data && result.data.error) || '가져오기에 실패했습니다.');
        }
      })
      .catch(function () { setFormError(importError, '서버와 통신할 수 없습니다.'); })
      .then(function () { importConfirmBtn.disabled = false; importConfirmBtn.textContent = prev; });
  }

  // ===== 일괄 삭제 =====
  function bulkDelete() {
    var ids = Object.keys(selected);
    if (ids.length === 0) return;
    if (!window.confirm('선택한 ' + ids.length + '건의 도메인을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.')) return;
    var done = 0, fail = 0;
    var tasks = ids.map(function (id) {
      return api('/api/domains/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function (result) {
          if (result && result.status === 200 && result.data && result.data.ok) done++;
          else fail++;
        })
        .catch(function () { fail++; });
    });
    Promise.all(tasks).then(function () {
      selected = {};
      toast(done + '건 삭제 완료' + (fail ? ', ' + fail + '건 실패' : ''), fail ? 'info' : 'success');
      loadDomains();
    });
  }

  // ===== 활동 로그 =====
  function openLogs() {
    logsTbody.innerHTML = '<tr class="empty-row"><td colspan="4">불러오는 중...</td></tr>';
    openModal(logsModal);
    api('/api/logs?limit=100').then(function (result) {
      if (!result) return;
      if (result.status === 200 && Array.isArray(result.data)) {
        if (result.data.length === 0) {
          logsTbody.innerHTML = '<tr class="empty-row"><td colspan="4">활동 기록이 없습니다.</td></tr>';
          return;
        }
        logsTbody.innerHTML = result.data.map(function (l) {
          var label = LOG_LABELS[l.action] || l.action;
          return '<tr><td>' + formatDate(l.time) + '</td><td>' + escapeHtml(l.user || '-') +
            '</td><td>' + escapeHtml(label) + '</td><td>' + escapeHtml(l.detail || '') + '</td></tr>';
        }).join('');
      } else {
        logsTbody.innerHTML = '<tr class="empty-row"><td colspan="4">로그를 불러오지 못했습니다.</td></tr>';
      }
    }).catch(function () {
      logsTbody.innerHTML = '<tr class="empty-row"><td colspan="4">서버와 통신할 수 없습니다.</td></tr>';
    });
  }

  // ===== 비밀번호 변경 =====
  function openPwModal() {
    pwForm.reset();
    setFormError(pwFormError, '');
    pwSuccess.className = 'msg';
    pwSuccess.textContent = '';
    openModal(pwModal);
    fCurrentPassword.focus();
  }

  function submitPassword(e) {
    e.preventDefault();
    setFormError(pwFormError, '');
    pwSuccess.className = 'msg';
    pwSuccess.textContent = '';

    var current = fCurrentPassword.value;
    var next = fNewPassword.value;
    var next2 = fNewPassword2.value;

    if (!current || !next) { setFormError(pwFormError, '현재 비밀번호와 새 비밀번호를 입력하세요.'); return; }
    if (next !== next2) { setFormError(pwFormError, '새 비밀번호와 확인 값이 일치하지 않습니다.'); return; }
    if (next === current) { setFormError(pwFormError, '새 비밀번호가 현재 비밀번호와 동일합니다.'); return; }

    pwSaveBtn.disabled = true;
    var prev = pwSaveBtn.textContent;
    pwSaveBtn.textContent = '변경 중...';

    api('/api/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) })
      .then(function (result) {
        if (!result) return;
        if (result.status === 200 && result.data && result.data.ok) {
          pwForm.reset();
          pwSuccess.className = 'msg success';
          pwSuccess.textContent = '비밀번호가 변경되었습니다.';
          toast('비밀번호가 변경되었습니다.', 'success');
        } else {
          setFormError(pwFormError, (result.data && result.data.error) || '비밀번호 변경에 실패했습니다.');
        }
      })
      .catch(function () { setFormError(pwFormError, '서버와 통신할 수 없습니다.'); })
      .then(function () { pwSaveBtn.disabled = false; pwSaveBtn.textContent = prev; });
  }

  // ===== 로그아웃 =====
  function logout() {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () { redirectToLogin(); })
      .catch(function () { redirectToLogin(); });
  }

  // ===== 테마(다크모드) =====
  function applyTheme(theme) {
    var dark = theme === 'dark';
    document.body.classList.toggle('dark', dark);
    $('btn-theme').textContent = dark ? '☀ 라이트' : '🌙 다크';
  }
  function toggleTheme() {
    var dark = !document.body.classList.contains('dark');
    var theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('dmz-theme', theme); } catch (e) {}
    applyTheme(theme);
  }
  function initTheme() {
    var theme = 'light';
    try { theme = localStorage.getItem('dmz-theme') || 'light'; } catch (e) {}
    applyTheme(theme);
  }

  // ===== 이벤트 바인딩 =====
  function bindEvents() {
    $('btn-add').addEventListener('click', function () { openDomainModal(null); });
    $('btn-change-pw').addEventListener('click', openPwModal);
    $('btn-logout').addEventListener('click', logout);
    $('btn-theme').addEventListener('click', toggleTheme);
    $('btn-logs').addEventListener('click', openLogs);
    $('btn-refresh').addEventListener('click', function () { loadDomains(true); });
    $('btn-export').addEventListener('click', exportCsv);
    $('btn-import').addEventListener('click', function () {
      importRows = null; importFile.value = ''; importPreview.innerHTML = '';
      setFormError(importError, ''); importConfirmBtn.disabled = true;
      openModal(importModal);
    });
    importFile.addEventListener('change', handleImportFile);
    importConfirmBtn.addEventListener('click', confirmImport);

    // 필터/검색 → 1페이지로 리셋 후 렌더
    function onFilterChange() { currentPage = 1; render(); }
    searchInput.addEventListener('input', onFilterChange);
    filterAffiliate.addEventListener('change', onFilterChange);
    filterOperation.addEventListener('change', onFilterChange);
    filterSecurity.addEventListener('change', onFilterChange);
    $('btn-reset-filter').addEventListener('click', function () {
      searchInput.value = '';
      filterAffiliate.value = '';
      filterOperation.value = '';
      filterSecurity.value = '';
      currentPage = 1;
      render();
      toast('필터를 초기화했습니다.', 'info');
    });

    // 정렬
    document.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (sortKey === key) sortDir = -sortDir;
        else { sortKey = key; sortDir = 1; }
        render();
      });
    });

    // 페이지네이션
    pageSizeSel.addEventListener('change', function () {
      pageSize = parseInt(pageSizeSel.value, 10) || 0;
      currentPage = 1;
      render();
    });
    $('page-prev').addEventListener('click', function () { if (currentPage > 1) { currentPage--; render(); } });
    $('page-next').addEventListener('click', function () { currentPage++; render(); });

    // 전체선택 (현재 페이지)
    checkAll.addEventListener('change', function () {
      var checks = tbody.querySelectorAll('input[data-check]');
      checks.forEach(function (c) {
        var id = c.getAttribute('data-check');
        if (checkAll.checked) selected[id] = true; else delete selected[id];
      });
      render();
    });

    // 일괄 작업
    $('btn-bulk-delete').addEventListener('click', bulkDelete);
    $('btn-bulk-clear').addEventListener('click', function () { selected = {}; render(); });

    // 폼 제출
    domainForm.addEventListener('submit', submitDomain);
    pwForm.addEventListener('submit', submitPassword);

    // 상세 모달의 수정 버튼
    $('detail-edit-btn').addEventListener('click', function () {
      var d = findDomain(detailId);
      closeModal(detailModal);
      if (d) openDomainModal(d);
    });

    // 테이블 클릭 (체크박스 / 상세 / 수정 / 삭제) - 이벤트 위임
    tbody.addEventListener('click', function (e) {
      var chk = e.target.getAttribute && e.target.getAttribute('data-check');
      if (chk !== null && chk !== undefined && e.target.tagName === 'INPUT') {
        if (e.target.checked) selected[chk] = true; else delete selected[chk];
        render();
        return;
      }
      var btn = e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if (action === 'detail') openDetail(id);
      else if (action === 'edit') { var d = findDomain(id); if (d) openDomainModal(d); }
      else if (action === 'delete') deleteDomain(id);
    });

    // 모달 닫기 버튼 / 오버레이 클릭
    document.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var modal = $(el.getAttribute('data-close'));
        if (modal) closeModal(modal);
      });
    });
    document.querySelectorAll('.modal-overlay').forEach(function (modal) {
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(modal); });
    });

    // 키보드 단축키
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(function (m) { closeModal(m); });
        return;
      }
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing || anyModalOpen()) return;
      if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDomainModal(null); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); loadDomains(true); }
    });
  }

  // ===== 초기화 =====
  initTheme();
  bindEvents();
  checkSession();
})();
