const revealItems = document.querySelectorAll(".reveal");
const modeChips = Array.from(document.querySelectorAll(".mode-chip"));
const modePanels = Array.from(document.querySelectorAll(".product-panel"));
const waitlistForm = document.getElementById("waitlistForm");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const whatsappInput = document.getElementById("whatsappInput");
const formStatus = document.getElementById("formStatus");
const waitlistProofText = document.getElementById("waitlistProofText");
const liveCount = document.getElementById("liveCount");
const toast = document.getElementById("toast");
const API_BASE = window.location.pathname.includes("/public/") ? "../api" : "/api";

let toastTimer;
let currentModeIndex = 0;
let autoRotateTimer;

function showToast(message) {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function setStatus(message, type = "") {
  if (!formStatus) {
    return;
  }

  formStatus.textContent = message;
  formStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function updateCount(count) {
  if (typeof count !== "number" || Number.isNaN(count)) {
    return;
  }

  const prettyCount = `${count}+`;

  if (liveCount) {
    liveCount.textContent = prettyCount;
  }

  if (waitlistProofText) {
    waitlistProofText.textContent = `${prettyCount} early students have already joined.`;
  }
}

function activateMode(target) {
  modeChips.forEach((chip, index) => {
    const isActive = chip.dataset.modeTarget === target;
    chip.classList.toggle("is-active", isActive);
    if (isActive) {
      currentModeIndex = index;
    }
  });

  modePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.modePanel === target);
  });
}

function restartAutoRotate() {
  clearInterval(autoRotateTimer);

  if (modeChips.length < 2) {
    return;
  }

  autoRotateTimer = setInterval(() => {
    currentModeIndex = (currentModeIndex + 1) % modeChips.length;
    activateMode(modeChips[currentModeIndex].dataset.modeTarget);
  }, 4200);
}

async function loadWaitlistCount() {
  try {
    const response = await fetch(`${API_BASE}/waitlist/count`);
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    updateCount(data.count);
  } catch (error) {
    // Keep the page usable even if the backend is temporarily unavailable.
  }
}

function validateContactChoice(preferredContact, email, whatsapp) {
  if (!email && !whatsapp) {
    return "Add at least an email address or WhatsApp number.";
  }

  if (email && !emailInput.checkValidity()) {
    return "That email address does not look valid yet.";
  }

  if ((preferredContact === "email" || preferredContact === "both") && !email) {
    return "Please add an email address for the selected contact method.";
  }

  if ((preferredContact === "whatsapp" || preferredContact === "both") && !whatsapp) {
    return "Please add a WhatsApp number for the selected contact method.";
  }

  return "";
}

if (revealItems.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealItems.forEach((item) => observer.observe(item));
}

modeChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    activateMode(chip.dataset.modeTarget);
    restartAutoRotate();
  });
});

restartAutoRotate();

if (waitlistForm) {
  waitlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const whatsapp = whatsappInput.value.trim();
    const preferredContact =
      waitlistForm.querySelector('input[name="preferredContact"]:checked')?.value || "email";

    if (!name) {
      nameInput.focus();
      setStatus("Please enter your full name first.", "error");
      return;
    }

    const validationMessage = validateContactChoice(preferredContact, email, whatsapp);
    if (validationMessage) {
      if (!email && !whatsapp) {
        emailInput.focus();
      } else if (!email && preferredContact !== "whatsapp") {
        emailInput.focus();
      } else if (!whatsapp && preferredContact !== "email") {
        whatsappInput.focus();
      }

      setStatus(validationMessage, "error");
      return;
    }

    setStatus("Saving your spot...", "");

    try {
      const response = await fetch(`${API_BASE}/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          email,
          whatsapp,
          preferredContact
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.error || "Something went wrong while saving your details.", "error");
        if (typeof data.count === "number") {
          updateCount(data.count);
        }
        return;
      }

      waitlistForm.reset();
      document.getElementById("contactEmail").checked = true;
      setStatus("Saved. You are officially on the Prayas waitlist.", "success");
      showToast("Saved. You are officially on the Prayas waitlist.");
      updateCount(data.count);
    } catch (error) {
      setStatus("The backend is not reachable right now. Start the server and try again.", "error");
    }
  });
}

loadWaitlistCount();
