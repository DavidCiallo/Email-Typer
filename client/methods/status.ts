export function checkUserLive() {
    if (localStorage.getItem("action_time")) {
        const time = Number(localStorage.getItem("action_time"));
        return Date.now() - time < 1000 * 60 * 5;
    } else {
        localStorage.setItem("action_time", String(Date.now()));
        return true;
    }
}

export function manualRecordLive() {
    localStorage.setItem("action_time", String(Date.now()));
}

export function autoRecordLive() {
    window.addEventListener('mousedown', () => localStorage.setItem("action_time", String(Date.now())));
    window.addEventListener('keydown', () => localStorage.setItem("action_time", String(Date.now())));
    window.addEventListener('click', () => localStorage.setItem("action_time", String(Date.now())));
    document.addEventListener('visibilitychange', () => localStorage.setItem("action_time", String(Date.now())));
}