import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

let weekPages = [];

let pdfDoc = null;
let currentWeekIndex = 0;

async function loadCurrentMealPlan() {
  const viewer = document.getElementById("meal-plan-viewer");

  const { data, error } = await supabaseClient
    .from("meal_plans")
    .select("*")
    .eq("is_current", true)
    .limit(1)
    .single();

  if (error) {
    console.error("Meal plan error:", error);

    viewer.innerHTML =
      "<p>Der Essensplan konnte nicht geladen werden.</p>";

    return;
  }

  const { data: publicUrlData } = supabaseClient.storage
    .from("meal-plans")
    .getPublicUrl(data.file_path);

  const pdfUrl = publicUrlData.publicUrl;

pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;

weekPages = await extractWeekPages();

currentWeekIndex = findCurrentWeekIndex();

renderViewer(viewer, pdfUrl);

await renderWeek();
}

async function extractWeekPages() {
  const weeks = [];

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const text = textContent.items
      .map((item) => item.str)
      .join(" ");

    const weekMatch = text.match(/KW\s*(\d{1,2})/i);

    const dateMatch = text.match(
      /Gültig vom\s*(\d{2}\.\d{2}\.\d{4})\s*bis\s*(\d{2}\.\d{2}\.\d{4})/i
    );

    if (!weekMatch || !dateMatch) {
      continue;
    }

    const weekNumber = weekMatch[1];
    const startDate = dateMatch[1];
    const endDate = dateMatch[2];

    weeks.push({
      page: pageNumber,
      allergenPage:
        pageNumber < pdfDoc.numPages
          ? pageNumber + 1
          : null,
      label: `KW ${weekNumber}`,
      dates: `${startDate}–${endDate}`,
      startDate,
      endDate
    });
  }

  return weeks;
}

function findCurrentWeekIndex() {
  const today = new Date();

  const foundIndex = weekPages.findIndex((week) => {
    const [startDay, startMonth, startYear] =
      week.startDate.split(".").map(Number);

    const [endDay, endMonth, endYear] =
      week.endDate.split(".").map(Number);

    const startDate = new Date(
      startYear,
      startMonth - 1,
      startDay,
      0,
      0,
      0
    );

    const endDate = new Date(
      endYear,
      endMonth - 1,
      endDay,
      23,
      59,
      59
    );

    return today >= startDate && today <= endDate;
  });

  return foundIndex >= 0 ? foundIndex : 0;
}

function renderViewer(viewer, pdfUrl) {
  viewer.innerHTML = `
    <div class="meal-plan-header">

      <div>
        <span class="eyebrow">
          Aktueller Essensplan
        </span>

        <h2 id="meal-plan-title"></h2>

        <p id="meal-plan-dates"></p>
      </div>

      <a
        href="${pdfUrl}"
        target="_blank"
        rel="noopener"
        class="text-link"
      >
        Gesamten PDF öffnen →
      </a>

    </div>

    <div class="meal-plan-canvas-wrap">
      <canvas id="meal-plan-canvas"></canvas>
    </div>

    <div class="meal-plan-allergens">

      <button
        id="toggle-allergens"
        type="button"
      >
        Allergene & Zusatzstoffe anzeigen
      </button>

      <div
        id="allergen-viewer"
        hidden
      >
        <canvas id="allergen-canvas"></canvas>
      </div>

    </div>

    <div class="meal-plan-controls">

      <button
        id="prev-week"
        type="button"
      >
        ← Vorherige Woche
      </button>

      <div class="meal-plan-week-buttons">

        ${weekPages
          .map(
            (week, index) => `
              <button
                type="button"
                class="week-button"
                data-week="${index}"
              >
                ${week.label}
              </button>
            `
          )
          .join("")}

      </div>

      <button
        id="next-week"
        type="button"
      >
        Nächste Woche →
      </button>

    </div>
  `;

  document
    .getElementById("prev-week")
    .addEventListener("click", () => {
      changeWeek(-1);
    });

  document
    .getElementById("next-week")
    .addEventListener("click", () => {
      changeWeek(1);
    });

  document
    .querySelectorAll(".week-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        currentWeekIndex = Number(button.dataset.week);

        renderWeek();
      });
    });

  document
    .getElementById("toggle-allergens")
    .addEventListener("click", toggleAllergens);
}

function changeWeek(direction) {
  currentWeekIndex += direction;

  if (currentWeekIndex < 0) {
    currentWeekIndex = weekPages.length - 1;
  }

  if (currentWeekIndex >= weekPages.length) {
    currentWeekIndex = 0;
  }

  renderWeek();
}

async function renderWeek() {
  const week = weekPages[currentWeekIndex];

  document.getElementById("meal-plan-title").textContent =
    week.label;

  document.getElementById("meal-plan-dates").textContent =
    week.dates;

  document
    .querySelectorAll(".week-button")
    .forEach((button, index) => {
      button.classList.toggle(
        "active",
        index === currentWeekIndex
      );
    });

  const allergenViewer =
    document.getElementById("allergen-viewer");

  const allergenButton =
    document.getElementById("toggle-allergens");

  if (allergenViewer) {
    allergenViewer.setAttribute("hidden", "");
  }

  if (allergenButton) {
    allergenButton.textContent =
      "Allergene & Zusatzstoffe anzeigen";
  }

  const page = await pdfDoc.getPage(week.page);

  const canvas =
    document.getElementById("meal-plan-canvas");

  const context =
    canvas.getContext("2d");

  const baseViewport =
    page.getViewport({ scale: 1 });

  const canvasWrapper =
    document.querySelector(".meal-plan-canvas-wrap");

  const availableWidth =
    canvasWrapper.clientWidth;

  const scale =
    availableWidth / baseViewport.width;

  const viewport =
    page.getViewport({ scale });

  canvas.width =
    Math.floor(viewport.width);

  canvas.height =
    Math.floor(viewport.height);

  await page.render({
    canvasContext: context,
    viewport
  }).promise;
}

async function toggleAllergens() {
  const allergenViewer =
    document.getElementById("allergen-viewer");

  const button =
    document.getElementById("toggle-allergens");

  const isHidden =
    allergenViewer.hasAttribute("hidden");

  if (isHidden) {
    allergenViewer.removeAttribute("hidden");

    button.textContent =
      "Allergene & Zusatzstoffe ausblenden";

    await renderAllergenPage();
  } else {
    allergenViewer.setAttribute("hidden", "");

    button.textContent =
      "Allergene & Zusatzstoffe anzeigen";
  }
}

async function renderAllergenPage() {
  const week =
    weekPages[currentWeekIndex];

  const page =
    await pdfDoc.getPage(week.allergenPage);

  const canvas =
    document.getElementById("allergen-canvas");

  const context =
    canvas.getContext("2d");

  const allergenViewer =
    document.getElementById("allergen-viewer");

  const baseViewport =
    page.getViewport({ scale: 1 });

  const availableWidth =
    allergenViewer.clientWidth;

  const scale =
    availableWidth / baseViewport.width;

  const viewport =
    page.getViewport({ scale });

  canvas.width =
    Math.floor(viewport.width);

  canvas.height =
    Math.floor(viewport.height);

  canvas.style.width = "100%";
  canvas.style.height = "auto";

  await page.render({
    canvasContext: context,
    viewport
  }).promise;
}

loadCurrentMealPlan();