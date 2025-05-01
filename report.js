import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, get, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmu-oRKGEgByq7fre6OYGv0mGkc-k4sB8",
  authDomain: "task-board-to-do.firebaseapp.com",
  databaseURL: "https://task-board-to-do-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "task-board-to-do",
  storageBucket: "task-board-to-do.appspot.com",
  messagingSenderId: "1067889299111",
  appId: "1:1067889299111:web:e7631dda6befc0e7185582"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const tasksRef = ref(db, "tasks");

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "all";

const dateInput = document.getElementById("reportDate");
const generateBtn = document.getElementById("generateBtn");
const backBtn = document.getElementById("backBtn");
const chartCanvas = document.getElementById("statusChart");
const summaryContent = document.getElementById("summaryContent");

let statusChart = null;

flatpickr("#reportDate", { dateFormat: "Y-m-d" });

statusChart = new Chart(chartCanvas.getContext("2d"), {
  type: "bar",
  data: { labels: [], datasets: [] },
  options: {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: "Chưa có dữ liệu - vui lòng chọn ngày"
      }
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true }
    }
  }
});

backBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});
generateBtn.addEventListener("click", () => generateChart("day"));

if (mode === "all") {
  dateInput.classList.add("hidden");
  generateBtn.classList.add("hidden");
  generateChart("all");
} else {
  dateInput.classList.remove("hidden");
  generateBtn.classList.remove("hidden");
}

async function generateChart(mode) {
  const snap = await get(tasksRef);
  const data = snap.val() || {};
  const tasks = Object.values(data);

  if (mode === "all") {
    const summary = {};

    tasks.forEach(t => {
      const d = new Date(t.Updated);
      const day = d.toISOString().slice(0, 10);
      const st = t.Status || "(no status)";
      let pr = t.Priority;
      if (!pr || pr.trim() === "") pr = "other";

      if (!summary[day]) summary[day] = {};
      if (!summary[day][st]) summary[day][st] = {};
      summary[day][st][pr] = (summary[day][st][pr] || 0) + 1;
    });

    const allDays = Object.keys(summary).sort();
    const allStatuses = Array.from(new Set(Object.values(summary).flatMap(day => Object.keys(day))));
    const allPriorities = Array.from(new Set(Object.values(summary).flatMap(day =>
      Object.values(day).flatMap(pmap => Object.keys(pmap))
    )));

    const datasets = [];

    allStatuses.forEach(status => {
      allPriorities.forEach(priority => {
        datasets.push({
          label: `${status} - ${priority}`,
          stack: status,
          data: allDays.map(day =>
            summary[day]?.[status]?.[priority] || 0
          )
        });
      });
    });

    if (statusChart) statusChart.destroy();
    statusChart = new Chart(chartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: allDays,
        datasets
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: `Report toàn bộ - ${tasks.length} bugs`
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const [status, priority] = context.dataset.label.split(" - ");
                const date = context.label;
                const count = context.formattedValue;
                return `Ngày: ${date} | Status: ${status} | Priority: ${priority} | Bugs: ${count}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });

    summaryContent.innerHTML = "";
    return;
  }

  const selectedDate = dateInput.value;
  if (!selectedDate) return alert("Vui lòng chọn ngày!");

  const filtered = tasks.filter(t => {
    const d = new Date(t.Updated);
    const iso = d.toISOString().slice(0, 10);
    return iso === selectedDate;
  });

  if (filtered.length === 0) {
    alert("Không có bug nào trong ngày được chọn.");
    if (statusChart) statusChart.destroy();
    summaryContent.innerHTML = "";
    return;
  }

  const summary = {};
  filtered.forEach(t => {
    const st = t.Status || "(no status)";
    let pr = t.Priority;
    if (!pr || pr.trim() === "") pr = "other";

    summary[st] = summary[st] || {};
    summary[st][pr] = (summary[st][pr] || 0) + 1;
  });

  const statuses = Object.keys(summary);
  const priorities = Array.from(new Set(statuses.flatMap(st => Object.keys(summary[st]))));

  const datasets = priorities.map(pr => ({
    label: pr,
    data: statuses.map(st => summary[st][pr] || 0)
  }));

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(chartCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: statuses,
      datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Report ngày ${dateInput.value} - ${filtered.length} bugs`
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const priority = context.dataset.label;
              const status = context.label;
              const count = context.formattedValue;
              return `Priority: ${priority} | Status: ${status} | Bugs: ${count}`;
            }
          }
        }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });

  const summaryHTML = Object.entries(summary).map(([status, priMap]) => {
    const lines = Object.entries(priMap)
      .map(([pr, count]) => `- ${pr}: ${count}`)
      .join("<br>");
    return `<strong>${status}</strong><br>${lines}`;
  }).join("<br><br>");

  summaryContent.innerHTML = summaryHTML;
}
