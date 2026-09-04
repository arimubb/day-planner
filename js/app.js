const THEME_KEY = "dayPlannerTheme";
const SESSION_KEY = "dayPlannerSession";
const USER_KEY = "dayPlannerTelegramUser";

const API_BASE = "/.netlify/functions";

let selectedDate = getTodayKey();
let tasks = [];

let sessionToken = null;
let telegramUser = null;

let selectedRepeatDays = [];
let openedTaskId = null;
let editingTaskId = null;

let currentFilter = "all";
let currentSort = "date";

/* =========================================================
DOM
========================================================= */

const $ = id => document.getElementById(id);

const userProfile = $("userProfile");
const userName = $("userName");
const userUsername = $("userUsername");
const userAvatar = $("userAvatar");
const userAvatarFallback = $("userAvatarFallback");

const daysScroll = $("daysScroll");
const timelineGrid = $("timelineGrid");
const timelineTasks = $("timelineTasks");
const noTimeSection = $("noTimeSection");
const noTimeTasks = $("noTimeTasks");
const emptyState = $("emptyState");

const taskCount = $("taskCount");
const progressText = $("progressText");
const progressBar = $("progressBar");
const progressCount = $("progressCount");

const todayLabel = $("todayLabel");
const selectedDateText = $("selectedDateText");
const datePicker = $("datePicker");

const modalOverlay = $("modalOverlay");
const taskForm = $("taskForm");

const taskTitle = $("taskTitle");
const taskDescription = $("taskDescription");
const taskDate = $("taskDate");
const taskTime = $("taskTime");

const repeatSelect = $("repeatSelect");
const repeatDays = $("repeatDays");

const themeButton = $("themeButton");

const detailsOverlay = $("detailsOverlay");
const detailsTitle = $("detailsTitle");
const detailsDate = $("detailsDate");
const detailsDescription = $("detailsDescription");
const detailsTime = $("detailsTime");
const detailsRepeat = $("detailsRepeat");
const detailsStatus = $("detailsStatus");

const detailsComplete = $("detailsComplete");
const detailsDelete = $("detailsDelete");
const detailsEdit = $("detailsEdit");
const closeDetails = $("closeDetails");

const modalTitle = $("modalTitle");
const saveTaskButton = $("saveTaskButton");

const taskSearch = $("taskSearch");
const taskSort = $("taskSort");

/* =========================================================
TELEGRAM
========================================================= */

function getTelegramWebApp() {

    if (
        window.Telegram &&
        window.Telegram.WebApp
    ) {
        return window.Telegram.WebApp;
    }

    return null;
}

function isTelegramMiniApp() {
    const tg = getTelegramWebApp();

    return Boolean(
        tg &&
        typeof tg.initData === "string" &&
        tg.initData.length > 0
    );
}

function setupTelegram() {

    const tg = getTelegramWebApp();

    if (!tg) {
        console.warn(
            "Telegram WebApp API не найден."
        );

        return null;
    }

    tg.ready();

    try {
        tg.expand();
    } catch (error) {
        console.warn(
            "Не удалось расширить Telegram WebApp:",
            error
        );
    }

    return tg;
}
/* =========================================================
   ДОБАВЛЕНИЕ MINI APP НА ЭКРАН ДОМОЙ
========================================================= */

function setupHomeScreenButton() {
    const button =
        $("addToHomeScreenButton");

    const overlay =
        $("homeScreenOverlay");

    const closeButton =
        $("closeHomeScreen");

    const closeBottomButton =
        $("closeHomeScreenBottom");

    if (!button || !overlay) {
        return;
    }

    function openHomeScreenModal() {
        overlay.classList.add("active");
        document.body.classList.add("modal-open");
    }

    function closeHomeScreenModal() {
        overlay.classList.remove("active");
        document.body.classList.remove("modal-open");
    }

    button.addEventListener(
        "click",
        () => {
            const tg =
                getTelegramWebApp();

            /*
             * ======================================
             * TELEGRAM
             * ======================================
             *
             * Открываем сайт во внешнем браузере.
             */

            if (
                isTelegramMiniApp() &&
                tg &&
                typeof tg.openLink === "function"
            ) {
                try {
                    tg.openLink(
                        window.location.origin +
                        window.location.pathname
                    );

                    return;

                } catch (error) {
                    console.warn(
                        "Не удалось открыть Safari:",
                        error
                    );
                }
            }

            /*
             * ======================================
             * SAFARI / PWA
             * ======================================
             */

            openHomeScreenModal();
        }
    );

    closeButton?.addEventListener(
        "click",
        closeHomeScreenModal
    );

    closeBottomButton?.addEventListener(
        "click",
        closeHomeScreenModal
    );

    overlay.addEventListener(
        "click",
        (event) => {
            if (
                event.target === overlay
            ) {
                closeHomeScreenModal();
            }
        }
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Escape" &&
                overlay.classList.contains(
                    "active"
                )
            ) {
                closeHomeScreenModal();
            }
        }
    );
}
/* =========================================================
API
========================================================= */

async function apiRequest(
    endpoint,
    options = {}
) {

    if (!sessionToken) {

        throw new Error(
            "Пользователь не авторизован"
        );

    }

    const headers = {
        ...(options.headers || {}),
        "Authorization":
            `Bearer ${sessionToken}`
    };

    if (
        options.body &&
        !headers["Content-Type"]
    ) {

        headers["Content-Type"] =
            "application/json";

    }

    const response =
        await fetch(
            `${API_BASE}${endpoint}`,
            {
                ...options,
                headers
            }
        );

    let data = {};

    try {

        data =
            await response.json();

    } catch {

        data = {};

    }

    if (!response.ok) {

        if (response.status === 401) {
            sessionToken = null;
            telegramUser = null;

            try {
                localStorage.removeItem(
                    SESSION_KEY
                );

                localStorage.removeItem(
                    USER_KEY
                );

                sessionStorage.removeItem(
                    SESSION_KEY
                );
            } catch {}
        }

        throw new Error(
            data.error ||
            `Ошибка сервера: ${response.status}`
        );

    }

    return data;
}

