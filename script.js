// script.js
// Load as module
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// Global helper for inline add popup toggle
window.toggleAddPopup = show => {
    const popup = document.getElementById('addPopup');
    if (popup)
        popup.classList.toggle('show', show);
};

// --- Firebase config & init ---
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

// --- Global state & constants ---
let tasks = [];
let currentEditKey = null;
const STATUS_LIST = [
    "open", "in progress", "resolved", "closed",
    "cancelled", "re-open", "waiting for customer", "assigned"
];

// --- Read status filter from URL ---
const urlParams = new URLSearchParams(window.location.search);
const statusFilter = urlParams.get('status');

// --- DOM bindings after load ---
document.addEventListener("DOMContentLoaded", () => {
    // Add Task popup
    const addBtn = document.getElementById("addBtn");
    const addPopup = document.getElementById("addPopup");
    const addClose = addPopup && addPopup.querySelector(".popup-close");
    const addForm = document.getElementById("addForm");
    if (addBtn && addPopup)
        addBtn.addEventListener("click", () => addPopup.classList.add("show"));
    if (addClose && addPopup)
        addClose.addEventListener("click", () => addPopup.classList.remove("show"));
    if (addForm)
        addForm.addEventListener("submit", e => {
            e.preventDefault();
            const now = new Date();
            const key = `TBK-${now.getTime()}`;
            const task = {
                "Issue Key": key,
                Status: "open",
                "Create Date": now.toISOString().split('T')[0],
                Updated: formatDateTime(now),
                Assignee: document.getElementById("newAssignee").value.trim(),
                Reporter: document.getElementById("newReporter").value.trim(),
                Summary: document.getElementById("newSummary").value.trim(),
                Priority: document.getElementById("newPriority").value,
                Module: document.getElementById("newModule").value || "[No Module]",
                Description: document.getElementById("newDescription").value.trim()
            };
            push(tasksRef, task);
            addForm.reset();
            addPopup.classList.remove("show");
        });

    // Upload Excel functionality
    const uploadBtn = document.getElementById("uploadBtn");
    const fileInput = document.getElementById("fileInput");
    const filenameInput = document.getElementById("filename");
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener("click", () => fileInput.click());
    }
    if (fileInput) {
        fileInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file)
                return alert("Chọn file Excel!");
            filenameInput.value = file.name;
            const reader = new FileReader();
            reader.onload = () => {
                const data = new Uint8Array(reader.result);
                const wb = XLSX.read(data, {
                    type: 'array'
                });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    defval: ''
                });
                const hi = rows.findIndex(r => r.includes('Issue Key'));
                if (hi < 0)
                    return alert("Không tìm thấy cột 'Issue Key'");
                const headers = rows[hi].map(h => h.toString().trim());
                const json = XLSX.utils.sheet_to_json(sheet, {
                    header: headers,
                    range: hi + 1,
                    defval: '',
                    raw: false
                });
                json.forEach(r => {
                    r['Create Date'] = formatDateTime(new Date(r['Create Date'] || Date.now())).split(' ')[0];
                    r['Updated'] = formatDateTime(new Date(r['Updated'] || Date.now()));
                    let st = (r.Status || 'open').toString().trim().toLowerCase();
                    if (st === 'assignee')
                        st = 'assigned';
                    r.Status = st;
                    push(tasksRef, r);
                });
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // --- Report Popup handlers ---
    const reportBtn = document.getElementById("reportBtn");
    const reportPopup = document.getElementById("reportPopup");
    const reportClose = reportPopup && reportPopup.querySelector(".popup-close");
    const reportDateInp = document.getElementById("reportDate");
    const dayBtn = reportPopup && reportPopup.querySelector(".popup-btn[data-mode='day']");
    const allBtn = reportPopup && reportPopup.querySelector(".popup-btn[data-mode='all']");

    if (reportBtn && reportPopup) {
        reportBtn.addEventListener("click", () => reportPopup.classList.add("show"));
    }
    if (reportClose && reportPopup) {
        reportClose.addEventListener("click", () => reportPopup.classList.remove("show"));
    }
    if (dayBtn) {
        dayBtn.addEventListener("click", () => {
            reportPopup.classList.remove("show");
            window.location.href = `report.html?mode=day`;
        });
    };
    if (allBtn) {
        allBtn.addEventListener("click", () => {
            reportPopup.classList.remove("show");
            // Redirect to report page with mode=all
            window.location.href = `report.html?mode=all`;
        });
    }
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            const confirmed = confirm("Tất cả dữ liệu hiện tại ở database sẽ bị xóa. Bạn có chắc không?");
            if (confirmed)
                clearAllTasks();
        });
    }

    // Edit Task popup
    const editPopup = document.getElementById("editPopup");
    const editClose = editPopup && editPopup.querySelector(".modal-close");
    const editCancelBtn = document.getElementById("editCancelBtn");
    const editForm = document.getElementById("editForm");
    if (editClose && editPopup)
        editClose.addEventListener("click", () => editPopup.classList.remove("show"));
    if (editCancelBtn && editPopup)
        editCancelBtn.addEventListener("click", () => editPopup.classList.remove("show"));
    if (editForm)
        editForm.addEventListener("submit", e => {
            e.preventDefault();
            if (!currentEditKey)
                return;
            update(ref(db, `tasks/${currentEditKey}`), {
                Summary: document.getElementById("editSummary").value.trim(),
                Assignee: document.getElementById("editAssignee").value.trim(),
                Reporter: document.getElementById("editReporter").value.trim(),
                Priority: document.getElementById("editPriority").value,
                Module: document.getElementById("editModule").value,
                Description: document.getElementById("editDescription").value.trim(),
                Updated: formatDateTime(new Date())
            });
            editForm.reset();
            editPopup.classList.remove("show");
        });

    // Description popup close
    const descPopup = document.getElementById("descriptionPopup");
    const descClose = descPopup && descPopup.querySelector(".popup-close");
    if (descClose && descPopup)
        descClose.addEventListener("click", () => descPopup.classList.remove("show"));
});

