/**
 * אפליקציית תזכורת בריאותית לישיבה ממושכת
 * כוללת שני טיימרים עצמאיים (15 דקות ו-40 דקות) הרצים ברקע,
 * התראה ויזואלית וקולית בולטת, והמשך ספירה עד ללחיצה על "קמתי".
 */

const RING_CIRCUMFERENCE = 2 * Math.PI * 96; // r = 96 -> ~603.185

// הגדרות שני הטיימרים העצמאיים (מתחילים במצב המתנה 'idle' עד ללחיצה על "התחל טיימר")
const timers = {
    short: {
        id: 'short',
        title: 'עצירה והתרוממות (15 דקות)',
        defaultSublabel: 'נותרו להתרוממות',
        durationSec: 15 * 60, // 15 דקות
        startTimeMs: null,
        elapsedSecWhenPaused: 0,
        state: 'idle', // 'idle' | 'running' | 'alerting' | 'paused'
        lastSoundPlayedAt: 0
    },
    long: {
        id: 'long',
        title: 'קימה והתאווררות (40 דקות)',
        defaultSublabel: 'נותרו להתאווררות',
        durationSec: 40 * 60, // 40 דקות
        startTimeMs: null,
        elapsedSecWhenPaused: 0,
        state: 'idle', // 'idle' | 'running' | 'alerting' | 'paused'
        lastSoundPlayedAt: 0
    }
};

// ניהול שמע (Web Audio API) ללא תלות בקבצים חיצוניים
let audioCtx = null;
let isSoundEnabled = true;
const SOUND_REPEAT_INTERVAL_MS = 7000; // השמעת תזכורת חוזרת כל 7 שניות כל עוד לא נלחץ "קמתי"

function ensureAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

/**
 * מנגן צליל התראה נעים אך בולט (פעמון כפול/משולש)
 * @param {'short' | 'long'} type סוג הטיימר לצליל מובחן
 */
function playAlertChime(type = 'short') {
    if (!isSoundEnabled) return;
    try {
        ensureAudioContext();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        // תדרים הרמוניים ברורים: טיימר קצר (דו-מי-סול), טיימר ארוך (ארבעה צלילים עשירים)
        const notes = type === 'long'
            ? [523.25, 659.25, 783.99, 1046.50]
            : [587.33, 739.99, 880.00];

        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.14);

            gain.gain.setValueAtTime(0.001, now + idx * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.28, now + idx * 0.14 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.55);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now + idx * 0.14);
            osc.stop(now + idx * 0.14 + 0.6);
        });
    } catch (err) {
        console.warn('לא ניתן להשמיע צליל (דרושה אינטראקציית משתמש ראשונית בדפדפן):', err);
    }
}

/**
 * פורמט שניות לתצוגת MM:SS
 */
function formatTime(totalSeconds) {
    const absSec = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(absSec / 60);
    const seconds = absSec % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * חישוב הזמן שחלף בשניות עבור טיימר נתון
 */
function getElapsedSeconds(timer) {
    if (timer.state === 'idle' || !timer.startTimeMs) {
        return 0;
    }
    if (timer.state === 'paused') {
        return timer.elapsedSecWhenPaused;
    }
    return (Date.now() - timer.startTimeMs) / 1000;
}

/**
 * פעולה: לחיצה על "התחל טיימר" (מפעילה את שני הטיימרים)
 */
function startTimers() {
    ensureAudioContext();
    sitDown('short');
    sitDown('long');
}

/**
 * פעולה: המשתמש לחץ על "קמתי" (עוצר את הטיימר ואת ההתראה)
 */
function standUp(timerKey) {
    ensureAudioContext();
    const timer = timers[timerKey];
    if (!timer || timer.state === 'paused' || timer.state === 'idle') return;

    timer.elapsedSecWhenPaused = getElapsedSeconds(timer);
    timer.state = 'paused';
    updateUI();
}

/**
 * פעולה: המשתמש לחץ על "חזרתי לשבת" (מאפס ומתחיל ספירה מחדש מלמעלה)
 */
function sitDown(timerKey) {
    ensureAudioContext();
    const timer = timers[timerKey];
    if (!timer) return;

    timer.startTimeMs = Date.now();
    timer.elapsedSecWhenPaused = 0;
    timer.state = 'running';
    timer.lastSoundPlayedAt = 0;
    updateUI();
}

/**
 * הדגמה מהירה (מעביר את הטיימר ל-3 שניות לפני סיום כדי לבדוק את ההתראה מיד)
 */
function triggerDemoCountdown(timerKey) {
    ensureAudioContext();
    const timer = timers[timerKey];
    if (!timer) return;

    const demoRemainingSec = 3;
    timer.startTimeMs = Date.now() - (timer.durationSec - demoRemainingSec) * 1000;
    timer.elapsedSecWhenPaused = 0;
    timer.state = 'running';
    timer.lastSoundPlayedAt = 0;
    updateUI();
}

/**
 * שליחת התראת מערכת בדפדפן אם המשתמש אישר והחלון ברקע
 */
function sendBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body,
                dir: 'rtl',
                lang: 'he'
            });
        } catch (_) {
            // התעלמות משגיאות הרשאה בדפדפנים מסוימים
        }
    }
}