/* =========================================================
TELEGRAM AUTH
========================================================= */

async function authenticateTelegram() {
    const tg = setupTelegram();

    if (!tg || !tg.initData) {
        throw new Error(
            "Откройте приложение через Telegram для первой авторизации."
        );
    }

    const initData = tg.initData;

    const response = await fetch(
        `${API_BASE}/telegram-auth`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                initData
            })
        }
    );

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            "Не удалось авторизоваться через Telegram."
        );
    }

    if (!data.sessionToken) {
        throw new Error(
            "Сервер не вернул sessionToken."
        );
    }

    sessionToken = data.sessionToken;
    telegramUser = data.user || null;

    /*
     * Сохраняем сессию для Safari / PWA
     */
    try {
        localStorage.setItem(
            SESSION_KEY,
            sessionToken
        );

        if (telegramUser) {
            localStorage.setItem(
                USER_KEY,
                JSON.stringify(telegramUser)
            );
        }
    } catch (error) {
        console.warn(
            "Не удалось сохранить сессию:",
            error
        );
    }

    return data;
}
function restoreLocalSession() {
    try {
        const savedToken =
            localStorage.getItem(
                SESSION_KEY
            );

        const savedUser =
            localStorage.getItem(
                USER_KEY
            );

        if (!savedToken) {
            return false;
        }

        sessionToken = savedToken;

        if (savedUser) {
            try {
                telegramUser =
                    JSON.parse(savedUser);
            } catch {
                telegramUser = null;
            }
        }

        return true;

    } catch (error) {
        console.warn(
            "Не удалось восстановить сессию:",
            error
        );

        return false;
    }
}
/* =========================================================
LOAD TASKS
========================================================= */

async function loadTasksFromServer() {

    const data =
        await apiRequest(
            "/tasks",
            {
                method: "GET"
            }
        );

    tasks =
        Array.isArray(data.tasks)
            ? data.tasks
            : [];

    normalizeTasks();

}

/* =========================================================
NORMALIZE TASKS
========================================================= */
function renderTelegramUser() {
    if (!telegramUser) return;

    const firstName = telegramUser.firstName || "Пользователь";
    const lastName = telegramUser.lastName || "";
    const username = telegramUser.username || "";

    const fullName = `${firstName} ${lastName}`.trim();

    userName.textContent = fullName || "Пользователь";

    if (username) {
        userUsername.textContent = `@${username}`;
    } else {
        userUsername.textContent = "";
    }

    const photoUrl = telegramUser.photoUrl;

    if (photoUrl) {
        userAvatar.src = photoUrl;
        userAvatar.classList.remove("hidden");
        userAvatarFallback.classList.add("hidden");
    } else {
        userAvatar.classList.add("hidden");

        userAvatarFallback.textContent =
            firstName.charAt(0).toUpperCase();

        userAvatarFallback.classList.remove("hidden");
    }
}
function normalizeTasks() {

    tasks =
        tasks.map(task => {

            if (
                !Array.isArray(
                    task.completedDates
                )
            ) {

                task.completedDates = [];

            }

            if (!task.repeat) {
                task.repeat = "none";
            }

            if (
                !Array.isArray(
                    task.repeatDays
                )
            ) {

                task.repeatDays = [];

            }

            if (
                typeof task.description !==
                "string"
            ) {

                task.description = "";

            }

            if (
                typeof task.time !==
                "string"
            ) {

                task.time = "";

            }

            return task;

        });

}

/* =========================================================
DATE
========================================================= */

function getTodayKey() {
    return getDateKey(new Date());
}

function getDateKey(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function dateFromKey(key) {

    const [
        year,
        month,
        day
    ] =
        key.split("-")
            .map(Number);

    return new Date(
        year,
        month - 1,
        day
    );
}

function addDays(
    date,
    amount
) {

    const result =
        new Date(date);

    result.setDate(
        result.getDate() + amount
    );

    return result;
}

function formatFullDate(key) {

    return dateFromKey(key)
        .toLocaleDateString(
            "ru-RU",
            {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        );
}

function formatShortDate(key) {

    return dateFromKey(key)
        .toLocaleDateString(
            "ru-RU",
            {
                day: "numeric",
                month: "short"
            }
        )
        .replace(".", "");
}

function capitalize(text) {

    if (!text) return "";

    return (
        text.charAt(0).toUpperCase() +
        text.slice(1)
    );
}

function getDayName(date) {

    return date
        .toLocaleDateString(
            "ru-RU",
            {
                weekday: "short"
            }
        )
        .replace(".", "")
        .slice(0, 2);
}

/* =========================================================
THEME
========================================================= */

function loadTheme() {

    const theme =
        localStorage.getItem(
            THEME_KEY
        );

    const dark =
        theme === "dark";

    document.body.classList.toggle(
        "dark",
        dark
    );

    themeButton.textContent =
        dark ? "☀" : "☾";

    updateThemeColor(
        dark
            ? "#101010"
            : "#ffffff"
    );
}

function updateThemeColor(color) {

    const meta =
        document.querySelector(
            'meta[name="theme-color"]'
        );

    if (meta) {

        meta.setAttribute(
            "content",
            color
        );

    }
}

themeButton.addEventListener(
    "click",
    () => {

        const dark =
            !document.body.classList.contains(
                "dark"
            );

        document.body.classList.toggle(
            "dark",
            dark
        );

        localStorage.setItem(
            THEME_KEY,
            dark
                ? "dark"
                : "light"
        );

        themeButton.textContent =
            dark ? "☀" : "☾";

        updateThemeColor(
            dark
                ? "#101010"
                : "#ffffff"
        );

    }
);

/* =========================================================
NAVIGATION
========================================================= */

document
    .querySelectorAll(".nav-button")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                switchScreen(
                    button.dataset.screen
                );

            }
        );

    });

