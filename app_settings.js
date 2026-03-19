(() => {
  const $ = (id) => document.getElementById(id);

  const KEY = "proto_settings";

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadSettings() {
    const s = safeJsonParse(localStorage.getItem(KEY) || "null") || {};
    return {
      theme: s.theme || "dark",
      fontScale: typeof s.fontScale === "number" ? s.fontScale : 1,
      compact: !!s.compact,
      showMembers: typeof s.showMembers === "boolean" ? s.showMembers : true,
      allowDMs: typeof s.allowDMs === "boolean" ? s.allowDMs : true,
      showStatus: typeof s.showStatus === "boolean" ? s.showStatus : true,
      desktopNotifs: !!s.desktopNotifs,
      sounds: typeof s.sounds === "boolean" ? s.sounds : true,
      language: s.language || "ru",
      reducedMotion: !!s.reducedMotion,
      ptt: !!s.ptt,
      micDeviceId: typeof s.micDeviceId === "string" ? s.micDeviceId : "",
      outputVolume: typeof s.outputVolume === "number" ? s.outputVolume : 1,
    };
  }

  function saveSettings(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  const I18N = {
    ru: {
      settings: "Настройки",
      searchSettings: "Поиск настроек",
      close: "Закрыть",
      logout: "Выйти",
      members: "Участники",
      send: "Отправить",
      writeMessage: "Написать сообщение...",
      sec_account: "Мой аккаунт",
      sec_privacy: "Приватность и безопасность",
      sec_notifications: "Уведомления",
      sec_appearance: "Внешний вид",
      sec_accessibility: "Доступность",
      sec_keybinds: "Горячие клавиши",
      sec_language: "Язык",
      sec_about: "О приложении",
      sec_voice: "Голос и видео",
      saved: "Сохранено.",
      themeApplied: "Тема применена.",
    },
    en: {
      settings: "Settings",
      searchSettings: "Search settings",
      close: "Close",
      logout: "Log out",
      members: "Members",
      send: "Send",
      writeMessage: "Message...",
      sec_account: "My Account",
      sec_privacy: "Privacy & Safety",
      sec_notifications: "Notifications",
      sec_appearance: "Appearance",
      sec_accessibility: "Accessibility",
      sec_keybinds: "Keybinds",
      sec_language: "Language",
      sec_about: "About",
      sec_voice: "Voice & Video",
      saved: "Saved.",
      themeApplied: "Theme applied.",
    },
  };

  function t(key) {
    const lang = (ctx.settings && ctx.settings.language) || "ru";
    return (I18N[lang] && I18N[lang][key]) || I18N.ru[key] || key;
  }

  function applyLanguage(lang) {
    const l = lang === "en" ? "en" : "ru";
    document.documentElement.lang = l;

    const settingsTitle = $("settingsTitle");
    if (settingsTitle) settingsTitle.textContent = t("settings");
    const search = $("settingsSearch");
    if (search) search.placeholder = t("searchSettings");

    const bClose = $("settingsClose");
    if (bClose) bClose.textContent = t("close");
    const bLogout = $("settingsLogout");
    if (bLogout) bLogout.textContent = t("logout");

    const membersTitle = $("membersTitle");
    if (membersTitle) membersTitle.textContent = t("members");

    const sendBtn = $("sendBtn");
    if (sendBtn) sendBtn.textContent = t("send");
    const msgInput = $("messageInput");
    if (msgInput) msgInput.placeholder = t("writeMessage");
  }

  function applySettings(s) {
    document.documentElement.style.setProperty("--fontScale", String(Math.min(1.2, Math.max(0.85, s.fontScale))));
    document.documentElement.dataset.theme = s.theme;
    applyLanguage(s.language);
    try {
      window.dispatchEvent(new CustomEvent("proto_settings_changed", { detail: s }));
    } catch {}

    const app = document.querySelector(".app");
    if (app) app.classList.toggle("compact", !!s.compact);

    const members = $("members");
    if (members) members.classList.toggle("members--hidden", !s.showMembers);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toggleEl(on) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toggle";
    b.dataset.on = on ? "true" : "false";
    return b;
  }

  async function resolveCurrentUser(session) {
    if (!window.UserDB) return null;
    if (session.userId) {
      const u = await window.UserDB.getUserById(session.userId);
      if (u) return u;
    }
    // fallback: по username
    const u = await window.UserDB.findUserByIdentifier(session.username);
    return u;
  }

  const modal = () => $("settingsModal");
  const navEl = () => $("settingsNav");
  const contentEl = () => $("settingsContent");
  const crumbEl = () => $("settingsCrumb");
  const searchEl = () => $("settingsSearch");

  function getSections() {
    return [
      { id: "account", label: t("sec_account"), icon: "👤" },
      { id: "privacy", label: t("sec_privacy"), icon: "🛡" },
      { id: "notifications", label: t("sec_notifications"), icon: "🔔" },
      { id: "voice", label: t("sec_voice"), icon: "🎙" },
      { id: "appearance", label: t("sec_appearance"), icon: "🎨" },
      { id: "accessibility", label: t("sec_accessibility"), icon: "🧩" },
      { id: "keybinds", label: t("sec_keybinds"), icon: "⌨" },
      { id: "language", label: t("sec_language"), icon: "🌐" },
      { id: "about", label: t("sec_about"), icon: "ℹ" },
    ];
  }

  let ctx = {
    open: false,
    active: "account",
    session: null,
    user: null,
    settings: loadSettings(),
    onLogout: null,
    onSessionUpdate: null,
  };

  function renderNav(filterText = "") {
    const f = filterText.trim().toLowerCase();
    navEl().innerHTML = "";

    for (const s of getSections()) {
      if (f && !s.label.toLowerCase().includes(f)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "navItem" + (ctx.active === s.id ? " navItem--active" : "");
      b.innerHTML = `
        <span class="navItem__left">
          <span class="navItem__icon">${escapeHtml(s.icon)}</span>
          <span class="navItem__text">${escapeHtml(s.label)}</span>
        </span>
      `;
      b.addEventListener("click", () => setActive(s.id));
      navEl().appendChild(b);
    }
  }

  function setActive(id) {
    ctx.active = id;
    renderNav(searchEl().value || "");
    renderBody();
  }

  function renderBody() {
    const secs = getSections();
    const sec = secs.find((s) => s.id === ctx.active) || secs[0];
    crumbEl().textContent = sec.label;

    if (ctx.active === "account") return renderAccount();
    if (ctx.active === "privacy") return renderPrivacy();
    if (ctx.active === "notifications") return renderNotifications();
    if (ctx.active === "voice") return renderVoice();
    if (ctx.active === "appearance") return renderAppearance();
    if (ctx.active === "accessibility") return renderAccessibility();
    if (ctx.active === "keybinds") return renderKeybinds();
    if (ctx.active === "language") return renderLanguage();
    if (ctx.active === "about") return renderAbout();
    contentEl().innerHTML = "";
  }

  function renderVoice() {
    contentEl().innerHTML = "";
    const s = ctx.settings;
    const c = card(
      t("sec_voice"),
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Push-to-Talk</div>
          <div class="setRow__sub">Удерживай пробел, чтобы говорить (в голосовом канале).</div>
        </div>
        <div class="setRow__right" id="tPtt"></div>
      </div>

      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Микрофон</div>
          <div class="setRow__sub">Выбор устройства ввода (если браузер поддерживает).</div>
        </div>
        <div class="setRow__right">
          <select class="input" id="micSel" style="width: 280px; padding: 10px 12px"></select>
        </div>
      </div>

      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Громкость (вывод)</div>
          <div class="setRow__sub">Громкость удалённых участников.</div>
        </div>
        <div class="setRow__right">
          <input class="range" id="outVol" type="range" min="0" max="1" step="0.01" value="${escapeHtml(
            String(s.outputVolume),
          )}" />
        </div>
      </div>
      <p class="note">MVP: работает только внутри приложения (без сервера).</p>
    `,
    );
    contentEl().appendChild(c);
    const tEl = toggleEl(s.ptt);
    $("tPtt").appendChild(tEl);
    tEl.addEventListener("click", () => {
      s.ptt = !s.ptt;
      tEl.dataset.on = s.ptt ? "true" : "false";
      saveSettings(s);
      applySettings(s);
      toast(t("saved"), "ok");
    });

    const outVol = $("outVol");
    outVol.addEventListener("input", () => {
      s.outputVolume = Number(outVol.value);
      saveSettings(s);
      applySettings(s);
    });

    const micSel = $("micSel");
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        micSel.innerHTML = `<option value="">default</option>`;
        micSel.disabled = true;
        return;
      }
      // enumerateDevices требует разрешение в некоторых браузерах
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {}
      const devs = await navigator.mediaDevices.enumerateDevices();
      const mics = devs.filter((d) => d.kind === "audioinput");
      micSel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "default";
      micSel.appendChild(opt0);
      for (const d of mics) {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || `Microphone (${d.deviceId.slice(0, 6)}…)`;
        micSel.appendChild(o);
      }
      micSel.value = s.micDeviceId || "";
      micSel.addEventListener("change", () => {
        s.micDeviceId = micSel.value;
        saveSettings(s);
        applySettings(s);
        toast(t("saved"), "ok");
      });
    })();
  }

  function card(title, innerHtml) {
    const d = document.createElement("div");
    d.className = "setCard";
    d.innerHTML = `<div class="setTitle">${escapeHtml(title)}</div>${innerHtml}`;
    return d;
  }

  function renderAccount() {
    const u = ctx.user;
    contentEl().innerHTML = "";

    const info = card(
      "Профиль",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Имя пользователя</div>
          <div class="setRow__sub">${escapeHtml(u ? u.username : ctx.session.username)}</div>
        </div>
      </div>
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Почта</div>
          <div class="setRow__sub">${escapeHtml(u && u.email ? u.email : "—")}</div>
        </div>
      </div>
      <p class="note">Изменения сохраняются локально (IndexedDB) в этом браузере.</p>
    `,
    );
    contentEl().appendChild(info);

    const edit = card(
      "Редактирование аккаунта",
      `
      <form class="miniForm" id="profileForm">
        <div class="miniForm__row">
          <input class="input" id="newUsername" placeholder="Новый username" />
          <button class="primaryBtn" style="width:auto" type="submit">Сохранить</button>
        </div>
        <div class="miniForm__row">
          <input class="input" id="newEmail" placeholder="Новая почта" />
          <button class="ghostBtn" style="width:auto" id="saveEmail" type="button">Сохранить почту</button>
        </div>
        <p class="note">Username должен быть уникальным. Почта тоже.</p>
      </form>
    `,
    );
    contentEl().appendChild(edit);

    const pass = card(
      "Смена пароля",
      `
      <form class="miniForm" id="passwordForm">
        <div class="miniForm__row">
          <input class="input" id="oldPw" type="password" placeholder="Старый пароль" />
        </div>
        <div class="miniForm__row">
          <input class="input" id="newPw" type="password" placeholder="Новый пароль (мин. 8)" />
          <button class="primaryBtn" style="width:auto" type="submit">Сменить</button>
        </div>
      </form>
    `,
    );
    contentEl().appendChild(pass);

    const danger = card(
      "Опасная зона",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Удалить аккаунт</div>
          <div class="setRow__sub">Удалит пользователя из локальной базы.</div>
        </div>
        <div class="setRow__right">
          <button class="dangerBtn" id="deleteAccount" type="button">Удалить</button>
        </div>
      </div>
    `,
    );
    contentEl().appendChild(danger);

    wireAccountHandlers();
  }

  function errToText(err) {
    const m = err && err.message;
    if (m === "EMAIL_EXISTS") return "Такая почта уже зарегистрирована.";
    if (m === "USERNAME_EXISTS") return "Такой username уже занят.";
    if (m === "BAD_PASSWORD") return "Неверный старый пароль.";
    if (m === "NOT_FOUND") return "Пользователь не найден.";
    return "Не удалось выполнить действие.";
  }

  function wireAccountHandlers() {
    const profileForm = $("profileForm");
    const saveEmailBtn = $("saveEmail");
    const deleteBtn = $("deleteAccount");
    const passwordForm = $("passwordForm");

    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = $("newUsername").value.trim();
      if (!val) return;
      if (!ctx.user || !ctx.user.id) return;
      try {
        const res = await window.UserDB.updateUserProfile({ id: ctx.user.id, username: val });
        ctx.user.username = res.username;
        ctx.session.username = res.username;
        sessionStorage.setItem("proto_session", JSON.stringify(ctx.session));
        localStorage.setItem("proto_user", JSON.stringify({ email: res.email, username: res.username }));
        if (typeof ctx.onSessionUpdate === "function") ctx.onSessionUpdate({ username: res.username });
        toast("Username обновлён.", "ok");
        renderBody();
      } catch (err) {
        toast(errToText(err), "danger");
      }
    });

    saveEmailBtn.addEventListener("click", async () => {
      const val = $("newEmail").value.trim();
      if (!val) return;
      if (!ctx.user || !ctx.user.id) return;
      try {
        const res = await window.UserDB.updateUserProfile({ id: ctx.user.id, email: val });
        ctx.user.email = res.email;
        localStorage.setItem("proto_user", JSON.stringify({ email: res.email, username: res.username }));
        toast("Почта обновлена.", "ok");
        renderBody();
      } catch (err) {
        toast(errToText(err), "danger");
      }
    });

    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const oldPw = $("oldPw").value;
      const newPw = $("newPw").value;
      if (!oldPw || !newPw) return;
      if (newPw.length < 8) return toast("Новый пароль слишком короткий.", "danger");
      if (!ctx.user || !ctx.user.id) return;
      try {
        await window.UserDB.changePassword({ id: ctx.user.id, oldPassword: oldPw, newPassword: newPw });
        toast("Пароль изменён.", "ok");
        passwordForm.reset();
      } catch (err) {
        toast(errToText(err), "danger");
      }
    });

    deleteBtn.addEventListener("click", async () => {
      if (!ctx.user || !ctx.user.id) return;
      const ok = window.confirm("Точно удалить аккаунт? Это действие нельзя отменить (локально).");
      if (!ok) return;
      try {
        await window.UserDB.deleteUser({ id: ctx.user.id });
        sessionStorage.removeItem("proto_session");
        toast("Аккаунт удалён. Возвращаю на вход.", "ok");
        window.setTimeout(() => {
          if (typeof ctx.onLogout === "function") ctx.onLogout();
          else window.location.href = "./login.html";
        }, 500);
      } catch (err) {
        toast(errToText(err), "danger");
      }
    });
  }

  function renderPrivacy() {
    contentEl().innerHTML = "";
    const s = ctx.settings;
    const c = card(
      "Приватность и безопасность",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Разрешать личные сообщения</div>
          <div class="setRow__sub">MVP: переключатель сохраняется локально.</div>
        </div>
        <div class="setRow__right" id="tAllowDMs"></div>
      </div>
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Показывать статус активности</div>
          <div class="setRow__sub">Скрывает “online” в панели профиля.</div>
        </div>
        <div class="setRow__right" id="tStatus"></div>
      </div>
    `,
    );
    contentEl().appendChild(c);

    const t1 = toggleEl(s.allowDMs);
    const t2 = toggleEl(s.showStatus);
    $("tAllowDMs").appendChild(t1);
    $("tStatus").appendChild(t2);

    t1.addEventListener("click", () => {
      s.allowDMs = !s.allowDMs;
      t1.dataset.on = s.allowDMs ? "true" : "false";
      saveSettings(s);
    });

    t2.addEventListener("click", () => {
      s.showStatus = !s.showStatus;
      t2.dataset.on = s.showStatus ? "true" : "false";
      saveSettings(s);
      const sub = $("meSub");
      if (sub) sub.textContent = s.showStatus ? "online" : "hidden";
    });
  }

  function renderNotifications() {
    contentEl().innerHTML = "";
    const s = ctx.settings;
    const c = card(
      "Уведомления",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Звуки</div>
          <div class="setRow__sub">MVP: включает/выключает звуки (сейчас заглушка).</div>
        </div>
        <div class="setRow__right" id="tSounds"></div>
      </div>
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Desktop уведомления</div>
          <div class="setRow__sub">Запрос разрешения у браузера.</div>
        </div>
        <div class="setRow__right" id="tDesk"></div>
      </div>
      <p class="note">Пока без сервера уведомления — только настройка поведения UI.</p>
    `,
    );
    contentEl().appendChild(c);

    const t1 = toggleEl(s.sounds);
    const t2 = toggleEl(s.desktopNotifs);
    $("tSounds").appendChild(t1);
    $("tDesk").appendChild(t2);

    t1.addEventListener("click", () => {
      s.sounds = !s.sounds;
      t1.dataset.on = s.sounds ? "true" : "false";
      saveSettings(s);
    });

    t2.addEventListener("click", async () => {
      s.desktopNotifs = !s.desktopNotifs;
      if (s.desktopNotifs && "Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") s.desktopNotifs = false;
      } else if (!("Notification" in window)) {
        s.desktopNotifs = false;
      }
      t2.dataset.on = s.desktopNotifs ? "true" : "false";
      saveSettings(s);
    });
  }

  function renderAppearance() {
    contentEl().innerHTML = "";
    const s = ctx.settings;
    const c = card(
      "Внешний вид",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Тема</div>
          <div class="setRow__sub">MVP: dark/light (пока базово).</div>
        </div>
        <div class="setRow__right">
          <select class="input" id="themeSel" style="width: 220px; padding: 10px 12px">
            <option value="dark">Тёмная</option>
            <option value="light">Светлая</option>
          </select>
        </div>
      </div>

      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Размер шрифта</div>
          <div class="setRow__sub">Увеличивает/уменьшает UI.</div>
        </div>
        <div class="setRow__right">
          <input class="range" id="fontRange" type="range" min="0.85" max="1.2" step="0.01" value="${escapeHtml(
            String(s.fontScale),
          )}" />
        </div>
      </div>

      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Компактный режим сообщений</div>
          <div class="setRow__sub">Уменьшает вертикальные отступы в чате.</div>
        </div>
        <div class="setRow__right" id="tCompact"></div>
      </div>

      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Показывать панель участников</div>
          <div class="setRow__sub">По умолчанию справа.</div>
        </div>
        <div class="setRow__right" id="tMembers"></div>
      </div>
    `,
    );
    contentEl().appendChild(c);

    const themeSel = $("themeSel");
    themeSel.value = s.theme;
    themeSel.addEventListener("change", () => {
      s.theme = themeSel.value;
      saveSettings(s);
      applySettings(s);
      toast(t("themeApplied"), "ok");
    });

    const fontRange = $("fontRange");
    fontRange.addEventListener("input", () => {
      s.fontScale = Number(fontRange.value);
      saveSettings(s);
      applySettings(s);
    });

    const t1 = toggleEl(s.compact);
    const t2 = toggleEl(s.showMembers);
    $("tCompact").appendChild(t1);
    $("tMembers").appendChild(t2);

    t1.addEventListener("click", () => {
      s.compact = !s.compact;
      t1.dataset.on = s.compact ? "true" : "false";
      saveSettings(s);
      applySettings(s);
    });

    t2.addEventListener("click", () => {
      s.showMembers = !s.showMembers;
      t2.dataset.on = s.showMembers ? "true" : "false";
      saveSettings(s);
      applySettings(s);
    });
  }

  function renderAccessibility() {
    contentEl().innerHTML = "";
    const s = ctx.settings;
    const c = card(
      "Доступность",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Уменьшить анимации</div>
          <div class="setRow__sub">MVP: сохраняется локально.</div>
        </div>
        <div class="setRow__right" id="tMotion"></div>
      </div>
    `,
    );
    contentEl().appendChild(c);

    const t = toggleEl(s.reducedMotion);
    $("tMotion").appendChild(t);
    t.addEventListener("click", () => {
      s.reducedMotion = !s.reducedMotion;
      t.dataset.on = s.reducedMotion ? "true" : "false";
      saveSettings(s);
      document.documentElement.style.scrollBehavior = s.reducedMotion ? "auto" : "";
    });
  }

  function renderKeybinds() {
    contentEl().innerHTML = "";
    const c = card(
      "Горячие клавиши",
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Enter</div>
          <div class="setRow__sub">Отправить сообщение</div>
        </div>
      </div>
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Esc</div>
          <div class="setRow__sub">Закрыть настройки</div>
        </div>
      </div>
      <p class="note">Редактор биндов добавим следующим шагом.</p>
    `,
    );
    contentEl().appendChild(c);
  }

  function renderLanguage() {
    contentEl().innerHTML = "";
    const s = ctx.settings;
    const c = card(
      t("sec_language"),
      `
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">${escapeHtml(t("sec_language"))}</div>
          <div class="setRow__sub">MVP: меняет базовые тексты UI.</div>
        </div>
        <div class="setRow__right">
          <select class="input" id="langSel" style="width: 220px; padding: 10px 12px">
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    `,
    );
    contentEl().appendChild(c);
    const sel = $("langSel");
    sel.value = s.language;
    sel.addEventListener("change", () => {
      s.language = sel.value;
      saveSettings(s);
      applySettings(s);
      renderNav(searchEl().value || "");
      renderBody();
      toast(t("saved"), "ok");
    });
  }

  function renderAbout() {
    contentEl().innerHTML = "";
    const c = card(
      "О приложении",
      `
      <p class="note">
        Это локальный прототип аналога Discord: аккаунты и чаты хранятся в браузере (IndexedDB).
      </p>
      <div class="setRow">
        <div class="setRow__stack">
          <div class="setRow__label">Версия</div>
          <div class="setRow__sub">0.1 (prototype)</div>
        </div>
      </div>
    `,
    );
    contentEl().appendChild(c);
  }

  function toast(text, kind) {
    const t = $("toast");
    if (!t) return;
    t.dataset.kind = kind || "ok";
    t.textContent = text;
    t.style.display = "block";
    window.clearTimeout(t.__t);
    t.__t = window.setTimeout(() => {
      t.style.display = "none";
    }, 2400);
  }

  function open() {
    if (ctx.open) return;
    ctx.open = true;
    modal().classList.remove("modal--hidden");
    applySettings(ctx.settings);
    setActive(ctx.active);
    window.addEventListener("keydown", onKey);
  }

  function close() {
    if (!ctx.open) return;
    ctx.open = false;
    modal().classList.add("modal--hidden");
    window.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  async function init({ session, onLogout, onSessionUpdate }) {
    ctx.session = { ...session };
    ctx.onLogout = onLogout;
    ctx.onSessionUpdate = onSessionUpdate;
    ctx.settings = loadSettings();
    applySettings(ctx.settings);
    ctx.user = await resolveCurrentUser(ctx.session);

    // wire base handlers once
    $("settingsBackdrop").addEventListener("click", close);
    $("settingsClose").addEventListener("click", close);
    $("settingsX").addEventListener("click", close);
    $("settingsLogout").addEventListener("click", () => {
      if (typeof ctx.onLogout === "function") ctx.onLogout();
      else window.location.href = "./login.html";
    });

    searchEl().addEventListener("input", () => {
      renderNav(searchEl().value || "");
    });

    renderNav("");
    renderBody();
  }

  window.SettingsUI = {
    init,
    open,
    close,
    applySettings: () => applySettings(loadSettings()),
  };
})();