/**
 * עדכון מצב הטיימרים והתצוגה על המסך
 */
function tick() {
    const now = Date.now();

    Object.values(timers).forEach((timer) => {
        if (timer.state === 'paused' || timer.state === 'idle') return;

        const elapsedSec = getElapsedSeconds(timer);
        if (elapsedSec >= timer.durationSec) {
            // הגיע הזמן! מעבר למצב התראה תוך המשך ריצת הטיימר
            if (timer.state !== 'alerting') {
                timer.state = 'alerting';
                timer.lastSoundPlayedAt = now;
                playAlertChime(timer.id);
                sendBrowserNotification(
                    `⏰ הגיע הזמן: ${timer.title}`,
                    'הטיימר ממשיך לרוץ עד שתלחץ על כפתור "קמתי".'
                );
            } else if (now - timer.lastSoundPlayedAt >= SOUND_REPEAT_INTERVAL_MS) {
                // צליל תזכורת תקופתי כל עוד המשתמש לא לחץ על "קמתי"
                timer.lastSoundPlayedAt = now;
                playAlertChime(timer.id);
            }
        }
    });

    updateUI();
}

/**
 * עדכון ה-DOM לכל טיימר ולבאנר ההתראה הראשי
 */
function updateUI() {
    const alertingTimers = [];
    let runningCount = 0;
    let pausedCount = 0;
    let idleCount = 0;

    Object.values(timers).forEach((timer) => {
        const key = timer.id;
        const cardEl = document.getElementById(`card-${key}`);
        const statusEl = document.getElementById(`status-${key}`);
        const ringEl = document.getElementById(`ring-${key}`);
        const timeEl = document.getElementById(`time-${key}`);
        const overtimeEl = document.getElementById(`overtime-${key}`);
        const sublabelEl = document.getElementById(`sublabel-${key}`);
        const standBtn = document.getElementById(`stand-${key}-btn`);
        const sitBtn = document.getElementById(`sit-${key}-btn`);

        const elapsedSec = getElapsedSeconds(timer);
        const remainingSec = Math.max(0, timer.durationSec - elapsedSec);
        const overtimeSec = Math.max(0, elapsedSec - timer.durationSec);

        // עדכון טבעת ההתקדמות
        const progressRatio = Math.min(1, elapsedSec / timer.durationSec);
        const dashOffset = RING_CIRCUMFERENCE * progressRatio;
        ringEl.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
        ringEl.style.strokeDashoffset = `${timer.state === 'alerting' ? 0 : dashOffset}`;

        // איפוס מחלקות מצב
        cardEl.classList.remove('is-alerting', 'is-paused');
        statusEl.classList.remove('state-running', 'state-alert', 'state-paused', 'state-idle');
        ringEl.classList.remove('ring-alert', 'ring-paused');

        if (timer.state === 'idle') {
            idleCount++;
            statusEl.textContent = 'ממתין להפעלה';
            statusEl.classList.add('state-idle');

            timeEl.textContent = formatTime(timer.durationSec);
            overtimeEl.classList.add('hidden');
            sublabelEl.textContent = 'לחץ על "התחל טיימר" כדי להתחיל';

            standBtn.disabled = true;
            sitBtn.disabled = true;
        } else if (timer.state === 'running') {
            runningCount++;
            statusEl.textContent = 'בזמן ישיבה';
            statusEl.classList.add('state-running');

            timeEl.textContent = formatTime(Math.ceil(remainingSec));
            overtimeEl.classList.add('hidden');
            sublabelEl.textContent = timer.defaultSublabel;

            standBtn.disabled = false;
            sitBtn.disabled = true;
        } else if (timer.state === 'alerting') {
            alertingTimers.push(timer);
            cardEl.classList.add('is-alerting');
            statusEl.textContent = 'הגיע הזמן לקום!';
            statusEl.classList.add('state-alert');
            ringEl.classList.add('ring-alert');

            // מציג 00:00 ובמקביל מונה חריגה חי שממשיך לרוץ עד הלחיצה על "קמתי"
            timeEl.textContent = '00:00';
            overtimeEl.textContent = `ממשיך לרוץ: +${formatTime(overtimeSec)}`;
            overtimeEl.classList.remove('hidden');
            sublabelEl.textContent = 'לחץ על "קמתי" לעצירת הטיימר';

            standBtn.disabled = false;
            sitBtn.disabled = true;
        } else if (timer.state === 'paused') {
            pausedCount++;
            cardEl.classList.add('is-paused');
            statusEl.textContent = 'בהפסקה (עמידה)';
            statusEl.classList.add('state-paused');
            ringEl.classList.add('ring-paused');

            if (elapsedSec >= timer.durationSec) {
                timeEl.textContent = '00:00';
                overtimeEl.textContent = `נעצר לאחר +${formatTime(overtimeSec)}`;
                overtimeEl.classList.remove('hidden');
            } else {
                timeEl.textContent = formatTime(Math.ceil(remainingSec));
                overtimeEl.classList.add('hidden');
            }
            sublabelEl.textContent = 'הטיימר עצור · לחץ "חזרתי לשבת" לאיפוס';

            standBtn.disabled = true;
            sitBtn.disabled = false;
        }
    });

    // עדכון באנר התראה עליון
    const alertBanner = document.getElementById('alert-banner');
    const alertTitle = document.getElementById('alert-title');
    const alertMessage = document.getElementById('alert-message');

    if (alertingTimers.length > 0) {
        alertBanner.classList.remove('hidden');
        if (alertingTimers.length === 2) {
            alertTitle.textContent = '🔔 הגיע הזמן לקום ולהתאוורר! (שני הטיימרים הגיעו ליעד)';
            alertMessage.textContent = 'הטיימרים ממשיכים לרוץ – לחץ על "קמתי" כדי לעצור אותם.';
        } else {
            const activeAlert = alertingTimers[0];
            alertTitle.textContent = `🔔 הגיע הזמן: ${activeAlert.title}`;
            alertMessage.textContent = 'הטיימר ממשיך לרוץ עד שתלחץ על כפתור "קמתי".';
        }
        // הבהוב כותרת הטאב בדפדפן
        const flashState = Math.floor(Date.now() / 600) % 2 === 0;
        document.title = flashState
            ? '🔔 הגיע הזמן לקום! | תזכורת בריאותית'
            : '⚠️ לחץ על "קמתי" | תזכורת בריאותית';
    } else {
        alertBanner.classList.add('hidden');
        document.title = 'תזכורת בריאותית לישיבה ממושכת';
    }

    // עדכון סרגל שליטה מרכזי
    const masterDot = document.getElementById('master-status-dot');
    const masterText = document.getElementById('master-status-text');
    const startTimerBtn = document.getElementById('start-timer-btn');
    const masterStandBtn = document.getElementById('master-stand-btn');
    const masterSitBtn = document.getElementById('master-sit-btn');

    masterDot.classList.remove('dot-alert', 'dot-paused', 'dot-idle');
    if (idleCount === 2) {
        masterDot.classList.add('dot-idle');
        masterText.textContent = 'ממתין ללחיצה על "התחל טיימר"';
    } else if (alertingTimers.length > 0) {
        masterDot.classList.add('dot-alert');
        masterText.textContent = 'התראה פעילה! הטיימר ממשיך לרוץ עד ללחיצה על "קמתי"';
    } else if (pausedCount === 2) {
        masterDot.classList.add('dot-paused');
        masterText.textContent = 'שני הטיימרים עצורים (בהפסקת עמידה) – לחץ "חזרתי לשבת" כשתתיישב';
    } else if (pausedCount === 1) {
        masterDot.classList.add('dot-paused');
        masterText.textContent = 'טיימר אחד פעיל וטיימר אחד עצור';
    } else {
        masterText.textContent = 'שני הטיימרים פעילים וסופרים לאחור ברקע';
    }

    // כפתור "התחל טיימר" זמין כאשר הטיימרים במצב המתנה התחלתי
    startTimerBtn.disabled = idleCount === 0;
    // כפתור "קמתי" הראשי זמין אם לפחות טיימר אחד רץ או מתריע
    masterStandBtn.disabled = (runningCount + alertingTimers.length) === 0;
    // כפתור "חזרתי לשבת" הראשי זמין לאחר שהטיימר הופעל לפחות פעם אחת
    masterSitBtn.disabled = idleCount === 2;
}