function switchScreen(
    screenId
) {

    document
        .querySelectorAll(
            ".app-screen"
        )
        .forEach(screen => {

            screen.classList.toggle(
                "active",
                screen.id === screenId
            );

        });

    document
        .querySelectorAll(
            ".nav-button"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.screen ===
                screenId
            );

        });

    if (
        screenId ===
        "tasksScreen"
    ) {

        renderAllTasks();

    }

    if (
        screenId ===
        "analyticsScreen"
    ) {

        renderAnalytics();

    }

}

/* =========================================================
CALENDAR
========================================================= */

function renderCalendar() {

    daysScroll.innerHTML = "";

    const centerDate =
        dateFromKey(
            selectedDate
        );

    for (
        let i = -30;
        i < 60;
        i++
    ) {

        const date =
            addDays(
                centerDate,
                i
            );

        const key =
            getDateKey(date);

        const button =
            document.createElement(
                "button"
            );

        button.type = "button";
        button.className =
            "day-button";

        if (
            key ===
            getTodayKey()
        ) {

            button.classList.add(
                "today"
            );

        }

        if (
            key ===
            selectedDate
        ) {

            button.classList.add(
                "selected"
            );

        }

        button.innerHTML = `

            <span class="day-name">
                ${capitalize(
                    getDayName(date)
                )}
            </span>

            <span class="day-number">
                ${date.getDate()}
            </span>

            <span class="month-name">
                ${date
                    .toLocaleDateString(
                        "ru-RU",
                        {
                            month: "short"
                        }
                    )
                    .replace(".", "")
                }
            </span>

        `;

        button.addEventListener(
            "click",
            () => {

                selectedDate =
                    key;

                refreshDay();

                setTimeout(
                    centerSelectedDay,
                    20
                );

            }
        );

        daysScroll.appendChild(
            button
        );

    }

    setTimeout(
        centerSelectedDay,
        10
    );
}

function centerSelectedDay() {

    const selected =
        daysScroll.querySelector(
            ".day-button.selected"
        );

    if (!selected) return;

    selected.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "center"
    });
}

function updateDateUI() {

    const full =
        formatFullDate(
            selectedDate
        );

    selectedDateText.textContent =
        capitalize(full);

    datePicker.value =
        selectedDate;

    todayLabel.textContent =
        selectedDate ===
        getTodayKey()

            ? "Сегодня"

            : capitalize(full);
}

$("prevDays").addEventListener(
    "click",
    () => {

        selectedDate =
            getDateKey(
                addDays(
                    dateFromKey(
                        selectedDate
                    ),
                    -1
                )
            );

        refreshDay();

    }
);

$("nextDays").addEventListener(
    "click",
    () => {

        selectedDate =
            getDateKey(
                addDays(
                    dateFromKey(
                        selectedDate
                    ),
                    1
                )
            );

        refreshDay();

    }
);

datePicker.addEventListener(
    "change",
    () => {

        if (!datePicker.value) {
            return;
        }

        selectedDate =
            datePicker.value;

        refreshDay();

    }
);

function refreshDay() {

    updateDateUI();

    renderCalendar();

    renderTasks();

}

/* =========================================================
TIMELINE
========================================================= */

function getHourHeight() {

    if (
        window.innerWidth <= 600
    ) {

        return 80;

    }

    if (
        window.innerWidth <= 800
    ) {

        return 90;

    }

    return 100;
}

function renderTimelineGrid() {

    timelineGrid.innerHTML = "";

    const hourHeight =
        getHourHeight();

    const axis =
        document.createElement(
            "div"
        );

    axis.className =
        "timeline-axis";

    timelineGrid.appendChild(
        axis
    );

    for (
        let hour = 0;
        hour <= 24;
        hour++
    ) {

        const line =
            document.createElement(
                "div"
            );

        line.className =
            "hour-line";

        line.style.top =
            `${hour * hourHeight}px`;

        timelineGrid.appendChild(
            line
        );

        if (hour < 24) {

            const label =
                document.createElement(
                    "div"
                );

            label.className =
                "hour-label";

            label.style.top =
                `${hour * hourHeight}px`;

            label.textContent =
                `${String(hour).padStart(
                    2,
                    "0"
                )}:00`;

            timelineGrid.appendChild(
                label
            );

        }

    }
}

function timeToMinutes(time) {

    if (!time) return null;

    const parts =
        time.split(":");

    if (
        parts.length !== 2
    ) {

        return null;

    }

    const hours =
        Number(parts[0]);

    const minutes =
        Number(parts[1]);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes)
    ) {

        return null;

    }

    return (
        hours * 60 +
        minutes
    );
}

/* =========================================================
TASK DATE LOGIC
========================================================= */

function taskBelongsToDate(
    task,
    dateKey
) {

    if (
        !task.repeat ||
        task.repeat === "none"
    ) {

        return (
            task.date ===
            dateKey
        );

    }

    if (
        task.repeat ===
        "daily"
    ) {

        return (
            dateKey >=
            task.date
        );

    }

    if (
        task.repeat ===
        "weekly"
    ) {

        if (
            dateKey <
            task.date
        ) {

            return false;

        }

        const date =
            dateFromKey(
                dateKey
            );

        return (
            Array.isArray(
                task.repeatDays
            ) &&
            task.repeatDays.includes(
                date.getDay()
            )
        );

    }

    return false;
}

function getTasksForDate(
    dateKey
) {

    return tasks.filter(
        task =>
            taskBelongsToDate(
                task,
                dateKey
            )
    );
}

function getTasksForSelectedDate() {

    return getTasksForDate(
        selectedDate
    );
}

function isCompleted(
    task,
    dateKey
) {

    return (
        Array.isArray(
            task.completedDates
        ) &&
        task.completedDates.includes(
            dateKey
        )
    );
}

