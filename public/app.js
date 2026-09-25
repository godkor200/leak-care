// 접수 폼 공용 동작: 첨부 파일 요약/미리보기, 제출 전 용량 확인, 중복 제출 방지
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

  function setupForm(form) {
    var button = document.getElementById('submit-button');
    var status = form.querySelector('.submit-status');
    var originalLabel = button ? button.innerHTML : '';
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
