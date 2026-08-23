(function () {
  "use strict";

  const COLLECTIONS = ["empresas", "motoristas", "veiculos", "vistorias"];
  const LOCAL_PREFIX = "vistoria_frota_";
  const FIREBASE_VERSION = "12.17.0";

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isConfigComplete(config) {
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    return required.every((key) => {
      const value = String(config && config[key] ? config[key] : "").trim();
      return value && !value.includes("COLE_") && !value.includes("SUA_");
    });
  }

  class LocalStorageProvider {
    constructor() {
      this.mode = "local";
    }

    readCollection(collectionName) {
      const raw = localStorage.getItem(LOCAL_PREFIX + collectionName);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn(`Dados locais inválidos em ${collectionName}.`, error);
        return [];
      }
    }

    writeCollection(collectionName, records) {
      localStorage.setItem(LOCAL_PREFIX + collectionName, JSON.stringify(records));
    }

    async list(collectionName) {
      return copy(this.readCollection(collectionName));
    }

    async get(collectionName, id) {
      const item = this.readCollection(collectionName).find((record) => record.id === id);
      return item ? copy(item) : null;
    }

    async add(collectionName, data) {
      const records = this.readCollection(collectionName);
      const item = { ...copy(data), id: createId(), createdAt: data.createdAt || nowIso(), updatedAt: nowIso() };
      records.push(item);
      this.writeCollection(collectionName, records);
      return copy(item);
    }

    async update(collectionName, id, data) {
      const records = this.readCollection(collectionName);
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) throw new Error("Registro não encontrado.");
      records[index] = { ...records[index], ...copy(data), id, updatedAt: nowIso() };
      this.writeCollection(collectionName, records);
      return copy(records[index]);
    }

    async remove(collectionName, id) {
      const records = this.readCollection(collectionName);
      const filtered = records.filter((record) => record.id !== id);
      if (filtered.length === records.length) throw new Error("Registro não encontrado.");
      this.writeCollection(collectionName, filtered);
    }
  }

  class FirestoreProvider {
    constructor(db, firestoreApi) {
      this.mode = "firebase";
      this.db = db;
      this.api = firestoreApi;
    }

    async list(collectionName) {
      const snapshot = await this.api.getDocs(this.api.collection(this.db, collectionName));
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    }

    async get(collectionName, id) {
      const reference = this.api.doc(this.db, collectionName, id);
      const snapshot = await this.api.getDoc(reference);
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    }

    async add(collectionName, data) {
      const timestamps = { createdAt: data.createdAt || nowIso(), updatedAt: nowIso() };
      const reference = await this.api.addDoc(this.api.collection(this.db, collectionName), { ...copy(data), ...timestamps });
      return { ...copy(data), ...timestamps, id: reference.id };
    }

    async update(collectionName, id, data) {
      const reference = this.api.doc(this.db, collectionName, id);
      const updated = { ...copy(data), updatedAt: nowIso() };
      await this.api.updateDoc(reference, updated);
      return { ...updated, id };
    }

    async remove(collectionName, id) {
      await this.api.deleteDoc(this.api.doc(this.db, collectionName, id));
    }
  }

  const DataService = {
    provider: null,
    mode: "local",
    startupWarning: "",

    async initialize() {
      const config = window.FIREBASE_CONFIG || {};
      if (!isConfigComplete(config)) {
        this.provider = new LocalStorageProvider();
        this.mode = "local";
        return this.mode;
      }

      try {
        const appUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
        const firestoreUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;
        const firebaseApp = await import(appUrl);
        const firestoreApi = await import(firestoreUrl);
        const firebaseInstance = firebaseApp.initializeApp(config);
        const db = firestoreApi.getFirestore(firebaseInstance);
        const firestoreProvider = new FirestoreProvider(db, firestoreApi);
        // Uma leitura simples confirma conexão e permissões antes de trocar de modo.
        await firestoreProvider.list("empresas");
        this.provider = firestoreProvider;
        this.mode = "firebase";
      } catch (error) {
        console.error("Não foi possível conectar ao Firebase. Usando modo local.", error);
        this.provider = new LocalStorageProvider();
        this.mode = "local";
        this.startupWarning = "Não foi possível conectar ao Firebase. Os dados serão salvos localmente neste navegador.";
      }
      return this.mode;
    },

    validateCollection(collectionName) {
      if (!COLLECTIONS.includes(collectionName)) {
        throw new Error(`Coleção não permitida: ${collectionName}`);
      }
    },

    async list(collectionName) {
      this.validateCollection(collectionName);
      return this.provider.list(collectionName);
    },

    async get(collectionName, id) {
      this.validateCollection(collectionName);
      return this.provider.get(collectionName, id);
    },

    async add(collectionName, data) {
      this.validateCollection(collectionName);
      const saved = await this.provider.add(collectionName, data);
      this.notifyChange(collectionName);
      return saved;
    },

    async update(collectionName, id, data) {
      this.validateCollection(collectionName);
      const saved = await this.provider.update(collectionName, id, data);
      this.notifyChange(collectionName);
      return saved;
    },

    async remove(collectionName, id) {
      this.validateCollection(collectionName);
      await this.provider.remove(collectionName, id);
      this.notifyChange(collectionName);
    },

    notifyChange(collectionName) {
      window.dispatchEvent(new CustomEvent("datachanged", { detail: { collection: collectionName } }));
    }
  };

  window.DataService = DataService;
})();