/* =========================================================
TIMELINE TASKS
========================================================= */

function sortTasks(list) {

    return [...list].sort(
        (a, b) => {

            if (
                !a.time &&
                !b.time
            ) {

                return 0;

            }

            if (!a.time) {
                return 1;
            }

            if (!b.time) {
                return -1;
            }

            return a.time.localeCompare(
                b.time
            );

        }
    );
}

function calculateTaskLanes(
    list
) {

    const lanes = [];
    const result = [];

    const sorted =
        sortTasks(list);

    const duration = 60;

    sorted.forEach(task => {

        const start =
            timeToMinutes(
                task.time
            );

        const end =
            start + duration;

        let lane = 0;

        while (true) {

            if (
                typeof lanes[lane] ===
                "undefined"
            ) {

                lanes[lane] =
                    end;

                break;

            }

            if (
                start >=
                lanes[lane]
            ) {

                lanes[lane] =
                    end;

                break;

            }

            lane++;

        }

        result.push({
            task,
            lane
        });

    });

    return {
        items: result,
        laneCount:
            Math.max(
                lanes.length,
                1
            )
    };
}

function createTaskCard(
    task,
    lane,
    laneCount
) {

    const card =
        document.createElement(
            "div"
        );

    card.className =
        "task-card";

    if (
        isCompleted(
            task,
            selectedDate
        )
    ) {

        card.classList.add(
            "completed"
        );

    }

    const minutes =
        timeToMinutes(
            task.time
        );

    const hourHeight =
        getHourHeight();

    card.style.top =
        `${minutes *
        hourHeight /
        60}px`;

    const gap = 8;

    card.style.width =
        `calc((100% - ${
            (laneCount - 1) * gap
        }px) / ${laneCount})`;

    card.style.left =
        `calc(${lane} * ((100% - ${
            (laneCount - 1) * gap
        }px) / ${laneCount} + ${gap}px))`;

    card.innerHTML = `

        <div class="task-time">
            🕐 ${escapeHTML(task.time)}
        </div>

        <div class="task-title">
            ${escapeHTML(task.title)}
        </div>

        ${
            task.description
                ? `
                    <div class="task-description">
                        ${escapeHTML(
                            task.description
                        )}
                    </div>
                `
                : ""
        }

        ${
            getRepeatText(task)
                ? `
                    <div class="task-repeat">
                        ↻ ${escapeHTML(
                            getRepeatText(
                                task
                            )
                        )}
                    </div>
                `
                : ""
        }

        <div class="task-actions">

            <button
                class="task-check"
                type="button"
            >
                ${
                    isCompleted(
                        task,
                        selectedDate
                    )
                        ? "✓"
                        : ""
                }
            </button>

            <button
                class="task-delete"
                type="button"
            >
                ×
            </button>

        </div>
    `;

    card.addEventListener(
        "click",
        () =>
            openTaskDetails(
                task.id
            )
    );

    card.querySelector(
        ".task-check"
    ).addEventListener(
        "click",
        async event => {

            event.stopPropagation();

            await toggleTaskCompletion(
                task.id,
                selectedDate
            );

        }
    );

    card.querySelector(
        ".task-delete"
    ).addEventListener(
        "click",
        async event => {

            event.stopPropagation();

            await deleteTask(
                task.id
            );

        }
    );

    return card;
}

function createNoTimeTask(
    task
) {

    const item =
        document.createElement(
            "div"
        );

    item.className =
        "no-time-task";

    if (
        isCompleted(
            task,
            selectedDate
        )
    ) {

        item.classList.add(
            "completed"
        );

    }

    item.innerHTML = `

        <button
            class="task-check"
            type="button"
        >
            ${
                isCompleted(
                    task,
                    selectedDate
                )
                    ? "✓"
                    : ""
            }
        </button>

        <div class="task-content">

            <div class="task-title">
                ${escapeHTML(
                    task.title
                )}
            </div>

            ${
                task.description
                    ? `
                        <div class="task-description">
                            ${escapeHTML(
                                task.description
                            )}
                        </div>
                    `
                    : ""
            }

        </div>

        <button
            class="task-delete"
            type="button"
        >
            ×
        </button>

    `;

    item.addEventListener(
        "click",
        () =>
            openTaskDetails(
                task.id
            )
    );

    item.querySelector(
        ".task-check"
    ).addEventListener(
        "click",
        async event => {

            event.stopPropagation();

            await toggleTaskCompletion(
                task.id,
                selectedDate
            );

        }
    );

    item.querySelector(
        ".task-delete"
    ).addEventListener(
        "click",
        async event => {

            event.stopPropagation();

            await deleteTask(
                task.id
            );

        }
    );

    return item;
}

/* =========================================================
RENDER DAY
========================================================= */

function renderTasks() {

    renderTimelineGrid();

    timelineTasks.innerHTML = "";
    noTimeTasks.innerHTML = "";

    const dayTasks =
        getTasksForSelectedDate();

    const timed =
        dayTasks.filter(
            task =>
                Boolean(task.time)
        );

    const withoutTime =
        dayTasks.filter(
            task =>
                !task.time
        );

    const lanes =
        calculateTaskLanes(
            timed
        );

    lanes.items.forEach(
        item => {

            timelineTasks.appendChild(
                createTaskCard(
                    item.task,
                    item.lane,
                    lanes.laneCount
                )
            );

        }
    );

    if (
        withoutTime.length
    ) {

        noTimeSection.classList.remove(
            "hidden"
        );

        withoutTime.forEach(
            task => {

                noTimeTasks.appendChild(
                    createNoTimeTask(
                        task
                    )
                );

            }
        );

    } else {

        noTimeSection.classList.add(
            "hidden"
        );

    }

    emptyState.classList.toggle(
        "hidden",
        dayTasks.length > 0
    );

    taskCount.textContent =
        pluralizeTasks(
            dayTasks.length
        );

    updateProgress(
        dayTasks
    );
}

