// 로그인 화면 로직
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var msg = document.getElementById('login-msg');
  var btn = document.getElementById('login-btn');
  var usernameEl = document.getElementById('username');
  var passwordEl = document.getElementById('password');

  function showError(text) {
    msg.className = 'msg error';
    msg.textContent = text;
  }

  function clearMsg() {
    msg.className = 'msg';
    msg.textContent = '';
  }

  // 이미 로그인되어 있으면 대시보드로 이동
  function checkSession() {
    fetch('/api/session', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.authenticated) {
          window.location.href = '/';
        }
      })
      .catch(function () { /* 세션 확인 실패 시 그냥 로그인 화면 유지 */ });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearMsg();

    var username = usernameEl.value.trim();
    var password = passwordEl.value;

    if (!username || !password) {
      showError('아이디와 비밀번호를 모두 입력하세요.');
      return;
    }

    btn.disabled = true;
    var prevText = btn.textContent;
    btn.textContent = '로그인 중...';

    fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 200 && result.data && result.data.ok) {
          window.location.href = '/';
          return;
        }
        var err = (result.data && result.data.error)
          ? result.data.error
          : '아이디 또는 비밀번호가 올바르지 않습니다.';
        showError(err);
        btn.disabled = false;
        btn.textContent = prevText;
      })
      .catch(function () {
        showError('서버와 통신할 수 없습니다. 잠시 후 다시 시도하세요.');
        btn.disabled = false;
        btn.textContent = prevText;
      });
  });

  checkSession();
})();
