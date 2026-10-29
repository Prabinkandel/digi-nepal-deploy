/* pages.js — shared logic for the static sub-pages (about, contact, privacy, terms, refund).
   Kept in an external file so the server's strict Content-Security-Policy
   (script-src 'self') allows it; inline scripts on those pages are blocked. */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  /* ── Footer year (static fallback already in markup; refresh to current) ── */
  var yearEl = $('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── Contact page: load contact email + WhatsApp from site settings ── */
  if ($('contact-email-link')) {
    fetch('/api/settings')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s) return;
        if (s.contact_email) {
          var el = $('contact-email-link');
          el.textContent = s.contact_email;
          el.setAttribute('href', 'mailto:' + s.contact_email);
        }
        if (s.whatsapp_number) {
          var wa = document.querySelector('a[href*="wa.me"]');
          if (wa) wa.setAttribute('href', 'https://wa.me/' + s.whatsapp_number);
        }
      })
      .catch(function () { /* offline / API down — static defaults remain */ });
  }

  /* ── Contact form submit ── */
  var form = $('contact-form');
  if (!form) return;

  var wrapper = form.closest('.contact-form-wrapper');
  var successBox = $('contact-success');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('.contact-submit');
    var oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span><span>Sending...</span>';

    var data = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      subject: form.elements.subject.value,
      message: form.elements.message.value.trim()
    };

    fetch('/api/auth/csrf', { credentials: 'same-origin' })
      .then(function (csrfRes) {
        var token = '';
        if (csrfRes.ok) return csrfRes.json().then(function (d) { token = d.csrf || ''; });
        return token;
      })
      .catch(function () { return ''; })
      .then(function (csrf) {
        return fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-csrf-token': csrf
          },
          credentials: 'same-origin',
          body: JSON.stringify(data)
        });
      })
      .then(function (res) {
        return res.json().then(function (result) {
          if (!res.ok) {
            var msg = result && result.error ? result.error : 'Something went wrong. Please try again.';
            throw new Error(msg);
          }
          // Success: hide form + its heading, reveal the success panel
          var header = wrapper ? wrapper.querySelector('h2') : null;
          var intro = wrapper ? wrapper.querySelector(':scope > p') : null;
          if (header) header.hidden = true;
          if (intro) intro.hidden = true;
          form.hidden = true;
          if (successBox) successBox.hidden = false;
        });
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
        var errorDiv = document.createElement('p');
        errorDiv.className = 'contact-error';
        errorDiv.setAttribute('role', 'alert');
        errorDiv.textContent = err && err.message ? err.message : 'Could not send your message. Please try again or reach us on WhatsApp.';
        errorDiv.style.cssText = 'color:#f87171;font-size:.85rem;margin-top:.5rem;padding:.65rem .8rem;border:1px solid rgba(248,113,113,.2);border-radius:.5rem;background:rgba(248,113,113,.08);';
        var existing = form.querySelector('.contact-error');
        if (existing) existing.remove();
        btn.insertAdjacentElement('afterend', errorDiv);
      });
  });
})();