function updateProgress(
    dayTasks
) {

    const total =
        dayTasks.length;

    const completed =
        dayTasks.filter(
            task =>
                isCompleted(
                    task,
                    selectedDate
                )
        ).length;

    const percent =
        total
            ? Math.round(
                completed /
                total *
                100
            )
            : 0;

    progressText.textContent =
        `${percent}%`;

    progressBar.style.width =
        `${percent}%`;

    progressCount.textContent =
        `${completed} из ${total} ${
            getTaskWord(total)
        } выполнено`;
}

/* =========================================================
COMPLETION
========================================================= */

async function toggleTaskCompletion(
    id,
    dateKey
) {

    const task =
        tasks.find(
            item =>
                item.id === id
        );

    if (!task) return;

    try {

        const data =
            await apiRequest(
                `/complete-task?id=${encodeURIComponent(
                    id
                )}`,
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            date: dateKey
                        })
                }
            );

        task.completedDates =
            Array.isArray(
                data.completedDates
            )
                ? data.completedDates
                : [];

        refreshDay();

        renderAllTasks();

        renderAnalytics();

        if (
            openedTaskId === id &&
            detailsOverlay.classList.contains(
                "active"
            )
        ) {

            openTaskDetails(id);

        }

    } catch (error) {

        console.error(
            "Ошибка выполнения задачи:",
            error
        );

        alert(
            error.message ||
            "Не удалось изменить статус задачи."
        );

    }
}

/* =========================================================
DELETE
========================================================= */

async function deleteTask(id) {

    const task =
        tasks.find(
            item =>
                item.id === id
        );

    if (!task) return;

    if (
        !confirm(
            `Удалить задачу «${task.title}»?`
        )
    ) {

        return;

    }

    try {

        await apiRequest(
            `/tasks?id=${encodeURIComponent(
                id
            )}`,
            {
                method: "DELETE"
            }
        );

        tasks =
            tasks.filter(
                item =>
                    item.id !== id
            );

        if (
            openedTaskId === id
        ) {

            closeTaskDetails();

        }

        refreshDay();

        renderAllTasks();

        renderAnalytics();

    } catch (error) {

        console.error(
            "Ошибка удаления задачи:",
            error
        );

        alert(
            error.message ||
            "Не удалось удалить задачу."
        );

    }
}

/* =========================================================
DETAILS
========================================================= */

function openTaskDetails(id) {

    const task =
        tasks.find(
            item =>
                item.id === id
        );

    if (!task) return;

    openedTaskId = id;

    detailsTitle.textContent =
        task.title;

    detailsDate.textContent =
        capitalize(
            formatFullDate(
                selectedDate
            )
        );

    detailsDescription.textContent =
        task.description ||
        "Описание отсутствует";

    detailsTime.textContent =
        task.time ||
        "Без времени";

    detailsRepeat.textContent =
        getRepeatText(task) ||
        "Не повторяется";

    const completed =
        isCompleted(
            task,
            selectedDate
        );

    detailsStatus.textContent =
        completed
            ? "✓ Выполнено"
            : "Не выполнено";

    detailsComplete.textContent =
        completed
            ? "Вернуть"
            : "Выполнено";

    detailsOverlay.classList.add(
        "active"
    );
}

function closeTaskDetails() {

    detailsOverlay.classList.remove(
        "active"
    );

    openedTaskId = null;
}

closeDetails.addEventListener(
    "click",
    closeTaskDetails
);

detailsOverlay.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            detailsOverlay
        ) {

            closeTaskDetails();

        }

    }
);

/* =========================================================
DETAILS ACTIONS
========================================================= */

detailsComplete.addEventListener(
    "click",
    async () => {

        if (!openedTaskId) {
            return;
        }

        await toggleTaskCompletion(
            openedTaskId,
            selectedDate
        );

    }
);

detailsDelete.addEventListener(
    "click",
    async () => {

        if (!openedTaskId) {
            return;
        }

        const id =
            openedTaskId;

        await deleteTask(id);

    }
);

/* =========================================================
EDIT
========================================================= */

detailsEdit.addEventListener(
    "click",
    () => {

        if (!openedTaskId) {
            return;
        }

        const id =
            openedTaskId;

        closeTaskDetails();

        openEditModal(id);

    }
);

function openEditModal(id) {

    const task =
        tasks.find(
            item =>
                item.id === id
        );

    if (!task) return;

    editingTaskId = id;

    modalTitle.textContent =
        "Редактировать задачу";

    saveTaskButton.textContent =
        "Сохранить изменения";

    taskTitle.value =
        task.title || "";

    taskDescription.value =
        task.description || "";

    taskDate.value =
        task.date ||
        selectedDate;

    taskTime.value =
        task.time || "";

    repeatSelect.value =
        task.repeat ||
        "none";

    selectedRepeatDays =
        Array.isArray(
            task.repeatDays
        )
            ? [
                ...task.repeatDays
            ]
            : [];

    document
        .querySelectorAll(
            ".weekday-buttons button"
        )
        .forEach(
            button => {

                const day =
                    Number(
                        button.dataset.day
                    );

                button.classList.toggle(
                    "active",
                    selectedRepeatDays.includes(
                        day
                    )
                );

            }
        );

    repeatDays.classList.toggle(
        "hidden",
        repeatSelect.value !==
        "weekly"
    );

    modalOverlay.classList.add(
        "active"
    );

    setTimeout(
        () =>
            taskTitle.focus(),
        100
    );
}

/* =========================================================
CREATE MODAL
========================================================= */

