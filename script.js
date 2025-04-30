import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, set } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// Khởi tạo Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBmu-oRKGEgByq7fre6OYGv0mGkc-k4sB8",
  authDomain: "task-board-to-do.firebaseapp.com",
  databaseURL: "https://task-board-to-do-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "task-board-to-do",
  storageBucket: "task-board-to-do.firebasestorage.app",
  messagingSenderId: "1067889299111",
  appId: "1:1067889299111:web:e7631dda6befc0e7185582"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const tasksRef = ref(db, "tasks");

let tasks = [];
const STATUS_LIST = [
  "open", "in progress", "resolved", "closed",
  "cancelled", "re-open", "waiting for customer", "assigned"
];

// Realtime listener
onValue(tasksRef, snapshot => {
  const data = snapshot.val() || {};
  tasks = Object.entries(data).map(([key, val]) => ({ key, ...val }));
  renderBoard(tasks);
  updateReportCount(tasks);
});

// ========== Thêm mới ==========
const addBtn = document.getElementById("addBtn");
const addPopup = document.getElementById("addPopup");
const addForm = document.getElementById("addForm");

addBtn.onclick = () => toggleAddPopup(true);
function toggleAddPopup(show) {
  addPopup.classList.toggle("show", show);
}

addForm.addEventListener("submit", e => {
  e.preventDefault();
  const now = new Date();
  const mmss = String(now.getMinutes()).padStart(2, "0") + String(now.getSeconds()).padStart(2, "0");
  const issueKey = `HDB_IBMB_2024_PM-${mmss}`;
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = formatDateTime(now);

  const task = {
    "Issue Key": issueKey,
    "Status": "open",
    "Create Date": dateStr,
    "Updated": timeStr,
    "Assignee": document.getElementById("newAssignee").value.trim(),
    "Reporter": document.getElementById("newReporter").value.trim(),
    "Summary": document.getElementById("newSummary").value.trim(),
    "Priority": document.getElementById("newPriority").value,
    "Module": document.getElementById("newModule").value.trim() || "[No Module]",
    "Description": document.getElementById("newDescription").value.trim()
  };

  push(tasksRef, task);
  addForm.reset();
  toggleAddPopup(false);
});

// ========== Upload Excel ==========
document.getElementById("uploadBtn").onclick = () => document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange = e => {
  const file = e.target.files[0];
  if (!file) return alert("Vui lòng chọn file Excel!");
  document.getElementById("filename").value = file.name;

  const reader = new FileReader();
  reader.onload = () => {
    const data = new Uint8Array(reader.result);
    const wb = XLSX.read(data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const hi = rows.findIndex(r => r.includes("Issue Key"));
    if (hi < 0) return alert("Không tìm thấy cột 'Issue Key'");
    const headers = rows[hi].map(h => h.toString().trim());
    const json = XLSX.utils.sheet_to_json(sheet, {
      header: headers,
      range: hi + 1,
      defval: "",
      raw: false
    });

    // Đẩy lên Firebase
    json.forEach(r => {
      r["Create Date"] = formatDateTime(r["Create Date"]).split(" ")[0];
      r["Updated"] = formatDateTime(r["Updated"]);
      let st = (r["Status"] || "open").toString().trim().toLowerCase();
      if (st === "assignee") st = "assigned";
      r["Status"] = st;
      push(tasksRef, r);
    });
  };
  reader.readAsArrayBuffer(file);
};

// ========== Helper ==========
function formatDateTime(val) {
  const d = new Date(val);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

// ========== Render ==========
function renderBoard(data) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const modules = Array.from(new Set(data.map(t => t["Module"])));

  modules.forEach(mod => {
    const col = document.createElement("div");
    col.className = "column";
    col.innerHTML = `<h2>${mod}</h2><div class="card-container"></div>`;
    const cont = col.querySelector(".card-container");

    data.filter(t => t["Module"] === mod).forEach(task => {
      const card = document.createElement("div");
      card.className = "card " + task["Status"].replace(/ /g, "-");
      card.innerHTML = `
        <h3>${task["Issue Key"]}</h3>
        <p>${task["Summary"]}</p>
        <p>👤 ${task["Assignee"] || ""}</p>
      `;

      const sel = document.createElement("select");
      sel.className = "status-select";
      STATUS_LIST.forEach(s => {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        if (task["Status"] === s) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("click", e => e.stopPropagation());
      sel.addEventListener("change", () => {
        const updated = formatDateTime(new Date());
        update(ref(db, `tasks/${task.key}`), {
          Status: sel.value,
          Updated: updated
        });
      });

      card.appendChild(sel);
      card.addEventListener("click", () => {
        document.getElementById("descriptionText").textContent = task["Description"] || "Không có mô tả";
        document.getElementById("descriptionPopup").classList.add("show");
      });

      cont.appendChild(card);
    });

    board.appendChild(col);
  });
}

function updateReportCount(list) {
  let html = `Tổng: ${list.length}`;
  const cnt = {};
  list.forEach(t => (cnt[t["Status"]] = (cnt[t["Status"]] || 0) + 1));
  Object.entries(cnt).forEach(([k, v]) => (html += ` | ${k}: ${v}`));
  document.getElementById("reportCount").innerText = html;
}
