// DMZ 도메인 관리 시스템 - 대시보드 로직
(function () {
  'use strict';

  // ===== 상태 =====
  var domains = [];          // 서버에서 받은 전체 도메인 목록
  var editingId = null;      // 수정 중인 도메인 id (없으면 추가 모드)

  // ===== 요소 캐시 =====
  var $ = function (id) { return document.getElementById(id); };

  var currentUserEl = $('current-user');
  var noticeEl = $('notice');
  var tbody = $('domain-tbody');

  var searchInput = $('search-input');
  var filterHanwha = $('filter-hanwha');
  var filterPending = $('filter-pending');

  // 도메인 모달
  var domainModal = $('domain-modal');
  var domainForm = $('domain-form');
  var domainModalTitle = $('domain-modal-title');
  var domainFormError = $('domain-form-error');
  var domainSaveBtn = $('domain-save-btn');

  var fName = $('f-name');
  var fIp = $('f-ip');
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

  var BOOL_FIELDS = [
    { key: 'webFirewall', label: '웹방화벽' },
    { key: 'webSSL', label: '웹 SSL' },
    { key: 'vulnScan', label: '취약점진단' },
    { key: 'dnsApproval', label: 'DNS 결재' }
  ];

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

  function showNotice(text, isError) {
    noticeEl.textContent = text;
    noticeEl.className = 'notice' + (isError ? ' error' : '');
    noticeEl.style.display = 'block';
  }
  function hideNotice() {
    noticeEl.style.display = 'none';
  }

  function redirectToLogin() {
    window.location.href = '/login.html';
  }

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
        // 호출자가 .then 체인을 진행하지 않도록 영원히 미해결 프라미스 반환
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
        if (!data || !data.authenticated) {
          redirectToLogin();
          return;
        }
        currentUserEl.textContent = data.username || '-';
        loadDomains();
      })
      .catch(function () {
        // 세션 확인 실패 시 안전하게 로그인 화면으로
        redirectToLogin();
      });
  }

  // ===== 도메인 로드 =====
  function loadDomains() {
    api('/api/domains').then(function (result) {
      if (!result) return;
      if (result.status === 200 && Array.isArray(result.data)) {
        domains = result.data;
        hideNotice();
        renderStats();
        renderTable();
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

    BOOL_FIELDS.forEach(function (f) {
      var done = domains.filter(function (d) { return d[f.key]; }).length;
      var pending = total - done;
      var pct = total === 0 ? 0 : Math.round((done / total) * 100);

      var valEl = $('stat-' + f.key);
      var subEl = $('stat-' + f.key + '-sub');
      if (valEl) {
        valEl.innerHTML = '<span class="pct">' + pct + '%</span>';
      }
      if (subEl) {
        subEl.innerHTML = '완료 ' + done + '건 · <span style="color:var(--no);font-weight:700;">미완료 ' + pending + '건</span>';
      }
    });
  }

  // ===== 필터링 =====
  function getFilteredDomains() {
    var q = searchInput.value.trim().toLowerCase();
    var onlyHanwha = filterHanwha.checked;
    var onlyPending = filterPending.checked;

    return domains.filter(function (d) {
      if (q) {
        var name = (d.name || '').toLowerCase();
        if (name.indexOf(q) === -1) return false;
      }
      if (onlyHanwha && !d.isHanwha) return false;
      if (onlyPending) {
        var hasPending = BOOL_FIELDS.some(function (f) { return !d[f.key]; });
        if (!hasPending) return false;
      }
      return true;
    });
  }

  // ===== 배지 렌더 =====
  function boolBadge(val) {
    if (val) {
      return '<span class="badge ok">✅ 적용</span>';
    }
    return '<span class="badge no">❌ 미적용</span>';
  }

  function hanwhaBadge(val) {
    if (val) {
      return '<span class="badge hanwha">한화시스템/ICT</span>';
    }
    return '<span class="badge external">외부</span>';
  }

  // ===== 테이블 렌더 =====
  function renderTable() {
    var list = getFilteredDomains();
    tbody.innerHTML = '';

    if (list.length === 0) {
      var empty = document.createElement('tr');
      empty.className = 'empty-row';
      var td = document.createElement('td');
      td.colSpan = 10;
      td.textContent = domains.length === 0
        ? '등록된 도메인이 없습니다. "+ 도메인 추가" 버튼으로 등록하세요.'
        : '검색/필터 조건에 맞는 도메인이 없습니다.';
      empty.appendChild(td);
      tbody.appendChild(empty);
      return;
    }

    list.forEach(function (d) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="col-name">' + escapeHtml(d.name) + '</td>' +
        '<td>' + escapeHtml(d.ip) + '</td>' +
        '<td>' + escapeHtml(d.owner) + '</td>' +
        '<td>' + hanwhaBadge(d.isHanwha) + '</td>' +
        '<td>' + boolBadge(d.webFirewall) + '</td>' +
        '<td>' + boolBadge(d.webSSL) + '</td>' +
        '<td>' + boolBadge(d.vulnScan) + '</td>' +
        '<td>' + boolBadge(d.dnsApproval) + '</td>' +
        '<td class="desc-cell" title="' + escapeHtml(d.description) + '">' + escapeHtml(d.description) + '</td>' +
        '<td class="col-actions">' +
          '<button class="btn btn-sm" type="button" data-action="edit" data-id="' + escapeHtml(d.id) + '">수정</button> ' +
          '<button class="btn btn-sm btn-danger" type="button" data-action="delete" data-id="' + escapeHtml(d.id) + '">삭제</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  // ===== 모달 헬퍼 =====
  function openModal(modal) { modal.classList.add('open'); }
  function closeModal(modal) { modal.classList.remove('open'); }

  function setFormError(el, text) {
    if (text) {
      el.textContent = text;
      el.classList.add('show');
    } else {
      el.textContent = '';
      el.classList.remove('show');
    }
  }

  // ===== 도메인 추가/수정 모달 =====
  function openDomainModal(domain) {
    setFormError(domainFormError, '');
    if (domain) {
      editingId = domain.id;
      domainModalTitle.textContent = '도메인 수정';
      fName.value = domain.name || '';
      fIp.value = domain.ip || '';
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
          loadDomains();
        } else {
          var err = (result.data && result.data.error) ? result.data.error : '저장에 실패했습니다.';
          setFormError(domainFormError, err);
        }
      })
      .catch(function () {
        setFormError(domainFormError, '서버와 통신할 수 없습니다.');
      })
      .then(function () {
        domainSaveBtn.disabled = false;
        domainSaveBtn.textContent = prev;
      });
  }

  function deleteDomain(id) {
    var domain = domains.filter(function (d) { return d.id === id; })[0];
    var label = domain ? domain.name : '이 도메인';
    if (!window.confirm('"' + label + '" 도메인을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.')) {
      return;
    }
    api('/api/domains/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (result) {
        if (!result) return;
        if (result.status === 200 && result.data && result.data.ok) {
          loadDomains();
        } else {
          var err = (result.data && result.data.error) ? result.data.error : '삭제에 실패했습니다.';
          showNotice(err, true);
        }
      })
      .catch(function () {
        showNotice('삭제 중 서버와 통신할 수 없습니다.', true);
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

    if (!current || !next) {
      setFormError(pwFormError, '현재 비밀번호와 새 비밀번호를 입력하세요.');
      return;
    }
    if (next !== next2) {
      setFormError(pwFormError, '새 비밀번호와 확인 값이 일치하지 않습니다.');
      return;
    }
    if (next === current) {
      setFormError(pwFormError, '새 비밀번호가 현재 비밀번호와 동일합니다.');
      return;
    }

    pwSaveBtn.disabled = true;
    var prev = pwSaveBtn.textContent;
    pwSaveBtn.textContent = '변경 중...';

    api('/api/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: current, newPassword: next })
    })
      .then(function (result) {
        if (!result) return;
        if (result.status === 200 && result.data && result.data.ok) {
          pwForm.reset();
          pwSuccess.className = 'msg success';
          pwSuccess.textContent = '비밀번호가 변경되었습니다.';
        } else {
          var err = (result.data && result.data.error) ? result.data.error : '비밀번호 변경에 실패했습니다.';
          setFormError(pwFormError, err);
        }
      })
      .catch(function () {
        setFormError(pwFormError, '서버와 통신할 수 없습니다.');
      })
      .then(function () {
        pwSaveBtn.disabled = false;
        pwSaveBtn.textContent = prev;
      });
  }

  // ===== 로그아웃 =====
  function logout() {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () { redirectToLogin(); })
      .catch(function () { redirectToLogin(); });
  }

  // ===== 이벤트 바인딩 =====
  function bindEvents() {
    $('btn-add').addEventListener('click', function () { openDomainModal(null); });
    $('btn-change-pw').addEventListener('click', openPwModal);
    $('btn-logout').addEventListener('click', logout);

    searchInput.addEventListener('input', renderTable);
    filterHanwha.addEventListener('change', renderTable);
    filterPending.addEventListener('change', renderTable);

    domainForm.addEventListener('submit', submitDomain);
    pwForm.addEventListener('submit', submitPassword);

    // 테이블 수정/삭제 (이벤트 위임)
    tbody.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if (action === 'edit') {
        var domain = domains.filter(function (d) { return d.id === id; })[0];
        if (domain) openDomainModal(domain);
      } else if (action === 'delete') {
        deleteDomain(id);
      }
    });

    // 모달 닫기 버튼 / 오버레이 클릭
    document.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var modal = $(el.getAttribute('data-close'));
        if (modal) closeModal(modal);
      });
    });
    [domainModal, pwModal].forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal(modal);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal(domainModal);
        closeModal(pwModal);
      }
    });
  }

  // ===== 초기화 =====
  bindEvents();
  checkSession();
})();