function openCreateModal() {

    editingTaskId = null;

    modalTitle.textContent =
        "Новая задача";

    saveTaskButton.textContent =
        "Создать задачу";

    taskTitle.value = "";
    taskDescription.value = "";

    taskDate.value =
        selectedDate;

    taskTime.value = "";

    repeatSelect.value =
        "none";

    selectedRepeatDays = [];

    document
        .querySelectorAll(
            ".weekday-buttons button"
        )
        .forEach(
            button => {

                button.classList.remove(
                    "active"
                );

            }
        );

    repeatDays.classList.add(
        "hidden"
    );

    modalOverlay.classList.add(
        "active"
    );

    setTimeout(
        () =>
            taskTitle.focus(),
        100
    );
}

function closeModal() {

    modalOverlay.classList.remove(
        "active"
    );

    editingTaskId = null;
}

$("openModal").addEventListener(
    "click",
    openCreateModal
);

$("emptyAddButton").addEventListener(
    "click",
    openCreateModal
);

$("closeModal").addEventListener(
    "click",
    closeModal
);

$("cancelModal").addEventListener(
    "click",
    closeModal
);

modalOverlay.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            modalOverlay
        ) {

            closeModal();

        }

    }
);

/* =========================================================
REPEAT
========================================================= */

repeatSelect.addEventListener(
    "change",
    () => {

        repeatDays.classList.toggle(
            "hidden",
            repeatSelect.value !==
            "weekly"
        );

    }
);

document
    .querySelectorAll(
        ".weekday-buttons button"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const day =
                        Number(
                            button.dataset.day
                        );

                    if (
                        selectedRepeatDays.includes(
                            day
                        )
                    ) {

                        selectedRepeatDays =
                            selectedRepeatDays.filter(
                                item =>
                                    item !==
                                    day
                            );

                        button.classList.remove(
                            "active"
                        );

                    } else {

                        selectedRepeatDays.push(
                            day
                        );

                        button.classList.add(
                            "active"
                        );

                    }

                }
            );

        }
    );

/* =========================================================
SAVE CREATE / EDIT
========================================================= */

taskForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const title =
            taskTitle.value.trim();

        const description =
            taskDescription.value.trim();

        const date =
            taskDate.value;

        const time =
            taskTime.value;

        const repeat =
            repeatSelect.value;

        if (!title) {

            alert(
                "Введите название задачи."
            );

            return;

        }

        if (!date) {

            alert(
                "Выберите дату."
            );

            return;

        }

        if (
            repeat === "weekly" &&
            selectedRepeatDays.length === 0
        ) {

            alert(
                "Выберите хотя бы один день недели."
            );

            return;

        }

        let repeatDaysValue = [];

        if (
            repeat ===
            "daily"
        ) {

            repeatDaysValue = [
                0,
                1,
                2,
                3,
                4,
                5,
                6
            ];

        } else if (
            repeat ===
            "weekly"
        ) {

            repeatDaysValue =
                [
                    ...selectedRepeatDays
                ];

        }

        const oldButtonText =
            saveTaskButton.textContent;

        saveTaskButton.disabled =
            true;

        saveTaskButton.textContent =
            "Сохранение...";

        try {

            /* =========================================
               РЕДАКТИРОВАНИЕ
            ========================================= */

            if (editingTaskId) {

                const response =
                    await apiRequest(
                        `/tasks?id=${encodeURIComponent(
                            editingTaskId
                        )}`,
                        {
                            method: "PUT",

                            body:
                                JSON.stringify({

                                    title,

                                    description,

                                    date,

                                    time,

                                    repeat,

                                    repeatDays:
                                        repeatDaysValue

                                })
                        }
                    );

                const updatedTask =
                    response.task;

                const index =
                    tasks.findIndex(
                        item =>
                            item.id ===
                            editingTaskId
                    );

                if (
                    index !== -1 &&
                    updatedTask
                ) {

                    tasks[index] =
                        updatedTask;

                }

            } else {

                /* =====================================
                   СОЗДАНИЕ
                ===================================== */

                const response =
                    await apiRequest(
                        "/tasks",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({

                                    title,

                                    description,

                                    date,

                                    time,

                                    repeat,

                                    repeatDays:
                                        repeatDaysValue

                                })
                        }
                    );

                if (
                    response.task
                ) {

                    tasks.push(
                        response.task
                    );

                }

                selectedDate =
                    date;

            }

            closeModal();

            refreshDay();

            renderAllTasks();

            renderAnalytics();

        } catch (error) {

            console.error(
                "Ошибка сохранения задачи:",
                error
            );

            alert(
                error.message ||
                "Не удалось сохранить задачу."
            );

        } finally {

            saveTaskButton.disabled =
                false;

            saveTaskButton.textContent =
                oldButtonText;

        }

    }
);

/* =========================================================
ALL TASKS SCREEN
========================================================= */

taskSearch.addEventListener(
    "input",
    renderAllTasks
);

taskSort.addEventListener(
    "change",
    () => {

        currentSort =
            taskSort.value;

        renderAllTasks();

    }
);

document
    .querySelectorAll(
        ".filter-button"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".filter-button"
                        )
                        .forEach(
                            item => {

                                item.classList.remove(
                                    "active"
                                );

                            }
                        );

                    button.classList.add(
                        "active"
                    );

                    currentFilter =
                        button.dataset.filter;

                    renderAllTasks();

                }
            );

        }
    );