// --- Real-time listener: sync & initial render ---
onValue(tasksRef, snap => {
    const data = snap.val() || {};
    tasks = Object.entries(data).map(([k, v]) => ({
                key: k,
                ...v
            }));
    updateReportCount(tasks);
    const toRender = statusFilter ? tasks.filter(t => t.Status === statusFilter) : tasks;
    renderBoard(toRender);
});

// --- Helpers ---
function formatDateTime(d) {
    if (!(d instanceof Date))
        d = new Date(d);
    const Y = d.getFullYear(),
    M = String(d.getMonth() + 1).padStart(2, '0'),
    D = String(d.getDate()).padStart(2, '0'),
    h = String(d.getHours()).padStart(2, '0'),
    m = String(d.getMinutes()).padStart(2, '0'),
    s = String(d.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

// --- Render board ---
function renderBoard(data) {
    const board = document.getElementById("board");
    if (!board)
        return;
    board.innerHTML = "";
    const modules = [...new Set(data.map(t => t.Module))];
    modules.forEach(mod => {
        const col = document.createElement("div");
        col.className = "column";
        col.innerHTML = `<h2>${mod}</h2><div class=\"card-container\"></div>`;
        const cont = col.querySelector(".card-container");
        data.filter(t => t.Module === mod).forEach(task => {
            const card = document.createElement("div");
            card.className = `card ${task.Status.replace(/ /g, '-')}`;
            card.innerHTML = `<h3>${task['Issue Key']}</h3><p>${task.Summary}</p><p>👤 ${task.Assignee}</p>`;
            const actions = document.createElement("div");
            actions.className = "card-actions";
            // Status select
            const sel = document.createElement("select");
            sel.className = "status-select";
            STATUS_LIST.forEach(s => {
                const o = document.createElement("option");
                o.value = o.text = s;
                if (task.Status === s)
                    o.selected = true;
                sel.appendChild(o);
            });
            sel.addEventListener("click", e => e.stopPropagation());
            sel.addEventListener("change", () => update(ref(db, `tasks/${task.key}`), {
                    Status: sel.value,
                    Updated: formatDateTime(new Date())
                }));
            actions.appendChild(sel);
            // Edit
            const editBtn = document.createElement("button");
            editBtn.className = "btn-icon edit-btn";
            editBtn.innerText = "✏️";
            editBtn.addEventListener("click", e => {
                e.stopPropagation();
                openEditPopup(task);
            });
            actions.appendChild(editBtn);
            // Delete
            const delBtn = document.createElement("button");
            delBtn.className = "btn-icon delete-btn";
            delBtn.innerText = "🗑️";
            delBtn.addEventListener("click", e => {
                e.stopPropagation();
                if (confirm(`Xác nhận xóa task ${task['Issue Key']}?`))
                    remove(ref(db, `tasks/${task.key}`));
            });
            actions.appendChild(delBtn);
            card.appendChild(actions);
            card.addEventListener("click", e => {
                if (e.target.tagName.toLowerCase() === 'select')
                    return;
                document.getElementById("descriptionText").innerText = task.Description || "(Không có mô tả)";
                document.getElementById("descriptionPopup").classList.add("show");
            });
            cont.appendChild(card);
        });
        board.appendChild(col);
    });
}

// --- ReportCount navigation ---
function updateReportCount(list) {
    const container = document.getElementById("reportCount");
    if (!container)
        return;
    container.innerHTML = "";
    // Total link
    const totalLink = document.createElement("a");
    totalLink.href = window.location.pathname;
    totalLink.textContent = `Tổng bugs: ${list.length}`;
    if (!statusFilter)
        totalLink.classList.add("active");
    container.append(totalLink, document.createTextNode(" | "));
    // Status links
    const counts = list.reduce((a, t) => {
        a[t.Status] = (a[t.Status] || 0) + 1;
        return a;
    }, {});
    Object.entries(counts).forEach(([status, count], i, arr) => {
        const a = document.createElement("a");
        a.href = `${window.location.pathname}?status=${encodeURIComponent(status)}`;
        a.textContent = `${status.toUpperCase()} (${count})`;
        if (status === statusFilter)
            a.classList.add("active");
        container.append(a);
        if (i < arr.length - 1)
            container.append(document.createTextNode(" | "));
    });
}

function openEditPopup(task) {
    currentEditKey = task.key;

    // Đồng bộ module options
    const newModuleOptions = document.getElementById("newModule").innerHTML;
    document.getElementById("editModule").innerHTML = newModuleOptions;

    document.getElementById("editIssueKey").value = task["Issue Key"] || "";
    document.getElementById("editSummary").value = task.Summary || "";
    document.getElementById("editAssignee").value = task.Assignee || "";
    document.getElementById("editReporter").value = task.Reporter || "";
    document.getElementById("editPriority").value = task.Priority || "";
    document.getElementById("editModule").value = task.Module || "";
    document.getElementById("editDescription").value = task.Description || "";

    document.getElementById("editPopup").classList.add("show");
}

document.getElementById("exportYes").addEventListener("click", () => {
    const dataToExport = tasks.map(t => {
        const { key, ...rest } = t;
        return rest;
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");

    const filename = `bug-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);

    document.getElementById("exportPopup").classList.remove("show");
});
function clearAllTasks() {
    if (!confirm("Xác nhận xóa tất cả dữ liệu?"))
        return;
    remove(tasksRef)
    .then(() => alert("Đã xóa toàn bộ task."))
    .catch(err => alert("Lỗi khi xóa: " + err.message));
}
// ======= Bảo vệ chọn file bằng đăng nhập =======
document.getElementById("triggerFileBtn").addEventListener("click", () => {
  document.getElementById("loginPopup").style.display = "block";
});

document.getElementById("loginConfirmBtn").addEventListener("click", () => {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (username === "DiHDbiz" && password === "HDBank@1") {
    document.getElementById("loginPopup").style.display = "none";
    document.getElementById("secureFileInput").click();
  } else {
    alert("Sai tên đăng nhập hoặc mật khẩu!");
  }
});