/**
 * יצירת Web Worker מובנה כדי שהבדיקה תרוץ ברקע גם כשהלשונית לא פעילה בדפדפן
 */
function startBackgroundTicker() {
    try {
        const workerCode = `
            setInterval(() => {
                postMessage('tick');
            }, 250);
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = () => tick();
    } catch (_) {
        // גיבוי למקרה ש-Worker חסום בסביבה מקומית
        setInterval(tick, 250);
    }

    // סנכרון מיידי עם חזרה ללשונית
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            tick();
        }
    });
}

// חיבור אירועים לכפתורים בעת טעינת הדף
document.addEventListener('DOMContentLoaded', () => {
    // כפתור "התחל טיימר" חדש
    document.getElementById('start-timer-btn').addEventListener('click', startTimers);

    // כפתורי טיימר קצר (15 דקות)
    document.getElementById('stand-short-btn').addEventListener('click', () => standUp('short'));
    document.getElementById('sit-short-btn').addEventListener('click', () => sitDown('short'));
    document.getElementById('demo-short-btn').addEventListener('click', () => triggerDemoCountdown('short'));

    // כפתורי טיימר ארוך (40 דקות)
    document.getElementById('stand-long-btn').addEventListener('click', () => standUp('long'));
    document.getElementById('sit-long-btn').addEventListener('click', () => sitDown('long'));
    document.getElementById('demo-long-btn').addEventListener('click', () => triggerDemoCountdown('long'));

    // כפתורים ראשיים לשני הטיימרים יחד
    document.getElementById('master-stand-btn').addEventListener('click', () => {
        standUp('short');
        standUp('long');
    });

    document.getElementById('master-sit-btn').addEventListener('click', () => {
        sitDown('short');
        sitDown('long');
    });

    // כפתור "קמתי עכשיו" מתוך באנר ההתראה העליון (עוצר את הטיימרים שמתריעים, או את שניהם אם קמים מהכיסא)
    document.getElementById('alert-stand-btn').addEventListener('click', () => {
        standUp('short');
        standUp('long');
    });

    // כפתור הפעלה/השתקת צליל
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const soundIcon = document.getElementById('sound-icon');
    const soundLabel = document.getElementById('sound-label');

    soundToggleBtn.addEventListener('click', () => {
        ensureAudioContext();
        isSoundEnabled = !isSoundEnabled;
        if (isSoundEnabled) {
            soundIcon.textContent = '🔊';
            soundLabel.textContent = 'צליל פעיל';
            soundToggleBtn.classList.remove('muted');
            playAlertChime('short');
        } else {
            soundIcon.textContent = '🔇';
            soundLabel.textContent = 'מושתק';
            soundToggleBtn.classList.add('muted');
        }
    });

    // כפתור בדיקת צליל
    document.getElementById('test-sound-btn').addEventListener('click', () => {
        ensureAudioContext();
        if (!isSoundEnabled) {
            isSoundEnabled = true;
            soundIcon.textContent = '🔊';
            soundLabel.textContent = 'צליל פעיל';
            soundToggleBtn.classList.remove('muted');
        }
        playAlertChime('long');
    });

    // בקשת הרשאה להתראות דפדפן בעת הלחיצה הראשונה בעמוד
    document.body.addEventListener('click', () => {
        ensureAudioContext();
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }, { once: true });

    // אתחול ראשוני (במצב המתנה עד ללחיצה על "התחל טיימר")
    updateUI();
    startBackgroundTicker();
});