function renderAllTasks() {

    const list =
        $("allTasksList");

    const empty =
        $("tasksEmpty");

    list.innerHTML = "";

    $("allTasksCount").textContent =
        tasks.length;

    const search =
        taskSearch.value
            .trim()
            .toLowerCase();

    let filtered =
        tasks.filter(
            task => {

                const title =
                    String(
                        task.title ||
                        ""
                    ).toLowerCase();

                const description =
                    String(
                        task.description ||
                        ""
                    ).toLowerCase();

                const matchesSearch =
                    !search ||
                    title.includes(
                        search
                    ) ||
                    description.includes(
                        search
                    );

                if (!matchesSearch) {
                    return false;
                }

                if (
                    currentFilter ===
                    "active"
                ) {

                    return !isTaskCompletedAnywhere(
                        task
                    );

                }

                if (
                    currentFilter ===
                    "completed"
                ) {

                    return isTaskCompletedAnywhere(
                        task
                    );

                }

                if (
                    currentFilter ===
                    "notime"
                ) {

                    return !task.time;

                }

                return true;

            }
        );

    filtered =
        sortAllTasks(
            filtered
        );

    $("tasksResultText").textContent =
        `${filtered.length} ${
            pluralizeTaskWord(
                filtered.length
            )
        }`;

    if (
        !filtered.length
    ) {

        empty.classList.remove(
            "hidden"
        );

        return;

    }

    empty.classList.add(
        "hidden"
    );

    filtered.forEach(
        task => {

            list.appendChild(
                createAllTaskCard(
                    task
                )
            );

        }
    );
}

function sortAllTasks(
    list
) {

    return [...list].sort(
        (a, b) => {

            if (
                currentSort ===
                "title"
            ) {

                return String(
                    a.title || ""
                ).localeCompare(
                    String(
                        b.title || ""
                    ),
                    "ru"
                );

            }

            if (
                currentSort ===
                "created"
            ) {

                return (
                    new Date(
                        b.createdAt || 0
                    ).getTime() -
                    new Date(
                        a.createdAt || 0
                    ).getTime()
                );

            }

            if (
                currentSort ===
                "time"
            ) {

                return (
                    (a.time ||
                        "99:99")
                        .localeCompare(
                            b.time ||
                            "99:99"
                        )
                );

            }

            return (
                String(
                    a.date || ""
                ).localeCompare(
                    String(
                        b.date || ""
                    )
                ) ||
                (
                    a.time ||
                    "99:99"
                ).localeCompare(
                    b.time ||
                    "99:99"
                )
            );

        }
    );
}

function isTaskCompletedAnywhere(
    task
) {

    return (
        Array.isArray(
            task.completedDates
        ) &&
        task.completedDates.length > 0
    );
}

function createAllTaskCard(
    task
) {

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "all-task-card";

    const completed =
        isTaskCompletedAnywhere(
            task
        );

    if (completed) {

        card.classList.add(
            "completed"
        );

    }

    card.innerHTML = `

        <button
            class="list-check"
            type="button"
        >
            ${completed ? "✓" : ""}
        </button>

        <div class="all-task-content">

            <div class="all-task-title">
                ${escapeHTML(
                    task.title
                )}
            </div>

            <div class="all-task-meta">

                <span>
                    📅 ${formatShortDate(
                        task.date
                    )}
                </span>

                <span>
                    ${
                        task.time
                            ? `🕐 ${escapeHTML(
                                task.time
                            )}`
                            : "Без времени"
                    }
                </span>

            </div>

            ${
                task.description
                    ? `
                        <div class="all-task-description">
                            ${escapeHTML(
                                task.description
                            )}
                        </div>
                    `
                    : ""
            }

            ${
                getRepeatText(task)
                    ? `
                        <div class="task-repeat">
                            ↻ ${escapeHTML(
                                getRepeatText(
                                    task
                                )
                            )}
                        </div>
                    `
                    : ""
            }

        </div>

        <div class="list-task-actions">

            <button
                class="list-edit"
                type="button"
                title="Редактировать"
            >
                ✎
            </button>

            <button
                class="list-delete"
                type="button"
                title="Удалить"
            >
                ×
            </button>

        </div>

    `;

    card.querySelector(
        ".list-check"
    ).addEventListener(
        "click",
        async event => {

            event.stopPropagation();

            await toggleTaskCompletion(
                task.id,
                selectedDate
            );

        }
    );

    card.querySelector(
        ".list-edit"
    ).addEventListener(
        "click",
        event => {

            event.stopPropagation();

            openEditModal(
                task.id
            );

        }
    );

    card.querySelector(
        ".list-delete"
    ).addEventListener(
        "click",
        async event => {

            event.stopPropagation();

            await deleteTask(
                task.id
            );

        }
    );

    card.addEventListener(
        "click",
        () => {

            selectedDate =
                task.date;

            switchScreen(
                "dayScreen"
            );

            refreshDay();

            openTaskDetails(
                task.id
            );

        }
    );

    return card;
}

/* =========================================================
ANALYTICS
========================================================= */

function renderAnalytics() {

    const total =
        tasks.length;

    const completed =
        tasks.filter(
            task =>
                isTaskCompletedAnywhere(
                    task
                )
        ).length;

    const active =
        total -
        completed;

    const todayTasks =
        getTasksForDate(
            getTodayKey()
        );

    const percent =
        total
            ? Math.round(
                completed /
                total *
                100
            )
            : 0;

    $("analyticsPercent").textContent =
        `${percent}%`;

    $("analyticsMainText").textContent =
        `${completed} из ${total} задач`;

    $("statTotal").textContent =
        total;

    $("statCompleted").textContent =
        completed;

    $("statActive").textContent =
        active;

    $("statToday").textContent =
        todayTasks.length;

    renderWeekChart();

    renderProductivity();
}

function renderWeekChart() {

    const chart =
        $("weekChart");

    chart.innerHTML = "";

    const today =
        dateFromKey(
            getTodayKey()
        );

    let totalCompleted = 0;

    const values = [];

    for (
        let i = 6;
        i >= 0;
        i--
    ) {

        const date =
            addDays(
                today,
                -i
            );

        const key =
            getDateKey(date);

        const dayTasks =
            getTasksForDate(
                key
            );

        const completed =
            dayTasks.filter(
                task =>
                    isCompleted(
                        task,
                        key
                    )
            ).length;

        totalCompleted +=
            completed;

        values.push({
            key,
            completed,
            date
        });

    }

    const max =
        Math.max(
            ...values.map(
                item =>
                    item.completed
            ),
            1
        );

    values.forEach(
        item => {

            const column =
                document.createElement(
                    "div"
                );

            column.className =
                "chart-column";

            const value =
                document.createElement(
                    "div"
                );

            value.className =
                "chart-value";

            value.textContent =
                item.completed;

            const bar =
                document.createElement(
                    "div"
                );

            bar.className =
                "chart-bar";

            bar.style.height =
                `${Math.max(
                    item.completed /
                    max *
                    100,
                    item.completed
                        ? 8
                        : 3
                )}%`;

            const label =
                document.createElement(
                    "div"
                );

            label.className =
                "chart-label";

            label.textContent =
                capitalize(
                    getDayName(
                        item.date
                    )
                );

            column.appendChild(
                value
            );

            column.appendChild(
                bar
            );

            column.appendChild(
                label
            );

            chart.appendChild(
                column
            );

        }
    );

    $("weekTotal").textContent =
        totalCompleted;
}

