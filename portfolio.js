"use strict";

const clinics = ["North", "Central", "West"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const statuses = ["Attended", "Did not attend", "Cancelled"];
const number = new Intl.NumberFormat("en-IE");
const percent = new Intl.NumberFormat("en-IE", {
  style: "percent",
  maximumFractionDigits: 1,
});
const byId = (id) => document.getElementById(id);

function generateRecords() {
  const records = [];
  let randomState = 41023;
  const random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  months.forEach((_, month) => {
    clinics.forEach((clinic, clinicIndex) => {
      const slots = [76, 88, 95, 84, 105, 113][month] + clinicIndex * 9;
      for (let slot = 0; slot < slots; slot += 1) {
        const outcome = random();
        const missedThreshold = [0.14, 0.24, 0.19][clinicIndex] + month * 0.004;
        let status = statuses[0];
        if (outcome < 0.08) {
          status = statuses[2];
        } else if (outcome < missedThreshold) {
          status = statuses[1];
        }

        const index = records.length + 1;
        const id = "APT-" + String(index).padStart(5, "0");
        const day = String(1 + Math.floor(random() * 28)).padStart(2, "0");
        let date = "2025-" + String(month + 1).padStart(2, "0") + "-" + day;
        if (index % 67 === 0) date = "";
        if (index % 71 === 0) status = "Unknown";
        if (index % 137 === 0) status = "";
        records.push({ id, clinic, date, status, month });
      }
    });
  });

  const duplicates = records.filter((_, index) => (index + 1) % 103 === 0);
  return records.concat(duplicates.map((record) => ({ ...record })));
}

const checks = [
  { key: "required", label: "Missing required field" },
  { key: "duplicate", label: "Repeated appointment ID" },
  { key: "status", label: "Unsupported status" },
];

function assessRecords(records) {
  const seen = new Set();
  return records.map((record) => {
    const required = !record.id || !record.date || !record.clinic || !record.status;
    const duplicate = Boolean(record.id) && seen.has(record.id);
    const status = Boolean(record.status) && !statuses.includes(record.status);
    seen.add(record.id);
    return { ...record, issues: { required, duplicate, status } };
  });
}

const rawRecords = assessRecords(generateRecords());
const hasIssues = (record) => Object.values(record.issues).some(Boolean);
const cleanRecords = rawRecords.filter((record) => !hasIssues(record));

function summarize(records) {
  const attended = records.filter((record) => record.status === statuses[0]).length;
  const missed = records.filter((record) => record.status === statuses[1]).length;
  return {
    booked: records.length,
    attended,
    missed,
    cancelled: records.length - attended - missed,
    rate: attended + missed ? missed / (attended + missed) : 0,
  };
}

function monthlySummary(records, quarter = "") {
  return months.map((month, index) => ({
    month,
    quarter: index < 3 ? "1" : "2",
    ...summarize(records.filter((record) => record.month === index)),
  })).filter((row) => !quarter || row.quarter === quarter);
}

function renderChart(id, rows) {
  const max = Math.max(1, ...rows.map((row) => row.booked));
  const chart = byId(id);
  const bar = (value, extraClass = "") =>
    '<span class="chart-bar ' + extraClass + '" style="--value:' + (100 * value / max) + '%"></span>';
  chart.setAttribute("aria-label", rows.map((row) =>
    row.month + ": " + row.booked + " booked, " + row.missed + " missed").join(". "));
  chart.innerHTML = '<div class="plot" aria-hidden="true">' + rows.map((row) =>
    '<div class="chart-group" title="' + row.month + ': ' +
    row.booked + ' booked, ' + row.missed + ' missed">' +
    bar(row.booked) + bar(row.missed, "dna") + '</div>').join("") +
    '</div><div class="chart-labels" aria-hidden="true">' + rows.map((row) =>
    '<span>' + row.month + '</span>').join("") + '</div>';
}

function renderMetrics(id, metrics) {
  byId(id).innerHTML = metrics.map(([label, value]) =>
    '<div><span>' + label + '</span><strong>' + value + '</strong></div>').join("");
}

function updateAppointments() {
  const clinic = byId("clinic-filter").value;
  const quarter = byId("period-filter").value;
  const selected = cleanRecords.filter((record) =>
    (!clinic || record.clinic === clinic) &&
    (!quarter || (record.month < 3 ? "1" : "2") === quarter));
  const totals = summarize(selected);
  const rows = monthlySummary(selected, quarter);
  renderMetrics("appointment-metrics", [
    ["Booked slots", number.format(totals.booked)],
    ["Missed-visit rate", percent.format(totals.rate)],
    ["Cancelled slots", number.format(totals.cancelled)],
  ]);
  renderChart("appointment-chart", rows);
  const highest = rows.reduce((peak, row) => row.rate > peak.rate ? row : peak);
  byId("appointment-insight").textContent = highest.month +
    " had the highest missed-visit rate in this selection (" + percent.format(highest.rate) +
    "). Review the monthly counts alongside the rate before deciding where to test appointment reminders.";

  byId("appointment-table").innerHTML =
    '<table><thead><tr><th scope="col">Month</th><th scope="col">Booked</th>' +
    '<th scope="col">Attended</th><th scope="col">Missed</th><th scope="col">Cancelled</th>' +
    '<th scope="col">Missed rate</th></tr></thead><tbody>' +
    rows.map((row) => '<tr><th scope="row">' + row.month + '</th><td>' + row.booked +
      '</td><td>' + row.attended + '</td><td>' + row.missed + '</td><td>' + row.cancelled +
      '</td><td>' + percent.format(row.rate) + '</td></tr>').join("") + '</tbody></table>';
}

function updateQuality() {
  const stage = byId("quality-stage").value;
  const clinic = byId("quality-clinic").value;
  const forClinic = (record) => !clinic || record.clinic === clinic;
  const baseline = rawRecords.filter(forClinic);
  const selected = stage === "raw" ? baseline : cleanRecords.filter(forClinic);
  const flagged = selected.filter(hasIssues).length;
  const ruleCount = (records, key) => records.filter((row) => row.issues[key]).length;
  const max = Math.max(1, ...checks.map(({ key }) => ruleCount(baseline, key)));
  renderMetrics("quality-metrics", [
    ["Rows checked", number.format(selected.length)],
    ["Rows flagged", number.format(flagged)],
    ["Rows passing all checks", percent.format((selected.length - flagged) / selected.length)],
  ]);
  byId("quality-rules").innerHTML = checks.map(({ key, label }) => {
    const count = ruleCount(selected, key);
    return '<div><div class="rule-label"><span>' + label + '</span><strong>' +
      number.format(count) + '</strong></div><div class="rule-track" aria-hidden="true">' +
      '<div class="rule-fill" style="--value:' + (100 * count / max) + '%"></div></div></div>';
  }).join("");
  byId("quality-insight").textContent = stage === "raw"
    ? number.format(flagged) + " rows are flagged for review. Repeated IDs count copies after the first occurrence."
    : number.format(baseline.length - selected.length) +
      " flagged rows were excluded for this selection. The remaining rows feed the appointments dashboard.";
}

function downloadData() {
  const isRaw = byId("quality-stage").value === "raw";
  const records = isRaw ? rawRecords : cleanRecords;
  const csv = ["appointment_id,appointment_date,clinic,status", ...records.map((record) =>
    [record.id, record.date, record.clinic, record.status].join(","))].join("\r\n");
  const link = document.createElement("a");
  const destination = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.href = destination;
  link.download = isRaw ? "synthetic-appointments-raw.csv" : "synthetic-appointments-reporting.csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(destination), 1000);
}

const all = summarize(cleanRecords);
byId("hero-count").textContent = number.format(all.booked);
byId("hero-dna").textContent = percent.format(all.rate);
renderChart("hero-chart", monthlySummary(cleanRecords));
byId("clinic-filter").addEventListener("change", updateAppointments);
byId("period-filter").addEventListener("change", updateAppointments);
byId("quality-stage").addEventListener("change", updateQuality);
byId("quality-clinic").addEventListener("change", updateQuality);
byId("download-data").addEventListener("click", downloadData);
updateAppointments();
updateQuality();
