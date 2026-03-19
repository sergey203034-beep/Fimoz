(() => {
  const DB_NAME = "ds_proto";
  const DB_VERSION = 5;
  const STORE_USERS = "users";
  const STORE_GUILDS = "guilds";
  const STORE_CHANNELS = "channels";
  const STORE_MESSAGES = "messages";
  const STORE_FRIEND_REQUESTS = "friendRequests";
  const STORE_FRIENDSHIPS = "friendships";
  const STORE_DM_THREADS = "dmThreads";
  const STORE_DM_MESSAGES = "dmMessages";
  const STORE_ATTACHMENTS = "attachments";
  const STORE_GUILD_ROLES = "guildRoles";
  const STORE_GUILD_MEMBERS = "guildMembers";

  function normalize(s) {
    return String(s || "").trim().toLowerCase();
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_USERS)) {
          const store = db.createObjectStore(STORE_USERS, { keyPath: "id" });
          store.createIndex("emailNorm", "emailNorm", { unique: true });
          store.createIndex("usernameNorm", "usernameNorm", { unique: true });
        }

        if (!db.objectStoreNames.contains(STORE_GUILDS)) {
          const store = db.createObjectStore(STORE_GUILDS, { keyPath: "id" });
          store.createIndex("order", "order", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_CHANNELS)) {
          const store = db.createObjectStore(STORE_CHANNELS, { keyPath: "id" });
          store.createIndex("guildId", "guildId", { unique: false });
          store.createIndex("guildId_order", ["guildId", "order"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
          store.createIndex("channelId", "channelId", { unique: false });
          store.createIndex("channelId_createdAt", ["channelId", "createdAt"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_FRIEND_REQUESTS)) {
          const store = db.createObjectStore(STORE_FRIEND_REQUESTS, { keyPath: "id" });
          store.createIndex("toUserId", "toUserId", { unique: false });
          store.createIndex("fromUserId", "fromUserId", { unique: false });
          store.createIndex("toUserId_status", ["toUserId", "status"], { unique: false });
          store.createIndex("fromUserId_status", ["fromUserId", "status"], { unique: false });
          store.createIndex("pair", "pair", { unique: true });
        }

        if (!db.objectStoreNames.contains(STORE_FRIENDSHIPS)) {
          const store = db.createObjectStore(STORE_FRIENDSHIPS, { keyPath: "id" });
          store.createIndex("userId", "users", { unique: false, multiEntry: true });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_DM_THREADS)) {
          const store = db.createObjectStore(STORE_DM_THREADS, { keyPath: "id" }); // id = pairKey(userA,userB)
          store.createIndex("users", "users", { unique: false, multiEntry: true });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_DM_MESSAGES)) {
          const store = db.createObjectStore(STORE_DM_MESSAGES, { keyPath: "id" });
          store.createIndex("threadId", "threadId", { unique: false });
          store.createIndex("threadId_createdAt", ["threadId", "createdAt"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
          const store = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "id" });
          store.createIndex("messageKey", "messageKey", { unique: false }); // "ch:<id>" or "dm:<id>"
          store.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_GUILD_ROLES)) {
          const store = db.createObjectStore(STORE_GUILD_ROLES, { keyPath: "id" }); // `${guildId}:${roleId}`
          store.createIndex("guildId", "guildId", { unique: false });
          store.createIndex("guildId_order", ["guildId", "order"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_GUILD_MEMBERS)) {
          const store = db.createObjectStore(STORE_GUILD_MEMBERS, { keyPath: "id" }); // `${guildId}:${userId}`
          store.createIndex("guildId", "guildId", { unique: false });
          store.createIndex("userId", "userId", { unique: false });
          store.createIndex("guildId_userId", ["guildId", "userId"], { unique: true });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
      tx.onerror = () => reject(tx.error || new Error("Transaction error"));
    });
  }

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToBuf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function pbkdf2Hash(password, saltBytes, iterations, lengthBits = 256) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, [
      "deriveBits",
    ]);
    return crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
      keyMaterial,
      lengthBits,
    );
  }

  async function makePasswordRecord(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 120_000;
    const bits = await pbkdf2Hash(password, salt, iterations, 256);
    return {
      saltB64: bufToB64(salt.buffer),
      hashB64: bufToB64(bits),
      iterations,
      algo: "PBKDF2-SHA256",
    };
  }

  async function verifyPassword(password, passRec) {
    const saltBuf = b64ToBuf(passRec.saltB64);
    const saltBytes = new Uint8Array(saltBuf);
    const bits = await pbkdf2Hash(password, saltBytes, passRec.iterations, 256);
    const hashB64 = bufToB64(bits);
    // Константное сравнение (насколько возможно в JS)
    if (hashB64.length !== passRec.hashB64.length) return false;
    let diff = 0;
    for (let i = 0; i < hashB64.length; i++) diff |= hashB64.charCodeAt(i) ^ passRec.hashB64.charCodeAt(i);
    return diff === 0;
  }

  function makeId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function createUser({ email, username, password }) {
    const emailNorm = normalize(email);
    const usernameNorm = normalize(username);

    const pass = await makePasswordRecord(password);
    const user = {
      id: makeId(),
      email,
      emailNorm,
      username,
      usernameNorm,
      pass,
      createdAt: new Date().toISOString(),
    };

    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);

    // предварительная проверка уникальности
    const emailHit = await reqToPromise(store.index("emailNorm").get(emailNorm));
    if (emailHit) throw new Error("EMAIL_EXISTS");
    const userHit = await reqToPromise(store.index("usernameNorm").get(usernameNorm));
    if (userHit) throw new Error("USERNAME_EXISTS");

    store.add(user);
    await txDone(tx);
    db.close();
    return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
  }

  async function findUserByIdentifier(identifier) {
    const idNorm = normalize(identifier);
    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readonly");
    const store = tx.objectStore(STORE_USERS);

    const byEmail = await reqToPromise(store.index("emailNorm").get(idNorm));
    if (byEmail) {
      db.close();
      return byEmail;
    }

    const byUsername = await reqToPromise(store.index("usernameNorm").get(idNorm));
    db.close();
    return byUsername || null;
  }

  async function login({ identifier, password }) {
    const user = await findUserByIdentifier(identifier);
    if (!user) return { ok: false, code: "NOT_FOUND" };
    const ok = await verifyPassword(password, user.pass);
    if (!ok) return { ok: false, code: "BAD_PASSWORD" };
    return { ok: true, user: { id: user.id, email: user.email, username: user.username } };
  }

  async function getUserById(id) {
    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readonly");
    const store = tx.objectStore(STORE_USERS);
    const user = await reqToPromise(store.get(id));
    db.close();
    return user || null;
  }

  async function updateUserProfile({ id, email, username }) {
    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    const u = await reqToPromise(store.get(id));
    if (!u) {
      db.close();
      throw new Error("NOT_FOUND");
    }

    if (typeof email === "string") {
      const emailNorm = normalize(email);
      const hit = await reqToPromise(store.index("emailNorm").get(emailNorm));
      if (hit && hit.id !== id) {
        db.close();
        throw new Error("EMAIL_EXISTS");
      }
      u.email = email;
      u.emailNorm = emailNorm;
    }

    if (typeof username === "string") {
      const usernameNorm = normalize(username);
      const hit = await reqToPromise(store.index("usernameNorm").get(usernameNorm));
      if (hit && hit.id !== id) {
        db.close();
        throw new Error("USERNAME_EXISTS");
      }
      u.username = username;
      u.usernameNorm = usernameNorm;
    }

    store.put(u);
    await txDone(tx);
    db.close();
    return { id: u.id, email: u.email, username: u.username };
  }

  async function changePassword({ id, oldPassword, newPassword }) {
    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    const u = await reqToPromise(store.get(id));
    if (!u) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    const ok = await verifyPassword(oldPassword, u.pass);
    if (!ok) {
      db.close();
      throw new Error("BAD_PASSWORD");
    }
    u.pass = await makePasswordRecord(newPassword);
    store.put(u);
    await txDone(tx);
    db.close();
    return true;
  }

  async function deleteUser({ id }) {
    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    store.delete(id);
    await txDone(tx);
    db.close();
    return true;
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
    });
  }

  window.UserDB = {
    createUser,
    login,
    findUserByIdentifier,
    getUserById,
    updateUserProfile,
    changePassword,
    deleteUser,
  };

  async function listUsers() {
    const db = await openDb();
    const tx = db.transaction(STORE_USERS, "readonly");
    const store = tx.objectStore(STORE_USERS);
    const list = await cursorAll(store);
    db.close();
    return list;
  }

  function pairKey(a, b) {
    const x = String(a);
    const y = String(b);
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  }

  function makeReqId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `fr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function friendsSendRequest({ fromUserId, toIdentifier }) {
    const toUser = await findUserByIdentifier(toIdentifier);
    if (!toUser) throw new Error("USER_NOT_FOUND");
    if (toUser.id === fromUserId) throw new Error("CANT_ADD_SELF");

    const db = await openDb();
    const tx = db.transaction([STORE_FRIEND_REQUESTS, STORE_FRIENDSHIPS], "readwrite");
    const reqs = tx.objectStore(STORE_FRIEND_REQUESTS);
    const frs = tx.objectStore(STORE_FRIENDSHIPS);

    const p = pairKey(fromUserId, toUser.id);
    const alreadyFriend = await reqToPromise(frs.get(p));
    if (alreadyFriend) {
      db.close();
      throw new Error("ALREADY_FRIENDS");
    }

    const existingReq = await reqToPromise(reqs.index("pair").get(p));
    if (existingReq && existingReq.status === "pending") {
      db.close();
      throw new Error("REQUEST_EXISTS");
    }

    const r = {
      id: makeReqId(),
      fromUserId,
      toUserId: toUser.id,
      status: "pending",
      pair: p,
      createdAt: new Date().toISOString(),
    };
    reqs.put(r);
    await txDone(tx);
    db.close();
    return r;
  }

  async function friendsListIncoming({ userId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_FRIEND_REQUESTS, "readonly");
    const store = tx.objectStore(STORE_FRIEND_REQUESTS);
    const range = IDBKeyRange.only([userId, "pending"]);
    const list = await cursorAll(store.index("toUserId_status"), range);
    db.close();
    return list;
  }

  async function friendsListOutgoing({ userId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_FRIEND_REQUESTS, "readonly");
    const store = tx.objectStore(STORE_FRIEND_REQUESTS);
    const range = IDBKeyRange.only([userId, "pending"]);
    const list = await cursorAll(store.index("fromUserId_status"), range);
    db.close();
    return list;
  }

  async function friendsAccept({ userId, requestId }) {
    const db = await openDb();
    const tx = db.transaction([STORE_FRIEND_REQUESTS, STORE_FRIENDSHIPS], "readwrite");
    const reqs = tx.objectStore(STORE_FRIEND_REQUESTS);
    const frs = tx.objectStore(STORE_FRIENDSHIPS);

    const r = await reqToPromise(reqs.get(requestId));
    if (!r || r.status !== "pending") {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (r.toUserId !== userId) {
      db.close();
      throw new Error("FORBIDDEN");
    }

    const id = pairKey(r.fromUserId, r.toUserId);
    frs.put({ id, users: [r.fromUserId, r.toUserId], createdAt: new Date().toISOString() });
    reqs.delete(requestId);
    await txDone(tx);
    db.close();
    return true;
  }

  async function friendsDeny({ userId, requestId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_FRIEND_REQUESTS, "readwrite");
    const store = tx.objectStore(STORE_FRIEND_REQUESTS);
    const r = await reqToPromise(store.get(requestId));
    if (!r || r.status !== "pending") {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (r.toUserId !== userId) {
      db.close();
      throw new Error("FORBIDDEN");
    }
    store.delete(requestId);
    await txDone(tx);
    db.close();
    return true;
  }

  async function friendsCancel({ userId, requestId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_FRIEND_REQUESTS, "readwrite");
    const store = tx.objectStore(STORE_FRIEND_REQUESTS);
    const r = await reqToPromise(store.get(requestId));
    if (!r || r.status !== "pending") {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (r.fromUserId !== userId) {
      db.close();
      throw new Error("FORBIDDEN");
    }
    store.delete(requestId);
    await txDone(tx);
    db.close();
    return true;
  }

  async function friendsList({ userId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_FRIENDSHIPS, "readonly");
    const store = tx.objectStore(STORE_FRIENDSHIPS);
    const list = await cursorAll(store.index("userId"), IDBKeyRange.only(userId));
    db.close();
    return list;
  }

  async function friendsRemove({ userId, friendUserId }) {
    const id = pairKey(userId, friendUserId);
    const db = await openDb();
    const tx = db.transaction(STORE_FRIENDSHIPS, "readwrite");
    tx.objectStore(STORE_FRIENDSHIPS).delete(id);
    await txDone(tx);
    db.close();
    return true;
  }

  window.FriendsDB = {
    listUsers,
    sendRequest: friendsSendRequest,
    listIncoming: friendsListIncoming,
    listOutgoing: friendsListOutgoing,
    accept: friendsAccept,
    deny: friendsDeny,
    cancel: friendsCancel,
    listFriends: friendsList,
    removeFriend: friendsRemove,
  };

  function makeMsgId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function makeAttId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `a_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function chatEnsureSeed({ username }) {
    const db = await openDb();
    const tx = db.transaction([STORE_GUILDS, STORE_CHANNELS, STORE_MESSAGES], "readwrite");
    const guilds = tx.objectStore(STORE_GUILDS);
    const channels = tx.objectStore(STORE_CHANNELS);
    const messages = tx.objectStore(STORE_MESSAGES);

    const anyGuild = await reqToPromise(guilds.index("order").get(0));
    if (anyGuild) {
      // Миграция seed: если база уже создана, докидываем недостающие каналы (например voice).
      const ensure = async (c) => {
        const hit = await reqToPromise(channels.get(c.id));
        if (!hit) channels.add(c);
      };
      await ensure({ id: "v1", guildId: "g1", name: "Голосовой", type: "voice", order: 2 });
      await ensure({ id: "v2", guildId: "g2", name: "Chill", type: "voice", order: 2 });
      await txDone(tx);
      db.close();
      return;
    }

    const seedGuilds = [
      { id: "g1", name: "Мой сервер", order: 0, iconText: "MS" },
      { id: "g2", name: "Тусовка", order: 1, iconText: "TV" },
    ];

    const seedChannels = [
      { id: "c1", guildId: "g1", name: "общий", type: "text", order: 0 },
      { id: "c2", guildId: "g1", name: "идеи", type: "text", order: 1 },
      { id: "v1", guildId: "g1", name: "Голосовой", type: "voice", order: 2 },
      { id: "c3", guildId: "g2", name: "чат", type: "text", order: 0 },
      { id: "c4", guildId: "g2", name: "мемы", type: "text", order: 1 },
      { id: "v2", guildId: "g2", name: "Chill", type: "voice", order: 2 },
    ];

    const now = Date.now();
    const seedMessages = [
      {
        id: makeMsgId(),
        channelId: "c1",
        author: "system",
        content: "Добро пожаловать в прототип!",
        createdAt: new Date(now - 60_000).toISOString(),
      },
      {
        id: makeMsgId(),
        channelId: "c1",
        author: "system",
        content: "Сообщения сохраняются локально в этом браузере (IndexedDB).",
        createdAt: new Date(now - 30_000).toISOString(),
      },
    ];

    for (const g of seedGuilds) guilds.add(g);
    for (const c of seedChannels) channels.add(c);
    for (const m of seedMessages) messages.add(m);

    await txDone(tx);
    db.close();
  }

  async function chatListGuilds() {
    const db = await openDb();
    const tx = db.transaction(STORE_GUILDS, "readonly");
    const store = tx.objectStore(STORE_GUILDS);
    const list = await cursorAll(store.index("order"));
    db.close();
    return list;
  }

  function makeGuildId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `g_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function makeChannelId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function chatCreateGuild({ name }) {
    const db = await openDb();
    const tx = db.transaction(STORE_GUILDS, "readwrite");
    const store = tx.objectStore(STORE_GUILDS);
    const existing = await cursorAll(store.index("order"));
    const order = existing.length ? Math.max(...existing.map((g) => Number(g.order) || 0)) + 1 : 0;
    const id = makeGuildId();
    const iconText = String(name || "S")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0].toUpperCase())
      .join("") || "S";
    store.add({ id, name, order, iconText });
    await txDone(tx);
    db.close();
    return { id, name, order, iconText };
  }

  async function chatDeleteGuild({ guildId }) {
    const db = await openDb();
    const tx = db.transaction([STORE_GUILDS, STORE_CHANNELS, STORE_MESSAGES], "readwrite");
    tx.objectStore(STORE_GUILDS).delete(guildId);
    const channels = await cursorAll(tx.objectStore(STORE_CHANNELS).index("guildId"), IDBKeyRange.only(guildId));
    for (const c of channels) {
      tx.objectStore(STORE_CHANNELS).delete(c.id);
      const msgs = await cursorAll(tx.objectStore(STORE_MESSAGES).index("channelId"), IDBKeyRange.only(c.id));
      for (const m of msgs) tx.objectStore(STORE_MESSAGES).delete(m.id);
    }
    await txDone(tx);
    db.close();
    return true;
  }

  async function chatCreateChannel({ guildId, name, type }) {
    const db = await openDb();
    const tx = db.transaction(STORE_CHANNELS, "readwrite");
    const store = tx.objectStore(STORE_CHANNELS);
    const existing = await cursorAll(store.index("guildId_order"), IDBKeyRange.bound([guildId, -Infinity], [guildId, Infinity]));
    const order = existing.length ? Math.max(...existing.map((c) => Number(c.order) || 0)) + 1 : 0;
    const id = makeChannelId();
    store.add({ id, guildId, name, type: type === "voice" ? "voice" : "text", order });
    await txDone(tx);
    db.close();
    return { id, guildId, name, type: type === "voice" ? "voice" : "text", order };
  }

  async function chatDeleteChannel({ channelId }) {
    const db = await openDb();
    const tx = db.transaction([STORE_CHANNELS, STORE_MESSAGES], "readwrite");
    tx.objectStore(STORE_CHANNELS).delete(channelId);
    const msgs = await cursorAll(tx.objectStore(STORE_MESSAGES).index("channelId"), IDBKeyRange.only(channelId));
    for (const m of msgs) tx.objectStore(STORE_MESSAGES).delete(m.id);
    await txDone(tx);
    db.close();
    return true;
  }

  async function chatListChannels(guildId) {
    const db = await openDb();
    const tx = db.transaction(STORE_CHANNELS, "readonly");
    const store = tx.objectStore(STORE_CHANNELS);
    const range = IDBKeyRange.bound([guildId, -Infinity], [guildId, Infinity]);
    const list = await cursorAll(store.index("guildId_order"), range);
    db.close();
    return list;
  }

  async function chatListMessages(channelId, limit = 80) {
    const db = await openDb();
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const idx = store.index("channelId_createdAt");
    const range = IDBKeyRange.bound([channelId, ""], [channelId, "\uffff"]);
    const all = await cursorAll(idx, range);
    db.close();
    return all.slice(Math.max(0, all.length - limit));
  }

  async function chatAddMessage({ channelId, author, content, replyTo = null }) {
    const msg = {
      id: makeMsgId(),
      channelId,
      author,
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      replyTo,
      reactions: {}, // emoji -> count (MVP, без списка кто поставил)
    };
    const db = await openDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.objectStore(STORE_MESSAGES).add(msg);
    await txDone(tx);
    db.close();
    return msg;
  }

  async function chatEditMessage({ messageId, author, content }) {
    const db = await openDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const m = await reqToPromise(store.get(messageId));
    if (!m) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (m.author !== author) {
      db.close();
      throw new Error("FORBIDDEN");
    }
    m.content = content;
    m.editedAt = new Date().toISOString();
    store.put(m);
    await txDone(tx);
    db.close();
    return m;
  }

  async function chatDeleteMessage({ messageId, author }) {
    const db = await openDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const m = await reqToPromise(store.get(messageId));
    if (!m) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (m.author !== author) {
      db.close();
      throw new Error("FORBIDDEN");
    }
    m.deletedAt = new Date().toISOString();
    store.put(m);
    await txDone(tx);
    db.close();
    return true;
  }

  async function chatReact({ messageId, emoji }) {
    const db = await openDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const m = await reqToPromise(store.get(messageId));
    if (!m) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    m.reactions = m.reactions && typeof m.reactions === "object" ? m.reactions : {};
    m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
    store.put(m);
    await txDone(tx);
    db.close();
    return m.reactions;
  }

  async function attachmentsAdd({ messageKey, files }) {
    const db = await openDb();
    const tx = db.transaction(STORE_ATTACHMENTS, "readwrite");
    const store = tx.objectStore(STORE_ATTACHMENTS);
    const now = new Date().toISOString();
    const out = [];
    for (const f of files) {
      const rec = {
        id: makeAttId(),
        messageKey,
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size || 0,
        blob: f,
        createdAt: now,
      };
      store.add(rec);
      out.push({ id: rec.id, name: rec.name, type: rec.type, size: rec.size });
    }
    await txDone(tx);
    db.close();
    return out;
  }

  async function attachmentsList({ messageKey }) {
    const db = await openDb();
    const tx = db.transaction(STORE_ATTACHMENTS, "readonly");
    const store = tx.objectStore(STORE_ATTACHMENTS);
    const list = await cursorAll(store.index("messageKey"), IDBKeyRange.only(messageKey));
    db.close();
    return list;
  }

  async function dmEnsureThread({ userA, userB }) {
    const id = pairKey(userA, userB);
    const db = await openDb();
    const tx = db.transaction(STORE_DM_THREADS, "readwrite");
    const store = tx.objectStore(STORE_DM_THREADS);
    const hit = await reqToPromise(store.get(id));
    if (hit) {
      db.close();
      return hit;
    }
    const t = { id, users: [userA, userB], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.add(t);
    await txDone(tx);
    db.close();
    return t;
  }

  async function dmListThreads({ userId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_DM_THREADS, "readonly");
    const store = tx.objectStore(STORE_DM_THREADS);
    const list = await cursorAll(store.index("users"), IDBKeyRange.only(userId));
    // сортируем по updatedAt desc
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    db.close();
    return list;
  }

  async function dmListMessages({ threadId, limit = 120 }) {
    const db = await openDb();
    const tx = db.transaction(STORE_DM_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_DM_MESSAGES);
    const idx = store.index("threadId_createdAt");
    const range = IDBKeyRange.bound([threadId, ""], [threadId, "\uffff"]);
    const all = await cursorAll(idx, range);
    db.close();
    return all.slice(Math.max(0, all.length - limit));
  }

  async function dmAddMessage({ threadId, author, content, replyTo = null }) {
    const msg = {
      id: makeMsgId(),
      threadId,
      author,
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      replyTo,
      reactions: {},
    };
    const db = await openDb();
    const tx = db.transaction([STORE_DM_MESSAGES, STORE_DM_THREADS], "readwrite");
    tx.objectStore(STORE_DM_MESSAGES).add(msg);
    const tStore = tx.objectStore(STORE_DM_THREADS);
    const t = await reqToPromise(tStore.get(threadId));
    if (t) {
      t.updatedAt = new Date().toISOString();
      tStore.put(t);
    }
    await txDone(tx);
    db.close();
    return msg;
  }

  async function dmEditMessage({ messageId, author, content }) {
    const db = await openDb();
    const tx = db.transaction(STORE_DM_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_DM_MESSAGES);
    const m = await reqToPromise(store.get(messageId));
    if (!m) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (m.author !== author) {
      db.close();
      throw new Error("FORBIDDEN");
    }
    m.content = content;
    m.editedAt = new Date().toISOString();
    store.put(m);
    await txDone(tx);
    db.close();
    return m;
  }

  async function dmDeleteMessage({ messageId, author }) {
    const db = await openDb();
    const tx = db.transaction(STORE_DM_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_DM_MESSAGES);
    const m = await reqToPromise(store.get(messageId));
    if (!m) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    if (m.author !== author) {
      db.close();
      throw new Error("FORBIDDEN");
    }
    m.deletedAt = new Date().toISOString();
    store.put(m);
    await txDone(tx);
    db.close();
    return true;
  }

  async function dmReact({ messageId, emoji }) {
    const db = await openDb();
    const tx = db.transaction(STORE_DM_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_DM_MESSAGES);
    const m = await reqToPromise(store.get(messageId));
    if (!m) {
      db.close();
      throw new Error("NOT_FOUND");
    }
    m.reactions = m.reactions && typeof m.reactions === "object" ? m.reactions : {};
    m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
    store.put(m);
    await txDone(tx);
    db.close();
    return m.reactions;
  }

  function cursorAll(source, range) {
    return new Promise((resolve, reject) => {
      const out = [];
      const req = range ? source.openCursor(range) : source.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error || new Error("Cursor failed"));
    });
  }

  window.ChatDB = {
    ensureSeed: chatEnsureSeed,
    listGuilds: chatListGuilds,
    createGuild: chatCreateGuild,
    deleteGuild: chatDeleteGuild,
    listChannels: chatListChannels,
    createChannel: chatCreateChannel,
    deleteChannel: chatDeleteChannel,
    listMessages: chatListMessages,
    addMessage: chatAddMessage,
    editMessage: chatEditMessage,
    deleteMessage: chatDeleteMessage,
    react: chatReact,
  };

  window.DMDB = {
    ensureThread: dmEnsureThread,
    listThreads: dmListThreads,
    listMessages: dmListMessages,
    addMessage: dmAddMessage,
    editMessage: dmEditMessage,
    deleteMessage: dmDeleteMessage,
    react: dmReact,
  };

  window.AttDB = {
    add: attachmentsAdd,
    list: attachmentsList,
  };

  function makeRoleId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function rolesEnsureOwner({ guildId, userId }) {
    const db = await openDb();
    const tx = db.transaction([STORE_GUILD_ROLES, STORE_GUILD_MEMBERS], "readwrite");
    const roles = tx.objectStore(STORE_GUILD_ROLES);
    const members = tx.objectStore(STORE_GUILD_MEMBERS);

    const ownerRoleKey = `${guildId}:owner`;
    const hitRole = await reqToPromise(roles.get(ownerRoleKey));
    if (!hitRole) {
      roles.put({
        id: ownerRoleKey,
        guildId,
        roleId: "owner",
        name: "Owner",
        order: 0,
        perms: { manageGuild: true, manageChannels: true, manageRoles: true },
      });
    }

    const memKey = `${guildId}:${userId}`;
    const hitMem = await reqToPromise(members.get(memKey));
    if (!hitMem) {
      members.put({ id: memKey, guildId, userId, roles: ["owner"], createdAt: new Date().toISOString() });
    } else if (!Array.isArray(hitMem.roles) || !hitMem.roles.includes("owner")) {
      hitMem.roles = Array.isArray(hitMem.roles) ? Array.from(new Set([...hitMem.roles, "owner"])) : ["owner"];
      members.put(hitMem);
    }

    await txDone(tx);
    db.close();
    return true;
  }

  async function rolesList({ guildId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_GUILD_ROLES, "readonly");
    const store = tx.objectStore(STORE_GUILD_ROLES);
    const list = await cursorAll(store.index("guildId_order"), IDBKeyRange.bound([guildId, -Infinity], [guildId, Infinity]));
    db.close();
    return list;
  }

  async function rolesCreate({ guildId, name, perms }) {
    const db = await openDb();
    const tx = db.transaction(STORE_GUILD_ROLES, "readwrite");
    const store = tx.objectStore(STORE_GUILD_ROLES);
    const existing = await cursorAll(store.index("guildId_order"), IDBKeyRange.bound([guildId, -Infinity], [guildId, Infinity]));
    const order = existing.length ? Math.max(...existing.map((r) => Number(r.order) || 0)) + 1 : 1;
    const roleId = makeRoleId();
    const id = `${guildId}:${roleId}`;
    store.add({ id, guildId, roleId, name, order, perms: perms || {} });
    await txDone(tx);
    db.close();
    return { id, guildId, roleId, name, order, perms: perms || {} };
  }

  async function rolesAssignToMe({ guildId, userId, roleId }) {
    const db = await openDb();
    const tx = db.transaction(STORE_GUILD_MEMBERS, "readwrite");
    const store = tx.objectStore(STORE_GUILD_MEMBERS);
    const key = `${guildId}:${userId}`;
    const m = (await reqToPromise(store.get(key))) || { id: key, guildId, userId, roles: [], createdAt: new Date().toISOString() };
    m.roles = Array.isArray(m.roles) ? Array.from(new Set([...m.roles, roleId])) : [roleId];
    store.put(m);
    await txDone(tx);
    db.close();
    return true;
  }

  async function rolesHasPerm({ guildId, userId, perm }) {
    const db = await openDb();
    const tx = db.transaction([STORE_GUILD_MEMBERS, STORE_GUILD_ROLES], "readonly");
    const members = tx.objectStore(STORE_GUILD_MEMBERS);
    const roles = tx.objectStore(STORE_GUILD_ROLES);
    const m = await reqToPromise(members.get(`${guildId}:${userId}`));
    if (!m || !Array.isArray(m.roles) || !m.roles.length) {
      db.close();
      return false;
    }
    for (const roleId of m.roles) {
      const r = await reqToPromise(roles.get(`${guildId}:${roleId}`));
      if (r && r.perms && r.perms[perm]) {
        db.close();
        return true;
      }
    }
    db.close();
    return false;
  }

  window.RoleDB = {
    ensureOwner: rolesEnsureOwner,
    list: rolesList,
    create: rolesCreate,
    assignToMe: rolesAssignToMe,
    hasPerm: rolesHasPerm,
  };
})();