function renderProductivity() {

    const today =
        dateFromKey(
            getTodayKey()
        );

    let sum = 0;
    let best = null;

    for (
        let i = 0;
        i < 7;
        i++
    ) {

        const date =
            addDays(
                today,
                -i
            );

        const key =
            getDateKey(date);

        const count =
            getTasksForDate(
                key
            )
            .filter(
                task =>
                    isCompleted(
                        task,
                        key
                    )
            )
            .length;

        sum += count;

        if (
            !best ||
            count > best.count
        ) {

            best = {
                count,
                key
            };

        }

    }

    $("averageTasks").textContent =
        (sum / 7).toFixed(1);

    if (
        best &&
        best.count > 0
    ) {

        $("bestDay").textContent =
            `${capitalize(
                formatFullDate(
                    best.key
                )
            )} — ${best.count}`;

    } else {

        $("bestDay").textContent =
            "Пока нет данных";

    }
}

/* =========================================================
TEXT
========================================================= */

function getRepeatText(
    task
) {

    if (
        !task.repeat ||
        task.repeat === "none"
    ) {

        return "";

    }

    if (
        task.repeat ===
        "daily"
    ) {

        return "каждый день";

    }

    if (
        task.repeat ===
        "weekly"
    ) {

        const names = {

            0: "Вс",
            1: "Пн",
            2: "Вт",
            3: "Ср",
            4: "Чт",
            5: "Пт",
            6: "Сб"

        };

        return Array.isArray(
            task.repeatDays
        )

            ? task.repeatDays
                .map(
                    day =>
                        names[day]
                )
                .join(", ")

            : "";

    }

    return "";
}

function getTaskWord(
    number
) {

    if (
        number % 10 === 1 &&
        number % 100 !== 11
    ) {

        return "задача";

    }

    if (
        number % 10 >= 2 &&
        number % 10 <= 4 &&
        (
            number % 100 < 10 ||
            number % 100 >= 20
        )
    ) {

        return "задачи";

    }

    return "задач";
}

function pluralizeTasks(
    number
) {

    return `${number} ${
        getTaskWord(number)
    }`;

}

function pluralizeTaskWord(
    number
) {

    return getTaskWord(
        number
    );

}

function escapeHTML(
    value
) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}

/* =========================================================
ESC
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Escape"
        ) {

            return;

        }

        closeModal();

        closeTaskDetails();

    }
);

/* =========================================================
RESIZE
========================================================= */

let resizeTimer = null;

window.addEventListener(
    "resize",
    () => {

        clearTimeout(
            resizeTimer
        );

        resizeTimer =
            setTimeout(
                () => {

                    renderTasks();

                },
                150
            );

    }
);

/* =========================================================
INIT
========================================================= */

async function init() {
    loadTheme();
    updateDateUI();
    setupHomeScreenButton();

    try {
        /*
         * ==========================================
         * ЕСЛИ ОТКРЫТО В TELEGRAM
         * ==========================================
         */

        if (isTelegramMiniApp()) {
            await authenticateTelegram();

            renderTelegramUser();

            await loadTasksFromServer();
        }

        /*
         * ==========================================
         * SAFARI / PWA
         * ==========================================
         */

        else {
            const restored =
                restoreLocalSession();

            if (!restored) {
                throw new Error(
                    "Сначала откройте приложение через Telegram и войдите в него."
                );
            }

            renderTelegramUser();

            await loadTasksFromServer();
        }

        /*
         * ==========================================
         * ОТРИСОВКА
         * ==========================================
         */

        renderCalendar();
        renderTasks();
        renderAllTasks();
        renderAnalytics();

    } catch (error) {
        console.error(
            "Ошибка запуска приложения:",
            error
        );

        renderCalendar();
        renderTasks();

        const oldMessage =
            document.getElementById(
                "startupErrorMessage"
            );

        if (oldMessage) {
            oldMessage.remove();
        }

        const message =
            document.createElement("div");

        message.id =
            "startupErrorMessage";

        message.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: var(--bg, #ffffff);
            color: var(--text, #111111);
            text-align: center;
            font-size: 16px;
        `;

        message.innerHTML = `
            <div style="max-width: 420px;">

                <div style="
                    font-size: 42px;
                    margin-bottom: 16px;
                ">
                    🔐
                </div>

                <strong style="
                    display: block;
                    margin-bottom: 10px;
                    font-size: 20px;
                ">
                    Не удалось открыть приложение
                </strong>

                <div style="
                    opacity: .7;
                    line-height: 1.5;
                ">
                    ${escapeHTML(
                        error.message ||
                        "Неизвестная ошибка"
                    )}
                </div>

                <button
                    type="button"
                    id="reloadAppButton"
                    style="
                        margin-top: 20px;
                        padding: 12px 20px;
                        border: 0;
                        border-radius: 12px;
                        cursor: pointer;
                    "
                >
                    Повторить
                </button>

            </div>
        `;

        document.body.appendChild(message);

        $("reloadAppButton")
            .addEventListener(
                "click",
                () => {
                    location.reload();
                }
            );
    }
}

init();