// 접수 폼 공용 동작: 주소 검색, 첨부 파일 요약/미리보기, 제출 전 용량 확인, 중복 제출 방지
// 서버 검증이 기준이며, 여기서는 업로드 전에 알 수 있는 문제만 먼저 알려준다.
(function () {
  'use strict';

  var MB = 1024 * 1024;

  function formatSize(bytes) {
    if (bytes >= MB) {
      return (bytes / MB).toFixed(1).replace(/\.0$/, '') + 'MB';
    }
    return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  }

  function extension(name) {
    var dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toUpperCase() : '파일';
  }

  function setupUpload(input) {
    var field = input.closest('.field');
    var box = input.closest('.upload');
    var title = box.querySelector('.upload-title');
    var summary = field.querySelector('.upload-summary');
    var errorEl = field.querySelector('.upload-error');
    var thumbs = field.querySelector('.thumbs');
    var isPhoto = input.dataset.kind === 'photo';
    var noun = isPhoto ? '사진' : '동영상';
    var unit = isPhoto ? '장' : '개';
    var maxCount = Number(input.dataset.maxCount) || Infinity;
    var maxSize = Number(input.dataset.maxSize) || Infinity;
    var urls = [];

    function problem() {
      var files = Array.prototype.slice.call(input.files || []);
      if (files.length > maxCount) {
        return maxCount === 1
          ? noun + '은 1개만 올릴 수 있어요.'
          : noun + '은 최대 ' + maxCount + unit + '까지 올릴 수 있어요. (지금 ' + files.length + unit + ')';
      }
      var tooBig = files.filter(function (file) {
        return file.size > maxSize;
      });
      if (tooBig.length > 0) {
        var limit = formatSize(maxSize);
        return maxCount === 1
          ? noun + '은 ' + limit + '까지 올릴 수 있어요. 더 짧게 촬영해주세요.'
          : limit + '를 넘는 ' + noun + '이 ' + tooBig.length + unit + ' 있어요. 빼고 다시 선택해주세요.';
      }
      return '';
    }

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
      box.classList.toggle('is-invalid', Boolean(message));
    }

    function fileChip(file) {
      var chip = document.createElement('div');
      chip.className = 'file-chip';
      var ext = document.createElement('strong');
      ext.textContent = extension(file.name);
      var name = document.createElement('span');
      name.textContent = file.name;
      var size = document.createElement('span');
      size.textContent = formatSize(file.size);
      chip.appendChild(ext);
      chip.appendChild(name);
      chip.appendChild(size);
      return chip;
    }

    function render() {
      urls.forEach(function (url) {
        URL.revokeObjectURL(url);
      });
      urls = [];
      thumbs.textContent = '';

      var files = Array.prototype.slice.call(input.files || []);
      if (files.length === 0) {
        summary.hidden = true;
        thumbs.hidden = true;
        box.classList.remove('has-files');
        title.textContent = title.dataset.default;
        showError('');
        return;
      }

      var total = files.reduce(function (sum, file) {
        return sum + file.size;
      }, 0);
      summary.textContent = noun + ' ' + files.length + unit + ' 선택됨 · ' + formatSize(total);
      summary.hidden = false;
      box.classList.add('has-files');
      title.textContent = title.dataset.again;

      files.forEach(function (file) {
        var item = document.createElement('li');
        if (file.size > maxSize) {
          item.className = 'is-too-big';
        }
        // HEIC 등 브라우저가 그리지 못하는 형식은 파일 칩으로 대신 보여준다
        if (isPhoto && window.URL && URL.createObjectURL) {
          var url = URL.createObjectURL(file);
          urls.push(url);
          var img = document.createElement('img');
          img.alt = file.name;
          img.decoding = 'async';
          img.onerror = function () {
            item.replaceChild(fileChip(file), img);
          };
          img.src = url;
          item.appendChild(img);
        } else {
          item.appendChild(fileChip(file));
        }
        thumbs.appendChild(item);
      });
      thumbs.hidden = false;
      showError(problem());
    }

    input.addEventListener('change', render);
    render();

    return {
      check: function () {
        var message = problem();
        showError(message);
        return message ? errorEl : null;
      },
    };
  }

  // ---------- 주소 검색 (카카오 우편번호 서비스) ----------
  // 스크립트는 처음 버튼을 누를 때 불러온다. 모바일에서는 팝업이 막히기 쉬워 화면 위 레이어에 띄운다.
  var POSTCODE_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  var POSTCODE_TIMEOUT = 10000;
  var postcodeLoading = null;

  function loadPostcode() {
    if (window.daum && window.daum.Postcode) {
      return Promise.resolve();
    }
    if (postcodeLoading) {
      return postcodeLoading;
    }
    postcodeLoading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        reject(new Error('timeout'));
      }, POSTCODE_TIMEOUT);
      script.src = POSTCODE_SRC;
      script.async = true;
      script.onload = function () {
        clearTimeout(timer);
        var postcode = window.daum && window.daum.postcode;
        if (postcode && typeof postcode.load === 'function') {
          postcode.load(resolve);
        } else if (window.daum && window.daum.Postcode) {
          resolve();
        } else {
          reject(new Error('unavailable'));
        }
      };
      script.onerror = function () {
        clearTimeout(timer);
        reject(new Error('load failed'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      // 다음 클릭에서 다시 시도할 수 있게 한다
      postcodeLoading = null;
      throw error;
    });
    return postcodeLoading;
  }

  // 공식 예제와 같은 방식: 도로명주소에는 (법정동명, 아파트 건물명)을 덧붙인다
  function baseAddress(data) {
    var jibun = data.jibunAddress || data.autoJibunAddress || '';
    if (data.userSelectedType === 'J' || !data.roadAddress) {
      return jibun || data.roadAddress || data.address || '';
    }
    var extra = '';
    if (data.bname && /[동로가]$/.test(data.bname)) {
      extra = data.bname;
    }
    if (data.buildingName && data.apartment === 'Y') {
      extra = extra ? extra + ', ' + data.buildingName : data.buildingName;
    }
    return extra ? data.roadAddress + ' (' + extra + ')' : data.roadAddress;
  }

  function createAddressLayer() {
    var layer = document.createElement('div');
    layer.className = 'address-layer';
    layer.hidden = true;
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'address-layer-title');
    layer.innerHTML =
      '<div class="address-layer-panel">' +
      '<div class="address-layer-head">' +
      '<strong id="address-layer-title">주소 검색</strong>' +
      '<button type="button" class="address-layer-close" aria-label="주소 검색 닫기">닫기</button>' +
      '</div>' +
      '<div class="address-layer-body"></div>' +
      '</div>';
    document.body.appendChild(layer);
    return layer;
  }

  function setupAddressSearch(field) {
    var input = field.querySelector('input[name="address"]');
    var detail = field.querySelector('input[name="addressDetail"]');
    var button = field.querySelector('[data-address-search]');
    var note = field.querySelector('.address-note');
    var parts = {};
    Array.prototype.forEach.call(field.querySelectorAll('[data-address-part]'), function (part) {
      parts[part.name] = part;
    });
    var layer = null;

    function setParts(values) {
      Object.keys(parts).forEach(function (name) {
        parts[name].value = values[name] || '';
      });
    }

    function close() {
      if (!layer || layer.hidden) {
        return;
      }
      layer.hidden = true;
      layer.querySelector('.address-layer-body').textContent = '';
      document.documentElement.classList.remove('is-layer-open');
      document.removeEventListener('keydown', onKeydown);
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        close();
        button.focus();
      }
    }

    function complete(data) {
      input.value = baseAddress(data);
      setParts({
        postalCode: data.zonecode,
        roadAddress: data.roadAddress,
        jibunAddress: data.jibunAddress || data.autoJibunAddress,
        sido: data.sido,
        sigungu: data.sigungu,
      });
      note.hidden = true;
      close();
      detail.focus();
    }

    function open() {
      layer = layer || createAddressLayer();
      var body = layer.querySelector('.address-layer-body');
      layer.querySelector('.address-layer-close').onclick = function () {
        close();
        button.focus();
      };
      layer.hidden = false;
      document.documentElement.classList.add('is-layer-open');
      document.addEventListener('keydown', onKeydown);
      new window.daum.Postcode({
        oncomplete: complete,
        width: '100%',
        height: '100%',
      }).embed(body);
      layer.querySelector('.address-layer-close').focus();
    }

    button.addEventListener('click', function () {
      button.disabled = true;
      loadPostcode()
        .then(open)
        .catch(function () {
          note.textContent = '주소 검색을 불러오지 못했어요. 주소를 직접 입력해주세요.';
          note.hidden = false;
          input.focus();
        })
        .then(function () {
          button.disabled = false;
        });
    });

    // 검색으로 고른 주소를 손으로 고치면 숨은 값과 맞지 않으므로 비운다
    input.addEventListener('input', function () {
      setParts({});
    });
  }

  function setupForm(form) {
    var button = document.getElementById('submit-button');
    var status = form.querySelector('.submit-status');
    var originalLabel = button ? button.innerHTML : '';
    Array.prototype.forEach.call(form.querySelectorAll('[data-address-field]'), setupAddressSearch);
    var uploads = Array.prototype.map.call(
      form.querySelectorAll('input[type="file"][data-kind]'),
      setupUpload
    );

    form.addEventListener('submit', function (event) {
      var firstError = null;
      uploads.forEach(function (upload) {
        var errorEl = upload.check();
        firstError = firstError || errorEl;
      });
      if (firstError) {
        event.preventDefault();
        firstError.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (button) {
        button.disabled = true;
        button.textContent = '업로드 중…';
      }
      if (status) {
        status.hidden = false;
      }
    });

    // 뒤로 가기로 돌아왔을 때 잠긴 버튼을 되돌린다
    window.addEventListener('pageshow', function (event) {
      if (event.persisted && button) {
        button.disabled = false;
        button.innerHTML = originalLabel;
        if (status) {
          status.hidden = true;
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var errorBox = document.getElementById('form-error');
    if (errorBox) {
      errorBox.scrollIntoView({ block: 'center' });
      errorBox.focus({ preventScroll: true });
    }
    var form = document.getElementById('report-form');
    if (form) {
      setupForm(form);
    }
  });
})();
