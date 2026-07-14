/*
 * Financial Feminine Freedom Self-Assessment
 *
 * A 3-question diagnostic that sorts a visitor into one of three segments,
 * captures the lead through Netlify Forms (tagged with the segment), and
 * routes them to the matching funnel.
 *
 *   Builder     → founder / sales team     → collaboration inquiry
 *   Catalyst    → career / remote income   → designfeminine.com
 *   Relocation  → real estate / relocation → newyorkexitplan.com
 */
(function () {
  var ROUTES = {
    Builder: {
      url: "/contact",
      title: "Your path: The Leverage Path",
      text: "You are ready to build a sales engine that no longer depends on your calendar. I’m taking you to the collaboration page so we can start with the right people, positioning, and system."
    },
    Catalyst: {
      url: "https://designfeminine.com",
      title: "Your path: The Catalyst Path",
      text: "You're ready to build remote income on your own terms. I'm sending you to Design Feminine, where you can apply to the RTR Whitelabel client-success and sales team."
    },
    Relocation: {
      url: "https://newyorkexitplan.com",
      title: "Your path: The Abundance Path",
      text: "You're thinking about a smarter base for your life and investments. I'm sending you to the New York Exit Plan to start your tax-savings estimate and a coastal real estate consultation."
    }
  };

  var SUMMARY = {
    Builder: "Your answers point to a leverage path — a trusted sales team and a business that can grow without your constant presence.",
    Catalyst: "Your answers point to a career path — flexible, remote income you control.",
    Relocation: "Your answers point to a relocation path — a tax-smart move and the right property."
  };

  var TOTAL_QUESTIONS = 3; // steps 0,1,2 are questions; 3 is capture; 4 is result
  var CAPTURE_STEP = 3;
  var RESULT_STEP = 4;

  var form = document.getElementById("assessment-form");
  if (!form) return;

  var steps = Array.prototype.slice.call(form.querySelectorAll(".assess-step"));
  var bar = document.getElementById("assess-progress-bar");
  var backBtn = document.getElementById("assess-back");
  var submitBtn = document.getElementById("assess-submit");
  var segmentInput = document.getElementById("assess-segment");
  var summaryEl = document.getElementById("assess-summary");

  var current = 0;
  var scores = { Builder: 0, Catalyst: 0, Relocation: 0 };

  function showStep(index) {
    current = index;
    steps.forEach(function (s) {
      s.classList.toggle("is-active", Number(s.dataset.step) === index);
    });
    // progress reflects questions answered; capture/result show full bar
    var pct = index >= TOTAL_QUESTIONS ? 100 : (index / TOTAL_QUESTIONS) * 100;
    if (bar) bar.style.width = pct + "%";

    backBtn.hidden = index === 0 || index >= RESULT_STEP;
    submitBtn.hidden = index !== CAPTURE_STEP;

    // Focus the first interactive element for keyboard/screen-reader users.
    var focusTarget = steps[index].querySelector("input, .assess-option");
    if (focusTarget && index !== RESULT_STEP) {
      try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
    }
  }

  function topSegment() {
    var best = "Builder";
    var bestScore = -1;
    ["Builder", "Catalyst", "Relocation"].forEach(function (seg) {
      if (scores[seg] > bestScore) {
        bestScore = scores[seg];
        best = seg;
      }
    });
    return best;
  }

  // Answer selection
  form.querySelectorAll(".assess-option").forEach(function (opt) {
    opt.addEventListener("click", function () {
      var q = opt.dataset.q;
      var seg = opt.dataset.segment;

      // Reset any prior choice for this question, then mark selected.
      form.querySelectorAll('.assess-option[data-q="' + q + '"]').forEach(function (o) {
        o.classList.remove("is-selected");
        o.setAttribute("aria-checked", "false");
      });
      opt.classList.add("is-selected");
      opt.setAttribute("aria-checked", "true");

      scores[seg] += 1;

      // Record the human-readable answer on a hidden field so it reaches the CRM.
      ensureHidden(q, opt.dataset.value);

      // Advance after a short beat so the selection is visible.
      window.setTimeout(function () {
        if (current < CAPTURE_STEP) {
          if (current === TOTAL_QUESTIONS - 1) prepareCapture();
          showStep(current + 1);
        }
      }, 220);
    });
  });

  function ensureHidden(name, value) {
    var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      form.appendChild(field);
    }
    field.value = value;
  }

  function prepareCapture() {
    var seg = topSegment();
    segmentInput.value = seg;
    if (summaryEl) summaryEl.textContent = SUMMARY[seg];
  }

  backBtn.addEventListener("click", function () {
    if (current > 0 && current <= CAPTURE_STEP) showStep(current - 1);
  });

  // Submit → capture lead via Netlify Forms (AJAX), then route to the funnel.
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var name = (document.getElementById("assess-name").value || "").trim();
    var email = (document.getElementById("assess-email").value || "").trim();
    if (!name || !email) return;

    var seg = topSegment();
    segmentInput.value = seg;

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    var body = new URLSearchParams(new FormData(form)).toString();

    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    })
      .then(function () { route(seg); })
      .catch(function () { route(seg); }); // never trap the visitor on a network hiccup
  });

  function route(seg) {
    var dest = ROUTES[seg] || ROUTES.Catalyst;
    var titleEl = document.getElementById("assess-result-title");
    var textEl = document.getElementById("assess-result-text");
    var linkEl = document.getElementById("assess-result-link");

    if (titleEl) titleEl.textContent = dest.title;
    if (textEl) textEl.textContent = dest.text;
    if (linkEl) {
      linkEl.href = dest.url;
      linkEl.style.display = "inline-block";
    }

    showStep(RESULT_STEP);
    window.setTimeout(function () { window.location.href = dest.url; }, 1600);
  }
})();
